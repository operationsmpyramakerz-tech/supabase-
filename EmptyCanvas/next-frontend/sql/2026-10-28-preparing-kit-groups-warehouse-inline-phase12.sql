-- Phase 12 / v230. Additive kit snapshots and group-specific BOM editing.
-- Existing warehouse receipts and signed documents remain append-only.
-- Apply AFTER Phase 11, backed up, before deploying v230 UI.
BEGIN;
ALTER TABLE public.erp_preparing_warehouse_items
  ADD COLUMN IF NOT EXISTS source_kits jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_kit_groups (
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
 kit_key text NOT NULL,
 kit_id text NOT NULL DEFAULT '',
 kit_name text NOT NULL CHECK (length(kit_name) BETWEEN 1 AND 160),
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,kit_key)
);
ALTER TABLE public.erp_preparing_project_kit_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_project_kit_groups FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_project_kit_groups TO service_role;

CREATE OR REPLACE FUNCTION public.erp_preparing_validate_kit_sources(p_sources jsonb,p_total bigint)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE source jsonb; result jsonb:='[]'::jsonb; seen text[]:=ARRAY[]::text[];
  kit_id text; kit_name text; kit_key text; q bigint; quantity_sum bigint:=0;
BEGIN
 IF p_total IS NULL OR p_total NOT BETWEEN 0 AND 1000000000
    OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_sources)>80 THEN RAISE EXCEPTION 'Invalid project Kit quantities.'; END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  kit_id:=btrim(coalesce(source->>'kitId',''));
  kit_name:=btrim(coalesce(source->>'kitName',''));
  IF jsonb_typeof(source) IS DISTINCT FROM 'object' OR length(kit_id)>160
   OR length(kit_name) NOT BETWEEN 1 AND 160
   OR coalesce(source->>'quantity','') !~ '^[0-9]{1,10}$'
  THEN RAISE EXCEPTION 'Invalid Kit entry.'; END IF;
  q:=(source->>'quantity')::bigint;
  IF q NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'Kit quantity must be positive.'; END IF;
  kit_key:=CASE WHEN kit_id<>'' THEN 'id:'||lower(kit_id) ELSE 'name:'||lower(kit_name) END;
  IF kit_key=ANY(seen) THEN RAISE EXCEPTION 'Duplicate Kit for one component.'; END IF;
  seen:=array_append(seen,kit_key);quantity_sum:=quantity_sum+q;
  result:=result||jsonb_build_array(jsonb_build_object('kitId',kit_id,'kitName',kit_name,'quantity',q,'order',jsonb_array_length(result)));
 END LOOP;
 IF quantity_sum<>p_total THEN RAISE EXCEPTION 'Kit quantities must equal the project required quantity.'; END IF;
 RETURN result;
END; $$;

-- Same public signature as v229: new projects capture the source Kit split atomically.
CREATE OR REPLACE FUNCTION public.erp_preparing_seed_project_bom(
 p_project_id uuid,p_items jsonb,p_member_id text
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; count_items integer; qty bigint; k text; name_text text; product_text text;
 created_id uuid; kit_sources jsonb;
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
   kit_sources:=public.erp_preparing_validate_kit_sources(
     coalesce(entry->'sourceKits',jsonb_build_array(jsonb_build_object(
       'kitId','','kitName','Direct components','quantity',qty))),qty);
   INSERT INTO public.erp_preparing_project_kit_groups(project_id,kit_key,kit_id,kit_name,sort_order)
     SELECT p_project_id,
       CASE WHEN coalesce(source->>'kitId','')<>'' THEN 'id:'||lower(source->>'kitId')
            ELSE 'name:'||lower(source->>'kitName') END,
       coalesce(source->>'kitId',''),source->>'kitName',(source->>'order')::integer
     FROM jsonb_array_elements(kit_sources) AS t(source)
     ON CONFLICT(project_id,kit_key) DO NOTHING;
   INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name,required_qty,source_kits)
     VALUES(p_project_id,k,product_text,name_text,qty,kit_sources) RETURNING id INTO created_id;
   INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,after_row,changed_by_id)
     VALUES(p_project_id,created_id,'add',jsonb_build_object('product_id',product_text,
       'product_name',name_text,'required_qty',qty,'item_key',k,'source_kits',kit_sources),p_member_id);
 END LOOP;
 RETURN count_items;
