-- ERP Proposals nested folders - run ONCE on the self-hosted Supabase SQL Editor
-- Apply BEFORE deploying the corresponding Next.js changes.
-- Non-destructive: existing proposals stay at root (folder_id IS NULL).
-- Deleting a folder promotes its immediate subfolders AND proposals to root.
BEGIN;

CREATE TABLE IF NOT EXISTS public.product_proposal_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  parent_folder_id uuid,
  created_by text,
  created_by_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_folder_not_own_parent CHECK (parent_folder_id IS NULL OR parent_folder_id <> id),
  CONSTRAINT proposal_folder_parent_fk
    FOREIGN KEY (parent_folder_id) REFERENCES public.product_proposal_folders(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proposal_folders_parent
  ON public.product_proposal_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_proposal_folders_updated
  ON public.product_proposal_folders(updated_at DESC);

-- The table name is intentionally canonical (public.product_proposals);
-- custom SUPABASE_PRODUCT_PROPOSALS_TABLE deployments need an adapted migration.
ALTER TABLE public.product_proposals
  ADD COLUMN IF NOT EXISTS folder_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.product_proposals'::regclass
      AND conname = 'product_proposals_folder_fk'
  ) THEN
    ALTER TABLE public.product_proposals
      ADD CONSTRAINT product_proposals_folder_fk
      FOREIGN KEY (folder_id)
      REFERENCES public.product_proposal_folders(id)
      ON DELETE SET NULL;
  END IF;
END $migration$;

CREATE INDEX IF NOT EXISTS idx_product_proposals_folder_id
  ON public.product_proposals(folder_id);

COMMIT;

-- Do not execute uncontrolled browser access for these tables.
-- Server routes enforce the existing proposals.* permissions and owner/admin checks.
