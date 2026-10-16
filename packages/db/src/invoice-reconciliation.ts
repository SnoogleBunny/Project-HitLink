import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import {
  FinancialError,
  lockFinancialAccount,
  queueFinancialReview,
  transitionFinancialOperation,
} from "./financial-operations.js";

export interface InvoiceEvidence {
  id: string;
  accountId: string;
  subscriptionId: string | null;
  customerId: string | null;
  status: "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";
  number: string | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  firstFailedAt?: Date;
  failureCode: string | null;
  failureMessage: string | null;
  payments: Array<{
    allocationId: string;
    paymentIntentId: string | null;
    amountCents: number;
    paidAt: Date;
  }>;
}

/** Debt belongs to its invoice. Settlement cannot override contract, freeze or cancellation state. */
export async function recomputeMembershipBilling(
  tx: Prisma.TransactionClient,
  membershipId: string,
  now = new Date(),
) {
  const membership = await tx.memberMembership.findUniqueOrThrow({
    where: { id: membershipId },
    include: { billingState: true },
  });
  const unpaid = await tx.invoice.findMany({
    where: {
      workspaceId: membership.workspaceId,
      memberMembershipId: membership.id,
      status: { in: ["OPEN", "UNCOLLECTIBLE"] },
      amountDueCents: { gt: 0 },
      OR: [
        { firstFailedAt: { not: null } },
        { lastFailureCode: "payment_failure_time_unknown" },
      ],
    },
    orderBy: [
      { gracePeriodEndsAt: { sort: "asc", nulls: "first" } },
      { issuedAt: "asc" },
    ],
  });
  const debt = unpaid[0];
  const ended =
    ["CANCELLED", "ENDED"].includes(membership.status) ||
    Boolean(membership.endedAt && membership.endedAt <= now);
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: membership.allowanceTimezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const frozen =
    membership.status === "FROZEN" ||
    Boolean(
      membership.frozenFrom &&
      membership.frozenUntil &&
      membership.frozenFrom.toISOString().slice(0, 10) <= localToday &&
      membership.frozenUntil.toISOString().slice(0, 10) > localToday,
    );
  const status = ended
    ? membership.status === "CANCELLED"
      ? "CANCELLED"
      : "ENDED"
    : frozen
      ? "FROZEN"
      : debt
        ? "PAYMENT_FAILED"
        : membership.status === "PENDING_PAYMENT_METHOD"
          ? "PENDING_PAYMENT_METHOD"
          : "ACTIVE";
  // Keep lifecycle status separate from the ledger. Legacy access readers still use PAST_DUE.
  if (!ended && !frozen && ["ACTIVE", "PAST_DUE"].includes(membership.status))
    await tx.memberMembership.update({
      where: { id: membership.id },
      data: { status: debt ? "PAST_DUE" : "ACTIVE" },
    });
  const state = {
    status,
    failedAt: debt?.firstFailedAt ?? null,
    gracePeriodEndsAt: debt?.gracePeriodEndsAt ?? null,
    failureCode: debt?.lastFailureCode ?? null,
    failureMessage: debt?.lastFailureMessage ?? null,
    ...(debt ? { latestInvoiceId: debt.stripeInvoiceId } : {}),
  } as const;
  await tx.membershipBillingState.upsert({
    where: { memberMembershipId: membership.id },
    create: {
      workspaceId: membership.workspaceId,
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      ...state,
    },
    update: state,
  });
  return { status, unpaid, ended, frozen };
}

