import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  prisma as db,
  getClassReminderSettings,
  lockClassSchedule,
  updateClassReminderSettings,
} from "@flowstate/db";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../../../packages/db/src/retention-inventory.js";
import { saveBusinessSettings } from "./business-settings";
import {
  createOwnerWorkspaceOnboarding,
  type OwnerOnboardingInput,
} from "./onboarding";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (
    process.env.DATABASE_URL !== databaseUrl ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !/^\/[A-Za-z0-9_]+_test$/.test(target.pathname) ||
    target.searchParams.has("host") ||
    target.searchParams.has("hostaddr")
  )
    throw new Error(
      "New-gym reminder tests require identical loopback DATABASE_URL and TEST_DATABASE_URL for a disposable *_test database.",
    );
}

(databaseUrl ? describe : describe.skip)(
  "persisted new-gym reminder defaults and existing-workspace preservation",
  () => {
    const workspaceIds: string[] = [], userIds: string[] = [];
    let userId: string;

    beforeEach(async () => {
      const user = await db.user.create({
        data: {
          email: `reminder-default-${randomUUID()}@example.test`,
          fullName: "Fictional reminder default owner",
        },
      });
      userId = user.id;
      userIds.push(user.id);
    });
    afterEach(async () => {
      // Recover this case's committed workspace even if its first assertion failed.
      const memberships = await db.workspaceUser.findMany({
        where: { userId: { in: userIds } },
        select: { workspaceId: true },
      });
      for (const row of memberships)
        if (!workspaceIds.includes(row.workspaceId)) workspaceIds.push(row.workspaceId);
      while (workspaceIds.length) {
        const workspaceId = workspaceIds[0]!;
        await db.$transaction(async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          for (const prefix of ["family-access", "financial", "retention"])
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${workspaceId}`}))::text`;
          const inventory = await inspectRetentionInventory(tx, workspaceId);
          await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
        }, { isolationLevel: "Serializable", timeout: 120000 });
        workspaceIds.shift(); // Never drain a failed purge.
      }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.splice(0, userIds.length);
    });
    afterAll(async () => { await db.$disconnect(); });

    const input = (kind: "MIGRATION" | "NEW_BUSINESS"): OwnerOnboardingInput => ({
      userId,
      workspaceName: "Fictional reminder default gym",
      kind,
      timezone: "UTC",
      serviceMode: "MARTIAL_ARTS",
      currency: "cad",
      locale: "en-CA",
      contactEmail: "fictional-owner@example.test",
    });
    const actor = (workspaceId: string) => ({ workspaceId, userId });
    const settings = (workspaceId: string) => db.workspaceSetting.findUniqueOrThrow({
      where: { workspaceId },
      select: { classReminderLeadMinutes: true, classReminderVersion: true },
    });
    const reminderEvents = (workspaceId: string) => db.workspaceDataEvent.findMany({
      where: { workspaceId, kind: "CLASS_REMINDER_SETTINGS_CHANGED" },
      select: { id: true, actorUserId: true, metadata: true },
      orderBy: { id: "asc" },
    });
    async function reenter(workspaceId: string, kind: "MIGRATION" | "NEW_BUSINESS") {
      await expect(createOwnerWorkspaceOnboarding({ input: input(kind), db: db as never }))
        .resolves.toEqual({ status: "redirect", location: "/dashboard", workspaceId });
      expect(await db.workspaceUser.count({ where: { userId } })).toBe(1);
    }

    it.each(["MIGRATION", "NEW_BUSINESS"] as const)(
      "persists 1440/version 0 for fresh %s onboarding, then keeps owner custom and Off choices on reentry",
      async (kind) => {
        const result = await createOwnerWorkspaceOnboarding({ input: input(kind), db: db as never });
        expect(result.status).toBe("created");
        if (result.status !== "created") throw new Error("Expected an isolated fresh workspace.");
        const workspaceId = result.workspaceId;
        workspaceIds.push(workspaceId);
        expect(await settings(workspaceId)).toEqual({
          classReminderLeadMinutes: 1440,
          classReminderVersion: 0,
        });
        expect(await getClassReminderSettings(actor(workspaceId), db)).toEqual({ version: 0, leadMinutes: 1440 });
        expect(await reminderEvents(workspaceId)).toEqual([]);
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(0);

        await expect(updateClassReminderSettings({
          actor: actor(workspaceId), expectedVersion: 0, leadMinutes: 90,
          reason: "Owner chooses a shorter advance interval", db,
        })).resolves.toEqual({ version: 1, leadMinutes: 90 });
        await reenter(workspaceId, kind);
        expect(await settings(workspaceId)).toEqual({ classReminderLeadMinutes: 90, classReminderVersion: 1 });
        await expect(updateClassReminderSettings({
          actor: actor(workspaceId), expectedVersion: 1, leadMinutes: "OFF",
          reason: "Owner explicitly turns reminders off", db,
        })).resolves.toEqual({ version: 2, leadMinutes: null });
        await reenter(workspaceId, kind);
        expect(await getClassReminderSettings(actor(workspaceId), db)).toEqual({ version: 2, leadMinutes: null });
        const events = await reminderEvents(workspaceId);
        expect(events).toHaveLength(2);
        expect(events.every((event) => event.actorUserId === userId)).toBe(true);
        expect(events.map((event) => event.metadata)).toEqual(expect.arrayContaining([
          expect.objectContaining({ version: 1, previousLeadMinutes: 1440, leadMinutes: 90 }),
          expect.objectContaining({ version: 2, previousLeadMinutes: 90, leadMinutes: null }),
        ]));
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(0);
      },
    );

    it.each(["missing", "legacy-null", "custom", "same-as-default", "off"] as const)(
      "preserves existing %s configuration through onboarding reentry and business-settings create/update",
      async (cohort) => {
        const workspace = await db.workspace.create({
          data: {
            name: "Fictional existing gym",
            status: "ACTIVE",
            location: { create: { name: "Fictional existing gym", timezone: "UTC" } },
            workspaceUsers: { create: { userId, role: "OWNER" } },
          },
        });
        const workspaceId = workspace.id;
        workspaceIds.push(workspaceId);
        if (cohort !== "missing")
          await db.workspaceSetting.create({ data: { workspaceId } });
        if (["custom", "same-as-default", "off"].includes(cohort))
          await updateClassReminderSettings({
            actor: actor(workspaceId), expectedVersion: 0,
            leadMinutes: cohort === "same-as-default" ? 1440 : 90,
            reason: "Existing owner-selected interval", db,
          });
        if (cohort === "off")
          await updateClassReminderSettings({
            actor: actor(workspaceId), expectedVersion: 1, leadMinutes: "OFF",
            reason: "Existing explicit Off choice", db,
          });
        const expected = cohort === "custom" ? { version: 1, leadMinutes: 90 }
          : cohort === "same-as-default" ? { version: 1, leadMinutes: 1440 }
          : cohort === "off" ? { version: 2, leadMinutes: null }
          : { version: 0, leadMinutes: null };
        const originalEvents = await reminderEvents(workspaceId);
        expect(await getClassReminderSettings(actor(workspaceId), db)).toEqual(expected);
        if (cohort === "missing")
          expect(await db.workspaceSetting.findUnique({ where: { workspaceId } })).toBeNull();
        await reenter(workspaceId, "NEW_BUSINESS");
        await reenter(workspaceId, "MIGRATION");
        if (cohort === "missing")
          expect(await db.workspaceSetting.findUnique({ where: { workspaceId } })).toBeNull();

        // Exercise the real repair upsert, then its update branch. Neither is a new gym.
        for (const version of [0, 1]) {
          await expect(saveBusinessSettings(actor(workspaceId), version, {
            name: "Fictional edited gym", businessType: "Martial arts",
            contactEmail: "fictional-owner@example.test", contactPhone: "",
            currency: "cad", locale: "en-CA", addressLine1: "", addressLine2: "",
            city: "", region: "", postalCode: "", countryCode: "",
          })).resolves.toEqual({ version: version + 1 });
          expect(await settings(workspaceId)).toEqual({
            classReminderLeadMinutes: expected.leadMinutes,
            classReminderVersion: expected.version,
          });
          expect(await getClassReminderSettings(actor(workspaceId), db)).toEqual(expected);
        }
        await reenter(workspaceId, "NEW_BUSINESS");
        expect(await reminderEvents(workspaceId)).toEqual(originalEvents);
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(0);
      },
    );
  },
);
