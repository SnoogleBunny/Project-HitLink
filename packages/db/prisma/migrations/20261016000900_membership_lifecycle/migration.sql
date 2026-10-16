-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "lifecyclePolicy" JSONB;

-- CreateTable
CREATE TABLE "membership_lifecycle_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "activeSlot" TEXT DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policy" JSONB NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "requestedFrom" DATE,
    "requestedUntil" DATE,
    "noticeEndsOn" DATE,
    "effectiveOn" DATE,
    "resumeOn" DATE,
    "reason" TEXT,
    "ownerExceptionReason" TEXT,
    "decision" JSONB,
    "providerOperationId" TEXT,
    "reviewedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "parentRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_lifecycle_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_lifecycle_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "state" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_lifecycle_requests_providerOperationId_key" ON "membership_lifecycle_requests"("providerOperationId");

-- CreateIndex
CREATE INDEX "membership_lifecycle_requests_workspaceId_state_effectiveOn_idx" ON "membership_lifecycle_requests"("workspaceId", "state", "effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "membership_lifecycle_requests_workspaceId_operationKey_key" ON "membership_lifecycle_requests"("workspaceId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "membership_lifecycle_requests_membershipId_kind_activeSlot_key" ON "membership_lifecycle_requests"("membershipId", "kind", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "membership_lifecycle_events_requestId_version_key" ON "membership_lifecycle_events"("requestId", "version");

-- AddForeignKey
ALTER TABLE "membership_lifecycle_requests" ADD CONSTRAINT "membership_lifecycle_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_lifecycle_requests" ADD CONSTRAINT "membership_lifecycle_requests_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "member_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_lifecycle_events" ADD CONSTRAINT "membership_lifecycle_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "membership_lifecycle_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Link only legacy reservations with one unambiguous contract covering the service date.
-- Historical rows and ambiguous funding remain unchanged for explicit owner reconciliation.
UPDATE "class_bookings" b
SET "fundingMembershipId" = m.id
FROM "member_memberships" m
WHERE b."fundingMembershipId" IS NULL
  AND b."bookingType" = 'MEMBERSHIP' AND b.status = 'BOOKED'
  AND b."scheduledForDate" >= CURRENT_DATE
  AND m."workspaceId" = b."workspaceId" AND m."memberId" = b."memberId"
  AND m."currentMembershipSlot" = 'CURRENT'
  AND m.status IN ('ACTIVE','PAST_DUE','FROZEN')
  AND m."startedAt"::date <= b."scheduledForDate"
  AND (m."endedAt" IS NULL OR m."endedAt"::date > b."scheduledForDate")
  AND NOT EXISTS (
    SELECT 1 FROM "member_memberships" other
    WHERE other.id <> m.id AND other."workspaceId" = b."workspaceId" AND other."memberId" = b."memberId"
      AND other."startedAt"::date <= b."scheduledForDate"
      AND (other."endedAt" IS NULL OR other."endedAt"::date > b."scheduledForDate")
  );
