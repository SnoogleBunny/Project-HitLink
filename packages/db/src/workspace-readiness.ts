export interface WorkspaceMigrationReadinessInput {
  workspaceStatus: string;
  migrationStage?: string | null;
  ownerReviewAcknowledgedAt?: Date | null;
  ownerReviewAcknowledgedByUserId?: string | null;
  operationallyReadyAt?: Date | null;
  operationallyReadyByUserId?: string | null;
}

export interface WorkspaceSetupActivationReadiness {
  ownerUserId: string;
  serviceMode?: string;
  ownerVerifiedAt: Date;
  snapshotHash: string;
  activatedAt: Date;
}

/** A clean business has its own immutable setup receipt, never a fake import. */
export function isWorkspaceOperationallyReady(
  input: WorkspaceMigrationReadinessInput & {
    setupActivation?: WorkspaceSetupActivationReadiness | null;
  },
): boolean {
  if (isWorkspaceMigrationReady(input)) return true;
  const receipt = input.setupActivation;
  return (
    input.workspaceStatus === "ACTIVE" &&
    !!receipt &&
    typeof receipt.ownerUserId === "string" &&
    !!receipt.ownerUserId.trim() &&
    typeof receipt.snapshotHash === "string" &&
    /^[a-f0-9]{64}$/.test(receipt.snapshotHash) &&
    receipt.ownerVerifiedAt instanceof Date &&
    receipt.activatedAt instanceof Date &&
    Number.isFinite(+receipt.ownerVerifiedAt) &&
    Number.isFinite(+receipt.activatedAt) &&
    +receipt.ownerVerifiedAt <= +receipt.activatedAt
  );
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
