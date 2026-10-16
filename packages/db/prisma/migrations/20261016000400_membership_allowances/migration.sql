-- CreateEnum
CREATE TYPE "AllowanceCountingMode" AS ENUM ('RESERVATION', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "AllowancePeriodKind" AS ENUM ('WEEK', 'BILLING_MONTH');

-- CreateEnum
CREATE TYPE "AllowanceAllocationState" AS ENUM ('RESERVED', 'USED', 'RELEASED');

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "acceptedPolicy" JSONB,
ADD COLUMN     "fundingMembershipId" TEXT,
ADD COLUMN     "providerChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "member_memberships" ADD COLUMN     "acceptedTerms" JSONB,
ADD COLUMN     "allowanceAnchorDate" DATE,
ADD COLUMN     "allowanceTimezone" TEXT;

-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "allowanceCountingMode" "AllowanceCountingMode" NOT NULL DEFAULT 'ATTENDANCE',
ADD COLUMN     "lateCancellationConsumesClass" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "monthlyClassLimit" INTEGER,
ADD COLUMN     "noShowConsumesClass" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "termsVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weeklyClassLimit" INTEGER;

-- CreateTable
CREATE TABLE "membership_allowance_allocations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberMembershipId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "AllowancePeriodKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "limit" INTEGER NOT NULL,
    "state" "AllowanceAllocationState" NOT NULL DEFAULT 'RESERVED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_allowance_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_allowance_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "usedDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_allowance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_booking_moves" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "originalBookingId" TEXT NOT NULL,
    "targetBookingId" TEXT NOT NULL,
    "lateCancellation" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_booking_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_allowance_allocations_workspaceId_memberMembersh_idx" ON "membership_allowance_allocations"("workspaceId", "memberMembershipId", "kind", "periodStart", "state");

-- CreateIndex
CREATE UNIQUE INDEX "membership_allowance_allocations_bookingId_kind_periodStart_key" ON "membership_allowance_allocations"("bookingId", "kind", "periodStart");

-- CreateIndex
CREATE INDEX "membership_allowance_entries_workspaceId_createdAt_idx" ON "membership_allowance_entries"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_allowance_entries_allocationId_revision_key" ON "membership_allowance_entries"("allocationId", "revision");

-- CreateIndex
CREATE INDEX "class_booking_moves_workspaceId_memberId_createdAt_idx" ON "class_booking_moves"("workspaceId", "memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_fundingMembershipId_fkey" FOREIGN KEY ("fundingMembershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_allowance_allocations" ADD CONSTRAINT "membership_allowance_allocations_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_allowance_allocations" ADD CONSTRAINT "membership_allowance_allocations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "class_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_allowance_entries" ADD CONSTRAINT "membership_allowance_entries_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "membership_allowance_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing contracts before owners edit catalog terms. Legacy memberships
-- had unlimited classes; migration never applies a new cap to their history.
UPDATE "member_memberships" m SET
 "allowanceTimezone" = COALESCE(l."timezone", 'UTC'),
 "allowanceAnchorDate" = (COALESCE(m."nextBillingDate",m."startedAt") AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(l."timezone", 'UTC'))::date,
 "acceptedTerms" = jsonb_build_object(
   'version',p."termsVersion", 'monthlyPriceCents',p."monthlyPriceCents", 'currency',p."currency",
   'weeklyClassLimit',NULL, 'monthlyClassLimit',NULL, 'allowanceCountingMode','ATTENDANCE',
   'lateCancellationConsumesClass',true, 'noShowConsumesClass',true,
   'cancellationPolicyReference',p."cancellationPolicyReference", 'freezePolicyReference',p."freezePolicyReference",
   'programIds',COALESCE((SELECT jsonb_agg(r."programId") FROM "membership_plan_program_restrictions" r WHERE r."membershipPlanId"=p.id),'[]'::jsonb),
   'capturedAt',CURRENT_TIMESTAMP, 'source','legacy-migration')
FROM "membership_plans" p LEFT JOIN "locations" l ON l."workspaceId"=p."workspaceId"
WHERE p.id=m."membershipPlanId";
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plan_positive_caps" CHECK (("weeklyClassLimit" IS NULL OR "weeklyClassLimit">0) AND ("monthlyClassLimit" IS NULL OR "monthlyClassLimit">0));
ALTER TABLE "membership_allowance_allocations" ADD CONSTRAINT "membership_allowance_valid_period" CHECK ("periodEnd">"periodStart" AND "limit">0 AND "revision">0);
