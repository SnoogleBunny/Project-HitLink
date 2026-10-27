import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  lockClassSchedule,
  classOccurrenceInclude,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import { getOccurrenceStartsAt } from "./class-access.js";
import { toDateOnlyString } from "./occurrences.js";
import {
  financialRequestHash,
  FinancialError,
  lockFinancialAccount,
} from "./financial-operations.js";
import { settleMembershipAllowance } from "./membership-allowances.js";
import {
  settlePunchCardBooking,
  adjustPunchCardUnits,
} from "./punch-card-ledger.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";
import { enqueueNotificationJob } from "./notification-outbox.js";

type Tx = Prisma.TransactionClient;
export interface PaymentDisputeEvidence {
  id: string;
  accountId: string;
  livemode: boolean;
  chargeId: string;
  paymentIntentId: string | null;
  customerId: string | null;
  status: string;
  reason: string;
  amountCents: number;
  currency: string;
  chargeAmountCents: number;
  chargeRefundedCents: number;
  isChargeRefundable: boolean;
  evidenceDueAt: string | null;
  refunds: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
  }>;
  balanceTransactions: Array<{
    id: string;
    amount: number;
    fee: number;
    net: number;
    currency: string;
    type: string;
  }>;
  allocations: Array<{
    id: string;
    invoiceId: string;
    amountCents: number;
    customerId: string | null;
  }>;
}
export interface PaymentDisputeGateway {
  retrieve(
    accountId: string,
    disputeId: string,
  ): Promise<PaymentDisputeEvidence>;
  list(
    accountId: string,
    cursor?: string,
  ): Promise<{ ids: string[]; hasMore: boolean }>;
}
export class StaleDisputeEvidence extends FinancialError {}
const terminal = new Set(["won", "lost", "warning_closed", "prevented"]);
const formal = new Set(["needs_response", "under_review", "lost"]);
const known = new Set([
  ...terminal,
  "needs_response",
  "under_review",
  "warning_needs_response",
  "warning_under_review",
]);
function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function summary(dispute: {
  version: number;
  providerStatus: string;
  evidenceHash: string;
  accessState: string;
  moneyState: string;
  pendingTreatment: string;
  reviewerWorkspaceUserId: string | null;
  resolvedAt: Date | null;
}) {
  return {
    version: dispute.version,
    status: dispute.providerStatus,
    evidenceHash: dispute.evidenceHash,
    accessState: dispute.accessState,
    moneyState: dispute.moneyState,
    treatment: dispute.pendingTreatment,
    reviewer: dispute.reviewerWorkspaceUserId,
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
  };
}
async function owner(tx: Tx, workspaceId: string, userId: string) {
  const staff = await tx.workspaceUser.findFirst({
    where: { workspaceId, userId, isActive: true, role: "OWNER" },
    select: { id: true },
  });
  if (!staff)
    throw new FinancialError(
      "Only an active gym owner can review a payment dispute.",
    );
  return staff;
}
async function append(
  tx: Tx,
  args: {
    workspaceId: string;
    disputeId: string;
    requestKey: string;
    payloadHash: string;
    kind: string;
    actorUserId?: string;
    before: unknown;
    after: unknown;
    reason?: string;
  },
) {
  await tx.paymentDisputeEvent.create({
    data: {
      ...args,
      id: randomUUID(),
      before: json(args.before),
      after: json(args.after),
    },
  });
}

/** Return only proven local allocations. A PI alone is not a unique local payment. */
async function paymentsForEvidence(
  tx: Tx,
  workspaceId: string,
  evidence: PaymentDisputeEvidence,
) {
  if (!evidence.paymentIntentId || !evidence.customerId) return [];
  const candidates = await tx.payment.findMany({
    where: {
      workspaceId,
      stripePaymentIntentId: evidence.paymentIntentId,
      source: "CURRENT",
    },
    include: {
      payerAccount: true,
      invoice: true,
      member: { select: { workspaceId: true } },
    },
  });
  const verified = candidates.filter(
    (p) =>
      p.currency === evidence.currency &&
      p.payerAccount?.stripeAccountId === evidence.accountId &&
      p.payerAccount.workspaceId === workspaceId &&
      p.payerAccount.stripeCustomerId === evidence.customerId &&
      (!p.memberId || p.member?.workspaceId === workspaceId) &&
      p.amountCents > 0,
  );
  if (evidence.allocations.length) {
    return verified.filter((p) =>
      evidence.allocations.some(
        (a) =>
          p.importedExternalId === `invoice-payment:${a.id}` &&
          p.invoice?.stripeInvoiceId === a.invoiceId &&
          p.invoice.workspaceId === workspaceId &&
          p.amountCents === a.amountCents &&
          a.customerId === evidence.customerId,
      ),
    );
  }
  if (
    candidates.length !== 1 ||
    verified.length !== 1 ||
    verified[0]!.amountCents !== evidence.chargeAmountCents
  )
    return [];
  const checkout = await tx.financialOperation.findFirst({
    where: {
      workspaceId,
      kind: "CHECKOUT",
      status: "SUCCEEDED",
      paymentId: verified[0]!.id,
      providerAccountId: evidence.accountId,
    },
    select: { id: true },
  });
  const coaching = await tx.coachingEnrollment.findFirst({
    where: {
      workspaceId,
      paymentId: verified[0]!.id,
      checkoutAccountId: evidence.accountId,
      paymentState: "PAID",
    },
    select: { id: true },
  });
  return checkout || coaching ? verified : [];
}

