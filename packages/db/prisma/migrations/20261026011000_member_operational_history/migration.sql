-- Attributable operational records; private coaching content is kept separately.
CREATE TABLE "member_operational_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "recordKey" TEXT NOT NULL,
  "recordKind" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "noteBody" TEXT,
  "tagLabel" TEXT,
  "tagPurpose" TEXT,
  "actorUserId" TEXT NOT NULL,
  "actorWorkspaceUserId" TEXT NOT NULL,
  "actorNameSnapshot" TEXT NOT NULL,
  "actorRoleSnapshot" TEXT NOT NULL,
  "sourceClassTemplateId" TEXT,
  "sourceScheduledDate" DATE,
  "reason" TEXT,
  "operationId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_operations_workspace_fk" FOREIGN KEY ("workspaceId")
    REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_operations_member_fk" FOREIGN KEY ("workspaceId", "memberId")
    REFERENCES "members"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_operations_positive_version" CHECK ("version" >= 1),
  CONSTRAINT "member_operations_record_key" CHECK (length("recordKey") BETWEEN 16 AND 150),
  CONSTRAINT "member_operations_actor" CHECK (
    "actorRoleSnapshot" IN ('OWNER', 'COACH')
    AND length("actorUserId") > 0 AND length("actorWorkspaceUserId") > 0
    AND length("actorNameSnapshot") > 0
  ),
  CONSTRAINT "member_operations_visibility" CHECK ("visibility" IN ('OWNER_ONLY','ASSIGNED_OPERATIONS')),
  CONSTRAINT "member_operations_coach_visibility" CHECK (
    "actorRoleSnapshot" <> 'COACH' OR "visibility" = 'ASSIGNED_OPERATIONS'
  ),
  CONSTRAINT "member_operations_action" CHECK ("action" IN ('ADD','AMEND','RETRACT','CLASSIFY')),
  CONSTRAINT "member_operations_hash" CHECK ("inputHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "member_operations_request" CHECK ("operationId" ~ '^[a-zA-Z0-9:_-]{16,150}$'),
  CONSTRAINT "member_operations_correction_reason" CHECK (
    ("reason" IS NULL OR length("reason") <= 500)
    AND ("action" = 'ADD' OR length(btrim(coalesce("reason", ''))) BETWEEN 5 AND 500)
  ),
  CONSTRAINT "member_operations_source_pair" CHECK (
    ("sourceClassTemplateId" IS NULL) = ("sourceScheduledDate" IS NULL)
    AND ("actorRoleSnapshot" <> 'COACH' OR "sourceClassTemplateId" IS NOT NULL)
  ),
  CONSTRAINT "member_operations_cohort_authority" CHECK (
    "tagPurpose" IS DISTINCT FROM 'COHORT_ELIGIBILITY'
    OR "actorRoleSnapshot" = 'OWNER'
  ),
  CONSTRAINT "member_operations_payload" CHECK (
    ("recordKind" = 'NOTE' AND "tagLabel" IS NULL AND "tagPurpose" IS NULL AND "action" <> 'CLASSIFY'
      AND (("action" = 'RETRACT' AND "noteBody" IS NULL)
        OR ("action" <> 'RETRACT' AND length(btrim(coalesce("noteBody", ''))) BETWEEN 1 AND 2000)))
    OR ("recordKind" = 'TAG' AND "noteBody" IS NULL
      AND "tagPurpose" IS NOT NULL AND "tagPurpose" IN ('OPERATIONAL','COHORT_ELIGIBILITY')
      AND ("action" <> 'CLASSIFY' OR "tagPurpose" = 'COHORT_ELIGIBILITY')
      AND length(btrim(coalesce("tagLabel", ''))) BETWEEN 1 AND 40)
  )
);
CREATE UNIQUE INDEX "member_ops_workspace_operation_key"
  ON "member_operational_revisions"("workspaceId", "operationId");
CREATE UNIQUE INDEX "member_ops_workspace_member_record_version_key"
  ON "member_operational_revisions"("workspaceId", "memberId", "recordKey", "version");
CREATE INDEX "member_ops_current_record_idx"
  ON "member_operational_revisions"("workspaceId", "memberId", "recordKind", "recordKey", "version");
CREATE INDEX "member_ops_member_history_idx"
  ON "member_operational_revisions"("workspaceId", "memberId", "createdAt", "id");

CREATE FUNCTION "protect_member_operations_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Member operations history is immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "member_operations_history_immutable"
  BEFORE UPDATE OR DELETE ON "member_operational_revisions"
  FOR EACH ROW EXECUTE FUNCTION "protect_member_operations_history"();

-- Application lock/current-head checks enforce next revision, exact command
-- replay, actor/assignment and canonical Member.tags projection atomically.
-- This SQL does not claim to infer those authorities from actor snapshots.
