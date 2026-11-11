-- v399: atomic, school-based, equal integer distribution to physical Kit labels.
-- Requires v395, v396, v397, v398. Does not migrate/delete old packed lines.
-- The API must call this RPC for ALL generated school-Kit packing edits.
BEGIN;

CREATE OR REPLACE FUNCTION public.erp_preparing_pack_school_boxes_v399(
 p_project_id uuid, p_item_id uuid, p_kit_name text, p_school_packs jsonb,
 p_member_id text, p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 school_entry jsonb; school_rec public.erp_preparing_schools%ROWTYPE;
 master_item public.erp_preparing_warehouse_items%ROWTYPE;
 component_rec public.erp_preparing_components%ROWTYPE;
 source_item public.erp_preparing_components%ROWTYPE;
 box_rec public.erp_preparing_project_cartons%ROWTYPE;
 source_qty bigint; per_box_required bigint; per_box_packed bigint;
 desired_total bigint; box_count integer; source_count integer;
 prior_qty bigint; delta_qty bigint:=0; incoming_qty bigint; existing_packed bigint;
 target_count integer; selected_count integer:=0; updated_boxes integer:=0;
 school_ids uuid[]:=ARRAY[]::uuid[];
 BEGIN
 IF p_project_id IS NULL OR p_item_id IS NULL OR nullif(btrim(coalesce(p_kit_name,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  OR length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160
  OR jsonb_typeof(p_school_packs) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_school_packs) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'Choose a Kit group, at least one school and a verified user.'; END IF;
 -- All related carton/manifest operations already serialize on the same project row.
 PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 SELECT * INTO master_item FROM public.erp_preparing_warehouse_items
 WHERE id=p_item_id AND project_id=p_project_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Master component not found in this project.'; END IF;

 -- FIRST PASS: validate every selected school before writing ANY manifest or line.
 FOR school_entry IN SELECT value FROM jsonb_array_elements(p_school_packs) LOOP
  IF jsonb_typeof(school_entry) <> 'object' OR (school_entry->>'schoolId') IS NULL
     OR (school_entry->>'totalQuantity') IS NULL
  THEN RAISE EXCEPTION 'Each selected school needs an ID and total packed quantity.'; END IF;
  SELECT * INTO school_rec FROM public.erp_preparing_schools
   WHERE id=(school_entry->>'schoolId')::uuid AND project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not part of this project.'; END IF;
  IF school_rec.id=ANY(school_ids) THEN RAISE EXCEPTION 'School repeated in the same packing request.'; END IF;
  school_ids:=array_append(school_ids,school_rec.id);
  desired_total:=(school_entry->>'totalQuantity')::bigint;
  IF desired_total<0 OR desired_total>1000000 THEN
   RAISE EXCEPTION 'Packed total must be between 0 and 1,000,000 for each school.';
  END IF;
  SELECT count(*) INTO box_count FROM public.erp_preparing_project_cartons
   WHERE project_id=p_project_id AND school_id=school_rec.id AND kit_name=p_kit_name
    AND generated_kit_label AND status<>'cancelled';
  IF box_count=0 THEN RAISE EXCEPTION 'Generate physical Kit labels for the school before packing.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=school_rec.id AND kit_name=p_kit_name
     AND generated_kit_label AND status<>'draft')
  THEN RAISE EXCEPTION 'One or more Kits for this school/group are completed. Packed Kits cannot be edited.'; END IF;

  SELECT count(*) INTO source_count FROM public.erp_preparing_components c
   WHERE c.school_id=school_rec.id
    AND lower(btrim(c.product_id))=lower(btrim(master_item.product_id))
    AND lower(btrim(c.product_name))=lower(btrim(master_item.product_name))
    AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
       WHERE k.v->>'kitName'=p_kit_name));
  IF source_count<>1 THEN
   RAISE EXCEPTION 'Each school needs exactly one matching component in this Kit group.';
  END IF;
  SELECT * INTO source_item FROM public.erp_preparing_components c
   WHERE c.school_id=school_rec.id
    AND lower(btrim(c.product_id))=lower(btrim(master_item.product_id))
    AND lower(btrim(c.product_name))=lower(btrim(master_item.product_name))
    AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
       WHERE k.v->>'kitName'=p_kit_name));
  IF p_kit_name='General' THEN source_qty:=source_item.planned_qty;
  ELSE SELECT coalesce(sum((k.v->>'quantity')::bigint),0) INTO source_qty
    FROM jsonb_array_elements(coalesce(source_item.source_kits,'[]'::jsonb)) k(v)
    WHERE k.v->>'kitName'=p_kit_name;
  END IF;
  IF source_qty<1 OR source_qty>1000000 THEN RAISE EXCEPTION 'School Proposal quantity is invalid for %.',source_item.product_name; END IF;
  IF mod(source_qty,box_count)<>0 THEN
   RAISE EXCEPTION 'School % requested % of %, but has % Kits. Each Kit must have a whole identical quantity. Correct the school BOM or number of labels.',
     coalesce(school_rec.beneficiary_name,school_rec.id::text),source_qty,source_item.product_name,box_count;
  END IF;
  IF desired_total>source_qty THEN
   RAISE EXCEPTION 'School % requested only % units of %. Cannot pack %.',
     coalesce(school_rec.beneficiary_name,school_rec.id::text),source_qty,source_item.product_name,desired_total;
  END IF;
  IF mod(desired_total,box_count)<>0 THEN
   RAISE EXCEPTION 'Packed quantity % cannot be split equally into % Kits for school % without fractions.',
    desired_total,box_count,coalesce(school_rec.beneficiary_name,school_rec.id::text);
  END IF;

  -- Every other component of the group must ALSO fit identically in each Kit.
  IF EXISTS(
   SELECT 1 FROM public.erp_preparing_components c
   WHERE c.school_id=school_rec.id AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
        WHERE k.v->>'kitName'=p_kit_name))
   GROUP BY lower(btrim(c.product_id)),lower(btrim(c.product_name)) HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate product records in this school Kit; review school BOM.'; END IF;
  target_count:=0;
  FOR component_rec IN SELECT c.* FROM public.erp_preparing_components c
   WHERE c.school_id=school_rec.id AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
       WHERE k.v->>'kitName'=p_kit_name))
  LOOP
   IF p_kit_name='General' THEN source_qty:=component_rec.planned_qty;
   ELSE SELECT coalesce(sum((k.v->>'quantity')::bigint),0) INTO source_qty
     FROM jsonb_array_elements(coalesce(component_rec.source_kits,'[]'::jsonb)) k(v)
     WHERE k.v->>'kitName'=p_kit_name;
   END IF;
   IF source_qty<box_count OR source_qty>1000000 OR mod(source_qty,box_count)<>0 THEN
    RAISE EXCEPTION 'School %: % requested for % is not divisible by % Kits. Equal whole-number Kits are required.',
     coalesce(school_rec.beneficiary_name,school_rec.id::text),source_qty,component_rec.product_name,box_count;
   END IF;
   per_box_required:=source_qty/box_count;
   target_count:=target_count+1;
   FOR box_rec IN SELECT * FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=school_rec.id AND kit_name=p_kit_name
      AND generated_kit_label AND status='draft' ORDER BY label_sequence,id
   LOOP
    SELECT coalesce(sum(l.packed_qty),0) INTO prior_qty
     FROM public.erp_preparing_project_carton_lines l
     WHERE l.carton_id=box_rec.id AND lower(btrim(l.product_id))=lower(btrim(component_rec.product_id))
       AND lower(btrim(l.product_name))=lower(btrim(component_rec.product_name));
    IF prior_qty>per_box_required THEN
     RAISE EXCEPTION 'Existing packed quantity % in % exceeds equal Kit target % for %. Verify the physical box before retrying.',
       prior_qty,box_rec.carton_label,per_box_required,component_rec.product_name;
    END IF;
   END LOOP;
  END LOOP;
  IF target_count=0 THEN RAISE EXCEPTION 'No components exist in this school Kit group.'; END IF;
  -- Reject unexplained v395/v396 physical contents and old targets, never silently erase them.
  IF EXISTS(
    SELECT 1 FROM public.erp_preparing_project_carton_lines l
    JOIN public.erp_preparing_project_cartons b ON b.id=l.carton_id
    WHERE b.project_id=p_project_id AND b.school_id=school_rec.id AND b.kit_name=p_kit_name
      AND b.generated_kit_label AND b.status='draft'
      AND NOT EXISTS (SELECT 1 FROM public.erp_preparing_components c
       WHERE c.school_id=school_rec.id AND c.product_id=l.product_id AND c.product_name=l.product_name
         AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
           WHERE k.v->>'kitName'=p_kit_name)))
  ) THEN RAISE EXCEPTION 'One or more Kits contain components not in this school/group Proposal.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.erp_preparing_school_kit_targets t
    JOIN public.erp_preparing_project_cartons b ON b.id=t.kit_box_id
    WHERE b.project_id=p_project_id AND b.school_id=school_rec.id AND b.kit_name=p_kit_name
      AND b.generated_kit_label AND b.status='draft'
      AND NOT EXISTS (SELECT 1 FROM public.erp_preparing_components c
        WHERE c.id=t.source_component_id AND c.school_id=school_rec.id
          AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
           OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
             WHERE k.v->>'kitName'=p_kit_name)))
  ) THEN RAISE EXCEPTION 'A Kit has old manifest targets outside the school BOM. Review it first.'; END IF;
  per_box_packed:=desired_total/box_count;
  FOR box_rec IN SELECT * FROM public.erp_preparing_project_cartons
   WHERE project_id=p_project_id AND school_id=school_rec.id AND kit_name=p_kit_name
     AND generated_kit_label AND status='draft' ORDER BY label_sequence,id
  LOOP
   SELECT coalesce(sum(l.packed_qty),0) INTO prior_qty
    FROM public.erp_preparing_project_carton_lines l
    WHERE l.carton_id=box_rec.id AND lower(btrim(l.product_id))=lower(btrim(master_item.product_id))
      AND lower(btrim(l.product_name))=lower(btrim(master_item.product_name));
   delta_qty:=delta_qty+per_box_packed-prior_qty;
  END LOOP;
  selected_count:=selected_count+1;
 END LOOP;

 SELECT coalesce(sum(h.qty_delta),0) INTO incoming_qty FROM public.erp_preparing_production_handoffs h
  WHERE h.project_id=p_project_id AND h.item_id=p_item_id;
 SELECT coalesce(sum(l.packed_qty),0) INTO existing_packed
  FROM public.erp_preparing_project_carton_lines l JOIN public.erp_preparing_project_cartons b ON b.id=l.carton_id
  WHERE b.project_id=p_project_id AND b.status<>'cancelled'
   AND lower(btrim(l.product_id))=lower(btrim(master_item.product_id))
   AND lower(btrim(l.product_name))=lower(btrim(master_item.product_name));
 IF existing_packed+delta_qty>incoming_qty THEN
  RAISE EXCEPTION 'Insufficient Operations Received stock: % packed, % available total, requested net change %.',
    existing_packed,incoming_qty,delta_qty;
 END IF;

 -- SECOND PASS: atomically align the entire group manifest to equal per-Kit
 -- quantities, then set this component to the same amount in every label.
 FOR school_entry IN SELECT value FROM jsonb_array_elements(p_school_packs) LOOP
  desired_total:=(school_entry->>'totalQuantity')::bigint;
  SELECT count(*) INTO box_count FROM public.erp_preparing_project_cartons
   WHERE project_id=p_project_id AND school_id=(school_entry->>'schoolId')::uuid AND kit_name=p_kit_name
    AND generated_kit_label AND status='draft';
  FOR component_rec IN SELECT c.* FROM public.erp_preparing_components c
   WHERE c.school_id=(school_entry->>'schoolId')::uuid
    AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
       WHERE k.v->>'kitName'=p_kit_name))
  LOOP
   IF p_kit_name='General' THEN source_qty:=component_rec.planned_qty;
   ELSE SELECT coalesce(sum((k.v->>'quantity')::bigint),0) INTO source_qty
    FROM jsonb_array_elements(coalesce(component_rec.source_kits,'[]'::jsonb)) k(v)
    WHERE k.v->>'kitName'=p_kit_name;
   END IF;
   per_box_required:=source_qty/box_count;
   FOR box_rec IN SELECT * FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=(school_entry->>'schoolId')::uuid AND kit_name=p_kit_name
     AND generated_kit_label AND status='draft' ORDER BY label_sequence,id
   LOOP
    INSERT INTO public.erp_preparing_school_kit_targets
     (project_id,kit_box_id,school_id,source_component_id,product_id,product_name,expected_qty)
    VALUES(p_project_id,box_rec.id,box_rec.school_id,component_rec.id,
      component_rec.product_id,component_rec.product_name,per_box_required)
    ON CONFLICT (kit_box_id,source_component_id) DO UPDATE
     SET expected_qty=excluded.expected_qty,updated_at=clock_timestamp()
     WHERE public.erp_preparing_school_kit_targets.expected_qty IS DISTINCT FROM excluded.expected_qty;
   END LOOP;
  END LOOP;
  per_box_packed:=desired_total/box_count;
  SELECT * INTO source_item FROM public.erp_preparing_components c
   WHERE c.school_id=(school_entry->>'schoolId')::uuid
    AND lower(btrim(c.product_id))=lower(btrim(master_item.product_id))
    AND lower(btrim(c.product_name))=lower(btrim(master_item.product_name))
    AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.source_kits,'[]'::jsonb)) k(v)
      WHERE k.v->>'kitName'=p_kit_name));
  FOR box_rec IN SELECT * FROM public.erp_preparing_project_cartons
   WHERE project_id=p_project_id AND school_id=(school_entry->>'schoolId')::uuid AND kit_name=p_kit_name
    AND generated_kit_label AND status='draft' ORDER BY label_sequence,id
  LOOP
   SELECT coalesce(sum(l.packed_qty),0) INTO prior_qty FROM public.erp_preparing_project_carton_lines l
    WHERE l.carton_id=box_rec.id AND lower(btrim(l.product_id))=lower(btrim(master_item.product_id))
      AND lower(btrim(l.product_name))=lower(btrim(master_item.product_name));
   IF prior_qty IS DISTINCT FROM per_box_packed THEN
    PERFORM public.erp_preparing_production_pack_v249(p_project_id,box_rec.id,source_item.id,
      p_item_id,per_box_packed::integer,box_rec.updated_at::text,p_member_id,p_actor_name);
    updated_boxes:=updated_boxes+1;
   END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('schools',selected_count,'boxes_updated',updated_boxes,
   'kit_group',p_kit_name,'component',master_item.product_name);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_pack_school_boxes_v399(uuid,uuid,text,jsonb,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_pack_school_boxes_v399(uuid,uuid,text,jsonb,text,text)
 TO service_role;
COMMIT;