async function scope(
  tx: Tx,
  workspaceId: string,
  paymentIds: string[],
  now: Date,
) {
  const payments = await tx.payment.findMany({
    where: { workspaceId, id: { in: paymentIds } },
  });
  const checkout = await tx.financialOperation.findMany({
    where: {
      workspaceId,
      paymentId: { in: paymentIds },
      kind: "CHECKOUT",
      status: "SUCCEEDED",
    },
    select: { providerReference: true, paymentId: true },
  });
  const cardCandidates = await tx.memberPunchCard.findMany({
    where: {
      workspaceId,
      stripeCheckoutSessionId: {
        in: checkout.flatMap((c) =>
          c.providerReference ? [c.providerReference] : [],
        ),
      },
    },
    select: {
      id: true,
      memberId: true,
      remainingPunches: true,
      originalPunches: true,
      status: true,
      updatedAt: true,
      acceptedTerms: true,
      punchCardProduct: { select: { name: true } },
      stripeCheckoutSessionId: true,
    },
  });
  const cards = cardCandidates.filter((c) =>
    checkout.some(
      (op) =>
        op.providerReference === c.stripeCheckoutSessionId &&
        payments.some(
          (p) => p.id === op.paymentId && p.memberId === c.memberId,
        ),
    ),
  );
  const membershipCandidates = await tx.memberMembership.findMany({
    where: {
      workspaceId,
      id: {
        in: payments.flatMap((p) =>
          p.memberMembershipId ? [p.memberMembershipId] : [],
        ),
      },
    },
    select: {
      id: true,
      memberId: true,
      status: true,
      updatedAt: true,
      acceptedTerms: true,
      endedAt: true,
      membershipPlan: { select: { name: true } },
    },
  });
  const membershipDetails = membershipCandidates.filter((m) =>
    payments.some(
      (p) => p.memberMembershipId === m.id && p.memberId === m.memberId,
    ),
  );
  const memberships = membershipDetails.map((m) => m.id);
  const intents = payments.flatMap((p) =>
    p.stripePaymentIntentId ? [p.stripePaymentIntentId] : [],
  );
  const zone =
    (
      await tx.location.findFirst({
        where: { workspaceId },
        select: { timezone: true },
      })
    )?.timezone ?? "UTC";
  const all = await tx.classBooking.findMany({
    where: {
      workspaceId,
      memberId: {
        in: payments.flatMap((p) => (p.memberId ? [p.memberId] : [])),
      },
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      OR: [
        { fundingMembershipId: { in: memberships } },
        { memberPunchCardId: { in: cards.map((c) => c.id) } },
        { dropInPaymentIntentId: { in: intents } },
        { fundedByBooking: { dropInPaymentIntentId: { in: intents } } },
      ],
    },
    include: { classTemplate: { include: classOccurrenceInclude } },
  });
  const bookings = all.filter((b) => {
    const occurrence = resolveClassOccurrence({
      template: b.classTemplate,
      scheduledForDate: toDateOnlyString(b.scheduledForDate),
    });
    return (
      getOccurrenceStartsAt({
        scheduledForDate: toDateOnlyString(b.scheduledForDate),
        startTimeMinutes:
          occurrence?.startTimeMinutes ?? b.classTemplate.startTimeMinutes,
        timezone: occurrence?.timezone ?? zone,
      }) > now
    );
  });
  const enrollmentCandidates = await tx.coachingEnrollment.findMany({
    where: { workspaceId, paymentId: { in: paymentIds } },
    select: {
      id: true,
      memberId: true,
      paymentId: true,
      version: true,
      status: true,
      closedAt: true,
      startsOn: true,
      endsOn: true,
      timezone: true,
      programVersionId: true,
      proposedProgramVersionId: true,
      acceptedAt: true,
      currentCoachWorkspaceUserId: true,
      paymentState: true,
      settlementState: true,
      retrievalUntil: true,
      programVersion: {
        select: {
          number: true,
          appointmentUnits: true,
          priceCents: true,
          currency: true,
          terms: true,
          retrievalDays: true,
          program: { select: { name: true } },
        },
      },
    },
  });
  const enrollments = enrollmentCandidates.filter((e) =>
    payments.some((p) => p.id === e.paymentId && p.memberId === e.memberId),
  );
  const appointments = await tx.coachingAppointment.findMany({
    where: {
      workspaceId,
      enrollmentId: { in: enrollments.map((e) => e.id) },
      status: "BOOKED",
      startsAt: { gt: now },
    },
    select: {
      id: true,
      enrollmentId: true,
      version: true,
      unitState: true,
      status: true,
      startsAt: true,
      endsAt: true,
      coachWorkspaceUserId: true,
      roomId: true,
      coach: { select: { user: { select: { fullName: true } } } },
      room: { select: { name: true } },
    },
  });
  const unitUses = await tx.coachingAppointment.findMany({
    where: { workspaceId, enrollmentId: { in: enrollments.map((e) => e.id) } },
    select: {
      id: true,
      enrollmentId: true,
      unitState: true,
      status: true,
      version: true,
    },
  });
  const bookingDetails = bookings.map((b) => {
    const occurrence = resolveClassOccurrence({
      template: b.classTemplate,
      scheduledForDate: toDateOnlyString(b.scheduledForDate),
    });
    return {
      id: b.id,
      memberId: b.memberId,
      title: occurrence?.displayTitle ?? b.classTemplate.program.name,
      scheduledForDate: toDateOnlyString(b.scheduledForDate),
      startTimeMinutes:
        occurrence?.startTimeMinutes ?? b.classTemplate.startTimeMinutes,
      endTimeMinutes:
        occurrence?.endTimeMinutes ?? b.classTemplate.endTimeMinutes,
      timezone: occurrence?.timezone ?? zone,
      roomId: occurrence?.roomId ?? b.classTemplate.roomId,
      roomName: occurrence?.room.name ?? b.classTemplate.room.name,
      coachName: occurrence?.coachDisplayName ?? "Coach to be confirmed",
      funding: b.bookingType,
      version: b.updatedAt.toISOString(),
    };
  });
  const targets = [
    ...cards.map((c) => ({ targetKind: "PUNCH_CARD", targetId: c.id })),
    ...memberships.map((id) => ({ targetKind: "MEMBERSHIP", targetId: id })),
    ...enrollments.map((e) => ({ targetKind: "COACHING", targetId: e.id })),
    ...bookings.map((b) => ({ targetKind: "BOOKING", targetId: b.id })),
  ];
  return {
    cards,
    memberships,
    membershipDetails,
    enrollments,
    bookings,
    bookingDetails,
    appointments,
    unitUses,
    targets,
  };
}

