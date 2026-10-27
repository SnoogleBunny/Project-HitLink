-- Earlier local databases may already have applied the original immutable
-- history functions. An additive upgrade is required; editing an applied
-- migration cannot update those databases.
CREATE OR REPLACE FUNCTION "protect_workspace_timezone_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Workspace timezone history is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION "protect_attendance_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Attendance history is immutable outside reviewed retention';
END;
$$;
