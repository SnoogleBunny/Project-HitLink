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
import type { Prisma, PrismaClient } from "@flowstate/db";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "record authority after a real PostgreSQL advisory wait",
  () => {
    let db: PrismaClient;
    let shared: typeof import("@flowstate/db");
    let archive: typeof import("./member-archive");
    let business: typeof import("./business-settings");
    let workspaceId: string,
      ownerId: string,
      parentId: string,
      childId: string,
      grantId: string,
      linkId: string;
    const now = new Date("2026-11-02T12:00:00Z");
    const owner = () => ({ workspaceId, userId: ownerId });
    const parent = () => ({ workspaceId, userId: parentId });
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      shared = await import("@flowstate/db");
      db = shared.prisma;
      archive = await import("./member-archive");
      business = await import("./business-settings");
    });
    beforeEach(async () => {
      const key = randomUUID();
      ownerId = `waited-owner-${key}`;
      parentId = `waited-parent-${key}`;
      await db.user.createMany({
        data: [ownerId, parentId].map((id) => ({
          id,
          email: `${id}@example.test`,
        })),
      });
      const workspace = await db.workspace.create({
        data: {
          name: "Retained fictional business",
          status: "ACTIVE",
          location: { create: { name: "Fictional", timezone: "UTC" } },
          settings: { create: {} },
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: parentId, role: "CUSTOMER" },
            ],
          },
        },
        include: { workspaceUsers: true },
      });
      workspaceId = workspace.id;
      await db.member.create({
        data: {
          workspaceId,
          userId: parentId,
          fullName: "Verified adult",
          dateOfBirth: new Date("1990-01-01"),
        },
      });
      childId = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "CHILD_RECORDS_PRIVATE",
            dateOfBirth: new Date("2015-01-01"),
          },
        })
      ).id;
      const guardian = await db.guardian.create({
        data: { workspaceId, fullName: "Verified adult" },
      });
      linkId = (
        await db.familyLink.create({
          data: {
            workspaceId,
            guardianId: guardian.id,
            childMemberId: childId,
          },
        })
      ).id;
      grantId = (
        await db.memberPortalGrant.create({
          data: {
            workspaceId,
            userId: parentId,
            memberId: childId,
            guardianId: guardian.id,
            verifiedByWorkspaceUserId: workspace.workspaceUsers.find(
              (row) => row.userId === ownerId,
            )!.id,
            verificationNote: "Exact fictional child authority",
            verifiedAt: now,
            canSign: true,
            canManageEmergencyContacts: false,
          },
        })
      ).id;
    });
    afterEach(async () => {
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: [ownerId, parentId] } } });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });

    async function afterWait<T>(
      operation: () => Promise<T>,
      revoke: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) {
      let acquired!: () => void, release!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const mayRevoke = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await shared.lockClassSchedule(tx, workspaceId);
          acquired();
          await mayRevoke;
          await revoke(tx);
        },
        { timeout: 20000 },
      );
      await held;
      const attempted = operation().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
            AND objsubid = 1 AND objid::bigint = (hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting
        `;
              return rows[0]?.waiting;
            },
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
      }
      await blocker;
      return attempted;
    }
    const revocation =
      (kind: "owner" | "business") => (tx: Prisma.TransactionClient) =>
        kind === "owner"
          ? tx.workspaceUser.updateMany({
              where: { workspaceId, userId: ownerId },
              data: { isActive: false },
            })
          : tx.workspace.update({
              where: { id: workspaceId },
              data: { status: "DISABLED" },
            });

    it.each(["owner", "business"] as const)(
      "archive rejects waited %s revocation with unchanged member/history",
      async (kind) => {
        const preview = await archive.getMemberArchive(owner(), childId, now);
        const result = await afterWait(
          () =>
            archive.changeMemberArchive(
              owner(),
              {
                memberId: childId,
                expectedVersion: 0,
                archived: true,
                reason: "Reviewed retained records",
                expectedImpactHash: preview!.impact.hash,
                retainBalancesAndUnits: true,
              },
              now,
            ),
          revocation(kind),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("Revoked archive committed");
        expect(result.error).toBeInstanceOf(archive.MemberArchiveError);
        expect(
          await db.member.findUniqueOrThrow({ where: { id: childId } }),
        ).toMatchObject({ archivedAt: null, archiveVersion: 0 });
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "MEMBER_ARCHIVED" },
          }),
        ).toBe(0);
      },
      20000,
    );

    it.each(["owner", "business"] as const)(
      "business settings reject waited %s revocation without edits/audit",
      async (kind) => {
        const result = await afterWait(
          () =>
            business.saveBusinessSettings(owner(), 0, {
              name: "Must not persist",
              businessType: "Coaching",
              contactEmail: "owner@example.test",
              contactPhone: "",
              currency: "cad",
              locale: "en-CA",
              addressLine1: "",
              addressLine2: "",
              city: "",
              region: "",
              postalCode: "",
              countryCode: "",
            }),
          revocation(kind),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("Revoked settings committed");
        expect(result.error).toBeInstanceOf(business.BusinessSettingsError);
        expect(
          (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
            .name,
        ).toBe("Retained fictional business");
        expect(
          (
            await db.workspaceSetting.findUniqueOrThrow({
              where: { workspaceId },
            })
          ).identityVersion,
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "BUSINESS_SETTINGS_CHANGED" },
          }),
        ).toBe(0);
      },
      20000,
    );

    it.each(["owner", "business"] as const)(
      "workspace export rejects waited %s revocation without a readable artifact",
      async (kind) => {
        const result = await afterWait(
          () =>
            shared.createWorkspaceDataExport(
              owner(),
              "Reviewed fictional archive",
              { db, now },
            ),
          revocation(kind),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("Revoked export completed");
        expect(result.error).toBeInstanceOf(shared.WorkspaceDataError);
        expect(
          await db.workspaceDataExport.count({
            where: { workspaceId, state: "READY" },
          }),
        ).toBe(0);
        expect(
          await db.workspaceDataExport.findFirstOrThrow({
            where: { workspaceId },
          }),
        ).toMatchObject({ state: "FAILED", artifact: null });
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "EXPORT_READY" },
          }),
        ).toBe(0);
      },
      20000,
    );

    it.each(["signing permission", "family link"] as const)(
      "child download rejects waited %s removal without disclosing an older records-only archive",
      async (kind) => {
        const job = await shared.createMemberDataExport(
          parent(),
          { scope: "MEMBER", targetId: childId },
          randomUUID(),
          { db, now },
        );
        const stored = await db.memberDataExport.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(
          (stored.manifest as { requiresEmergencyContactAccess?: boolean })
            .requiresEmergencyContactAccess,
        ).toBe(false);
        const result = await afterWait(
          () => shared.downloadMemberDataExport(parent(), job.id, { db, now }),
          (tx) =>
            kind === "signing permission"
              ? tx.memberPortalGrant.update({
                  where: { id: grantId },
                  data: { canSign: false },
                })
              : tx.familyLink.delete({ where: { id: linkId } }),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("Revoked child archive was disclosed");
        expect(result.error).toBeInstanceOf(shared.MemberDataError);
        expect(
          (
            await db.memberDataExport.findUniqueOrThrow({
              where: { id: job.id },
            })
          ).downloadedAt,
        ).toBeNull();
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "MEMBER_EXPORT_DOWNLOADED" },
          }),
        ).toBe(0);
      },
      20000,
    );
  },
);
