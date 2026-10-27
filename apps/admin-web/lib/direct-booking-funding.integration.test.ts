import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  buildDirectBookingFundingReview,
  createAccessBackedBooking,
  createReviewedDirectClassBooking,
  lockClassSchedule,
  resolveBookingAccessForProgram,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  type DirectBookingFundingReview,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";

const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
)
  throw new Error(
    "Direct funding tests require a dedicated loopback test database.",
  );
(url ? describe : describe.skip)(
  "exact reviewed direct booking funding in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      workspaces: string[] = [], users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    async function fixture() {
      const actorUserId = `funding-actor-${randomUUID()}`, ownerUserId = `funding-owner-${randomUUID()}`;
      users.push(actorUserId, ownerUserId);
      await db.user.createMany({ data: [actorUserId, ownerUserId].map(id => ({ id, email: `${id}@example.test` })) });
      const workspace = await db.workspace.create({
        data: {
          name: `Fictional funding review ${randomUUID()}`,
          status: "ACTIVE",
          workspaceUsers: { create: [{ userId: actorUserId, role: "CUSTOMER" }, { userId: ownerUserId, role: "OWNER" }] },
          migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Fictional complete", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: ownerUserId, operationallyReadyAt: now, operationallyReadyByUserId: ownerUserId } },
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Mat", capacity: 10 } },
            },
          },
        },
        include: { location: { include: { rooms: true } } },
      });
      workspaces.push(workspace.id);
      const workspaceId = workspace.id;
      const session = await db.authSession.create({ data: { userId: actorUserId, tokenHash: randomUUID(), expiresAt: new Date("2035-01-01Z") } });
      const actor = { userId: actorUserId, sessionId: session.id };
      await createFixtureClassSchedulingPolicy(db, workspaceId);
      const member = await db.member.create({
        data: {
          workspaceId,
          userId: actorUserId,
          fullName: "Fictional reviewed participant",
          status: "ACTIVE",
          dateOfBirth: new Date("1990-01-01Z"),
        },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Training" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId,
          programId: program.id,
          roomId: workspace.location!.rooms[0]!.id,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 120,
        },
      });
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Reviewed membership",
          monthlyPriceCents: 10000,
          currency: "cad",
          weeklyClassLimit: 3,
          monthlyClassLimit: 8,
        },
      });
      const membership = await db.memberMembership.create({
        data: {
          workspaceId,
          memberId: member.id,
          membershipPlanId: plan.id,
          startedAt: new Date("2029-12-01Z"),
          allowanceTimezone: "UTC",
          allowanceAnchorDate: new Date("2030-01-01Z"),
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(plan, now)),
          ),
        },
      });
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId,
          name: "Reviewed three-class pack",
          punchesIncluded: 3,
          priceCents: 3000,
          currency: "cad",
        },
      });
      const pack = await db.memberPunchCard.create({
        data: {
          workspaceId,
          memberId: member.id,
          punchCardProductId: product.id,
          originalPunches: 3,
          remainingPunches: 3,
          purchasePriceCents: 3000,
          purchaseCurrency: "cad",
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(product, now)),
          ),
        },
      });
      const hold = async (
        targetKind = "MEMBERSHIP",
        targetId = membership.id,
      ) => {
        const operation = await db.financialOperation.create({
          data: {
            workspaceId,
            operationKey: randomUUID(),
            requestHash: "fictional-review-hold",
            kind: "REFUND",
            providerIdempotencyKey: randomUUID(),
            payload: {},
          },
        });
        return db.financialEntitlementHold.create({
          data: {
            workspaceId,
            targetKind,
            targetId,
            operationId: operation.id,
          },
        });
      };
      const preview = async (date = "2030-01-07") => {
        const access = await resolveBookingAccessForProgram({
          workspaceId,
          memberId: member.id,
          programId: program.id,
          scheduledForDate: date,
          occurrenceStartsAt: new Date(`${date}T18:00:00Z`),
          now,
          allowDropIn: true,
          includeDirectBookingFunding: true,
          db: db as never,
        });
        if (!access.directBookingFunding)
          throw new Error(`Fictional source unavailable: ${access.type}`);
        return buildDirectBookingFundingReview({
          workspaceId,
          memberId: member.id,
          classTemplateId: template.id,
          scheduledForDate: date,
          occurrence: {
            programId: program.id,
            startsAt: `${date}T18:00:00.000Z`,
            endsAt: `${date}T19:00:00.000Z`,
            timezone: "UTC",
            cancellationCutoffMinutes: 120,
          },
          funding: access.directBookingFunding.funding,
        });
      };
      const book = (
        reviewedFunding: DirectBookingFundingReview,
        extra: {
          memberId?: string;
          scheduledForDate?: string;
          allowDropIn?: boolean;
        } = {},
      ) =>
        createReviewedDirectClassBooking({
          workspaceId,
          actor,
          memberId: member.id,
          classTemplateId: template.id,
          scheduledForDate: "2030-01-07",
          timezone: "UTC",
          reviewedFunding,
          db: db as never,
          now,
          ...extra,
        });
      const state = async () => ({
        bookings: await db.classBooking.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            memberPunchCardId: true,
            fundingMembershipId: true,
            consumedPunchCount: true,
            pendingPaymentExpiresAt: true,
          },
        }),
        cards: await db.memberPunchCard.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: { id: true, remainingPunches: true, status: true },
        }),
        allocations: await db.membershipAllowanceAllocation.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: { id: true, state: true, bookingId: true },
        }),
        entries: await db.punchCardEntry.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: { id: true, delta: true, operationKey: true },
        }),
        queue: await db.waitlistEntry.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            lastSkippedAt: true,
            promotedAt: true,
            promotedBookingId: true,
          },
        }),
        holds: await db.financialEntitlementHold.findMany({
          where: { workspaceId },
          orderBy: { id: "asc" },
          select: { id: true, activeSlot: true },
        }),
        financialOperations: await db.financialOperation.count({
          where: { workspaceId },
        }),
        payments: await db.payment.count({ where: { workspaceId } }),
        events: await db.workspaceDataEvent.count({ where: { workspaceId } }),
        notifications: await db.notificationJob.count({
          where: { workspaceId },
        }),
      });
      return {
        workspaceId,
        member,
        program,
        template,
        plan,
        membership,
        product,
        pack,
        hold,
        preview,
        book,
        state,
      };
    }
    afterAll(async () => {
      for (const workspaceId of workspaces)
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))`;
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { isolationLevel: "Serializable", timeout: 120000 },
        );
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }, 120000);
    it("rejects a membership-to-pack change before cleanup, FIFO, seat or financial writes", async () => {
      const f = await fixture(),
        review = await f.preview();
      expect(review.funding.kind).toBe("MEMBERSHIP");
      await f.hold();
      const pending = await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          fullName: "Fictional expired payer",
          status: "ACTIVE",
        },
      });
      await db.classBooking.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: pending.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date("2030-01-07Z"),
          bookingType: "DROP_IN",
          status: "PENDING_PAYMENT",
          pendingPaymentExpiresAt: new Date(+now - 1000),
        },
      });
      const queued = await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          fullName: "Fictional queue",
          status: "ACTIVE",
        },
      });
      await db.waitlistEntry.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: queued.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date("2030-01-07Z"),
        },
      });
      const before = await f.state();
      expect(await f.book(review)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await f.state()).toEqual(before);
      const fresh = await f.preview();
      expect(fresh.funding).toMatchObject({
        kind: "PUNCH_CARD",
        id: f.pack.id,
        units: 1,
      });
      expect((await f.book(fresh)).status).toBe("created");
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(2);
      const after = await f.state();
      expect((await f.book(fresh)).status).toBe("error");
      expect(await f.state()).toEqual(after);
    });
    it("rejects missing and cross-person reviews without a fallback claim", async () => {
      const f = await fixture(),
        review = await f.preview(),
        before = await f.state();
      expect(await f.book(undefined as never)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(
        await f.book(review, { memberId: "fictional-foreign-person" }),
      ).toMatchObject({ status: "error", code: "REVIEW_REQUIRED" });
      expect(await f.state()).toEqual(before);
      const other = await fixture(),
        otherBefore = await other.state();
      expect(await other.book(review)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await other.state()).toEqual(otherBefore);
    });
    it("rejects a malformed foreign catalog relationship even when discovery supplied a current-looking review", async () => {
      const f = await fixture(),
        other = await fixture();
      const untouched = await other.state();
      try {
        await db.memberMembership.update({
          where: { id: f.membership.id },
          data: { membershipPlanId: other.plan.id },
        });
        const membershipReview = await f.preview(),
          beforeMembership = await f.state();
        expect(await f.book(membershipReview)).toMatchObject({
          status: "error",
          code: "REVIEW_REQUIRED",
        });
        expect(await f.state()).toEqual(beforeMembership);
        await db.memberMembership.update({
          where: { id: f.membership.id },
          data: { membershipPlanId: f.plan.id },
        });
        await f.hold();
        await db.memberPunchCard.update({
          where: { id: f.pack.id },
          data: { punchCardProductId: other.product.id },
        });
        const packReview = await f.preview(),
          beforePack = await f.state();
        expect(await f.book(packReview)).toMatchObject({
          status: "error",
          code: "REVIEW_REQUIRED",
        });
        expect(await f.state()).toEqual(beforePack);
        expect(await other.state()).toEqual(untouched);
      } finally {
        // These reversible draft pointers are restored before reviewed retention. Never bypass its cross-tenant checks.
        await db.memberMembership.update({
          where: { id: f.membership.id },
          data: { membershipPlanId: f.plan.id },
        });
        await db.memberPunchCard.update({
          where: { id: f.pack.id },
          data: { punchCardProductId: f.product.id },
        });
      }
    });
    it("allows ordinary balance churn against the same eligible exact pack", async () => {
      const f = await fixture();
      await f.hold();
      const first = await f.preview(),
        second = await f.preview("2030-01-14");
      expect((await f.book(first)).status).toBe("created");
      expect(
        (await f.book(second, { scheduledForDate: "2030-01-14" })).status,
      ).toBe("created");
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
    });
    it("keeps the same reviewed contract valid after unrelated seat and catalog-name churn", async () => {
      const f = await fixture(),
        review = await f.preview();
      const other = await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          fullName: "Fictional other attendee",
          status: "ACTIVE",
        },
      });
      await db.classBooking.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: other.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date("2030-01-07Z"),
          status: "BOOKED",
        },
      });
      await db.membershipPlan.update({
        where: { id: f.plan.id },
        data: {
          name: "Renamed unchanged accepted contract",
          monthlyPriceCents: 20000,
        },
      });
      expect((await f.book(review)).status).toBe("created");
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspaceId, status: "BOOKED" },
        }),
      ).toBe(2);
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(3);
    });
    it("honors the reviewed pack when membership later becomes independently eligible", async () => {
      const f = await fixture(),
        hold = await f.hold(),
        review = await f.preview();
      await db.financialEntitlementHold.update({
        where: { id: hold.id },
        data: { activeSlot: null, releasedAt: now },
      });
      expect((await f.preview()).funding.kind).toBe("MEMBERSHIP");
      expect((await f.book(review)).status).toBe("created");
      expect(
        await db.classBooking.findFirstOrThrow({
          where: { workspaceId: f.workspaceId },
        }),
      ).toMatchObject({
        bookingType: "PUNCH_CARD",
        memberPunchCardId: f.pack.id,
        fundingMembershipId: null,
      });
    });
    it("never replaces a held reviewed pack with another eligible pack", async () => {
      const f = await fixture();
      await f.hold();
      const review = await f.preview();
      await f.hold("PUNCH_CARD", f.pack.id);
      await db.memberPunchCard.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: f.member.id,
          punchCardProductId: f.product.id,
          originalPunches: 3,
          remainingPunches: 3,
          purchasePriceCents: 3000,
          purchaseCurrency: "cad",
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(f.product, now)),
          ),
        },
      });
      expect((await f.preview()).funding.id).not.toBe(f.pack.id);
      const before = await f.state();
      expect(await f.book(review)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await f.state()).toEqual(before);
    });
    it("rejects changed accepted commercial terms without creating a debit", async () => {
      const f = await fixture();
      await f.hold();
      const review = await f.preview();
      await db.memberPunchCard.update({
        where: { id: f.pack.id },
        data: {
          acceptedTerms: JSON.parse(
            JSON.stringify(
              snapshotPunchCardTerms({ ...f.product, priceCents: 4000 }, now),
            ),
          ),
        },
      });
      const before = await f.state();
      expect(await f.book(review)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await f.state()).toEqual(before);
    });
    it("rejects changed drop-in price before a pending booking or checkout operation exists", async () => {
      const f = await fixture();
      await f.hold();
      await f.hold("PUNCH_CARD", f.pack.id);
      const product = await db.dropInProduct.create({
        data: {
          workspaceId: f.workspaceId,
          name: "Fictional reviewed drop-in",
          priceCents: 2500,
          currency: "cad",
        },
      });
      const review = await f.preview();
      expect(review.funding).toMatchObject({
        kind: "DROP_IN",
        amountCents: 2500,
      });
      await db.dropInProduct.update({
        where: { id: product.id },
        data: { priceCents: 3000 },
      });
      const before = await f.state();
      expect(await f.book(review)).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await f.state()).toEqual(before);
      const fresh = await f.preview();
      expect(await f.book(fresh)).toMatchObject({
        status: "payment_required",
        priceCents: 3000,
      });
      expect(
        await db.financialOperation.count({
          where: { workspaceId: f.workspaceId, kind: "CHECKOUT" },
        }),
      ).toBe(0);
    });
    it("claims a duplicate concurrent confirmation only once", async () => {
      const f = await fixture();
      await f.hold();
      const review = await f.preview();
      const results = await Promise.all([f.book(review), f.book(review)]);
      expect(
        results.filter((result) => result.status === "created"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "error"),
      ).toHaveLength(1);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(
        await db.punchCardEntry.count({
          where: { workspaceId: f.workspaceId, delta: -1 },
        }),
      ).toBe(1);
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(2);
    });
    it("rereads the exact payable product after a real commercial-update lock wait", async () => {
      const f = await fixture();
      await f.hold();
      await f.hold("PUNCH_CARD", f.pack.id);
      const product = await db.dropInProduct.create({
        data: {
          workspaceId: f.workspaceId,
          name: "Fictional waited drop-in",
          priceCents: 2500,
          currency: "cad",
        },
      });
      const review = await f.preview(),
        before = await f.state();
      let unlock!: () => void, ready!: (pid: number) => void;
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const started = new Promise<number>((resolve) => {
        ready = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          const [identity] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await tx.dropInProduct.update({
            where: { id: product.id },
            data: { priceCents: 3000 },
          });
          ready(identity!.pid);
          await release;
        },
        { timeout: 20000 },
      );
      let outcome:
        | Promise<
            { result: Awaited<ReturnType<typeof f.book>> } | { error: unknown }
          >
        | undefined;
      try {
        const pid = await Promise.race([
          started,
          blocker.then(() => {
            throw new Error(
              "The fictional blocker ended before its wait was released.",
            );
          }),
        ]);
        outcome = f.book(review).then(
          (result) => ({ result }),
          (error) => ({ error }),
        );
        const deadline = Date.now() + 10000;
        let observed = false;
        while (Date.now() < deadline) {
          const [row] = await db.$queryRaw<
            Array<{ blocked: boolean }>
          >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = current_database() AND ${pid} = ANY(pg_blocking_pids(a.pid))) AS blocked`;
          if (row?.blocked) {
            observed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(observed).toBe(true);
      } finally {
        unlock();
        await blocker;
        if (outcome) await outcome;
      }
      const completed = await outcome!;
      if ("error" in completed) throw completed.error;
      expect(completed.result).toMatchObject({
        status: "error",
        code: "REVIEW_REQUIRED",
      });
      expect(await f.state()).toEqual(before);
      expect(
        (
          await db.dropInProduct.findUniqueOrThrow({
            where: { id: product.id },
          })
        ).priceCents,
      ).toBe(3000);
    }, 30000);
    it("preserves the existing trusted owner and public free-trial APIs", async () => {
      const f = await fixture();
      expect(
        (
          await createAccessBackedBooking({
            workspaceId: f.workspaceId,
            memberId: f.member.id,
            classTemplateId: f.template.id,
            scheduledForDate: "2030-01-07",
            timezone: "UTC",
            source: "ADMIN",
            db: db as never,
            now,
          })
        ).status,
      ).toBe("created");
      const trial = await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          fullName: "Fictional free trial",
          status: "TRIAL",
        },
      });
      expect(
        (
          await createAccessBackedBooking({
            workspaceId: f.workspaceId,
            memberId: trial.id,
            classTemplateId: f.template.id,
            scheduledForDate: "2030-01-07",
            timezone: "UTC",
            source: "PUBLIC_TRIAL",
            trial: true,
            allowDropIn: false,
            db: db as never,
            now,
          })
        ).status,
      ).toBe("created");
    });
  },
);
