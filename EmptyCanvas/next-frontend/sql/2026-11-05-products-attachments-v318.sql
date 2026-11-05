-- v318: Store multiple Product URL file uploads without altering existing links.
-- Run once in Supabase SQL Editor BEFORE deploying v318.
-- No existing products or URL values are changed.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Optional safety check applies to new and changed rows only.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_attachments_is_array_v318'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_attachments_is_array_v318
      CHECK (jsonb_typeof(attachments) = 'array') NOT VALID;
  END IF;
END $$;
