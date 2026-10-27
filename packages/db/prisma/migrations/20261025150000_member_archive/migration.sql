ALTER TABLE "members" ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "members_workspaceId_archivedAt_fullName_idx"
  ON "members" ("workspaceId", "archivedAt", "fullName");