export async function reconcileMembershipInvoice(args: {
  workspaceId: string;
  evidence: InvoiceEvidence;
  eventId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const db = args.db ?? prisma,
    now = args.now ?? new Date(),
    evidence = args.evidence;
  if (
    ![
      evidence.totalCents,
      evidence.amountDueCents,
      evidence.amountPaidCents,
    ].every((amount) => Number.isSafeInteger(amount) && amount >= 0) ||
    !/^[a-z]{3}$/i.test(evidence.currency)
  )
    throw new FinancialError("Invalid invoice amounts from the processor.");
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await lockFinancialAccount(tx, args.workspaceId);
    const settings = await tx.workspaceStripeSettings.findUnique({
      where: { workspaceId: args.workspaceId },
    });
    if (!settings || settings.stripeAccountId !== evidence.accountId)
      throw new FinancialError("Invoice account does not match this gym.");
    const membership = evidence.subscriptionId
      ? await tx.memberMembership.findFirst({
          where: {
            workspaceId: args.workspaceId,
            stripeSubscriptionId: evidence.subscriptionId,
          },
          include: {
            billingState: true,
            member: { select: { fullName: true, email: true } },
            payerAccount: { include: { user: { select: { email: true } } } },
          },
        })
      : null;
    if (!membership) return { status: "unlinked" } as const;
    const customerId =
      membership.payerAccount?.stripeCustomerId ?? membership.stripeCustomerId;
    if (!customerId || customerId !== evidence.customerId)
      throw new FinancialError("Invoice payer does not match this membership.");
    const previous = await tx.invoice.findUnique({
      where: {
        workspaceId_stripeInvoiceId: {
          workspaceId: args.workspaceId,
          stripeInvoiceId: evidence.id,
        },
      },
    });
    if (previous?.status === "PAID" && evidence.status !== "PAID") {
      await queueFinancialReview(tx, {
        workspaceId: args.workspaceId,
        sourceKey: `invoice-regression:${evidence.id}`,
        memberId: membership.memberId,
        payerAccountId: membership.payerAccountId,
        reason:
          "The processor returned a non-paid state for a settled invoice. Reconcile without reopening settled debt.",
      });
      return { status: "review" } as const;
    }
    const legacyFailure =
      membership.billingState?.latestInvoiceId === evidence.id
        ? membership.billingState
        : null;
    // Once the original date is unknown, a later retry failure cannot restart grace.
    const unknownFailureTime =
      previous?.lastFailureCode === "payment_failure_time_unknown" ||
      (!previous?.firstFailedAt &&
        !legacyFailure?.failedAt &&
        evidence.failureCode === "payment_failure_time_unknown");
    const firstFailedAt = unknownFailureTime
      ? null
      : (previous?.firstFailedAt ??
        legacyFailure?.failedAt ??
        evidence.firstFailedAt ??
        null);
    const gracePeriodEndsAt = unknownFailureTime
      ? null
      : (previous?.gracePeriodEndsAt ??
        legacyFailure?.gracePeriodEndsAt ??
        (firstFailedAt
          ? new Date(
              firstFailedAt.getTime() +
                settings.failedPaymentGracePeriodDays * 86_400_000,
            )
          : null));
    const failureCode =
      unknownFailureTime && ["OPEN", "UNCOLLECTIBLE"].includes(evidence.status)
        ? "payment_failure_time_unknown"
        : evidence.failureCode === "payment_failure_time_unknown" &&
            firstFailedAt
          ? (previous?.lastFailureCode ??
            legacyFailure?.failureCode ??
            "payment_requires_attention")
          : evidence.failureCode;
    const failureMessage =
      failureCode === "payment_failure_time_unknown"
        ? "An attempted payment is unpaid. The original failure date needs review; no grace deadline has been assumed."
        : evidence.failureMessage;
    const data = {
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      payerAccountId: membership.payerAccountId,
      status: evidence.status,
      invoiceNumber: evidence.number,
      subtotalCents: evidence.subtotalCents,
      taxCents: evidence.taxCents,
      totalCents: evidence.totalCents,
      amountPaidCents: evidence.amountPaidCents,
      amountDueCents: evidence.amountDueCents,
      currency: evidence.currency.toLowerCase(),
      issuedAt: evidence.issuedAt,
      dueAt: evidence.dueAt,
      paidAt: evidence.paidAt,
      voidedAt: evidence.voidedAt,
      firstFailedAt,
      gracePeriodEndsAt,
      lastFailureCode: failureCode,
      lastFailureMessage: failureMessage,
    };
    const invoice = await tx.invoice.upsert({
      where: {
        workspaceId_stripeInvoiceId: {
          workspaceId: args.workspaceId,
          stripeInvoiceId: evidence.id,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        stripeInvoiceId: evidence.id,
        ...data,
      },
      update: data,
    });
    if (failureCode === "payment_failure_time_unknown")
      await queueFinancialReview(tx, {
        workspaceId: args.workspaceId,
        sourceKey: `invoice-failure-time:${invoice.id}`,
        memberId: membership.memberId,
        payerAccountId: membership.payerAccountId,
        amountCents: evidence.amountDueCents,
        currency: evidence.currency,
        reason: failureMessage!,
      });
    for (const payment of evidence.payments) {
      if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents < 0)
        throw new FinancialError("Invalid invoice payment allocation.");
      const key = {
        workspaceId: args.workspaceId,
        importedExternalId: `invoice-payment:${payment.allocationId}`,
      };
      const prior = await tx.payment.findUnique({
        where: { workspaceId_importedExternalId: key },
      });
      if (
        prior &&
        (prior.invoiceId !== invoice.id ||
          prior.amountCents !== payment.amountCents ||
          prior.currency !== evidence.currency.toLowerCase() ||
          prior.stripePaymentIntentId !== payment.paymentIntentId)
      )
        throw new FinancialError(
          "A settled invoice payment allocation changed and needs review.",
        );
      await tx.payment.upsert({
        where: { workspaceId_importedExternalId: key },
        update: {},
        create: {
          ...key,
          invoiceId: invoice.id,
          memberId: membership.memberId,
          memberMembershipId: membership.id,
          payerAccountId: membership.payerAccountId,
          status: "SUCCEEDED",
          amountCents: payment.amountCents,
          currency: evidence.currency.toLowerCase(),
          stripePaymentIntentId: payment.paymentIntentId,
          paidAt: payment.paidAt,
        },
      });
    }
    if (
      evidence.amountPaidCents >
      evidence.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
    )
      await queueFinancialReview(tx, {
        workspaceId: args.workspaceId,
        sourceKey: `invoice-allocation:${invoice.id}`,
        memberId: membership.memberId,
        payerAccountId: membership.payerAccountId,
        amountCents: evidence.amountPaidCents,
        currency: evidence.currency,
        reason:
          "The invoice includes money or account credit without a matching processor payment allocation. Reconcile before issuing a refund.",
      });
    const state = await recomputeMembershipBilling(tx, membership.id, now);
    if (evidence.status === "PAID") {
      await tx.membershipBillingState.updateMany({
        where: {
          memberMembershipId: membership.id,
          OR: [
            { lastPaymentAt: null },
            { lastPaymentAt: { lte: evidence.paidAt ?? now } },
          ],
        },
        data: {
          lastPaymentAt: evidence.paidAt ?? now,
          lastPaymentStatus: "SUCCEEDED",
        },
      });
      const retries = await tx.financialOperation.findMany({
        where: {
          workspaceId: args.workspaceId,
          invoiceId: invoice.id,
          kind: "RETRY_INVOICE",
          status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
        },
      });
      for (const retry of retries)
        await transitionFinancialOperation(
          tx,
          retry,
          "SUCCEEDED",
          { action: "invoice_settled", invoiceId: invoice.id },
          { settledAt: evidence.paidAt ?? now },
        );
    }
    if (
      !(await tx.billingRecord.findFirst({
        where: {
          workspaceId: args.workspaceId,
          stripeEventId: args.eventId,
          stripeInvoiceId: evidence.id,
        },
      }))
    )
      await tx.billingRecord.create({
        data: {
          workspaceId: args.workspaceId,
          memberId: membership.memberId,
          memberMembershipId: membership.id,
          type:
            evidence.status === "PAID"
              ? "PAYMENT_SUCCEEDED"
              : firstFailedAt &&
                  ["OPEN", "UNCOLLECTIBLE"].includes(evidence.status)
                ? "PAYMENT_FAILED"
                : "SUBSCRIPTION_UPDATED",
          status:
            evidence.status === "PAID"
              ? "SUCCEEDED"
              : firstFailedAt &&
                  ["OPEN", "UNCOLLECTIBLE"].includes(evidence.status)
                ? "FAILED"
                : "INFO",
          amountCents:
            evidence.status === "PAID"
              ? evidence.amountPaidCents
              : evidence.amountDueCents,
          currency: evidence.currency,
          stripeInvoiceId: evidence.id,
          stripeSubscriptionId: evidence.subscriptionId,
          stripeEventId: args.eventId,
          failureCode: evidence.failureCode,
          failureMessage: evidence.failureMessage,
        },
      });
    if (
      firstFailedAt &&
      !previous?.firstFailedAt &&
      ["OPEN", "UNCOLLECTIBLE"].includes(evidence.status)
    ) {
      await tx.failedPaymentCase.create({
        data: {
          workspaceId: args.workspaceId,
          memberId: membership.memberId,
          memberMembershipId: membership.id,
          failureCode: evidence.failureCode,
          failureMessage: evidence.failureMessage,
          openedAt: firstFailedAt,
        },
      });
      const email =
        membership.payerAccount?.user.email ?? membership.member.email;
      if (email)
        await tx.notificationJob.create({
          data: {
            workspaceId: args.workspaceId,
            recipientEmail: email,
            templateKind: "FAILED_PAYMENT",
            subject: "A membership payment needs attention",
            body: `A payment for ${membership.member.fullName} needs attention. Open Payments in your member account to review the balance and payment options.`,
            status: "PENDING",
            nextAttemptAt: now,
          },
        });
    }
    if (!state.unpaid.length)
      await tx.failedPaymentCase.updateMany({
        where: {
          workspaceId: args.workspaceId,
          memberMembershipId: membership.id,
          status: "OPEN",
        },
        data: { status: "RESOLVED", resolvedAt: now },
      });
    return {
      status: "reconciled",
      invoiceId: invoice.id,
      billingStatus: state.status,
    } as const;
  });
}