/** Signature-verified callers must still supply canonical, account-scoped provider evidence. */
export async function savePaymentDisputeEvidence(args: {
  workspaceId: string;
  accountId: string;
  livemode: boolean;
  evidence: PaymentDisputeEvidence;
  expectedVersion: number;
  eventId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const db = args.db ?? prisma,
    e = args.evidence,
    now = args.now ?? new Date();
  if (
    e.accountId !== args.accountId ||
    e.livemode !== args.livemode ||
    !e.id ||
    !e.chargeId ||
    !/^[a-z]{3}$/.test(e.currency) ||
    !Number.isSafeInteger(e.amountCents) ||
    e.amountCents <= 0 ||
    !Number.isSafeInteger(e.chargeAmountCents) ||
    e.chargeAmountCents <= 0 ||
    !Number.isSafeInteger(e.chargeRefundedCents) ||
    e.chargeRefundedCents < 0 ||
    e.chargeRefundedCents > e.chargeAmountCents
  )
    throw new FinancialError(
      "The dispute evidence does not match its processor account and mode.",
    );
  return db.$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      await lockFinancialAccount(tx, args.workspaceId);
      const settings = await tx.workspaceStripeSettings.findUnique({
        where: { workspaceId: args.workspaceId },
        select: { stripeAccountId: true },
      });
      if (settings?.stripeAccountId !== args.accountId)
        throw new FinancialError(
          "The dispute belongs to a different processor account.",
        );
      const key = {
        providerAccountId: args.accountId,
        livemode: args.livemode,
        providerDisputeId: e.id,
      };
      const prior = await tx.paymentDispute.findUnique({
        where: { providerAccountId_livemode_providerDisputeId: key },
      });
      if (prior && prior.workspaceId !== args.workspaceId)
        throw new FinancialError("The dispute belongs to a different gym.");
      if ((prior?.version ?? 0) !== args.expectedVersion)
        throw new StaleDisputeEvidence(
          "The dispute changed while the processor was being checked. Check it again.",
        );
      const payments = await paymentsForEvidence(tx, args.workspaceId, e);
      const fullyLinked =
        payments.length > 0 &&
        payments.reduce((sum, p) => sum + p.amountCents, 0) ===
          e.chargeAmountCents;
      const evidenceHash = financialRequestHash({
        evidence: e,
        paymentIds: payments.map((p) => p.id).sort(),
      });
      if (prior?.evidenceHash === evidenceHash) return prior;
      if (
        prior &&
        (prior.chargeId !== e.chargeId ||
          prior.paymentIntentId !== e.paymentIntentId ||
          prior.amountCents !== e.amountCents ||
          prior.currency !== e.currency)
      )
        throw new FinancialError(
          "The processor dispute identity changed and needs reconciliation.",
        );
      const reviewer =
        (prior?.reviewerWorkspaceUserId &&
          (await tx.workspaceUser.findFirst({
            where: {
              id: prior.reviewerWorkspaceUserId,
              workspaceId: args.workspaceId,
              role: "OWNER",
              isActive: true,
            },
            select: { id: true },
          }))) ||
        (await tx.workspaceUser.findFirst({
          where: {
            workspaceId: args.workspaceId,
            role: "OWNER",
            isActive: true,
          },
          orderBy: { id: "asc" },
          select: { id: true },
        }));
      const isTerminal = terminal.has(e.status),
        isFormal = formal.has(e.status);
      const previousEvidence = prior?.evidence as unknown as
        | PaymentDisputeEvidence
        | undefined;
      const lateRecovery =
        prior?.providerStatus === "lost" &&
        e.status === "lost" &&
        e.balanceTransactions.some(
          (b) =>
            b.amount > 0 &&
            !previousEvidence?.balanceTransactions.some(
              (old) => old.id === b.id,
            ),
        );
      const lostNeedsReview =
        e.status === "lost" &&
        !(
          prior?.providerStatus === "lost" &&
          ["RETAINED", "REVOKED"].includes(prior.accessState)
        );
      const safeRelease =
        ["won", "warning_closed"].includes(e.status) ||
        (e.status === "prevented" && e.chargeRefundedCents === 0);
      // A later verified recovery can release pending holds, but never resurrect retired units/contracts.
      const accessState = !fullyLinked
        ? "LINKAGE_REVIEW"
        : lateRecovery
          ? "RECOVERY_REVIEW"
          : lostNeedsReview
            ? "REVIEW_REQUIRED"
            : safeRelease
              ? prior?.accessState === "REVOKED"
                ? "RECOVERY_REVIEW"
                : "RELEASED"
              : e.status === "prevented"
                ? "REVIEW_REQUIRED"
                : !known.has(e.status)
                  ? "HELD"
                  : isFormal
                    ? prior?.accessState === "RETAINED" ||
                      prior?.accessState === "REVOKED"
                      ? prior.accessState
                      : "HELD"
                    : "UNCHANGED";
      const resolved =
        fullyLinked &&
        isTerminal &&
        ["RELEASED", "RETAINED", "REVOKED"].includes(accessState) &&
        known.has(e.status);
      const data = {
        ...key,
        chargeId: e.chargeId,
        paymentIntentId: e.paymentIntentId,
        paymentId:
          fullyLinked && payments.length === 1 ? payments[0]!.id : null,
        providerStatus: e.status,
        reason: e.reason,
        amountCents: e.amountCents,
        currency: e.currency,
        chargeAmountCents: e.chargeAmountCents,
        chargeRefundedCents: e.chargeRefundedCents,
        isChargeRefundable: e.isChargeRefundable,
        evidenceDueAt: e.evidenceDueAt ? new Date(e.evidenceDueAt) : null,
        evidence: json(e),
        evidenceHash,
        reviewerWorkspaceUserId: reviewer?.id ?? null,
        accessState,
        moneyState:
          e.status === "lost"
            ? lateRecovery
              ? "LOST_WITH_FUNDS_RECOVERY"
              : "LOST"
            : e.status === "won"
              ? "WON"
              : ["warning_closed", "prevented"].includes(e.status)
                ? "NO_DEBIT_OR_REFUND_REVIEW"
                : known.has(e.status)
                  ? "PENDING"
                  : "UNKNOWN",
        lastVerifiedAt: now,
        lastError: !known.has(e.status)
          ? "UNSUPPORTED_STATUS"
          : !fullyLinked
            ? "PAYMENT_LINKAGE_REVIEW"
            : null,
        resolvedAt: resolved ? now : null,
      };
      const dispute = prior
        ? await tx.paymentDispute.update({
            where: { id: prior.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.paymentDispute.create({
            data: { id: randomUUID(), workspaceId: args.workspaceId, ...data },
          });
      for (const p of payments) {
        const allocation = await tx.paymentDisputeAllocation.findUnique({
          where: {
            disputeId_paymentId: { disputeId: dispute.id, paymentId: p.id },
          },
        });
        if (!allocation)
          await tx.paymentDisputeAllocation.create({
            data: {
              workspaceId: args.workspaceId,
              disputeId: dispute.id,
              paymentId: p.id,
              fundedAmountCents: p.amountCents,
              providerAllocationId: p.importedExternalId?.startsWith(
                "invoice-payment:",
              )
                ? p.importedExternalId.slice(16)
                : null,
            },
          });
      }
      const affected = await scope(
        tx,
        args.workspaceId,
        payments.map((p) => p.id),
        now,
      );
      if (
        [
          "HELD",
          "REVIEW_REQUIRED",
          "LINKAGE_REVIEW",
          "RECOVERY_REVIEW",
        ].includes(accessState) &&
        (isFormal || e.status === "prevented" || !known.has(e.status))
      ) {
        for (const target of affected.targets) {
          if (
            !(await tx.financialEntitlementHold.findFirst({
              where: {
                workspaceId: args.workspaceId,
                disputeId: dispute.id,
                ...target,
                activeSlot: "ACTIVE",
              },
            }))
          )
            await tx.financialEntitlementHold.create({
              data: {
                workspaceId: args.workspaceId,
                disputeId: dispute.id,
                ...target,
              },
            });
        }
      } else if (safeRelease)
        await tx.financialEntitlementHold.updateMany({
          where: {
            workspaceId: args.workspaceId,
            disputeId: dispute.id,
            activeSlot: "ACTIVE",
          },
          data: { activeSlot: null, releasedAt: now },
        });
      const linked = fullyLinked && payments.length === 1 ? payments[0]! : null;
      await tx.financialReviewCase.upsert({
        where: {
          workspaceId_sourceKey: {
            workspaceId: args.workspaceId,
            sourceKey: `dispute:${args.accountId}:${args.livemode}:${e.id}`,
          },
        },
        create: {
          workspaceId: args.workspaceId,
          sourceKey: `dispute:${args.accountId}:${args.livemode}:${e.id}`,
          disputeId: dispute.id,
          paymentId: linked?.id,
          memberId: linked?.memberId,
          payerAccountId: linked?.payerAccountId,
          amountCents: e.amountCents,
          currency: e.currency,
          reason:
            "Processor payment dispute. Existing reservations remain in place pending owner review.",
          resolvedAt: resolved ? now : null,
          resolution: resolved
            ? "Verified processor outcome and access treatment confirmed."
            : null,
        },
        update: {
          paymentId: linked?.id ?? null,
          memberId: linked?.memberId ?? null,
          payerAccountId: linked?.payerAccountId ?? null,
          resolvedAt: resolved ? now : null,
          resolution: resolved
            ? "Verified processor outcome and access treatment confirmed."
            : null,
        },
      });
      await append(tx, {
        workspaceId: args.workspaceId,
        disputeId: dispute.id,
        requestKey: `provider:${args.eventId}:${evidenceHash}`,
        payloadHash: evidenceHash,
        kind: "PROVIDER_VERIFIED",
        before: prior ? summary(prior) : {},
        after: summary(dispute),
      });
      return dispute;
    },
    { timeout: 20_000 },
  );
}

export async function getOwnerPaymentDispute(args: {
  workspaceId: string;
  actorUserId: string;
  disputeId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  return (args.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await owner(tx, args.workspaceId, args.actorUserId);
    await lockFinancialAccount(tx, args.workspaceId);
    return review(tx, args.workspaceId, args.disputeId, args.now ?? new Date());
  });
}
async function review(
  tx: Tx,
  workspaceId: string,
  disputeId: string,
  now: Date,
) {
  const dispute = await tx.paymentDispute.findFirst({
    where: { id: disputeId, workspaceId },
    include: {
      allocations: {
        include: {
          payment: {
            include: {
              member: { select: { fullName: true } },
              payerAccount: {
                include: { member: { select: { fullName: true } } },
              },
            },
          },
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dispute) throw new FinancialError("Payment dispute not found.");
  const affected = await scope(
    tx,
    workspaceId,
    dispute.allocations.map((a) => a.paymentId),
    now,
  );
  const owners = await tx.workspaceUser.findMany({
    where: { workspaceId, role: "OWNER", isActive: true },
    select: { id: true, user: { select: { fullName: true, email: true } } },
  });
  const snapshot = {
    state: summary(dispute),
    bookings: affected.bookingDetails,
    cards: affected.cards,
    memberships: affected.membershipDetails,
    enrollments: affected.enrollments,
    appointments: affected.appointments,
    unitUses: affected.unitUses,
  };
  return {
    dispute,
    affected,
    owners,
    reviewHash: financialRequestHash(snapshot),
  };
}

/** Owner action changes access/review ownership only. It never asserts a processor win/loss or creates a refund. */
export async function reviewOwnerPaymentDispute(args: {
  workspaceId: string;
  actorUserId: string;
  disputeId: string;
  requestId: string;
  reviewHash: string;
  reviewerWorkspaceUserId: string;
  treatment:
    | "KEEP_RESERVATIONS"
    | "RELEASE_FUTURE_RESERVATIONS"
    | "RETAIN_ACCESS"
    | "REVOKE_UNUSED_ACCESS";
  reason: string;
  db?: PrismaClient;
  now?: Date;
}) {
  if (
    !/^[\w-]{1,100}$/.test(args.requestId) ||
    !args.reason.trim() ||
    args.reason.length > 2000
  )
    throw new FinancialError(
      "Record the review reason and use a fresh review request.",
    );
  const payloadHash = financialRequestHash({
    actor: args.actorUserId,
    reviewHash: args.reviewHash,
    reviewer: args.reviewerWorkspaceUserId,
    treatment: args.treatment,
    reason: args.reason.trim(),
  });
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      const actor = await owner(tx, args.workspaceId, args.actorUserId);
      await lockFinancialAccount(tx, args.workspaceId);
      const prior = await tx.paymentDisputeEvent.findUnique({
        where: {
          disputeId_requestKey: {
            disputeId: args.disputeId,
            requestKey: `owner:${args.requestId}`,
          },
        },
      });
      if (prior) {
        if (
          prior.workspaceId !== args.workspaceId ||
          prior.payloadHash !== payloadHash
        )
          throw new FinancialError(
            "This dispute review request changed. Open a fresh review.",
          );
        return;
      }
      const current = await review(tx, args.workspaceId, args.disputeId, now),
        d = current.dispute;
      if (current.reviewHash !== args.reviewHash)
        throw new FinancialError(
          "The dispute or its reservations changed. Review the latest details.",
        );
      if (
        !(await tx.workspaceUser.findFirst({
          where: {
            workspaceId: args.workspaceId,
            id: args.reviewerWorkspaceUserId,
            role: "OWNER",
            isActive: true,
          },
        }))
      )
        throw new FinancialError(
          "Choose an active gym owner to review this dispute.",
        );
      if (
        ![
          "KEEP_RESERVATIONS",
          "RELEASE_FUTURE_RESERVATIONS",
          "RETAIN_ACCESS",
          "REVOKE_UNUSED_ACCESS",
        ].includes(args.treatment)
      )
        throw new FinancialError(
          "Choose the pending reservation or final access treatment.",
        );
      const final =
        args.treatment === "RETAIN_ACCESS" ||
        args.treatment === "REVOKE_UNUSED_ACCESS";
      if (final && !terminal.has(d.providerStatus))
        throw new FinancialError(
          "The processor has not confirmed a final dispute outcome. Financial and access holds remain pending.",
        );
      if (final && d.lastError)
        throw new FinancialError(
          "Reconcile the dispute's payment allocation before confirming its access outcome.",
        );
      if (
        args.treatment === "REVOKE_UNUSED_ACCESS" &&
        d.providerStatus !== "lost" &&
        !(d.providerStatus === "prevented" && d.chargeRefundedCents > 0)
      )
        throw new FinancialError(
          "Unused access can be retired only for a verified loss or separately confirmed refund.",
        );
      if (
        args.treatment === "REVOKE_UNUSED_ACCESS" &&
        (d.amountCents !== d.chargeAmountCents || d.allocations.length !== 1)
      )
        throw new FinancialError(
          "This partial or shared payment needs an individual service settlement. Release reviewed future reservations or explicitly retain remaining access; no proportional units have been assumed.",
        );
      if (
        args.treatment === "RELEASE_FUTURE_RESERVATIONS" ||
        args.treatment === "REVOKE_UNUSED_ACCESS"
      )
        await releaseFuture(
          tx,
          current,
          actor.id,
          args.actorUserId,
          args.requestId,
          args.reason.trim(),
          now,
        );
      if (args.treatment === "REVOKE_UNUSED_ACCESS") {
        // Membership billing/closure requires its own provider-confirmed lifecycle; never silently stop a subscription.
        const active = await tx.memberMembership.count({
          where: {
            workspaceId: args.workspaceId,
            id: { in: current.affected.memberships },
            status: { notIn: ["CANCELLED", "ENDED"] },
          },
        });
        if (active)
          throw new FinancialError(
            "Close the affected membership through its verified lifecycle before retiring access, or explicitly retain its access.",
          );
        for (const card of current.affected.cards) {
          const live = await tx.memberPunchCard.findUniqueOrThrow({
            where: { id: card.id },
          });
          if (live.remainingPunches) {
            const result = await adjustPunchCardUnits({
              workspaceId: args.workspaceId,
              memberId: live.memberId,
              cardId: live.id,
              delta: -live.remainingPunches,
              operationKey: `dispute:${d.id}:retire:${args.requestId}`,
              actorWorkspaceUserId: actor.id,
              reason: args.reason.trim(),
              db: tx,
              exceptDisputeId: d.id,
            });
            if (!result.ok) throw new FinancialError(result.message);
          }
        }
        for (const enrollment of current.affected.enrollments) {
          const live = await tx.coachingEnrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
            include: { programVersion: { select: { retrievalDays: true } } },
          });
          await tx.coachingEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: "CLOSED",
              closedAt: live.closedAt ?? now,
              retrievalUntil:
                live.retrievalUntil ??
                new Date(
                  now.getTime() + live.programVersion.retrievalDays * 86400_000,
                ),
              settlementState: "REVIEW_RECORDED",
              settlementNote:
                "Verified payment dispute outcome; unused access retired by owner review.",
              exportState: "AVAILABLE",
              version: { increment: 1 },
            },
          });
          await notifyCoachingChange(
            tx,
            d.workspaceId,
            d.id,
            enrollment.id,
            args.requestId,
            now,
          );
        }
      }
      if (final)
        await tx.financialEntitlementHold.updateMany({
          where: {
            workspaceId: args.workspaceId,
            disputeId: d.id,
            activeSlot: "ACTIVE",
          },
          data: { activeSlot: null, releasedAt: now },
        });
      const changed = await tx.paymentDispute.update({
        where: { id: d.id },
        data: {
          reviewerWorkspaceUserId: args.reviewerWorkspaceUserId,
          pendingTreatment: args.treatment,
          accessState: final
            ? args.treatment === "RETAIN_ACCESS"
              ? "RETAINED"
              : "REVOKED"
            : d.accessState,
          resolvedAt: final ? now : d.resolvedAt,
          version: { increment: 1 },
        },
      });
      if (final)
        await tx.financialReviewCase.updateMany({
          where: { workspaceId: args.workspaceId, disputeId: d.id },
          data: {
            resolvedAt: now,
            resolvedByUserId: args.actorUserId,
            resolution: args.reason.trim(),
          },
        });
      await append(tx, {
        workspaceId: args.workspaceId,
        disputeId: d.id,
        requestKey: `owner:${args.requestId}`,
        payloadHash,
        kind: final ? "ACCESS_OUTCOME_REVIEWED" : "PENDING_TREATMENT_REVIEWED",
        actorUserId: args.actorUserId,
        before: summary(d),
        after: {
          ...summary(changed),
          releasedBookingIds:
            args.treatment === "RELEASE_FUTURE_RESERVATIONS" ||
            args.treatment === "REVOKE_UNUSED_ACCESS"
              ? current.affected.bookings.map((b) => b.id)
              : [],
          releasedAppointmentIds:
            args.treatment === "RELEASE_FUTURE_RESERVATIONS" ||
            args.treatment === "REVOKE_UNUSED_ACCESS"
              ? current.affected.appointments.map((a) => a.id)
              : [],
          retiredCardIds:
            args.treatment === "REVOKE_UNUSED_ACCESS"
              ? current.affected.cards.map((c) => c.id)
              : [],
          closedEnrollmentIds:
            args.treatment === "REVOKE_UNUSED_ACCESS"
              ? current.affected.enrollments.map((e) => e.id)
              : [],
        },
        reason: args.reason.trim(),
      });
    },
    { timeout: 20_000 },
  );
}