END; $$;

-- One-time safe backfill for projects already created under Phase 11.
-- Does NOT rewrite required_qty, receipts or allocations; manually changed quantities
-- fall into Project adjustments rather than presenting inaccurate Kit quantities.
CREATE OR REPLACE FUNCTION public.erp_preparing_initialize_project_kits(
 p_project_id uuid,p_items jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.erp_preparing_warehouse_items%ROWTYPE; proposal_entry jsonb;
   sources jsonb; updated_count integer:=0; planned bigint; snapshot_qty bigint;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF coalesce(btrim(p_member_id),'')='' OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid Kit sync request.'; END IF;
 IF EXISTS (SELECT 1 FROM public.erp_preparing_warehouse_items
   WHERE project_id=p_project_id AND source_kits<>'[]'::jsonb)
 THEN RAISE EXCEPTION 'Kit groups already exist. Refresh the project.'; END IF;
 IF (SELECT count(*) FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id)=0
 THEN RAISE EXCEPTION 'Project has no Master BOM.'; END IF;
 FOR existing IN SELECT * FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id FOR UPDATE LOOP
   SELECT v INTO proposal_entry FROM jsonb_array_elements(p_items) t(v)
      WHERE v->>'key'=existing.item_key LIMIT 1;
   planned:=existing.required_qty;
   IF planned=0 THEN sources:='[]'::jsonb;
   ELSIF proposal_entry IS NOT NULL AND coalesce(proposal_entry->>'qty','') ~ '^[0-9]{1,10}$'
     AND (proposal_entry->>'qty')::bigint=planned THEN
     sources:=public.erp_preparing_validate_kit_sources(coalesce(proposal_entry->'sourceKits',
       jsonb_build_array(jsonb_build_object('kitId','','kitName','Direct components','quantity',planned))),planned);
   ELSE
     sources:=public.erp_preparing_validate_kit_sources(jsonb_build_array(jsonb_build_object(
       'kitId','','kitName','Project adjustments','quantity',planned)),planned);
   END IF;
   INSERT INTO public.erp_preparing_project_kit_groups(project_id,kit_key,kit_id,kit_name,sort_order)
     SELECT p_project_id,
       CASE WHEN coalesce(source->>'kitId','')<>'' THEN 'id:'||lower(source->>'kitId')
            ELSE 'name:'||lower(source->>'kitName') END,
       coalesce(source->>'kitId',''),source->>'kitName',(source->>'order')::integer
     FROM jsonb_array_elements(sources) AS t(source)
     ON CONFLICT(project_id,kit_key) DO NOTHING;
   UPDATE public.erp_preparing_warehouse_items SET source_kits=sources,updated_at=now()
     WHERE id=existing.id;
   INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,after_row,changed_by_id)
      VALUES(p_project_id,existing.id,'update',to_jsonb(existing),
       to_jsonb(existing)||jsonb_build_object('source_kits',sources),p_member_id);
   updated_count:=updated_count+1;
 END LOOP;
 RETURN jsonb_build_object('groupedComponents',updated_count);
END; $$;

