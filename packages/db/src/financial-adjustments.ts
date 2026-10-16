import { randomUUID } from "node:crypto";
import {
  Prisma,
  type FinancialOperation,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "./client.js";
import {
  lockClassSchedule,
  classOccurrenceInclude,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import { toDateOnlyString } from "./occurrences.js";
import { getOccurrenceStartsAt } from "./class-access.js";
import { adjustPunchCardUnits } from "./punch-card-ledger.js";
import { settleMembershipAllowance } from "./membership-allowances.js";
import { applyCoachingRefundDisposition } from "./coaching.js";
import {
  FinancialError,
  financialRequestHash,
  lockFinancialAccount,
  reserveFinancialOperation,
  transitionFinancialOperation,
  queueFinancialReview,
} from "./financial-operations.js";

type Tx = Prisma.TransactionClient;
export type RefundDisposition = "RETAIN_ACCESS" | "REVOKE_UNUSED_ACCESS";
export interface RefundEvidence {
  id: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string | null;
  operationId: string | null;
  status: "pending" | "succeeded" | "failed" | "canceled" | "requires_action";
}
export interface CreditEvidence {
  id: string;
  amountCents: number;
  currency: string;
  customerId: string;
  operationId: string | null;
}
export interface AdjustmentGateway {
  createRefund(
    request: {
      accountId: string;
      paymentIntentId: string;
      amountCents: number;
      operationId: string;
    },
    key: string,
  ): Promise<{ id: string }>;
  retrieveRefund(accountId: string, id: string): Promise<RefundEvidence>;
  createCredit(
    request: {
      accountId: string;
      customerId: string;
      amountCents: number;
      currency: string;
      operationId: string;
    },
    key: string,
  ): Promise<{ id: string }>;
  retrieveCredit(
    accountId: string,
    customerId: string,
    id: string,
  ): Promise<CreditEvidence>;
}
interface OwnerArgs {
  workspaceId: string;
  actorUserId: string;
  db?: PrismaClient;
}
export interface RefundCommand {
  paymentId: string;
  amountCents: number;
  disposition: RefundDisposition;
  reason: string;
  requestId: string;
  reviewHash: string;
}
function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function assertAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new FinancialError(
      "Enter a positive amount with no more than two decimal places.",
    );
}
function assertRequest(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new FinancialError(
      "Open a new review before submitting this request.",
    );
}
async function requireOwner(tx: Tx, args: OwnerArgs) {
  const owner = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      role: "OWNER",
      isActive: true,
    },
    select: { id: true },
  });
  if (!owner)
    throw new FinancialError(
      "Only an active gym owner can approve this request.",
    );
  return owner;
}
async function locks(tx: Tx, args: OwnerArgs) {
  await lockClassSchedule(tx, args.workspaceId);
  await requireOwner(tx, args);
  await lockFinancialAccount(tx, args.workspaceId);
}
async function refundReview(tx: Tx, args: OwnerArgs & { paymentId: string }) {
  const payment = await tx.payment.findFirst({
    where: { id: args.paymentId, workspaceId: args.workspaceId },
    include: {
      payerAccount: { include: { member: { select: { fullName: true } } } },
      member: { select: { fullName: true } },
      refunds: true,
      memberMembership: true,
      coachingEnrollment: {
        select: {
          id: true,
          version: true,
          status: true,
          closedAt: true,
          endsOn: true,
        },
      },
    },
  });
  if (
    !payment ||
    !["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)
  )
    throw new FinancialError(
      "Choose a confirmed payment to review its refund.",
    );
  const checkout = await tx.financialOperation.findFirst({
    where: {
      workspaceId: args.workspaceId,
      paymentId: payment.id,
      kind: "CHECKOUT",
    },
    orderBy: { createdAt: "desc" },
    select: { providerReference: true, providerAccountId: true, payload: true },
  });
  const card = checkout?.providerReference
    ? await tx.memberPunchCard.findFirst({
        where: {
          workspaceId: args.workspaceId,
          stripeCheckoutSessionId: checkout.providerReference,
        },
        select: {
          id: true,
          memberId: true,
          remainingPunches: true,
          status: true,
          updatedAt: true,
        },
      })
    : null;
  const timezone =
    (
      await tx.location.findFirst({
        where: { workspaceId: args.workspaceId },
        select: { timezone: true },
      })
    )?.timezone ?? "UTC";
  const candidates = await tx.classBooking.findMany({
    where: {
      workspaceId: args.workspaceId,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      OR: [
        ...(card ? [{ memberPunchCardId: card.id }] : []),
        ...(payment.memberMembershipId
          ? [{ fundingMembershipId: payment.memberMembershipId }]
          : []),
        ...(payment.stripePaymentIntentId
          ? [
              { dropInPaymentIntentId: payment.stripePaymentIntentId },
              {
                fundedByBooking: {
                  dropInPaymentIntentId: payment.stripePaymentIntentId,
                },
              },
            ]
          : []),
      ],
    },
    include: { classTemplate: { include: classOccurrenceInclude } },
  });
  const bookings = candidates
    .filter((b) => {
      const effective = resolveClassOccurrence({
        template: b.classTemplate,
        scheduledForDate: toDateOnlyString(b.scheduledForDate),
      });
      return (
        getOccurrenceStartsAt({
          scheduledForDate: toDateOnlyString(b.scheduledForDate),
          startTimeMinutes:
            effective?.startTimeMinutes ?? b.classTemplate.startTimeMinutes,
          timezone,
        }) > new Date()
      );
    })
    .map((b) => ({
      id: b.id,
      version: b.updatedAt.toISOString(),
      title:
        resolveClassOccurrence({
          template: b.classTemplate,
          scheduledForDate: toDateOnlyString(b.scheduledForDate),
        })?.displayTitle ??
        b.classTemplate.title ??
        b.classTemplate.program.name,
      date: toDateOnlyString(b.scheduledForDate),
      memberId: b.memberId,
      type: b.bookingType,
      punches: b.consumedPunchCount,
    }));
  const succeeded = Math.max(
    payment.refundedAmountCents,
    payment.refunds
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amountCents, 0),
  );
  const pending = payment.refunds
    .filter((r) => r.status === "PENDING")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const accountId =
    checkout?.providerAccountId ??
    payment.payerAccount?.stripeAccountId ??
    null;
  const verifiedStop = payment.memberMembership?.stripeSubscriptionId
    ? await tx.financialOperation.findFirst({
        where: {
          workspaceId: args.workspaceId,
          targetId: payment.memberMembership.id,
          kind: "STOP_RENEWALS",
          status: "SUCCEEDED",
        },
        select: { id: true },
      })
    : true;
  const membershipClosed =
    !payment.memberMembership ||
    (["CANCELLED", "ENDED"].includes(payment.memberMembership.status) &&
      Boolean(payment.memberMembership.endedAt) &&
      payment.memberMembership.endedAt! <= new Date() &&
      Boolean(verifiedStop));
  const snapshot = {
    paymentId: payment.id,
    version: payment.updatedAt.toISOString(),
    amountCents: payment.amountCents,
    currency: payment.currency.toLowerCase(),
    succeeded,
    pending,
    card,
    bookings,
    coaching: payment.coachingEnrollment,
    membership: payment.memberMembership
      ? {
          id: payment.memberMembership.id,
          status: payment.memberMembership.status,
          endedAt: payment.memberMembership.endedAt?.toISOString() ?? null,
        }
      : null,
  };
  return {
    ...snapshot,
    reviewHash: financialRequestHash(snapshot),
    refundableCents: Math.max(0, payment.amountCents - succeeded - pending),
    payer: payment.payerAccount?.member.fullName ?? "Payer not recorded",
    beneficiary: payment.member?.fullName ?? "Account service",
    payerAccountId: payment.payerAccountId,
    beneficiaryMemberId: payment.memberId,
    providerAccountId: accountId,
    paymentIntentId: payment.stripePaymentIntentId,
    canRevoke: membershipClosed,
    revokeUnavailableReason: membershipClosed
      ? null
      : "Close this membership through its verified billing lifecycle before a refund revokes access.",
    onlineAvailable: Boolean(accountId && payment.stripePaymentIntentId),
  };
}
export async function previewOwnerRefund(
  args: OwnerArgs & { paymentId: string },
) {
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    return refundReview(tx, args);
  });
}
export type OwnerRefundReview = Awaited<ReturnType<typeof previewOwnerRefund>>;

