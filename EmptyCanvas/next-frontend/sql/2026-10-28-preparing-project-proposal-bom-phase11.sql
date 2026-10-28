-- Phase 11: source Proposal at project creation + editable, independent Master Project BOM.
-- Additive migration. Retains warehouse vouchers, allocations and school manifests.
-- Run after phase 10 on a backed-up database. One transaction; never rerun phase 10.
BEGIN;
ALTER TABLE public.erp_preparing_projects
  ADD COLUMN IF NOT EXISTS source_proposal_id text,
  ADD COLUMN IF NOT EXISTS source_proposal_name text NOT NULL DEFAULT '';
ALTER TABLE public.erp_preparing_warehouse_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_bom_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  item_id uuid,
  operation text NOT NULL CHECK (operation IN ('add','update','delete')),
  before_row jsonb,
  after_row jsonb,
  changed_by_id text NOT NULL CHECK (length(changed_by_id)>0),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preparing_wh_bom_audit_project
  ON public.erp_preparing_warehouse_bom_audit(project_id,changed_at DESC);
ALTER TABLE public.erp_preparing_warehouse_bom_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_warehouse_bom_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_warehouse_bom_audit TO service_role;

-- Used by both creation and a one-time source attachment to an empty legacy project.
CREATE OR REPLACE FUNCTION public.erp_preparing_seed_project_bom(
  p_project_id uuid,p_items jsonb,p_member_id text
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; count_items integer; qty bigint; k text; name_text text; product_text text; created_id uuid;
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid Proposal components.'; END IF;
 count_items:=jsonb_array_length(p_items);
 IF count_items NOT BETWEEN 1 AND 1000 OR
    (SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(p_items) t(v))<>count_items
 THEN RAISE EXCEPTION 'Proposal BOM must contain 1-1000 unique components.'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   k:=entry->>'key';name_text:=btrim(coalesce(entry->>'name',''));
   product_text:=btrim(coalesce(entry->>'productId',''));
   IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR length(coalesce(k,'')) NOT BETWEEN 2 AND 700
      OR length(name_text) NOT BETWEEN 1 AND 500 OR length(product_text)>500
      OR coalesce(entry->>'qty','') !~ '^[0-9]{1,10}$'
   THEN RAISE EXCEPTION 'Invalid proposal component.'; END IF;
   qty:=(entry->>'qty')::bigint;
   IF qty NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'Invalid project component quantity.'; END IF;
   INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name,required_qty)
      VALUES(p_project_id,k,product_text,name_text,qty) RETURNING id INTO created_id;
   INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,after_row,changed_by_id)
      VALUES(p_project_id,created_id,'add',NULL,
        jsonb_build_object('product_id',product_text,'product_name',name_text,'required_qty',qty,'item_key',k),p_member_id);
 END LOOP;
 RETURN count_items;
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_create_project_with_bom(
 p_name text,p_description text,p_source_proposal_id text,p_source_proposal_name text,
 p_items jsonb,p_member_id text,p_member_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE output_id uuid; amount integer;
BEGIN
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 160
   OR length(coalesce(p_description,''))>1000 OR length(btrim(coalesce(p_source_proposal_id,'')))<1
   OR length(btrim(coalesce(p_source_proposal_name,'')))<1
   OR length(btrim(coalesce(p_member_id,'')))<1
 THEN RAISE EXCEPTION 'Project name, source Proposal and verified creator are required.'; END IF;
 INSERT INTO public.erp_preparing_projects
 (name,description,created_by_id,created_by_name,source_proposal_id,source_proposal_name)
 VALUES(btrim(p_name),coalesce(p_description,''),p_member_id,coalesce(p_member_name,''),
 btrim(p_source_proposal_id),btrim(p_source_proposal_name)) RETURNING id INTO output_id;
 amount:=public.erp_preparing_seed_project_bom(output_id,p_items,p_member_id);
 RETURN jsonb_build_object('projectId',output_id,'capturedComponents',amount);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_attach_project_proposal(
 p_project_id uuid,p_source_proposal_id text,p_source_proposal_name text,p_items jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE record public.erp_preparing_projects%ROWTYPE; amount integer;
BEGIN
 SELECT * INTO record FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project does not exist.'; END IF;
 IF record.source_proposal_id IS NOT NULL THEN RAISE EXCEPTION 'This project already has a source Proposal.'; END IF;
 IF length(btrim(coalesce(p_source_proposal_id,'')))<1 OR length(btrim(coalesce(p_source_proposal_name,'')))<1
   OR length(btrim(coalesce(p_member_id,'')))<1 THEN RAISE EXCEPTION 'Select a valid source Proposal.'; END IF;
 IF EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id)
   OR EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_receipts WHERE project_id=p_project_id)
   OR EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_allocations WHERE project_id=p_project_id)
   OR EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_demands WHERE project_id=p_project_id)
 THEN RAISE EXCEPTION 'Project warehouse already contains a BOM or movements. Edit its existing components instead.'; END IF;
 amount:=public.erp_preparing_seed_project_bom(p_project_id,p_items,p_member_id);
 UPDATE public.erp_preparing_projects SET source_proposal_id=p_source_proposal_id,
   source_proposal_name=p_source_proposal_name,updated_at=now() WHERE id=p_project_id;
 RETURN jsonb_build_object('projectId',p_project_id,'capturedComponents',amount);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_edit_project_bom(
 p_project_id uuid,p_action text,p_item_id uuid,p_product_id text,p_product_name text,
 p_required_qty bigint,p_expected_updated_at timestamptz,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_row public.erp_preparing_warehouse_items%ROWTYPE; result_row public.erp_preparing_warehouse_items%ROWTYPE;
  k text; normalized_name text; normalized_code text; reserved bigint; history_exists boolean;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF p_action NOT IN ('add','update','delete') OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Invalid BOM action.'; END IF;
 IF p_action<>'add' THEN
   SELECT * INTO old_row FROM public.erp_preparing_warehouse_items
     WHERE project_id=p_project_id AND id=p_item_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Component not found.'; END IF;
   IF p_expected_updated_at IS NULL OR old_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Component has changed. Refresh before saving.';
   END IF;
 END IF;
 IF p_action<>'delete' THEN
   normalized_code:=btrim(coalesce(p_product_id,''));
   normalized_name:=btrim(coalesce(p_product_name,''));
   IF length(normalized_code)>500 OR length(normalized_name) NOT BETWEEN 1 AND 500
      OR p_required_qty IS NULL OR p_required_qty NOT BETWEEN 0 AND 1000000000
   THEN RAISE EXCEPTION 'Invalid component or planned quantity.'; END IF;
   k:=CASE WHEN length(normalized_code)>0 THEN 'id:'||lower(normalized_code)
     ELSE 'name:'||lower(regexp_replace(normalized_name,'\s+',' ','g')) END;
   IF length(k)>700 THEN RAISE EXCEPTION 'Component code is too long.'; END IF;
 END IF;
 IF p_action='add' THEN
   IF (SELECT count(*) FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id)>=5000
    THEN RAISE EXCEPTION 'Maximum of 5000 project components.'; END IF;
   INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name,required_qty)
     VALUES(p_project_id,k,normalized_code,normalized_name,p_required_qty) RETURNING * INTO result_row;
   INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,after_row,changed_by_id)
    VALUES(p_project_id,result_row.id,'add',to_jsonb(result_row),p_member_id);
   RETURN to_jsonb(result_row);
 END IF;
 SELECT EXISTS(
   SELECT 1 FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=old_row.id
   UNION ALL SELECT 1 FROM public.erp_preparing_warehouse_allocations WHERE item_id=old_row.id
   UNION ALL SELECT 1 FROM public.erp_preparing_warehouse_demands WHERE item_id=old_row.id
 ) INTO history_exists;
 IF p_action='delete' THEN
   IF history_exists THEN RAISE EXCEPTION 'Cannot delete a component referenced by a receipt, allocation or school requirement.'; END IF;
   INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,changed_by_id)
     VALUES(p_project_id,old_row.id,'delete',to_jsonb(old_row),p_member_id);
   DELETE FROM public.erp_preparing_warehouse_items WHERE id=old_row.id;
   RETURN jsonb_build_object('deleted',true,'itemId',old_row.id);
 END IF;
 IF history_exists AND (normalized_code IS DISTINCT FROM old_row.product_id OR k IS DISTINCT FROM old_row.item_key
   OR normalized_name IS DISTINCT FROM old_row.product_name) THEN
   RAISE EXCEPTION 'Component identity is locked after warehouse or school activity. Change quantity only.';
 END IF;
 SELECT coalesce(sum(delta_qty),0) INTO reserved FROM public.erp_preparing_warehouse_allocations WHERE item_id=old_row.id;
 IF p_required_qty<reserved THEN RAISE EXCEPTION 'Required quantity cannot be less than quantity already allocated to schools.'; END IF;
 UPDATE public.erp_preparing_warehouse_items
   SET product_id=normalized_code,product_name=normalized_name,item_key=k,required_qty=p_required_qty,updated_at=now()
   WHERE id=old_row.id RETURNING * INTO result_row;
 INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,after_row,changed_by_id)
   VALUES(p_project_id,old_row.id,'update',to_jsonb(old_row),to_jsonb(result_row),p_member_id);
 RETURN to_jsonb(result_row);
