-- Staff access evidence is append-only. The reviewed, inventory-bound tenant
-- retention transaction is the only application path allowed to remove it.
CREATE FUNCTION "staff_access_evidence_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."kind" = 'STAFF_ACCESS_CHANGED' OR (TG_OP = 'UPDATE' AND NEW."kind" = 'STAFF_ACCESS_CHANGED') THEN
    IF TG_OP = 'DELETE' AND current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId" THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Staff access evidence is append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "staff_access_evidence_immutable" BEFORE UPDATE OR DELETE ON "workspace_data_events"
FOR EACH ROW EXECUTE FUNCTION "staff_access_evidence_append_only"();