async function confirmedRefundAccessReview(
  tx: Tx,
  args: OwnerArgs & { operationId: string },
) {
  const operation = await tx.financialOperation.findFirst({
    where: {
      id: args.operationId,
      workspaceId: args.workspaceId,
      kind: "REFUND",
    },
  });
  const refund = operation?.refundId
    ? await tx.refund.findUnique({ where: { id: operation.refundId } })
    : null;
  if (
    !operation ||
    !refund ||
    refund.status !== "SUCCEEDED" ||
    operation.status === "SUCCEEDED"
  )
    throw new FinancialError(
      "Choose a confirmed refund whose access outcome still needs review.",
    );
  const review = await refundReview(tx, {
    ...args,
    paymentId: operation.paymentId!,
  });
  return {
    operation,
    review,
    reviewHash: financialRequestHash({
      operationVersion: operation.version,
      currentAccess: review.reviewHash,
    }),
  };
}
export async function previewConfirmedRefundAccess(
  args: OwnerArgs & { operationId: string },
) {
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    return confirmedRefundAccessReview(tx, args);
  });
}
/** A new access decision for money already confirmed. It never calls the processor or changes the original refund request. */
export async function resolveConfirmedRefundAccess(
  args: OwnerArgs & {
    operationId: string;
    disposition: RefundDisposition;
    reason: string;
    reviewHash: string;
    requestId: string;
  },
) {
  assertRequest(args.requestId);
  if (
    !args.reason.trim() ||
    !["RETAIN_ACCESS", "REVOKE_UNUSED_ACCESS"].includes(args.disposition)
  )
    throw new FinancialError("Choose the access outcome and record a reason.");
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    const prior = await tx.financialOperation.findFirst({
      where: {
        id: args.operationId,
        workspaceId: args.workspaceId,
        kind: "REFUND",
        status: "SUCCEEDED",
      },
    });
    if (prior) {
      const resolved = (
        prior.result as {
          accessDecision?: {
            requestId: string;
            disposition: string;
            reason: string;
          };
        } | null
      )?.accessDecision;
      if (
        resolved?.requestId === args.requestId &&
        resolved.disposition === args.disposition &&
        resolved.reason === args.reason.trim()
      )
        return prior;
      throw new FinancialError(
        "This refund's access outcome was already confirmed.",
      );
    }
    const current = await confirmedRefundAccessReview(tx, args);
    if (current.reviewHash !== args.reviewHash)
      throw new FinancialError(
        "The refund or access changed. Review the latest details.",
      );
    if (
      args.disposition === "REVOKE_UNUSED_ACCESS" &&
      !current.review.canRevoke
    )
      throw new FinancialError(current.review.revokeUnavailableReason!);
    const accessDecision = {
      requestId: args.requestId,
      disposition: args.disposition,
      reason: args.reason.trim(),
      actorUserId: args.actorUserId,
    };
    const reviewed = await transitionFinancialOperation(
      tx,
      current.operation,
      "SUBMITTED",
      { action: "confirmed_refund_access_reviewed", ...accessDecision },
      {
        result: json({
          moneyConfirmed: true,
          accessReview: {
            review: current.review,
            disposition: args.disposition,
          },
          accessDecision,
        }),
      },
    );
    await retireAccess(tx, reviewed);
    await releaseHolds(tx, reviewed.id);
    const finished = await transitionFinancialOperation(
      tx,
      reviewed,
      "SUCCEEDED",
      { action: "reviewed_access_confirmed" },
      {
        settledAt: new Date(),
        lastError: null,
        result: json({
          moneyConfirmed: true,
          accessConfirmed: true,
          accessDecision,
        }),
      },
    );
    await tx.financialReviewCase.updateMany({
      where: {
        workspaceId: args.workspaceId,
        operationId: reviewed.id,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: args.actorUserId,
        resolution: args.reason.trim(),
      },
    });
    return finished;
  });
}

