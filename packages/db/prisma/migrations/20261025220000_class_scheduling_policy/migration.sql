ALTER TABLE "class_bookings" ADD COLUMN "schedulingPolicySnapshot" JSONB;
ALTER TABLE "waitlist_entries" ADD COLUMN "schedulingPolicySnapshot" JSONB;
CREATE TABLE "workspace_scheduling_policy_revisions" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "policy" JSONB NOT NULL, "policyHash" TEXT NOT NULL, "previousPolicyHash" TEXT,
 "actorUserId" TEXT NOT NULL, "reason" TEXT NOT NULL, "previewHash" TEXT NOT NULL,
 "activatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "workspace_scheduling_policy_revisions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "workspace_scheduling_policy_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "workspace_scheduling_policy_revision_positive" CHECK ("version" > 0),
 CONSTRAINT "workspace_scheduling_policy_hashes" CHECK ("policyHash" ~ '^[0-9a-f]{64}$' AND "previewHash" ~ '^[0-9a-f]{64}$' AND ("previousPolicyHash" IS NULL OR "previousPolicyHash" ~ '^[0-9a-f]{64}$'))
);
CREATE UNIQUE INDEX "workspace_scheduling_policy_revisions_workspaceId_version_key" ON "workspace_scheduling_policy_revisions"("workspaceId", "version");
CREATE INDEX "scheduling_policy_workspace_activated_version_idx" ON "workspace_scheduling_policy_revisions"("workspaceId", "activatedAt", "version");
CREATE FUNCTION "protect_scheduling_policy_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' AND (current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Scheduling policy history is immutable';
END; $$;
CREATE TRIGGER "scheduling_policy_history_immutable" BEFORE UPDATE OR DELETE ON "workspace_scheduling_policy_revisions" FOR EACH ROW EXECUTE FUNCTION "protect_scheduling_policy_history"();
CREATE FUNCTION "protect_scheduling_policy_receipts"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind IN ('CLASS_SCHEDULING_POLICY_CONFIRMED', 'SCHEDULING_POLICY_APPLIED') OR (TG_OP = 'UPDATE' AND NEW.kind IN ('CLASS_SCHEDULING_POLICY_CONFIRMED', 'SCHEDULING_POLICY_APPLIED')) THEN
   IF TG_OP = 'DELETE' AND (current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")) THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Scheduling policy receipts are immutable';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER "scheduling_policy_receipts_immutable" BEFORE UPDATE OR DELETE ON "workspace_data_events" FOR EACH ROW EXECUTE FUNCTION "protect_scheduling_policy_receipts"();
