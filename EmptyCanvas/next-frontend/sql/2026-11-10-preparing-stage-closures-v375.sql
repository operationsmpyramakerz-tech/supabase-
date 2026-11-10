-- Additive migration. Run before deploying v375. No existing project data is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_project_stage_closures (
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
  stage_key text NOT NULL CHECK (stage_key IN ('testing','warehouse','production','boxes','cartons')),
  closed_by_id text NOT NULL CHECK (length(btrim(closed_by_id)) > 0),
  closed_by_name text NOT NULL CHECK (length(btrim(closed_by_name)) BETWEEN 1 AND 160),
  closed_at timestamptz NOT NULL DEFAULT now(),
  documents jsonb NOT NULL CHECK (jsonb_typeof(documents) = 'array' AND jsonb_array_length(documents) BETWEEN 1 AND 10),
  PRIMARY KEY (project_id, stage_key)
);
ALTER TABLE public.erp_preparing_project_stage_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_project_stage_closures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.erp_preparing_project_stage_closures TO service_role;
-- A separate private bucket; no public or authenticated storage policies are added.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('preparing-stage-documents','preparing-stage-documents',false,3670016,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
