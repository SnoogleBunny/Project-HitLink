-- EXTERNAL ADDITIVE CANDIDATE. Do not modify the already-applied private head migration.
-- Root may serialize this with the reviewed policy head DDL into source57.
-- Historical support evidence, never a service-access or provider-success claim.

CREATE FUNCTION coaching_booking_disclosure_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF coaching_booking_json_exact_keys(value, ARRAY['schemaVersion','policyEventId','policyVersion','policyHash','reviewedAt','availabilityHash','availableCount','notOpenCount','resolutionOwnerWorkspaceUserId','resolutionOwnerNameSnapshot','resolutionResponseHours','notHeld']) IS NOT TRUE
    OR value->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR value->'notHeld' IS DISTINCT FROM 'true'::jsonb
    OR coaching_booking_json_integer(value->'policyVersion',1,2147483647) IS NOT TRUE
    OR coaching_booking_json_integer(value->'availableCount',0,9007199254740991) IS NOT TRUE
    OR coaching_booking_json_integer(value->'notOpenCount',0,9007199254740991) IS NOT TRUE
    OR coaching_booking_json_integer(value->'resolutionResponseHours',1,2501999792) IS NOT TRUE
    OR jsonb_typeof(value->'policyEventId') IS DISTINCT FROM 'string' OR btrim(value->>'policyEventId')=''
    OR jsonb_typeof(value->'policyHash') IS DISTINCT FROM 'string' OR (value->>'policyHash') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(value->'availabilityHash') IS DISTINCT FROM 'string' OR (value->>'availabilityHash') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(value->'resolutionOwnerWorkspaceUserId') IS DISTINCT FROM 'string' OR btrim(value->>'resolutionOwnerWorkspaceUserId')=''
    OR jsonb_typeof(value->'resolutionOwnerNameSnapshot') IS DISTINCT FROM 'string' OR btrim(value->>'resolutionOwnerNameSnapshot')=''
    OR jsonb_typeof(value->'reviewedAt') IS DISTINCT FROM 'string'
    OR (value->>'reviewedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    THEN RETURN FALSE; END IF;
  RETURN value->>'reviewedAt'=to_char((value->>'reviewedAt')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

CREATE FUNCTION coaching_checkout_disclosure_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT;
BEGIN
  IF coaching_booking_json_exact_keys(value, ARRAY['schemaVersion','operationId','operationVersionAtCapture','requestHash','requestPayloadHash','enrollmentId','beneficiaryMemberId','programVersionId','payerAccountId','payerUserId','payerGrantId','payerGrantVersion','capturedAt','appointmentBookingDisclosure']) IS NOT TRUE
    OR value->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR value->'operationVersionAtCapture' IS DISTINCT FROM '1'::jsonb
    OR coaching_booking_disclosure_valid(value->'appointmentBookingDisclosure') IS NOT TRUE
    OR value->'capturedAt' IS DISTINCT FROM value->'appointmentBookingDisclosure'->'reviewedAt'
    THEN RETURN FALSE; END IF;
  FOREACH field IN ARRAY ARRAY['operationId','enrollmentId','beneficiaryMemberId','programVersionId','payerAccountId','payerUserId'] LOOP
    IF jsonb_typeof(value->field) IS DISTINCT FROM 'string' OR btrim(value->>field)='' THEN RETURN FALSE; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['requestHash','requestPayloadHash'] LOOP
    IF jsonb_typeof(value->field) IS DISTINCT FROM 'string' OR (value->>field) !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  END LOOP;
  IF value->'payerGrantId'='null'::jsonb THEN
    IF value->'payerGrantVersion' IS DISTINCT FROM 'null'::jsonb THEN RETURN FALSE; END IF;
  ELSIF jsonb_typeof(value->'payerGrantId') IS DISTINCT FROM 'string' OR btrim(value->>'payerGrantId')=''
    OR coaching_booking_json_integer(value->'payerGrantVersion',0,2147483647) IS NOT TRUE THEN RETURN FALSE;
  END IF;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

-- Exact metadata of the original server-owned provider request. The JSONB hash
-- below has a deliberately different name from original JSON.stringify hash.
CREATE FUNCTION coaching_checkout_disclosure_request_metadata(workspace_id TEXT, value JSONB)
RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'purpose','coaching','workspaceId',workspace_id,'enrollmentId',value->>'enrollmentId',
    'memberId',value->>'beneficiaryMemberId','programVersionId',value->>'programVersionId',
    'payerAccountId',value->>'payerAccountId','payerUserId',value->>'payerUserId',
    'payerGrantId',coalesce(value->>'payerGrantId',''),'payerGrantVersion',CASE WHEN value->'payerGrantVersion'='null'::jsonb THEN '' ELSE trunc((value->>'payerGrantVersion')::numeric)::text END,
    'appointmentBookingPolicyEventId',value->'appointmentBookingDisclosure'->>'policyEventId',
    'appointmentBookingPolicyVersion',trunc((value->'appointmentBookingDisclosure'->>'policyVersion')::numeric)::text,
    'appointmentBookingPolicyHash',value->'appointmentBookingDisclosure'->>'policyHash',
    'appointmentAvailabilityHash',value->'appointmentBookingDisclosure'->>'availabilityHash',
    'appointmentAvailableCount',trunc((value->'appointmentBookingDisclosure'->>'availableCount')::numeric)::text,
    'appointmentNotOpenCount',trunc((value->'appointmentBookingDisclosure'->>'notOpenCount')::numeric)::text,
    'appointmentBookingResolutionHours',trunc((value->'appointmentBookingDisclosure'->>'resolutionResponseHours')::numeric)::text,
    'appointmentBookingCaseOwnerId',value->'appointmentBookingDisclosure'->>'resolutionOwnerWorkspaceUserId',
    'appointmentTimesNotHeld','true','appointmentAvailabilityReviewedAt',value->>'capturedAt');
$$;

-- No mutable operation status/current payer/help-active filter here: an already
-- captured response promise survives every later payment/provider transition.
CREATE FUNCTION coaching_checkout_disclosure_bound(workspace_id TEXT, actor_id TEXT, value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE op financial_operations%ROWTYPE; d JSONB;
BEGIN
  IF coaching_checkout_disclosure_valid(value) IS NOT TRUE OR actor_id IS DISTINCT FROM value->>'payerUserId' THEN RETURN FALSE; END IF;
  d := value->'appointmentBookingDisclosure';
  SELECT * INTO op FROM financial_operations WHERE id=value->>'operationId' AND "workspaceId"=workspace_id;
  IF NOT FOUND OR op.kind::text<>'CHECKOUT' OR op."actorUserId" IS DISTINCT FROM actor_id
    OR op."payerAccountId" IS DISTINCT FROM value->>'payerAccountId'
    OR op."beneficiaryMemberId" IS DISTINCT FROM value->>'beneficiaryMemberId'
    OR op."targetId" IS DISTINCT FROM value->>'enrollmentId'
    OR op."requestHash" IS DISTINCT FROM value->>'requestHash'
    OR encode(sha256(convert_to(op.payload::text,'UTF8')),'hex') IS DISTINCT FROM value->>'requestPayloadHash'
    OR op."submittedAt" IS NULL
    OR to_char(op."submittedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM value->>'capturedAt'
    OR op.payload->'metadata' IS DISTINCT FROM coaching_checkout_disclosure_request_metadata(workspace_id,value)
    OR op.payload->>'client_reference_id' IS DISTINCT FROM value->>'enrollmentId'
    OR op.payload->>'mode' IS DISTINCT FROM 'payment' THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM coaching_enrollments enrollment
    JOIN members member ON member.id=enrollment."memberId" AND member."workspaceId"=workspace_id
    JOIN coaching_program_versions version ON version.id=value->>'programVersionId'
    JOIN coaching_programs program ON program.id=version."programId" AND program."workspaceId"=workspace_id
    JOIN workspace_data_events receipt ON receipt.id=d->>'policyEventId' AND receipt."workspaceId"=workspace_id
      AND receipt.kind='COACHING_BOOKING_POLICY_CONFIRMED'
      AND receipt.metadata->'version'=d->'policyVersion' AND receipt.metadata->'policyHash'=d->'policyHash'
    JOIN workspace_users help_owner ON help_owner.id=d->>'resolutionOwnerWorkspaceUserId' AND help_owner."workspaceId"=workspace_id
    WHERE enrollment.id=value->>'enrollmentId' AND enrollment."workspaceId"=workspace_id
      AND enrollment."memberId"=value->>'beneficiaryMemberId');
END;
$$;

CREATE FUNCTION coaching_accepted_help_hours(workspace_id TEXT, enrollment_id TEXT)
RETURNS NUMERIC LANGUAGE SQL STABLE AS $$
  SELECT min(CASE WHEN coaching_booking_disclosure_valid(p.snapshot->'appointmentBookingDisclosure')
      THEN (p.snapshot->'appointmentBookingDisclosure'->>'resolutionResponseHours')::numeric END)
  FROM coaching_accepted_plans p
  JOIN workspace_data_events receipt ON receipt.id=p.snapshot->'appointmentBookingDisclosure'->>'policyEventId'
    AND receipt."workspaceId"=workspace_id AND receipt.kind='COACHING_BOOKING_POLICY_CONFIRMED'
    AND receipt.metadata->'version'=p.snapshot->'appointmentBookingDisclosure'->'policyVersion'
    AND receipt.metadata->'policyHash'=p.snapshot->'appointmentBookingDisclosure'->'policyHash'
  JOIN workspace_users help_owner ON help_owner.id=p.snapshot->'appointmentBookingDisclosure'->>'resolutionOwnerWorkspaceUserId'
    AND help_owner."workspaceId"=workspace_id
  WHERE p."workspaceId"=workspace_id AND p."enrollmentId"=enrollment_id
    AND p.snapshot->'appointmentBookingDisclosure'->>'reviewedAt'=to_char(p."acceptedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

ALTER TABLE workspace_data_events ADD CONSTRAINT coaching_checkout_disclosure_shape CHECK (
  (kind<>'COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' OR coaching_checkout_disclosure_valid(metadata)) IS TRUE);
CREATE UNIQUE INDEX coaching_checkout_disclosure_operation_key ON workspace_data_events("workspaceId",(metadata->>'operationId'))
  WHERE kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED';
CREATE INDEX coaching_checkout_disclosure_enrollment_idx ON workspace_data_events("workspaceId",(metadata->>'enrollmentId'),"createdAt")
  WHERE kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED';

CREATE FUNCTION guard_coaching_checkout_disclosure_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  op financial_operations%ROWTYPE; enrollment coaching_enrollments%ROWTYPE;
  version coaching_program_versions%ROWTYPE; account financial_accounts%ROWTYPE;
  payer members%ROWTYPE; client members%ROWTYPE; grant_row coaching_payer_grants%ROWTYPE;
  staff workspace_users%ROWTYPE; help_owner workspace_users%ROWTYPE;
  head coaching_booking_policies%ROWTYPE; d JSONB; captured TIMESTAMP; expected_hours NUMERIC;
  workspace_status TEXT; payer_email TEXT; help_name TEXT;
BEGIN
  IF NEW.kind<>'COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' THEN RETURN NEW; END IF;
  IF coaching_checkout_disclosure_valid(NEW.metadata) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid coaching checkout disclosure shape' USING ERRCODE='23514'; END IF;
  d:=NEW.metadata->'appointmentBookingDisclosure';
  captured:=(NEW.metadata->>'capturedAt')::timestamptz AT TIME ZONE 'UTC';
  SELECT * INTO op FROM financial_operations WHERE id=NEW.metadata->>'operationId' AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR op.status::text<>'SUBMITTED' OR op.version<>1
    OR op."createdAt" IS DISTINCT FROM captured OR op."updatedAt" IS DISTINCT FROM captured
    OR NEW."createdAt" IS DISTINCT FROM captured
    OR captured < date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC')
    OR captured > clock_timestamp() AT TIME ZONE 'UTC'
    OR NOT EXISTS (SELECT 1 FROM financial_operations current_op WHERE current_op.id=op.id
      AND current_op.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296))
    OR coaching_checkout_disclosure_bound(NEW."workspaceId",NEW."actorUserId",NEW.metadata) IS NOT TRUE THEN
    RAISE EXCEPTION 'Receipt requires its exact new submitted coaching request in the same transaction' USING ERRCODE='23514'; END IF;
  SELECT status::text INTO workspace_status FROM workspaces WHERE id=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR workspace_status='DISABLED' THEN RAISE EXCEPTION 'Checkout workspace is unavailable' USING ERRCODE='23514'; END IF;
  SELECT * INTO enrollment FROM coaching_enrollments WHERE id=NEW.metadata->>'enrollmentId' AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR enrollment."programVersionId" IS DISTINCT FROM NEW.metadata->>'programVersionId'
    OR enrollment."closedAt" IS NOT NULL OR enrollment."acceptedAt" IS NULL OR enrollment."contactVerifiedAt" IS NULL
    THEN RAISE EXCEPTION 'Checkout requires its current accepted program' USING ERRCODE='23514'; END IF;
  SELECT * INTO version FROM coaching_program_versions WHERE id=enrollment."programVersionId" FOR SHARE;
  IF NOT FOUND OR version."appointmentUnits"<=0 OR op."amountCents" IS DISTINCT FROM version."priceCents"
    OR op.currency IS DISTINCT FROM version.currency OR op."providerAccountId" IS NULL
    OR op."providerIdempotencyKey" IS DISTINCT FROM op."operationKey" THEN
    RAISE EXCEPTION 'Checkout commercial terms do not match the current program' USING ERRCODE='23514'; END IF;
  SELECT * INTO account FROM financial_accounts WHERE id=op."payerAccountId" AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR account."userId" IS DISTINCT FROM NEW."actorUserId" THEN RAISE EXCEPTION 'Checkout payer account is outside scope' USING ERRCODE='23514'; END IF;
  SELECT * INTO payer FROM members WHERE id=account."memberId" AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  SELECT email INTO payer_email FROM users WHERE id=NEW."actorUserId" FOR SHARE;
  IF payer.id IS NULL OR payer."userId" IS DISTINCT FROM NEW."actorUserId" OR payer."dateOfBirth" IS NULL
    OR payer."dateOfBirth">((clock_timestamp() AT TIME ZONE 'UTC')::date-interval '18 years')::date THEN
    RAISE EXCEPTION 'Checkout payer must be an adult linked account' USING ERRCODE='23514'; END IF;
  SELECT * INTO staff FROM workspace_users WHERE "workspaceId"=NEW."workspaceId" AND "userId"=NEW."actorUserId" FOR SHARE;
  IF NOT FOUND OR staff.role::text<>'CUSTOMER' OR staff."isActive" IS NOT TRUE THEN
    RAISE EXCEPTION 'Checkout payer access is unavailable' USING ERRCODE='23514'; END IF;
  SELECT * INTO client FROM members WHERE id=enrollment."memberId" AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NEW.metadata->'payerGrantId'='null'::jsonb THEN
    IF payer.id IS DISTINCT FROM client.id OR EXISTS (SELECT 1 FROM coaching_payer_grants g WHERE g.id=enrollment."currentPayerGrantId" AND g."revokedAt" IS NULL) THEN
      RAISE EXCEPTION 'Checkout requires current client or accepted payer authority' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT * INTO grant_row FROM coaching_payer_grants WHERE id=NEW.metadata->>'payerGrantId' AND "workspaceId"=NEW."workspaceId" FOR SHARE;
    IF NOT FOUND OR grant_row."enrollmentId" IS DISTINCT FROM enrollment.id OR grant_row.id IS DISTINCT FROM enrollment."currentPayerGrantId"
      OR grant_row.version IS DISTINCT FROM (NEW.metadata->>'payerGrantVersion')::integer
      OR grant_row."payerUserId" IS DISTINCT FROM NEW."actorUserId" OR grant_row."payerMemberId" IS DISTINCT FROM payer.id
      OR grant_row."clientUserId" IS DISTINCT FROM client."userId" OR grant_row."revokedAt" IS NOT NULL
      OR grant_row."activeSlot" IS DISTINCT FROM 'ACTIVE' OR grant_row."payerAcceptedAt" IS NULL OR grant_row."payerContactVerifiedAt" IS NULL
      OR grant_row."acceptedTerms" IS DISTINCT FROM jsonb_build_object('beneficiaryMemberId',client.id,'programVersionId',version.id,'amountCents',version."priceCents",'currency',version.currency,'terms',version.terms) THEN
      RAISE EXCEPTION 'Checkout payer grant does not match the current exact terms' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO head FROM coaching_booking_policies WHERE "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND OR head."currentEventId" IS DISTINCT FROM d->>'policyEventId' OR to_jsonb(head.version) IS DISTINCT FROM d->'policyVersion'
    OR head."policyHash" IS DISTINCT FROM d->>'policyHash' THEN
    RAISE EXCEPTION 'Checkout disclosure is outside the exact current policy head' USING ERRCODE='23514'; END IF;
  SELECT * INTO help_owner FROM workspace_users WHERE id=d->>'resolutionOwnerWorkspaceUserId' AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  SELECT coalesce("fullName",email) INTO help_name FROM users WHERE id=help_owner."userId";
  IF help_owner.id IS NULL OR help_owner.id IS DISTINCT FROM enrollment."caseOwnerWorkspaceUserId"
    OR help_owner.role::text<>'OWNER' OR help_owner."isActive" IS NOT TRUE OR help_name IS DISTINCT FROM d->>'resolutionOwnerNameSnapshot' THEN
    RAISE EXCEPTION 'Checkout disclosure requires the current booking-help owner' USING ERRCODE='23514'; END IF;
  expected_hours:=least((head.policy->'appointments'->>'resolutionResponseHours')::numeric,
    coalesce(coaching_accepted_help_hours(NEW."workspaceId",enrollment.id),9007199254740991));
  SELECT least(expected_hours,coalesce(min(CASE WHEN coaching_checkout_disclosure_bound(e."workspaceId",e."actorUserId",e.metadata)
      THEN (e.metadata->'appointmentBookingDisclosure'->>'resolutionResponseHours')::numeric END),9007199254740991))
    INTO expected_hours FROM workspace_data_events e
    WHERE e."workspaceId"=NEW."workspaceId" AND e.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED'
      AND e.metadata->>'enrollmentId'=enrollment.id AND e.metadata->>'beneficiaryMemberId'=client.id;
  IF (d->>'resolutionResponseHours')::numeric IS DISTINCT FROM expected_hours
    OR op.payload->>'customer_email' IS DISTINCT FROM payer_email
    OR op.payload->'payment_intent_data'->'metadata' IS DISTINCT FROM jsonb_build_object('purpose','coaching','workspaceId',NEW."workspaceId",'enrollmentId',enrollment.id)
    OR op.payload->'line_items' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('quantity',1,'price_data',jsonb_build_object('currency',version.currency,'unit_amount',version."priceCents",'product_data',jsonb_build_object('name',(SELECT name FROM coaching_programs WHERE id=version."programId"))))) THEN
    RAISE EXCEPTION 'Checkout disclosure differs from its validated help promise or original commercial request' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER coaching_checkout_disclosure_insert_guard BEFORE INSERT ON workspace_data_events
  FOR EACH ROW EXECUTE FUNCTION guard_coaching_checkout_disclosure_insert();

CREATE FUNCTION protect_coaching_checkout_disclosure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' OR NEW.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' THEN
      RAISE EXCEPTION 'Coaching checkout disclosure receipts are immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED'
    AND current_setting('hitlink.reviewed_retention_workspace',TRUE) IS DISTINCT FROM OLD."workspaceId"
    AND EXISTS (SELECT 1 FROM workspaces WHERE id=OLD."workspaceId") THEN
    RAISE EXCEPTION 'Checkout disclosure is removable only through reviewed retention' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER coaching_checkout_disclosure_immutable BEFORE UPDATE OR DELETE ON workspace_data_events
  FOR EACH ROW EXECUTE FUNCTION protect_coaching_checkout_disclosure();

-- Also prohibit retrofitting a new receipt onto an old unreceipted request.
-- Ordinary provider status/version/result/reference/URL/payment/error fields
-- remain writable. Existing stable key/payload is never rewritten on replay.
CREATE FUNCTION protect_coaching_disclosed_checkout_request()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE marked BOOLEAN;
BEGIN
  marked:=(OLD.kind::text='CHECKOUT' AND OLD.payload->'metadata'->>'purpose'='coaching'
    AND OLD.payload->'metadata' ? 'appointmentBookingPolicyEventId') OR EXISTS (
      SELECT 1 FROM workspace_data_events e WHERE e."workspaceId"=OLD."workspaceId"
        AND e.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' AND e.metadata->>'operationId'=OLD.id);
  IF TG_OP='DELETE' THEN
    IF marked AND current_setting('hitlink.reviewed_retention_workspace',TRUE) IS DISTINCT FROM OLD."workspaceId"
      AND EXISTS (SELECT 1 FROM workspaces WHERE id=OLD."workspaceId") THEN
      RAISE EXCEPTION 'Disclosed checkout requests are removable only through reviewed retention' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF marked OR (NEW.kind::text='CHECKOUT' AND NEW.payload->'metadata'->>'purpose'='coaching'
    AND NEW.payload->'metadata' ? 'appointmentBookingPolicyEventId') THEN
    IF ROW(NEW.id,NEW."workspaceId",NEW.kind,NEW."operationKey",NEW."requestHash",NEW."actorUserId",NEW."payerAccountId",NEW."beneficiaryMemberId",NEW."targetId",NEW."amountCents",NEW.currency,NEW.units,NEW."providerAccountId",NEW."providerIdempotencyKey",NEW.payload,NEW."submittedAt",NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD.kind,OLD."operationKey",OLD."requestHash",OLD."actorUserId",OLD."payerAccountId",OLD."beneficiaryMemberId",OLD."targetId",OLD."amountCents",OLD.currency,OLD.units,OLD."providerAccountId",OLD."providerIdempotencyKey",OLD.payload,OLD."submittedAt",OLD."createdAt") THEN
      RAISE EXCEPTION 'Receipted checkout request identity and payload are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER coaching_disclosed_checkout_request_immutable BEFORE UPDATE OR DELETE ON financial_operations
  FOR EACH ROW EXECUTE FUNCTION protect_coaching_disclosed_checkout_request();

CREATE FUNCTION require_coaching_checkout_disclosure_pair()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind::text='CHECKOUT' AND (
      (NEW.payload->'metadata'->>'purpose'='coaching' AND NEW.payload->'metadata' ? 'appointmentBookingPolicyEventId')
      OR EXISTS (SELECT 1 FROM coaching_enrollments e JOIN coaching_program_versions v ON v.id=e."programVersionId"
        WHERE e.id=NEW."targetId" AND e."workspaceId"=NEW."workspaceId" AND v."appointmentUnits">0))
    AND NOT EXISTS (SELECT 1 FROM workspace_data_events e WHERE e."workspaceId"=NEW."workspaceId"
      AND e.kind='COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED' AND e.metadata->>'operationId'=NEW.id
      AND coaching_checkout_disclosure_bound(e."workspaceId",e."actorUserId",e.metadata)) THEN
    RAISE EXCEPTION 'New disclosed coaching checkout requires exactly one atomic receipt' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER coaching_checkout_requires_disclosure AFTER INSERT ON financial_operations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_coaching_checkout_disclosure_pair();
