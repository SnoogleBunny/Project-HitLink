import { prisma } from "@flowstate/db";
const reviewSelect = {
  id: true,
  reason: true,
  amountCents: true,
  currency: true,
  createdAt: true,
  resolvedAt: true,
  resolution: true,
  memberId: true,
  bookingId: true,
  paymentId: true,
  operationId: true,
  member: { select: { fullName: true } },
  payerAccount: { select: { member: { select: { fullName: true } } } },
  booking: { select: { classTemplateId: true, scheduledForDate: true } },
} as const;
export async function getFinancialReviewQueue(args: {
  workspaceId: string;
  history?: boolean;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  return db.financialReviewCase.findMany({
    where: {
      workspaceId: args.workspaceId,
      resolvedAt: args.history ? { not: null } : null,
    },
    select: reviewSelect,
    orderBy: args.history ? { resolvedAt: "desc" } : { createdAt: "asc" },
    ...(args.history ? { take: 50 } : {}),
  });
}
export async function getFinancialReviewCase(args: {
  workspaceId: string;
  caseId: string;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  const item = await db.financialReviewCase.findFirst({
    where: { id: args.caseId, workspaceId: args.workspaceId },
    select: reviewSelect,
  });
  if (!item) return null;
  const adjustment = item.operationId
    ? await db.financialOperation.findFirst({
        where: {
          id: item.operationId,
          workspaceId: args.workspaceId,
          kind: { in: ["REFUND", "ISSUE_CREDIT", "APPLY_CREDIT"] },
        },
        select: { id: true },
      })
    : null;
  return { ...item, adjustmentOperationId: adjustment?.id ?? null };
}
export type FinancialReviewItem = Awaited<
  ReturnType<typeof getFinancialReviewQueue>
>[number];