export async function reserveOwnerRefund(args: OwnerArgs & RefundCommand) {
  assertAmount(args.amountCents);
  assertRequest(args.requestId);
  if (
    !["RETAIN_ACCESS", "REVOKE_UNUSED_ACCESS"].includes(args.disposition) ||
    !args.reason.trim()
  )
    throw new FinancialError("Choose the access outcome and record a reason.");
  const command = {
    paymentId: args.paymentId,
    amountCents: args.amountCents,
    disposition: args.disposition,
    reason: args.reason.trim(),
    requestId: args.requestId,
    reviewHash: args.reviewHash,
  };
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    const prior = await tx.financialOperation.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: args.workspaceId,
          operationKey: `refund:${args.requestId}`,
        },
      },
    });
    if (prior) {
      if (
        financialRequestHash((prior.payload as Prisma.JsonObject).command) !==
        financialRequestHash(command)
      )
        throw new FinancialError(
          "This refund request changed. Open a new review.",
        );
      return prior;
    }
    const review = await refundReview(tx, args);
    if (review.reviewHash !== args.reviewHash)
      throw new FinancialError(
        "The payment or its access changed. Review the latest details before refunding.",
      );
    if (args.amountCents > review.refundableCents)
      throw new FinancialError(
        "This amount exceeds the payment's unreserved refundable balance.",
      );
    if (!review.onlineAvailable)
      throw new FinancialError(
        "The original processor account is not verified for this payment. Reconcile it before refunding.",
      );
    if (args.disposition === "REVOKE_UNUSED_ACCESS" && !review.canRevoke)
      throw new FinancialError(review.revokeUnavailableReason!);
    const op = await reserveFinancialOperation(tx, {
      workspaceId: args.workspaceId,
      operationKey: `refund:${args.requestId}`,
      kind: "REFUND",
      actorUserId: args.actorUserId,
      payerAccountId: review.payerAccountId ?? undefined,
      beneficiaryMemberId: review.beneficiaryMemberId ?? undefined,
      paymentId: args.paymentId,
      targetId: args.paymentId,
      amountCents: args.amountCents,
      currency: review.currency,
      providerAccountId: review.providerAccountId!,
      payload: json({ command, review }),
    });
    const refund = await tx.refund.create({
      data: {
        workspaceId: args.workspaceId,
        paymentId: args.paymentId,
        memberId: review.beneficiaryMemberId,
        amountCents: args.amountCents,
        currency: review.currency,
        status: "PENDING",
        reason: args.reason.trim(),
      },
    });
    if (args.disposition === "REVOKE_UNUSED_ACCESS") {
      const targets = [
        ...(review.card
          ? [
              {
                kind: "PUNCH_CARD",
                id: review.card.id,
                units: review.card.remainingPunches,
              },
            ]
          : []),
        ...(review.membership
          ? [{ kind: "MEMBERSHIP", id: review.membership.id }]
          : []),
        ...(review.coaching
          ? [{ kind: "COACHING", id: review.coaching.id }]
          : []),
        ...review.bookings.map((b) => ({ kind: "BOOKING", id: b.id })),
      ];
      for (const target of targets) {
        if (
          await tx.financialEntitlementHold.findFirst({
            where: {
              workspaceId: args.workspaceId,
              targetKind: target.kind,
              targetId: target.id,
              activeSlot: "ACTIVE",
            },
          })
        )
          throw new FinancialError(
            "This access already has an unresolved financial review.",
          );
        await tx.financialEntitlementHold.create({
          data: {
            workspaceId: args.workspaceId,
            operationId: op.id,
            targetKind: target.kind,
            targetId: target.id,
            units: "units" in target ? target.units : null,
          },
        });
      }
    }
    return tx.financialOperation.update({
      where: { id: op.id },
      data: { refundId: refund.id },
    });
  });
}
async function releaseHolds(tx: Tx, operationId: string) {
  await tx.financialEntitlementHold.updateMany({
    where: { operationId, activeSlot: "ACTIVE" },
    data: { activeSlot: null, releasedAt: new Date() },
  });
}
async function retireAccess(tx: Tx, op: FinancialOperation) {
  const payload = op.payload as unknown as {
    command: RefundCommand;
    review: OwnerRefundReview;
  };
  const accessReview = (
    op.result as {
      accessReview?: {
        review: OwnerRefundReview;
        disposition: RefundDisposition;
      };
    } | null
  )?.accessReview;
  const review = accessReview?.review ?? payload.review;
  const disposition = accessReview?.disposition ?? payload.command.disposition;
  const owner = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: op.workspaceId,
      userId: op.actorUserId!,
      role: "OWNER",
    },
    select: { id: true },
  });
  if (review.coaching)
    await applyCoachingRefundDisposition(tx, {
      workspaceId: op.workspaceId,
      enrollmentId: review.coaching.id,
      refundId: op.refundId!,
      actorUserId: op.actorUserId!,
      disposition,
    });
  if (disposition === "RETAIN_ACCESS") return;
  let returned = 0;
  for (const entry of review.bookings) {
    const booking = await tx.classBooking.findFirst({
      where: { workspaceId: op.workspaceId, id: entry.id },
    });
    if (!booking || booking.status === "CANCELLED") continue;
    if (!["BOOKED", "PENDING_PAYMENT"].includes(booking.status))
      throw new FinancialError(
        "Attendance changed during refund processing. The gym must review the confirmed refund's access outcome.",
      );
    if (booking.bookingType === "MEMBERSHIP")
      await settleMembershipAllowance({
        workspaceId: op.workspaceId,
        bookingId: booking.id,
        outcome: "PROVIDER_CANCEL",
        db: tx,
        financialOperationId: op.id,
        reason: `Verified refund ${op.refundId}`,
      });
    if (review.card && booking.memberPunchCardId === review.card.id)
      returned += booking.consumedPunchCount;
    await tx.classBooking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", consumedPunchCount: 0 },
    });
  }
  if (review.card) {
    const card = await tx.memberPunchCard.findUniqueOrThrow({
      where: { id: review.card.id },
    });
    if (returned) {
      const result = await adjustPunchCardUnits({
        workspaceId: op.workspaceId,
        memberId: card.memberId,
        cardId: card.id,
        delta: returned,
        operationKey: `refund-release:${op.id}`,
        reason: "Future reservations released after verified refund",
        actorWorkspaceUserId: owner?.id,
        financialOperationId: op.id,
        db: tx,
      });
      if (!result.ok) throw new FinancialError(result.message);
    }
    const units = card.remainingPunches + returned;
    if (units) {
      const result = await adjustPunchCardUnits({
        workspaceId: op.workspaceId,
        memberId: card.memberId,
        cardId: card.id,
        delta: -units,
        operationKey: `refund-retire:${op.id}`,
        reason: "Unused visits retired after verified refund",
        actorWorkspaceUserId: owner?.id,
        financialOperationId: op.id,
        db: tx,
      });
      if (!result.ok) throw new FinancialError(result.message);
    }
  }
}
export async function saveOwnerRefundEvidence(args: {
  operationId: string;
  accountId: string;
  evidence: RefundEvidence;
  db?: PrismaClient;
}) {
  const db = args.db ?? prisma;
  const loaded = await db.financialOperation.findUniqueOrThrow({
    where: { id: args.operationId },
  });
  await db.$transaction(async (tx) => {
    await lockClassSchedule(tx, loaded.workspaceId);
    await lockFinancialAccount(tx, loaded.workspaceId);
    const op = await tx.financialOperation.findUniqueOrThrow({
      where: { id: loaded.id },
    });
    const review = (op.payload as unknown as { review: OwnerRefundReview })
      .review;
    const e = args.evidence;
    if (
      op.kind !== "REFUND" ||
      op.providerAccountId !== args.accountId ||
      e.operationId !== op.id ||
      e.paymentIntentId !== review.paymentIntentId ||
      e.amountCents !== op.amountCents ||
      e.currency.toLowerCase() !== op.currency ||
      (op.providerReference && op.providerReference !== e.id)
    )
      throw new FinancialError(
        "The refund response does not match its approved request.",
      );
    if (op.status === "SUCCEEDED") return;
    const refund = await tx.refund.findUniqueOrThrow({
      where: { id: op.refundId! },
    });
    if (e.status === "succeeded") {
      if (refund.status !== "SUCCEEDED") {
        await tx.refund.update({
          where: { id: refund.id },
          data: {
            status: "SUCCEEDED",
            stripeRefundId: e.id,
            refundedAt: new Date(),
          },
        });
        const payment = await tx.payment.update({
          where: { id: op.paymentId! },
          data: { refundedAmountCents: { increment: e.amountCents } },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status:
              payment.refundedAmountCents >= payment.amountCents
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED",
          },
        });
      }
      await transitionFinancialOperation(
        tx,
        op,
        "SUBMITTED",
        { action: "refund_money_confirmed" },
        { providerReference: e.id, result: { moneyConfirmed: true } },
      );
    } else if (e.status === "failed" || e.status === "canceled") {
      if (refund.status === "SUCCEEDED") return;
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: "FAILED", stripeRefundId: e.id },
      });
      await releaseHolds(tx, op.id);
      await transitionFinancialOperation(
        tx,
        op,
        "FAILED",
        { action: "refund_failed" },
        {
          providerReference: e.id,
          lastError:
            "The processor did not complete this refund. Original access is unchanged.",
        },
      );
    } else
      await transitionFinancialOperation(
        tx,
        op,
        "SUBMITTED",
        { action: "refund_pending" },
        { providerReference: e.id },
      );
  });
  if (args.evidence.status !== "succeeded") return;
  try {
    await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, loaded.workspaceId);
      await lockFinancialAccount(tx, loaded.workspaceId);
      const op = await tx.financialOperation.findUniqueOrThrow({
        where: { id: loaded.id },
      });
      if (op.status === "SUCCEEDED") return;
      await retireAccess(tx, op);
      await releaseHolds(tx, op.id);
      await transitionFinancialOperation(
        tx,
        op,
        "SUCCEEDED",
        { action: "refund_and_access_confirmed" },
        {
          settledAt: new Date(),
          result: { moneyConfirmed: true, accessConfirmed: true },
          lastError: null,
        },
      );
      await tx.financialReviewCase.updateMany({
        where: {
          workspaceId: op.workspaceId,
          operationId: op.id,
          resolvedAt: null,
        },
        data: {
          resolvedAt: new Date(),
          resolution:
            "Processor refund and reviewed access disposition confirmed.",
        },
      });
    });
  } catch (error) {
    await markAdjustmentReview(
      db,
      loaded,
      error instanceof FinancialError
        ? error.message
        : "The refund is confirmed; its access outcome needs review.",
    );
  }
}
async function markAdjustmentReview(
  db: PrismaClient,
  loaded: FinancialOperation,
  message: string,
) {
  await db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, loaded.workspaceId);
    const op = await tx.financialOperation.findUniqueOrThrow({
      where: { id: loaded.id },
    });
    if (op.status === "SUCCEEDED" || op.status === "FAILED") return;
    await transitionFinancialOperation(
      tx,
      op,
      "REVIEW_REQUIRED",
      { action: "review_required" },
      { lastError: message },
    );
    await queueFinancialReview(tx, {
      workspaceId: op.workspaceId,
      sourceKey: `adjustment:${op.id}`,
      reason: message,
      operationId: op.id,
      payerAccountId: op.payerAccountId,
      memberId: op.beneficiaryMemberId,
      paymentId: op.paymentId,
      amountCents: op.amountCents,
      currency: op.currency,
    });
  });
}

