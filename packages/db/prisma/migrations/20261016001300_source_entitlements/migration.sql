-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportRecordKind" ADD VALUE 'ALLOWANCE_USAGE';
ALTER TYPE "ImportRecordKind" ADD VALUE 'FUTURE_BOOKING';

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "importSnapshot" JSONB;

-- AlterTable
ALTER TABLE "member_memberships" ADD COLUMN     "importSnapshot" JSONB,
ADD COLUMN     "sourceBillingManaged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "member_punch_cards" ADD COLUMN     "expiresOn" DATE,
ADD COLUMN     "importSnapshot" JSONB;

-- CreateTable
CREATE TABLE "source_billing_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberMembershipId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceContractReference" TEXT NOT NULL,
    "paidFrom" DATE NOT NULL,
    "paidThrough" DATE NOT NULL,
    "nextRenewalOn" DATE NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "acceptanceEvidence" TEXT NOT NULL,
    "payerAuthorityEvidence" TEXT NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "sourceRowHash" TEXT NOT NULL,
    "importJobId" TEXT,
    "stagingRecordId" TEXT,
    "actorId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_billing_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_allowance_opening_balances" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberMembershipId" TEXT NOT NULL,
    "kind" "AllowancePeriodKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "asOfDate" DATE NOT NULL,
    "usedCount" INTEGER NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "sourceRowHash" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "stagingRecordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_allowance_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_billing_evidence_workspaceId_memberMembershipId_paid_idx" ON "source_billing_evidence"("workspaceId", "memberMembershipId", "paidFrom", "paidThrough");

-- CreateIndex
CREATE UNIQUE INDEX "source_billing_evidence_workspaceId_operationKey_key" ON "source_billing_evidence"("workspaceId", "operationKey");

-- CreateIndex
CREATE INDEX "membership_allowance_opening_balances_workspaceId_memberMem_idx" ON "membership_allowance_opening_balances"("workspaceId", "memberMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_allowance_opening_balances_memberMembershipId_ki_key" ON "membership_allowance_opening_balances"("memberMembershipId", "kind", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "membership_allowance_opening_balances_workspaceId_sourceExt_key" ON "membership_allowance_opening_balances"("workspaceId", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "source_billing_evidence" ADD CONSTRAINT "source_billing_evidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_billing_evidence" ADD CONSTRAINT "source_billing_evidence_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_allowance_opening_balances" ADD CONSTRAINT "membership_allowance_opening_balances_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_allowance_opening_balances" ADD CONSTRAINT "membership_allowance_opening_balances_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Source dates are local date-only boundaries; paidThrough/periodEnd are exclusive.
-- These receipts are evidence of source-managed billing, never provider transactions.
ALTER TABLE "source_billing_evidence" ADD CONSTRAINT "source_billing_interval_check" CHECK ("paidFrom" < "paidThrough" AND "paidThrough" <= "nextRenewalOn");
ALTER TABLE "membership_allowance_opening_balances" ADD CONSTRAINT "allowance_opening_nonnegative_check" CHECK ("usedCount" >= 0 AND "periodStart" <= "asOfDate" AND "asOfDate" < "periodEnd");
