-- External candidate only; root chooses the integrated migration identifier.
-- No extension is required: PostgreSQL's built-in sha256(bytea) is used below.

CREATE FUNCTION "coaching_booking_json_exact_keys"(value JSONB, keys TEXT[])
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
  RETURN (SELECT count(*) FROM jsonb_object_keys(value)) = cardinality(keys) AND value ?& keys;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

CREATE FUNCTION "coaching_booking_json_integer"(value JSONB, minimum NUMERIC, maximum NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE number NUMERIC;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RETURN FALSE; END IF;
  number := (value #>> '{}')::NUMERIC;
  RETURN number = trunc(number) AND number >= minimum AND number <= maximum;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

-- Same JSON policy accepted by parseCoachingBookingPolicy. Durations have only
-- numeric/storage limits; candidate-specific Date arithmetic remains a runtime
-- check because the policy itself contains no candidate timestamp.
CREATE FUNCTION "coaching_booking_policy_valid"(value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  appointments JSONB;
  day JSONB;
  service_interval JSONB;
  weekdays TEXT[] := ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
  seen TEXT[] := ARRAY[]::TEXT[];
  weekday TEXT;
  start_minute NUMERIC;
  end_minute NUMERIC;
  previous_end NUMERIC;
BEGIN
  IF "coaching_booking_json_exact_keys"(value, ARRAY['schemaVersion','appointments']) IS NOT TRUE
     OR value->'schemaVersion' IS DISTINCT FROM '1'::JSONB THEN RETURN FALSE; END IF;
  appointments := value->'appointments';
  IF "coaching_booking_json_exact_keys"(appointments, ARRAY['weeklyHours','maxAdvanceMinutes','minimumLeadMinutes','minimumBufferMinutes','resolutionResponseHours']) IS NOT TRUE
     OR jsonb_typeof(appointments->'weeklyHours') IS DISTINCT FROM 'array'
     OR jsonb_array_length(appointments->'weeklyHours') <> 7 THEN RETURN FALSE; END IF;
  IF "coaching_booking_json_integer"(appointments->'maxAdvanceMinutes', 1, 9007199254740991) IS NOT TRUE
     OR "coaching_booking_json_integer"(appointments->'minimumLeadMinutes', 0, 9007199254740991) IS NOT TRUE
     OR (appointments->>'maxAdvanceMinutes')::NUMERIC <= (appointments->>'minimumLeadMinutes')::NUMERIC
     OR "coaching_booking_json_integer"(appointments->'minimumBufferMinutes', 0, 2147483647) IS NOT TRUE
     OR "coaching_booking_json_integer"(appointments->'resolutionResponseHours', 1, 9007199254740991) IS NOT TRUE
     OR (appointments->>'resolutionResponseHours')::NUMERIC * 3600000 > 9007199254740991 THEN RETURN FALSE; END IF;
  FOR day IN SELECT item FROM jsonb_array_elements(appointments->'weeklyHours') AS days(item) LOOP
    IF "coaching_booking_json_exact_keys"(day, ARRAY['weekday','intervals']) IS NOT TRUE
       OR jsonb_typeof(day->'weekday') IS DISTINCT FROM 'string'
       OR jsonb_typeof(day->'intervals') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
    weekday := day->>'weekday';
    IF NOT weekday = ANY(weekdays) OR weekday = ANY(seen) THEN RETURN FALSE; END IF;
    seen := array_append(seen, weekday);
    previous_end := -1;
    -- Sorting matches the pure parser. Adjacent intervals are valid, crossing
    -- midnight is represented by separate explicit day entries, never rollover.
    FOR service_interval IN
      SELECT item FROM jsonb_array_elements(day->'intervals') AS intervals(item)
      ORDER BY (item->>'startMinute')::NUMERIC, (item->>'endMinute')::NUMERIC
    LOOP
      IF "coaching_booking_json_exact_keys"(service_interval, ARRAY['startMinute','endMinute']) IS NOT TRUE
         OR "coaching_booking_json_integer"(service_interval->'startMinute', 0, 1440) IS NOT TRUE
         OR "coaching_booking_json_integer"(service_interval->'endMinute', 0, 1440) IS NOT TRUE THEN RETURN FALSE; END IF;
      start_minute := (service_interval->>'startMinute')::NUMERIC;
      end_minute := (service_interval->>'endMinute')::NUMERIC;
      IF end_minute <= start_minute OR start_minute < previous_end THEN RETURN FALSE; END IF;
      previous_end := end_minute;
    END LOOP;
  END LOOP;
  RETURN cardinality(seen) = 7;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

-- JSONB's own text/key order is NOT JSON.stringify's order. Build the exact
-- normalized TypeScript object serialization explicitly. Every number is a
-- nonnegative JS-safe integer (<1e21), so JSON.stringify uses ordinary decimal
-- integer text; trunc(NUMERIC)::text removes JSONB input scale such as 60.0.
CREATE FUNCTION "coaching_booking_policy_canonical_json"(value JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  appointments JSONB;
  day JSONB;
  service_interval JSONB;
  weekday TEXT;
  day_json TEXT;
  hours_json TEXT := '';
  intervals_json TEXT;
BEGIN
  IF "coaching_booking_policy_valid"(value) IS NOT TRUE THEN RETURN NULL; END IF;
  appointments := value->'appointments';
  FOREACH weekday IN ARRAY ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] LOOP
    SELECT item INTO day FROM jsonb_array_elements(appointments->'weeklyHours') AS days(item)
      WHERE item->>'weekday' = weekday;
    intervals_json := '';
    FOR service_interval IN
      SELECT item FROM jsonb_array_elements(day->'intervals') AS intervals(item)
      ORDER BY (item->>'startMinute')::NUMERIC, (item->>'endMinute')::NUMERIC
    LOOP
      IF intervals_json <> '' THEN intervals_json := intervals_json || ','; END IF;
      intervals_json := intervals_json || '{"startMinute":' || trunc((service_interval->>'startMinute')::NUMERIC)::TEXT
        || ',"endMinute":' || trunc((service_interval->>'endMinute')::NUMERIC)::TEXT || '}';
    END LOOP;
    day_json := '{"weekday":' || to_jsonb(weekday)::TEXT || ',"intervals":[' || intervals_json || ']}';
    IF hours_json <> '' THEN hours_json := hours_json || ','; END IF;
    hours_json := hours_json || day_json;
  END LOOP;
  RETURN '{"schemaVersion":1,"appointments":{"weeklyHours":[' || hours_json
    || '],"maxAdvanceMinutes":' || trunc((appointments->>'maxAdvanceMinutes')::NUMERIC)::TEXT
    || ',"minimumLeadMinutes":' || trunc((appointments->>'minimumLeadMinutes')::NUMERIC)::TEXT
    || ',"minimumBufferMinutes":' || trunc((appointments->>'minimumBufferMinutes')::NUMERIC)::TEXT
    || ',"resolutionResponseHours":' || trunc((appointments->>'resolutionResponseHours')::NUMERIC)::TEXT || '}}';
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE FUNCTION "coaching_booking_policy_hash"(value JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to("coaching_booking_policy_canonical_json"(value), 'UTF8')), 'hex');
$$;

CREATE FUNCTION "coaching_booking_policy_receipt_valid"(actor_user_id TEXT, value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  version_number NUMERIC;
  reason TEXT;
  control_code INTEGER;
BEGIN
  IF actor_user_id IS NULL OR btrim(actor_user_id) = ''
     OR "coaching_booking_json_exact_keys"(value, ARRAY['schemaVersion','version','previousVersion','previousEventId','previousPolicyHash','policyHash','policy','operationId','inputHash','previewHash','reason','actorWorkspaceUserId','actorNameSnapshot','affectedAvailabilityCount','retainedAppointmentCount']) IS NOT TRUE
     OR value->'schemaVersion' IS DISTINCT FROM '1'::JSONB THEN RETURN FALSE; END IF;
  IF "coaching_booking_json_integer"(value->'version', 1, 2147483647) IS NOT TRUE
     OR "coaching_booking_json_integer"(value->'previousVersion', 0, 2147483646) IS NOT TRUE
     OR "coaching_booking_json_integer"(value->'affectedAvailabilityCount', 0, 9007199254740991) IS NOT TRUE
     OR "coaching_booking_json_integer"(value->'retainedAppointmentCount', 0, 9007199254740991) IS NOT TRUE THEN RETURN FALSE; END IF;
  version_number := (value->>'version')::NUMERIC;
  IF (value->>'previousVersion')::NUMERIC <> version_number - 1 THEN RETURN FALSE; END IF;
  IF version_number = 1 THEN
    IF value->'previousEventId' IS DISTINCT FROM 'null'::JSONB OR value->'previousPolicyHash' IS DISTINCT FROM 'null'::JSONB THEN RETURN FALSE; END IF;
  ELSE
    IF jsonb_typeof(value->'previousEventId') IS DISTINCT FROM 'string' OR btrim(value->>'previousEventId') = ''
       OR jsonb_typeof(value->'previousPolicyHash') IS DISTINCT FROM 'string'
       OR (value->>'previousPolicyHash') !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  END IF;
  IF jsonb_typeof(value->'operationId') IS DISTINCT FROM 'string' OR (value->>'operationId') !~ '^[A-Za-z0-9:_-]{16,150}$'
     OR jsonb_typeof(value->'inputHash') IS DISTINCT FROM 'string' OR (value->>'inputHash') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(value->'previewHash') IS DISTINCT FROM 'string' OR (value->>'previewHash') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(value->'policyHash') IS DISTINCT FROM 'string' OR (value->>'policyHash') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(value->'actorWorkspaceUserId') IS DISTINCT FROM 'string' OR btrim(value->>'actorWorkspaceUserId') = ''
     OR jsonb_typeof(value->'actorNameSnapshot') IS DISTINCT FROM 'string' OR btrim(value->>'actorNameSnapshot') = ''
     OR jsonb_typeof(value->'reason') IS DISTINCT FROM 'string'
     OR "coaching_booking_policy_valid"(value->'policy') IS NOT TRUE
     OR (value->>'policyHash') IS DISTINCT FROM "coaching_booking_policy_hash"(value->'policy') THEN RETURN FALSE; END IF;
  reason := value->>'reason';
  IF btrim(reason) = '' OR char_length(reason) > 500 THEN RETURN FALSE; END IF;
  FOR control_code IN 1..31 LOOP
    IF position(chr(control_code) IN reason) > 0 THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

CREATE UNIQUE INDEX "workspace_data_events_workspace_id_key" ON "workspace_data_events"("workspaceId", "id");

CREATE TABLE "coaching_booking_policies" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "policy" JSONB NOT NULL,
  "policyHash" TEXT NOT NULL,
  "currentEventId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coaching_booking_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coaching_booking_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coaching_booking_policies_workspaceId_currentEventId_fkey" FOREIGN KEY ("workspaceId", "currentEventId") REFERENCES "workspace_data_events"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coaching_booking_policy_head_shape" CHECK ((
    btrim("id") <> '' AND btrim("workspaceId") <> '' AND btrim("currentEventId") <> ''
    AND "version" >= 1 AND "policyHash" ~ '^[0-9a-f]{64}$'
    AND "coaching_booking_policy_valid"("policy")
    AND "policyHash" = "coaching_booking_policy_hash"("policy")
  ) IS TRUE)
);
CREATE UNIQUE INDEX "coaching_booking_policies_workspaceId_key" ON "coaching_booking_policies"("workspaceId");
CREATE UNIQUE INDEX "coaching_booking_policies_currentEventId_key" ON "coaching_booking_policies"("currentEventId");
CREATE UNIQUE INDEX "coaching_booking_policy_workspace_receipt_key" ON "coaching_booking_policies"("workspaceId", "currentEventId");