export interface CreditIssueCommand {
  payerAccountId: string;
  amountCents: number;
  currency: string;
  reason: string;
  requestId: string;
  reviewHash: string;
}
async function creditIssueReview(
  tx: Tx,
  args: OwnerArgs & Omit<CreditIssueCommand, "requestId" | "reviewHash">,
) {
  assertAmount(args.amountCents);
  const currency = args.currency.toLowerCase();
  if (!Intl.supportedValuesOf("currency").includes(currency.toUpperCase()))
    throw new FinancialError("Choose a supported currency.");
  if (!args.reason.trim())
    throw new FinancialError("Record why this credit is being issued.");
  const account = await tx.financialAccount.findFirst({
    where: { id: args.payerAccountId, workspaceId: args.workspaceId },
    include: { member: { select: { fullName: true } } },
  });
  if (!account) throw new FinancialError("Choose a verified payer account.");
  const review = {
    payerAccountId: account.id,
    payer: account.member.fullName,
    memberId: account.memberId,
    accountVersion: account.updatedAt.toISOString(),
    amountCents: args.amountCents,
    currency,
    reason: args.reason.trim(),
    allowedUse: "MEMBERSHIP_INVOICE",
    expiresAt: null,
  };
  return { ...review, reviewHash: financialRequestHash(review) };
}
export async function previewOwnerCredit(
  args: OwnerArgs & Omit<CreditIssueCommand, "requestId" | "reviewHash">,
) {
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    return creditIssueReview(tx, args);
  });
}
export async function issueOwnerCredit(args: OwnerArgs & CreditIssueCommand) {
  assertRequest(args.requestId);
  const command = {
    payerAccountId: args.payerAccountId,
    amountCents: args.amountCents,
    currency: args.currency.toLowerCase(),
    reason: args.reason.trim(),
    requestId: args.requestId,
    reviewHash: args.reviewHash,
  };
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    const prior = await tx.financialOperation.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: args.workspaceId,
          operationKey: `issue-credit:${args.requestId}`,
        },
      },
    });
    if (prior) {
      if (
        financialRequestHash((prior.payload as Prisma.JsonObject).command) !==
        financialRequestHash(command)
      )
        throw new FinancialError(
          "This credit request changed. Open a new review.",
        );
      return prior;
    }
    const review = await creditIssueReview(tx, args);
    if (review.reviewHash !== args.reviewHash)
      throw new FinancialError(
        "The credit review changed. Review the current payer and amount.",
      );
    const creditId = randomUUID();
    const op = await reserveFinancialOperation(tx, {
      workspaceId: args.workspaceId,
      operationKey: `issue-credit:${args.requestId}`,
      kind: "ISSUE_CREDIT",
      actorUserId: args.actorUserId,
      payerAccountId: review.payerAccountId,
      beneficiaryMemberId: review.memberId,
      targetId: creditId,
      amountCents: review.amountCents,
      currency: review.currency,
      payload: json({ command, review, allowedUse: "MEMBERSHIP_INVOICE" }),
    });
    await tx.accountCredit.create({
      data: {
        id: creditId,
        workspaceId: args.workspaceId,
        payerAccountId: review.payerAccountId,
        memberId: review.memberId,
        originalAmountCents: review.amountCents,
        remainingAmountCents: review.amountCents,
        currency: review.currency,
        reason: review.reason,
        expiresAt: null,
      },
    });
    return transitionFinancialOperation(
      tx,
      op,
      "SUCCEEDED",
      { action: "monetary_credit_issued", allowedUse: "MEMBERSHIP_INVOICE" },
      { settledAt: new Date(), result: { creditId, creditIssued: true } },
    );
  });
}
async function creditApplicationReview(
  tx: Tx,
  args: OwnerArgs & { creditId: string },
) {
  const credit = await tx.accountCredit.findFirst({
    where: { id: args.creditId, workspaceId: args.workspaceId },
    include: {
      payerAccount: { include: { member: { select: { fullName: true } } } },
    },
  });
  if (
    !credit?.payerAccount ||
    credit.status !== "ACTIVE" ||
    (credit.expiresAt && credit.expiresAt <= new Date())
  )
    throw new FinancialError("This account credit is not available.");
  const issuance = await tx.financialOperation.findFirst({
    where: {
      workspaceId: args.workspaceId,
      targetId: credit.id,
      kind: "ISSUE_CREDIT",
      status: "SUCCEEDED",
    },
  });
  if (
    !issuance ||
    (issuance.payload as Prisma.JsonObject).allowedUse !== "MEMBERSHIP_INVOICE"
  )
    throw new FinancialError(
      "The allowed uses for this legacy credit need the owner's review before applying it.",
    );
  const account = credit.payerAccount;
  const pending = await tx.financialOperation.aggregate({
    where: {
      workspaceId: args.workspaceId,
      targetId: credit.id,
      kind: "APPLY_CREDIT",
      status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
    },
    _sum: { amountCents: true },
  });
  const membership = await tx.memberMembership.findFirst({
    where: {
      workspaceId: args.workspaceId,
      status: { in: ["ACTIVE", "PAST_DUE", "PENDING_PAYMENT_METHOD"] },
      membershipPlan: {
        currency: { equals: credit.currency, mode: "insensitive" },
      },
      OR: [
        { payerAccountId: account.id },
        ...(account.stripeCustomerId
          ? [
              {
                memberId: account.memberId,
                stripeCustomerId: account.stripeCustomerId,
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  const review = {
    creditId: credit.id,
    version: credit.updatedAt.toISOString(),
    payerAccountId: account.id,
    payer: account.member.fullName,
    memberId: account.memberId,
    currency: credit.currency.toLowerCase(),
    remainingCents: credit.remainingAmountCents,
    reservedCents: pending._sum.amountCents ?? 0,
    customerId: account.stripeCustomerId,
    providerAccountId: account.stripeAccountId,
    accountVersion: account.updatedAt.toISOString(),
    membershipId: membership?.id ?? null,
  };
  return {
    ...review,
    availableCents: Math.max(0, review.remainingCents - review.reservedCents),
    reviewHash: financialRequestHash(review),
    canApply: Boolean(
      review.customerId && review.providerAccountId && membership,
    ),
  };
}
export async function previewOwnerCreditApplication(
  args: OwnerArgs & { creditId: string },
) {
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    return creditApplicationReview(tx, args);
  });
}
export async function reserveOwnerCreditApplication(
  args: OwnerArgs & {
    creditId: string;
    amountCents: number;
    requestId: string;
    reviewHash: string;
  },
) {
  assertAmount(args.amountCents);
  assertRequest(args.requestId);
  const command = {
    creditId: args.creditId,
    amountCents: args.amountCents,
    requestId: args.requestId,
    reviewHash: args.reviewHash,
  };
  return (args.db ?? prisma).$transaction(async (tx) => {
    await locks(tx, args);
    const prior = await tx.financialOperation.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: args.workspaceId,
          operationKey: `apply-credit:${args.requestId}`,
        },
      },
    });
    if (prior) {
      if (
        financialRequestHash((prior.payload as Prisma.JsonObject).command) !==
        financialRequestHash(command)
      )
        throw new FinancialError(
          "This credit application changed. Open a new review.",
        );
      return prior;
    }
    const review = await creditApplicationReview(tx, args);
    if (review.reviewHash !== args.reviewHash)
      throw new FinancialError(
        "The available credit changed. Review its current balance.",
      );
    if (!review.canApply)
      throw new FinancialError(
        "A matching membership and verified processor customer are required. This credit remains available without expiry.",
      );
    if (args.amountCents > review.availableCents)
      throw new FinancialError(
        "This amount exceeds the unreserved credit balance.",
      );
    return reserveFinancialOperation(tx, {
      workspaceId: args.workspaceId,
      operationKey: `apply-credit:${args.requestId}`,
      kind: "APPLY_CREDIT",
      actorUserId: args.actorUserId,
      payerAccountId: review.payerAccountId,
      beneficiaryMemberId: review.memberId,
      targetId: review.creditId,
      amountCents: args.amountCents,
      currency: review.currency,
      providerAccountId: review.providerAccountId!,
      payload: json({ command, review, allowedUse: "MEMBERSHIP_INVOICE" }),
    });
  });
}
export async function saveOwnerCreditEvidence(args: {
  operationId: string;
  accountId: string;
  evidence: CreditEvidence;
  db?: PrismaClient;
}) {
  const db = args.db ?? prisma;
  const loaded = await db.financialOperation.findUniqueOrThrow({
    where: { id: args.operationId },
  });
  return db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, loaded.workspaceId);
    const op = await tx.financialOperation.findUniqueOrThrow({
      where: { id: loaded.id },
    });
    const review = (op.payload as unknown as { review: { customerId: string } })
      .review;
    const e = args.evidence;
    if (
      op.kind !== "APPLY_CREDIT" ||
      op.providerAccountId !== args.accountId ||
      e.operationId !== op.id ||
      e.customerId !== review.customerId ||
      e.amountCents !== -op.amountCents! ||
      e.currency.toLowerCase() !== op.currency ||
      (op.providerReference && op.providerReference !== e.id)
    )
      throw new FinancialError(
        "The processor credit does not match its approved payer, currency and amount.",
      );
    if (op.status === "SUCCEEDED") return op;
    const changed = await tx.accountCredit.updateMany({
      where: {
        id: op.targetId!,
        workspaceId: op.workspaceId,
        payerAccountId: op.payerAccountId,
        remainingAmountCents: { gte: op.amountCents! },
      },
      data: { remainingAmountCents: { decrement: op.amountCents! } },
    });
    if (changed.count !== 1)
      throw new FinancialError(
        "The processor credit was transferred, but the local balance needs review.",
      );
    await tx.accountCredit.updateMany({
      where: { id: op.targetId!, remainingAmountCents: 0 },
      data: { status: "APPLIED" },
    });
    const finished = await transitionFinancialOperation(
      tx,
      op,
      "SUCCEEDED",
      { action: "credit_transferred_to_processor_balance", cashPayment: false },
      {
        providerReference: e.id,
        settledAt: new Date(),
        lastError: null,
        result: { providerCreditConfirmed: true, invoicePaid: false },
      },
    );
    await tx.financialReviewCase.updateMany({
      where: {
        workspaceId: op.workspaceId,
        operationId: op.id,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
        resolution:
          "Credit transfer to the verified payer's processor balance confirmed; no local invoice marked paid.",
      },
    });
    return finished;
  });
}

