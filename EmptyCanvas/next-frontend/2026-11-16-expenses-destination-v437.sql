-- V437 — Cash Out Destination (Pyramakerz ERP / Supabase PostgreSQL)
-- Run once in Supabase SQL Editor BEFORE deploying V437 frontend/backend.
-- If SUPABASE_EXPENSES_TABLE is set to a custom table name, adjust public.expenses.
-- Existing expenses and Cash In/Settlement records remain valid (nullable columns).
-- Required for new Cash Out operations is enforced by server validation.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS destination_user_id text,
  ADD COLUMN IF NOT EXISTS destination_user_name text;

COMMENT ON COLUMN public.expenses.destination_user_id
  IS 'Selected destination team_members.id for a Cash Out expense.';
COMMENT ON COLUMN public.expenses.destination_user_name
  IS 'Destination name snapshot at expense creation time.';

CREATE INDEX IF NOT EXISTS expenses_destination_user_id_idx
  ON public.expenses (destination_user_id)
  WHERE destination_user_id IS NOT NULL;
