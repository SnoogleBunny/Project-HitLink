/**
 * Published requirement lifecycle. This module owns no PDF bytes and performs
 * no provider calls.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  lockClassSchedule,
  classOccurrenceInclude,
  resolveClassOccurrence,
  type ClassOccurrenceTemplate,
} from "./class-occurrences.js";
import { getZonedDateTimeAsUtc, toDateOnlyString } from "./occurrences.js";
import {
  requireActiveStaffAccessTx,
  lockStaffAuthorityTx,
  normalizeAuthoritySerializationError,
} from "./staff-access.js";
import { enqueueNotificationJob } from "./notification-outbox.js";
import { queueFinancialReview } from "./financial-operations.js";
import {
  isRequirementTargetApplicable,
  getSignerKindForTarget,
} from "./forms.js";
import {
  FormRequirementError,
  createBookingFormSnapshot,
  evaluateBookingFormConsequence,
  formEvidenceHash,
  LEGACY_FORM_CYCLE,
  matchingAcceptance,
  parseBookingFormSnapshot,
  parseRequirementTerms,
  recoveryTransition,
  revisionHash,
  selectServiceRevision,
  type AcceptanceProof,
  type BookingFormSnapshot,
  type FormTarget,
  type LegacyBaseline,
  type RequirementRevision,
  type RequirementTerms,
  type ServiceRequirement,
} from "./form-requirements-policy.js";

type Tx = Prisma.TransactionClient;
const MAX_PUBLICATION_PEOPLE = 5000;
const MAX_PUBLICATION_BOOKINGS = 10000;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const deny = (message: string): never => {
  throw new FormRequirementError(message);
};
async function runFormTransaction<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>,
  isolationLevel: "Serializable" | "ReadCommitted",
) {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(work, { isolationLevel, timeout: 120000 });
    } catch (caught) {
      const error = normalizeAuthoritySerializationError(caught);
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
}
export function formRequirementTransaction<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>,
) {
  return runFormTransaction(db, work, "Serializable");
}
// Publication and refund-evidence binding are serialized by schedule/family/financial/record locks.
// ReadCommitted is deliberate: reads after an advisory wait must see an earlier
// accepted seat, rather than retaining the snapshot created by the wait itself.
function currentLockedFormTransaction<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>,
) {
  return runFormTransaction(db, work, "ReadCommitted");
}
export async function getFormPublicationPageData(args: {
  db: PrismaClient;
  workspaceId: string;
  actorUserId: string;
  formDocumentId: string;
}) {
  return formRequirementTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      capability: "OWNER",
    });
    return tx.formDocument.findFirst({
      where: { id: args.formDocumentId, workspaceId: args.workspaceId },
      select: {
        id: true,
        name: true,
        currentVersionId: true,
        versions: {
          select: {
            id: true,
            versionNumber: true,
            fileName: true,
            fileSha256: true,
            createdAt: true,
          },
          orderBy: { versionNumber: "desc" },
        },
        assignments: { select: { requirementTarget: true, isActive: true } },
        requirementRevisions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            formVersionId: true,
            version: true,
            terms: true,
            effectiveAt: true,
            publishedAt: true,
            revisionHash: true,
            reason: true,
            actor: { select: { fullName: true, email: true } },
          },
        },
      },
    });
  });
}
export async function listBookingFormRecoveries(args: {
  db: PrismaClient;
  workspaceId: string;
  actorUserId: string;
  memberId?: string;
  after?: string;
  history?: boolean;
}) {
  if (args.after && !/^[\w-]{1,150}$/.test(args.after))
    return deny("Invalid recovery page.");
  return formRequirementTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    await lockStaffAuthorityTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
    });
    const actor = await tx.workspaceUser.findFirst({
      where: {
        workspaceId: args.workspaceId,
        userId: args.actorUserId,
        isActive: true,
        role: { in: ["OWNER", "CUSTOMER"] },
        workspace: { status: { not: "DISABLED" } },
      },
    });
    if (!actor || (actor.role !== "OWNER" && !args.memberId))
      return deny("These recovery records are unavailable for this account.");
    if (actor.role !== "OWNER") {
      const member = await tx.member.findFirst({
        where: { id: args.memberId, workspaceId: args.workspaceId },
      });
      if (!member) return deny("Participant not found.");
      if (member.userId !== args.actorUserId) {
        await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE "workspaceId"=${args.workspaceId} AND "memberId"=${member.id} AND "userId"=${args.actorUserId} FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM family_links WHERE "workspaceId"=${args.workspaceId} AND "childMemberId"=${member.id} ORDER BY id FOR SHARE`;
        if (
          !(await tx.memberPortalGrant.findFirst({
            where: {
              workspaceId: args.workspaceId,
              memberId: member.id,
              userId: args.actorUserId,
              canBook: true,
              revokedAt: null,
              guardian: {
                familyLinks: {
                  some: {
                    workspaceId: args.workspaceId,
                    childMemberId: member.id,
                  },
                },
              },
            },
          }))
        )
          return deny("Booking recovery access is no longer active.");
      }
    }
    const rows = await tx.bookingFormRecovery.findMany({
      where: {
        workspaceId: args.workspaceId,
        ...(args.memberId ? { booking: { memberId: args.memberId } } : {}),
        ...(args.history ? {} : { state: { in: ["OPEN", "REFUND_REVIEW"] } }),
        ...(args.after ? { id: { gt: args.after } } : {}),
      },
      orderBy: { id: "asc" },
      take: 51,
      select: {
        id: true,
        version: true,
        state: true,
        openedAt: true,
        resolvedAt: true,
        bookingFundingRevision: true,
        evidence: true,
        financialReviewCaseId: true,
        assignedTo: {
          select: { user: { select: { fullName: true, email: true } } },
        },
        requirementRevision: {
          select: {
            version: true,
            effectiveAt: true,
            formDocument: { select: { name: true } },
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
            memberId: true,
            fundingRevision: true,
            bookingType: true,
            scheduledForDate: true,
            member: { select: { fullName: true } },
            classTemplate: {
              select: { title: true, program: { select: { name: true } } },
            },
          },
        },
      },
    });
    const items = [];
    for (const { evidence, ...row } of rows.slice(0, 50)) {
      const serviceAt = String((evidence as Prisma.JsonObject).serviceAt),
        commitmentMatches =
          row.booking.fundingRevision === row.bookingFundingRevision;
      const consequence =
        row.state === "OPEN" && commitmentMatches
          ? await evaluateBookingFormsTx(tx, {
              workspaceId: args.workspaceId,
              bookingId: row.booking.id,
              serviceAt: new Date(serviceAt),
              now: new Date(),
              state: "NO_SHOW",
            })
          : null;
      items.push({
        ...row,
        serviceAt,
        admissionValid: consequence?.kind === "CLEAR",
        remedyAvailable:
          row.state === "OPEN" &&
          commitmentMatches &&
          ["BOOKED", "PENDING_PAYMENT"].includes(row.booking.status) &&
          (new Date(serviceAt) > new Date() ||
            consequence?.kind === "PROVIDER_RECOVERY_REQUIRED"),
      });
    }
    return { items, nextCursor: rows.length > 50 ? rows[49]!.id : null };
  });
}
/** Exact original drop-in allocation, never an amount-only payment-intent match. */
async function exactFormDropInPaymentTx(
  tx: Tx,
  booking: {
    id: string;
    workspaceId: string;
    memberId: string;
    fundedByBookingId: string | null;
  },
  paymentId?: string | null,
) {
  const funding = await tx.classBooking.findFirst({
    where: {
      id: booking.fundedByBookingId ?? booking.id,
      workspaceId: booking.workspaceId,
      memberId: booking.memberId,
    },
  });
  if (
    !funding?.dropInPaidAt ||
    !funding.dropInPaymentIntentId ||
    !funding.dropInCheckoutSessionId ||
    !funding.dropInPriceCents
  )
    return null;
  const checkouts = await tx.financialOperation.findMany({
    where: {
      workspaceId: booking.workspaceId,
      kind: "CHECKOUT",
      status: "SUCCEEDED",
      targetId: funding.id,
      beneficiaryMemberId: booking.memberId,
      paymentId: paymentId ?? { not: null },
    },
    take: 2,
  });
  if (checkouts.length !== 1) return null;
  const checkout = checkouts[0]!,
    request = (checkout.payload as Prisma.JsonObject).request as
      | Prisma.JsonObject
      | undefined,
    metadata = request?.metadata as Prisma.JsonObject | undefined;
  if (
    !checkout.paymentId ||
    !checkout.payerAccountId ||
    !checkout.providerAccountId ||
    checkout.providerReference !== funding.dropInCheckoutSessionId ||
    metadata?.checkoutType !== "drop_in_booking" ||
    metadata.bookingId !== funding.id ||
    metadata.memberId !== booking.memberId ||
    metadata.workspaceId !== booking.workspaceId ||
    metadata.payerAccountId !== checkout.payerAccountId
  )
    return null;
  const payment = await tx.payment.findFirst({
    where: {
      id: checkout.paymentId,
      workspaceId: booking.workspaceId,
      memberId: booking.memberId,
      payerAccountId: checkout.payerAccountId,
      source: "CURRENT",
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      stripePaymentIntentId: funding.dropInPaymentIntentId,
      amountCents: funding.dropInPriceCents,
      currency: funding.dropInCurrency ?? undefined,
    },
  });
  if (
    !payment ||
    checkout.amountCents !== payment.amountCents ||
    checkout.currency !== payment.currency ||
    (await tx.financialOperation.count({
      where: {
        workspaceId: booking.workspaceId,
        kind: "CHECKOUT",
        status: "SUCCEEDED",
        paymentId: payment.id,
      },
    })) !== 1
  )
    return null;
  return { funding, checkout, payment };
}
async function exactCompletedFormRefundTx(
  tx: Tx,
  recovery: {
    id: string;
    workspaceId: string;
    bookingId: string;
    bookingFundingRevision: number;
    financialReviewCaseId: string | null;
    state?: string;
  },
) {
  const booking = await tx.classBooking.findFirst({
    where: {
      id: recovery.bookingId,
      workspaceId: recovery.workspaceId,
      fundingRevision: recovery.bookingFundingRevision,
      status: "CANCELLED",
    },
  });
  if (!booking || !recovery.financialReviewCaseId) return null;
  const review = await tx.financialReviewCase.findFirst({
    where: {
      id: recovery.financialReviewCaseId,
      workspaceId: recovery.workspaceId,
      bookingId: recovery.bookingId,
      memberId: booking.memberId,
    },
  });
  if (
    !review?.paymentId ||
    !review.amountCents ||
    !review.currency ||
    (review.resolvedAt && !review.operationId)
  )
    return null;
  const allocation = await exactFormDropInPaymentTx(
    tx,
    booking,
    review.paymentId,
  );
  if (
    !allocation ||
    review.payerAccountId !== allocation.payment.payerAccountId ||
    review.amountCents !== allocation.payment.amountCents ||
    review.currency !== allocation.payment.currency
  )
    return null;
  // Bound the whole evidence set, not one arbitrary matching amount. Every
  // operation below must allocate this original checkout to this beneficiary.
  const operations = await tx.financialOperation.findMany({
    where: {
      workspaceId: recovery.workspaceId,
      kind: "REFUND",
      status: "SUCCEEDED",
      paymentId: review.paymentId,
      createdAt: { gte: review.createdAt },
      settledAt: { gte: review.createdAt },
    },
    orderBy: { id: "asc" },
    take: 21,
  });
  if (!operations.length || operations.length > 20) return null;
  const pairs = [],
    refundIds = new Set<string>(),
    providerReferences = new Set<string>();
  let total = 0;
  for (const operation of operations) {
    const payload = operation.payload as Prisma.JsonObject,
      command = payload.command as Prisma.JsonObject | undefined,
      accepted = payload.review as Prisma.JsonObject | undefined;
    if (
      !operation.refundId ||
      !operation.providerReference ||
      !operation.amountCents ||
      operation.amountCents < 1 ||
      operation.currency !== review.currency ||
      operation.beneficiaryMemberId !== booking.memberId ||
      operation.payerAccountId !== review.payerAccountId ||
      operation.providerAccountId !== allocation.checkout.providerAccountId ||
      command?.paymentId !== review.paymentId ||
      command.amountCents !== operation.amountCents ||
      accepted?.paymentId !== review.paymentId ||
      accepted.beneficiaryMemberId !== booking.memberId ||
      accepted.payerAccountId !== review.payerAccountId ||
      accepted.paymentIntentId !== allocation.funding.dropInPaymentIntentId ||
      accepted.currency !== review.currency ||
      refundIds.has(operation.refundId) ||
      providerReferences.has(operation.providerReference)
    )
      return null;
    const refund = await tx.refund.findFirst({
      where: {
        id: operation.refundId,
        workspaceId: recovery.workspaceId,
        paymentId: review.paymentId,
        memberId: booking.memberId,
        source: "CURRENT",
        status: "SUCCEEDED",
        amountCents: operation.amountCents,
        currency: review.currency,
        stripeRefundId: operation.providerReference,
        refundedAt: { gte: review.createdAt },
      },
    });
    if (!refund) return null;
    const boundElsewhere = await tx.financialReviewCase.findFirst({
      where: {
        workspaceId: recovery.workspaceId,
        id: { not: review.id },
        operationId: operation.id,
        sourceKey: { startsWith: "form-recovery:" },
      },
      select: { id: true },
    });
    const reused = await tx.workspaceDataEvent.findFirst({
      where: {
        workspaceId: recovery.workspaceId,
        kind: "FORM_RECOVERY_TRANSITIONED",
        AND: [
          { metadata: { path: ["to"], equals: "REFUNDED" } },
          { NOT: { metadata: { path: ["recoveryId"], equals: recovery.id } } },
          {
            OR: [
              {
                metadata: {
                  path: ["refundOperationIds"],
                  array_contains: [operation.id],
                },
              },
              {
                metadata: { path: ["refundOperationId"], equals: operation.id },
              },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (boundElsewhere || reused) return null;
    refundIds.add(refund.id);
    providerReferences.add(operation.providerReference);
    total += refund.amountCents;
    if (!Number.isSafeInteger(total) || total > allocation.payment.amountCents)
      return null;
    pairs.push({ operation, refund });
  }
  if (
    total !== allocation.payment.amountCents ||
    allocation.payment.refundedAmountCents !== total ||
    allocation.payment.status !== "REFUNDED" ||
    (review.operationId &&
      !pairs.some((pair) => pair.operation.id === review.operationId))
  )
    return null;
  // A second representation of the same money, foreign beneficiary, or orphan
  // current refund is an inconsistency to review, never extra refundable cash.
  const currentRefunds = await tx.refund.findMany({
    where: {
      workspaceId: recovery.workspaceId,
      paymentId: review.paymentId,
      source: "CURRENT",
      status: "SUCCEEDED",
    },
    select: { id: true },
    take: 21,
  });
  if (
    currentRefunds.length !== pairs.length ||
    currentRefunds.some((refund) => !refundIds.has(refund.id))
  )
    return null;
  const operationIds = pairs.map((pair) => pair.operation.id),
    exactRefundIds = pairs.map((pair) => pair.refund.id),
    evidenceHash = formEvidenceHash({
      bookingId: booking.id,
      fundingRevision: recovery.bookingFundingRevision,
      paymentId: review.paymentId,
      payerAccountId: review.payerAccountId,
      memberId: booking.memberId,
      amountCents: total,
      currency: review.currency,
      operationIds,
      refundIds: exactRefundIds,
    });
  if (recovery.state === "REFUNDED") {
    const attribution = await tx.workspaceDataEvent.findMany({
      where: {
        workspaceId: recovery.workspaceId,
        kind: "FORM_RECOVERY_TRANSITIONED",
        AND: [
          { metadata: { path: ["recoveryId"], equals: recovery.id } },
          { metadata: { path: ["to"], equals: "REFUNDED" } },
        ],
      },
      select: { metadata: true },
      take: 2,
    });
    if (
      attribution.length !== 1 ||
      (attribution[0]!.metadata as Prisma.JsonObject).refundEvidenceHash !==
        evidenceHash
    )
      return null;
  }
  return {
    pairs,
    review,
    operationIds,
    refundIds: exactRefundIds,
    evidenceHash,
    total,
    currency: review.currency,
  };
}
export async function reconcileFormRecoveryRefund(args: {
  db: PrismaClient;
  workspaceId: string;
  actorUserId: string;
  recoveryId: string;
  expectedVersion: number;
  now?: Date;
}) {
  return currentLockedFormTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${args.workspaceId}`}))`;
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      capability: "OWNER",
    });
    await tx.$queryRaw`SELECT id FROM booking_form_recoveries WHERE id=${args.recoveryId} AND "workspaceId"=${args.workspaceId} FOR UPDATE`;
    const recovery = await tx.bookingFormRecovery.findFirst({
      where: { id: args.recoveryId, workspaceId: args.workspaceId },
    });
    if (!recovery || !["REFUND_REVIEW", "REFUNDED"].includes(recovery.state))
      return deny(
        "The refund review has not completed for this exact recovery.",
      );
    const proof = await exactCompletedFormRefundTx(tx, recovery);
    if (!proof)
      return deny(
        "An exact allocated provider refund has not completed. Pending, partial, unrelated, old or reused evidence cannot close this review.",
      );
    if (recovery.state === "REFUNDED") {
      if (
        recovery.version !== args.expectedVersion &&
        recovery.version !== args.expectedVersion + 1
      )
        return deny("This recovery changed. Refresh its history.");
      return {
        recoveryId: recovery.id,
        state: "REFUNDED",
        version: recovery.version,
      };
    }
    if (recovery.version !== args.expectedVersion)
      return deny("This recovery changed. Refresh its current choices.");
    if (!proof.review.resolvedAt) {
      const bound = await tx.financialReviewCase.updateMany({
        where: {
          id: proof.review.id,
          workspaceId: args.workspaceId,
          resolvedAt: null,
          operationId: proof.review.operationId,
        },
        data: {
          operationId: proof.operationIds[0]!,
          resolvedAt: args.now ?? new Date(),
          resolvedByUserId: args.actorUserId,
          resolution:
            "Exact original booking allocation and completed provider refund verified through form recovery.",
        },
      });
      if (bound.count !== 1)
        return deny("The payment review changed. Refresh before verification.");
    }
    return transitionBookingFormRecoveryTx(tx, {
      ...args,
      choice: "REFUND_CONFIRMED",
      now: args.now ?? new Date(),
    });
  });
}
const scope = (workspaceId: string, memberId: string) => ({
  workspaceId,
  memberId,
});
const asRevision = (
  row: Awaited<ReturnType<Tx["formRequirementRevision"]["findFirstOrThrow"]>>,
): RequirementRevision => ({
  id: row.id,
  workspaceId: row.workspaceId,
  formDocumentId: row.formDocumentId,
  formVersionId: row.formVersionId,
  fileSha256: row.fileSha256,
  version: row.version,
  terms: parseRequirementTerms(row.terms),
  publishedAt: row.publishedAt.toISOString(),
  actorUserId: row.actorUserId,
  reason: row.reason,
  previousRevisionHash: row.previousRevisionHash,
  previewHash: row.previewHash,
  baseline: row.legacyBaseline as unknown as LegacyBaseline | null,
  revisionHash: row.revisionHash,
});

export async function lockFormRequirementsTx(tx: Tx, workspaceId: string) {
  // Call after the workspace schedule lock, before reading eligibility. Publication,
  // signing, booking, attendance and recovery all use this same ordering.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
  try {
    await tx.$queryRaw`SELECT id FROM form_documents WHERE "workspaceId"=${workspaceId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM required_form_assignments WHERE "workspaceId"=${workspaceId} ORDER BY id FOR SHARE`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
}

export async function listServiceFormRequirementsTx(
  tx: Tx,
  args: {
    workspaceId: string;
    memberId: string;
    serviceAt: Date;
    targets: FormTarget[];
  },
) {
  try {
    await tx.$queryRaw`SELECT id FROM members WHERE id=${args.memberId} AND "workspaceId"=${args.workspaceId} FOR SHARE`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  const member = await tx.member.findFirst({
    where: { id: args.memberId, workspaceId: args.workspaceId },
    include: { familyLinks: { include: { guardian: true } } },
  });
  if (!member) return deny("Participant not found.");
  const docs = await tx.formDocument.findMany({
    where: { workspaceId: args.workspaceId },
    include: {
      assignments: true,
      currentVersion: true,
      requirementRevisions: { orderBy: { version: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const requirements: ServiceRequirement[] = [];
  for (const doc of docs) {
    const revisions = doc.requirementRevisions.map(asRevision);
    const revision = selectServiceRevision(
      revisions,
      args.workspaceId,
      doc.id,
      args.serviceAt.toISOString(),
    );
    const first = revisions[0],
      baseline = first?.baseline;
    const applicableTargets =
      revision?.terms.targets ??
      baseline?.targets ??
      (doc.archivedAt
        ? []
        : doc.assignments
            .filter((row) => row.isActive)
            .map((row) => row.requirementTarget));
    const versionId =
      revision?.formVersionId ??
      baseline?.formVersionId ??
      doc.currentVersionId;
    if (!versionId) continue;
    for (const target of applicableTargets) {
      if (
        !args.targets.includes(target) ||
        !isRequirementTargetApplicable({
          requirementTarget: target,
          memberStatus: member.status,
          guardianCount: member.familyLinks.length,
        })
      )
        continue;
      const signerKind = getSignerKindForTarget(target, member, args.serviceAt);
      if (
        requirements.some(
          (row) =>
            row.formDocumentId === doc.id && row.signerKind === signerKind,
        )
      )
        continue;
      requirements.push({
        formDocumentId: doc.id,
        formVersionId: versionId,
        requirementRevisionId: revision?.id ?? null,
        revisionHash: revision?.revisionHash ?? null,
        acceptanceCycleKey: revision?.id ?? LEGACY_FORM_CYCLE,
        signerKind,
        effectiveAt: revision?.terms.effectiveAt ?? null,
        publishedAt: revision?.publishedAt ?? null,
        consentValidUntil: revision?.terms.consentValidUntil ?? null,
        basis: revision ? "PUBLISHED_REVISION" : "OBSERVED_LEGACY",
      });
    }
  }
  return requirements;
}
export async function listAcceptanceProofsTx(
  tx: Tx,
  args: { workspaceId: string; memberId: string },
): Promise<AcceptanceProof[]> {
  const proofs = await tx.signedDocument.findMany({
    where: scope(args.workspaceId, args.memberId),
    orderBy: [{ signedAt: "desc" }, { id: "asc" }],
  });
  return proofs.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    formVersionId: row.formVersionId,
    requirementRevisionId: row.requirementRevisionId,
    acceptanceCycleKey: row.acceptanceCycleKey,
    signerKind: row.signerKind,
    signedAt: row.signedAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
  }));
}
export async function acceptedBookingFormsTx(
  tx: Tx,
  args: {
    workspaceId: string;
    memberId: string;
    serviceAt: Date;
    serviceTimezone: string;
    now: Date;
    trial: boolean;
  },
): Promise<BookingFormSnapshot> {
  await lockFormRequirementsTx(tx, args.workspaceId);
  return createBookingFormSnapshot({
    ...args,
    serviceAt: args.serviceAt.toISOString(),
    acceptedAt: args.now.toISOString(),
    requirements: await listServiceFormRequirementsTx(tx, {
      ...args,
      // Funding/source does not change the person's applicable form audience.
      // listServiceFormRequirementsTx retains canonical current status/guardian applicability.
      targets: ["TRIAL", "MEMBER", "GUARDIAN"],
    }),
    proofs: await listAcceptanceProofsTx(tx, args),
  });
}
export async function recordAcceptedBookingFormsTx(
  tx: Tx,
  args: {
    workspaceId: string;
    bookingId: string;
    fundingRevision: number;
    snapshot: BookingFormSnapshot;
  },
) {
  if (!parseBookingFormSnapshot(args.snapshot))
    return deny("The booking form receipt is invalid.");
  const updated = await tx.classBooking.updateMany({
    where: {
      id: args.bookingId,
      workspaceId: args.workspaceId,
      memberId: args.snapshot.memberId,
      fundingRevision: args.fundingRevision,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
    },
    data: { formRequirementSnapshot: json(args.snapshot) },
  });
  if (updated.count !== 1)
    return deny("The booking changed before its form receipt was recorded.");
  const prior = await tx.workspaceDataEvent.findFirst({
    where: {
      workspaceId: args.workspaceId,
      kind: "BOOKING_FORM_ACCEPTED",
      metadata: {
        path: ["commitmentKey"],
        equals: `${args.bookingId}:${args.fundingRevision}`,
      },
    },
  });
  if (prior) {
    if (
      (prior.metadata as Prisma.JsonObject)?.snapshotHash !==
      args.snapshot.snapshotHash
    )
      return deny("The accepted form receipt changed.");
    return;
  }
  await tx.workspaceDataEvent.create({
    data: {
      workspaceId: args.workspaceId,
      kind: "BOOKING_FORM_ACCEPTED",
      metadata: {
        commitmentKey: `${args.bookingId}:${args.fundingRevision}`,
        bookingId: args.bookingId,
        fundingRevision: args.fundingRevision,
        snapshotHash: args.snapshot.snapshotHash,
        serviceAt: args.snapshot.serviceAt,
        revisionIds: args.snapshot.requirements.flatMap((row) =>
          row.requirementRevisionId ? [row.requirementRevisionId] : [],
        ),
      },
    },
  });
}

interface SigningRecipient {
  userId: string;
  email: string;
  name: string | null;
  guardianId: string | null;
  grantId: string | null;
}
/** Resolve current verified account authority; never substitute a payer/household contact. */
export async function formSigningRecipientsTx(
  tx: Tx,
  args: {
    workspaceId: string;
    memberId: string;
    signerKind: "MEMBER" | "GUARDIAN";
  },
): Promise<SigningRecipient[]> {
  // Publication preview/commit uses a fixed snapshot. These exact authority rows
  // force a whole-operation retry if a revocation won while it waited.
  await tx.$queryRaw`SELECT id FROM members WHERE id=${args.memberId} AND "workspaceId"=${args.workspaceId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE "memberId"=${args.memberId} AND "workspaceId"=${args.workspaceId} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM family_links WHERE "childMemberId"=${args.memberId} AND "workspaceId"=${args.workspaceId} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT u.id FROM workspace_users u JOIN members m ON m."userId"=u."userId" WHERE m.id=${args.memberId} AND m."workspaceId"=${args.workspaceId} AND u."workspaceId"=${args.workspaceId} FOR SHARE OF u`;
  await tx.$queryRaw`SELECT u.id FROM workspace_users u JOIN member_portal_grants g ON g."userId"=u."userId" WHERE g."memberId"=${args.memberId} AND g."workspaceId"=${args.workspaceId} AND u."workspaceId"=${args.workspaceId} ORDER BY u.id FOR SHARE OF u`;
  if (args.signerKind === "MEMBER") {
    const member = await tx.member.findFirst({
      where: {
        id: args.memberId,
        workspaceId: args.workspaceId,
        user: {
          workspaceUsers: {
            some: {
              workspaceId: args.workspaceId,
              role: "CUSTOMER",
              isActive: true,
            },
          },
        },
      },
      select: { user: { select: { id: true, email: true, fullName: true } } },
    });
    return member?.user
      ? [
          {
            userId: member.user.id,
            email: member.user.email,
            name: member.user.fullName,
            guardianId: null,
            grantId: null,
          },
        ]
      : [];
  }
  const grants = await tx.memberPortalGrant.findMany({
    where: {
      ...scope(args.workspaceId, args.memberId),
      canSign: true,
      revokedAt: null,
      user: {
        workspaceUsers: {
          some: {
            workspaceId: args.workspaceId,
            role: "CUSTOMER",
            isActive: true,
          },
        },
      },
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      guardian: { select: { id: true } },
    },
    orderBy: { id: "asc" },
  });
  const result: SigningRecipient[] = [];
  for (const grant of grants)
    if (
      await tx.familyLink.findFirst({
        where: {
          workspaceId: args.workspaceId,
          childMemberId: args.memberId,
          guardianId: grant.guardianId,
        },
      })
    )
      result.push({
        userId: grant.user.id,
        email: grant.user.email,
        name: grant.user.fullName,
        guardianId: grant.guardianId,
        grantId: grant.id,
      });
  return result;
}

export interface PublicationInput {
  publicationId: string;
  formDocumentId: string;
  formVersionId: string;
  expectedHeadHash: string | null;
  terms: RequirementTerms;
  reason: string;
}
async function publicationPreviewTx(
  tx: Tx,
  args: { workspaceId: string; input: PublicationInput; now: Date },
) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(args.input.publicationId))
    return deny("Reload the publication review.");
  const terms = parseRequirementTerms(args.input.terms),
    reason = args.input.reason.trim();
  if (
    reason.length < 5 ||
    reason.length > 500 ||
    Date.parse(terms.effectiveAt) <
      args.now.getTime() + terms.noticeLeadMinutes * 60000
  )
    return deny(
      "Review the reason, effective time and actual notice interval.",
    );
  const doc = await tx.formDocument.findFirst({
    where: {
      id: args.input.formDocumentId,
      workspaceId: args.workspaceId,
      archivedAt: null,
    },
    include: {
      currentVersion: true,
      assignments: { orderBy: { requirementTarget: "asc" } },
      requirementRevisions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const pdf = await tx.formVersion.findFirst({
    where: {
      id: args.input.formVersionId,
      formDocumentId: args.input.formDocumentId,
      workspaceId: args.workspaceId,
    },
    select: { id: true, fileSha256: true, versionNumber: true },
  });
  if (!doc || !pdf)
    return deny("Choose an exact uploaded version in this gym.");
  const head = doc.requirementRevisions[0] ?? null;
  if (
    (head?.revisionHash ?? null) !== args.input.expectedHeadHash ||
    (head && new Date(terms.effectiveAt) < head.effectiveAt)
  )
    return deny(
      "The publication timeline changed. Review the latest revision.",
    );
  const members = await tx.member.findMany({
    where: { workspaceId: args.workspaceId, archivedAt: null },
    include: { familyLinks: { include: { guardian: true } } },
    orderBy: { id: "asc" },
    take: MAX_PUBLICATION_PEOPLE + 1,
  });
  if (members.length > MAX_PUBLICATION_PEOPLE)
    return deny(
      "This publication exceeds the reviewed transaction limit. Contact the named operator; nothing was published.",
    );
  const people = [];
  for (const member of members) {
    const applicable = terms.targets.filter((requirementTarget) =>
      isRequirementTargetApplicable({
        requirementTarget,
        memberStatus: member.status,
        guardianCount: member.familyLinks.length,
      }),
    );
    for (const signerKind of [
      ...new Set(
        applicable.map((target) =>
          getSignerKindForTarget(target, member, new Date(terms.effectiveAt)),
        ),
      ),
    ]) {
      const recipients = await formSigningRecipientsTx(tx, {
        workspaceId: args.workspaceId,
        memberId: member.id,
        signerKind,
      });
      people.push({
        memberId: member.id,
        fullName: member.fullName,
        signerKind,
        recipients,
      });
    }
  }
  const rows = await tx.classBooking.findMany({
    where: {
      workspaceId: args.workspaceId,
      OR: [
        { status: "BOOKED" },
        {
          status: "PENDING_PAYMENT",
          pendingPaymentExpiresAt: { gt: args.now },
        },
      ],
      scheduledForDate: {
        gte: new Date(
          new Date(args.now.getTime() - 86400000).toISOString().slice(0, 10),
        ),
      },
    },
    include: { classTemplate: { include: classOccurrenceInclude } },
    orderBy: { id: "asc" },
    take: MAX_PUBLICATION_BOOKINGS + 1,
  });
  if (rows.length > MAX_PUBLICATION_BOOKINGS)
    return deny(
      "This publication exceeds the reviewed booking limit. Nothing was published.",
    );
  const commitments = [];
  for (const booking of rows) {
    const actual = resolveClassOccurrence({
      template: booking.classTemplate as unknown as ClassOccurrenceTemplate,
      scheduledForDate: toDateOnlyString(booking.scheduledForDate),
    });
    if (!actual || actual.status === "CANCELLED") continue;
    const serviceAt = getZonedDateTimeAsUtc({
      dateString: toDateOnlyString(booking.scheduledForDate),
      minutes: actual.startTimeMinutes,
      timezone: actual.timezone!,
    });
    if (
      serviceAt <= args.now ||
      serviceAt < new Date(terms.effectiveAt) ||
      !people.some((person) => person.memberId === booking.memberId)
    )
      continue;
    const accepted = parseBookingFormSnapshot(booking.formRequirementSnapshot);
    commitments.push({
      bookingId: booking.id,
      fundingRevision: booking.fundingRevision,
      memberId: booking.memberId,
      serviceAt: serviceAt.toISOString(),
      bookingType: booking.bookingType,
      bookingStatus: booking.status,
      acceptedAt: accepted?.acceptedAt ?? booking.createdAt.toISOString(),
      acceptedSnapshotHash: accepted?.snapshotHash ?? null,
      evidenceBasis: accepted
        ? "ACCEPTED_FORM_RECEIPT"
        : "LEGACY_COMMITMENT_OBSERVED",
      needsRefundReview:
        booking.bookingType === "DROP_IN" && !!booking.dropInPaidAt,
    });
  }
  // Contact hashes bind the review without copying contact addresses into permanent audit JSON.
  const boundPeople = people.map((row) => ({
    memberId: row.memberId,
    signerKind: row.signerKind,
    recipients: row.recipients.map((recipient) => ({
      userId: recipient.userId,
      grantId: recipient.grantId,
      emailHash: formEvidenceHash(recipient.email.toLowerCase()),
    })),
  }));
  const body = {
    publicationId: args.input.publicationId,
    formDocumentId: doc.id,
    formVersionId: pdf.id,
    fileSha256: pdf.fileSha256,
    expectedHeadHash: head?.revisionHash ?? null,
    terms,
    reason,
    legacy: !head
      ? {
          formVersionId: doc.currentVersionId,
          fileSha256: doc.currentVersion?.fileSha256 ?? null,
          targets: doc.assignments
            .filter((row) => row.isActive)
            .map((row) => row.requirementTarget),
        }
      : null,
    people: boundPeople,
    commitments,
  };
  return {
    doc,
    pdf,
    head,
    terms,
    reason,
    people,
    commitments,
    previewHash: formEvidenceHash(body),
    shortNotice: terms.noticeLeadMinutes < 1440,
    missingSafeContactCount: people.filter(
      (person) => !person.recipients.length,
    ).length,
  };
}
export async function previewFormPublication(args: {
  db: PrismaClient;
  workspaceId: string;
  actorUserId: string;
  input: PublicationInput;
  now?: Date;
}) {
  return currentLockedFormTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      capability: "OWNER",
    });
    const preview = await publicationPreviewTx(tx, {
      ...args,
      now: args.now ?? new Date(),
    });
    return {
      previewHash: preview.previewHash,
      expectedHeadHash: preview.head?.revisionHash ?? null,
      terms: preview.terms,
      people: preview.people.map((person) => ({
        memberId: person.memberId,
        fullName: person.fullName,
        signerKind: person.signerKind,
        safeRecipientCount: person.recipients.length,
      })),
      commitments: preview.commitments,
      shortNotice: preview.shortNotice,
      missingSafeContactCount: preview.missingSafeContactCount,
      deliveryState: "NOT_QUEUED" as const,
    };
  });
}
export async function publishFormRequirement(args: {
  db: PrismaClient;
  workspaceId: string;
  actorUserId: string;
  input: PublicationInput;
  expectedPreviewHash: string;
  confirmShortNotice: boolean;
  portalOrigin: string;
  now?: Date;
}) {
  const origin = new URL(args.portalOrigin);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol === "http:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    return deny("Configure the verified member portal origin.");
  return currentLockedFormTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${args.workspaceId}`}))`;
    const owner = await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      capability: "OWNER",
    });
    await tx.$queryRaw`SELECT id FROM form_documents WHERE id=${args.input.formDocumentId} AND "workspaceId"=${args.workspaceId} FOR UPDATE`;
    const clock = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT clock_timestamp() AS now`;
    const now = clock[0]?.now;
    if (!now)
      return deny(
        "The publication clock is unavailable. Nothing was published.",
      );
    const prior = await tx.formRequirementRevision.findFirst({
      where: { id: args.input.publicationId, workspaceId: args.workspaceId },
    });
    if (prior) {
      if (
        prior.actorUserId !== args.actorUserId ||
        prior.previewHash !== args.expectedPreviewHash
      )
        return deny("This publication request changed.");
      return {
        revisionId: prior.id,
        revisionHash: prior.revisionHash,
        status: "published" as const,
      };
    }
    const preview = await publicationPreviewTx(tx, { ...args, now });
    if (
      preview.previewHash !== args.expectedPreviewHash ||
      (preview.shortNotice && !args.confirmShortNotice)
    )
      return deny(
        "Affected people or commitments changed. Review the preview and short-notice recovery before publishing.",
      );
    const baseline: LegacyBaseline | null = !preview.head
      ? {
          schemaVersion: 1,
          basis: "OBSERVED_AT_PUBLICATION",
          observedAt: now.toISOString(),
          formVersionId: preview.doc.currentVersionId,
          fileSha256: preview.doc.currentVersion?.fileSha256 ?? null,
          targets: preview.doc.assignments
            .filter((row) => row.isActive)
            .map((row) => row.requirementTarget),
          consentValidUntil: null,
        }
      : null;
    const body: Omit<RequirementRevision, "revisionHash"> = {
      id: args.input.publicationId,
      workspaceId: args.workspaceId,
      formDocumentId: preview.doc.id,
      formVersionId: preview.pdf.id,
      fileSha256: preview.pdf.fileSha256,
      version: (preview.head?.version ?? 0) + 1,
      terms: preview.terms,
      publishedAt: now.toISOString(),
      actorUserId: args.actorUserId,
      reason: preview.reason,
      previousRevisionHash: preview.head?.revisionHash ?? null,
      previewHash: preview.previewHash,
      baseline,
    };
    const hash = revisionHash(body);
    const { baseline: historicalBaseline, ...columns } = body;
    await tx.formRequirementRevision.create({
      data: {
        ...columns,
        terms: json(body.terms),
        effectiveAt: new Date(body.terms.effectiveAt),
        publishedAt: now,
        legacyBaseline: historicalBaseline
          ? json(historicalBaseline)
          : undefined,
        revisionHash: hash,
      },
    });
    for (const commitment of preview.commitments) {
      const evidence = {
        schemaVersion: 1,
        cause: "PROVIDER_REQUIREMENT_AFTER_BOOKING",
        ...commitment,
        revisionId: body.id,
        revisionHash: hash,
        publishedAt: body.publishedAt,
        effectiveAt: body.terms.effectiveAt,
      };
      const recovery = await tx.bookingFormRecovery.create({
        data: {
          workspaceId: args.workspaceId,
          bookingId: commitment.bookingId,
          bookingFundingRevision: commitment.fundingRevision,
          requirementRevisionId: body.id,
          acceptedSnapshotHash: commitment.acceptedSnapshotHash,
          evidence: json(evidence),
          evidenceHash: formEvidenceHash(evidence),
          openedAt: now,
          openedByUserId: args.actorUserId,
          assignedToWorkspaceUserId: owner.id,
        },
      });
      await tx.workspaceDataEvent.create({
        data: {
          workspaceId: args.workspaceId,
          actorUserId: args.actorUserId,
          kind: "FORM_RECOVERY_OPENED",
          metadata: {
            recoveryId: recovery.id,
            bookingId: commitment.bookingId,
            fundingRevision: commitment.fundingRevision,
            revisionId: body.id,
            evidenceHash: recovery.evidenceHash,
            assignedToWorkspaceUserId: owner.id,
          },
        },
      });
    }
    for (const person of preview.people)
      for (const recipient of person.recipients) {
        // Exact cycle requests are issued by the shared signing workflow on portal entry;
        // the secure link carries no bearer token or participant data in its query.
        await enqueueNotificationJob({
          db: tx,
          now,
          input: {
            workspaceId: args.workspaceId,
            templateKind: "ANNOUNCEMENT",
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subject: "A required gym form is scheduled to change",
            body: `A requirement changes at ${body.terms.effectiveAt}. Sign in to review the exact form, its validity and any affected booking's penalty-free recovery choices. ${origin.origin}/app/forms`,
            dedupeKey: `form-publication:${body.id}:${person.memberId}:${recipient.userId}`,
            context: json({
              kind: "FORM_REQUIREMENT",
              revisionId: body.id,
              memberId: person.memberId,
              signerUserId: recipient.userId,
              guardianId: recipient.guardianId,
              grantId: recipient.grantId,
              threshold: "PUBLICATION",
            }),
          },
        });
      }
    // An append-only correction/withdrawal can make an earlier scheduled cycle
    // irrelevant for a specific service. Close only those obsolete obstacles;
    // retain the booking, funding and every publication/signature as history.
    const olderCases = await tx.bookingFormRecovery.findMany({
      where: {
        workspaceId: args.workspaceId,
        state: "OPEN",
        requirementRevision: { formDocumentId: body.formDocumentId },
        requirementRevisionId: { not: body.id },
      },
      include: { booking: true },
    });
    for (const recovery of olderCases) {
      const serviceAt = new Date(
        (recovery.evidence as Prisma.JsonObject).serviceAt as string,
      );
      if (serviceAt <= now) continue;
      const current = await listServiceFormRequirementsTx(tx, {
        workspaceId: args.workspaceId,
        memberId: recovery.booking.memberId,
        serviceAt,
        targets:
          recovery.booking.bookingType === "TRIAL"
            ? ["TRIAL", "GUARDIAN"]
            : ["MEMBER", "GUARDIAN"],
      });
      if (
        !current.some(
          (row) => row.requirementRevisionId === recovery.requirementRevisionId,
        )
      )
        await transitionBookingFormRecoveryTx(tx, {
          workspaceId: args.workspaceId,
          recoveryId: recovery.id,
          expectedVersion: recovery.version,
          actorUserId: args.actorUserId,
          choice: "NO_LONGER_REQUIRED",
          now,
        });
    }
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: args.workspaceId,
        actorUserId: args.actorUserId,
        kind: "FORM_REQUIREMENT_PUBLISHED",
        metadata: {
          revisionId: body.id,
          version: body.version,
          revisionHash: hash,
          previewHash: preview.previewHash,
          fileSha256: body.fileSha256,
          effectiveAt: body.terms.effectiveAt,
          consentValidUntil: body.terms.consentValidUntil,
          noticeLeadMinutes: body.terms.noticeLeadMinutes,
          affectedPeople: preview.people.length,
          affectedCommitments: preview.commitments.length,
          missingSafeContactCount: preview.missingSafeContactCount,
          deliveryState: "QUEUED_WITHOUT_PROVIDER_RECEIPT",
        },
      },
    });
    return {
      revisionId: body.id,
      revisionHash: hash,
      status: "published" as const,
    };
  });
}