/** Every retry uses the original provider request and key. Unknown results keep money/access reserved. */
export async function resumeOwnerAdjustment(
  args: OwnerArgs & {
    operationId: string;
    gateway: AdjustmentGateway;
    now?: Date;
  },
) {
  const db = args.db ?? prisma,
    now = args.now ?? new Date();
  let operation = await db.$transaction(async (tx) => {
    await locks(tx, args);
    const op = await tx.financialOperation.findFirst({
      where: {
        id: args.operationId,
        workspaceId: args.workspaceId,
        kind: { in: ["REFUND", "APPLY_CREDIT"] },
      },
    });
    if (!op) throw new FinancialError("Financial request not found.");
    return op;
  });
  if (operation.status === "SUCCEEDED" || operation.status === "FAILED")
    return operation;
  if (
    !operation.providerReference &&
    now.getTime() - operation.createdAt.getTime() >= 23 * 60 * 60_000
  ) {
    await markAdjustmentReview(
      db,
      operation,
      "The original processor response must be recovered before another request. Money and access remain reserved.",
    );
    return db.financialOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
  }
  try {
    const payload = operation.payload as unknown as {
      review: { paymentIntentId: string; customerId: string };
    };
    if (!operation.providerReference) {
      const created =
        operation.kind === "REFUND"
          ? await args.gateway.createRefund(
              {
                accountId: operation.providerAccountId!,
                paymentIntentId: payload.review.paymentIntentId,
                amountCents: operation.amountCents!,
                operationId: operation.id,
              },
              operation.providerIdempotencyKey,
            )
          : await args.gateway.createCredit(
              {
                accountId: operation.providerAccountId!,
                customerId: payload.review.customerId,
                amountCents: -operation.amountCents!,
                currency: operation.currency!,
                operationId: operation.id,
              },
              operation.providerIdempotencyKey,
            );
      operation = await db.$transaction(async (tx) => {
        await lockFinancialAccount(tx, operation.workspaceId);
        const current = await tx.financialOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        if (
          current.providerReference &&
          current.providerReference !== created.id
        )
          throw new FinancialError(
            "The processor returned a different reference for the same request.",
          );
        if (current.status === "SUCCEEDED" || current.status === "FAILED")
          return current;
        return transitionFinancialOperation(
          tx,
          current,
          "SUBMITTED",
          { action: "provider_request_identified" },
          {
            providerReference: created.id,
            submittedAt: current.submittedAt ?? now,
          },
        );
      });
    }
    if (operation.kind === "REFUND")
      await saveOwnerRefundEvidence({
        operationId: operation.id,
        accountId: operation.providerAccountId!,
        evidence: await args.gateway.retrieveRefund(
          operation.providerAccountId!,
          operation.providerReference!,
        ),
        db,
      });
    else
      await saveOwnerCreditEvidence({
        operationId: operation.id,
        accountId: operation.providerAccountId!,
        evidence: await args.gateway.retrieveCredit(
          operation.providerAccountId!,
          payload.review.customerId,
          operation.providerReference!,
        ),
        db,
      });
  } catch (error) {
    await markAdjustmentReview(
      db,
      operation,
      error instanceof FinancialError
        ? error.message
        : "The processor response is uncertain. Check this same request before creating another; the reserved amount remains unavailable.",
    );
  }
  return db.financialOperation.findUniqueOrThrow({
    where: { id: operation.id },
  });
}