END; $$;

-- Phase 10 capture remains usable for school-specific allocation limits, but a
-- selected project Proposal is authoritative for the project's total quantities.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_capture(
 p_project_id uuid,p_schools jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s jsonb; c jsonb; school_rec public.erp_preparing_schools%ROWTYPE; target uuid;
 created_count integer:=0; qty integer; key_text text;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR jsonb_typeof(p_schools) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_schools) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid project BOM payload.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_schools) LOOP
   IF jsonb_typeof(s) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid school record.'; END IF;
   SELECT * INTO school_rec FROM public.erp_preparing_schools
    WHERE id=(s->>'schoolId')::uuid AND project_id=p_project_id FOR UPDATE;
   IF NOT FOUND OR school_rec.proposal_id IS DISTINCT FROM (s->>'proposalId') THEN
     RAISE EXCEPTION 'School or proposal changed. Refresh and retry.';
   END IF;
   IF EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_demands WHERE school_id=school_rec.id) THEN CONTINUE; END IF;
   IF jsonb_typeof(s->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'items') NOT BETWEEN 1 AND 1000
     THEN RAISE EXCEPTION 'Each school requires 1-1000 proposal components.'; END IF;
   IF (SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(s->'items') AS t(v)) <> jsonb_array_length(s->'items')
     THEN RAISE EXCEPTION 'Duplicate component in a school BOM.'; END IF;
   FOR c IN SELECT value FROM jsonb_array_elements(s->'items') LOOP
     key_text := c->>'key';
     IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR length(coalesce(key_text,'')) NOT BETWEEN 2 AND 700
       OR length(coalesce(c->>'name','')) NOT BETWEEN 1 AND 500
       OR length(coalesce(c->>'productId',''))>500 OR (c->>'qty') !~ '^[0-9]{1,7}$'
       THEN RAISE EXCEPTION 'Invalid source component.'; END IF;
     qty := (c->>'qty')::integer;
     IF qty NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Invalid source quantity.'; END IF;
     INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name)
       VALUES(p_project_id,key_text,coalesce(c->>'productId',''),c->>'name')
       ON CONFLICT(project_id,item_key) DO NOTHING;
     SELECT id INTO target FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND item_key=key_text;
     INSERT INTO public.erp_preparing_warehouse_demands(project_id,school_id,item_id,required_qty)
       VALUES(p_project_id,school_rec.id,target,qty);
   END LOOP;
   created_count:=created_count+1;
 END LOOP;
 -- Legacy projects still derive demand from captured schools. Projects with an
 -- explicit project Proposal NEVER overwrite their independently edited Master BOM.
 IF NOT EXISTS (SELECT 1 FROM public.erp_preparing_projects
                WHERE id=p_project_id AND source_proposal_id IS NOT NULL) THEN
 UPDATE public.erp_preparing_warehouse_items i SET required_qty=tot.qty FROM (
   SELECT item_id,sum(required_qty) AS qty FROM public.erp_preparing_warehouse_demands
   WHERE project_id=p_project_id GROUP BY item_id
 ) tot WHERE i.id=tot.item_id AND i.project_id=p_project_id;
 END IF;
 RETURN jsonb_build_object('schoolsCaptured',created_count);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_seed_project_bom(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_create_project_with_bom(text,text,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_attach_project_proposal(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_edit_project_bom(uuid,text,uuid,text,text,bigint,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_capture(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_seed_project_bom(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_create_project_with_bom(text,text,text,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_attach_project_proposal(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_edit_project_bom(uuid,text,uuid,text,text,bigint,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_capture(uuid,jsonb,text) TO service_role;
COMMIT;