export async function evaluateBookingFormsTx(
  tx: Tx,
  args: {
    workspaceId: string;
    bookingId: string;
    serviceAt: Date;
    now: Date;
    state: "PRESENT" | "LATE" | "NO_SHOW" | "ABSENT";
  },
) {
  await lockFormRequirementsTx(tx, args.workspaceId);
  const booking = await tx.classBooking.findFirst({
    where: { id: args.bookingId, workspaceId: args.workspaceId },
  });
  if (!booking) return deny("Booking not found.");
  const requirements = await listServiceFormRequirementsTx(tx, {
    workspaceId: args.workspaceId,
    memberId: booking.memberId,
    serviceAt: args.serviceAt,
    targets:
      booking.bookingType === "TRIAL"
        ? ["TRIAL", "GUARDIAN"]
        : ["MEMBER", "GUARDIAN"],
  });
  const proofs = await listAcceptanceProofsTx(tx, {
    workspaceId: args.workspaceId,
    memberId: booking.memberId,
  });
  const legacyHistoricalProofs = [];
  if (!booking.formRequirementSnapshot)
    for (const requirement of requirements.filter(
      (row) => row.basis === "OBSERVED_LEGACY",
    )) {
      // Compatibility for the pre-revision system's immediate-upload behavior, not a
      // fabricated dated assignment. New revisions never use this fallback.
      const historical = await tx.formVersion.findFirst({
        where: {
          workspaceId: args.workspaceId,
          formDocumentId: requirement.formDocumentId,
          createdAt: { lte: args.serviceAt },
        },
        orderBy: [{ versionNumber: "desc" }, { id: "asc" }],
      });
      if (historical)
        for (const proof of proofs.filter(
          (row) => row.formVersionId === historical.id,
        ))
          legacyHistoricalProofs.push({
            ...proof,
            formDocumentId: requirement.formDocumentId,
            versionCreatedAt: historical.createdAt.toISOString(),
            historicalVersionId: historical.id,
          });
    }
  return evaluateBookingFormConsequence({
    workspaceId: args.workspaceId,
    memberId: booking.memberId,
    bookingCreatedAt: booking.createdAt.toISOString(),
    acceptedSnapshot: booking.formRequirementSnapshot,
    requirements,
    proofs,
    serviceAt: args.serviceAt.toISOString(),
    recordedAt: args.now.toISOString(),
    state: args.state,
    legacyHistoricalProofs,
  });
}

