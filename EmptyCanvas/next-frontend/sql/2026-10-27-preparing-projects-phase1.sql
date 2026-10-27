-- Preparing Projects / phase 1. Safe additive migration: does not alter existing orders, proposals or members.
-- Run ONCE in Supabase SQL Editor, using a privileged account, BEFORE deploying the matching code.
-- Tables are server-only: RLS is enabled without client access policies. Server routes require the service role.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.erp_preparing_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '',
  created_by_id text NOT NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  beneficiary_id text NOT NULL,
  beneficiary_name text NOT NULL,
  school_label text NOT NULL DEFAULT '',
  proposal_id text NOT NULL,
  proposal_name text NOT NULL,
  created_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,beneficiary_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_schools_project ON public.erp_preparing_schools(project_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_stage_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key IN ('receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing','final_closing')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','blocked','completed')),
  notes text NOT NULL DEFAULT '',
  updated_by_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(school_id,stage_key)
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_stage_school ON public.erp_preparing_stage_progress(school_id);
ALTER TABLE public.erp_preparing_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_stage_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_projects, public.erp_preparing_schools, public.erp_preparing_stage_progress FROM anon, authenticated;
-- All stage transitions are serialized per school to preserve order even under concurrent requests.
CREATE OR REPLACE FUNCTION public.erp_preparing_save_stage(
  p_school_id uuid, p_stage_key text, p_status text, p_notes text, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  keys text[] := ARRAY['receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing','final_closing'];
  current_position integer;
  complete_before integer;
  completed_later boolean;
  output_row public.erp_preparing_stage_progress%ROWTYPE;
BEGIN
  SELECT array_position(keys,p_stage_key) INTO current_position;
  IF current_position IS NULL OR p_status NOT IN ('not_started','in_progress','blocked','completed')
     OR length(coalesce(p_notes,'')) > 2000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid stage transition.';
  END IF;
  -- Lock the parent to prevent competing stage changes racing with this validation.
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF p_status='completed' THEN
    SELECT count(*) INTO complete_before FROM public.erp_preparing_stage_progress
    WHERE school_id=p_school_id AND status='completed'
      AND array_position(keys,stage_key) < current_position;
    IF complete_before <> current_position - 1 THEN
      RAISE EXCEPTION 'Complete the preceding stages first.';
    END IF;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.erp_preparing_stage_progress
      WHERE school_id=p_school_id AND status='completed'
      AND array_position(keys,stage_key) > current_position) INTO completed_later;
    IF completed_later THEN
      RAISE EXCEPTION 'Cannot reopen a stage while later stages are completed.';
    END IF;
  END IF;
  INSERT INTO public.erp_preparing_stage_progress
    (school_id,stage_key,status,notes,updated_by_id,updated_at,completed_at)
  VALUES (p_school_id,p_stage_key,p_status,coalesce(p_notes,''),p_member_id,now(),
    CASE WHEN p_status='completed' THEN now() ELSE NULL END)
  ON CONFLICT (school_id,stage_key)
  DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_by_id=excluded.updated_by_id,
    updated_at=now(),completed_at=excluded.completed_at
  RETURNING * INTO output_row;
  RETURN to_jsonb(output_row);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) TO service_role;
-- The standalone page participates in Users Center > Page Access.
INSERT INTO public.app_pages (page_key,page_name,route_path,module_name,sort_order,is_active,is_assignable,visible_in_sidebar)
SELECT 'projects-preparing','Projects Preparing','/next/projects-preparing','Operations',46,true,true,true
WHERE NOT EXISTS (SELECT 1 FROM public.app_pages WHERE page_key='projects-preparing');
COMMIT;
-- Following migration: grant "Projects Preparing" Page Access from Users Center.
-- For enabled advanced permission profiles also grant preparing.view/create/manage/stage_update as needed.