/** Called only after signature verification and canonical processor retrieval. External refunds never change access automatically. */
export async function recordExternalRefundEvidence(args: {
  accountId: string;
  evidence: RefundEvidence;
  db?: PrismaClient;
}) {
  const db = args.db ?? prisma,
    e = args.evidence;
  if (!e.paymentIntentId) return;
  const payment = await db.payment.findFirst({
    where: {
      stripePaymentIntentId: e.paymentIntentId,
      OR: [
        { payerAccount: { stripeAccountId: args.accountId } },
        {
          workspace: {
            financialOperations: {
              some: {
                kind: "CHECKOUT",
                providerAccountId: args.accountId,
                paymentId: { not: null },
              },
            },
          },
        },
      ],
    },
  });
  if (!payment) return;
  // A workspace may have historical accounts. Verify this exact payment's stored account before using the event.
  const ownedAccount = await db.financialOperation.findFirst({
    where: {
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      providerAccountId: args.accountId,
    },
  });
  const payer = payment.payerAccountId
    ? await db.financialAccount.findUnique({
        where: { id: payment.payerAccountId },
      })
    : null;
  if (!ownedAccount && payer?.stripeAccountId !== args.accountId) return;
  if (
    e.currency.toLowerCase() !== payment.currency.toLowerCase() ||
    !Number.isSafeInteger(e.amountCents) ||
    e.amountCents <= 0
  )
    throw new FinancialError(
      "The external refund does not match its original payment.",
    );
  await db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, payment.workspaceId);
    const previous = await tx.refund.findFirst({
      where: { workspaceId: payment.workspaceId, stripeRefundId: e.id },
    });
    if (
      previous &&
      (previous.paymentId !== payment.id ||
        previous.amountCents !== e.amountCents)
    )
      throw new FinancialError(
        "The refund reference belongs to another recorded request.",
      );
    const status =
      e.status === "succeeded"
        ? "SUCCEEDED"
        : e.status === "failed" || e.status === "canceled"
          ? "FAILED"
          : "PENDING";
    if (previous?.status !== "SUCCEEDED") {
      const data = {
        status,
        refundedAt: status === "SUCCEEDED" ? new Date() : null,
      } as const;
      if (previous)
        await tx.refund.update({ where: { id: previous.id }, data });
      else
        await tx.refund.create({
          data: {
            ...data,
            workspaceId: payment.workspaceId,
            paymentId: payment.id,
            memberId: payment.memberId,
            amountCents: e.amountCents,
            currency: e.currency,
            stripeRefundId: e.id,
            reason:
              "Refund recorded outside HitLink; access outcome needs review",
          },
        });
    }
    if (status === "SUCCEEDED") {
      const total = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: "SUCCEEDED" },
        _sum: { amountCents: true },
      });
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      const refunded = Math.max(
        current.refundedAmountCents,
        total._sum.amountCents ?? 0,
      );
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountCents: refunded,
          status:
            refunded >= current.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
    }
    await queueFinancialReview(tx, {
      workspaceId: payment.workspaceId,
      sourceKey: `external-refund:${e.id}`,
      reason:
        "A refund was recorded outside HitLink. Confirm the payment and decide what happens to its remaining access.",
      memberId: payment.memberId,
      payerAccountId: payment.payerAccountId,
      paymentId: payment.id,
      amountCents: e.amountCents,
      currency: e.currency,
    });
  });
}
