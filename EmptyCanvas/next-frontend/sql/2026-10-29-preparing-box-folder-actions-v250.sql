-- v250: rename and soft-delete project Kit boxes; preserve movement history and school allocations.
-- Depends on phase7 carton schema and v249 box audit. Apply before deploying v250.
BEGIN;
ALTER TABLE public.erp_preparing_project_carton_audit
 DROP CONSTRAINT IF EXISTS erp_preparing_project_carton_audit_action_check;
ALTER TABLE public.erp_preparing_project_carton_audit
 ADD CONSTRAINT erp_preparing_project_carton_audit_action_check
 CHECK (action IN ('create','set_line','seal','allocate','reverse','cancel','rename'));

CREATE OR REPLACE FUNCTION public.erp_preparing_rename_project_carton_v250(
 p_project_id uuid,p_carton_id uuid,p_new_label text,p_expected_updated_at text,p_member_id text,p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE box_row public.erp_preparing_project_cartons%ROWTYPE;
 new_label text:=btrim(coalesce(p_new_label,''));
 old_label text;
BEGIN
 -- Lock the project first: serializes this change with packing, sealing and allocations.
 PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 SELECT * INTO box_row FROM public.erp_preparing_project_cartons
 WHERE id=p_carton_id AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Box not found.'; END IF;
 IF box_row.status<>'draft' THEN RAISE EXCEPTION 'Only Draft boxes may be renamed.'; END IF;
 IF p_expected_updated_at IS NULL OR box_row.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
 THEN RAISE EXCEPTION 'Box changed. Refresh and retry.'; END IF;
 IF char_length(new_label) NOT BETWEEN 2 AND 100 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR char_length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160
 THEN RAISE EXCEPTION 'Invalid box name or user.'; END IF;
 IF new_label=box_row.carton_label THEN RETURN to_jsonb(box_row); END IF;
 old_label:=box_row.carton_label;
 UPDATE public.erp_preparing_project_cartons
 SET carton_label=new_label,updated_by_id=p_member_id,updated_at=clock_timestamp()
 WHERE id=p_carton_id RETURNING * INTO box_row;
 INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,action,details,changed_by_id,changed_by_name)
 VALUES(p_project_id,p_carton_id,'rename',jsonb_build_object('old_label',old_label, 'new_label',new_label),p_member_id,btrim(p_actor_name));
 RETURN to_jsonb(box_row);
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_rename_project_carton_v250(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_rename_project_carton_v250(uuid,uuid,text,text,text,text) TO service_role;
COMMIT;
