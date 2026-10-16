-- AlterTable
ALTER TABLE "member_memberships" ADD COLUMN     "sourceAccessHeld" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "source_billing_evidence" ADD COLUMN     "sourceAccountReference" TEXT;

-- CreateTable
CREATE TABLE "staff_time_off" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_membership_lifecycle_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceAccountReference" TEXT NOT NULL,
    "sourceContractReference" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "evidenceState" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "receiptData" BYTEA NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "reviewSnapshot" JSONB NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_membership_lifecycle_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_time_off_workspaceId_coachWorkspaceUserId_startsAt_en_idx" ON "staff_time_off"("workspaceId", "coachWorkspaceUserId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "staff_time_off_workspaceId_revokedAt_idx" ON "staff_time_off"("workspaceId", "revokedAt");

-- CreateIndex
CREATE INDEX "source_membership_lifecycle_evidence_workspaceId_membership_idx" ON "source_membership_lifecycle_evidence"("workspaceId", "membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "source_membership_lifecycle_evidence_requestId_createdAt_idx" ON "source_membership_lifecycle_evidence"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_membership_lifecycle_evidence_workspaceId_operationK_key" ON "source_membership_lifecycle_evidence"("workspaceId", "operationKey");

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_membership_lifecycle_evidence" ADD CONSTRAINT "source_membership_lifecycle_evidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_membership_lifecycle_evidence" ADD CONSTRAINT "source_membership_lifecycle_evidence_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_membership_lifecycle_evidence" ADD CONSTRAINT "source_membership_lifecycle_evidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "membership_lifecycle_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_interval_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "source_membership_lifecycle_evidence" ADD CONSTRAINT "source_membership_lifecycle_evidence_state_check" CHECK ("evidenceState" IN ('CONFIGURED','COMPLETED'));
