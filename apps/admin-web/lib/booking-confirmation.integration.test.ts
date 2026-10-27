import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelAccessBackedBooking,
  moveAccessBackedBooking,
  finalizeDropInBookingPayment,
  shouldDeliverNotification,
  completeVerifiedTrial,
  snapshotPunchCardTerms,
  resolveBookingAccessForProgram,
  buildDirectBookingFundingReview,
  createReviewedDirectClassBooking,
} from "@flowstate/db";
import {
  noticeFixtures,
  testUrl,
} from "../tests/class-booking-notification-fixture";
(testUrl ? describe : describe.skip)(
  "normal booking confirmation atomicity",
  () => {
    const { db, fixture, cleanup, disconnect, now, date, users } = noticeFixtures();
    afterEach(cleanup);
    afterAll(disconnect);
    const notices = (workspaceId: string) =>
      db.notificationJob.findMany({
        where: { workspaceId, templateKind: "BOOKING_CONFIRMATION" },
      });
    it("atomically enqueues one accurate normal confirmation through the existing booking API", async () => {
      const f = await fixture(),
        result = await f.book();
      expect(result.status).toBe("created");
      if (result.status === "error") throw new Error(result.message);
      const jobs = await notices(f.workspace.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        recipientEmail: f.account.email.toLowerCase(),
        status: "PENDING",
        providerMessageId: null,
        context: {
          kind: "CLASS_SERVICE_NOTICE",
          notice: "CONFIRMATION",
          bookingId: result.bookingId,
          fundingRevision: 1,
        },
      });
      for (const detail of [
        "Evening technique",
        new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date("2030-01-07T18:00:00Z")),
        "18:00",
        "19:00",
        "UTC",
        "123 Fictional Road",
        "North mat",
        "16:00",
        "No outstanding required forms",
        "cancel this exact booking",
      ])
        expect(jobs[0]!.body).toContain(detail);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    it("duplicate claims retain one seat, original funding revision and one confirmation", async () => {
      const f = await fixture(),
        first = await f.book(),
        duplicate = await f.book();
      expect(first.status).toBe("created");
      expect(duplicate).toMatchObject({ status: "error", code: "DUPLICATE" });
      expect(await notices(f.workspace.id)).toHaveLength(1);
      expect(
        await db.classBooking.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(1);
      expect(
        (
          await db.classBooking.findFirstOrThrow({
            where: { workspaceId: f.workspace.id },
          })
        ).fundingRevision,
      ).toBe(1);
    });
    it("outbox failure rolls back the booking, scheduling receipt and funding allocation", async () => {
      const f = await fixture();
      const wrapped = {
        $transaction: (run: (value: unknown) => unknown) =>
          db.$transaction(async (tx) => {
            const notificationJob = new Proxy(tx.notificationJob, {
              get(target, key) {
                if (key === "createMany")
                  return vi
                    .fn()
                    .mockRejectedValue(new Error("Fictional enqueue fault"));
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return run(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "notificationJob") return notificationJob;
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              }),
            );
          }),
      };
      await expect(f.book({ db: wrapped as never })).rejects.toThrow(
        "Fictional enqueue fault",
      );
      expect(
        await db.classBooking.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      expect(await notices(f.workspace.id)).toHaveLength(0);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspace.id,
            kind: "SCHEDULING_POLICY_APPLIED",
          },
        }),
      ).toBe(0);
    });
    it("cancel and rebook reuses booking identity with a new revision and suppresses the old notice", async () => {
      const f = await fixture(),
        first = await f.book();
      if (first.status === "error") throw new Error(first.message);
      const old = (await notices(f.workspace.id))[0]!;
      await cancelAccessBackedBooking({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: first.bookingId,
        timezone: "UTC",
        db: db as never,
        now,
      });
      expect(await shouldDeliverNotification(old, db, now)).toBe(false);
      const again = await f.book();
      expect(again).toMatchObject({
        status: "restored",
        bookingId: first.bookingId,
      });
      const jobs = await notices(f.workspace.id);
      expect(jobs).toHaveLength(2);
      expect(await shouldDeliverNotification(old, db, now)).toBe(false);
      const current = jobs.find(
        (job) =>
          (job.context as { fundingRevision?: number }).fundingRevision === 2,
      )!;
      expect(await shouldDeliverNotification(current, db, now)).toBe(true);
    });
    it("successful move confirms only the committed destination and suppresses the old place", async () => {
      const f = await fixture(),
        first = await f.book();
      if (first.status === "error") throw new Error(first.message);
      const old = (await notices(f.workspace.id))[0]!;
      const moved = await moveAccessBackedBooking({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: first.bookingId,
        targetClassTemplateId: f.template.id,
        targetDate: "2030-01-14",
        timezone: "UTC",
        db: db as never,
        now,
      });
      expect(moved.status).toBe("moved");
      expect(await shouldDeliverNotification(old, db, now)).toBe(false);
      expect(await notices(f.workspace.id)).toHaveLength(2);
      const latest = (await notices(f.workspace.id)).find(
        (job) =>
          (job.context as { bookingId?: string }).bookingId !== first.bookingId,
      )!;
      expect(latest.body).toContain("Jan 14, 2030");
      expect(await shouldDeliverNotification(latest, db, now)).toBe(true);
    });
    it("pending paid drop-in emits no confirmation until verified settlement and replay emits none", async () => {
      const f = await fixture();
      await db.memberMembership.update({
        where: { id: f.membership.id },
        data: { status: "ENDED" },
      });
      await db.dropInProduct.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional drop-in",
          priceCents: 2000,
          currency: "cad",
          restrictionMode: "GENERAL",
        },
      });
      const pending = await f.book({ allowDropIn: true });
      expect(pending.status).toBe("payment_required");
      if (pending.status !== "payment_required")
        throw new Error("Expected paid hold");
      expect(await notices(f.workspace.id)).toHaveLength(0);
      await db.classBooking.update({
        where: { id: pending.bookingId },
        data: { dropInCheckoutSessionId: "cs_fictional_confirmation" },
      });
      const payment = {
        workspaceId: f.workspace.id,
        bookingId: pending.bookingId,
        checkoutSessionId: "cs_fictional_confirmation",
        amountCents: 2000,
        currency: "CAD",
        paymentIntentId: "pi_fictional_confirmation",
        db: db as never,
        now,
      };
      expect(await finalizeDropInBookingPayment(payment)).toBe("booked");
      expect(await finalizeDropInBookingPayment(payment)).toBe(
        "already_booked",
      );
      expect(await notices(f.workspace.id)).toHaveLength(1);
    });
    it("dated time changes invalidate a queued normal confirmation without changing its business action", async () => {
      const f = await fixture();
      await f.book();
      const old = (await notices(f.workspace.id))[0]!;
      await db.classInstance.create({
        data: {
          workspaceId: f.workspace.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date(date),
          title: "Changed class",
          programId: f.program.id,
          roomId: f.room.id,
          startTimeMinutes: 1200,
          endTimeMinutes: 1260,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
          status: "ACTIVE",
          isScheduleOverride: true,
        },
      });
      expect(await shouldDeliverNotification(old, db, now)).toBe(false);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    it("ordinary paid-pack booking confirms the actual held unit once", async () => {
      const f = await fixture();
      await db.memberMembership.update({
        where: { id: f.membership.id },
        data: { status: "ENDED" },
      });
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional five-class pack",
          punchesIncluded: 5,
          priceCents: 6000,
          currency: "cad",
        },
      });
      const pack = await db.memberPunchCard.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          punchCardProductId: product.id,
          originalPunches: 5,
          remainingPunches: 5,
          purchasePriceCents: 6000,
          purchaseCurrency: "cad",
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(product)),
          ),
        },
      });
      expect(await f.book()).toMatchObject({
        status: "created",
        bookingType: "PUNCH_CARD",
      });
      expect(await notices(f.workspace.id)).toHaveLength(1);
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
          .remainingPunches,
      ).toBe(4);
    });
    it("reviewed member command uses its actual current session and retains one confirmation on duplicate claim", async () => {
      const f = await fixture(),
        session = await db.authSession.create({
          data: {
            userId: f.account.id,
            tokenHash: randomUUID(),
            expiresAt: new Date("2031-01-01"),
          },
        });
      const access = await resolveBookingAccessForProgram({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        programId: f.program.id,
        scheduledForDate: date,
        occurrenceStartsAt: new Date(`${date}T18:00:00Z`),
        now,
        allowDropIn: false,
        includeDirectBookingFunding: true,
        db: db as never,
      });
      if (!access.directBookingFunding)
        throw Error("Fictional reviewed funding unavailable");
      const reviewedFunding = buildDirectBookingFundingReview({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        classTemplateId: f.template.id,
        scheduledForDate: date,
        occurrence: {
          programId: f.program.id,
          startsAt: `${date}T18:00:00.000Z`,
          endsAt: `${date}T19:00:00.000Z`,
          timezone: "UTC",
          cancellationCutoffMinutes: 120,
        },
        funding: access.directBookingFunding.funding,
      });
      const command = {
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        classTemplateId: f.template.id,
        scheduledForDate: date,
        timezone: "UTC",
        actor: { userId: f.account.id, sessionId: session.id },
        authorizationClock: () => now,
        reviewedFunding,
        allowDropIn: false,
        db: db as never,
        now,
      };
      expect((await createReviewedDirectClassBooking(command)).status).toBe(
        "created",
      );
      expect((await createReviewedDirectClassBooking(command)).status).toBe(
        "error",
      );
      expect(await notices(f.workspace.id)).toHaveLength(1);
    });
    async function trial(
      f: Awaited<ReturnType<typeof fixture>>,
      actorUserId: string,
      email: string,
      guardianId?: string,
    ) {
      await db.workspaceWebsite.create({
        data: {
          workspaceId: f.workspace.id,
          slug: randomUUID(),
          draft: {},
          published: {},
          publishedAt: now,
        },
      });
      const payer = await db.member.findFirstOrThrow({ where: { workspaceId: f.workspace.id, userId: actorUserId } });
      return db.publicEnrollment.create({
        data: {
          workspaceId: f.workspace.id,
          kind: "TRIAL",
          email,
          accessTokenHash: randomUUID(),
          verificationCodeHash: randomUUID(),
          verificationExpiresAt: new Date("2030-01-02"),
          verifiedAt: now,
          createdAt: now,
          status: "VERIFIED",
          memberId: f.member.id,
          participant: {
            fullName: f.member.fullName,
            dateOfBirth: guardianId ? "2015-01-01" : "2000-01-01",
            email,
            phone: "",
            guardianFullName: guardianId ? "Fictional parent" : "",
            relationshipLabel: guardianId ? "Parent" : "",
            classTemplateId: f.template.id,
            scheduledForDate: date,
            offerId: "",
            termsFingerprint: "",
            accountUserId: actorUserId,
            payerMemberId: payer.id,
            ...(guardianId ? { guardianId } : {}),
          },
        },
      });
    }
    it("actual verified adult trial confirmation includes dated details and recovery replay creates no duplicate", async () => {
      const f = await fixture(),
        enrollment = await trial(f, f.account.id, f.account.email);
      const args = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.account.id,
        portalBaseUrl: "https://members.example.test",
        db,
        now,
      };
      expect((await completeVerifiedTrial(args)).status).toBe("booked");
      expect((await completeVerifiedTrial(args)).status).toBe("already_booked");
      const jobs = await db.notificationJob.findMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "TRIAL_CONFIRMATION",
        },
      });
      expect(jobs).toHaveLength(1);
      for (const detail of [
        "Evening technique",
        "18:00",
        "North mat",
        "123 Fictional Road",
        "No outstanding required forms",
        "https://members.example.test/app/schedule?date=2030-01-07",
      ])
        expect(jobs[0]!.body).toContain(detail);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it("actual verified child trial sends only to its current verified booking guardian", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { userId: null, dateOfBirth: new Date("2015-01-01") },
      });
      const parent = await db.user.create({
        data: {
          email: `${randomUUID()}@booking-notice.example.test`,
          fullName: "Fictional parent",
          workspaceUsers: {
            create: {
              workspaceId: f.workspace.id,
              role: "CUSTOMER",
              isActive: true,
            },
          },
          member: {
            create: {
              workspaceId: f.workspace.id,
              fullName: "Fictional parent",
              dateOfBirth: new Date("1990-01-01"),
            },
          },
        },
      });
      users.push(parent.id);
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional parent",
          email: parent.email,
        },
      });
      await db.familyLink.create({
        data: {
          workspaceId: f.workspace.id,
          guardianId: guardian.id,
          childMemberId: f.member.id,
        },
      });
      await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: parent.id,
          memberId: f.member.id,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: f.staff.id,
          verificationNote: "Fictional guardian proof",
          canBook: true,
          canSign: true,
        },
      });
      const enrollment = await trial(f, parent.id, parent.email, guardian.id),
        result = await completeVerifiedTrial({
          workspaceId: f.workspace.id,
          enrollmentId: enrollment.id,
          actorUserId: parent.id,
          db,
          now,
        });
      expect(result.status).toBe("booked");
      const jobs = await db.notificationJob.findMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "TRIAL_CONFIRMATION",
        },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.recipientEmail).toBe(parent.email.toLowerCase());
      expect(jobs[0]!.body).toContain(f.member.fullName);
      expect(jobs[0]!.body).toContain("18:00");
      expect(jobs[0]!.body).toContain("North mat");
    });
  },
);
