-- Protect tenant-scoped penalty-free membership grace-release receipts.
-- Additive SQL only: no model, historical update, backfill or weakened existing trigger.
ALTER TABLE workspace_data_events ADD CONSTRAINT membership_grace_receipt_shape CHECK (
 kind <> 'MEMBERSHIP_GRACE_BOOKING_RELEASED' OR (
  "actorUserId" IS NULL
  AND id ~ '^membership-grace:[a-f0-9]{64}$'
  AND jsonb_typeof(metadata) = 'object'
  AND metadata->'schemaVersion' = '1'::jsonb
  AND jsonb_typeof(metadata->'bookingId') = 'string' AND length(btrim(metadata->>'bookingId')) BETWEEN 1 AND 150
  AND jsonb_typeof(metadata->'membershipId') = 'string' AND length(btrim(metadata->>'membershipId')) BETWEEN 1 AND 150
  AND jsonb_typeof(metadata->'memberId') = 'string' AND length(btrim(metadata->>'memberId')) BETWEEN 1 AND 150
  AND jsonb_typeof(metadata->'classTemplateId') = 'string' AND length(btrim(metadata->>'classTemplateId')) BETWEEN 1 AND 150
  AND CASE WHEN jsonb_typeof(metadata->'fundingRevision') = 'number' AND metadata->>'fundingRevision' ~ '^[1-9][0-9]*$' THEN (metadata->>'fundingRevision')::numeric BETWEEN 1 AND 2147483647 ELSE false END
  AND metadata->>'scheduledForDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND jsonb_typeof(metadata->'timezone') = 'string' AND length(btrim(metadata->>'timezone')) BETWEEN 1 AND 100
  AND metadata->>'startsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  AND metadata->>'restrictedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  AND (metadata->>'startsAt')::timestamptz > (metadata->>'restrictedAt')::timestamptz
  AND (metadata->'invoiceId' = 'null'::jsonb OR (jsonb_typeof(metadata->'invoiceId') = 'string' AND length(btrim(metadata->>'invoiceId')) BETWEEN 1 AND 150))
  AND (
    (metadata->>'basis' = 'FIXED_GRACE_EXPIRED'
     AND metadata->>'gracePeriodEndsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     AND (metadata->>'gracePeriodEndsAt')::timestamptz <= (metadata->>'restrictedAt')::timestamptz)
    OR (metadata->>'basis' = 'UNRESOLVED_FAILURE_TIMING' AND metadata->'gracePeriodEndsAt' = 'null'::jsonb)
  )
  AND metadata->>'action' = 'DEFAULT_CANCEL_RELEASE'
  AND metadata->>'from' = 'BOOKED' AND metadata->>'to' = 'CANCELLED'
  AND metadata->'noShowPenalty' = 'false'::jsonb
  AND jsonb_typeof(metadata->'allowanceAllocationIds') = 'array'
  AND NOT jsonb_path_exists(metadata->'allowanceAllocationIds', '$[*] ? (@.type() != "string" || @ == "")')
  AND CASE WHEN jsonb_typeof(metadata->'notificationRecipientCount') = 'number' AND metadata->>'notificationRecipientCount' ~ '^(0|[1-9][0-9]*)$' THEN (metadata->>'notificationRecipientCount')::numeric BETWEEN 0 AND 2147483647 ELSE false END
 ) IS TRUE
);
CREATE UNIQUE INDEX membership_grace_booking_revision_key ON workspace_data_events ("workspaceId", (metadata->>'bookingId'), ((metadata->>'fundingRevision')::integer)) WHERE kind='MEMBERSHIP_GRACE_BOOKING_RELEASED';
CREATE FUNCTION protect_membership_grace_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='MEMBERSHIP_GRACE_BOOKING_RELEASED' OR (TG_OP='UPDATE' AND NEW.kind='MEMBERSHIP_GRACE_BOOKING_RELEASED') THEN
  IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=OLD."workspaceId" OR NOT EXISTS (SELECT 1 FROM workspaces WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Membership grace receipts are immutable outside reviewed retention';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER membership_grace_receipts_immutable BEFORE UPDATE OR DELETE ON workspace_data_events FOR EACH ROW EXECUTE FUNCTION protect_membership_grace_receipts();
-- Candidate and debt reads stay tenant-scoped; partial indexes need no new model.
CREATE INDEX membership_grace_bookings_scan_idx ON class_bookings ("workspaceId",id) WHERE status='BOOKED' AND "bookingType"='MEMBERSHIP' AND "fundingMembershipId" IS NOT NULL;
CREATE INDEX membership_grace_invoices_scan_idx ON invoices ("workspaceId","memberMembershipId") WHERE status IN ('OPEN','UNCOLLECTIBLE') AND "amountDueCents">0 AND ("firstFailedAt" IS NOT NULL OR "lastFailureCode"='payment_failure_time_unknown');