/** Called only after real cancel/move/refund-review work has completed in this tx. */
export async function transitionBookingFormRecoveryTx(
  tx: Tx,
  args: {
    workspaceId: string;
    recoveryId: string;
    expectedVersion: number;
    actorUserId: string | null;
    signedDocumentId?: string;
    choice: Parameters<typeof recoveryTransition>[0]["choice"];
    now: Date;
    replacementBookingId?: string;
    financialReviewCaseId?: string;
  },
) {
  const recovery = await tx.bookingFormRecovery.findFirst({
    where: { id: args.recoveryId, workspaceId: args.workspaceId },
    include: { booking: true },
  });
  if (!recovery) return deny("Recovery not found.");
  const booking = recovery.booking;
  let exactAcceptanceValid = false;
  if (args.choice === "SIGNED") {
    const serviceAt = new Date(
      (recovery.evidence as Prisma.JsonObject).serviceAt as string,
    );
    const requirements = await listServiceFormRequirementsTx(tx, {
      workspaceId: args.workspaceId,
      memberId: booking.memberId,
      serviceAt,
      targets:
        booking.bookingType === "TRIAL"
          ? ["TRIAL", "GUARDIAN"]
          : ["MEMBER", "GUARDIAN"],
    });
    const exact = requirements.filter(
      (row) => row.requirementRevisionId === recovery.requirementRevisionId,
    );
    const proofs = await listAcceptanceProofsTx(tx, {
      workspaceId: args.workspaceId,
      memberId: booking.memberId,
    });
    exactAcceptanceValid =
      exact.length > 0 &&
      exact.every((requirement) =>
        matchingAcceptance({
          workspaceId: args.workspaceId,
          memberId: booking.memberId,
          requirement,
          proofs,
          serviceAt: serviceAt.toISOString(),
          acceptedBy: (args.now < serviceAt
            ? args.now
            : serviceAt
          ).toISOString(),
        }),
      );
  }
  const completedRefund =
    args.choice === "REFUND_CONFIRMED"
      ? await exactCompletedFormRefundTx(tx, recovery)
      : null;
  const refundSucceeded = !!completedRefund;
  const state = recoveryTransition({
    state: recovery.state as Parameters<typeof recoveryTransition>[0]["state"],
    version: recovery.version,
    expectedVersion: args.expectedVersion,
    choice: args.choice,
    bookingCancelled: booking.status === "CANCELLED",
    targetBookingId: args.replacementBookingId,
    exactAcceptanceValid,
    financialReviewCaseId: args.financialReviewCaseId,
    refundSucceeded,
  });
  let reviewerId = recovery.assignedToWorkspaceUserId;
  await tx.$queryRaw`SELECT id FROM workspace_users WHERE id=${reviewerId} AND "workspaceId"=${args.workspaceId} FOR SHARE`;
  if (
    !(await tx.workspaceUser.findFirst({
      where: {
        id: reviewerId,
        workspaceId: args.workspaceId,
        role: "OWNER",
        isActive: true,
      },
    }))
  ) {
    const next = await tx.workspaceUser.findFirst({
      where: { workspaceId: args.workspaceId, role: "OWNER", isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!next)
      return deny(
        "An active owner must take responsibility for this recovery.",
      );
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: next.userId,
      capability: "OWNER",
    });
    reviewerId = next.id;
  }
  const update = await tx.bookingFormRecovery.updateMany({
    where: {
      id: recovery.id,
      workspaceId: args.workspaceId,
      version: args.expectedVersion,
    },
    data: {
      assignedToWorkspaceUserId: reviewerId,
      state,
      version: { increment: 1 },
      replacementBookingId: args.replacementBookingId,
      financialReviewCaseId: args.financialReviewCaseId,
      resolvedAt: ["OPEN", "REFUND_REVIEW"].includes(state) ? null : args.now,
    },
  });
  if (update.count !== 1)
    return deny("This recovery changed. Refresh before continuing.");
  await tx.workspaceDataEvent.create({
    data: {
      workspaceId: args.workspaceId,
      actorUserId: args.actorUserId,
      kind: "FORM_RECOVERY_TRANSITIONED",
      metadata: {
        recoveryId: recovery.id,
        bookingId: recovery.bookingId,
        fundingRevision: recovery.bookingFundingRevision,
        from: recovery.state,
        to: state,
        version: recovery.version + 1,
        replacementBookingId: args.replacementBookingId ?? null,
        financialReviewCaseId:
          args.financialReviewCaseId ?? recovery.financialReviewCaseId ?? null,
        refundOperationId: completedRefund?.operationIds[0] ?? null,
        refundId: completedRefund?.refundIds[0] ?? null,
        refundOperationIds: completedRefund?.operationIds ?? [],
        refundIds: completedRefund?.refundIds ?? [],
        refundEvidenceHash: completedRefund?.evidenceHash ?? null,
        refundedAmountCents: completedRefund?.total ?? null,
        refundCurrency: completedRefund?.currency ?? null,
        signedDocumentId: args.signedDocumentId ?? null,
      },
    },
  });
  return { recoveryId: recovery.id, state, version: recovery.version + 1 };
}
export async function openFormRefundReviewTx(
  tx: Tx,
  args: {
    workspaceId: string;
    recoveryId: string;
    expectedVersion: number;
    actorUserId: string;
    now: Date;
  },
) {
  const recovery = await tx.bookingFormRecovery.findFirst({
    where: { id: args.recoveryId, workspaceId: args.workspaceId },
    include: { booking: true },
  });
  if (!recovery || recovery.booking.status !== "CANCELLED")
    return deny(
      "Cancel the affected booking without penalty before opening its refund review.",
    );
  const allocation = await exactFormDropInPaymentTx(tx, recovery.booking);
  const payment = allocation?.payment ?? null;
  const review = await queueFinancialReview(tx, {
    workspaceId: args.workspaceId,
    sourceKey: `form-recovery:${recovery.id}`,
    reason:
      "Provider form requirement stranded an accepted booking; penalty-free money recovery review. Money has not been refunded.",
    memberId: recovery.booking.memberId,
    payerAccountId: payment?.payerAccountId,
    bookingId: recovery.bookingId,
    paymentId: payment?.id,
    amountCents: payment
      ? Math.min(
          recovery.booking.dropInPriceCents ?? payment.amountCents,
          payment.amountCents - payment.refundedAmountCents,
        )
      : null,
    currency: payment?.currency,
  });
  return transitionBookingFormRecoveryTx(tx, {
    ...args,
    choice: "REFUND_REVIEW",
    financialReviewCaseId: review.id,
  });
}

