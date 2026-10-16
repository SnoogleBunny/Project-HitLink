import { createHash } from "node:crypto";
import {
  dateOnlyStringToUtcDate,
  financialEntitlementHoldReason,
  getZonedDateTimeAsUtc,
  lockClassSchedule,
  membershipAllowanceWindows,
  parseDateOnlyString,
  prisma,
  type PrismaClient,
  type Prisma,
} from "@flowstate/db";
type Actor = { workspaceId: string; workspaceUserId: string; userId: string };
const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
async function reviewTx(
  actor: Actor,
  membershipId: string,
  db: PrismaClient | Prisma.TransactionClient,
) {
  if (
    !(await db.workspaceUser.findFirst({
      where: {
        id: actor.workspaceUserId,
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        role: "OWNER",
        isActive: true,
      },
    }))
  )
    throw new Error("Only an active owner can review source billing evidence.");
  const contract = await db.memberMembership.findFirst({
    where: { id: membershipId, workspaceId: actor.workspaceId },
    include: {
      sourceBillingEvidence: {
        orderBy: [
          { paidThrough: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      },
      member: { select: { fullName: true } },
    },
  });
  if (
    !contract?.sourceBillingManaged ||
    contract.stripeSubscriptionId ||
    contract.currentMembershipSlot !== "CURRENT" ||
    ["CANCELLED", "ENDED"].includes(contract.status)
  )
    return null;
  const last = contract.sourceBillingEvidence[0];
  if (!last) return null;
  const paidFrom = last.paidThrough.toISOString().slice(0, 10);
  const next = membershipAllowanceWindows({
    anchorDate: (contract.allowanceAnchorDate ?? last.paidFrom)
      .toISOString()
      .slice(0, 10),
    scheduledForDate: paidFrom,
    weeklyClassLimit: null,
    monthlyClassLimit: 1,
  })[0]!.endsOn;
  const reviewToken = hash(
    JSON.stringify({
      ...contract,
      sourceBillingEvidence: contract.sourceBillingEvidence.map(
        ({ sourceReceiptData, ...r }) => ({
          ...r,
          receiptBytesHash: sourceReceiptData ? hash(sourceReceiptData) : null,
        }),
      ),
    }),
  );
  return { contract, last, paidFrom, next, reviewToken };
}
export async function getSourceBillingRenewalReview(
  actor: Actor,
  membershipId: string,
  db: PrismaClient = prisma,
) {
  const r = await reviewTx(actor, membershipId, db);
  return r
    ? {
        membershipId,
        memberId: r.contract.memberId,
        memberName: r.contract.member.fullName,
        sourceSystem: r.last.sourceSystem,
        sourceContractReference: r.last.sourceContractReference,
        sourceAccountReference: r.last.sourceAccountReference,
        bindingPaidFrom: r.last.paidFrom.toISOString().slice(0, 10),
        bindingNextRenewalOn: r.last.nextRenewalOn.toISOString().slice(0, 10),
        paidFrom: r.paidFrom,
        suggestedPaidThrough: r.next,
        reviewToken: r.reviewToken,
      }
    : null;
}
export async function recordSourceBillingRenewal(
  actor: Actor,
  input: {
    membershipId: string;
    reviewToken: string;
    operationKey: string;
    paidFrom: string;
    paidThrough: string;
    nextRenewalOn: string;
    sourceReference: string;
    sourceAccountReference: string;
    bindingOnly?: boolean;
    receiptData: Uint8Array;
  },
  db: PrismaClient = prisma,
) {
  if (
    !/^[\da-f-]{36}$/i.test(input.operationKey) ||
    !input.sourceReference.trim() ||
    !input.sourceAccountReference.trim() ||
    input.sourceAccountReference.length > 200 ||
    input.sourceReference.length > 1000
  )
    throw new Error(
      "Record the source receipt reference and a new review operation.",
    );
  if (
    [input.paidFrom, input.paidThrough, input.nextRenewalOn].some(
      (d) => parseDateOnlyString(d).status === "error",
    ) ||
    !(
      input.paidFrom < input.paidThrough &&
      input.paidThrough <= input.nextRenewalOn
    )
  )
    throw new Error(
      "Use exact source dates: the paid-through date is exclusive and cannot pass the next renewal.",
    );
  const bytes = Buffer.from(input.receiptData);
  if (
    bytes.length < 8 ||
    bytes.length > 5_000_000 ||
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw new Error("Attach the original paid source PDF receipt, up to 5 MB.");
  const checksum = hash(bytes),
    payload = {
      membershipId: input.membershipId,
      paidFrom: input.paidFrom,
      paidThrough: input.paidThrough,
      nextRenewalOn: input.nextRenewalOn,
      sourceReference: input.sourceReference.trim(),
      sourceAccountReference: input.sourceAccountReference.trim(),
      bindingOnly: !!input.bindingOnly,
      receiptHash: checksum,
    },
    rowHash = hash(JSON.stringify(payload));
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const r = await reviewTx(actor, input.membershipId, tx);
    if (!r)
      throw new Error(
        "This contract is no longer source billed. Review its billing ownership.",
      );
    const prior = await tx.sourceBillingEvidence.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: actor.workspaceId,
          operationKey: input.operationKey,
        },
      },
    });
    if (prior) {
      if (prior.sourceRowHash !== rowHash)
        throw new Error(
          "This operation already records different source dates or receipt bytes.",
        );
      return { status: "recorded" as const, evidenceId: prior.id };
    }
    const hold = await financialEntitlementHoldReason({
      workspaceId: actor.workspaceId,
      targets: [{ targetKind: "MEMBERSHIP", targetId: r.contract.id }],
      db: tx,
    });
    if (hold) throw new Error(hold);
    if (
      r.last.sourceAccountReference &&
      r.last.sourceAccountReference !== input.sourceAccountReference.trim()
    )
      throw new Error(
        "The source account must match the original contract evidence.",
      );
    if (
      input.bindingOnly &&
      (r.last.sourceAccountReference ||
        input.paidFrom !== r.last.paidFrom.toISOString().slice(0, 10) ||
        input.paidThrough !== r.paidFrom ||
        input.nextRenewalOn !== r.last.nextRenewalOn.toISOString().slice(0, 10))
    )
      throw new Error(
        "An account binding preserves the exact existing paid period and cannot replace a known source account.",
      );
    if (
      r.reviewToken !== input.reviewToken ||
      (!input.bindingOnly && r.paidFrom !== input.paidFrom)
    )
      throw new Error(
        "The contract or source evidence changed. Review the next period again.",
      );
    if (
      r.contract.endedAt &&
      getZonedDateTimeAsUtc({
        dateString: input.paidThrough,
        minutes: 0,
        timezone: r.contract.allowanceTimezone ?? "UTC",
      }) > r.contract.endedAt
    )
      throw new Error(
        "Source evidence cannot extend access beyond the accepted membership end date.",
      );
    const evidence = await tx.sourceBillingEvidence.create({
      data: {
        workspaceId: actor.workspaceId,
        memberMembershipId: r.contract.id,
        sourceSystem: r.last.sourceSystem,
        sourceContractReference: r.last.sourceContractReference,
        sourceAccountReference: input.sourceAccountReference.trim(),
        paidFrom: dateOnlyStringToUtcDate(input.paidFrom),
        paidThrough: dateOnlyStringToUtcDate(input.paidThrough),
        nextRenewalOn: dateOnlyStringToUtcDate(input.nextRenewalOn),
        sourceEvidence: input.sourceReference.trim(),
        acceptanceEvidence: r.last.acceptanceEvidence,
        payerAuthorityEvidence: r.last.payerAuthorityEvidence,
        sourceFileHash: checksum,
        sourceRowHash: rowHash,
        sourceReceiptData: bytes,
        sourceReceiptHash: checksum,
        actorId: actor.workspaceUserId,
        operationKey: input.operationKey,
      },
    });
    if (!input.bindingOnly)
      await tx.memberMembership.update({
        where: { id: r.contract.id },
        data: {
          nextBillingDate: getZonedDateTimeAsUtc({
            dateString: input.nextRenewalOn,
            minutes: 0,
            timezone: r.contract.allowanceTimezone ?? "UTC",
          }),
        },
      });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: input.bindingOnly
          ? "SOURCE_ACCOUNT_BINDING_RECORDED"
          : "SOURCE_PAID_PERIOD_RECORDED",
        metadata: { evidenceId: evidence.id, ...payload },
      },
    });
    return { status: "recorded" as const, evidenceId: evidence.id };
  });
}