ALTER TABLE "workspace_data_events" ADD CONSTRAINT "coaching_booking_policy_receipt_shape" CHECK ((
  "kind" <> 'COACHING_BOOKING_POLICY_CONFIRMED'
  OR "coaching_booking_policy_receipt_valid"("actorUserId", "metadata")
) IS TRUE);
CREATE UNIQUE INDEX "coaching_booking_policy_receipt_operation_key"
  ON "workspace_data_events"("workspaceId", ("metadata"->>'operationId'))
  WHERE "kind" = 'COACHING_BOOKING_POLICY_CONFIRMED';
CREATE UNIQUE INDEX "coaching_booking_policy_receipt_version_key"
  ON "workspace_data_events"("workspaceId", (("metadata"->>'version')::INTEGER))
  WHERE "kind" = 'COACHING_BOOKING_POLICY_CONFIRMED';

-- Row identities are locked without mutable authority predicates. Under a fixed
-- Serializable snapshot, a concurrent authority update produces 40001 rather
-- than silently authorizing a stale owner; the caller retries the whole command.
CREATE FUNCTION "guard_coaching_booking_policy_receipt_insert"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  workspace_status TEXT;
  staff "workspace_users"%ROWTYPE;
BEGIN
  IF NEW."kind" <> 'COACHING_BOOKING_POLICY_CONFIRMED' THEN RETURN NEW; END IF;
  IF "coaching_booking_policy_receipt_valid"(NEW."actorUserId", NEW."metadata") IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid coaching booking policy receipt' USING ERRCODE = '23514';
  END IF;
  SELECT "status"::TEXT INTO workspace_status FROM "workspaces" WHERE "id" = NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR workspace_status = 'DISABLED' THEN
    RAISE EXCEPTION 'Coaching booking policy requires an active workspace' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO staff FROM "workspace_users"
    WHERE "id" = NEW."metadata"->>'actorWorkspaceUserId' AND "workspaceId" = NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR staff."userId" IS DISTINCT FROM NEW."actorUserId" OR staff."role"::TEXT <> 'OWNER' OR staff."isActive" IS NOT TRUE THEN
    RAISE EXCEPTION 'Coaching booking policy receipt requires its current active owner actor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "coaching_booking_policy_receipt_insert_guard"
  BEFORE INSERT ON "workspace_data_events" FOR EACH ROW EXECUTE FUNCTION "guard_coaching_booking_policy_receipt_insert"();

