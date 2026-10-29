-- v249: auditable Box Distribution edits without rewriting historical cartons.
-- Requires v247 and the existing Project Cartons Phase 7 migration.
-- No existing carton quantities or audits are rewritten.
BEGIN;
ALTER TABLE public.erp_preparing_project_carton_audit
 ADD COLUMN IF NOT EXISTS changed_by_name text;

CREATE OR REPLACE FUNCTION public.erp_preparing_production_pack_v249(
 p_project_id uuid,p_carton_id uuid,p_source_component_id uuid,p_item_id uuid,
 p_quantity integer,p_expected_updated_at text,p_member_id text,p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item public.erp_preparing_warehouse_items%ROWTYPE;
 source_item public.erp_preparing_components%ROWTYPE;
 result jsonb;
 audit_id bigint;
BEGIN
 IF p_actor_name IS NULL OR length(btrim(p_actor_name)) NOT BETWEEN 1 AND 160
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Verified Production user required.'; END IF;
 -- Reuse carton RPC's project lock, version check, draft/Kit validation and audit write.
 -- Validate selected master component before delegating to the existing carton RPC.
 SELECT * INTO item FROM public.erp_preparing_warehouse_items
 WHERE project_id=p_project_id AND id=p_item_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project master component not found.'; END IF;
 SELECT * INTO source_item FROM public.erp_preparing_components
 WHERE id=p_source_component_id;
 IF NOT FOUND OR lower(btrim(source_item.product_id))<>lower(btrim(item.product_id))
    OR lower(btrim(source_item.product_name))<>lower(btrim(item.product_name))
 THEN RAISE EXCEPTION 'Selected school component does not match the project master item.'; END IF;
 result := public.erp_preparing_set_project_carton_line(
  p_project_id,p_carton_id,p_source_component_id,p_quantity,p_expected_updated_at,p_member_id
 );
 -- Never reduce a line below quantities already allocated to schools.
 IF (SELECT coalesce(sum(a.allocated_qty),0)
     FROM public.erp_preparing_project_allocations a
     JOIN public.erp_preparing_project_carton_lines l ON l.id=a.carton_line_id
     WHERE l.project_id=p_project_id AND l.carton_id=p_carton_id
       AND lower(btrim(l.product_id))=lower(btrim(item.product_id))
       AND lower(btrim(l.product_name))=lower(btrim(item.product_name))
       AND a.status='active') > p_quantity
 THEN RAISE EXCEPTION 'Cannot unpack units already allocated to a school.'; END IF;
 -- Project row lock in delegated RPC serializes modifications within this project.
 SELECT id INTO audit_id FROM public.erp_preparing_project_carton_audit
 WHERE project_id=p_project_id AND carton_id=p_carton_id
   AND action='set_line' AND changed_by_id=p_member_id
 ORDER BY id DESC LIMIT 1;
 IF audit_id IS NULL THEN RAISE EXCEPTION 'Carton movement audit not recorded.'; END IF;
 UPDATE public.erp_preparing_project_carton_audit
 SET changed_by_name=btrim(p_actor_name) WHERE id=audit_id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_production_pack_v249(uuid,uuid,uuid,uuid,integer,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_production_pack_v249(uuid,uuid,uuid,uuid,integer,text,text,text)
 TO service_role;
COMMIT;
