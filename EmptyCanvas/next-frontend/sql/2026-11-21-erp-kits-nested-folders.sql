-- ERP Pyramakerz - Kits nested folders (run once in Supabase SQL Editor)
-- Non-destructive: existing folders have NULL parent and remain at root.
-- Parent deletion promotes direct child folders to root (ON DELETE SET NULL).
-- Applies to the canonical public.product_kit_folders table.
BEGIN;

DO $migration$
DECLARE
  key_type text;
BEGIN
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO key_type
    FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = 'public.product_kit_folders'::regclass
     AND a.attname = 'id'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF key_type IS NULL THEN
    RAISE EXCEPTION 'Missing id column on public.product_kit_folders';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'product_kit_folders'
       AND column_name = 'parent_folder_id'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.product_kit_folders ADD COLUMN parent_folder_id %s',
      key_type
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.product_kit_folders'::regclass
       AND conname = 'product_kit_folders_parent_id_fk'
  ) THEN
    ALTER TABLE public.product_kit_folders
      ADD CONSTRAINT product_kit_folders_parent_id_fk
      FOREIGN KEY (parent_folder_id)
      REFERENCES public.product_kit_folders(id)
      ON DELETE SET NULL;
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_erp_product_kit_folders_parent
  ON public.product_kit_folders(parent_folder_id);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.product_kit_folders'::regclass
       AND conname = 'product_kit_folders_parent_not_self'
  ) THEN
    ALTER TABLE public.product_kit_folders
      ADD CONSTRAINT product_kit_folders_parent_not_self
        CHECK (parent_folder_id IS NULL OR parent_folder_id <> id);
  END IF;
END;
$guard$;

COMMIT;
