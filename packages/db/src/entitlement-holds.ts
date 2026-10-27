import type { Prisma } from "@prisma/client";
/** Fixed member-facing copy; never expose provider or private owner reasons. */
export function financialEntitlementHoldMessage(hold: { disputeId: string | null }): string {
  return hold.disputeId
    ? "A payment dispute is under owner review for this access. Existing reservations remain recorded; changes and unit use are held pending its outcome."
    : "A refund is being processed for this access. Wait for its result before changing classes or units.";
}

export async function financialEntitlementHoldReason(args: {
  workspaceId: string;
  targets: Array<{ targetKind: string; targetId: string | null | undefined }>;
  db: {
    financialEntitlementHold?: Prisma.TransactionClient["financialEntitlementHold"];
  };
  exceptOperationId?: string;
  exceptDisputeId?: string;
}): Promise<string | null> {
  const targets = args.targets.filter(
    (item): item is { targetKind: string; targetId: string } =>
      Boolean(item.targetId),
  );
  if (!targets.length || !args.db.financialEntitlementHold) return null;
  const hold = await args.db.financialEntitlementHold.findFirst({
    where: {
      workspaceId: args.workspaceId,
      activeSlot: "ACTIVE",
      OR: targets,
      AND: [
        ...(args.exceptOperationId
          ? [
              {
                OR: [
                  { operationId: null },
                  { operationId: { not: args.exceptOperationId } },
                ],
              },
            ]
          : []),
        ...(args.exceptDisputeId
          ? [
              {
                OR: [
                  { disputeId: null },
                  { disputeId: { not: args.exceptDisputeId } },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true, disputeId: true },
  });
  return hold ? financialEntitlementHoldMessage(hold) : null;
}
