CREATE TABLE "workspace_timezone_revisions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "previousTimezone" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "effectiveFromDate" DATE NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "previewHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_timezone_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_timezone_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_timezone_revisions_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "workspace_timezone_revisions_workspaceId_version_key" ON "workspace_timezone_revisions"("workspaceId", "version");
CREATE UNIQUE INDEX "workspace_timezone_revisions_workspaceId_effectiveFromDate_key" ON "workspace_timezone_revisions"("workspaceId", "effectiveFromDate");
CREATE INDEX "workspace_timezone_revisions_workspaceId_effectiveAt_idx" ON "workspace_timezone_revisions"("workspaceId", "effectiveAt");

CREATE FUNCTION "protect_workspace_timezone_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The workspace's authorized retention deletion can cascade its history.
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Workspace timezone history is immutable';
END;
$$;
CREATE TRIGGER "workspace_timezone_history_immutable"
  BEFORE UPDATE OR DELETE ON "workspace_timezone_revisions"
  FOR EACH ROW EXECUTE FUNCTION "protect_workspace_timezone_history"();
