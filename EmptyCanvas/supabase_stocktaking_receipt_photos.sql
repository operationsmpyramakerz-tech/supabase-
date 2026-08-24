-- Stocktaking receipt metadata migration
-- Run once in the Supabase SQL Editor for the ERP database.
--
-- receipt_number already exists in the current table, but IF NOT EXISTS keeps
-- this migration safe for other/self-hosted environments using the same ERP.

begin;

alter table public.stocktaking
  add column if not exists receipt_number text;

alter table public.stocktaking
  add column if not exists receipt_photos text;

comment on column public.stocktaking.receipt_photos is
  'JSON text containing receipt image objects ({name,url}) uploaded by Send to stock.';

commit;

-- Ask PostgREST/Supabase REST to refresh its schema cache immediately.
notify pgrst, 'reload schema';