export async function shouldDeliverFormRequirementNotice(
  job: {
    workspaceId: string;
    recipientEmail: string;
    context?: Prisma.JsonValue | null;
  },
  db: PrismaClient,
  now: Date,
) {
  const context = job.context as {
    kind?: string;
    revisionId?: string;
    memberId?: string;
    signerUserId?: string;
    guardianId?: string | null;
    grantId?: string | null;
    threshold?: string;
    signedDocumentId?: string;
  } | null;
  if (
    context?.kind !== "FORM_REQUIREMENT" ||
    !context.revisionId ||
    !context.memberId ||
    !context.signerUserId ||
    !["PUBLICATION", "EXPIRY"].includes(context.threshold ?? "")
  )
    return false;
  const revision = await db.formRequirementRevision.findFirst({
    where: { id: context.revisionId, workspaceId: job.workspaceId },
  });
  if (!revision) return false;
  const { listEffectiveFormAssignments } =
    await import("./form-requirement-bindings.js");
  const bindings = await listEffectiveFormAssignments({
    db,
    workspaceId: job.workspaceId,
    now,
    includeUpcoming: true,
  });
  const binding = bindings.find(
    (row) => row.requirementRevisionId === revision.id,
  );
  if (
    !binding ||
    (binding.consentValidUntil && binding.consentValidUntil <= now)
  )
    return false;
  const { resolveRevisionFormStatuses } =
    await import("./form-requirement-signing.js");
  const status = await resolveRevisionFormStatuses({
    db,
    workspaceId: job.workspaceId,
    memberId: context.memberId,
    now,
    includeUpcoming: true,
    ensureRequests: false,
  });
  const signerKind = context.guardianId ? "GUARDIAN" : "MEMBER";
  const applicable = status.items.filter(
    (item) =>
      item.requirementRevisionId === revision.id &&
      item.signerKind === signerKind,
  );
  if (
    !applicable.length ||
    (context.threshold === "PUBLICATION" &&
      applicable.every((item) => item.status === "SIGNED"))
  )
    return false;
  const recipient = await db.$transaction((tx) =>
    formSigningRecipientsTx(tx, {
      workspaceId: job.workspaceId,
      memberId: context.memberId!,
      signerKind: context.guardianId ? "GUARDIAN" : "MEMBER",
    }),
  );
  if (
    !recipient.some(
      (row) =>
        row.userId === context.signerUserId &&
        row.email.toLowerCase() === job.recipientEmail.toLowerCase() &&
        row.grantId === (context.grantId ?? null) &&
        row.guardianId === (context.guardianId ?? null),
    )
  )
    return false;
  if (context.threshold === "EXPIRY") {
    if (!context.signedDocumentId) return false;
    const proof = await db.signedDocument.findFirst({
      where: {
        id: context.signedDocumentId,
        workspaceId: job.workspaceId,
        memberId: context.memberId,
        requirementRevisionId: revision.id,
        validUntil: { gt: now },
      },
    });
    if (
      !proof?.validUntil ||
      now.getTime() <
        proof.validUntil.getTime() -
          parseRequirementTerms(revision.terms).expiryWarningLeadMinutes * 60000
    )
      return false;
    // Already accepting a published renewal suppresses the old-expiry reminder.
    const renewedCycles = bindings
      .filter(
        (row) =>
          row.formDocument.id === binding.formDocument.id &&
          row.requirementRevisionId !== revision.id &&
          row.effectiveAt &&
          row.effectiveAt <= proof.validUntil! &&
          (!row.consentValidUntil || row.consentValidUntil > proof.validUntil!),
      )
      .map((row) => row.acceptanceCycleKey);
    if (
      renewedCycles.length &&
      (await db.signedDocument.findFirst({
        where: {
          workspaceId: job.workspaceId,
          memberId: context.memberId,
          acceptanceCycleKey: { in: renewedCycles },
          signerKind: proof.signerKind,
        },
      }))
    )
      return false;
  }
  return true;
}