async function releaseFuture(
  tx: Tx,
  current: Awaited<ReturnType<typeof review>>,
  actorWorkspaceUserId: string,
  actorUserId: string,
  requestId: string,
  reason: string,
  now: Date,
) {
  const d = current.dispute;
  const otherHold = await financialEntitlementHoldReason({
    workspaceId: d.workspaceId,
    targets: current.affected.targets,
    db: tx,
    exceptDisputeId: d.id,
  });
  if (otherHold) throw new FinancialError(otherHold);
  // Only this case's hold is bypassed; every other refund/dispute hold remains authoritative.
  for (const booking of current.affected.bookings) {
    if (booking.bookingType === "MEMBERSHIP")
      await settleMembershipAllowance({
        workspaceId: d.workspaceId,
        bookingId: booking.id,
        outcome: "PROVIDER_CANCEL",
        reason,
        actorWorkspaceUserId,
        db: tx,
        exceptDisputeId: d.id,
      });
    if (booking.bookingType === "PUNCH_CARD") {
      const result = await settlePunchCardBooking({
        workspaceId: d.workspaceId,
        bookingId: booking.id,
        outcome: "PROVIDER_CANCEL",
        reason,
        actorWorkspaceUserId,
        db: tx,
        exceptDisputeId: d.id,
      });
      if (!result.ok) throw new FinancialError(result.message);
    }
    await tx.classBooking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", consumedPunchCount: 0 },
    });
    const recipients = await memberNotificationRecipients(tx, d.workspaceId, [
      booking.memberId,
    ]);
    const detail = current.affected.bookingDetails.find(
      (b) => b.id === booking.id,
    )!;
    for (const recipient of recipients)
      await enqueueNotificationJob({
        db: tx,
        now,
        input: {
          workspaceId: d.workspaceId,
          templateKind: "ANNOUNCEMENT",
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject: "Your class reservation was released",
          body: `Your reservation for ${detail.title} on ${detail.scheduledForDate} was released without penalty after gym review. Sign in to your member portal to review the class and any eligible rebooking.`,
          dedupeKey: `dispute:${d.id}:${requestId}:class:${booking.id}:${financialRequestHash(recipient.email)}`,
          context: { kind: "MEMBER_ACCESS", memberId: booking.memberId },
        },
      });
  }
  for (const appointment of current.affected.appointments) {
    if (appointment.unitState !== "HELD")
      throw new FinancialError(
        "An appointment unit needs separate review before cancelling it.",
      );
    const before = await tx.coachingAppointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    await tx.coachingAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "PROVIDER_CANCELLED",
        unitState: "RELEASED",
        reason,
        version: { increment: 1 },
      },
    });
    await tx.coachingAppointmentEvent.create({
      data: {
        workspaceId: d.workspaceId,
        appointmentId: appointment.id,
        actorUserId,
        kind: "DISPUTE_RESERVATION_RELEASED",
        operationId: `dispute:${d.id}:${requestId}:${appointment.id}`,
        before: json({ status: before.status, unitState: before.unitState }),
        after: { status: "PROVIDER_CANCELLED", unitState: "RELEASED" },
        reason,
        createdAt: now,
      },
    });
  }
  for (const enrollmentId of new Set(
    current.affected.appointments.map((a) => a.enrollmentId),
  ))
    await notifyCoachingChange(
      tx,
      d.workspaceId,
      d.id,
      enrollmentId,
      requestId,
      now,
    );
}

