import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { PrismaClient } from "@flowstate/db";
import type { BusinessSettingsInput } from "./business-settings";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "versioned business settings in PostgreSQL",
  () => {
    let db: PrismaClient;
    let api: typeof import("./business-settings");
    let workspaceId: string, userId: string, coachId: string;
    const input: BusinessSettingsInput = {
      name: "Fictional virtual coaching",
      businessType: "Coaching",
      contactEmail: "coach@example.test",
      contactPhone: "",
      currency: "cad",
      locale: "en-CA",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: "",
    };
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      db = (await import("@flowstate/db")).prisma;
      api = await import("./business-settings");
    });
    beforeEach(async () => {
      const prefix = `business-settings-${randomUUID()}`;
      userId = `${prefix}-owner`;
      coachId = `${prefix}-coach`;
      await db.user.createMany({
        data: [
          { id: userId, email: `${userId}@example.test` },
          { id: coachId, email: `${coachId}@example.test` },
        ],
      });
      const workspace = await db.workspace.create({
        data: {
          name: "Before",
          location: { create: { name: "Before", timezone: "UTC" } },
          settings: { create: {} },
          workspaceUsers: {
            create: [
              { userId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
        },
      });
      workspaceId = workspace.id;
    });
    afterEach(async () => {
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: [userId, coachId] } } });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    const actor = () => ({ workspaceId, userId });
    const save = (version = 0, value = input) =>
      api.saveBusinessSettings(actor(), version, value);
  it("updates only an authorized owner's business and records one attributable decision", async () => {
      await expect(
        api.getBusinessSettings({ workspaceId, userId: coachId }),
      ).rejects.toThrow("Only the owner");
      await expect(
        api.saveBusinessSettings({ workspaceId, userId: coachId }, 0, input),
      ).rejects.toThrow("Only the owner");
      await expect(
        api.saveBusinessSettings({ workspaceId: "foreign", userId }, 0, input),
      ).rejects.toThrow("Only the owner");
      expect(
        await db.workspaceDataEvent.count({ where: { workspaceId } }),
      ).toBe(0);
      await save();
      const data = await api.getBusinessSettings(actor());
      expect(data.workspace).toMatchObject({
        name: input.name,
        businessType: "Coaching",
        settings: {
          identityVersion: 1,
          currency: "cad",
          locale: "en-CA",
          contactEmail: input.contactEmail,
        },
      });
      expect(data.workspace.location).toMatchObject({
        timezone: "UTC",
        addressLine1: null,
        countryCode: null,
      });
      expect(
        await db.workspaceDataEvent.findFirst({ where: { workspaceId } }),
      ).toMatchObject({
        kind: "BUSINESS_SETTINGS_CHANGED",
        actorUserId: userId,
        metadata: {
          version: 1,
          before: { name: "Before" },
          after: { name: input.name },
        },
      });
    });
    it("rejects stale and competing saves without lost updates or duplicate audit records", async () => {
      const results = await Promise.allSettled([
        save(),
        save(0, { ...input, name: "Competing name" }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (
          await db.workspaceSetting.findUniqueOrThrow({
            where: { workspaceId },
          })
        ).identityVersion,
      ).toBe(1);
      expect(
        await db.workspaceDataEvent.count({ where: { workspaceId } }),
      ).toBe(1);
      await expect(save()).rejects.toThrow("settings changed");
    });
    it("locks currency after an in-flight financial operation while allowing contact updates", async () => {
      await save();
      const operation = await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "fictional-reviewed-request",
          kind: "CHECKOUT",
          providerIdempotencyKey: randomUUID(),
          amountCents: 10000,
          currency: "cad",
          payload: {},
        },
      });
      await expect(
        save(1, { ...input, currency: "usd", name: "Must not persist" }),
      ).rejects.toThrow("Currency is locked");
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .name,
      ).toBe(input.name);
      expect(
        await db.workspaceDataEvent.count({ where: { workspaceId } }),
      ).toBe(1);
      await save(1, { ...input, contactPhone: "+1 555 0100", locale: "en-US" });
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).currency,
      ).toBe("cad");
      expect(
        (
          await db.workspaceSetting.findUniqueOrThrow({
            where: { workspaceId },
          })
        ).contactPhone,
      ).toBe("+1 555 0100");
    });
    it("initializes an older unconfigured business only with its recorded financial currency", async () => {
      await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "fictional-reviewed-request",
          kind: "CHECKOUT",
          providerIdempotencyKey: randomUUID(),
          currency: "cad",
          payload: {},
        },
      });
      await expect(save(0, { ...input, currency: "usd" })).rejects.toThrow(
        "Currency is locked",
      );
      await save();
      expect(
        (
          await db.workspaceSetting.findUniqueOrThrow({
            where: { workspaceId },
          })
        ).currency,
      ).toBe("cad");
    });
    it("rejects invalid regional data before changing any stored identity", async () => {
      await expect(
        save(0, { ...input, locale: "not_a_locale" }),
      ).rejects.toThrow("supported locale");
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .name,
      ).toBe("Before");
      expect(
        await db.workspaceDataEvent.count({ where: { workspaceId } }),
      ).toBe(0);
    });
  },
);
