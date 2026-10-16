-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "firstFailedAt" TIMESTAMP(3),
ADD COLUMN     "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN     "lastFailureCode" TEXT,
ADD COLUMN     "lastFailureMessage" TEXT;

-- CreateTable
CREATE TABLE "membership_allowance_adjustments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberMembershipId" TEXT NOT NULL,
    "kind" "AllowancePeriodKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_allowance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entitlement_holds" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "units" INTEGER,
    "activeSlot" TEXT DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "financial_entitlement_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_allowance_adjustments_workspaceId_memberMembersh_idx" ON "membership_allowance_adjustments"("workspaceId", "memberMembershipId", "kind", "periodStart");

-- CreateIndex
CREATE INDEX "financial_entitlement_holds_operationId_idx" ON "financial_entitlement_holds"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entitlement_holds_workspaceId_targetKind_targetId_key" ON "financial_entitlement_holds"("workspaceId", "targetKind", "targetId", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_workspaceId_stripeInvoiceId_key" ON "invoices"("workspaceId", "stripeInvoiceId");

-- AddForeignKey
ALTER TABLE "membership_allowance_adjustments" ADD CONSTRAINT "membership_allowance_adjustments_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entitlement_holds" ADD CONSTRAINT "financial_entitlement_holds_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "financial_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
