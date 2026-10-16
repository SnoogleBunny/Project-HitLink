import { prisma } from "@flowstate/db";

export async function getOwnCheckoutStatus(args: { workspaceId: string; userId: string; operationId: string }) {
  if (!args.operationId) return null;
  return prisma.financialOperation.findFirst({
    where: { id: args.operationId, workspaceId: args.workspaceId, kind: "CHECKOUT", payerAccount: { userId: args.userId } },
    select: { id: true, status: true, amountCents: true, currency: true, paymentId: true, providerReference: true, targetId: true, beneficiaryMember: { select: { fullName: true } }, payload: true },
  });
}
