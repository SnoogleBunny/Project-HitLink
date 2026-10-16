import { createHash, randomUUID } from "node:crypto";
import { Prisma, type FinancialOperation, type FinancialOperationStatus } from "@prisma/client";

export class FinancialError extends Error {}
export type FinancialTransaction = Prisma.TransactionClient;

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
export function financialRequestHash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export async function lockFinancialAccount(tx: FinancialTransaction, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))`;
}

/** Call before the financial lock. Permission changes take this same lock. */
export async function requireFinancialPayer(tx: FinancialTransaction, args: {
  workspaceId: string; actorUserId: string; payerMemberId: string; beneficiaryMemberId: string;
}) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
  const [payer, beneficiary, membership] = await Promise.all([
    tx.member.findFirst({ where: { id: args.payerMemberId, workspaceId: args.workspaceId, userId: args.actorUserId }, include: { user: { select: { email: true } } } }),
    tx.member.findFirst({ where: { id: args.beneficiaryMemberId, workspaceId: args.workspaceId } }),
    tx.workspaceUser.findFirst({ where: { workspaceId: args.workspaceId, userId: args.actorUserId, role: "CUSTOMER", isActive: true } }),
  ]);
  if (!payer?.user || !beneficiary || !membership) throw new FinancialError("This account cannot make this purchase.");
  if (payer.id !== beneficiary.id) {
    const grant = await tx.memberPortalGrant.findUnique({ where: { workspaceId_userId_memberId: { workspaceId: args.workspaceId, userId: args.actorUserId, memberId: beneficiary.id } } });
    if (!grant || grant.revokedAt || !grant.canPay || !await tx.familyLink.findFirst({ where: { workspaceId: args.workspaceId, childMemberId: beneficiary.id, guardianId: grant.guardianId, guardian: { workspaceId: args.workspaceId } } })) throw new FinancialError("You no longer have permission to pay for this family member.");
  }
  return { payer, beneficiary };
}

/** The caller must hold the workspace financial lock. */
export async function reserveFinancialOperation(tx: FinancialTransaction, input: {
  workspaceId: string; operationKey: string; kind: FinancialOperation["kind"];
  actorUserId?: string; payerAccountId?: string; beneficiaryMemberId?: string;
  targetId?: string; paymentId?: string; invoiceId?: string; amountCents?: number;
  currency?: string; units?: number; providerAccountId?: string; payload: Prisma.InputJsonObject;
  expiresAt?: Date;
}) {
  const requestHash = financialRequestHash(input);
  const prior = await tx.financialOperation.findUnique({ where: { workspaceId_operationKey: { workspaceId: input.workspaceId, operationKey: input.operationKey } } });
  if (prior) {
    if (prior.requestHash !== requestHash) throw new FinancialError("This request changed. Reload its current details before continuing.");
    return prior;
  }
  const id = randomUUID();
  return tx.financialOperation.create({ data: {
    ...input, id, requestHash, providerIdempotencyKey: `hitlink:${input.kind.toLowerCase()}:${id}`,
    events: { create: { workspaceId: input.workspaceId, version: 1, state: "RESERVED", detail: { action: "reserved", actorUserId: input.actorUserId ?? null } } },
  } });
}

/** One versioned journal event accompanies every transition, including uncertainty. */
export async function transitionFinancialOperation(tx: FinancialTransaction, operation: FinancialOperation, state: FinancialOperationStatus, detail: Prisma.InputJsonObject, changes: {
  providerReference?: string; providerUrl?: string | null; paymentId?: string; refundId?: string;
  lastError?: string | null; submittedAt?: Date; settledAt?: Date; result?: Prisma.InputJsonObject;
} = {}) {
  if (operation.status === "SUCCEEDED" && state !== "SUCCEEDED") return operation;
  const changed = await tx.financialOperation.updateMany({ where: { id: operation.id, version: operation.version }, data: { ...changes, status: state, version: { increment: 1 } } });
  if (changed.count !== 1) throw new FinancialError("The payment changed. Reload its status before continuing.");
  await tx.financialOperationEvent.create({ data: { workspaceId: operation.workspaceId, operationId: operation.id, version: operation.version + 1, state, detail } });
  return tx.financialOperation.findUniqueOrThrow({ where: { id: operation.id } });
}

export async function queueFinancialReview(tx: FinancialTransaction, args: {
  workspaceId: string; sourceKey: string; reason: string; memberId?: string | null;
  payerAccountId?: string | null; bookingId?: string | null; paymentId?: string | null;
  amountCents?: number | null; currency?: string | null; operationId?: string | null;
}) {
  return tx.financialReviewCase.upsert({ where: { workspaceId_sourceKey: { workspaceId: args.workspaceId, sourceKey: args.sourceKey } }, update: {}, create: args });
}
