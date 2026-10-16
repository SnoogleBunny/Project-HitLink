-- AlterTable
ALTER TABLE "coaching_appointments" ADD COLUMN     "movedFromId" TEXT,
ADD COLUMN     "policySnapshot" JSONB;

-- AlterTable
ALTER TABLE "coaching_enrollments" ADD COLUMN     "currentPayerGrantId" TEXT,
ADD COLUMN     "payerAccountId" TEXT;

-- AlterTable
ALTER TABLE "coaching_program_versions" ADD COLUMN     "noShowGraceMinutes" INTEGER NOT NULL DEFAULT 15;

-- Existing versions allowed no-show marking only after the appointment ended.
-- Preserve that window; newly published versions choose their explicit grace interval.
UPDATE "coaching_program_versions" SET "noShowGraceMinutes" = "appointmentMinutes";

-- This is a current-policy capture, not invented historical acceptance evidence.
UPDATE "coaching_appointments" AS a SET "policySnapshot" = jsonb_build_object(
  'programVersionId', v."id", 'cancellationHours', v."cancellationHours",
  'noShowGraceMinutes', v."noShowGraceMinutes", 'source', 'MIGRATION_CURRENT_POLICY'
) FROM "coaching_enrollments" AS e JOIN "coaching_program_versions" AS v ON v."id" = e."programVersionId"
WHERE a."enrollmentId" = e."id";

-- CreateTable
CREATE TABLE "coaching_accepted_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "agreement" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_accepted_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_settlement_decisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "obligationHash" TEXT NOT NULL,
    "obligationSnapshot" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "reason" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "clientAcceptedAt" TIMESTAMP(3),
    "clientAcceptedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_settlement_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_record_exports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "resolverWorkspaceUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "checksum" TEXT,
    "artifact" BYTEA,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "receiptConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_record_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_record_incidents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "noteId" TEXT,
    "reportedByUserId" TEXT NOT NULL,
    "reviewerWorkspaceUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "containedAt" TIMESTAMP(3),
    "communicationReview" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_record_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_record_review_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "privateNoteIds" TEXT[],
    "reviewerWorkspaceUserId" TEXT NOT NULL,
    "authorWorkspaceUserId" TEXT NOT NULL,
    "grantedByOwnerWorkspaceUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "clientApprovedAt" TIMESTAMP(3),
    "clientApprovedByUserId" TEXT,
    "authorApprovedAt" TIMESTAMP(3),
    "authorApprovedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_record_review_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_record_access_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "purpose" TEXT NOT NULL,
    "reviewGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_record_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_payer_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "payerMemberId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "activeSlot" TEXT DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "clientConsentedAt" TIMESTAMP(3) NOT NULL,
    "payerAcceptedAt" TIMESTAMP(3),
    "acceptedTerms" JSONB,
    "payerContactVerifiedAt" TIMESTAMP(3),
    "verificationHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationSentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_payer_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_delivery_exceptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewerWorkspaceUserId" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_delivery_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_appointment_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_accepted_plans_workspaceId_enrollmentId_acceptedAt_idx" ON "coaching_accepted_plans"("workspaceId", "enrollmentId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_accepted_plans_workspaceId_operationId_key" ON "coaching_accepted_plans"("workspaceId", "operationId");

-- CreateIndex
CREATE INDEX "coaching_settlement_decisions_workspaceId_enrollmentId_stat_idx" ON "coaching_settlement_decisions"("workspaceId", "enrollmentId", "status");

-- CreateIndex
CREATE INDEX "coaching_record_exports_workspaceId_enrollmentId_createdAt_idx" ON "coaching_record_exports"("workspaceId", "enrollmentId", "createdAt");

-- CreateIndex
CREATE INDEX "coaching_record_exports_expiresAt_status_idx" ON "coaching_record_exports"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "coaching_record_incidents_workspaceId_enrollmentId_status_idx" ON "coaching_record_incidents"("workspaceId", "enrollmentId", "status");

-- CreateIndex
CREATE INDEX "coaching_record_review_grants_workspaceId_reviewerWorkspace_idx" ON "coaching_record_review_grants"("workspaceId", "reviewerWorkspaceUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "coaching_record_access_events_workspaceId_enrollmentId_crea_idx" ON "coaching_record_access_events"("workspaceId", "enrollmentId", "createdAt");

-- CreateIndex
CREATE INDEX "coaching_payer_grants_workspaceId_payerUserId_revokedAt_idx" ON "coaching_payer_grants"("workspaceId", "payerUserId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_payer_grants_enrollmentId_activeSlot_key" ON "coaching_payer_grants"("enrollmentId", "activeSlot");

-- CreateIndex
CREATE INDEX "coaching_delivery_exceptions_workspaceId_status_localDate_idx" ON "coaching_delivery_exceptions"("workspaceId", "status", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_delivery_exceptions_enrollmentId_localDate_kind_key" ON "coaching_delivery_exceptions"("enrollmentId", "localDate", "kind");

-- CreateIndex
CREATE INDEX "coaching_appointment_events_workspaceId_appointmentId_creat_idx" ON "coaching_appointment_events"("workspaceId", "appointmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_appointment_events_workspaceId_operationId_appoint_key" ON "coaching_appointment_events"("workspaceId", "operationId", "appointmentId");

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_accepted_plans" ADD CONSTRAINT "coaching_accepted_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_accepted_plans" ADD CONSTRAINT "coaching_accepted_plans_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_settlement_decisions" ADD CONSTRAINT "coaching_settlement_decisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_settlement_decisions" ADD CONSTRAINT "coaching_settlement_decisions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_exports" ADD CONSTRAINT "coaching_record_exports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_exports" ADD CONSTRAINT "coaching_record_exports_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_incidents" ADD CONSTRAINT "coaching_record_incidents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_incidents" ADD CONSTRAINT "coaching_record_incidents_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_review_grants" ADD CONSTRAINT "coaching_record_review_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_review_grants" ADD CONSTRAINT "coaching_record_review_grants_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_access_events" ADD CONSTRAINT "coaching_record_access_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_record_access_events" ADD CONSTRAINT "coaching_record_access_events_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_payer_grants" ADD CONSTRAINT "coaching_payer_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_payer_grants" ADD CONSTRAINT "coaching_payer_grants_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_delivery_exceptions" ADD CONSTRAINT "coaching_delivery_exceptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_delivery_exceptions" ADD CONSTRAINT "coaching_delivery_exceptions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointment_events" ADD CONSTRAINT "coaching_appointment_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointment_events" ADD CONSTRAINT "coaching_appointment_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "coaching_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
