-- v234 - Atomic school addition + immediate per-school Project BOM snapshot and allocation demand.
-- Run AFTER Phase 12 and v233. Existing schools, receipts, allocations, and QC are untouched.
-- Project warehouse required_qty and source_kits are PER-SCHOOL planning figures.
-- Project-wide Total Required is derived as current per-school quantity * school count.
BEGIN;
CREATE OR REPLACE FUNCTION public.erp_preparing_add_schools_with_components(
  p_project_id uuid, p_schools jsonb, p_items jsonb, p_member_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  pr public.erp_preparing_projects%ROWTYPE;
  school jsonb;
  item jsonb;
  school_row public.erp_preparing_schools%ROWTYPE;
  master public.erp_preparing_warehouse_items%ROWTYPE;
  total_schools integer;
  total_items integer;
  added jsonb:='[]'::jsonb;
BEGIN
  -- Use the same project row lock as all warehouse and BOM write operations.
  SELECT * INTO pr FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND OR pr.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Project does not exist or is archived.';
  END IF;
  IF nullif(btrim(coalesce(pr.source_proposal_id,'')),'') IS NULL OR
     nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR
     jsonb_typeof(p_schools) IS DISTINCT FROM 'array' OR
     jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid school or Proposal details.';
  END IF;
  total_schools:=jsonb_array_length(p_schools);
  total_items:=jsonb_array_length(p_items);
  IF total_schools NOT BETWEEN 1 AND 100 OR total_items NOT BETWEEN 1 AND 1000 OR
     (SELECT count(DISTINCT v->>'beneficiaryId') FROM jsonb_array_elements(p_schools) AS t(v))<>total_schools OR
     (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_items) AS t(v))<>total_items THEN
    RAISE EXCEPTION 'Invalid or duplicate schools/components.';
  END IF;
  -- The exact proposed snapshot must match the current per-school master BOM.
  -- This guards against a concurrent or forged request changing requirements.
  IF (SELECT count(*) FROM public.erp_preparing_warehouse_items
      WHERE project_id=p_project_id AND required_qty>0)<>total_items THEN
    RAISE EXCEPTION 'Project components changed. Refresh and add schools again.';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
       coalesce(item->>'itemId','') !~ '^[0-9a-fA-F-]{36}$' OR
       coalesce(item->>'planned','') !~ '^[0-9]{1,7}$' OR
       jsonb_typeof(item->'sourceKits') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid project component snapshot.';
    END IF;
    SELECT * INTO master FROM public.erp_preparing_warehouse_items
      WHERE id=(item->>'itemId')::uuid AND project_id=p_project_id;
    IF NOT FOUND OR master.required_qty NOT BETWEEN 1 AND 1000000 OR
       master.item_key IS DISTINCT FROM item->>'itemKey' OR
       master.required_qty IS DISTINCT FROM (item->>'planned')::bigint OR
       master.product_id IS DISTINCT FROM item->>'productId' OR
       master.product_name IS DISTINCT FROM item->>'productName' OR
       master.source_kits IS DISTINCT FROM (item->'sourceKits') THEN
      RAISE EXCEPTION 'Project component changed. Refresh before adding schools.';
    END IF;
  END LOOP;
  FOR school IN SELECT value FROM jsonb_array_elements(p_schools) LOOP
    IF jsonb_typeof(school) IS DISTINCT FROM 'object' OR
       length(btrim(coalesce(school->>'beneficiaryId',''))) NOT BETWEEN 1 AND 500 OR
       length(btrim(coalesce(school->>'beneficiaryName',''))) NOT BETWEEN 1 AND 500 OR
       length(coalesce(school->>'schoolLabel',''))>500 THEN
      RAISE EXCEPTION 'Invalid beneficiary details.';
    END IF;
    INSERT INTO public.erp_preparing_schools
      (project_id,beneficiary_id,beneficiary_name,school_label,proposal_id,proposal_name,created_by_id)
    VALUES (p_project_id,school->>'beneficiaryId',school->>'beneficiaryName',
      coalesce(school->>'schoolLabel',''),pr.source_proposal_id,pr.source_proposal_name,p_member_id)
    RETURNING * INTO school_row;
    INSERT INTO public.erp_preparing_manifests
      (school_id,proposal_id,proposal_name,proposal_updated_at,item_count,created_by_id)
    VALUES (school_row.id,pr.source_proposal_id,pr.source_proposal_name,NULL,total_items,p_member_id);
    INSERT INTO public.erp_preparing_components
      (school_id,proposal_item_id,product_id,product_name,source_kits,item_order,planned_qty)
    SELECT school_row.id, x.value->>'itemId',x.value->>'productId',
      x.value->>'productName',x.value->'sourceKits',x.ordinality::integer-1,
      (x.value->>'planned')::integer
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,ordinality);
    -- Allocation requirements are also ready immediately. This does NOT
    -- mark any component as received or alter the warehouse stock ledger.
    INSERT INTO public.erp_preparing_warehouse_demands(project_id,school_id,item_id,required_qty)
    SELECT p_project_id,school_row.id,(x.value->>'itemId')::uuid,
      (x.value->>'planned')::integer
    FROM jsonb_array_elements(p_items) AS x(value);
    added:=added||jsonb_build_array(to_jsonb(school_row));
  END LOOP;
  RETURN added;
END;
$$;
REVOKE ALL ON FUNCTION public.erp_preparing_add_schools_with_components(uuid,jsonb,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_add_schools_with_components(uuid,jsonb,jsonb,text)
  TO service_role;
COMMIT;
