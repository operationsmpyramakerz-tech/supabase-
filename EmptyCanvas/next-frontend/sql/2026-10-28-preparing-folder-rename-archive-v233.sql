-- Projects Preparing v233: non-destructive folder deletion (archiving).
-- IMPORTANT: Apply after phase 12; back up production first. No child rows are deleted.
BEGIN;
ALTER TABLE public.erp_preparing_projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_id text;
CREATE INDEX IF NOT EXISTS idx_erp_preparing_projects_active
  ON public.erp_preparing_projects (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_actions_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id),
  action text NOT NULL CHECK (action IN ('rename','archive')),
  previous_name text NOT NULL,
  new_name text,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_preparing_project_actions_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_project_actions_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.erp_preparing_project_actions_audit TO service_role;

CREATE OR REPLACE FUNCTION public.erp_preparing_rename_project(
  p_project_id uuid, p_expected_name text, p_new_name text, p_member_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.erp_preparing_projects%ROWTYPE; new_name text;
BEGIN
  new_name := btrim(coalesce(p_new_name,''));
  IF char_length(new_name) NOT BETWEEN 2 AND 160 OR
     nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid project rename.';
  END IF;
  SELECT * INTO target FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Project not found.'; END IF;
  IF target.name IS DISTINCT FROM p_expected_name THEN
    RAISE EXCEPTION 'Project name changed. Refresh and retry.';
  END IF;
  IF target.name = new_name THEN RETURN to_jsonb(target); END IF;
  UPDATE public.erp_preparing_projects SET name=new_name,updated_at=now()
    WHERE id=p_project_id;
  INSERT INTO public.erp_preparing_project_actions_audit
    (project_id,action,previous_name,new_name,changed_by_id)
    VALUES (p_project_id,'rename',target.name,new_name,p_member_id);
  RETURN jsonb_build_object('id',p_project_id,'name',new_name);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_preparing_rename_project(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_rename_project(uuid,text,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.erp_preparing_archive_project(
  p_project_id uuid, p_expected_name text, p_member_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.erp_preparing_projects%ROWTYPE;
BEGIN
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Verified operator required.';
  END IF;
  SELECT * INTO target FROM public.erp_preparing_projects
  WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Project not found or already deleted.';
  END IF;
  IF target.name IS DISTINCT FROM p_expected_name THEN
    RAISE EXCEPTION 'Project name changed. Refresh and confirm again.';
  END IF;
  UPDATE public.erp_preparing_projects
    SET deleted_at=now(),deleted_by_id=p_member_id,updated_at=now()
    WHERE id=p_project_id;
  INSERT INTO public.erp_preparing_project_actions_audit
    (project_id,action,previous_name,new_name,changed_by_id)
    VALUES (p_project_id,'archive',target.name,NULL,p_member_id);
  RETURN jsonb_build_object('id',p_project_id,'archived',true);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_preparing_archive_project(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_archive_project(uuid,text,text)
  TO service_role;
COMMIT;
