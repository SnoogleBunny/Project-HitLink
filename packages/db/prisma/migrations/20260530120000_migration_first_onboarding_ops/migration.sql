-- CreateEnum
CREATE TYPE "MigrationStage" AS ENUM ('INTAKE_RECEIVED', 'EXPORTS_NEEDED', 'MIGRATION_IN_PROGRESS', 'REVIEW_READY', 'GO_LIVE_SCHEDULED', 'COMPLETE');

-- AlterEnum
ALTER TYPE "ImportRecordKind" ADD VALUE 'DROP_IN_PRODUCT';

-- CreateTable
CREATE TABLE "workspace_migrations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" "MigrationStage" NOT NULL DEFAULT 'INTAKE_RECEIVED',
    "currentSoftware" TEXT,
    "targetGoLiveDate" DATE,
    "memberCountEstimate" INTEGER,
    "billingStatus" TEXT,
    "scheduleComplexity" TEXT,
    "formsAndWaivers" TEXT,
    "dataScope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "accessInstructions" TEXT,
    "nextOwnerAction" TEXT NOT NULL,
    "flowstateResponsibility" TEXT NOT NULL,
    "expectedNextMilestone" TEXT,
    "expectedNextMilestoneAt" TIMESTAMP(3),
    "goLiveScheduledFor" DATE,
    "operationallyReadyAt" TIMESTAMP(3),
    "operationallyReadyByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_imported_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT,
    "stagingRecordId" TEXT,
    "recordKind" "ImportRecordKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "importedModel" TEXT NOT NULL,
    "importedRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_imported_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_migrations_workspaceId_key" ON "workspace_migrations"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_migrations_stage_updatedAt_idx" ON "workspace_migrations"("stage", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "migration_imported_records_workspace_kind_external_key" ON "migration_imported_records"("workspaceId", "recordKind", "externalId");

-- CreateIndex
CREATE INDEX "migration_imported_records_workspaceId_importJobId_idx" ON "migration_imported_records"("workspaceId", "importJobId");

-- CreateIndex
CREATE INDEX "migration_imported_records_workspaceId_importedModel_importedRecordId_idx" ON "migration_imported_records"("workspaceId", "importedModel", "importedRecordId");

-- AddForeignKey
ALTER TABLE "workspace_migrations" ADD CONSTRAINT "workspace_migrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_imported_records" ADD CONSTRAINT "migration_imported_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
