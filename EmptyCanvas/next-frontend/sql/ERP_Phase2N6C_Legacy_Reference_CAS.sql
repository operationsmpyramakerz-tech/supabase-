-- Phase 2N6C: compare-and-swap reference update. Run manually as DB owner.
-- Does NOT migrate objects or remove public storage access.
-- Service-role only; uses an explicit (table, field) allowlist.
CREATE OR REPLACE FUNCTION public.erp_legacy_storage_reference_cas(
  p_table text, p_record_id text, p_field text,
  p_expected jsonb, p_replacement jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_updated integer;
BEGIN
  IF NOT (
    (p_table IN ('department_ticket_sections', 'department_ticket_section_assignments')
      AND p_field IN ('attachments', 'attachment_url', 'work_file_url'))
    OR (p_table = 'b2c_customers' AND p_field = 'data')
    OR (p_table = 'kpi_employee_scores' AND p_field = 'evidence_text')
  ) OR p_record_id IS NULL OR p_record_id !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_expected IS NULL OR p_replacement IS NULL OR p_expected = p_replacement
  THEN
    RAISE EXCEPTION 'Invalid legacy storage cutover request';
  END IF;

  SELECT c.data_type INTO v_type
    FROM information_schema.columns AS c
   WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = p_field;

  IF v_type IN ('jsonb', 'json') THEN
    EXECUTE format(
      'UPDATE public.%I SET %I = $1::%s WHERE id::text = $2 AND to_jsonb(%I) IS NOT DISTINCT FROM $3',
      p_table, p_field, v_type, p_field
    ) USING p_replacement, p_record_id, p_expected;
  ELSIF v_type IN ('text', 'character varying') THEN
    IF jsonb_typeof(p_replacement) <> 'string' THEN
      RAISE EXCEPTION 'Expected a JSON string for text column';
    END IF;
    EXECUTE format(
      'UPDATE public.%I SET %I = $1 #>> ''{}'' WHERE id::text = $2 AND to_jsonb(%I) IS NOT DISTINCT FROM $3',
      p_table, p_field, p_field
    ) USING p_replacement, p_record_id, p_expected;
  ELSE
    RAISE EXCEPTION 'Unsupported storage reference column type for %.%', p_table, p_field;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN RETURN 'conflict'; END IF;
  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.erp_legacy_storage_reference_cas(text,text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_legacy_storage_reference_cas(text,text,text,jsonb,jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_legacy_storage_reference_cas(text,text,text,jsonb,jsonb) TO service_role;
