-- Provision flowstate_pro_runtime as a non-owner, NOLOGIN, NOBYPASSRLS
-- capability role before deployment. Never grant it migration ownership.
BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO flowstate_pro_runtime;

CREATE SCHEMA flowstate_pro_guard;
REVOKE ALL ON SCHEMA flowstate_pro_guard FROM PUBLIC;
GRANT USAGE ON SCHEMA flowstate_pro_guard TO flowstate_pro_runtime;

CREATE FUNCTION flowstate_pro_guard.tenant_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN current_setting('flowstate_pro.tenant_id', true) ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN current_setting('flowstate_pro.tenant_id', true)::uuid
    ELSE NULL
  END
$$;
REVOKE ALL ON FUNCTION flowstate_pro_guard.tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION flowstate_pro_guard.tenant_id() TO flowstate_pro_runtime;

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'Organization', 'Site', 'Identity', 'Patient', 'RoleAssignment',
    'Invitation', 'RepresentativeAuthority', 'PolicyVersion',
    'LifecycleReference', 'Operation', 'OutboxItem', 'AuditEvent',
    'DisclosureRecord'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY pro_tenant ON public.%I TO flowstate_pro_runtime USING ("tenantId" = flowstate_pro_guard.tenant_id()) WITH CHECK ("tenantId" = flowstate_pro_guard.tenant_id())',
      relation
    );
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO flowstate_pro_runtime', relation);
    IF relation NOT IN ('AuditEvent', 'DisclosureRecord', 'PolicyVersion') THEN
      EXECUTE format('GRANT UPDATE ON public.%I TO flowstate_pro_runtime', relation);
    END IF;
  END LOOP;
END
$$;

COMMIT;