CREATE FUNCTION "guard_coaching_booking_policy_head"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt "workspace_data_events"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
       OR NEW."version"::BIGINT <> OLD."version"::BIGINT + 1 OR NEW."currentEventId" IS NOT DISTINCT FROM OLD."currentEventId" THEN
      RAISE EXCEPTION 'Coaching booking policy head must retain identity and advance exactly once' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."version" IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Initial coaching booking policy head must start at version one' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO receipt FROM "workspace_data_events"
    WHERE "workspaceId" = NEW."workspaceId" AND "id" = NEW."currentEventId" FOR SHARE;
  IF NOT FOUND OR receipt."kind" <> 'COACHING_BOOKING_POLICY_CONFIRMED'
     OR "coaching_booking_policy_receipt_valid"(receipt."actorUserId", receipt."metadata") IS NOT TRUE
     OR (receipt."metadata"->>'version')::INTEGER IS DISTINCT FROM NEW."version"
     OR receipt."metadata"->>'policyHash' IS DISTINCT FROM NEW."policyHash"
     OR receipt."metadata"->'policy' IS DISTINCT FROM NEW."policy" THEN
    RAISE EXCEPTION 'Coaching booking policy head requires its exact same-workspace receipt and canonical policy' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF receipt."metadata"->'previousVersion' IS DISTINCT FROM '0'::JSONB
       OR receipt."metadata"->'previousEventId' IS DISTINCT FROM 'null'::JSONB
       OR receipt."metadata"->'previousPolicyHash' IS DISTINCT FROM 'null'::JSONB THEN
      RAISE EXCEPTION 'Initial coaching booking policy receipt has an invalid prior chain' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (receipt."metadata"->>'previousVersion')::INTEGER IS DISTINCT FROM OLD."version"
       OR receipt."metadata"->>'previousEventId' IS DISTINCT FROM OLD."currentEventId"
       OR receipt."metadata"->>'previousPolicyHash' IS DISTINCT FROM OLD."policyHash" THEN
      RAISE EXCEPTION 'Coaching booking policy receipt does not extend the exact previous head' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "coaching_booking_policy_head_transition_guard"
  BEFORE INSERT OR UPDATE ON "coaching_booking_policies" FOR EACH ROW EXECUTE FUNCTION "guard_coaching_booking_policy_head"();

