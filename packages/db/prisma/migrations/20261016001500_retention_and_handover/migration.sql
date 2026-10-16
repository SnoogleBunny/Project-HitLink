-- AlterTable
ALTER TABLE "workspace_offboarding" ADD COLUMN     "customerBillingHandoverId" TEXT;

-- CreateTable
CREATE TABLE "workspace_retention_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "offboardingPlanId" TEXT NOT NULL,
    "offboardingPlanVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'REVIEW',
    "ownerUserIds" TEXT[],
    "custodianUserId" TEXT NOT NULL,
    "backupCustodianUserId" TEXT NOT NULL,
    "retentionAt" TIMESTAMP(3) NOT NULL,
    "backupDeletionAfter" TIMESTAMP(3) NOT NULL,
    "retentionBasis" TEXT NOT NULL,
    "holdReason" TEXT,
    "holdResolutionEvidence" TEXT,
    "planFingerprint" TEXT NOT NULL,
    "schemaFingerprint" TEXT NOT NULL,
    "exportChecksum" TEXT NOT NULL,
    "authorizationFrozenAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "receipt" JSONB,
    "backupReceipt" JSONB,
    "externalFileReceipt" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_retention_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_retention_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_retention_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_billing_handovers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "offboardingPlanId" TEXT NOT NULL,
    "offboardingPlanVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "destinationName" TEXT NOT NULL,
    "receiverUserId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "payerAuthorityEvidence" TEXT NOT NULL,
    "processorMode" TEXT NOT NULL,
    "processorAccountId" TEXT,
    "obligationSnapshot" JSONB NOT NULL,
    "obligationFingerprint" TEXT NOT NULL,
    "providerEvidence" JSONB,
    "providerVerifiedAt" TIMESTAMP(3),
    "receiverAcceptedAt" TIMESTAMP(3),
    "receiverEvidence" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_billing_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_retention_cases_workspaceId_key" ON "workspace_retention_cases"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_retention_cases_custodianUserId_state_retentionAt_idx" ON "workspace_retention_cases"("custodianUserId", "state", "retentionAt");

-- CreateIndex
CREATE INDEX "workspace_retention_events_caseId_version_createdAt_idx" ON "workspace_retention_events"("caseId", "version", "createdAt");

-- CreateIndex
CREATE INDEX "workspace_billing_handovers_workspaceId_offboardingPlanVers_idx" ON "workspace_billing_handovers"("workspaceId", "offboardingPlanVersion", "state");

-- AddForeignKey
ALTER TABLE "workspace_retention_events" ADD CONSTRAINT "workspace_retention_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "workspace_retention_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_billing_handovers" ADD CONSTRAINT "workspace_billing_handovers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
