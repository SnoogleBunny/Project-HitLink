-- AlterTable
ALTER TABLE "class_instances" ADD COLUMN     "prerequisites" JSONB;

-- AlterTable
ALTER TABLE "class_schedule_revisions" ADD COLUMN     "prerequisites" JSONB;

-- AlterTable
ALTER TABLE "class_templates" ADD COLUMN     "prerequisites" JSONB;

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "rankPolicy" JSONB;

-- AlterTable
ALTER TABLE "workspace_migrations" ADD COLUMN     "reviewedCutoverSnapshotId" TEXT;

-- AlterTable
ALTER TABLE "workspace_users" ADD COLUMN     "canManageProgress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canOverridePrerequisites" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "program_promotions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rankKey" TEXT NOT NULL,
    "rankName" TEXT NOT NULL,
    "stripeCount" INTEGER NOT NULL DEFAULT 0,
    "effectiveOn" DATE NOT NULL,
    "awardedByWorkspaceUserId" TEXT NOT NULL,
    "recordedByWorkspaceUserId" TEXT NOT NULL,
    "internalNote" TEXT,
    "publicNote" TEXT,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_rank_changes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_rank_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_prerequisite_exceptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "policyFingerprint" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_prerequisite_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_cutover_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorOperatorId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_cutover_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_promotions_workspaceId_memberId_programId_effective_idx" ON "program_promotions"("workspaceId", "memberId", "programId", "effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "program_promotions_workspaceId_operationKey_key" ON "program_promotions"("workspaceId", "operationKey");

-- CreateIndex
CREATE INDEX "program_rank_changes_workspaceId_programId_createdAt_idx" ON "program_rank_changes"("workspaceId", "programId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "program_rank_changes_workspaceId_operationKey_key" ON "program_rank_changes"("workspaceId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "class_prerequisite_exception_policy_key" ON "class_prerequisite_exceptions"("workspaceId", "classTemplateId", "memberId", "scheduledForDate", "policyFingerprint");

-- CreateIndex
CREATE INDEX "migration_cutover_snapshots_workspaceId_createdAt_idx" ON "migration_cutover_snapshots"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "program_promotions" ADD CONSTRAINT "program_promotions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_promotions" ADD CONSTRAINT "program_promotions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_promotions" ADD CONSTRAINT "program_promotions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_promotions" ADD CONSTRAINT "program_promotions_awardedByWorkspaceUserId_fkey" FOREIGN KEY ("awardedByWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_promotions" ADD CONSTRAINT "program_promotions_recordedByWorkspaceUserId_fkey" FOREIGN KEY ("recordedByWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_rank_changes" ADD CONSTRAINT "program_rank_changes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_rank_changes" ADD CONSTRAINT "program_rank_changes_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_rank_changes" ADD CONSTRAINT "program_rank_changes_actorWorkspaceUserId_fkey" FOREIGN KEY ("actorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_prerequisite_exceptions" ADD CONSTRAINT "class_prerequisite_exceptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_prerequisite_exceptions" ADD CONSTRAINT "class_prerequisite_exceptions_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_prerequisite_exceptions" ADD CONSTRAINT "class_prerequisite_exceptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_prerequisite_exceptions" ADD CONSTRAINT "class_prerequisite_exceptions_actorWorkspaceUserId_fkey" FOREIGN KEY ("actorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_cutover_snapshots" ADD CONSTRAINT "migration_cutover_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
