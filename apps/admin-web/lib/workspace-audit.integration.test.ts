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
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("safe owner audit log in PostgreSQL", () => {
  let db: PrismaClient, api: typeof import("./workspace-audit");
  let workspaceId: string, otherId: string, ownerId: string, coachId: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@flowstate/db")).prisma;
    api = await import("./workspace-audit");
  });
  beforeEach(async () => {
    const key = randomUUID();
    ownerId = `${key}-owner`;
    coachId = `${key}-coach`;
    await db.user.createMany({
      data: [
        {
          id: ownerId,
          email: `${ownerId}@example.test`,
          fullName: "Audit owner",
        },
        {
          id: coachId,
          email: `${coachId}@example.test`,
          fullName: "Audit coach",
        },
      ],
    });
    workspaceId = (
      await db.workspace.create({
        data: {
          name: "Fictional audit business",
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
        },
      })
    ).id;
    otherId = (await db.workspace.create({ data: { name: "Other business" } }))
      .id;
  });
  afterEach(async () => {
    for (const id of [workspaceId, otherId])
      await db.$transaction(
        async (tx) => {
          const inventory = await inspectRetentionInventory(tx, id);
          await deleteReviewedWorkspaceRecords(tx, id, inventory.fingerprint);
        },
        { timeout: 120000 },
      );
    await db.user.deleteMany({ where: { id: { in: [ownerId, coachId] } } });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const actor = () => ({ workspaceId, actorUserId: ownerId, db });
  it("attributes known before/after changes without exposing arbitrary sensitive event metadata", async () => {
    await db.workspaceDataEvent.create({
      data: {
        workspaceId,
        actorUserId: ownerId,
        kind: "STAFF_ACCESS_CHANGED",
        metadata: {
          targetUserId: coachId,
          reason: "Owner reviewed access",
          token: "AUDIT_BEARER_SENTINEL",
          privateNote: "AUDIT_PRIVATE_SENTINEL",
          before: {
            role: "COACH",
            isActive: true,
            passwordHash: "AUDIT_PASSWORD_SENTINEL",
          },
          after: { role: "COACH", isActive: false },
        },
      },
    });
    await db.workspaceDataEvent.create({
      data: {
        workspaceId,
        actorUserId: "former-account",
        kind: "RESTRICTED_RECORD_EVENT",
        metadata: {
          reason: "AUDIT_PRIVATE_SENTINEL",
          before: { email: "AUDIT_PRIVATE_SENTINEL" },
          after: { fullName: "AUDIT_PRIVATE_SENTINEL" },
        },
      },
    });
    const log = await api.getWorkspaceAudit(actor());
    const owned = log.events.find((r) => r.kind === "STAFF_ACCESS_CHANGED")!;
    expect(owned).toMatchObject({
      actorName: "Audit owner",
      context: { targetUserId: coachId },
      before: { role: "COACH", isActive: true },
      after: { role: "COACH", isActive: false },
      reason: "Owner reviewed access",
    });
    expect(
      log.events.find((r) => r.actorUserId === "former-account"),
    ).toMatchObject({
      actorName: "Former or external account",
      context: {},
      before: {},
      after: {},
      reason: null,
    });
    expect(JSON.stringify(log)).not.toMatch(
      /AUDIT_(?:BEARER|PRIVATE|PASSWORD)_SENTINEL/,
    );
  });
  it("shows the reviewed room change without its replay hashes or arbitrary private JSON", async () => {
    const staff = await db.workspaceUser.findFirstOrThrow({
      where: { workspaceId, userId: ownerId },
    });
    await db.workspaceDataEvent.create({
      data: {
        workspaceId,
        actorUserId: ownerId,
        kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
        metadata: {
          schemaVersion: 1,
          roomId: "room-audit",
          operationId: randomUUID(),
          inputHash: "a".repeat(64),
          previewHash: "b".repeat(64),
          confirmedVersion: "c".repeat(64),
          revision: 1,
          previousRevision: 0,
          previousCapacity: 5,
          capacity: 2,
          reason: "Owner reviewed the room default",
          actorWorkspaceUserId: staff.id,
          actorNameSnapshot: "Audit owner",
          affectedOccurrenceCount: 1,
          reservationCount: 2,
          pendingPaymentCount: 0,
          queuedEntryCount: 3,
          privateNote: "ROOM_AUDIT_PRIVATE_SENTINEL",
        },
      },
    });
    const log = await api.getWorkspaceAudit({
      ...actor(),
      kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
    });
    expect(log.events).toHaveLength(1);
    expect(log.events[0]).toMatchObject({
      actorName: "Audit owner",
      context: {
        roomId: "room-audit",
        revision: 1,
        reservationCount: 2,
        queuedEntryCount: 3,
      },
      before: { capacity: 5 },
      after: { capacity: 2 },
      reason: "Owner reviewed the room default",
    });
    for (const key of [
      "operationId",
      "inputHash",
      "previewHash",
      "confirmedVersion",
      "privateNote",
    ])
      expect(log.events[0]!.context).not.toHaveProperty(key);
    expect(JSON.stringify(log)).not.toContain("ROOM_AUDIT_PRIVATE_SENTINEL");
  });
  it("enforces fresh active owner and tenant boundaries", async () => {
    for (const actorUserId of [coachId, "unknown"])
      await expect(
        api.getWorkspaceAudit({ ...actor(), actorUserId }),
      ).rejects.toThrow("Owner access required");
    await expect(
      api.getWorkspaceAudit({ ...actor(), workspaceId: otherId }),
    ).rejects.toThrow("Owner access required");
    await db.workspaceUser.updateMany({
      where: { workspaceId, userId: ownerId },
      data: { isActive: false },
    });
    await expect(api.getWorkspaceAudit(actor())).rejects.toThrow(
      "Owner access required",
    );
  });
  it("keeps type filtering and complete stable pagination scoped to this business", async () => {
    await db.workspaceDataEvent.createMany({
      data: Array.from({ length: 75 }, () => ({
        workspaceId,
        kind: "OWNED_EVENT",
        metadata: {},
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    });
    await db.workspaceDataEvent.createMany({
      data: [
        { workspaceId, kind: "OTHER_TYPE", metadata: {} },
        {
          workspaceId: otherId,
          kind: "FOREIGN_EVENT",
          metadata: { fullName: "FOREIGN_PRIVATE_SENTINEL" },
        },
      ],
    });
    const first = await api.getWorkspaceAudit({
      ...actor(),
      kind: "OWNED_EVENT",
    });
    const second = await api.getWorkspaceAudit({
      ...actor(),
      kind: "OWNED_EVENT",
      page: 2,
    });
    expect(first.count).toBe(75);
    expect(first.events).toHaveLength(50);
    expect(second.events).toHaveLength(25);
    expect(
      new Set([...first.events, ...second.events].map((row) => row.id)).size,
    ).toBe(75);
    expect(first.kinds.map((r) => r.kind)).toEqual([
      "OTHER_TYPE",
      "OWNED_EVENT",
    ]);
    expect(JSON.stringify(first)).not.toContain("FOREIGN_PRIVATE_SENTINEL");
    const normalized = await api.getWorkspaceAudit({
      ...actor(),
      page: Infinity,
      kind: "<bad>",
    });
    expect(normalized.page).toBe(1);
    expect(normalized.kind).toBeUndefined();
    expect(normalized.count).toBe(76);
  });
});
