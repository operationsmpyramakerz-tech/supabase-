-- Phase 2N6 - NEW uploads only. Run in Supabase SQL Editor after a database backup.
-- Keep this ID in sync with ERP_STORAGE_PRIVATE_BUCKET on the server.
-- This script does not copy, delete or change any existing public objects.
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('erp-private-files', 'erp-private-files', false, 15728640)
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'erp-private-files' AND public IS FALSE
  ) THEN
    RAISE EXCEPTION 'ERP private bucket is absent or public; manual investigation required';
  END IF;
END $$;
COMMIT;

-- Inspection only. Legacy objects are deliberately left untouched.
SELECT id, name, public, file_size_limit
FROM storage.buckets WHERE id = 'erp-private-files';

-- Optional: replace operations-files if your legacy SUPABASE_STORAGE_BUCKET differs.
SELECT bucket_id, split_part(name, '/', 1) AS path_group, COUNT(*) AS objects_count
FROM storage.objects
WHERE bucket_id IN ('operations-files', 'erp-private-files')
GROUP BY bucket_id, split_part(name, '/', 1)
ORDER BY bucket_id, path_group;
