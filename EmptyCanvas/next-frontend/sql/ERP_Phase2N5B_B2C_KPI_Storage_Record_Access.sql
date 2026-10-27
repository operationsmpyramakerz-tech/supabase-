-- Phase 2N5B: install before enabling either record-authorization flag.
-- These table names are the application defaults. Update them if your SUPABASE_B2C_CUSTOMERS_TABLE is customized.
-- Indexed and scoped in app: these functions locate candidate rows, NOT grant access.
-- Only the service role may invoke them. The app re-reads exact values and checks real record visibility.
CREATE OR REPLACE FUNCTION public.erp_storage_b2c_file_links(p_reference text)
RETURNS TABLE(record_id text, database_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id::text, c.database_id::text
  FROM public.b2c_customers AS c
  WHERE length(p_reference) BETWEEN 40 AND 6000
    AND strpos(coalesce(c.data::text, ''), p_reference) > 0
  LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.erp_storage_b2c_file_links(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_storage_b2c_file_links(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_storage_b2c_file_links(text) TO service_role;

CREATE OR REPLACE FUNCTION public.erp_storage_kpi_file_links(p_reference text)
RETURNS TABLE(score_id text, review_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id::text, s.review_id::text
  FROM public.kpi_employee_scores AS s
  WHERE length(p_reference) BETWEEN 40 AND 6000
    AND strpos(coalesce(s.evidence_text, ''), p_reference) > 0
  LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.erp_storage_kpi_file_links(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_storage_kpi_file_links(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_storage_kpi_file_links(text) TO service_role;
