-- Phase 2Q3F: READ-ONLY installation and access check.
-- Safe to run in Staging first. Does not archive, delete, or alter any rows.
-- Expected ready-for-test result: all boolean columns except the last two are TRUE;
-- anon_can_execute and authenticated_can_execute must be FALSE.
WITH target AS (
  SELECT to_regprocedure(
    'public.erp_atomic_order_action(text,text[],text,jsonb)'
  )::oid AS function_oid
)
SELECT
  current_database() AS database_name,
  to_regclass('public.orders') IS NOT NULL AS orders_table_exists,
  p.oid IS NOT NULL AS function_installed,
  COALESCE(p.prosecdef, FALSE) AS security_definer,
  COALESCE('search_path=' = ANY(p.proconfig), FALSE) AS empty_search_path,
  CASE WHEN p.oid IS NULL THEN FALSE
       ELSE has_function_privilege('service_role', p.oid, 'EXECUTE') END
    AS service_role_can_execute,
  CASE WHEN p.oid IS NULL THEN FALSE
       ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END
    AS anon_can_execute,
  CASE WHEN p.oid IS NULL THEN FALSE
       ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END
    AS authenticated_can_execute
FROM target AS t
LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.function_oid;
