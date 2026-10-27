import { createHash } from "node:crypto";
import {
  financialEntitlementHoldReason,
  lockClassSchedule,
  lockStaffAuthorityTx,
  prisma,
  type Prisma,
  type PrismaClient,
} from "@flowstate/db";
type Actor = { workspaceId: string; workspaceUserId: string; userId: string };
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function reviewTx(
  actor: Actor,
  caseId: string,
  db: Prisma.TransactionClient | PrismaClient,
) {
  await lockStaffAuthorityTx(db, actor);
  if (
    !(await db.workspaceUser.findFirst({
      where: {
        id: actor.workspaceUserId,
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        role: "OWNER",
        isActive: true,
        workspace: { status: { not: "DISABLED" } },
      },
    }))
  )
    throw new Error("Only an active owner can review source refunds.");
  const item = await db.financialReviewCase.findFirst({
    where: { id: caseId, workspaceId: actor.workspaceId },
    include: {
      payment: { include: { importedEvidence: {include:{payer:{select:{fullName:true}}}} } },
      booking: true,
    },
  });
  const evidence = item?.payment?.importedEvidence;
  if (
    !item ||
    !evidence ||
    evidence.sourceRecordKind !== "PAYMENT" ||
    evidence.sourceStatus !== "SUCCEEDED" ||
    evidence.refundOwner !== "SOURCE" ||
    item.payment!.stripePaymentIntentId
  )
    return null;
  const originalId = item.booking?.fundedByBookingId ?? item.bookingId;
  const allocation = originalId
    ? await db.importedBookingFunding.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          bookingId: originalId,
          evidenceId: evidence.id,
        },
      })
    : null;
  const receipts = await db.importedFinancialEvidence.findMany({
    where: {
      workspaceId: actor.workspaceId,
      parentEvidenceId: evidence.id,
      sourceRecordKind: "REFUND",
    },
    orderBy: { id: "asc" },
  });
  const caseRefunded = receipts
    .filter((r) => (r.sourceSnapshot as { caseId?: string })?.caseId === caseId)
    .reduce((sum, r) => sum + r.amountCents, 0);
  const caseRemaining = Math.max(
    0,
    (item.amountCents ?? allocation?.amountCents ?? 0) - caseRefunded,
  );
  const available = Math.min(
    caseRemaining,
    Math.max(0, item.payment!.amountCents - item.payment!.refundedAmountCents),
  );
  const token = hash({
    item,
    evidence,
    allocation,
    receipts: receipts.map((r) => ({ id: r.id, hash: r.sourceRowHash })),
  });
  return {
    item,
    evidence,
    allocation,
    receipts,
    caseRemaining,
    available,
    token,
  };
}
export async function getSourceRefundReview(
  actor: Actor,
  caseId: string,
  db: PrismaClient = prisma,
) {
  const result = await reviewTx(actor, caseId, db);
  if (!result) return null;
  return {
    payerName: result.evidence.payer.fullName,
    sourceSystem: result.evidence.sourceSystem,
    sourcePaymentReference: result.evidence.sourceExternalId,
    currency: result.evidence.currency,
    remainingCents: result.available,
    reviewToken: result.token,
    canRecord:
      !result.item.resolvedAt &&
      result.item.booking?.status === "CANCELLED" &&
      !!result.allocation &&
      result.available > 0,
    receipts: result.receipts
      .filter(
        (r) => (r.sourceSnapshot as { caseId?: string })?.caseId === caseId,
      )
      .map((r) => ({
        id: r.id,
        reference: r.sourceExternalId,
        amountCents: r.amountCents,
        occurredAt: r.occurredAt,
      })),
  };
}
/** Records an already completed source refund. This never calls or simulates a payment provider. */
export async function recordSourceRefundReceipt(
  actor: Actor,
  input: {
    caseId: string;
    reviewToken: string;
    sourceReference: string;
    amountCents: number;
    refundedAt: string;
    receiptData: Uint8Array;
    reason: string;
  },
  db: PrismaClient = prisma,
) {
  if (
    !input.sourceReference.trim() ||
    input.sourceReference.length > 200 ||
    !input.reason.trim() ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0
  )
    throw new Error(
      "Enter the exact source refund reference, amount and reason.",
    );
  const date = new Date(input.refundedAt),
    bytes = Buffer.from(input.receiptData);
  if (
    !Number.isFinite(date.getTime()) ||
    date > new Date() ||
    !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.refundedAt)
  )
    throw new Error("Use the source receipt's exact timestamp and timezone.");
  if (
    bytes.length < 8 ||
    bytes.length > 5_000_000 ||
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw new Error(
      "Attach the original source refund PDF receipt (up to 5 MB).",
    );
  const receiptHash = createHash("sha256").update(bytes).digest("hex");
  const sourceSnapshot = {
    kind: "LIVE_SOURCE_REFUND",
    caseId: input.caseId,
    sourceReference: input.sourceReference.trim(),
    amountCents: input.amountCents,
    refundedAt: date.toISOString(),
    receiptHash,
    receiptBase64: bytes.toString("base64"),
    reason: input.reason.trim(),
  };
  const sourceRowHash = hash(sourceSnapshot);
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const review = await reviewTx(actor, input.caseId, tx);
    if (!review)
      throw new Error("This case has no reviewed source-owned payment.");
    const prior = await tx.importedFinancialEvidence.findUnique({
      where: {
        workspaceId_sourceSystem_sourceRecordKind_sourceExternalId: {
          workspaceId: actor.workspaceId,
          sourceSystem: review.evidence.sourceSystem,
          sourceRecordKind: "REFUND",
          sourceExternalId: input.sourceReference.trim(),
        },
      },
    });
    if (prior) {
      if (prior.sourceRowHash !== sourceRowHash)
        throw new Error(
          "That source refund reference already contains different receipt details.",
        );
      return { status: "recorded" as const, refundId: prior.refundId };
    }
    if (review.token !== input.reviewToken)
      throw new Error(
        "The payment or review changed. Reload and review the current amount before recording.",
      );
    if (
      review.item.resolvedAt ||
      review.item.booking?.status !== "CANCELLED" ||
      !review.allocation ||
      input.amountCents > review.available
    )
      throw new Error(
        "Only the reviewed cancelled class balance can be refunded here.",
      );
    const held = await financialEntitlementHoldReason({
      workspaceId: actor.workspaceId,
      targets: [
        { targetKind: "BOOKING", targetId: review.item.booking.id },
        { targetKind: "BOOKING", targetId: review.allocation.bookingId },
      ],
      db: tx,
    });
    if (held) throw new Error(held);
    const payment = review.item.payment!;
    if (payment.paidAt && date < payment.paidAt)
      throw new Error("The source refund cannot precede its payment.");
    const related = await tx.importedBookingFunding.findMany({
      where: { workspaceId: actor.workspaceId, evidenceId: review.evidence.id },
      include: { booking: { include: { fundedBookings: true } } },
    });
    const stillActive = related
      .filter(
        (a) =>
          a.booking.status !== "CANCELLED" ||
          a.booking.fundedBookings.some((b) => b.status !== "CANCELLED"),
      )
      .reduce((sum, a) => sum + a.amountCents, 0);
    if (
      stillActive >
      payment.amountCents - payment.refundedAmountCents - input.amountCents
    )
      throw new Error(
        "Resolve the payment's remaining active classes before recording this refund.",
      );
    const refund = await tx.refund.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId: review.evidence.beneficiaryMemberId,
        paymentId: payment.id,
        source: "IMPORTED",
        status: "IMPORTED",
        amountCents: input.amountCents,
        currency: payment.currency,
        refundedAt: date,
        reason: input.reason.trim(),
        importedExternalId: `${review.evidence.sourceSystem}:${input.sourceReference.trim()}`,
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { refundedAmountCents: { increment: input.amountCents } },
    });
    await tx.importedFinancialEvidence.create({
      data: {
        workspaceId: actor.workspaceId,
        sourceSystem: review.evidence.sourceSystem,
        sourceAccountReference: review.evidence.sourceAccountReference,
        sourceRecordKind: "REFUND",
        sourceExternalId: input.sourceReference.trim(),
        sourceStatus: "SUCCEEDED",
        billingOwner: "SOURCE",
        refundOwner: "SOURCE",
        payerMemberId: review.evidence.payerMemberId,
        beneficiaryMemberId: review.evidence.beneficiaryMemberId,
        payerAuthorityEvidence: review.evidence.payerAuthorityEvidence,
        sourceEvidence: input.reason.trim(),
        sourceFileHash: receiptHash,
        sourceRowHash,
        sourceSnapshot,
        amountCents: input.amountCents,
        paidCents: input.amountCents,
        currency: payment.currency,
        occurredAt: date,
        importJobId: review.evidence.importJobId,
        stagingRecordId: review.evidence.stagingRecordId,
        actorId: actor.workspaceUserId,
        refundId: refund.id,
        parentEvidenceId: review.evidence.id,
      },
    });
    if (input.amountCents === review.caseRemaining)
      await tx.financialReviewCase.update({
        where: { id: input.caseId },
        data: {
          resolvedAt: new Date(),
          resolvedByUserId: actor.userId,
          resolution: `Source refund confirmed by receipt ${input.sourceReference.trim()}. Original source remains the payment provider.`,
        },
      });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        kind: "SOURCE_REFUND_RECEIPT",
        actorUserId: actor.userId,
        metadata: {
          refundId: refund.id,
          caseId: input.caseId,
          receiptHash,
          sourceReference: input.sourceReference.trim(),
          amountCents: input.amountCents,
          currency: payment.currency,
        },
      },
    });
    return { status: "recorded" as const, refundId: refund.id };
  });
}
