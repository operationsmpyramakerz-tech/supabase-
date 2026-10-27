-- Pyramakerz ERP | Phase 2A | Explicit feature grants
-- Run ONCE in the Supabase SQL Editor before setting
-- ERP_ADVANCED_PERMISSIONS_ENABLED=1 on the Next.js server.
-- IMPORTANT: existing team_member_page_access rows are NOT changed.
-- No member is activated automatically. Existing behavior remains until an
-- authorized manager saves an Advanced feature profile for that member.

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_member_feature_profiles (
  team_member_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.erp_member_feature_grants (
  team_member_id text NOT NULL REFERENCES public.erp_member_feature_profiles(team_member_id) ON DELETE CASCADE,
  permission_key text NOT NULL CHECK (permission_key ~ '^[a-z][a-z0-9_.]{2,99}$'),
  is_allowed boolean NOT NULL DEFAULT false,
  data_scope text NOT NULL DEFAULT 'all' CHECK (data_scope IN ('own','assigned','team','all')),
  PRIMARY KEY (team_member_id, permission_key)
);
CREATE INDEX IF NOT EXISTS erp_member_feature_grants_member_idx
  ON public.erp_member_feature_grants (team_member_id);

ALTER TABLE public.erp_member_feature_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_member_feature_grants ENABLE ROW LEVEL SECURITY;

-- No public/client policies: only service-role backend may manage these tables.
REVOKE ALL ON public.erp_member_feature_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.erp_member_feature_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_member_feature_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_member_feature_grants TO service_role;

CREATE OR REPLACE FUNCTION public.erp_replace_member_feature_grants(
  p_member_id text,
  p_grants jsonb DEFAULT '[]'::jsonb,
  p_enabled boolean DEFAULT true
) RETURNS TABLE(version bigint, enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_key text;
  v_scope text;
  v_rows integer;
BEGIN
  IF p_member_id IS NULL OR btrim(p_member_id) = '' OR length(p_member_id) > 128 THEN
    RAISE EXCEPTION 'Invalid member ID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_grants) <> 'array' OR jsonb_array_length(p_grants) > 250 THEN
    RAISE EXCEPTION 'Invalid grants list' USING ERRCODE = '22023';
  END IF;

  -- Serializes simultaneous saves to the same member and increments the version
  -- atomically. A failed insert rolls back the old grants and profile update.
  INSERT INTO public.erp_member_feature_profiles(team_member_id, enabled, version)
  VALUES (p_member_id, coalesce(p_enabled, false), 1)
  ON CONFLICT (team_member_id) DO UPDATE SET
    enabled = excluded.enabled,
    version = public.erp_member_feature_profiles.version + 1,
    updated_at = now();

  DELETE FROM public.erp_member_feature_grants WHERE team_member_id = p_member_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_grants) LOOP
    v_key := item->>'key';
    v_scope := coalesce(nullif(item->>'scope', ''), 'all');
    IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_.]{2,99}$'
       OR v_scope NOT IN ('own','assigned','team','all')
       OR jsonb_typeof(item->'allowed') <> 'boolean' THEN
      RAISE EXCEPTION 'Invalid feature grant' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.erp_member_feature_grants (team_member_id, permission_key, is_allowed, data_scope)
    VALUES (p_member_id, v_key, (item->>'allowed')::boolean, v_scope);
  END LOOP;

  RETURN QUERY SELECT p.version, p.enabled FROM public.erp_member_feature_profiles p
    WHERE p.team_member_id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_replace_member_feature_grants(text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_replace_member_feature_grants(text,jsonb,boolean) TO service_role;

COMMIT;

-- Safe rollback before enabling any user:
-- DROP FUNCTION public.erp_replace_member_feature_grants(text,jsonb,boolean);
-- DROP TABLE public.erp_member_feature_grants;
-- DROP TABLE public.erp_member_feature_profiles;
-- Do NOT run this rollback if you intend to preserve configured grants.