CREATE FUNCTION "require_coaching_booking_policy_receipt_head"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'COACHING_BOOKING_POLICY_CONFIRMED' AND NOT EXISTS (
    SELECT 1 FROM "coaching_booking_policies" AS head
    WHERE head."workspaceId" = NEW."workspaceId" AND head."currentEventId" = NEW."id"
      AND head."version" = (NEW."metadata"->>'version')::INTEGER
      AND head."policyHash" = NEW."metadata"->>'policyHash'
      AND head."policy" = NEW."metadata"->'policy'
  ) THEN
    RAISE EXCEPTION 'A coaching booking policy receipt must become its exact committed workspace head' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "coaching_booking_policy_receipt_requires_head"
  AFTER INSERT ON "workspace_data_events" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "require_coaching_booking_policy_receipt_head"();

CREATE FUNCTION "protect_coaching_booking_policy_receipts"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."kind" = 'COACHING_BOOKING_POLICY_CONFIRMED' OR NEW."kind" = 'COACHING_BOOKING_POLICY_CONFIRMED' THEN
      RAISE EXCEPTION 'Coaching booking policy receipts are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."kind" = 'COACHING_BOOKING_POLICY_CONFIRMED' THEN
    IF current_setting('hitlink.reviewed_retention_workspace', TRUE) = OLD."workspaceId"
       OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = OLD."workspaceId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Coaching booking policy receipts are removable only through reviewed retention' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "coaching_booking_policy_receipts_immutable"
  BEFORE UPDATE OR DELETE ON "workspace_data_events" FOR EACH ROW EXECUTE FUNCTION "protect_coaching_booking_policy_receipts"();

CREATE FUNCTION "protect_coaching_booking_policy_head_delete"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('hitlink.reviewed_retention_workspace', TRUE) = OLD."workspaceId"
     OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = OLD."workspaceId") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Coaching booking policy cannot be removed outside reviewed retention' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "coaching_booking_policy_head_delete_guard"
  BEFORE DELETE ON "coaching_booking_policies" FOR EACH ROW EXECUTE FUNCTION "protect_coaching_booking_policy_head_delete"();
