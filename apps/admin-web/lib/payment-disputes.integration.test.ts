import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  savePaymentDisputeEvidence,
  getOwnerPaymentDispute,
  reviewOwnerPaymentDispute,
  financialEntitlementHoldReason,
  previewOwnerRefund,
  reserveOwnerRefund,
  recordExternalRefundEvidence,
  runCoachingCommand,
  type PaymentDisputeEvidence,
} from "@flowstate/db";
import {
  reconcileDisputeWebhook,
  reconcileWorkspacePaymentDisputes,
} from "@flowstate/payments";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("processor disputes in PostgreSQL", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  let gym = "",
    user = "",
    customer = "",
    owner = "",
    member = "",
    account = "",
    payment = "",
    card = "",
    booking = "",
    accountId = "",
    e: PaymentDisputeEvidence;
  beforeEach(async () => {
    accountId = `acct_${randomUUID()}`;
    user = (
      await db.user.create({ data: { email: `${randomUUID()}@example.test` } })
    ).id;
    customer = (
      await db.user.create({ data: { email: `${randomUUID()}@example.test` } })
    ).id;
    gym = (
      await db.workspace.create({
        data: {
          name: "Fictional dispute gym",
          workspaceUsers: {
            create: [
              { userId: user, role: "OWNER" },
              { userId: customer, role: "CUSTOMER" },
            ],
          },
          stripeSettings: { create: { stripeAccountId: accountId } },
        },
      })
    ).id;
    owner = (
      await db.workspaceUser.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: gym, userId: user } },
      })
    ).id;
    member = (
      await db.member.create({
        data: {
          workspaceId: gym,
          userId: customer,
          fullName: "Fictional payer",
        },
      })
    ).id;
    account = (
      await db.financialAccount.create({
        data: {
          workspaceId: gym,
          userId: customer,
          memberId: member,
          stripeAccountId: accountId,
          stripeCustomerId: "cus_fictional",
        },
      })
    ).id;
    payment = (
      await db.payment.create({
        data: {
          workspaceId: gym,
          memberId: member,
          payerAccountId: account,
          stripePaymentIntentId: `pi_${randomUUID()}`,
          amountCents: 10000,
          currency: "cad",
          status: "SUCCEEDED",
        },
      })
    ).id;
    const checkout = await db.financialOperation.create({
      data: {
        workspaceId: gym,
        operationKey: randomUUID(),
        requestHash: "fixture",
        kind: "CHECKOUT",
        status: "SUCCEEDED",
        paymentId: payment,
        providerAccountId: accountId,
        providerReference: `cs_${randomUUID()}`,
        providerIdempotencyKey: randomUUID(),
        payload: {},
      },
    });
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId: gym,
        name: "Five visits",
        punchesIncluded: 5,
        priceCents: 10000,
        currency: "cad",
      },
    });
    card = (
      await db.memberPunchCard.create({
        data: {
          workspaceId: gym,
          memberId: member,
          punchCardProductId: product.id,
          originalPunches: 5,
          remainingPunches: 4,
          purchasePriceCents: 10000,
          purchaseCurrency: "cad",
          stripeCheckoutSessionId: checkout.providerReference,
        },
      })
    ).id;
    const location = await db.location.create({
      data: { workspaceId: gym, name: "Gym", timezone: "UTC" },
    });
    const room = await db.room.create({
      data: { locationId: location.id, name: "Mat", capacity: 10 },
    });
    const program = await db.program.create({
      data: { workspaceId: gym, name: "Classes" },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: gym,
        roomId: room.id,
        programId: program.id,
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 120,
      },
    });
    booking = (
      await db.classBooking.create({
        data: {
          workspaceId: gym,
          memberId: member,
          classTemplateId: template.id,
          scheduledForDate: new Date("2099-01-05Z"),
          bookingType: "PUNCH_CARD",
          memberPunchCardId: card,
          consumedPunchCount: 1,
        },
      })
    ).id;
    e = {
      id: `du_${randomUUID()}`,
      accountId,
      livemode: false,
      chargeId: `ch_${randomUUID()}`,
      paymentIntentId: (
        await db.payment.findUniqueOrThrow({ where: { id: payment } })
      ).stripePaymentIntentId,
      customerId: "cus_fictional",
      status: "needs_response",
      reason: "general",
      amountCents: 10000,
      currency: "cad",
      chargeAmountCents: 10000,
      chargeRefundedCents: 0,
      isChargeRefundable: false,
      evidenceDueAt: "2099-01-01T00:00:00Z",
      refunds: [],
      allocations: [],
      balanceTransactions: [
        {
          id: "txn_debit",
          amount: -10000,
          fee: 1500,
          net: -11500,
          currency: "cad",
          type: "adjustment",
        },
      ],
    };
  });
  afterEach(async () => {
    if (gym) {
      await db.financialEntitlementHold.deleteMany({
        where: { workspaceId: gym },
      });
      await db.financialReviewCase.deleteMany({ where: { workspaceId: gym } });
      await db.coachingEnrollment.deleteMany({ where: { workspaceId: gym } });
      await db.coachingProgramVersion.deleteMany({
        where: { program: { workspaceId: gym } },
      });
      await db.workspace.delete({ where: { id: gym } });
    }
    await db.user.deleteMany({
      where: { id: { in: [user, customer].filter(Boolean) } },
    });
    gym = "";
  });
  afterAll(() => db.$disconnect());
  async function save(
    overrides: Partial<PaymentDisputeEvidence> = {},
    eventId = randomUUID(),
  ) {
    e = { ...e, ...overrides };
    const prior = await db.paymentDispute.findUnique({
      where: {
        providerAccountId_livemode_providerDisputeId: {
          providerAccountId: accountId,
          livemode: false,
          providerDisputeId: e.id,
        },
      },
    });
    return savePaymentDisputeEvidence({
      workspaceId: gym,
      accountId,
      livemode: false,
      evidence: e,
      expectedVersion: prior?.version ?? 0,
      eventId,
      db,
    });
  }
  async function treatment(
    disputeId: string,
    choice:
      | "KEEP_RESERVATIONS"
      | "RELEASE_FUTURE_RESERVATIONS"
      | "RETAIN_ACCESS"
      | "REVOKE_UNUSED_ACCESS",
    reason = "Reviewed fictional case",
  ) {
    const current = await getOwnerPaymentDispute({
      workspaceId: gym,
      actorUserId: user,
      disputeId,
      db,
    });
    const command = {
      workspaceId: gym,
      actorUserId: user,
      disputeId,
      requestId: randomUUID(),
      reviewHash: current.reviewHash,
      reviewerWorkspaceUserId: owner,
      treatment: choice,
      reason,
      db,
    };
    await reviewOwnerPaymentDispute(command);
    return command;
  }
  it("holds once while preserving reservations, keeps assignment open, and releases only after a verified win", async () => {
    const d = await save();
    await save();
    expect(await db.paymentDispute.count({ where: { workspaceId: gym } })).toBe(
      1,
    );
    expect(
      await db.paymentDisputeEvent.count({ where: { disputeId: d.id } }),
    ).toBe(1);
    expect(
      await db.financialEntitlementHold.count({
        where: { disputeId: d.id, activeSlot: "ACTIVE" },
      }),
    ).toBe(2);
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
    await treatment(d.id, "KEEP_RESERVATIONS");
    expect(
      (
        await db.financialReviewCase.findFirstOrThrow({
          where: { disputeId: d.id },
        })
      ).resolvedAt,
    ).toBeNull();
    await expect(treatment(d.id, "RETAIN_ACCESS")).rejects.toThrow(
      "not confirmed a final",
    );
    const won = await save({
      status: "won",
      isChargeRefundable: true,
      balanceTransactions: [
        ...e.balanceTransactions,
        {
          id: "txn_credit",
          amount: 10000,
          fee: 0,
          net: 10000,
          currency: "cad",
          type: "adjustment",
        },
      ],
    });
    expect(won.moneyState).toBe("WON");
    expect(won.resolvedAt).not.toBeNull();
    expect(
      await db.financialEntitlementHold.count({
        where: { disputeId: d.id, activeSlot: "ACTIVE" },
      }),
    ).toBe(0);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment } }))
        .refundedAmountCents,
    ).toBe(0);
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
  });
  it("composes two disputes and a refund hold; completing one cannot unlock another", async () => {
    const first = await save();
    const firstEvidence = { ...e };
    const second = await save({ id: `du_${randomUUID()}` });
    const operation = await db.financialOperation.create({
      data: {
        workspaceId: gym,
        operationKey: randomUUID(),
        requestHash: "fixture",
        kind: "REFUND",
        providerIdempotencyKey: randomUUID(),
        payload: {},
      },
    });
    await db.financialEntitlementHold.create({
      data: {
        workspaceId: gym,
        operationId: operation.id,
        targetKind: "PUNCH_CARD",
        targetId: card,
      },
    });
    await save({ ...firstEvidence, status: "won", isChargeRefundable: true });
    expect(
      await db.financialEntitlementHold.count({
        where: { disputeId: first.id, activeSlot: "ACTIVE" },
      }),
    ).toBe(0);
    expect(
      await db.financialEntitlementHold.count({
        where: { disputeId: second.id, activeSlot: "ACTIVE" },
      }),
    ).toBe(2);
    expect(
      await financialEntitlementHoldReason({
        workspaceId: gym,
        targets: [{ targetKind: "PUNCH_CARD", targetId: card }],
        exceptOperationId: operation.id,
        db,
      }),
    ).toContain("dispute");
    await expect(
      treatment(second.id, "RELEASE_FUTURE_RESERVATIONS"),
    ).rejects.toThrow("refund");
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
  });
  it("blocks stale/new refunds, preserves money collection history, retires only unused units once after verified loss", async () => {
    const before = await previewOwnerRefund({
      workspaceId: gym,
      actorUserId: user,
      paymentId: payment,
      db,
    });
    const d = await save({ status: "lost" });
    await expect(
      reserveOwnerRefund({
        workspaceId: gym,
        actorUserId: user,
        paymentId: payment,
        amountCents: 100,
        disposition: "RETAIN_ACCESS",
        reason: "Old review",
        requestId: randomUUID(),
        reviewHash: before.reviewHash,
        db,
      }),
    ).rejects.toThrow("changed");
    expect(
      (
        await previewOwnerRefund({
          workspaceId: gym,
          actorUserId: user,
          paymentId: payment,
          db,
        })
      ).refundableCents,
    ).toBe(0);
    const command = await treatment(d.id, "REVOKE_UNUSED_ACCESS");
    await reviewOwnerPaymentDispute(command);
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(0);
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("CANCELLED");
    const paid = await db.payment.findUniqueOrThrow({ where: { id: payment } });
    expect(paid.status).toBe("SUCCEEDED");
    expect(paid.refundedAmountCents).toBe(0);
    expect(
      await db.punchCardEntry.count({ where: { memberPunchCardId: card } }),
    ).toBe(3);
    await expect(
      reviewOwnerPaymentDispute({ ...command, reason: "Changed replay" }),
    ).rejects.toThrow("changed");
    const recovered = await save({ status: "won", isChargeRefundable: true });
    expect(recovered.accessState).toBe("RECOVERY_REVIEW");
    expect(recovered.resolvedAt).toBeNull();
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(0);
  });
  it("quarantines ambiguous PI matches rather than attaching the first beneficiary", async () => {
    await db.payment.create({
      data: {
        workspaceId: gym,
        memberId: member,
        payerAccountId: account,
        stripePaymentIntentId: e.paymentIntentId,
        amountCents: 10000,
        currency: "cad",
        status: "SUCCEEDED",
      },
    });
    const d = await save();
    expect(d.paymentId).toBeNull();
    expect(d.lastError).toBe("PAYMENT_LINKAGE_REVIEW");
    expect(
      await db.paymentDisputeAllocation.count({ where: { disputeId: d.id } }),
    ).toBe(0);
    expect(
      await db.financialEntitlementHold.count({ where: { disputeId: d.id } }),
    ).toBe(0);
    expect(
      (
        await previewOwnerRefund({
          workspaceId: gym,
          actorUserId: user,
          paymentId: payment,
          db,
        })
      ).refundableCents,
    ).toBe(0);
  });
  it("rejects account/mode mismatch, stale evidence, stale review and revoked owner without changes", async () => {
    await expect(
      savePaymentDisputeEvidence({
        workspaceId: gym,
        accountId,
        livemode: true,
        evidence: e,
        expectedVersion: 0,
        eventId: randomUUID(),
        db,
      }),
    ).rejects.toThrow("account and mode");
    const d = await save();
    const r = await getOwnerPaymentDispute({
      workspaceId: gym,
      actorUserId: user,
      disputeId: d.id,
      db,
    });
    await expect(
      savePaymentDisputeEvidence({
        workspaceId: gym,
        accountId,
        livemode: false,
        evidence: { ...e, status: "won" },
        expectedVersion: 0,
        eventId: randomUUID(),
        db,
      }),
    ).rejects.toThrow("changed");
    await db.classBooking.update({
      where: { id: booking },
      data: { updatedAt: new Date(Date.now() + 1000) },
    });
    await expect(
      reviewOwnerPaymentDispute({
        workspaceId: gym,
        actorUserId: user,
        disputeId: d.id,
        requestId: randomUUID(),
        reviewHash: r.reviewHash,
        reviewerWorkspaceUserId: owner,
        treatment: "KEEP_RESERVATIONS",
        reason: "Stale review",
        db,
      }),
    ).rejects.toThrow("changed");
    await db.workspaceUser.update({
      where: { id: owner },
      data: { isActive: false },
    });
    await expect(
      getOwnerPaymentDispute({
        workspaceId: gym,
        actorUserId: user,
        disputeId: d.id,
        db,
      }),
    ).rejects.toThrow("active gym owner");
  });
  it("recovers old ignored events through bounded sweep and trusts retrieved won state over stale created payload", async () => {
    const gateway = {
      retrieve: async () => ({ ...e, status: "won", isChargeRefundable: true }),
      list: async () => ({ ids: [e.id], hasMore: false }),
    };
    const event = {
      id: `evt_${randomUUID()}`,
      type: "charge.dispute.created",
      account: accountId,
      livemode: false,
      data: {
        object: { id: e.id, object: "dispute", status: "needs_response" },
      },
    } as never;
    await reconcileDisputeWebhook(event, {
      db,
      gateway,
      expectedLivemode: false,
    });
    const d = await db.paymentDispute.findFirstOrThrow({
      where: { workspaceId: gym },
    });
    expect(d.providerStatus).toBe("won");
    expect(d.resolvedAt).not.toBeNull();
    await reconcileWorkspacePaymentDisputes({
      workspaceId: gym,
      db,
      gateway,
      expectedLivemode: false,
    });
    expect(
      await db.paymentDisputeEvent.count({ where: { disputeId: d.id } }),
    ).toBe(1);
    expect(
      (
        await db.workspaceStripeSettings.findUniqueOrThrow({
          where: { workspaceId: gym },
        })
      ).disputeSyncCursor,
    ).toBeNull();
    await expect(
      db.paymentDisputeEvent.updateMany({
        where: { disputeId: d.id },
        data: { reason: "Tamper" },
      }),
    ).rejects.toThrow("immutable");
  });
  it("links every exact invoice allocation for a shared PI without inventing proportional units", async () => {
    const child = await db.member.create({
      data: { workspaceId: gym, fullName: "Fictional child" },
    });
    const invoiceA = await db.invoice.create({
      data: {
        workspaceId: gym,
        stripeInvoiceId: "in_a",
        subtotalCents: 6000,
        totalCents: 6000,
        currency: "cad",
        status: "PAID",
      },
    });
    const invoiceB = await db.invoice.create({
      data: {
        workspaceId: gym,
        stripeInvoiceId: "in_b",
        subtotalCents: 4000,
        totalCents: 4000,
        currency: "cad",
        status: "PAID",
      },
    });
    await db.payment.update({
      where: { id: payment },
      data: {
        invoiceId: invoiceA.id,
        importedExternalId: "invoice-payment:inpay_a",
        amountCents: 6000,
      },
    });
    const second = await db.payment.create({
      data: {
        workspaceId: gym,
        memberId: child.id,
        payerAccountId: account,
        invoiceId: invoiceB.id,
        importedExternalId: "invoice-payment:inpay_b",
        amountCents: 4000,
        currency: "cad",
        status: "SUCCEEDED",
        stripePaymentIntentId: e.paymentIntentId,
      },
    });
    const d = await save({
      amountCents: 3000,
      allocations: [
        {
          id: "inpay_a",
          invoiceId: "in_a",
          amountCents: 6000,
          customerId: e.customerId,
        },
        {
          id: "inpay_b",
          invoiceId: "in_b",
          amountCents: 4000,
          customerId: e.customerId,
        },
      ],
    });
    expect(d.paymentId).toBeNull();
    expect(d.lastError).toBeNull();
    expect(
      (
        await db.paymentDisputeAllocation.findMany({
          where: { disputeId: d.id },
        })
      )
        .map((a) => a.paymentId)
        .sort(),
    ).toEqual([payment, second.id].sort());
    await save({ status: "lost" });
    await expect(treatment(d.id, "REVOKE_UNUSED_ACCESS")).rejects.toThrow(
      "partial or shared",
    );
    await treatment(
      d.id,
      "RETAIN_ACCESS",
      "Retain both services after reviewing shared partial loss",
    );
    await recordExternalRefundEvidence({
      accountId,
      evidence: {
        id: "re_shared",
        amountCents: 1000,
        currency: "cad",
        paymentIntentId: e.paymentIntentId,
        operationId: null,
        status: "succeeded",
      },
      db,
    });
    expect(await db.refund.count({ where: { workspaceId: gym } })).toBe(0);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: second.id } }))
        .refundedAmountCents,
    ).toBe(0);
    expect(
      await db.financialReviewCase.count({
        where: {
          workspaceId: gym,
          sourceKey: "external-refund-allocation:re_shared",
          resolvedAt: null,
        },
      }),
    ).toBe(1);
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(4);
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } }))
        .status,
    ).toBe("PAID");
  });
  it("holds a notes-only coaching enrollment and preserves its published history", async () => {
    const program = await db.coachingProgram.create({
      data: {
        workspaceId: gym,
        name: "Notes-only support",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [1, 2, 3, 4, 5],
            responseHours: 24,
            goals: "Fictional goals",
            milestones: [],
            appointmentUnits: 0,
            priceCents: 10000,
            currency: "cad",
            terms: "Fictional accepted terms",
          },
        },
      },
      include: { versions: true },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: gym,
        memberId: member,
        programVersionId: program.versions[0]!.id,
        startsOn: new Date("2099-01-01Z"),
        endsOn: new Date("2099-01-28Z"),
        timezone: "UTC",
        caseOwnerWorkspaceUserId: owner,
        paymentId: payment,
        checkoutAccountId: accountId,
        paymentState: "PAID",
      },
    });
    const delivered = await db.coachingDailyNote.create({
      data: {
        enrollmentId: enrollment.id,
        localDate: new Date("2099-01-02Z"),
        authorWorkspaceUserId: owner,
        draftBody: "Fictional shared delivery",
        status: "PUBLISHED",
        publishedAt: new Date(),
        revisions: {
          create: {
            number: 1,
            body: "Fictional shared delivery",
            authorWorkspaceUserId: owner,
          },
        },
      },
    });
    const d = await save();
    expect(
      await financialEntitlementHoldReason({
        workspaceId: gym,
        targets: [{ targetKind: "COACHING", targetId: enrollment.id }],
        db,
      }),
    ).toContain("dispute");
    expect(
      await db.coachingAppointment.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(0);
    await save({ status: "won", isChargeRefundable: true });
    expect(
      await db.financialEntitlementHold.count({
        where: { disputeId: d.id, activeSlot: "ACTIVE" },
      }),
    ).toBe(0);
    expect(
      (
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).closedAt,
    ).toBeNull();
    expect(
      (
        await db.coachingDailyNote.findUniqueOrThrow({
          where: { id: delivered.id },
        })
      ).status,
    ).toBe("PUBLISHED");
    expect(
      await db.coachingDailyNoteRevision.count({
        where: { noteId: delivered.id },
      }),
    ).toBe(1);
  });
  it("rolls back all intake effects when its audit cannot be committed", async () => {
    const failing = db.$extends({
      query: {
        paymentDisputeEvent: {
          async create() {
            throw new Error("injected audit failure");
          },
        },
      },
    }) as unknown as PrismaClient;
    await expect(
      savePaymentDisputeEvidence({
        workspaceId: gym,
        accountId,
        livemode: false,
        evidence: e,
        expectedVersion: 0,
        eventId: randomUUID(),
        db: failing,
      }),
    ).rejects.toThrow("injected audit failure");
    expect(await db.paymentDispute.count({ where: { workspaceId: gym } })).toBe(
      0,
    );
    expect(
      await db.financialEntitlementHold.count({ where: { workspaceId: gym } }),
    ).toBe(0);
    expect(
      await db.financialReviewCase.count({ where: { workspaceId: gym } }),
    ).toBe(0);
  });
  it("records partial-refund and late-reinstatement evidence without inventing another refund or restoring cancelled seats", async () => {
    await db.payment.update({
      where: { id: payment },
      data: { refundedAmountCents: 2000, status: "PARTIALLY_REFUNDED" },
    });
    const d = await save({
      status: "lost",
      amountCents: 8000,
      chargeRefundedCents: 2000,
      refunds: [
        {
          id: "re_before",
          amountCents: 2000,
          currency: "cad",
          status: "succeeded",
        },
      ],
    });
    await treatment(d.id, "RETAIN_ACCESS");
    const recovered = await save({
      balanceTransactions: [
        ...e.balanceTransactions,
        {
          id: "txn_late_reinstatement",
          amount: 2000,
          fee: 0,
          net: 2000,
          currency: "cad",
          type: "adjustment",
        },
      ],
    });
    expect(recovered.providerStatus).toBe("lost");
    expect(recovered.moneyState).toBe("LOST_WITH_FUNDS_RECOVERY");
    expect(recovered.resolvedAt).toBeNull();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment } }))
        .refundedAmountCents,
    ).toBe(2000);
    expect(await db.refund.count({ where: { paymentId: payment } })).toBe(0);
  });
  it("rejects stale coaching commercial revisions before any loss disposition", async () => {
    const program = await db.coachingProgram.create({
      data: {
        workspaceId: gym,
        name: "Accepted service",
        versions: {
          create: [1, 2].map((number) => ({
            number,
            durationDays: 28,
            deliveryWeekdays: [1],
            responseHours: 24,
            goals: "Fictional goal",
            milestones: [],
            appointmentUnits: number - 1,
            priceCents: 10000,
            currency: "cad",
            terms: "Accepted terms",
          })),
        },
      },
      include: { versions: { orderBy: { number: "asc" } } },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: gym,
        memberId: member,
        programVersionId: program.versions[0]!.id,
        startsOn: new Date("2099-01-01Z"),
        endsOn: new Date("2099-01-28Z"),
        timezone: "UTC",
        caseOwnerWorkspaceUserId: owner,
        paymentId: payment,
        checkoutAccountId: accountId,
        paymentState: "PAID",
      },
    });
    const d = await save({ status: "lost" });
    const preview = await getOwnerPaymentDispute({
      workspaceId: gym,
      actorUserId: user,
      disputeId: d.id,
      db,
    });
    await db.coachingEnrollment.update({
      where: { id: enrollment.id },
      data: {
        programVersionId: program.versions[1]!.id,
        version: { increment: 1 },
      },
    });
    await expect(
      reviewOwnerPaymentDispute({
        workspaceId: gym,
        actorUserId: user,
        disputeId: d.id,
        requestId: randomUUID(),
        reviewHash: preview.reviewHash,
        reviewerWorkspaceUserId: owner,
        treatment: "REVOKE_UNUSED_ACCESS",
        reason: "Old accepted plan",
        db,
      }),
    ).rejects.toThrow("changed");
    expect(
      (
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).closedAt,
    ).toBeNull();
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(4);
  });
  it("queues a current-recipient release notice exactly once and rolls back booking, units and audit if outbox fails", async () => {
    const d = await save({ status: "lost" });
    const preview = await getOwnerPaymentDispute({
      workspaceId: gym,
      actorUserId: user,
      disputeId: d.id,
      db,
    });
    const command = {
      workspaceId: gym,
      actorUserId: user,
      disputeId: d.id,
      requestId: randomUUID(),
      reviewHash: preview.reviewHash,
      reviewerWorkspaceUserId: owner,
      treatment: "REVOKE_UNUSED_ACCESS" as const,
      reason:
        "Reviewed loss without revealing private coaching or financial text",
      db,
    };
    const failing = db.$extends({
      query: {
        notificationJob: {
          async createMany() {
            throw new Error("injected outbox failure");
          },
        },
      },
    }) as unknown as PrismaClient;
    await expect(
      reviewOwnerPaymentDispute({ ...command, db: failing }),
    ).rejects.toThrow("injected outbox failure");
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(4);
    expect(
      await db.paymentDisputeEvent.count({
        where: { disputeId: d.id, kind: "ACCESS_OUTCOME_REVIEWED" },
      }),
    ).toBe(0);
    await reviewOwnerPaymentDispute(command);
    await reviewOwnerPaymentDispute(command);
    const jobs = await db.notificationJob.findMany({
      where: { workspaceId: gym },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("PENDING");
    expect(jobs[0]!.context).toEqual({
      kind: "MEMBER_ACCESS",
      memberId: member,
    });
    expect(jobs[0]!.body).not.toContain(command.reason);
    expect(jobs[0]!.body).toContain("without penalty");
  });
  it("reserves remaining charge money across distinct local allocations of the same disputed PI", async () => {
    const child = await db.member.create({
      data: { workspaceId: gym, fullName: "Other beneficiary" },
    });
    const second = await db.payment.create({
      data: {
        workspaceId: gym,
        memberId: child.id,
        payerAccountId: account,
        amountCents: 4000,
        currency: "cad",
        status: "SUCCEEDED",
        stripePaymentIntentId: e.paymentIntentId,
      },
    });
    // A known terminal dispute still provides a charge-wide ceiling when only this allocation is currently linked.
    await db.paymentDispute.create({
      data: {
        workspaceId: gym,
        providerAccountId: accountId,
        livemode: false,
        providerDisputeId: `du_${randomUUID()}`,
        chargeId: e.chargeId,
        paymentIntentId: e.paymentIntentId,
        paymentId: payment,
        providerStatus: "won",
        reason: "general",
        amountCents: 1000,
        currency: "cad",
        chargeAmountCents: 10000,
        chargeRefundedCents: 0,
        isChargeRefundable: true,
        evidence: {},
        evidenceHash: "a".repeat(64),
        accessState: "RELEASED",
        moneyState: "WON",
      },
    });
    await db.refund.create({
      data: {
        workspaceId: gym,
        paymentId: second.id,
        amountCents: 4000,
        currency: "cad",
        status: "PENDING",
      },
    });
    expect(
      (
        await previewOwnerRefund({
          workspaceId: gym,
          actorUserId: user,
          paymentId: payment,
          db,
        })
      ).refundableCents,
    ).toBe(6000);
    await db.refund.updateMany({
      where: { workspaceId: gym, paymentId: second.id },
      data: { status: "SUCCEEDED" },
    });
    expect(
      (
        await previewOwnerRefund({
          workspaceId: gym,
          actorUserId: user,
          paymentId: payment,
          db,
        })
      ).refundableCents,
    ).toBe(6000);
  });
  it("holds proven assets for a newly introduced provider status without cancelling reservations", async () => {
    const d = await save({ status: "future_network_review" });
    expect(d.lastError).toBe("UNSUPPORTED_STATUS");
    expect(d.accessState).toBe("HELD");
    expect(d.resolvedAt).toBeNull();
    expect(
      await financialEntitlementHoldReason({
        workspaceId: gym,
        targets: [{ targetKind: "PUNCH_CARD", targetId: card }],
        db,
      }),
    ).toContain("dispute");
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
        .status,
    ).toBe("BOOKED");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
        .remainingPunches,
    ).toBe(4);
  });
  it("cannot restart retired coaching with its old PAID funding through proposal or client acceptance, even after later recovery review", async () => {
    const program = await db.coachingProgram.create({
      data: {
        workspaceId: gym,
        name: "Retired service",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [1],
            responseHours: 24,
            goals: "Fictional goal",
            milestones: [],
            appointmentUnits: 0,
            priceCents: 10000,
            currency: "cad",
            terms: "Accepted terms",
          },
        },
      },
      include: { versions: true },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: gym,
        memberId: member,
        programVersionId: program.versions[0]!.id,
        startsOn: new Date("2099-01-01Z"),
        endsOn: new Date("2099-01-28Z"),
        timezone: "UTC",
        caseOwnerWorkspaceUserId: owner,
        paymentId: payment,
        checkoutAccountId: accountId,
        paymentState: "PAID",
        currentCoachWorkspaceUserId: owner,
        contactVerifiedAt: new Date(),
      },
    });
    const d = await save({ status: "lost" });
    await treatment(d.id, "REVOKE_UNUSED_ACCESS");
    let live = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    await expect(
      runCoachingCommand(
        { workspaceId: gym, userId: user },
        {
          kind: "proposePlan",
          enrollmentId: enrollment.id,
          expectedVersion: live.version,
          operationId: randomUUID(),
          input: {
            programVersionId: program.versions[0]!.id,
            startsOn: "2099-02-01",
            endsOn: "2099-02-28",
          },
        },
      ),
    ).rejects.toThrow("original funding was retired");
    // A pre-existing proposal must not bypass the acceptance boundary either.
    await db.coachingEnrollment.update({
      where: { id: enrollment.id },
      data: { proposedProgramVersionId: program.versions[0]!.id },
    });
    await expect(
      runCoachingCommand(
        { workspaceId: gym, userId: customer },
        {
          kind: "acceptPlan",
          enrollmentId: enrollment.id,
          expectedVersion: live.version,
          operationId: randomUUID(),
          input: { acceptTerms: true },
        },
      ),
    ).rejects.toThrow("original funding was retired");
    await save({ status: "won", isChargeRefundable: true });
    await treatment(
      d.id,
      "RETAIN_ACCESS",
      "Acknowledge late recovery without resurrecting the old program",
    );
    live = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    await expect(
      runCoachingCommand(
        { workspaceId: gym, userId: user },
        {
          kind: "proposePlan",
          enrollmentId: enrollment.id,
          expectedVersion: live.version,
          operationId: randomUUID(),
          input: {
            programVersionId: program.versions[0]!.id,
            startsOn: "2099-02-01",
            endsOn: "2099-02-28",
          },
        },
      ),
    ).rejects.toThrow("original funding was retired");
    expect(
      (
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).closedAt,
    ).not.toBeNull();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment } })).status,
    ).toBe("SUCCEEDED");
    const jobs = await db.notificationJob.findMany({
      where: {
        workspaceId: gym,
        subject: "Your coaching program has an update",
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.context).toEqual({
      kind: "COACHING_UPDATE",
      enrollmentId: enrollment.id,
    });
  });
});
