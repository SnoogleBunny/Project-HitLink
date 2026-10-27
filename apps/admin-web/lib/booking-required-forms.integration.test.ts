import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  type Prisma,
  createAccessBackedBooking,
  recordLocalFormSignature,
  snapshotMembershipTerms,
} from "@flowstate/db";

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "required forms at the booking transaction boundary",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    let workspaceId: string,
      memberId: string,
      memberUserId: string,
      staffId: string;
    let templateId: string, documentId: string, versionId: string;

    beforeEach(async () => {
      workspaceId = (
        await db.workspace.create({
          data: { name: `booking-forms-${randomUUID()}` },
        })
      ).id;
      workspaces.push(workspaceId);
      await createFixtureClassSchedulingPolicy(db, workspaceId);
      const staff = await db.user.create({
        data: {
          email: `forms-owner-${randomUUID()}@example.test`,
          workspaceUsers: { create: { workspaceId, role: "OWNER" } },
        },
        include: { workspaceUsers: true },
      });
      users.push(staff.id);
      staffId = staff.workspaceUsers[0]!.id;
      const memberUser = await db.user.create({
        data: {
          email: `forms-member-${randomUUID()}@example.test`,
          workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } },
        },
      });
      users.push(memberUser.id);
      memberUserId = memberUser.id;
      memberId = (
        await db.member.create({
          data: {
            workspaceId,
            userId: memberUserId,
            fullName: "Participant",
            email: memberUser.email,
            status: "ACTIVE",
          },
        })
      ).id;
      const location = await db.location.create({
        data: { workspaceId, name: "Gym", timezone: "UTC" },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Mat", capacity: 10 },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Muay Thai" },
      });
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            roomId: room.id,
            programId: program.id,
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 60,
            cancellationCutoffMinutes: 120,
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Limited",
          monthlyPriceCents: 12000,
          weeklyClassLimit: 1,
          monthlyClassLimit: 4,
        },
      });
      await db.memberMembership.create({
        data: {
          workspaceId,
          memberId,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startedAt: new Date("2029-12-01"),
          allowanceAnchorDate: new Date("2030-01-01"),
          allowanceTimezone: "UTC",
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(plan)),
          ),
        },
      });
      documentId = (
        await db.formDocument.create({
          data: { workspaceId, name: "Required waiver", formType: "WAIVER" },
        })
      ).id;
      versionId = await createVersion(1);
      await db.formDocument.update({
        where: { id: documentId },
        data: { currentVersionId: versionId },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId,
          formDocumentId: documentId,
          requirementTarget: "MEMBER",
        },
      });
    });
    afterAll(async () => {
      for (const id of workspaces) {
        await db.memberPortalGrant.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    async function createVersion(versionNumber: number) {
      return (
        await db.formVersion.create({
          data: {
            workspaceId,
            formDocumentId: documentId,
            versionNumber,
            fileName: "waiver.pdf",
            mimeType: "application/pdf",
            fileSizeBytes: 8,
            fileSha256: String(versionNumber).padStart(64, "0"),
            fileData: Buffer.from("%PDF-1.7"),
            uploadedByWorkspaceUserId: staffId,
          },
        })
      ).id;
    }
    const book = (
      source: "ADMIN" | "MEMBER_PORTAL" | "PUBLIC_TRIAL" = "MEMBER_PORTAL",
      database = db,
      scheduledForDate = "2030-01-07",
    ) =>
      createAccessBackedBooking({
        workspaceId,
        memberId,
        classTemplateId: templateId,
        scheduledForDate,
        timezone: "UTC",
        source,
        trial: source === "PUBLIC_TRIAL",
        db: database as never,
        now,
      });
    async function signCurrent() {
      const request = await db.signatureRequest.create({
        data: {
          workspaceId,
          memberId,
          formVersionId: versionId,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      const result = await recordLocalFormSignature({
        workspaceId,
        memberId,
        requestId: request.id,
        actorUserId: memberUserId,
        signerName: "Participant",
        db,
        now,
      });
      expect(result.status).toBe("signed");
    }

    it("rejects forged direct staff, member and trial calls before any seat or allowance write", async () => {
      for (const source of [
        "ADMIN",
        "MEMBER_PORTAL",
        "PUBLIC_TRIAL",
      ] as const) {
        expect(await book(source)).toMatchObject({
          status: "error",
          code: "NO_ACCESS",
          message: expect.stringContaining("exact forms valid for this class"),
        });
      }
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
      expect(
        await db.membershipAllowanceEntry.count({ where: { workspaceId } }),
      ).toBe(0);
      await signCurrent();
      expect((await book("ADMIN")).status).toBe("created");
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(2);
    });

    it("requires the exact verified guardian and exact current signed version for a child", async () => {
      await db.member.update({
        where: { id: memberId },
        data: { dateOfBirth: new Date("2017-01-01") },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId,
          fullName: "Guardian",
          email: "guardian@example.test",
        },
      });
      const other = await db.guardian.create({
        data: { workspaceId, fullName: "Other guardian" },
      });
      await db.familyLink.createMany({
        data: [
          { workspaceId, guardianId: guardian.id, childMemberId: memberId },
          { workspaceId, guardianId: other.id, childMemberId: memberId },
        ],
      });
      const account = await db.user.create({
        data: {
          email: `guardian-${randomUUID()}@example.test`,
          workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } },
        },
      });
      users.push(account.id);
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId,
          userId: account.id,
          memberId,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: staffId,
          verificationNote: "Fixture verified authority",
          canBook: true,
          canSign: false,
        },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId,
          memberId,
          guardianId: guardian.id,
          formVersionId: versionId,
          signerKind: "GUARDIAN",
          accessMethod: "PORTAL",
        },
      });
      const sign = (guardianId = guardian.id) =>
        recordLocalFormSignature({
          workspaceId,
          memberId,
          guardianId,
          requestId: request.id,
          actorUserId: account.id,
          signerName: "Guardian",
          db,
          now,
        });
      expect((await sign()).status).toBe("error");
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { canSign: true },
      });
      expect((await sign(other.id)).status).toBe("error");
      expect((await book("ADMIN")).status).toBe("error");
      expect((await sign()).status).toBe("signed");
      expect((await book("ADMIN")).status).toBe("created");
      const next = await createVersion(2);
      await db.formDocument.update({
        where: { id: documentId },
        data: { currentVersionId: next },
      });
      expect((await book("ADMIN", db, "2030-01-14")).status).toBe("error");
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(2);
      // A superseded, correctly authorized signature remains history, not current consent.
      expect(
        await db.signedDocument.count({
          where: {
            workspaceId,
            guardianId: guardian.id,
            formVersionId: versionId,
          },
        }),
      ).toBe(1);
    });

    it("observes a concurrently published version before committing a booking", async () => {
      await signCurrent();
      const next = await createVersion(2);
      type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
      const observedOutcome = <T>(promise: Promise<T>): Promise<Outcome<T>> =>
        promise.then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error }),
        );
      let published!: (pid: number) => void,
        release!: () => void,
        bookingStarted!: (pid: number) => void;
      const publicationHasRowLock = new Promise<number>((resolve) => {
        published = resolve;
      });
      const releasePublication = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bookingHasTransaction = new Promise<number>((resolve) => {
        bookingStarted = resolve;
      });
      const publication = observedOutcome(
        db.$transaction(async (tx) => {
          const [backend] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await tx.formDocument.update({
            where: { id: documentId },
            data: { currentVersionId: next },
          });
          published(backend!.pid);
          await releasePublication;
        }),
      );
      const observed = {
        $transaction: <T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
          options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
          },
        ) =>
          db.$transaction(async (tx) => {
            const [backend] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            bookingStarted(backend!.pid);
            return callback(tx);
          }, options),
      };
      let booking:
        | Promise<Outcome<Awaited<ReturnType<typeof book>>>>
        | undefined;
      let publicationResult: Outcome<void> | undefined;
      let bookingResult: Outcome<Awaited<ReturnType<typeof book>>> | undefined;
      let observationFailure: unknown,
        blockedOnPublication = false;
      try {
        const publisherPid = await Promise.race([
          publicationHasRowLock,
          publication.then((result) => {
            throw result.ok
              ? new Error("Publication ended before its row-lock barrier.")
              : result.error;
          }),
        ]);
        // Observe rejections immediately; every transaction is drained in finally.
        booking = observedOutcome(book("MEMBER_PORTAL", observed as never));
        const bookingPid = await Promise.race([
          bookingHasTransaction,
          booking.then((result) => {
            throw result.ok
              ? new Error("Booking ended before its transaction barrier.")
              : result.error;
          }),
        ]);
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          const [lock] = await db.$queryRaw<
            Array<{
              waiting: boolean;
              publisherBlocks: boolean;
              formQuery: boolean;
            }>
          >`
          SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${bookingPid} AND NOT granted) AS waiting,
            ${publisherPid} = ANY(pg_blocking_pids(${bookingPid}::int)) AS "publisherBlocks",
            COALESCE((SELECT query LIKE '%form_documents%' FROM pg_stat_activity WHERE pid=${bookingPid}), false) AS "formQuery"
        `;
          if (lock?.waiting && lock.publisherBlocks && lock.formQuery) {
            blockedOnPublication = true;
            break;
          }
        }
        expect(blockedOnPublication).toBe(true);
      } catch (error) {
        observationFailure = error;
      } finally {
        release();
        publicationResult = await publication;
        bookingResult = booking ? await booking : undefined;
      }
      if (observationFailure) throw observationFailure;
      if (!publicationResult?.ok)
        throw (
          publicationResult?.error ?? new Error("Publication did not complete.")
        );
      if (!bookingResult?.ok)
        throw bookingResult?.error ?? new Error("Booking did not complete.");
      expect(bookingResult.value).toMatchObject({
        status: "error",
        code: "NO_ACCESS",
      });
      expect(
        (await db.formDocument.findUniqueOrThrow({ where: { id: documentId } }))
          .currentVersionId,
      ).toBe(next);
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
  },
);
