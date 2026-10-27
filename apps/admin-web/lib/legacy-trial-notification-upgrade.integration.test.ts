import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  completeVerifiedTrial,
  cancelAccessBackedBooking,
  processNotificationOutbox,
  retryFailedNotification,
  shouldDeliverNotification,
  type NotificationJobRecord,
  Prisma,
  lockClassSchedule,
} from "@flowstate/db";
import {
  noticeFixtures,
  testUrl,
} from "../tests/class-booking-notification-fixture";

(testUrl ? describe : describe.skip)(
  "pre60 verified-trial notice upgrade",
  () => {
    const { db, fixture, cleanup, disconnect, now, date } = noticeFixtures();
    afterEach(cleanup);
    afterAll(disconnect);
    type Fixture = Awaited<ReturnType<typeof fixture>>;

    /** Current canonical booking/acceptance, then the exact documented source59 producer envelope.
     * This models retained historical rows; it is not an executed pre60 migration fixture. */
    async function historical(
      options: { keepModern?: boolean; child?: boolean } = {},
    ) {
      const f = await fixture();
      let guardianId: string | undefined;
      let grantId: string | undefined;
      let payerMemberId = f.member.id;
      if (options.child) {
        const guardian = await db.guardian.create({
          data: {
            workspaceId: f.workspace.id,
            fullName: "Fictional parent",
            email: f.account.email,
          },
        });
        guardianId = guardian.id;
        await db.member.update({
          where: { id: f.member.id },
          data: {
            userId: null,
            dateOfBirth: new Date("2020-01-01"),
            status: "TRIAL",
          },
        });
        payerMemberId = (
          await db.member.create({
            data: {
              workspaceId: f.workspace.id,
              userId: f.account.id,
              fullName: "Fictional parent",
              dateOfBirth: new Date("1990-01-01"),
              status: "ACTIVE",
            },
          })
        ).id;
        await db.familyLink.create({
          data: {
            workspaceId: f.workspace.id,
            guardianId,
            childMemberId: f.member.id,
            relationshipLabel: "Parent",
          },
        });
        grantId = (
          await db.memberPortalGrant.create({
            data: {
              workspaceId: f.workspace.id,
              guardianId,
              userId: f.account.id,
              memberId: f.member.id,
              canBook: true,
              canSign: true,
              verifiedAt: now,
              verifiedByWorkspaceUserId: f.staff.id,
              verificationNote: "Fictional verified parent fixture",
            },
          })
        ).id;
      } else
        await db.member.update({
          where: { id: f.member.id },
          data: { status: "TRIAL" },
        });
      await db.workspaceWebsite.create({
        data: {
          workspaceId: f.workspace.id,
          slug: randomUUID(),
          draft: {},
          published: {},
          publishedAt: now,
        },
      });
      const enrollment = await db.publicEnrollment.create({
        data: {
          workspaceId: f.workspace.id,
          kind: "TRIAL",
          status: "VERIFIED",
          email: f.account.email,
          accessTokenHash: randomUUID(),
          verificationCodeHash: randomUUID(),
          verificationExpiresAt: new Date(+now + 3600_000),
          verifiedAt: now,
          createdAt: now,
          memberId: f.member.id,
          participant: {
            fullName: f.member.fullName,
            dateOfBirth: options.child ? "2020-01-01" : "2000-01-01",
            email: f.account.email,
            phone: "",
            guardianFullName: options.child ? "Fictional parent" : "",
            relationshipLabel: options.child ? "Parent" : "",
            ...(guardianId ? { guardianId } : {}),
            classTemplateId: f.template.id,
            scheduledForDate: date,
            offerId: "",
            termsFingerprint: "",
            accountUserId: f.account.id,
            payerMemberId,
          },
        },
      });
      const result = await completeVerifiedTrial({
        db,
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.account.id,
        now,
      });
      expect(result).toMatchObject({ status: "booked" });
      if (result.status !== "booked")
        throw new Error("The canonical trial fixture did not book.");
      const booking = await db.classBooking.findUniqueOrThrow({
        where: { id: result.bookingId },
      });
      const modern = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "TRIAL_CONFIRMATION",
        },
      });
      expect(modern).toMatchObject({
        status: "PENDING",
        attempts: 0,
        providerMessageId: null,
        classNoticeDeliveryStartedAt: null,
      });
      if (!options.keepModern)
        await db.notificationJob.delete({ where: { id: modern.id } });
      const legacy = await db.notificationJob.create({
        data: {
          workspaceId: f.workspace.id,
          templateKind: "ANNOUNCEMENT",
          dedupeKey: `verified-trial:${enrollment.id}:${booking.id}`,
          context: { kind: "CLASS_BOOKING", bookingId: booking.id },
          expiresAt: modern.expiresAt,
          recipientEmail: enrollment.email,
          subject: "Your trial booking is confirmed",
          body: `Your trial place is reserved. Sign in to review the class and any required forms: https://fictional-member.example.test/app/schedule?date=${date}. Complete the current forms before attending.`,
          status: "PENDING",
          nextAttemptAt: now,
          createdAt: now,
        },
      });
      expect(booking).toMatchObject({
        source: "PUBLIC_TRIAL",
        bookingType: "TRIAL",
        fundingRevision: 1,
      });
      return { ...f, enrollment, booking, modern, legacy, grantId };
    }
    type Historical = Awaited<ReturnType<typeof historical>>;
    const currentJob = (f: Historical) =>
      db.notificationJob.findUniqueOrThrow({ where: { id: f.legacy.id } });
    const adapter = () => ({
      send: vi.fn(async (_job: NotificationJobRecord) => {
        void _job;
        return {
          status: "sent" as const,
          providerMessageId: `fictional_legacy_${randomUUID()}`,
        };
      }),
    });
    const worker = (
      f: Fixture,
      transport: ReturnType<typeof adapter>,
      clock = now,
      guarded = false,
    ) =>
      processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        adapter: transport,
        now: clock,
        ...(guarded
          ? {
              shouldSend: (job: NotificationJobRecord) =>
                shouldDeliverNotification(job, db, clock),
            }
          : {}),
      });
    async function effects(f: Historical) {
      return {
        booking: await db.classBooking.findUniqueOrThrow({
          where: { id: f.booking.id },
        }),
        enrollment: await db.publicEnrollment.findUniqueOrThrow({
          where: { id: f.enrollment.id },
        }),
        membership: await db.memberMembership.findUniqueOrThrow({
          where: { id: f.membership.id },
        }),
        allocations: await db.membershipAllowanceAllocation.findMany({
          where: { workspaceId: f.workspace.id },
          orderBy: { id: "asc" },
        }),
        punches: await db.punchCardEntry.findMany({
          where: { workspaceId: f.workspace.id },
          orderBy: { id: "asc" },
        }),
        events: await db.workspaceDataEvent.findMany({
          where: { workspaceId: f.workspace.id },
          orderBy: { id: "asc" },
        }),
      };
    }
    async function unchangedLegacy(f: Historical) {
      const saved = await currentJob(f);
      expect(saved).toMatchObject({
        id: f.legacy.id,
        dedupeKey: f.legacy.dedupeKey,
        templateKind: "ANNOUNCEMENT",
        recipientEmail: f.legacy.recipientEmail,
        subject: f.legacy.subject,
        body: f.legacy.body,
        context: f.legacy.context,
        classNoticeDeliveryStartedAt: null,
      });
      return saved;
    }
    async function deny(f: Historical) {
      const before = await effects(f),
        transport = adapter();
      const result = await worker(f, transport);
      expect(transport.send).not.toHaveBeenCalled();
      expect(result.sentCount).toBe(0);
      expect((await unchangedLegacy(f)).status).toBe("CANCELLED");
      expect(await effects(f)).toEqual(before);
    }
    const cancel = (f: Historical) =>
      cancelAccessBackedBooking({
        db: db as never,
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: f.booking.id,
        timezone: "UTC",
        now,
      });
    async function newRequirement(f: Historical) {
      const doc = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional required trial waiver",
          formType: "WAIVER",
        },
      });
      const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
      const version = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: doc.id,
          versionNumber: 1,
          fileName: "fictional.pdf",
          mimeType: "application/pdf",
          fileData: bytes,
          fileSizeBytes: bytes.length,
          fileSha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: doc.id,
          requirementTarget: "TRIAL",
        },
      });
    }

    it.each(["direct", "maintenance-shaped predicate"] as const)(
      "%s existing outbox upgrades a never-attempted notice under the same job/key before its first fictional adapter call",
      async (mode) => {
        const f = await historical(),
          before = await effects(f),
          transport = adapter();
        const atAdapter: Array<Awaited<ReturnType<typeof currentJob>>> = [];
        transport.send.mockImplementation(
          async (job: NotificationJobRecord) => {
            atAdapter.push(
              await db.notificationJob.findUniqueOrThrow({
                where: { id: job.id },
              }),
            );
            return {
              status: "sent" as const,
              providerMessageId: "fictional_durable_legacy_receipt",
            };
          },
        );
        const result = await worker(f, transport, now, mode !== "direct");
        expect(result).toEqual({
          sentCount: 1,
          failedCount: 0,
          skippedCount: 0,
        });
        expect(transport.send).toHaveBeenCalledOnce();
        const sent = transport.send.mock.calls[0]![0];
        expect(sent.body).toBe(f.modern.body);
        expect(sent).toMatchObject({
          id: f.legacy.id,
          dedupeKey: f.legacy.dedupeKey,
          templateKind: "TRIAL_CONFIRMATION",
          attempts: 1,
          recipientEmail: f.account.email,
          classNoticeDeliveryStartedAt: now,
        });
        expect(atAdapter).toHaveLength(1);
        expect(atAdapter[0]).toMatchObject({
          body: sent.body,
          context: sent.context,
          classNoticeDeliveryStartedAt: now,
          dedupeKey: f.legacy.dedupeKey,
          status: "SENDING",
          attempts: 1,
        });
        expect(sent.body).toContain("Jan 7, 2030");
        expect(sent.body).toContain("18:00");
        expect(sent.body).toContain("19:00");
        expect(sent.body).toContain("UTC");
        expect(sent.body).toContain("123 Fictional Road");
        expect(sent.body).toContain("North mat");
        expect(sent.body).toContain("No outstanding required forms");
        expect(sent.body).toContain("Cancellation deadline:");
        expect(sent.body).not.toContain("PRIVATE_NOTE_NEVER_EMAIL");
        expect(await currentJob(f)).toMatchObject({
          id: f.legacy.id,
          dedupeKey: f.legacy.dedupeKey,
          body: sent.body,
          status: "SENT",
          attempts: 1,
          classNoticeDeliveryStartedAt: now,
          providerMessageId: expect.any(String),
        });
        expect(
          await db.notificationJob.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(1);
        expect(await effects(f)).toEqual(before);
        expect((await worker(f, transport)).sentCount).toBe(0);
        expect(transport.send).toHaveBeenCalledOnce();
      },
    );
    it("uses current participant/form details without altering historical acceptance or funds", async () => {
      const f = await historical();
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Corrected fictional trial participant" },
      });
      await newRequirement(f);
      const before = await effects(f),
        transport = adapter();
      expect((await worker(f, transport)).sentCount).toBe(1);
      expect(transport.send.mock.calls[0]![0].body).toContain(
        "Trial booking confirmed for Corrected fictional trial participant:",
      );
      expect(transport.send.mock.calls[0]![0].body).toContain(
        "1 required form needs completion before attendance.",
      );
      expect(await effects(f)).toEqual(before);
    });
    it("two real workers claim the historical identity once", async () => {
      const f = await historical(),
        transport = adapter();
      const results = await Promise.all([
        worker(f, transport),
        worker(f, transport),
      ]);
      expect(
        results.reduce((count, result) => count + result.sentCount, 0),
      ).toBe(1);
      expect(transport.send).toHaveBeenCalledOnce();
      expect(await currentJob(f)).toMatchObject({
        status: "SENT",
        attempts: 1,
        dedupeKey: f.legacy.dedupeKey,
      });
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it("an existing modern exact confirmation owns delivery and suppresses its old duplicate", async () => {
      const f = await historical({ keepModern: true }),
        transport = adapter();
      const result = await worker(f, transport);
      expect(result.sentCount).toBe(1);
      expect(transport.send).toHaveBeenCalledOnce();
      expect(transport.send.mock.calls[0]![0].id).toBe(f.modern.id);
      expect((await unchangedLegacy(f)).status).toBe("CANCELLED");
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(2);
    });

    const uncertainStates = [
      {
        label: "failed after an unknown old provider boundary",
        status: "FAILED",
        attempts: 1,
        providerMessageId: null,
      },
      {
        label: "abandoned old sending lease",
        status: "SENDING",
        attempts: 1,
        providerMessageId: null,
      },
      {
        label: "pending with prior lifetime attempt",
        status: "PENDING",
        attempts: 1,
        providerMessageId: null,
      },
      {
        label: "old provider receipt even with inconsistent zero attempts",
        status: "PENDING",
        attempts: 0,
        providerMessageId: "fictional_old_receipt",
      },
      {
        label:
          "failed zero-attempt history cannot prove an original pending job",
        status: "FAILED",
        attempts: 0,
        providerMessageId: null,
      },
      {
        label: "terminal failed history with NULL prior error",
        status: "FAILED",
        attempts: 1,
        providerMessageId: null,
      },
    ] as const;
    it.each(uncertainStates)(
      "$label remains original and review-only despite a NULL new marker",
      async (state) => {
        const f = await historical();
        await db.notificationJob.update({
          where: { id: f.legacy.id },
          data: {
            status: state.status,
            attempts: state.attempts,
            providerMessageId: state.providerMessageId,
            nextAttemptAt: state.label.startsWith("terminal")
              ? null
              : new Date(+now - 1),
          },
        });
        await db.member.update({
          where: { id: f.member.id },
          data: { fullName: "Later corrected participant" },
        });
        const transport = adapter(),
          before = await effects(f);
        await worker(f, transport, now, true);
        expect(transport.send).not.toHaveBeenCalled();
        const saved = await unchangedLegacy(f);
        expect(saved).toMatchObject({
          status: "FAILED",
          attempts: state.attempts,
          providerMessageId: state.providerMessageId,
          nextAttemptAt: null,
        });
        expect(saved.lastError).toContain("original provider request");
        expect(await shouldDeliverNotification(saved, db, now)).toBe(false);
        // Owner retry cannot reopen the old generic currentness bypass or allocate a fresh key.
        await expect(
          retryFailedNotification({
            db,
            workspaceId: f.workspace.id,
            actorUserId: f.owner.id,
            notificationJobId: saved.id,
            expectedUpdatedAt: saved.updatedAt,
            operationId: randomUUID(),
            reason: "Review fictional uncertain delivery",
            now,
          }),
        ).rejects.toThrow("needs a fresh message");
        expect(await effects(f)).toEqual(before);
        expect(
          await db.notificationJob.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(1);
        expect(await currentJob(f)).toEqual(saved);
      },
    );
    it("expired attempted history becomes review-only before generic NULL-marker expiry cancellation", async () => {
      const f = await historical();
      await db.notificationJob.update({
        where: { id: f.legacy.id },
        data: {
          status: "FAILED",
          attempts: 1,
          expiresAt: now,
          nextAttemptAt: now,
        },
      });
      const transport = adapter();
      await worker(f, transport);
      expect(transport.send).not.toHaveBeenCalled();
      const reviewed = await unchangedLegacy(f);
      expect(reviewed).toMatchObject({
        status: "FAILED",
        attempts: 1,
        nextAttemptAt: null,
      });
      await worker(f, transport);
      expect(await currentJob(f)).toEqual(reviewed);
      expect(transport.send).not.toHaveBeenCalled();
    });
    it("a genuine pre-adapter callback failure after conversion retains NULL marker and retries the same accurate identity", async () => {
      const f = await historical(),
        transport = adapter();
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            adapter: transport,
            now,
            shouldSend: async () => {
              throw new Error("Fictional failure before adapter");
            },
          })
        ).failedCount,
      ).toBe(1);
      expect(transport.send).not.toHaveBeenCalled();
      const failed = await currentJob(f);
      expect(failed).toMatchObject({
        templateKind: "TRIAL_CONFIRMATION",
        status: "FAILED",
        attempts: 1,
        classNoticeDeliveryStartedAt: null,
        dedupeKey: f.legacy.dedupeKey,
        body: f.modern.body,
      });
      expect(
        (await worker(f, transport, new Date(+now + 60_000))).sentCount,
      ).toBe(1);
      expect(transport.send.mock.calls[0]![0]).toMatchObject({
        id: f.legacy.id,
        dedupeKey: f.legacy.dedupeKey,
        body: f.modern.body,
        attempts: 2,
      });
    });
    it("final canonical boundary rejects cancellation committed by an optional pre-adapter callback", async () => {
      const f = await historical(),
        transport = adapter();
      const result = await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        adapter: transport,
        now,
        shouldSend: async () => {
          expect((await cancel(f)).status).toBe("cancelled");
          return true;
        },
      });
      expect(result.sentCount).toBe(0);
      expect(transport.send).not.toHaveBeenCalled();
      expect(await currentJob(f)).toMatchObject({
        id: f.legacy.id,
        dedupeKey: f.legacy.dedupeKey,
        status: "CANCELLED",
        classNoticeDeliveryStartedAt: null,
      });
    });

    const malformed = [
      "wrong enrollment suffix",
      "missing booking id",
      "non-string booking id",
      "missing trial policy",
      "foreign enrollment",
      "wrong account",
      "unverified enrollment",
      "incomplete enrollment",
      "changed enrollment booking",
      "changed class date",
      "stale recipient",
      "archived member",
      "changed service time",
    ] as const;
    it.each(malformed)(
      "%s fails closed through the real direct outbox",
      async (change) => {
        const f = await historical();
        const completed = await db.publicEnrollment.findUniqueOrThrow({
          where: { id: f.enrollment.id },
        });
        const participant = completed.participant as Prisma.JsonObject;
        if (change === "wrong enrollment suffix")
          await db.notificationJob.update({
            where: { id: f.legacy.id },
            data: { dedupeKey: `verified-trial:wrong:${f.booking.id}` },
          });
        if (change === "missing booking id")
          await db.notificationJob.update({
            where: { id: f.legacy.id },
            data: { context: { kind: "CLASS_BOOKING" } },
          });
        if (change === "non-string booking id")
          await db.notificationJob.update({
            where: { id: f.legacy.id },
            data: { context: { kind: "CLASS_BOOKING", bookingId: 42 } },
          });
        if (change === "missing trial policy")
          await db.classBooking.update({
            where: { id: f.booking.id },
            data: { acceptedPolicy: { oneTrialPerProgram: true } },
          });
        if (change === "foreign enrollment") {
          const other = await historical();
          await db.classBooking.update({
            where: { id: f.booking.id },
            data: {
              acceptedPolicy: {
                trialEnrollmentId: other.enrollment.id,
                trialProgramId: f.program.id,
                oneTrialPerProgram: true,
              },
            },
          });
          await db.notificationJob.update({
            where: { id: f.legacy.id },
            data: {
              dedupeKey: `verified-trial:${other.enrollment.id}:${f.booking.id}`,
            },
          });
        }
        if (change === "wrong account")
          await db.publicEnrollment.update({
            where: { id: f.enrollment.id },
            data: {
              participant: { ...participant, accountUserId: f.owner.id },
            },
          });
        if (change === "unverified enrollment")
          await db.publicEnrollment.update({
            where: { id: f.enrollment.id },
            data: { verifiedAt: null },
          });
        if (change === "incomplete enrollment")
          await db.publicEnrollment.update({
            where: { id: f.enrollment.id },
            data: { status: "VERIFIED" },
          });
        if (change === "changed enrollment booking")
          await db.publicEnrollment.update({
            where: { id: f.enrollment.id },
            data: {
              participant: {
                ...participant,
                classBookingId: "another-booking",
              },
            },
          });
        if (change === "changed class date")
          await db.publicEnrollment.update({
            where: { id: f.enrollment.id },
            data: {
              participant: { ...participant, scheduledForDate: "2030-01-14" },
            },
          });
        if (change === "stale recipient")
          await db.user.update({
            where: { id: f.account.id },
            data: { email: `${randomUUID()}@changed.example.test` },
          });
        if (change === "archived member")
          await db.member.update({
            where: { id: f.member.id },
            data: { archivedAt: now },
          });
        if (change === "changed service time")
          await db.classTemplate.update({
            where: { id: f.template.id },
            data: { startTimeMinutes: 1095 },
          });
        // Save the deliberately changed envelope as the immutable expectation for this denial.
        f.legacy = await currentJob(f);
        await deny(f);
      },
    );
    it("an actually cancelled original trial cannot be revived by its pending old notice", async () => {
      const f = await historical();
      expect((await cancel(f)).status).toBe("cancelled");
      await deny(f);
    });
    it("ordinary same-ID rebooking at revision2 cannot inherit an original revision1 trial notice", async () => {
      const f = await historical();
      expect((await cancel(f)).status).toBe("cancelled");
      const rebook = await f.book({ trial: true, source: "PUBLIC_TRIAL" });
      expect(rebook.status).toBe("restored");
      if (rebook.status === "error" || rebook.status === "payment_required")
        throw new Error("Rebook fixture did not restore.");
      expect(rebook.bookingId).toBe(f.booking.id);
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.booking.id },
          })
        ).fundingRevision,
      ).toBe(2);
      await deny(f);
    });
    it("a verified original booking guardian remains the current authorized service recipient", async () => {
      const f = await historical({ child: true }),
        transport = adapter();
      expect((await worker(f, transport)).sentCount).toBe(1);
      expect(transport.send.mock.calls[0]![0]).toMatchObject({
        id: f.legacy.id,
        recipientEmail: f.account.email,
        body: f.modern.body,
      });
    });
    it.each([
      "revoked booking grant",
      "removed family link",
      "payer-only grant",
    ] as const)(
      "%s cannot receive a child's historical booking notice",
      async (change) => {
        const f = await historical({ child: true });
        if (change === "revoked booking grant")
          await db.memberPortalGrant.update({
            where: { id: f.grantId! },
            data: { revokedAt: now },
          });
        if (change === "removed family link")
          await db.familyLink.deleteMany({
            where: { workspaceId: f.workspace.id, childMemberId: f.member.id },
          });
        if (change === "payer-only grant")
          await db.memberPortalGrant.update({
            where: { id: f.grantId! },
            data: { canBook: false, canSign: false, canPay: true },
          });
        await deny(f);
      },
    );
    it("a foreign workspace booking cannot satisfy a malformed legacy context", async () => {
      const f = await historical(),
        other = await historical();
      await db.notificationJob.update({
        where: { id: f.legacy.id },
        data: {
          context: { kind: "CLASS_BOOKING", bookingId: other.booking.id },
        },
      });
      f.legacy = await currentJob(f);
      await deny(f);
      expect((await currentJob(other)).status).toBe("PENDING");
    });
    it("pure legacy previews deny even the original partial transport projection without mutating it", async () => {
      const f = await historical(),
        before = await currentJob(f);
      const projection: NotificationJobRecord = {
        id: before.id,
        workspaceId: before.workspaceId,
        recipientEmail: before.recipientEmail,
        recipientName: before.recipientName,
        subject: before.subject,
        body: before.body,
        attempts: before.attempts,
        context: before.context,
      };
      expect(await shouldDeliverNotification(projection, db, now)).toBe(false);
      expect(await currentJob(f)).toEqual(before);
    });
    it.each([
      "NULL dedupe",
      "database NULL context",
      "JSON null context",
      "absent context kind",
    ] as const)(
      "ordinary expired FAILED announcement (%s) still follows generic expiry",
      async (variant) => {
        const f = await historical(),
          transport = adapter();
        const context =
          variant === "NULL dedupe"
            ? { kind: "CLASS_BOOKING", bookingId: f.booking.id }
            : variant === "database NULL context"
              ? Prisma.DbNull
              : variant === "JSON null context"
                ? Prisma.JsonNull
                : {};
        await db.notificationJob.update({
          where: { id: f.legacy.id },
          data: {
            dedupeKey:
              variant === "NULL dedupe"
                ? null
                : "verified-trial:unrelated-null-context",
            context,
            status: "FAILED",
            attempts: 1,
            nextAttemptAt: null,
            lastError: null,
            expiresAt: now,
          },
        });
        expect((await worker(f, transport)).sentCount).toBe(0);
        expect(transport.send).not.toHaveBeenCalled();
        expect(await currentJob(f)).toMatchObject({
          status: "CANCELLED",
          nextAttemptAt: null,
          classNoticeDeliveryStartedAt: null,
          body: f.legacy.body,
        });
      },
    );
    it("a second worker cannot retire a live never-attempted claim waiting for canonical schedule scope", async () => {
      const f = await historical(),
        transport = adapter();
      let release!: () => void, ready!: (pid: number) => void;
      const canCommit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<number>((resolve) => {
        ready = resolve;
      });
      const blocker = db
        .$transaction(async (tx) => {
          await lockClassSchedule(tx, f.workspace.id);
          const rows = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          ready(rows[0]!.pid);
          await canCommit;
        })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      let primary: unknown;
      let first:
        | Promise<
            | { ok: true; value: Awaited<ReturnType<typeof worker>> }
            | { ok: false; error: unknown }
          >
        | undefined;
      try {
        const initial = await Promise.race([
          locked.then((pid) => ({ kind: "ready" as const, pid })),
          blocker.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (initial.kind === "finished")
          throw initial.result.ok
            ? new Error("Schedule blocker completed early")
            : initial.result.error;
        first = worker(f, transport).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        let observed: Array<{
          pid: number;
          blockedBy: number[];
          query: string;
        }> = [];
        await expect
          .poll(
            async () => {
              const claimed = await currentJob(f);
              observed =
                await db.$queryRaw`SELECT DISTINCT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE NOT l.granted AND ${initial.pid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype='advisory' AND a.query LIKE '%pg_advisory_xact_lock%'`;
              return (
                claimed.status === "SENDING" &&
                claimed.attempts === 1 &&
                observed.length > 0
              );
            },
            { timeout: 2000 },
          )
          .toBe(true);
        console.info(
          "LEGACY_TRIAL_OBSERVED_LIVE_CLAIM_WAIT",
          JSON.stringify({ blockerPid: initial.pid, observed }),
        );
        expect((await worker(f, transport)).sentCount).toBe(0);
        expect(await currentJob(f)).toMatchObject({
          status: "SENDING",
          attempts: 1,
          classNoticeDeliveryStartedAt: null,
        });
      } catch (error) {
        primary = error;
      } finally {
        release();
        const completed = await blocker;
        if (first) await first;
        if (!completed.ok) {
          if (primary)
            console.error(
              "Supplemental legacy schedule blocker failure retained",
              {
                errorType:
                  completed.error instanceof Error
                    ? completed.error.name
                    : typeof completed.error,
              },
            );
          else primary = completed.error;
        }
      }
      if (primary) throw primary;
      const completed = await first!;
      if (!completed.ok) throw completed.error;
      expect(completed.value.sentCount).toBe(1);
      expect(transport.send).toHaveBeenCalledOnce();
      expect(await currentJob(f)).toMatchObject({
        id: f.legacy.id,
        dedupeKey: f.legacy.dedupeKey,
        status: "SENT",
        attempts: 1,
        body: f.modern.body,
        classNoticeDeliveryStartedAt: now,
      });
    });
    async function enrollmentWait(
      f: Historical,
      change: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      let release!: () => void, ready!: (pid: number) => void;
      const canCommit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<number>((resolve) => {
        ready = resolve;
      });
      const blocker = db
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM public_enrollments WHERE id=${f.enrollment.id} FOR UPDATE`;
          const rows = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          ready(rows[0]!.pid);
          await canCommit;
          await change(tx);
        })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      let primary: unknown;
      let outcome:
        | Promise<
            | {
                ok: true;
                value: Awaited<ReturnType<typeof processNotificationOutbox>>;
              }
            | { ok: false; error: unknown }
          >
        | undefined;
      const transport = adapter();
      try {
        const initial = await Promise.race([
          locked.then((pid) => ({ kind: "ready" as const, pid })),
          blocker.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (initial.kind === "finished")
          throw initial.result.ok
            ? new Error("Blocker completed before its lock")
            : initial.result.error;
        outcome = processNotificationOutbox({
          db,
          workspaceId: f.workspace.id,
          adapter: transport,
        }).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        let observed: Array<{
          pid: number;
          blockedBy: number[];
          query: string;
        }> = [];
        await expect
          .poll(
            async () => {
              observed =
                await db.$queryRaw`SELECT DISTINCT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE NOT l.granted AND ${initial.pid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype IN ('transactionid','tuple') AND a.query LIKE '%FROM public_enrollments%' AND a.query LIKE '%FOR SHARE%'`;
              return observed.length > 0;
            },
            { timeout: 2000 },
          )
          .toBe(true);
        console.info(
          "LEGACY_TRIAL_OBSERVED_ENROLLMENT_WAIT",
          JSON.stringify({ blockerPid: initial.pid, observed }),
        );
      } catch (error) {
        primary = error;
      } finally {
        release();
        const completed = await blocker;
        if (outcome) await outcome;
        if (!completed.ok) {
          if (primary)
            console.error(
              "Supplemental legacy enrollment blocker failure retained",
              {
                errorType:
                  completed.error instanceof Error
                    ? completed.error.name
                    : typeof completed.error,
              },
            );
          else primary = completed.error;
        }
      }
      if (primary) throw primary;
      const result = await outcome!;
      if (!result.ok) throw result.error;
      return { result: result.value, transport };
    }
    it.each(["binding revocation", "exact class-start expiry"] as const)(
      "an observed enrollment-row wait rechecks %s before any provider boundary",
      async (change) => {
        const f = await historical();
        const bookingBefore = await db.classBooking.findUniqueOrThrow({
          where: { id: f.booking.id },
        });
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2030-01-07T17:59:59Z"));
        try {
          const { result, transport } = await enrollmentWait(f, async (tx) => {
            if (change === "binding revocation")
              await tx.publicEnrollment.update({
                where: { id: f.enrollment.id },
                data: { verifiedAt: null },
              });
            else vi.setSystemTime(new Date("2030-01-07T18:00:00Z"));
          });
          expect(result.sentCount).toBe(0);
          expect(transport.send).not.toHaveBeenCalled();
          expect(await currentJob(f)).toMatchObject({
            status: "CANCELLED",
            classNoticeDeliveryStartedAt: null,
            dedupeKey: f.legacy.dedupeKey,
            body: f.legacy.body,
            context: f.legacy.context,
          });
          expect(
            await db.classBooking.findUniqueOrThrow({
              where: { id: f.booking.id },
            }),
          ).toEqual(bookingBefore);
        } finally {
          vi.useRealTimers();
        }
      },
    );
    it.each([
      {
        label: "waitlist",
        templateKind: "BOOKING_CONFIRMATION",
        key: "waitlist:fictional-entry",
      },
      {
        label: "owner late",
        templateKind: "BOOKING_CONFIRMATION",
        key: "owner-late-booking:fictional-receipt",
      },
      {
        label: "unrelated announcement",
        templateKind: "ANNOUNCEMENT",
        key: "announcement:fictional",
      },
      {
        label: "different template despite similar prefix",
        templateKind: "BOOKING_CONFIRMATION",
        key: "verified-trial:unrelated",
      },
    ] as const)(
      "$label legacy producer identity stays outside the narrow upgrade",
      async (control) => {
        const f = await historical();
        await db.notificationJob.update({
          where: { id: f.legacy.id },
          data: { templateKind: control.templateKind, dedupeKey: control.key },
        });
        const before = await currentJob(f),
          transport = adapter();
        expect(await shouldDeliverNotification(before, db, now)).toBe(true);
        expect((await worker(f, transport, now, true)).sentCount).toBe(1);
        expect(transport.send.mock.calls[0]![0]).toMatchObject({
          id: before.id,
          context: before.context,
          body: before.body,
          classNoticeDeliveryStartedAt: null,
        });
        expect(await currentJob(f)).toMatchObject({
          templateKind: before.templateKind,
          dedupeKey: before.dedupeKey,
          context: before.context,
          body: before.body,
          classNoticeDeliveryStartedAt: null,
        });
      },
    );
  },
);
