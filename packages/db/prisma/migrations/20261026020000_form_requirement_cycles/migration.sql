-- Reviewed form requirement cycles and accepted-booking recovery. Additive schema55 migration after room-default review.
-- DropIndex
DROP INDEX "signed_documents_workspace_version_member_signer_key";

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "formRequirementSnapshot" JSONB;

-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "acceptanceCycleKey" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "requirementRevisionId" TEXT;

-- AlterTable
ALTER TABLE "signed_documents" ADD COLUMN     "acceptanceCycleKey" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "requirementRevisionId" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "form_requirement_revisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "formDocumentId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "terms" JSONB NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousRevisionHash" TEXT,
    "revisionHash" TEXT NOT NULL,
    "previewHash" TEXT NOT NULL,
    "legacyBaseline" JSONB,

    CONSTRAINT "form_requirement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_form_recoveries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingFundingRevision" INTEGER NOT NULL,
    "requirementRevisionId" TEXT NOT NULL,
    "acceptedSnapshotHash" TEXT,
    "evidence" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "assignedToWorkspaceUserId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacementBookingId" TEXT,
    "financialReviewCaseId" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "booking_form_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_requirement_revisions_workspaceId_formDocumentId_effec_idx" ON "form_requirement_revisions"("workspaceId", "formDocumentId", "effectiveAt", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_requirement_revisions_formDocumentId_version_key" ON "form_requirement_revisions"("formDocumentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_revision_workspace_id_key" ON "form_requirement_revisions"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_revision_workspace_version_id_key" ON "form_requirement_revisions"("workspaceId", "formVersionId", "id");

-- CreateIndex
CREATE INDEX "booking_form_recoveries_workspaceId_state_openedAt_idx" ON "booking_form_recoveries"("workspaceId", "state", "openedAt");

-- CreateIndex
CREATE INDEX "booking_form_recoveries_workspaceId_assignedToWorkspaceUser_idx" ON "booking_form_recoveries"("workspaceId", "assignedToWorkspaceUserId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "booking_form_recovery_commitment_revision_key" ON "booking_form_recoveries"("bookingId", "bookingFundingRevision", "requirementRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "class_bookings_workspace_id_key" ON "class_bookings"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_documents_workspace_id_key" ON "form_documents"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_workspace_document_id_key" ON "form_versions"("workspaceId", "formDocumentId", "id");

-- CreateIndex
CREATE INDEX "signature_requests_revision_member_state_idx" ON "signature_requests"("workspaceId", "memberId", "requirementRevisionId", "signerKind", "status");

-- CreateIndex
CREATE INDEX "signed_documents_workspaceId_validUntil_id_idx" ON "signed_documents"("workspaceId", "validUntil", "id");

-- CreateIndex
CREATE UNIQUE INDEX "signed_documents_workspace_version_member_signer_cycle_key" ON "signed_documents"("workspaceId", "formVersionId", "memberId", "signerKind", "acceptanceCycleKey");

-- CreateIndex
CREATE UNIQUE INDEX "financial_review_cases_workspace_id_key" ON "financial_review_cases"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_request_revision_scope_fk" FOREIGN KEY ("workspaceId", "formVersionId", "requirementRevisionId") REFERENCES "form_requirement_revisions"("workspaceId", "formVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_document_revision_scope_fk" FOREIGN KEY ("workspaceId", "formVersionId", "requirementRevisionId") REFERENCES "form_requirement_revisions"("workspaceId", "formVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requirement_revisions" ADD CONSTRAINT "form_requirement_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requirement_revisions" ADD CONSTRAINT "form_revision_document_scope_fk" FOREIGN KEY ("workspaceId", "formDocumentId") REFERENCES "form_documents"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requirement_revisions" ADD CONSTRAINT "form_revision_version_scope_fk" FOREIGN KEY ("workspaceId", "formDocumentId", "formVersionId") REFERENCES "form_versions"("workspaceId", "formDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requirement_revisions" ADD CONSTRAINT "form_requirement_revisions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "booking_form_recoveries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "form_recovery_original_scope_fk" FOREIGN KEY ("workspaceId", "bookingId") REFERENCES "class_bookings"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "form_recovery_revision_scope_fk" FOREIGN KEY ("workspaceId", "requirementRevisionId") REFERENCES "form_requirement_revisions"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "booking_form_recoveries_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "form_recovery_reviewer_scope_fk" FOREIGN KEY ("workspaceId", "assignedToWorkspaceUserId") REFERENCES "workspace_users"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "form_recovery_replacement_scope_fk" FOREIGN KEY ("workspaceId", "replacementBookingId") REFERENCES "class_bookings"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_form_recoveries" ADD CONSTRAINT "form_recovery_financial_case_scope_fk" FOREIGN KEY ("workspaceId", "financialReviewCaseId") REFERENCES "financial_review_cases"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy rows retain exactly their original effective uniqueness and no inferred expiry.
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_request_acceptance_cycle" CHECK (
  ("requirementRevisionId" IS NULL AND "acceptanceCycleKey"='legacy') OR
  ("requirementRevisionId" IS NOT NULL AND "requirementRevisionId"="acceptanceCycleKey"));
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_document_acceptance_cycle" CHECK (
  ("requirementRevisionId" IS NULL AND "acceptanceCycleKey"='legacy' AND "validUntil" IS NULL) OR
  ("requirementRevisionId" IS NOT NULL AND "requirementRevisionId"="acceptanceCycleKey"));
ALTER TABLE "form_requirement_revisions"
  ADD CONSTRAINT "form_requirement_revision_version" CHECK ("version">=1),
  ADD CONSTRAINT "form_requirement_revision_hashes" CHECK ("fileSha256"~'^[a-f0-9]{64}$' AND "revisionHash"~'^[a-f0-9]{64}$' AND "previewHash"~'^[a-f0-9]{64}$' AND ("previousRevisionHash" IS NULL OR "previousRevisionHash"~'^[a-f0-9]{64}$')),
  ADD CONSTRAINT "form_requirement_revision_reason" CHECK (length(btrim("reason")) BETWEEN 5 AND 500),
  ADD CONSTRAINT "form_requirement_revision_timing" CHECK ("effectiveAt">"publishedAt");
ALTER TABLE "booking_form_recoveries"
  ADD CONSTRAINT "form_recovery_versions" CHECK ("version">=1 AND "bookingFundingRevision">=1),
  ADD CONSTRAINT "form_recovery_states" CHECK ("state" IN ('OPEN','REFUND_REVIEW','SIGNED','CANCELLED','REBOOKED','REFUNDED','NO_LONGER_REQUIRED')),
  ADD CONSTRAINT "form_recovery_hashes" CHECK ("evidenceHash"~'^[a-f0-9]{64}$' AND ("acceptedSnapshotHash" IS NULL OR "acceptedSnapshotHash"~'^[a-f0-9]{64}$')),
  ADD CONSTRAINT "form_recovery_resolution" CHECK (("state" IN ('OPEN','REFUND_REVIEW') AND "resolvedAt" IS NULL) OR ("state" NOT IN ('OPEN','REFUND_REVIEW') AND "resolvedAt" IS NOT NULL));

CREATE FUNCTION "guard_form_requirement_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "form_requirement_revisions"; doc "form_documents"; version_row "form_versions";
  lead_minutes INTEGER; valid_until TIMESTAMP(3); next_version INTEGER;
BEGIN
  IF TG_OP = 'DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Form requirement revisions are immutable outside reviewed retention'; END IF;
  -- Application locks schedule -> family -> financial -> form rows. A direct insert
  -- must join the same publication serialization and row identity check.
  PERFORM pg_advisory_xact_lock(hashtext('class-schedule:' || NEW."workspaceId"));
  PERFORM id FROM "workspaces" WHERE id=NEW."workspaceId" FOR SHARE;
  PERFORM id FROM "workspace_users" WHERE "workspaceId"=NEW."workspaceId" AND "userId"=NEW."actorUserId" FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=NEW."workspaceId" AND status<>'DISABLED') THEN RAISE EXCEPTION 'Workspace is unavailable'; END IF;
  SELECT * INTO doc FROM "form_documents" WHERE id=NEW."formDocumentId" AND "workspaceId"=NEW."workspaceId" AND "archivedAt" IS NULL FOR UPDATE;
  SELECT * INTO version_row FROM "form_versions" WHERE id=NEW."formVersionId" AND "workspaceId"=NEW."workspaceId" AND "formDocumentId"=NEW."formDocumentId";
  IF doc.id IS NULL OR version_row.id IS NULL OR version_row."fileSha256" <> NEW."fileSha256"
    OR NOT EXISTS (SELECT 1 FROM "workspace_users" WHERE "workspaceId"=NEW."workspaceId" AND "userId"=NEW."actorUserId" AND role='OWNER' AND "isActive")
    THEN RAISE EXCEPTION 'Form publication requires exact tenant PDF and current owner'; END IF;
  SELECT * INTO prior FROM "form_requirement_revisions" WHERE "formDocumentId"=NEW."formDocumentId" ORDER BY version DESC LIMIT 1;
  next_version := COALESCE(prior.version,0)+1;
  IF NEW.version <> next_version OR NEW."previousRevisionHash" IS DISTINCT FROM prior."revisionHash"
    OR (prior.id IS NOT NULL AND NEW."effectiveAt" < prior."effectiveAt") THEN RAISE EXCEPTION 'Form publication head changed'; END IF;
  IF jsonb_typeof(NEW.terms) <> 'object'
    OR NOT (NEW.terms ?& ARRAY['schemaVersion','targets','effectiveAt','consentValidUntil','noticeLeadMinutes','expiryWarningLeadMinutes'])
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.terms))<>6 OR NEW.terms->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(NEW.terms->'targets') <> 'array'
    OR jsonb_array_length(NEW.terms->'targets') > 4
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.terms->'targets') target WHERE target NOT IN ('TRIAL','MEMBER','GUARDIAN','MEMBERSHIP_ACTIVATION'))
    OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.terms->'targets')) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(NEW.terms->'targets'))
    OR (NEW.terms->>'effectiveAt')::timestamptz <> NEW."effectiveAt" AT TIME ZONE 'UTC'
    THEN RAISE EXCEPTION 'Invalid form requirement terms'; END IF;
  lead_minutes := (NEW.terms->>'noticeLeadMinutes')::INTEGER;
  IF lead_minutes NOT BETWEEN 1 AND 527040 OR (NEW.terms->>'expiryWarningLeadMinutes')::INTEGER NOT BETWEEN 1 AND 527040
    OR NEW."effectiveAt" < NEW."publishedAt" + lead_minutes * INTERVAL '1 minute'
    OR NEW."publishedAt" > clock_timestamp() + INTERVAL '5 seconds'
    OR NEW."publishedAt" < clock_timestamp() - INTERVAL '5 minutes'
    THEN RAISE EXCEPTION 'Invalid explicit form notice timing'; END IF;
  valid_until := (NEW.terms->>'consentValidUntil')::timestamptz AT TIME ZONE 'UTC';
  IF valid_until IS NOT NULL AND valid_until <= NEW."effectiveAt" THEN RAISE EXCEPTION 'Consent expiry must follow effective time'; END IF;
  IF next_version=1 THEN
    IF NEW."legacyBaseline" IS NULL OR jsonb_typeof(NEW."legacyBaseline")<>'object'
      OR NEW."legacyBaseline"->'schemaVersion' IS DISTINCT FROM '1'::jsonb
      OR NEW."legacyBaseline"->>'basis' IS DISTINCT FROM 'OBSERVED_AT_PUBLICATION'
      OR (SELECT count(*) FROM jsonb_object_keys(NEW."legacyBaseline"))<>7
      OR NEW."legacyBaseline"->>'formVersionId' IS DISTINCT FROM doc."currentVersionId"
      OR (NEW."legacyBaseline"->>'observedAt')::timestamptz <> NEW."publishedAt" AT TIME ZONE 'UTC'
      OR NOT (NEW."legacyBaseline" ?& ARRAY['schemaVersion','basis','observedAt','formVersionId','fileSha256','targets','consentValidUntil'])
      OR NEW."legacyBaseline"->>'fileSha256' IS DISTINCT FROM (SELECT "fileSha256" FROM "form_versions" WHERE id=doc."currentVersionId")
      OR NEW."legacyBaseline"->'targets' IS DISTINCT FROM COALESCE((SELECT jsonb_agg("requirementTarget" ORDER BY "requirementTarget") FROM "required_form_assignments" WHERE "workspaceId"=NEW."workspaceId" AND "formDocumentId"=doc.id AND "isActive"), '[]'::jsonb)
      OR NEW."legacyBaseline"->'consentValidUntil' IS DISTINCT FROM 'null'::jsonb
      THEN RAISE EXCEPTION 'Legacy baseline must be an honest current observation'; END IF;
  ELSIF NEW."legacyBaseline" IS NOT NULL THEN RAISE EXCEPTION 'Only the first publication captures legacy state'; END IF;
  -- A real MVCC row-version fence, even when no legacy display field changes.
  -- A Serializable legacy editor that waited with an old snapshot must retry.
  UPDATE "form_documents" SET "updatedAt"="updatedAt" WHERE id=NEW."formDocumentId" AND "workspaceId"=NEW."workspaceId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "form_requirement_revision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "form_requirement_revisions" FOR EACH ROW EXECUTE FUNCTION "guard_form_requirement_revision"();

