-- Individual Task Attachments: additive migration; run in Supabase SQL Editor first.
-- Requires the already-installed Individual Tasks schema and workflow attachment columns.
-- Keeps existing projects, files and permissions unchanged.
BEGIN;
ALTER TABLE public.department_tickets
  ADD COLUMN IF NOT EXISTS direct_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Reuse the private ERP storage bucket (create only if missing).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('erp-private-files', 'erp-private-files', false, 15728640)
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'erp-private-files' AND public IS FALSE
  ) THEN
    RAISE EXCEPTION 'ERP private bucket must exist and be private.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.erp_storage_task_file_links(p_reference text)
RETURNS TABLE(ticket_id text, section_id text, assignment_id text, file_kind text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.ticket_id, x.section_id, x.assignment_id, x.file_kind
  FROM (
    SELECT t.id::text AS ticket_id, NULL::text AS section_id,
           NULL::text AS assignment_id, 'direct_task_attachment'::text AS file_kind
    FROM public.department_tickets AS t
    WHERE t.ticket_kind = 'task' AND length(p_reference) BETWEEN 40 AND 6000
      AND strpos(coalesce(t.direct_attachments::text, ''), p_reference) > 0
    UNION ALL
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

NOTIFY pgrst, 'reload schema';
COMMIT;
