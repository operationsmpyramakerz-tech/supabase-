-- v395: School-specific Kit labels (phase 1 of school packing workflow).
-- Apply BEFORE deploying v395. Additive; no automatic changes to legacy boxes.
-- Production receives physical component counts as before; generating a label DOES NOT pack stock.
BEGIN;
ALTER TABLE public.erp_preparing_project_cartons
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.erp_preparing_schools(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS generated_kit_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_sequence integer;

CREATE UNIQUE INDEX IF NOT EXISTS erp_prep_generated_school_kit_sequence
  ON public.erp_preparing_project_cartons(project_id,school_id,kit_name,label_sequence)
  WHERE generated_kit_label;
CREATE INDEX IF NOT EXISTS erp_prep_box_school
  ON public.erp_preparing_project_cartons(project_id,school_id)
  WHERE generated_kit_label;

ALTER TABLE public.erp_preparing_project_cartons
  DROP CONSTRAINT IF EXISTS erp_prep_generated_kit_valid;
ALTER TABLE public.erp_preparing_project_cartons
  ADD CONSTRAINT erp_prep_generated_kit_valid CHECK (
    NOT generated_kit_label OR (school_id IS NOT NULL AND label_sequence IS NOT NULL AND label_sequence > 0)
  );

-- Do not let the legacy Rename workflow change a scannable identity once issued.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_generated_kit_label_v395()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF OLD.generated_kit_label AND (
    NEW.carton_label IS DISTINCT FROM OLD.carton_label OR
    NEW.school_id IS DISTINCT FROM OLD.school_id OR
    NEW.kit_name IS DISTINCT FROM OLD.kit_name OR
    NEW.label_sequence IS DISTINCT FROM OLD.label_sequence OR
    NEW.generated_kit_label IS DISTINCT FROM OLD.generated_kit_label
  ) THEN RAISE EXCEPTION 'Generated Kit labels cannot be renamed or reassigned.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_guard_generated_kit_label_v395 ON public.erp_preparing_project_cartons;
CREATE TRIGGER trg_erp_prep_guard_generated_kit_label_v395
  BEFORE UPDATE ON public.erp_preparing_project_cartons FOR EACH ROW
  EXECUTE FUNCTION public.erp_preparing_guard_generated_kit_label_v395();

CREATE OR REPLACE FUNCTION public.erp_preparing_generate_school_kits_v395(
  p_project_id uuid, p_school_id uuid, p_kit_name text, p_count integer, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  school public.erp_preparing_schools%ROWTYPE;
  kit_code text; school_code text; school_key text; stem text; proposal_group boolean;
  next_seq integer; i integer; final_label text; out_box public.erp_preparing_project_cartons%ROWTYPE;
  created jsonb := '[]'::jsonb;
BEGIN
  -- Serialize every code allocation for this project to prevent duplicate labels.
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO school FROM public.erp_preparing_schools WHERE id=p_school_id AND project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'School is not part of this project.'; END IF;
  IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 100 OR
     nullif(btrim(coalesce(p_kit_name,'')),'') IS NULL OR
     length(btrim(p_kit_name)) > 160 OR
     nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Choose a school, valid Kit group and quantity (1–100).'; END IF;
  -- Only groups actually present in this school's captured BOM are eligible.
  SELECT EXISTS (
    SELECT 1 FROM public.erp_preparing_components c WHERE c.school_id=p_school_id AND (
      (p_kit_name='General' AND jsonb_array_length(c.source_kits)=0)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_kits) AS kit(entry) WHERE kit.entry->>'kitName'=p_kit_name)
    )
  ) INTO proposal_group;
  IF NOT proposal_group THEN RAISE EXCEPTION 'Kit group is not part of the selected school Proposal.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_project_cartons
      WHERE project_id=p_project_id AND status<>'cancelled') + p_count > 500
  THEN RAISE EXCEPTION 'The project is limited to 500 active Kit/box records.'; END IF;

  kit_code := left(regexp_replace(upper(btrim(p_kit_name)), '[^A-Z0-9]+','','g'),3);
  IF kit_code='' THEN kit_code := 'KIT'; END IF;
  -- Preserve common readable names (CITY); Arabic-only school names receive a stable fallback.
  school_key := regexp_replace(upper(school.beneficiary_name),'[^A-Z0-9]+',' ','g');
  school_code := left(split_part(btrim(school_key),' ',1),12);
  IF school_code='' THEN school_code := 'SCH'||upper(left(replace(school.id::text,'-',''),6)); END IF;
  -- Duplicate school names in the SAME project must never share the same code stem.
  IF EXISTS (SELECT 1 FROM public.erp_preparing_schools s WHERE s.project_id=p_project_id AND s.id<>school.id
      AND left(split_part(btrim(regexp_replace(upper(s.beneficiary_name),'[^A-Z0-9]+',' ','g')),' ',1),12)=school_code)
  THEN school_code := left(school_code,8)||upper(left(replace(school.id::text,'-',''),4)); END IF;
  stem := kit_code||'-'||school_code;
  -- If a legacy manually named box or a different Kit shares this stem, disambiguate before issuing codes.
  IF EXISTS(SELECT 1 FROM public.erp_preparing_project_cartons c WHERE c.project_id=p_project_id
      AND c.carton_label LIKE stem||'-%' AND
      (c.school_id IS DISTINCT FROM p_school_id OR c.kit_name IS DISTINCT FROM p_kit_name))
  THEN stem := stem||'-'||upper(left(md5(p_kit_name||school.id::text),4)); END IF;
  SELECT coalesce(max(label_sequence),0)+1 INTO next_seq
    FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=p_school_id AND kit_name=p_kit_name AND generated_kit_label;

  FOR i IN 1..p_count LOOP
    final_label := stem||'-'||lpad((next_seq+i-1)::text,2,'0');
    -- A conflicting old/manual label is skipped, never overwritten or reassigned.
    WHILE EXISTS(SELECT 1 FROM public.erp_preparing_project_cartons
                 WHERE project_id=p_project_id AND carton_label=final_label) LOOP
      next_seq := next_seq+1;
      final_label := stem||'-'||lpad((next_seq+i-1)::text,2,'0');
    END LOOP;
    INSERT INTO public.erp_preparing_project_cartons
      (project_id,school_id,generated_kit_label,label_sequence,carton_label,kit_name,
       notes,created_by_id,updated_by_id)
    VALUES(p_project_id,p_school_id,true,next_seq+i-1,final_label,btrim(p_kit_name),
       '',p_member_id,p_member_id) RETURNING * INTO out_box;
    INSERT INTO public.erp_preparing_project_carton_audit
      (project_id,carton_id,action,details,changed_by_id)
    VALUES(p_project_id,out_box.id,'create',jsonb_build_object(
      'label',out_box.carton_label,'kit',out_box.kit_name,
      'school_id',p_school_id,'generated',true),p_member_id);
    created := created||jsonb_build_array(jsonb_build_object('id',out_box.id,'label',out_box.carton_label));
  END LOOP;
  RETURN jsonb_build_object('created',created,'count',p_count,'school_id',p_school_id,'kit_name',p_kit_name);
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_generate_school_kits_v395(uuid,uuid,text,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_generate_school_kits_v395(uuid,uuid,text,integer,text)
  TO service_role;
COMMIT;
