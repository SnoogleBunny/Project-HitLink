-- CreateEnum
CREATE TYPE "CoachAssignmentMode" AS ENUM ('INHERIT', 'ASSIGNED', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "ClassRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- AlterTable
ALTER TABLE "class_instances" ADD COLUMN     "coachAssignmentMode" "CoachAssignmentMode" NOT NULL DEFAULT 'ASSIGNED',
ADD COLUMN     "isScheduleOverride" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "coachWorkspaceUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "class_templates" ADD COLUMN     "scheduleStartsOn" DATE,
ADD COLUMN     "scheduleVersion" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "coachWorkspaceUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "class_schedule_revisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "recurrence" "ClassRecurrence" NOT NULL,
    "weekdays" "Weekday"[],
    "title" TEXT,
    "programId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT,
    "startTimeMinutes" INTEGER NOT NULL,
    "endTimeMinutes" INTEGER NOT NULL,
    "capacityOverride" INTEGER,
    "bookingCutoffMinutes" INTEGER NOT NULL,
    "cancellationCutoffMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedule_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedule_changes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "scheduledForDate" DATE,
    "scope" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_schedule_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_schedule_revisions_workspaceId_effectiveFrom_idx" ON "class_schedule_revisions"("workspaceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "class_schedule_revisions_workspaceId_coachWorkspaceUserId_idx" ON "class_schedule_revisions"("workspaceId", "coachWorkspaceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "class_schedule_revisions_classTemplateId_effectiveFrom_key" ON "class_schedule_revisions"("classTemplateId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "class_schedule_changes_workspaceId_classTemplateId_createdA_idx" ON "class_schedule_changes"("workspaceId", "classTemplateId", "createdAt");

-- AddForeignKey
ALTER TABLE "class_schedule_revisions" ADD CONSTRAINT "class_schedule_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_revisions" ADD CONSTRAINT "class_schedule_revisions_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_revisions" ADD CONSTRAINT "class_schedule_revisions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_revisions" ADD CONSTRAINT "class_schedule_revisions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_revisions" ADD CONSTRAINT "class_schedule_revisions_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_changes" ADD CONSTRAINT "class_schedule_changes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_changes" ADD CONSTRAINT "class_schedule_changes_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_changes" ADD CONSTRAINT "class_schedule_changes_actorWorkspaceUserId_fkey" FOREIGN KEY ("actorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