-- Existing legacy pointer/assignments are retained as baseline compatibility,
-- rather than made into a fictional dated publication. Product edits route to revisions.
CREATE FUNCTION "guard_legacy_form_requirement_edit"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_id TEXT; tenant_id TEXT;
BEGIN
  document_id := CASE WHEN TG_TABLE_NAME='form_documents' THEN to_jsonb(OLD)->>'id' ELSE COALESCE(to_jsonb(NEW)->>'formDocumentId',to_jsonb(OLD)->>'formDocumentId') END;
  tenant_id := COALESCE(to_jsonb(NEW)->>'workspaceId',to_jsonb(OLD)->>'workspaceId');
  IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=tenant_id OR NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=tenant_id)) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='required_form_assignments' THEN
    -- Parent row lock + physical update fences both directions of a first-publication race.
    -- The nested document trigger permits an updatedAt-only fence without recursion.
    PERFORM id FROM "form_documents" WHERE id=document_id AND "workspaceId"=tenant_id FOR UPDATE;
    UPDATE "form_documents" SET "updatedAt"="updatedAt" WHERE id=document_id AND "workspaceId"=tenant_id;
  END IF;
  IF TG_TABLE_NAME='form_documents' AND TG_OP='UPDATE' THEN
    IF current_setting('hitlink.reviewed_retention_workspace',true)=tenant_id
      AND NEW."currentVersionId" IS NULL
      AND (to_jsonb(NEW)-ARRAY['currentVersionId','updatedAt'])=(to_jsonb(OLD)-ARRAY['currentVersionId','updatedAt']) THEN RETURN NEW; END IF;
    IF EXISTS(SELECT 1 FROM "form_requirement_revisions" WHERE "formDocumentId"=document_id)
      AND (NEW."currentVersionId" IS DISTINCT FROM OLD."currentVersionId" OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt") THEN RAISE EXCEPTION 'Use reviewed publication to change form requirements'; END IF;
  ELSIF EXISTS(SELECT 1 FROM "form_requirement_revisions" WHERE "formDocumentId"=document_id) THEN RAISE EXCEPTION 'Use reviewed publication to change form requirements'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER "form_legacy_pointer_guard" BEFORE UPDATE OR DELETE ON "form_documents" FOR EACH ROW EXECUTE FUNCTION "guard_legacy_form_requirement_edit"();
CREATE TRIGGER "form_legacy_assignment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "required_form_assignments" FOR EACH ROW EXECUTE FUNCTION "guard_legacy_form_requirement_edit"();

CREATE FUNCTION "guard_form_cycle_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision "form_requirement_revisions"; request "signature_requests";
BEGIN
  IF TG_TABLE_NAME='signature_requests' AND TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR (NEW."workspaceId",NEW."formVersionId",NEW."memberId",NEW."guardianId",NEW."signerKind",NEW."accessMethod",NEW."requirementRevisionId",NEW."acceptanceCycleKey") IS DISTINCT FROM (OLD."workspaceId",OLD."formVersionId",OLD."memberId",OLD."guardianId",OLD."signerKind",OLD."accessMethod",OLD."requirementRevisionId",OLD."acceptanceCycleKey") THEN RAISE EXCEPTION 'Signing request binding is immutable'; END IF;
  END IF;
  IF NEW."requirementRevisionId" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO revision FROM "form_requirement_revisions" WHERE id=NEW."requirementRevisionId";
  IF revision.id IS NULL OR revision."workspaceId"<>NEW."workspaceId" OR revision."formVersionId"<>NEW."formVersionId" OR NEW."acceptanceCycleKey"<>revision.id
    OR NOT EXISTS(SELECT 1 FROM "members" WHERE id=NEW."memberId" AND "workspaceId"=NEW."workspaceId")
    OR (NEW."guardianId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "guardians" WHERE id=NEW."guardianId" AND "workspaceId"=NEW."workspaceId"))
    THEN RAISE EXCEPTION 'Acceptance cycle tenant/version mismatch'; END IF;
  IF TG_TABLE_NAME='signed_documents' THEN
    IF NEW."signedAt"<revision."publishedAt" OR NEW."validUntil" IS DISTINCT FROM ((revision.terms->>'consentValidUntil')::timestamptz AT TIME ZONE 'UTC')
      OR (NEW."validUntil" IS NOT NULL AND NEW."signedAt">=NEW."validUntil") THEN RAISE EXCEPTION 'Signature validity differs from reviewed cycle'; END IF;
    SELECT * INTO request FROM "signature_requests" WHERE id=NEW."signedFromRequestId";
    IF request.id IS NULL OR request."workspaceId"<>NEW."workspaceId" OR request."memberId"<>NEW."memberId" OR request."guardianId" IS DISTINCT FROM NEW."guardianId" OR request."signerKind"<>NEW."signerKind" OR request."formVersionId" IS DISTINCT FROM NEW."formVersionId" OR request."requirementRevisionId" IS DISTINCT FROM revision.id OR request."acceptanceCycleKey" IS DISTINCT FROM revision.id OR request.status<>'COMPLETED' THEN RAISE EXCEPTION 'Signature requires exact completed request'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "signature_request_cycle_guard" BEFORE INSERT OR UPDATE ON "signature_requests" FOR EACH ROW EXECUTE FUNCTION "guard_form_cycle_binding"();
CREATE TRIGGER "signed_document_cycle_guard" BEFORE INSERT ON "signed_documents" FOR EACH ROW EXECUTE FUNCTION "guard_form_cycle_binding"();
CREATE FUNCTION "protect_form_acceptance_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=OLD."workspaceId" OR NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Acceptance evidence is immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "form_acceptance_history_guard" BEFORE UPDATE OR DELETE ON "signed_documents" FOR EACH ROW EXECUTE FUNCTION "protect_form_acceptance_history"();

CREATE FUNCTION "guard_booking_form_recovery"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE booking "class_bookings"; revision "form_requirement_revisions"; service_at TIMESTAMP(3); accepted_at TIMESTAMP(3);
BEGIN
  IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=OLD."workspaceId" OR NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Form recovery history is retained'; END IF;
  SELECT * INTO booking FROM "class_bookings" WHERE id=NEW."bookingId" AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  SELECT * INTO revision FROM "form_requirement_revisions" WHERE id=NEW."requirementRevisionId" AND "workspaceId"=NEW."workspaceId";
  IF booking.id IS NULL OR revision.id IS NULL OR (TG_OP='INSERT' AND booking."fundingRevision"<>NEW."bookingFundingRevision")
    OR NOT EXISTS(SELECT 1 FROM "workspace_users" WHERE id=NEW."assignedToWorkspaceUserId" AND "workspaceId"=NEW."workspaceId" AND role='OWNER' AND "isActive")
    OR (NEW."replacementBookingId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "class_bookings" WHERE id=NEW."replacementBookingId" AND "workspaceId"=NEW."workspaceId" AND "memberId"=booking."memberId"))
    OR (NEW."financialReviewCaseId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "financial_review_cases" WHERE id=NEW."financialReviewCaseId" AND "workspaceId"=NEW."workspaceId" AND "bookingId"=NEW."bookingId" AND "memberId"=booking."memberId"))
    THEN RAISE EXCEPTION 'Form recovery requires exact tenant/commitment/reviewer'; END IF;
  IF TG_OP='INSERT' THEN
    service_at := (NEW.evidence->>'serviceAt')::timestamptz AT TIME ZONE 'UTC';
    accepted_at := COALESCE((booking."formRequirementSnapshot"->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC',booking."createdAt");
    IF jsonb_typeof(NEW.evidence)<>'object' OR NEW.evidence->'schemaVersion' IS DISTINCT FROM '1'::jsonb
      OR NEW.evidence->>'bookingId' IS DISTINCT FROM booking.id
      OR NEW.evidence->>'memberId' IS DISTINCT FROM booking."memberId"
      OR NEW.evidence->>'revisionId' IS DISTINCT FROM revision.id
      OR NEW.evidence->>'revisionHash' IS DISTINCT FROM revision."revisionHash"
      OR (NEW.evidence->>'fundingRevision')::int IS DISTINCT FROM NEW."bookingFundingRevision"
      OR NEW."acceptedSnapshotHash" IS DISTINCT FROM booking."formRequirementSnapshot"->>'snapshotHash'
      OR service_at IS NULL OR revision."effectiveAt">service_at
      OR (NEW.evidence->>'publishedAt')::timestamptz IS DISTINCT FROM revision."publishedAt" AT TIME ZONE 'UTC'
      OR (NEW.evidence->>'effectiveAt')::timestamptz IS DISTINCT FROM revision."effectiveAt" AT TIME ZONE 'UTC'
      OR (NEW.evidence->>'acceptedAt')::timestamptz IS DISTINCT FROM accepted_at AT TIME ZONE 'UTC'
      THEN RAISE EXCEPTION 'Form recovery evidence must match exact accepted commitment and revision'; END IF;
    IF NEW.state<>'OPEN' OR NEW.version<>1 OR NEW."openedByUserId"<>revision."actorUserId"
      OR revision."publishedAt"<=COALESCE((booking."formRequirementSnapshot"->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC',booking."createdAt") OR NEW.evidence->>'cause' IS DISTINCT FROM 'PROVIDER_REQUIREMENT_AFTER_BOOKING'
      THEN RAISE EXCEPTION 'Form recovery requires later provider publication'; END IF;
  ELSE
    IF OLD.state='REFUND_REVIEW' AND NEW.state NOT IN ('REFUND_REVIEW','REFUNDED')
      OR OLD.state='OPEN' AND NEW.state NOT IN ('OPEN','REFUND_REVIEW','SIGNED','CANCELLED','REBOOKED','NO_LONGER_REQUIRED')
      OR NEW.state IN ('CANCELLED','REBOOKED','REFUND_REVIEW','REFUNDED') AND booking.status<>'CANCELLED'
      OR NEW.state='REBOOKED' AND NEW."replacementBookingId" IS NULL
      OR NEW.state IN ('REFUND_REVIEW','REFUNDED') AND NEW."financialReviewCaseId" IS NULL
      THEN RAISE EXCEPTION 'Form recovery transition lacks its completed remedy'; END IF;
    IF (to_jsonb(NEW)-ARRAY['state','version','assignedToWorkspaceUserId','replacementBookingId','financialReviewCaseId','resolvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','assignedToWorkspaceUserId','replacementBookingId','financialReviewCaseId','resolvedAt'])
      OR NEW.version<>OLD.version+1 OR OLD.state NOT IN ('OPEN','REFUND_REVIEW')
      THEN RAISE EXCEPTION 'Recovery opening evidence is immutable; transitions require next version'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "booking_form_recovery_guard" BEFORE INSERT OR UPDATE OR DELETE ON "booking_form_recoveries" FOR EACH ROW EXECUTE FUNCTION "guard_booking_form_recovery"();

CREATE FUNCTION "protect_form_requirement_events"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind IN ('FORM_REQUIREMENT_PUBLISHED','BOOKING_FORM_ACCEPTED','FORM_RECOVERY_OPENED','FORM_RECOVERY_TRANSITIONED','FORM_RECOVERY_COMMAND','FORM_EXPIRY_WARNING_PROCESSED') OR (TG_OP='UPDATE' AND NEW.kind IN ('FORM_REQUIREMENT_PUBLISHED','BOOKING_FORM_ACCEPTED','FORM_RECOVERY_OPENED','FORM_RECOVERY_TRANSITIONED','FORM_RECOVERY_COMMAND','FORM_EXPIRY_WARNING_PROCESSED')) THEN
    IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=OLD."workspaceId" OR NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Form requirement/recovery events are immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER "form_requirement_events_guard" BEFORE UPDATE OR DELETE ON "workspace_data_events" FOR EACH ROW EXECUTE FUNCTION "protect_form_requirement_events"();

-- A published revision binds exact PDF metadata and bytes. Draft upload remains
-- possible; replacing bytes on an already published version is not.
CREATE FUNCTION "protect_published_form_pdf"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND (current_setting('hitlink.reviewed_retention_workspace',true)=OLD."workspaceId" OR NOT EXISTS(SELECT 1 FROM "workspaces" WHERE id=OLD."workspaceId")) THEN RETURN OLD; END IF;
  IF EXISTS(SELECT 1 FROM "form_requirement_revisions" WHERE "formVersionId"=OLD.id)
    OR EXISTS(SELECT 1 FROM "signed_documents" WHERE "formVersionId"=OLD.id) THEN RAISE EXCEPTION 'Published exact form versions are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER "published_form_pdf_guard" BEFORE UPDATE OR DELETE ON "form_versions" FOR EACH ROW EXECUTE FUNCTION "protect_published_form_pdf"();
