import { prisma } from "@flowstate/db";

const beneficiary = { select: { fullName: true } } as const;
export async function getPayerBillingData(args: {
  workspaceId: string;
  userId: string;
  payerMemberId: string;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  const account = await db.financialAccount.findFirst({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      memberId: args.payerMemberId,
    },
    select: { id: true },
  });
  if (!account)
    return { operations: [], invoices: [], payments: [], credits: [], creditHistory: [] };
  const scope = { workspaceId: args.workspaceId, payerAccountId: account.id };
  const [operations, invoices, payments, credits, creditHistory] = await Promise.all([
    db.financialOperation.findMany({
      where: {
        ...scope,
        status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
      },
      select: {
        id: true,
        targetId: true,
        kind: true,
        status: true,
        amountCents: true,
        currency: true,
        createdAt: true,
        expiresAt: true,
        beneficiaryMember: beneficiary,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invoice.findMany({
      where: { ...scope, status: "OPEN" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalCents: true,
        amountPaidCents: true,
        amountDueCents: true,
        currency: true,
        issuedAt: true,
        dueAt: true,
        member: beneficiary,
      },
      orderBy: { dueAt: "asc" },
    }),
    db.payment.findMany({
      where: scope,
      select: {
        id: true,
        status: true,
        amountCents: true,
        refundedAmountCents: true,
        currency: true,
        paidAt: true,
        failedAt: true,
        createdAt: true,
        member: beneficiary,
        invoice: { select: { invoiceNumber: true } },
        refunds: {
          select: {
            id: true,
            status: true,
            amountCents: true,
            currency: true,
            refundedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.accountCredit.findMany({
      where: {
        ...scope,
        status: "ACTIVE",
        remainingAmountCents: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        id: true,
        remainingAmountCents: true,
        currency: true,
        expiresAt: true,
        member: beneficiary,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.financialOperation.findMany({ where: { ...scope, kind: { in: ["ISSUE_CREDIT", "APPLY_CREDIT"] }, status: "SUCCEEDED" }, select: { id: true, kind: true, amountCents: true, currency: true, settledAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { operations, invoices, payments, creditHistory, credits: credits.map(credit => {
    const reservedCents = operations.filter(operation => operation.kind === "APPLY_CREDIT" && operation.targetId === credit.id).reduce((sum, operation) => sum + (operation.amountCents ?? 0), 0);
    return { ...credit, reservedCents, availableCents: Math.max(0, credit.remainingAmountCents - reservedCents) };
  }) };
}
export type PayerBillingData = Awaited<ReturnType<typeof getPayerBillingData>>;
