-- Derive the predecessor without rewriting immutable historical payloads.
BEGIN;
LOCK TABLE "member_operational_revisions" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "member_operational_revisions"
  ADD COLUMN "previousVersion" INTEGER GENERATED ALWAYS AS
    (CASE WHEN "version" > 1 THEN "version" - 1 ELSE NULL::integer END) STORED;
ALTER TABLE "member_operational_revisions"
  ADD CONSTRAINT "member_ops_predecessor_fk"
  FOREIGN KEY ("workspaceId", "memberId", "recordKey", "previousVersion")
  REFERENCES "member_operational_revisions" ("workspaceId", "memberId", "recordKey", "version")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
-- The existing positive-version and exact-stream uniqueness constraints remain.
-- Invalid historical gaps fail this migration rather than being silently repaired.
CREATE INDEX "member_ops_predecessor_idx"
  ON "member_operational_revisions" ("workspaceId", "memberId", "recordKey", "previousVersion");
COMMIT;