-- Group-specific edits; the physical master component is still ONE row per product.
CREATE OR REPLACE FUNCTION public.erp_preparing_edit_project_kit_item(
 p_project_id uuid,p_action text,p_item_id uuid,p_product_id text,p_product_name text,
 p_quantity bigint,p_kit_id text,p_kit_name text,p_expected_updated_at timestamptz,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.erp_preparing_warehouse_items%ROWTYPE;
  output_row public.erp_preparing_warehouse_items%ROWTYPE;
  new_sources jsonb:='[]'::jsonb; source jsonb; found_group boolean:=false;
  desired_key text; current_key text; target_key text; old_group_qty bigint:=0;
  new_total bigint; allocated bigint; has_activity boolean;
  clean_name text; clean_code text;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF p_action NOT IN ('add','update','delete') OR coalesce(btrim(p_member_id),'')=''
    OR length(btrim(coalesce(p_kit_id,'')))>160
    OR length(btrim(coalesce(p_kit_name,''))) NOT BETWEEN 1 AND 160
 THEN RAISE EXCEPTION 'Invalid Kit operation.'; END IF;
 IF p_action<>'delete' AND (p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000000)
 THEN RAISE EXCEPTION 'Enter a positive whole-number Kit quantity.'; END IF;
 target_key:=CASE WHEN btrim(coalesce(p_kit_id,''))<>'' THEN 'id:'||lower(btrim(p_kit_id))
   ELSE 'name:'||lower(btrim(p_kit_name)) END;
 clean_name:=btrim(coalesce(p_product_name,''));clean_code:=btrim(coalesce(p_product_id,''));
 IF p_action='add' THEN
   INSERT INTO public.erp_preparing_project_kit_groups(project_id,kit_key,kit_id,kit_name,sort_order)
   VALUES(p_project_id,target_key,btrim(coalesce(p_kit_id,'')),btrim(p_kit_name),
     (SELECT count(*) FROM public.erp_preparing_project_kit_groups WHERE project_id=p_project_id))
   ON CONFLICT(project_id,kit_key) DO NOTHING;
 END IF;
 IF p_action='add' AND p_item_id IS NULL THEN
   IF length(clean_name) NOT BETWEEN 1 AND 500 OR length(clean_code)>500
     THEN RAISE EXCEPTION 'Invalid component.'; END IF;
   desired_key:=CASE WHEN clean_code<>'' THEN 'id:'||lower(clean_code)
     ELSE 'name:'||lower(regexp_replace(clean_name,'\s+',' ','g')) END;
   SELECT * INTO existing FROM public.erp_preparing_warehouse_items
     WHERE project_id=p_project_id AND item_key=desired_key FOR UPDATE;
   IF NOT FOUND THEN
     IF (SELECT count(*) FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id)>=5000
       THEN RAISE EXCEPTION 'Project component limit reached.'; END IF;
     new_sources:=public.erp_preparing_validate_kit_sources(jsonb_build_array(jsonb_build_object(
      'kitId',btrim(coalesce(p_kit_id,'')),'kitName',btrim(p_kit_name),'quantity',p_quantity)),p_quantity);
     INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name,required_qty,source_kits)
      VALUES(p_project_id,desired_key,clean_code,clean_name,p_quantity,new_sources) RETURNING * INTO output_row;
     INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,after_row,changed_by_id)
      VALUES(p_project_id,output_row.id,'add',to_jsonb(output_row),p_member_id);
     RETURN to_jsonb(output_row);
   END IF;
   -- Existing component: append a distinct Kit without creating duplicate warehouse stock.
   IF clean_name IS DISTINCT FROM existing.product_name OR clean_code IS DISTINCT FROM existing.product_id
     THEN RAISE EXCEPTION 'Existing component has a different name or code.'; END IF;
 ELSE
   SELECT * INTO existing FROM public.erp_preparing_warehouse_items
      WHERE id=p_item_id AND project_id=p_project_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Component not found. Refresh the list.'; END IF;
 END IF;
 IF p_action<>'add' AND (p_expected_updated_at IS NULL
    OR existing.updated_at IS DISTINCT FROM p_expected_updated_at)
 THEN RAISE EXCEPTION 'This component changed. Refresh before editing.'; END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(existing.source_kits) LOOP
    current_key:=CASE WHEN btrim(coalesce(source->>'kitId',''))<>'' THEN 'id:'||lower(btrim(source->>'kitId'))
      ELSE 'name:'||lower(btrim(coalesce(source->>'kitName',''))) END;
    IF current_key=target_key THEN
      found_group:=true; old_group_qty:=(source->>'quantity')::bigint;
      IF p_action='add' THEN RAISE EXCEPTION 'Component is already in this Kit.'; END IF;
      IF p_action='update' THEN new_sources:=new_sources||jsonb_build_array(jsonb_build_object(
        'kitId',coalesce(source->>'kitId',''),'kitName',source->>'kitName','quantity',p_quantity)); END IF;
    ELSE new_sources:=new_sources||jsonb_build_array(source); END IF;
 END LOOP;
 IF p_action IN ('update','delete') AND NOT found_group THEN RAISE EXCEPTION 'Kit membership no longer exists.'; END IF;
 IF p_action='add' THEN new_sources:=new_sources||jsonb_build_array(jsonb_build_object(
      'kitId',btrim(coalesce(p_kit_id,'')),'kitName',btrim(p_kit_name),'quantity',p_quantity)); END IF;
 new_total:=existing.required_qty-old_group_qty+CASE WHEN p_action='delete' THEN 0 ELSE p_quantity END;
 SELECT coalesce(sum(delta_qty),0) INTO allocated FROM public.erp_preparing_warehouse_allocations
  WHERE item_id=existing.id;
 IF new_total<allocated THEN RAISE EXCEPTION 'Kit quantities cannot fall below amounts already allocated.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=existing.id
  UNION ALL SELECT 1 FROM public.erp_preparing_warehouse_allocations WHERE item_id=existing.id
  UNION ALL SELECT 1 FROM public.erp_preparing_warehouse_demands WHERE item_id=existing.id) INTO has_activity;
 IF new_total=0 THEN
  IF has_activity THEN RAISE EXCEPTION 'Cannot remove the final Kit of a component with warehouse or school history.'; END IF;
  INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,changed_by_id)
    VALUES(p_project_id,existing.id,'delete',to_jsonb(existing),p_member_id);
  DELETE FROM public.erp_preparing_warehouse_items WHERE id=existing.id;
  RETURN jsonb_build_object('deleted',true,'itemId',existing.id);
 END IF;
 new_sources:=public.erp_preparing_validate_kit_sources(new_sources,new_total);
 UPDATE public.erp_preparing_warehouse_items
   SET source_kits=new_sources,required_qty=new_total,updated_at=now()
   WHERE id=existing.id RETURNING * INTO output_row;
 INSERT INTO public.erp_preparing_warehouse_bom_audit(project_id,item_id,operation,before_row,after_row,changed_by_id)
   VALUES(p_project_id,existing.id,'update',to_jsonb(existing),to_jsonb(output_row),p_member_id);
 RETURN to_jsonb(output_row);
