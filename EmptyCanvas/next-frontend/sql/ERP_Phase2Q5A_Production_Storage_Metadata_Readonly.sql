-- ERP Phase 2Q5A (Production-only): Supabase Storage metadata inspection.
-- READ ONLY: catalog/bucket metadata only; no object listing, downloads,
-- RLS policy definitions, access tokens, user/employee data or SQL writes.
-- Run in Supabase SQL Editor using an authorized administrator account.
-- Never use this report as proof that public legacy file URLs were migrated.
-- A public bucket can be intentional (e.g. public product images); REVIEW it.

WITH snapshot AS (
  SELECT
    '01 bucket'::text AS section,
    b.name::text AS item,
    CASE WHEN b.public THEN 'public=true' ELSE 'public=false' END::text AS observed,
    CASE WHEN b.public THEN 'REVIEW' ELSE 'PRIVATE' END::text AS finding,
    CASE WHEN b.public
      THEN 'Confirm all objects in this bucket are intentionally public; UI permissions cannot protect a public URL.'
      ELSE 'Compare this bucket name with ERP_STORAGE_PRIVATE_BUCKET; check direct file routes and record grants separately.'
    END::text AS action
  FROM storage.buckets AS b

  UNION ALL

  SELECT
    '02 bucket size limit'::text, b.name::text,
    COALESCE(b.file_size_limit::text, 'not-set')::text,
    'INFO'::text,
    'Metadata only; a bucket size limit is not a replacement for application upload validation.'::text
  FROM storage.buckets AS b

  UNION ALL

  SELECT
    '03 table RLS'::text,
    (n.nspname || '.' || c.relname)::text,
    ('enabled=' || c.relrowsecurity::text || '; forced=' || c.relforcerowsecurity::text)::text,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'REVIEW' END::text,
    'Storage table RLS is only one control; review grants and policies independently.'::text
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname IN ('objects', 'buckets')
    AND c.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    '04 RLS policy'::text,
    (p.tablename || '.' || p.policyname)::text,
    ('command=' || p.cmd || '; roles=' || array_to_string(p.roles, ','))::text,
    'REVIEW'::text,
    'Only policy names/roles are shown; this report does NOT verify policy predicates or object-level authorization.'::text
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname = 'storage' AND p.tablename IN ('objects', 'buckets')

  UNION ALL

  SELECT
    '05 policy count'::text,
    'storage.objects'::text,
    COUNT(*)::text,
    'INFO'::text,
    'A count of zero may be valid for service-role-only access; evaluate real read/write paths separately.'::text
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname = 'storage' AND p.tablename = 'objects'

  UNION ALL

  SELECT
    '06 environment cross-check'::text,
    'ERP_STORAGE_PRIVATE_BUCKET'::text,
    'not available from SQL'::text,
    'MANUAL'::text,
    'Compare the private bucket name to the server environment locally; NEVER paste its signing secrets or service-role keys into SQL.'::text
)
SELECT section, item, observed, finding, action
FROM snapshot
ORDER BY section, item;
