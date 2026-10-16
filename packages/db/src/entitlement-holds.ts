import type { Prisma } from "@prisma/client";
export async function financialEntitlementHoldReason(args: {
  workspaceId: string; targets: Array<{ targetKind: string; targetId: string | null | undefined }>;
  db: { financialEntitlementHold?: Prisma.TransactionClient["financialEntitlementHold"] }; exceptOperationId?: string;
}): Promise<string | null> {
  const targets = args.targets.filter((item): item is { targetKind: string; targetId: string } => Boolean(item.targetId));
  if (!targets.length || !args.db.financialEntitlementHold) return null;
  const hold = await args.db.financialEntitlementHold.findFirst({ where: { workspaceId: args.workspaceId, activeSlot: "ACTIVE", OR: targets, ...(args.exceptOperationId ? { operationId: { not: args.exceptOperationId } } : {}) }, select: { id: true } });
  return hold ? "A refund is being processed for this access. Wait for its result before changing classes or units." : null;
}