/** Bounded restartable warning sweep; the outbox alone owns provider delivery. */
export async function processFormRequirementWarnings(args: {
  db: PrismaClient;
  workspaceId: string;
  portalOrigin: string;
  now?: Date;
  limit?: number;
}) {
  const now = args.now ?? new Date(),
    limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  const origin = new URL(args.portalOrigin);
  if (
    origin.username ||
    origin.password ||
    !["https:", "http:"].includes(origin.protocol) ||
    (origin.protocol === "http:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    return deny("Configure the member portal origin.");
  return formRequirementTransaction(args.db, async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    const candidates = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT s.id FROM signed_documents s JOIN form_requirement_revisions r ON r.id=s."requirementRevisionId"
      WHERE s."workspaceId"=${args.workspaceId} AND s."validUntil">${now}
        AND s."validUntil"-((r.terms->>'expiryWarningLeadMinutes')::int*INTERVAL '1 minute')<=${now}
        AND NOT EXISTS(SELECT 1 FROM workspace_data_events e WHERE e."workspaceId"=s."workspaceId"
          AND e.kind='FORM_EXPIRY_WARNING_PROCESSED' AND e.metadata->>'signedDocumentId'=s.id)
      ORDER BY s."validUntil",s.id LIMIT ${limit}`;
    let queued = 0,
      needsContactReview = 0;
    for (const candidate of candidates) {
      const proof = await tx.signedDocument.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { requirementRevision: true },
      });
      const revision = proof.requirementRevision!;
      const recipients = await formSigningRecipientsTx(tx, {
        workspaceId: args.workspaceId,
        memberId: proof.memberId,
        signerKind: proof.signerKind,
      });
      if (!recipients.length) needsContactReview++;
      for (const recipient of recipients) {
        await enqueueNotificationJob({
          db: tx,
          now,
          input: {
            workspaceId: args.workspaceId,
            templateKind: "ANNOUNCEMENT",
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subject: "A signed gym form is approaching its expiry",
            body: `The acceptance is valid until ${proof.validUntil!.toISOString()}. Sign in to review the current requirement, any published renewal and affected bookings. No renewal is inferred from this reminder. ${origin.origin}/app/forms`,
            dedupeKey: `form-expiry:${proof.id}:${recipient.userId}`,
            expiresAt: proof.validUntil!,
            context: json({
              kind: "FORM_REQUIREMENT",
              revisionId: revision.id,
              memberId: proof.memberId,
              signerUserId: recipient.userId,
              guardianId: recipient.guardianId,
              grantId: recipient.grantId,
              threshold: "EXPIRY",
              signedDocumentId: proof.id,
            }),
          },
        });
        queued++;
      }
      await tx.workspaceDataEvent.create({
        data: {
          workspaceId: args.workspaceId,
          kind: "FORM_EXPIRY_WARNING_PROCESSED",
          metadata: {
            revisionId: revision.id,
            signedDocumentId: proof.id,
            memberId: proof.memberId,
            queuedCount: recipients.length,
            needsContactReview: !recipients.length,
            assignedToUserId: revision.actorUserId,
            deliveryState: "QUEUED_WITHOUT_PROVIDER_RECEIPT",
          },
        },
      });
    }
    return { processed: candidates.length, queued, needsContactReview };
  });
}

/** Same authority boundary for the member, a verified canBook guardian, or owner. */
export async function requireBookingFormRecoveryTx(
  tx: Tx,
  args: {
    workspaceId: string;
    actorUserId: string;
    recoveryId: string;
    expectedVersion: number;
    now: Date;
    allowResolvedReplay?: boolean;
  },
) {
  await lockStaffAuthorityTx(tx, {
    workspaceId: args.workspaceId,
    userId: args.actorUserId,
  });
  const actor = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      role: { in: ["OWNER", "CUSTOMER"] },
      isActive: true,
      workspace: { status: { not: "DISABLED" } },
    },
  });
  if (!actor)
    return deny(
      "Your booking access changed. Sign in again or contact the gym.",
    );
  await tx.$queryRaw`SELECT id FROM booking_form_recoveries WHERE id=${args.recoveryId} AND "workspaceId"=${args.workspaceId} FOR UPDATE`;
  const recovery = await tx.bookingFormRecovery.findFirst({
    where: { id: args.recoveryId, workspaceId: args.workspaceId },
    include: {
      booking: {
        include: {
          member: true,
          classTemplate: { include: classOccurrenceInclude },
        },
      },
      requirementRevision: true,
    },
  });
  if (
    !recovery ||
    (!args.allowResolvedReplay &&
      (recovery.version !== args.expectedVersion || recovery.state !== "OPEN"))
  )
    return deny("This recovery changed. Refresh its current choices.");
  const booking = recovery.booking;
  if (
    !args.allowResolvedReplay &&
    (booking.fundingRevision !== recovery.bookingFundingRevision ||
      !["BOOKED", "PENDING_PAYMENT"].includes(booking.status))
  )
    return deny(
      "This booking commitment changed. Ask the named owner to review its history.",
    );
  if (actor.role !== "OWNER" && booking.member.userId !== args.actorUserId) {
    await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE "workspaceId"=${args.workspaceId} AND "userId"=${args.actorUserId} AND "memberId"=${booking.memberId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM family_links WHERE "workspaceId"=${args.workspaceId} AND "childMemberId"=${booking.memberId} ORDER BY id FOR SHARE`;
    const grant = await tx.memberPortalGrant.findFirst({
      where: {
        workspaceId: args.workspaceId,
        userId: args.actorUserId,
        memberId: booking.memberId,
        canBook: true,
        revokedAt: null,
        guardian: {
          workspaceId: args.workspaceId,
          familyLinks: {
            some: {
              workspaceId: args.workspaceId,
              childMemberId: booking.memberId,
            },
          },
        },
      },
    });
    if (!grant?.verifiedAt)
      return deny(
        "Your permission to manage this participant's bookings is no longer active.",
      );
  }
  if (args.allowResolvedReplay)
    return {
      recovery,
      booking,
      actor,
      serviceAt: args.now,
      timezone: booking.classTemplate.workspace.location?.timezone ?? "UTC",
    };
  const occurrence = resolveClassOccurrence({
    template: booking.classTemplate as unknown as ClassOccurrenceTemplate,
    scheduledForDate: toDateOnlyString(booking.scheduledForDate),
  });
  if (!occurrence || occurrence.status === "CANCELLED" || !occurrence.timezone)
    return deny(
      "The dated class changed. Ask the owner to review the current commitment.",
    );
  const serviceAt = getZonedDateTimeAsUtc({
    dateString: toDateOnlyString(booking.scheduledForDate),
    minutes: occurrence.startTimeMinutes,
    timezone: occurrence.timezone,
  });
  const accepted = parseBookingFormSnapshot(booking.formRequirementSnapshot),
    evidence = recovery.evidence as Prisma.JsonObject;
  if (
    formEvidenceHash(recovery.evidence) !== recovery.evidenceHash ||
    evidence.cause !== "PROVIDER_REQUIREMENT_AFTER_BOOKING" ||
    recovery.acceptedSnapshotHash !== (accepted?.snapshotHash ?? null) ||
    recovery.requirementRevision.publishedAt <=
      new Date(accepted?.acceptedAt ?? booking.createdAt) ||
    recovery.requirementRevision.effectiveAt > serviceAt
  )
    return deny(
      "The accepted commitment or recovery evidence needs owner review.",
    );
  const decision = await evaluateBookingFormsTx(tx, {
    workspaceId: args.workspaceId,
    bookingId: booking.id,
    serviceAt,
    now: args.now,
    state: "NO_SHOW",
  });
  if (
    !(
      decision.kind === "PROVIDER_RECOVERY_REQUIRED" &&
      decision.revisionIds.includes(recovery.requirementRevisionId)
    ) &&
    !(decision.kind === "CLEAR" && serviceAt > args.now)
  )
    return deny(
      "This booking was admissible at service, or its governing requirement changed. Refresh its current attendance and recovery history.",
    );
  const attendance = await tx.attendanceRecord.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: booking.memberId,
      classTemplateId: booking.classTemplateId,
      scheduledForDate: booking.scheduledForDate,
    },
  });
  if (attendance)
    return deny(
      "Recorded attendance needs a reasoned correction before this recovery changes its funding. Ask the named owner to review the roster.",
    );
  // Preserve a named active reviewer if the original publisher left the business.
  const reviewer = await tx.workspaceUser.findFirst({
    where: { workspaceId: args.workspaceId, role: "OWNER", isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!reviewer)
    return deny("An active owner must take responsibility for this recovery.");
  await requireActiveStaffAccessTx(tx, {
    workspaceId: args.workspaceId,
    userId: reviewer.userId,
    capability: "OWNER",
  });
  if (reviewer.id !== recovery.assignedToWorkspaceUserId) {
    const changed = await tx.bookingFormRecovery.updateMany({
      where: { id: recovery.id, version: recovery.version },
      data: {
        assignedToWorkspaceUserId: reviewer.id,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      return deny("This recovery changed. Refresh before continuing.");
    recovery.version++;
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: args.workspaceId,
        actorUserId: args.actorUserId,
        kind: "FORM_RECOVERY_TRANSITIONED",
        metadata: {
          recoveryId: recovery.id,
          version: recovery.version,
          action: "REVIEWER_REASSIGNED",
          assignedToWorkspaceUserId: reviewer.id,
        },
      },
    });
  }
  return { recovery, booking, actor, serviceAt, timezone: occurrence.timezone };
}