async function notifyCoachingChange(
  tx: Tx,
  workspaceId: string,
  disputeId: string,
  enrollmentId: string,
  requestId: string,
  now: Date,
) {
  const client = await tx.coachingEnrollment.findFirst({
    where: { id: enrollmentId, workspaceId },
    select: {
      member: {
        select: {
          user: {
            select: {
              email: true,
              fullName: true,
              workspaceUsers: {
                where: { workspaceId, role: "CUSTOMER", isActive: true },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  const user = client?.member.user;
  if (!user?.workspaceUsers.length) return;
  await enqueueNotificationJob({
    db: tx,
    now,
    input: {
      workspaceId,
      templateKind: "ANNOUNCEMENT",
      recipientEmail: user.email,
      recipientName: user.fullName,
      subject: "Your coaching program has an update",
      body: "Your gym recorded an update to your program's access or future appointments. Sign in to your member portal to review the update.",
      dedupeKey: `dispute:${disputeId}:${requestId}:coaching:${enrollmentId}:${financialRequestHash(user.email)}`,
      context: { kind: "COACHING_UPDATE", enrollmentId },
    },
  });
}

/** Fingerprint participates in refund previews; a chargeback never becomes a Refund or new invoice debt. */
export async function paymentDisputeRefundGuard(
  tx: Tx,
  args: {
    workspaceId: string;
    paymentId: string;
    paymentIntentId: string | null;
    accountId: string | null;
  },
) {
  const items = await tx.paymentDispute.findMany({
    where: {
      workspaceId: args.workspaceId,
      ...(args.accountId ? { providerAccountId: args.accountId } : {}),
      OR: [
        { paymentId: args.paymentId },
        { allocations: { some: { paymentId: args.paymentId } } },
        ...(args.paymentIntentId
          ? [{ paymentIntentId: args.paymentIntentId }]
          : []),
      ],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      version: true,
      evidenceHash: true,
      providerStatus: true,
      isChargeRefundable: true,
      lastError: true,
      chargeAmountCents: true,
      chargeRefundedCents: true,
    },
  });
  const paymentScope = {
    workspaceId: args.workspaceId,
    stripePaymentIntentId: args.paymentIntentId ?? "__no_payment_intent__",
    ...(args.accountId
      ? { payerAccount: { stripeAccountId: args.accountId } }
      : {}),
  };
  const [knownRefunds, recordedRefunds, otherPending] = items.length
    ? await Promise.all([
        tx.refund.aggregate({
          where: {
            workspaceId: args.workspaceId,
            status: "SUCCEEDED",
            payment: paymentScope,
          },
          _sum: { amountCents: true },
        }),
        tx.payment.aggregate({
          where: paymentScope,
          _sum: { refundedAmountCents: true },
        }),
        tx.refund.aggregate({
          where: {
            workspaceId: args.workspaceId,
            status: "PENDING",
            paymentId: { not: args.paymentId },
            payment: paymentScope,
          },
          _sum: { amountCents: true },
        }),
      ])
    : [null, null, null];
  const knownSucceeded = Math.max(
    knownRefunds?._sum.amountCents ?? 0,
    recordedRefunds?._sum.refundedAmountCents ?? 0,
  );
  return {
    fingerprint: financialRequestHash({
      items,
      knownSucceeded,
      otherPending: otherPending?._sum.amountCents ?? 0,
    }),
    blocked: items.some(
      (d) =>
        formal.has(d.providerStatus) ||
        !d.isChargeRefundable ||
        Boolean(d.lastError),
    ),
    providerRemainingCents: items.length
      ? Math.min(
          ...items.map((d) =>
            Math.max(
              0,
              d.chargeAmountCents -
                Math.max(d.chargeRefundedCents, knownSucceeded) -
                (otherPending?._sum.amountCents ?? 0),
            ),
          ),
        )
      : null,
  };
}
