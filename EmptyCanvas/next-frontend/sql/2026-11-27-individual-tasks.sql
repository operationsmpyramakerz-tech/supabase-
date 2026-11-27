-- Add individual tasks without changing any existing project/section rows.
-- Run in Supabase SQL Editor before applying the application update.
BEGIN;
ALTER TABLE public.department_tickets
  ADD COLUMN IF NOT EXISTS ticket_kind text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS direct_assignee_id text,
  ADD COLUMN IF NOT EXISTS direct_assignee_name text,
  ADD COLUMN IF NOT EXISTS direct_work_report text,
  ADD COLUMN IF NOT EXISTS direct_rejection_reason text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.department_tickets'::regclass
      AND conname = 'department_tickets_individual_kind_check'
  ) THEN
    ALTER TABLE public.department_tickets
      ADD CONSTRAINT department_tickets_individual_kind_check CHECK (
        ticket_kind IN ('project', 'task')
        AND (ticket_kind <> 'task' OR (
          direct_assignee_id IS NOT NULL AND btrim(direct_assignee_id) <> ''
          AND direct_assignee_name IS NOT NULL AND btrim(direct_assignee_name) <> ''
        ))
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS department_tickets_direct_assignee_idx
  ON public.department_tickets (direct_assignee_id, due_date)
  WHERE ticket_kind = 'task';
NOTIFY pgrst, 'reload schema';
COMMIT;
