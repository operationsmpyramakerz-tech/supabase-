-- v413: atomic multi-school Kit label generation and automatic closure of filled Kits.
-- Requires v395, v396 and v399. Run as the privileged SQL administrator before deploying v413.
-- No existing quantities, Kit labels, or completed Kits are removed or edited.
BEGIN;

CREATE OR REPLACE FUNCTION public.erp_preparing_generate_school_kits_multi_v413(
 p_project_id uuid, p_school_ids uuid[], p_kit_name text, p_count integer, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE school_id uuid; created jsonb := '[]'::jsonb;
 result jsonb; generated integer := 0;
BEGIN
 IF p_project_id IS NULL OR p_school_ids IS NULL OR array_length(p_school_ids,1) NOT BETWEEN 1 AND 50
  OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 100 OR nullif(btrim(coalesce(p_kit_name,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Select 1 to 50 schools, a Kit group and 1 to 100 labels per school.'; END IF;
 IF array_position(p_school_ids,NULL) IS NOT NULL OR (SELECT count(DISTINCT school_key) FROM unnest(p_school_ids) AS u(school_key)) <> array_length(p_school_ids,1)
 THEN RAISE EXCEPTION 'School selection contains a duplicate or an invalid school.'; END IF;
 -- The existing v395 function locks the project, validates each school/group,
 -- enforces the 500-box cap, and allocates unique labels. Any failure rolls back ALL schools.
 FOREACH school_id IN ARRAY p_school_ids LOOP
  result := public.erp_preparing_generate_school_kits_v395(p_project_id,school_id,p_kit_name,p_count,p_member_id);
  created := created || coalesce(result->'created','[]'::jsonb);
  generated := generated + coalesce((result->>'count')::integer,0);
 END LOOP;
 RETURN jsonb_build_object('count',generated,'schools',array_length(p_school_ids,1),
  'per_school',p_count,'kit_group',p_kit_name,'created',created);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_pack_school_boxes_auto_v413(
 p_project_id uuid, p_item_id uuid, p_kit_name text, p_school_packs jsonb,
 p_member_id text, p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; box_rec public.erp_preparing_project_cartons%ROWTYPE;
 closed integer := 0; closed_labels jsonb := '[]'::jsonb;
BEGIN
 -- Both the save and the verified close occur IN ONE TRANSACTION, using the v399
 -- project lock, equal-distribution rules, stock guard and audited packing writes.
 result := public.erp_preparing_pack_school_boxes_v399(
  p_project_id,p_item_id,p_kit_name,p_school_packs,p_member_id,p_actor_name);
 FOR box_rec IN SELECT b.* FROM public.erp_preparing_project_cartons b
  WHERE b.project_id=p_project_id AND b.kit_name=p_kit_name
   AND b.generated_kit_label AND b.status='draft'
   AND b.school_id IN (SELECT (entry->>'schoolId')::uuid FROM jsonb_array_elements(p_school_packs) entry)
  ORDER BY b.school_id,b.label_sequence,b.id
 LOOP
  IF EXISTS (SELECT 1 FROM public.erp_preparing_school_kit_targets t WHERE t.kit_box_id=box_rec.id)
   AND NOT EXISTS (
    SELECT 1 FROM public.erp_preparing_school_kit_targets t
    LEFT JOIN public.erp_preparing_project_carton_lines l ON l.carton_id=t.kit_box_id
       AND l.product_id=t.product_id AND l.product_name=t.product_name
    WHERE t.kit_box_id=box_rec.id AND coalesce(l.packed_qty,0)<>t.expected_qty
   ) AND NOT EXISTS (
    SELECT 1 FROM public.erp_preparing_project_carton_lines l WHERE l.carton_id=box_rec.id
     AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t
      WHERE t.kit_box_id=box_rec.id AND t.product_id=l.product_id AND t.product_name=l.product_name)
   ) THEN
   -- v396 independently rechecks every manifest and permanently locks the Kit.
   PERFORM public.erp_preparing_complete_school_kit_v396(
     p_project_id,box_rec.id,box_rec.updated_at::text,p_member_id);
   closed := closed + 1;
   closed_labels := closed_labels || to_jsonb(box_rec.carton_label);
  END IF;
 END LOOP;
 RETURN coalesce(result,'{}'::jsonb) || jsonb_build_object('auto_closed',closed,'closed_labels',closed_labels);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_generate_school_kits_multi_v413(uuid,uuid[],text,integer,text),
 public.erp_preparing_pack_school_boxes_auto_v413(uuid,uuid,text,jsonb,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_generate_school_kits_multi_v413(uuid,uuid[],text,integer,text),
 public.erp_preparing_pack_school_boxes_auto_v413(uuid,uuid,text,jsonb,text,text)
 TO service_role;

-- Backfill ONLY existing fully filled draft physical Kits, such as the 5/5 example.
-- Call the same audited v396 closure guard; skip unplanned/incomplete/extra contents.
-- The audit actor 'AUTO-PACKING-V413' explicitly identifies a system transition.
DO $$
DECLARE box_rec record;
BEGIN
 FOR box_rec IN
  SELECT b.id,b.project_id,b.updated_at FROM public.erp_preparing_project_cartons b
   WHERE b.generated_kit_label AND b.status='draft'
    AND EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t WHERE t.kit_box_id=b.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.erp_preparing_school_kit_targets t
      LEFT JOIN public.erp_preparing_project_carton_lines l ON l.carton_id=t.kit_box_id
       AND l.product_id=t.product_id AND l.product_name=t.product_name
      WHERE t.kit_box_id=b.id AND coalesce(l.packed_qty,0)<>t.expected_qty
    ) AND NOT EXISTS (
      SELECT 1 FROM public.erp_preparing_project_carton_lines l WHERE l.carton_id=b.id
       AND NOT EXISTS (SELECT 1 FROM public.erp_preparing_school_kit_targets t
        WHERE t.kit_box_id=b.id AND t.product_id=l.product_id AND t.product_name=l.product_name)
    )
  ORDER BY b.project_id,b.id
 LOOP
  PERFORM public.erp_preparing_complete_school_kit_v396(
    box_rec.project_id,box_rec.id,box_rec.updated_at::text,'AUTO-PACKING-V413');
 END LOOP;
END; $$;
COMMIT;
