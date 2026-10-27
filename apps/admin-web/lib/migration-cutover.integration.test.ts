import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, Prisma } from "@flowstate/db";
import {
  captureCutoverState,
  recordMigrationCutoverEvidence,
  type CutoverEvidence,
} from "./migration-cutover";
import {
  acknowledgeMigrationOwnerReview,
  markMigrationOperationallyReady,
  runMigrationImport,
  uploadAndStageMigrationCsv,
} from "./workspace-migration";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("audited migration cutover", () => {
  const db = new PrismaClient({ datasources: { db: { url } } }),
    workspaceIds: string[] = [],
    userIds: string[] = [];
  let workspaceId: string, userId: string, locationId: string;
  const operator = {
      type: "FLOWSTATE_OPERATOR" as const,
      actorId: "test-operator",
    },
    now = new Date("2030-01-01T00:00:00Z");
  beforeEach(async () => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "corrections@example.test",
    );
    userId = (
      await db.user.create({ data: { email: `${randomUUID()}@cutover.test` } })
    ).id;
    userIds.push(userId);
    const workspace = await db.workspace.create({
      data: {
        name: `cutover-${randomUUID()}`,
        status: "SETUP_INCOMPLETE",
        location: { create: { name: "Gym", timezone: "UTC" } },
        workspaceUsers: { create: { userId, role: "OWNER" } },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2030-01-02"),
            nextOwnerAction: "Review",
            flowstateResponsibility: "Reconcile",
          },
        },
      },
      include: { location: true },
    });
    workspaceId = workspace.id;
    locationId = workspace.location!.id;
    workspaceIds.push(workspaceId);
  });
  afterAll(async () => {
    for (const id of workspaceIds) await db.workspace.delete({ where: { id } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });
  async function importContact(
    csv = "id,name,status,email\none,Ada,ACTIVE,ada@example.test\n",
  ) {
    const fileData = Buffer.from(csv);
    await uploadAndStageMigrationCsv({
      workspaceId,
      actor: operator,
      input: {
        recordKind: "MEMBER",
        fileName: "members.csv",
        fileSizeBytes: fileData.length,
        fileData,
      },
      db,
    });
    const job = await db.importJob.findFirstOrThrow({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return {
      job,
      result: await runMigrationImport({
        workspaceId,
        locationId,
        importJobId: job.id,
        actor: operator,
        db,
      }),
    };
  }
  async function evidence() {
    const state = await captureCutoverState(db, workspaceId);
    return {
      version: 1,
      sourceTotals: state.totals,
      sourceReferences: {
        people: "Reviewed member export",
        contracts: "None in source scope",
        money: "No balances in source",
        units: "No pack or allowance units",
        futureBookings: "No future source bookings",
        familyAuthority: "No dependents in source",
        consent: "No transferred consent; new forms required before attendance",
      },
      recordDisposition: {
        sourceCount: state.importedSourceCount,
        importedCount: state.importedSourceCount,
        excluded: [],
        quarantinedCount: 0,
      },
      billingOwners: [],
      backupReference: "isolated backup fixture",
      restoreRehearsalReference: "restore verified fixture",
      finalDeltaReference: "delta export fixture",
      supportContact: "operator@example.test",
    } satisfies CutoverEvidence;
  }
  async function snapshot() {
    return recordMigrationCutoverEvidence({
      workspaceId,
      actor: operator,
      evidence: await evidence(),
      db,
    });
  }
  it("activates supported contact-only migration only after exact owner review and separate operator action", async () => {
    expect((await importContact()).result.status).toBe("ok");
    await db.workspaceMigration.update({
      where: { workspaceId },
      data: { stage: "GO_LIVE_SCHEDULED" },
    });
    expect(
      await acknowledgeMigrationOwnerReview({ workspaceId, userId, db, now }),
    ).toMatchObject({ status: "error" });
    const reviewed = await snapshot();
    expect(
      await acknowledgeMigrationOwnerReview({
        workspaceId,
        userId,
        snapshotId: reviewed.id,
        db,
        now,
      }),
    ).toMatchObject({ status: "ok" });
    expect(
      (await db.workspace.findUnique({ where: { id: workspaceId } }))?.status,
    ).toBe("SETUP_INCOMPLETE");
    expect(
      await markMigrationOperationallyReady({
        workspaceId,
        actor: operator,
        db,
        now,
      }),
    ).toMatchObject({ status: "ok" });
  });
  it("retries a rolled-back serialization conflict as a complete snapshot transaction", async () => {
    await importContact();
    let attempts = 0;
    const retrying = {
      $transaction: async (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: { isolationLevel: Prisma.TransactionIsolationLevel },
      ) => {
        attempts++;
        if (attempts === 1) throw new Prisma.PrismaClientKnownRequestError("Retry fixture", { code: "P2034", clientVersion: "6.19.3" });
        return db.$transaction(operation, options);
      },
    } as unknown as PrismaClient;
    const receipt = await recordMigrationCutoverEvidence({
      workspaceId,
      actor: operator,
      evidence: await evidence(),
      db: retrying,
    });
    expect(receipt.workspaceId).toBe(workspaceId);
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(attempts).toBeLessThanOrEqual(6);
    expect(
      await db.migrationCutoverSnapshot.count({ where: { workspaceId } }),
    ).toBe(1);
  });
  it("rejects changed evidence and source mismatches without activating", async () => {
    await importContact();
    await db.workspaceMigration.update({
      where: { workspaceId },
      data: { stage: "GO_LIVE_SCHEDULED" },
    });
    const bad = await evidence();
    bad.sourceTotals.futureBookings = 1;
    await expect(
      recordMigrationCutoverEvidence({
        workspaceId,
        actor: operator,
        evidence: bad,
        db,
      }),
    ).rejects.toThrow("futureBookings");
    const reviewed = await snapshot();
    await acknowledgeMigrationOwnerReview({
      workspaceId,
      userId,
      snapshotId: reviewed.id,
      db,
      now,
    });
    await db.member.updateMany({
      where: { workspaceId },
      data: { status: "FROZEN" },
    });
    expect(
      await markMigrationOperationallyReady({
        workspaceId,
        actor: operator,
        db,
        now,
      }),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("changed"),
    });
    expect(
      (await db.workspace.findUnique({ where: { id: workspaceId } }))?.status,
    ).toBe("SETUP_INCOMPLETE");
  });
  it("quarantines unknown status and excludes broad source notes", async () => {
    const invalid = await importContact(
      "id,name,status,notes\none,Ada,UNKNOWN,Private source content\n",
    );
    expect(invalid.result.status).toBe("error");
    expect(await db.member.count({ where: { workspaceId } })).toBe(0);
    expect(
      await db.validationIssue.findMany({ where: { workspaceId } }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNKNOWN_STATUS", severity: "ERROR" }),
      ]),
    );
    const staged = await db.stagingRecord.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(staged.mappedData).toMatchObject({ status: null, notes: null });
  });
  it("blocks current contracts without accepted terms and original allowance boundaries", async () => {
    await importContact();
    const member = await db.member.findFirstOrThrow({ where: { workspaceId } }),
      plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Imported plan",
          monthlyPriceCents: 10000,
          weeklyClassLimit: 2,
        },
      });
    await db.memberMembership.create({
      data: {
        workspaceId,
        memberId: member.id,
        membershipPlanId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        nextBillingDate: new Date("2030-02-01"),
      },
    });
    await expect(snapshot()).rejects.toThrow("accepted terms");
  });
});
