-- CreateEnum
CREATE TYPE "Weekday" AS ENUM (
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY'
);

-- CreateTable
CREATE TABLE "class_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "title" TEXT,
    "weekday" "Weekday" NOT NULL,
    "startTimeMinutes" INTEGER NOT NULL,
    "endTimeMinutes" INTEGER NOT NULL,
    "capacityOverride" INTEGER,
    "bookingCutoffMinutes" INTEGER NOT NULL,
    "cancellationCutoffMinutes" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_templates_workspaceId_idx" ON "class_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "class_templates_workspaceId_weekday_idx" ON "class_templates"("workspaceId", "weekday");

-- CreateIndex
CREATE INDEX "class_templates_coachWorkspaceUserId_idx" ON "class_templates"("coachWorkspaceUserId");

-- CreateIndex
CREATE INDEX "class_templates_roomId_idx" ON "class_templates"("roomId");

-- CreateIndex
CREATE INDEX "class_templates_programId_idx" ON "class_templates"("programId");

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
