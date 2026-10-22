-- Phase 2N5A: run in Supabase SQL Editor BEFORE enabling the Task Storage flag.
-- Assumes the default task table names. If SUPABASE_DEPARTMENT_*_TABLE is
-- overridden, adjust the identifiers below to match the actual deployed tables.
-- Signed references are matched only in attachment/work-file fields, NOT in
-- arbitrary task notes. The application subsequently verifies each exact URL
-- against the live, permission-filtered record.
CREATE OR REPLACE FUNCTION public.erp_storage_task_file_links(p_reference text)
RETURNS TABLE(ticket_id text, section_id text, assignment_id text, file_kind text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.ticket_id, x.section_id, x.assignment_id, x.file_kind
  FROM (
    SELECT s.ticket_id::text AS ticket_id, s.id::text AS section_id,
           NULL::text AS assignment_id, 'section_attachment'::text AS file_kind
    FROM public.department_ticket_sections AS s
    WHERE length(p_reference) BETWEEN 40 AND 6000 AND
      (strpos(coalesce(s.attachments::text, ''), p_reference) > 0
       OR strpos(coalesce(s.attachment_url, ''), p_reference) > 0)
    UNION ALL
    SELECT s.ticket_id::text, s.id::text, NULL::text, 'section_work'::text
    FROM public.department_ticket_sections AS s
    WHERE length(p_reference) BETWEEN 40 AND 6000 AND
      strpos(coalesce(s.work_file_url, ''), p_reference) > 0
    UNION ALL
    SELECT s.ticket_id::text, a.section_id::text, a.id::text, 'assignment_attachment'::text
    FROM public.department_ticket_section_assignments AS a
    JOIN public.department_ticket_sections AS s ON s.id = a.section_id
    WHERE length(p_reference) BETWEEN 40 AND 6000 AND
      (strpos(coalesce(a.attachments::text, ''), p_reference) > 0
       OR strpos(coalesce(a.attachment_url, ''), p_reference) > 0)
    UNION ALL
    SELECT s.ticket_id::text, a.section_id::text, a.id::text, 'assignment_work'::text
    FROM public.department_ticket_section_assignments AS a
    JOIN public.department_ticket_sections AS s ON s.id = a.section_id
    WHERE length(p_reference) BETWEEN 40 AND 6000 AND
      strpos(coalesce(a.work_file_url, ''), p_reference) > 0
  ) AS x
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.erp_storage_task_file_links(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_storage_task_file_links(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_storage_task_file_links(text) TO service_role;
