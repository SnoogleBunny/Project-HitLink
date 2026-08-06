export interface WorkspaceMigrationReadinessInput {
  workspaceStatus: string;
  migrationStage?: string | null;
  ownerReviewAcknowledgedAt?: Date | null;
  ownerReviewAcknowledgedByUserId?: string | null;
  operationallyReadyAt?: Date | null;
  operationallyReadyByUserId?: string | null;
}

export function isWorkspaceMigrationReady(
  input: WorkspaceMigrationReadinessInput,
): boolean {
  return (
    input.workspaceStatus === "ACTIVE" &&
    input.migrationStage === "COMPLETE" &&
    Boolean(input.ownerReviewAcknowledgedAt) &&
    Boolean(input.ownerReviewAcknowledgedByUserId?.trim()) &&
    Boolean(input.operationallyReadyAt) &&
    Boolean(input.operationallyReadyByUserId?.trim())
  );
}
