-- Preserve the same reviewed tenant-retention exception as staff role evidence.
-- Invite create/rotate/expiry/revoke/accept records are append-only too.
CREATE OR REPLACE FUNCTION "staff_access_evidence_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."kind" = 'STAFF_ACCESS_CHANGED' OR left(OLD."kind", 13) = 'STAFF_INVITE_'
    OR (TG_OP = 'UPDATE' AND (NEW."kind" = 'STAFF_ACCESS_CHANGED' OR left(NEW."kind", 13) = 'STAFF_INVITE_')) THEN
    IF TG_OP = 'DELETE' AND current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Staff identity evidence is append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