END; $$;

-- Guard ALL write paths, including the previous edit_bom RPC, against BOM/Kit drift.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_project_kit_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF jsonb_typeof(NEW.source_kits) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid Kit group data.'; END IF;
 IF jsonb_array_length(NEW.source_kits)>0 THEN
   NEW.source_kits:=public.erp_preparing_validate_kit_sources(NEW.source_kits,NEW.required_qty);
 ELSIF TG_OP='UPDATE' AND jsonb_array_length(OLD.source_kits)>0 AND NEW.required_qty>0 THEN
   RAISE EXCEPTION 'Cannot remove Kit associations without updating the Kit breakdown.';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_preparing_guard_project_kit_totals ON public.erp_preparing_warehouse_items;
CREATE TRIGGER trg_preparing_guard_project_kit_totals
 BEFORE INSERT OR UPDATE OF source_kits,required_qty
 ON public.erp_preparing_warehouse_items
 FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_project_kit_totals();

REVOKE ALL ON FUNCTION public.erp_preparing_validate_kit_sources(jsonb,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_initialize_project_kits(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_edit_project_kit_item(uuid,text,uuid,text,text,bigint,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_validate_kit_sources(jsonb,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.erp_preparing_guard_project_kit_totals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_guard_project_kit_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_initialize_project_kits(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_edit_project_kit_item(uuid,text,uuid,text,text,bigint,text,text,timestamptz,text) TO service_role;
COMMIT;
