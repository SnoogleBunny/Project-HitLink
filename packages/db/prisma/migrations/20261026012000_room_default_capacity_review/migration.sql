-- Immutable reviewed room-default capacity receipts; no new Prisma models.
ALTER TABLE "workspace_data_events" ADD CONSTRAINT "room_capacity_receipt_shape" CHECK (
 "kind" <> 'ROOM_DEFAULT_CAPACITY_CONFIRMED' OR (
  "actorUserId" IS NOT NULL AND length(btrim("actorUserId")) > 0
  AND "metadata"->'schemaVersion' = '1'::jsonb
  AND jsonb_typeof("metadata"->'roomId') = 'string' AND length(btrim("metadata"->>'roomId')) > 0
  AND jsonb_typeof("metadata"->'operationId') = 'string' AND "metadata"->>'operationId' ~ '^[A-Za-z0-9:_-]{16,150}$'
  AND "metadata"->>'inputHash' ~ '^[a-f0-9]{64}$'
  AND "metadata"->>'previewHash' ~ '^[a-f0-9]{64}$'
  AND "metadata"->>'confirmedVersion' ~ '^[a-f0-9]{64}$'
  AND CASE WHEN jsonb_typeof("metadata"->'revision') = 'number' AND "metadata"->>'revision' ~ '^[1-9][0-9]*$' THEN ("metadata"->>'revision')::numeric BETWEEN 1 AND 2147483647 ELSE false END
  AND CASE WHEN jsonb_typeof("metadata"->'previousRevision') = 'number' AND "metadata"->>'previousRevision' ~ '^(0|[1-9][0-9]*)$' THEN ("metadata"->>'previousRevision')::numeric BETWEEN 0 AND 2147483646 ELSE false END
  AND ("metadata"->>'revision')::numeric = ("metadata"->>'previousRevision')::numeric + 1
  AND ("metadata"->'previousCapacity' = 'null'::jsonb OR CASE WHEN jsonb_typeof("metadata"->'previousCapacity') = 'number' AND "metadata"->>'previousCapacity' ~ '^[1-9][0-9]*$' THEN ("metadata"->>'previousCapacity')::numeric BETWEEN 1 AND 2147483647 ELSE false END)
  AND ("metadata"->'capacity' = 'null'::jsonb OR CASE WHEN jsonb_typeof("metadata"->'capacity') = 'number' AND "metadata"->>'capacity' ~ '^[1-9][0-9]*$' THEN ("metadata"->>'capacity')::numeric BETWEEN 1 AND 2147483647 ELSE false END)
  AND jsonb_typeof("metadata"->'reason') = 'string' AND length(btrim("metadata"->>'reason')) BETWEEN 5 AND 500
  AND jsonb_typeof("metadata"->'actorWorkspaceUserId') = 'string' AND length(btrim("metadata"->>'actorWorkspaceUserId')) > 0
  AND jsonb_typeof("metadata"->'actorNameSnapshot') = 'string' AND length(btrim("metadata"->>'actorNameSnapshot')) > 0
  AND CASE WHEN jsonb_typeof("metadata"->'affectedOccurrenceCount') = 'number' AND "metadata"->>'affectedOccurrenceCount' ~ '^(0|[1-9][0-9]*)$' THEN ("metadata"->>'affectedOccurrenceCount')::numeric <= 2147483647 ELSE false END
  AND CASE WHEN jsonb_typeof("metadata"->'reservationCount') = 'number' AND "metadata"->>'reservationCount' ~ '^(0|[1-9][0-9]*)$' THEN ("metadata"->>'reservationCount')::numeric <= 2147483647 ELSE false END
  AND CASE WHEN jsonb_typeof("metadata"->'pendingPaymentCount') = 'number' AND "metadata"->>'pendingPaymentCount' ~ '^(0|[1-9][0-9]*)$' THEN ("metadata"->>'pendingPaymentCount')::numeric <= 2147483647 ELSE false END
  AND CASE WHEN jsonb_typeof("metadata"->'queuedEntryCount') = 'number' AND "metadata"->>'queuedEntryCount' ~ '^(0|[1-9][0-9]*)$' THEN ("metadata"->>'queuedEntryCount')::numeric <= 2147483647 ELSE false END
 ) IS TRUE
);
CREATE UNIQUE INDEX "room_capacity_workspace_operation_key" ON "workspace_data_events" ("workspaceId", ("metadata"->>'operationId')) WHERE "kind" = 'ROOM_DEFAULT_CAPACITY_CONFIRMED';
CREATE UNIQUE INDEX "room_capacity_workspace_room_revision_key" ON "workspace_data_events" ("workspaceId", ("metadata"->>'roomId'), (("metadata"->>'revision')::integer)) WHERE "kind" = 'ROOM_DEFAULT_CAPACITY_CONFIRMED';
CREATE FUNCTION "protect_room_capacity_receipts"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind = 'ROOM_DEFAULT_CAPACITY_CONFIRMED' OR (TG_OP = 'UPDATE' AND NEW.kind = 'ROOM_DEFAULT_CAPACITY_CONFIRMED') THEN
   IF TG_OP = 'DELETE' AND (current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")) THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Room capacity receipts are immutable outside reviewed retention';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER "room_capacity_receipts_immutable" BEFORE UPDATE OR DELETE ON "workspace_data_events" FOR EACH ROW EXECUTE FUNCTION "protect_room_capacity_receipts"();
