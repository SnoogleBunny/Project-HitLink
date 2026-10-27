-- DRAFT migration52: extends immutable receipts; no new table or Prisma model.
CREATE OR REPLACE FUNCTION "protect_scheduling_policy_receipts"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind IN ('CLASS_SCHEDULING_POLICY_CONFIRMED', 'SCHEDULING_POLICY_APPLIED', 'OWNER_LATE_BOOKING_CONFIRMED') OR (TG_OP = 'UPDATE' AND NEW.kind IN ('CLASS_SCHEDULING_POLICY_CONFIRMED', 'SCHEDULING_POLICY_APPLIED', 'OWNER_LATE_BOOKING_CONFIRMED')) THEN
   IF TG_OP = 'DELETE' AND (current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")) THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Scheduling policy receipts are immutable';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
ALTER TABLE "workspace_data_events" ADD CONSTRAINT "owner_late_booking_receipt_shape" CHECK (
 "kind" <> 'OWNER_LATE_BOOKING_CONFIRMED' OR (
  "actorUserId" IS NOT NULL AND length(btrim("actorUserId")) > 0
  AND "metadata"->'schemaVersion' = '1'::jsonb
  AND jsonb_typeof("metadata"->'operationId') = 'string'
  AND "metadata"->>'operationId' ~ '^[A-Za-z0-9:_-]{16,150}$'
  AND "metadata"->>'inputHash' ~ '^[0-9a-f]{64}$'
  AND "metadata"->>'previewHash' ~ '^[0-9a-f]{64}$'
  AND "metadata"->>'policyHash' ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof("metadata"->'bookingId') = 'string'
  AND length(btrim("metadata"->>'bookingId')) > 0
  AND jsonb_typeof("metadata"->'memberId') = 'string'
  AND length(btrim("metadata"->>'memberId')) > 0
  AND jsonb_typeof("metadata"->'classTemplateId') = 'string'
  AND length(btrim("metadata"->>'classTemplateId')) > 0
  AND jsonb_typeof("metadata"->'policyRevisionId') = 'string'
  AND length(btrim("metadata"->>'policyRevisionId')) > 0
  AND jsonb_typeof("metadata"->'policyVersion') = 'number'
  AND "metadata"->>'policyVersion' ~ '^[1-9][0-9]*$'
  AND jsonb_typeof("metadata"->'fundingRevision') = 'number'
  AND "metadata"->>'fundingRevision' ~ '^[1-9][0-9]*$'
  AND jsonb_typeof("metadata"->'reason') = 'string'
  AND length(btrim("metadata"->>'reason')) BETWEEN 5 AND 500
  AND "metadata"->'overriddenRules' = '["BOOKING_CUTOFF", "MINIMUM_LEAD"]'::jsonb
 ) IS TRUE
);
