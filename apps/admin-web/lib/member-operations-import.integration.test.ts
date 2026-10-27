import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  changeMemberOperations,
  type Prisma,
} from "@flowstate/db";
import { createHash } from "node:crypto";
import { runMigrationImport } from "./workspace-migration";

const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error(
    "Member cohort re-import proof requires a disposable local test database.",
  );
(url ? describe : describe.skip)(
  "reviewed member cohort labels at the migration boundary",
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    afterAll(() => db.$disconnect());
    it("retains a sanitized blocking review without overwriting tag history, a committed seat or any row from the import; corrected source can retry", async () => {
      const user = await db.user.create({
        data: {
          fullName: "Fictional staging owner",
          email: `cohort-import-${randomUUID()}@example.test`,
        },
      });
      const workspace = await db.workspace.create({
        data: {
          name: `cohort-import-${randomUUID()}`,
          status: "SETUP_INCOMPLETE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Mat", capacity: 10 } },
            },
          },
          workspaceUsers: { create: { userId: user.id, role: "OWNER" } },
          migration: {
            create: {
              stage: "MIGRATION_IN_PROGRESS",
              nextOwnerAction: "Review fictional staging",
              flowstateResponsibility: "Local transactional proof",
            },
          },
          programs: { create: { name: "Training" } },
        },
        include: { location: { include: { rooms: true } }, programs: true },
      });
      try {
        const member = await db.member.create({
          data: {
            workspaceId: workspace.id,
            fullName: "Reviewed participant",
            status: "ACTIVE",
            notes: "RETAINED_LEGACY_OWNER_REVIEW_NOTE",
          },
        });
        const label = "Reviewed training group",
          key = `tag:COHORT_ELIGIBILITY:${createHash("sha256").update(label).digest("hex")}`;
        await changeMemberOperations(
          { workspaceId: workspace.id, userId: user.id },
          {
            memberId: member.id,
            recordKey: key,
            recordKind: "TAG",
            action: "ADD",
            tagPurpose: "COHORT_ELIGIBILITY",
            tagLabel: label,
            visibility: "OWNER_ONLY",
            expectedVersion: 0,
            operationId: randomUUID(),
          },
          { db },
        );
        const template = await db.classTemplate.create({
          data: {
            workspaceId: workspace.id,
            programId: workspace.programs[0]!.id,
            roomId: workspace.location!.rooms[0]!.id,
            title: "Retained group class",
            weekday: "MONDAY",
            startTimeMinutes: 600,
            endTimeMinutes: 660,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
            prerequisites: {
              minimumRankKey: null,
              minimumStripes: 0,
              allowUnranked: true,
              minimumAge: null,
              maximumAge: null,
              cohortTag: label,
            },
          },
        });
        const booking = await db.classBooking.create({
          data: {
            workspaceId: workspace.id,
            memberId: member.id,
            classTemplateId: template.id,
            scheduledForDate: new Date("2099-01-05Z"),
            status: "BOOKED",
          },
        });
        const job = await db.importJob.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional revised member source",
            status: "VALIDATED",
          },
        });
        const mapped = {
          fullName: "Source participant name",
          status: "ACTIVE",
          tags: ["Source replacement label"],
          notes: "UNREVIEWED_SOURCE_NOTE_MUST_NOT_COPY",
        };
        const row = await db.stagingRecord.create({
          data: {
            workspaceId: workspace.id,
            importJobId: job.id,
            recordKind: "MEMBER",
            externalId: "fictional-member-1",
            rawData: { externalId: "fictional-member-1" },
            mappedData: mapped,
            isReadyForImport: true,
          },
        });
        await db.migrationImportedRecord.create({
          data: {
            workspaceId: workspace.id,
            recordKind: "MEMBER",
            externalId: row.externalId!,
            importedModel: "Member",
            importedRecordId: member.id,
          },
        });
        const otherRow = await db.stagingRecord.create({
          data: {
            workspaceId: workspace.id,
            importJobId: job.id,
            recordKind: "MEMBER",
            externalId: "fictional-new-member-2",
            rawData: {},
            mappedData: {
              fullName: "Must not partially import",
              status: "TRIAL",
              tags: [],
              notes: "UNREVIEWED_NEW_SOURCE_NOTE_MUST_NOT_COPY",
            },
            isReadyForImport: true,
          },
        });
        const attempt = () =>
          runMigrationImport({
            workspaceId: workspace.id,
            locationId: workspace.location!.id,
            importJobId: job.id,
            actor: {
              type: "FLOWSTATE_OPERATOR",
              actorId: "fictional-import-operator",
            },
            db,
          });
        expect(await attempt()).toMatchObject({
          status: "error",
          message: expect.stringContaining("reviewed eligibility tags"),
        });
        expect(
          await db.member.findUniqueOrThrow({ where: { id: member.id } }),
        ).toMatchObject({ fullName: "Reviewed participant", tags: [label] });
        expect(
          await db.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          }),
        ).toEqual(booking);
        expect(
          await db.memberOperationalRevision.count({
            where: { workspaceId: workspace.id, memberId: member.id },
          }),
        ).toBe(1);
        expect(
          await db.member.count({
            where: {
              workspaceId: workspace.id,
              fullName: "Must not partially import",
            },
          }),
        ).toBe(0);
        expect(
          await db.membershipAllowanceEntry.count({
            where: { workspaceId: workspace.id },
          }),
        ).toBe(0);
        const issues = await db.validationIssue.findMany({
          where: {
            workspaceId: workspace.id,
            importJobId: job.id,
            code: "REVIEWED_COHORT_IMPORT_CONFLICT",
          },
        });
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
          stagingRecordId: row.id,
          severity: "ERROR",
          fieldName: "tags",
        });
        expect(JSON.stringify(issues)).not.toContain(label);
        expect(JSON.stringify(issues)).not.toContain(mapped.tags[0]);
        expect(
          await db.importJob.findUniqueOrThrow({ where: { id: job.id } }),
        ).toMatchObject({
          status: "VALIDATED",
          startedAt: null,
          completedAt: null,
        });
        expect(await attempt()).toMatchObject({ status: "error" });
        expect(
          await db.validationIssue.count({
            where: {
              importJobId: job.id,
              code: "REVIEWED_COHORT_IMPORT_CONFLICT",
            },
          }),
        ).toBe(1);
        await db.stagingRecord.update({
          where: { id: row.id },
          data: {
            mappedData: { ...mapped, tags: [label] } as Prisma.InputJsonObject,
          },
        });
        expect(await attempt()).toMatchObject({ status: "ok" });
        expect(
          await db.validationIssue.count({
            where: {
              importJobId: job.id,
              code: "REVIEWED_COHORT_IMPORT_CONFLICT",
            },
          }),
        ).toBe(0);
        expect(
          await db.member.findUniqueOrThrow({ where: { id: member.id } }),
        ).toMatchObject({
          fullName: mapped.fullName,
          tags: [label],
          notes: "RETAINED_LEGACY_OWNER_REVIEW_NOTE",
        });
        expect(
          await db.member.findFirstOrThrow({
            where: {
              workspaceId: workspace.id,
              fullName: "Must not partially import",
            },
          }),
        ).toMatchObject({ notes: null });
        expect(
          await db.stagingRecord.findUniqueOrThrow({
            where: { id: otherRow.id },
          }),
        ).toMatchObject({ importedModel: "Member" });
        expect(
          await db.memberOperationalRevision.count({
            where: { workspaceId: workspace.id, memberId: member.id },
          }),
        ).toBe(1);
        expect(
          await db.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          }),
        ).toEqual(booking);
      } finally {
        await db.workspace.delete({ where: { id: workspace.id } });
        await db.user.delete({ where: { id: user.id } });
      }
    });

    it("retries a pre-lock Serializable import snapshot after a concurrently reviewed legacy classification instead of overwriting its eligibility projection", async () => {
      const user = await db.user.create({
        data: {
          fullName: "Fictional classification owner",
          email: `classify-import-${randomUUID()}@example.test`,
        },
      });
      const workspace = await db.workspace.create({
        data: {
          name: `classify-import-${randomUUID()}`,
          status: "SETUP_INCOMPLETE",
          workspaceUsers: { create: { userId: user.id, role: "OWNER" } },
          location: { create: { name: "Gym", timezone: "UTC" } },
          migration: {
            create: {
              stage: "MIGRATION_IN_PROGRESS",
              nextOwnerAction: "Review fictional source",
              flowstateResponsibility: "Local race proof",
            },
          },
        },
        include: { location: true },
      });
      const suffix = randomUUID().replaceAll("-", ""),
        fn = `ops_import_${suffix}`,
        barrier = `ops-classify:${workspace.id}`;
      let release!: () => void, holdingTx!: Prisma.TransactionClient;
      const canCommit = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held!: () => void;
      const hasLock = new Promise<void>((resolve) => {
        held = resolve;
      });
      let blocker: Promise<unknown> | undefined,
        classify: Promise<unknown> | undefined,
        importing: ReturnType<typeof runMigrationImport> | undefined;
      try {
        const label = "Legacy classification wins",
          member = await db.member.create({
            data: {
              workspaceId: workspace.id,
              fullName: "Classified participant",
              tags: [label],
            },
          });
        const job = await db.importJob.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional concurrent source",
            status: "VALIDATED",
          },
        });
        const row = await db.stagingRecord.create({
          data: {
            workspaceId: workspace.id,
            importJobId: job.id,
            recordKind: "MEMBER",
            externalId: "concurrent-person",
            rawData: {},
            mappedData: {
              fullName: "Unreviewed source replacement",
              status: "ACTIVE",
              tags: [],
            },
            isReadyForImport: true,
          },
        });
        await db.migrationImportedRecord.create({
          data: {
            workspaceId: workspace.id,
            recordKind: "MEMBER",
            externalId: row.externalId!,
            importedModel: "Member",
            importedRecordId: member.id,
          },
        });
        await db.$executeRawUnsafe(
          `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${workspace.id.replaceAll("'", "''")}' THEN PERFORM pg_advisory_xact_lock(hashtext('${barrier}')); END IF; RETURN NEW; END; $$`,
        );
        await db.$executeRawUnsafe(
          `CREATE TRIGGER "${fn}" BEFORE INSERT ON member_operational_revisions FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
        );
        blocker = db.$transaction(
          async (tx) => {
            holdingTx = tx;
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${barrier}))::text`;
            held();
            await canCommit;
          },
          { timeout: 20000 },
        );
        await hasLock;
        const waiting = async (key: string) => {
          const rows = await holdingTx.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid::bigint = (hashtext(${key})::bigint & 4294967295)) AS waiting`;
          return rows[0]?.waiting;
        };
        classify = changeMemberOperations(
          { workspaceId: workspace.id, userId: user.id },
          {
            memberId: member.id,
            recordKey: `tag:COHORT_ELIGIBILITY:${createHash("sha256").update(label).digest("hex")}`,
            recordKind: "TAG",
            action: "CLASSIFY",
            tagPurpose: "COHORT_ELIGIBILITY",
            tagLabel: label,
            visibility: "OWNER_ONLY",
            reason: "Explicit owner review of legacy tag visibility",
            expectedVersion: 0,
            operationId: randomUUID(),
          },
          { db },
        );
        await expect.poll(() => waiting(barrier), { timeout: 5000 }).toBe(true);
        importing = runMigrationImport({
          workspaceId: workspace.id,
          locationId: workspace.location!.id,
          importJobId: job.id,
          actor: {
            type: "FLOWSTATE_OPERATOR",
            actorId: "fictional-race-operator",
          },
          db,
        });
        // This is the import transaction waiting after its SERIALIZABLE advisory
        // SELECT acquired a snapshot; the owner has written Member.tags already.
        await expect
          .poll(() => waiting(`class-schedule:${workspace.id}`), {
            timeout: 5000,
          })
          .toBe(true);
        release();
        await blocker;
        await classify;
        expect(await importing).toMatchObject({
          status: "error",
          message: expect.stringContaining("reviewed eligibility tags"),
        });
        expect(
          await db.member.findUniqueOrThrow({ where: { id: member.id } }),
        ).toMatchObject({ fullName: "Classified participant", tags: [label] });
        expect(
          await db.memberOperationalRevision.count({
            where: {
              workspaceId: workspace.id,
              memberId: member.id,
              action: "CLASSIFY",
            },
          }),
        ).toBe(1);
        expect(
          await db.validationIssue.count({
            where: {
              workspaceId: workspace.id,
              importJobId: job.id,
              code: "REVIEWED_COHORT_IMPORT_CONFLICT",
            },
          }),
        ).toBe(1);
        expect(
          await db.importJob.findUniqueOrThrow({ where: { id: job.id } }),
        ).toMatchObject({ status: "VALIDATED", startedAt: null });
      } finally {
        release?.();
        await Promise.allSettled(
          [blocker, classify, importing].filter(Boolean),
        );
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "${fn}" ON member_operational_revisions`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
        await db.workspace.delete({ where: { id: workspace.id } });
        await db.user.delete({ where: { id: user.id } });
      }
    }, 30000);
  },
);
