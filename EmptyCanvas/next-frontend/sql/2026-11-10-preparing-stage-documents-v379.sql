-- Run after v375 and before deploying v379. Preserve existing closure records.
BEGIN;
-- Drop the original automatically named documents check (and only that check).
ALTER TABLE public.erp_preparing_project_stage_closures
  DROP CONSTRAINT IF EXISTS erp_preparing_project_stage_closures_documents_check;
ALTER TABLE public.erp_preparing_project_stage_closures
  ADD CONSTRAINT erp_preparing_project_stage_closures_documents_check
  CHECK (jsonb_typeof(documents) = 'array' AND jsonb_array_length(documents) >= 1);
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf']
WHERE id='preparing-stage-documents' AND public=false;
NOTIFY pgrst, 'reload schema';
COMMIT;
