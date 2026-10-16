-- CreateTable
CREATE TABLE "coaching_programs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_program_versions" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "deliveryWeekdays" INTEGER[],
    "responseHours" INTEGER NOT NULL,
    "goals" TEXT NOT NULL,
    "milestones" TEXT[],
    "appointmentUnits" INTEGER NOT NULL DEFAULT 0,
    "appointmentMinutes" INTEGER NOT NULL DEFAULT 60,
    "cancellationHours" INTEGER NOT NULL DEFAULT 24,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "retrievalDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_program_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_enrollments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "proposedProgramVersionId" TEXT,
    "proposedStartsOn" DATE,
    "proposedEndsOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "contactVerifiedAt" TIMESTAMP(3),
    "verificationHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationSentAt" TIMESTAMP(3),
    "currentCoachWorkspaceUserId" TEXT,
    "proposedCoachWorkspaceUserId" TEXT,
    "historyFromDate" DATE,
    "pauseStartsOn" DATE,
    "pauseEndsOn" DATE,
    "pausedDeliveryDays" INTEGER NOT NULL DEFAULT 0,
    "paymentId" TEXT,
    "checkoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutAccountId" TEXT,
    "paymentState" TEXT NOT NULL DEFAULT 'PENDING',
    "closedAt" TIMESTAMP(3),
    "retrievalUntil" TIMESTAMP(3),
    "settlementState" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "settlementNote" TEXT,
    "exportState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "caseOwnerWorkspaceUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_assignments" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "historyFromDate" DATE NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "coaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_intakes" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "history" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_milestones" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueOn" DATE,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coaching_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_daily_notes" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "authorWorkspaceUserId" TEXT NOT NULL,
    "draftBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "coaching_daily_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_daily_note_revisions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorWorkspaceUserId" TEXT NOT NULL,

    CONSTRAINT "coaching_daily_note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_private_notes" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "authorWorkspaceUserId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "history" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_private_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_availability" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "roomId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "virtualUrl" TEXT,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "coaching_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_appointments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "roomId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "virtualUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "unitState" TEXT NOT NULL DEFAULT 'HELD',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "operationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_programs_workspaceId_archivedAt_idx" ON "coaching_programs"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_program_versions_programId_number_key" ON "coaching_program_versions"("programId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_enrollments_paymentId_key" ON "coaching_enrollments"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_enrollments_checkoutSessionId_key" ON "coaching_enrollments"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "coaching_enrollments_workspaceId_memberId_status_idx" ON "coaching_enrollments"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE INDEX "coaching_enrollments_workspaceId_currentCoachWorkspaceUserI_idx" ON "coaching_enrollments"("workspaceId", "currentCoachWorkspaceUserId", "status");

-- CreateIndex
CREATE INDEX "coaching_assignments_enrollmentId_coachWorkspaceUserId_revo_idx" ON "coaching_assignments"("enrollmentId", "coachWorkspaceUserId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_intakes_enrollmentId_key" ON "coaching_intakes"("enrollmentId");

-- CreateIndex
CREATE INDEX "coaching_milestones_enrollmentId_idx" ON "coaching_milestones"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_daily_notes_enrollmentId_localDate_key" ON "coaching_daily_notes"("enrollmentId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_daily_note_revisions_noteId_number_key" ON "coaching_daily_note_revisions"("noteId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_private_notes_enrollmentId_authorWorkspaceUserId_l_key" ON "coaching_private_notes"("enrollmentId", "authorWorkspaceUserId", "localDate");

-- CreateIndex
CREATE INDEX "coaching_availability_workspaceId_coachWorkspaceUserId_star_idx" ON "coaching_availability"("workspaceId", "coachWorkspaceUserId", "startsAt");

-- CreateIndex
CREATE INDEX "coaching_appointments_workspaceId_coachWorkspaceUserId_star_idx" ON "coaching_appointments"("workspaceId", "coachWorkspaceUserId", "startsAt");

-- CreateIndex
CREATE INDEX "coaching_appointments_workspaceId_roomId_startsAt_idx" ON "coaching_appointments"("workspaceId", "roomId", "startsAt");

-- CreateIndex
CREATE INDEX "coaching_appointments_enrollmentId_unitState_idx" ON "coaching_appointments"("enrollmentId", "unitState");

-- CreateIndex
CREATE INDEX "coaching_events_enrollmentId_createdAt_idx" ON "coaching_events"("enrollmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_events_workspaceId_operationId_key" ON "coaching_events"("workspaceId", "operationId");

-- AddForeignKey
ALTER TABLE "coaching_programs" ADD CONSTRAINT "coaching_programs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_program_versions" ADD CONSTRAINT "coaching_program_versions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "coaching_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "coaching_program_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_proposedProgramVersionId_fkey" FOREIGN KEY ("proposedProgramVersionId") REFERENCES "coaching_program_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_currentCoachWorkspaceUserId_fkey" FOREIGN KEY ("currentCoachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_proposedCoachWorkspaceUserId_fkey" FOREIGN KEY ("proposedCoachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_enrollments" ADD CONSTRAINT "coaching_enrollments_caseOwnerWorkspaceUserId_fkey" FOREIGN KEY ("caseOwnerWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_intakes" ADD CONSTRAINT "coaching_intakes_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_milestones" ADD CONSTRAINT "coaching_milestones_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_daily_notes" ADD CONSTRAINT "coaching_daily_notes_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_daily_notes" ADD CONSTRAINT "coaching_daily_notes_authorWorkspaceUserId_fkey" FOREIGN KEY ("authorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_daily_note_revisions" ADD CONSTRAINT "coaching_daily_note_revisions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "coaching_daily_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_daily_note_revisions" ADD CONSTRAINT "coaching_daily_note_revisions_authorWorkspaceUserId_fkey" FOREIGN KEY ("authorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_private_notes" ADD CONSTRAINT "coaching_private_notes_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_private_notes" ADD CONSTRAINT "coaching_private_notes_authorWorkspaceUserId_fkey" FOREIGN KEY ("authorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_availability" ADD CONSTRAINT "coaching_availability_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_availability" ADD CONSTRAINT "coaching_availability_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_availability" ADD CONSTRAINT "coaching_availability_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointments" ADD CONSTRAINT "coaching_appointments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointments" ADD CONSTRAINT "coaching_appointments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointments" ADD CONSTRAINT "coaching_appointments_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "coaching_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointments" ADD CONSTRAINT "coaching_appointments_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_appointments" ADD CONSTRAINT "coaching_appointments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_events" ADD CONSTRAINT "coaching_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_events" ADD CONSTRAINT "coaching_events_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "coaching_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
