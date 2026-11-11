-- v397 / Phase 3: School-specific outer cartons built ONLY from completed physical Kit labels.
-- Prerequisites: all migrations through v396. Run SQL BEFORE deploying the v397 app.
-- Additive: existing erp_preparing_project_cartons and legacy allocations are not migrated.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_preparing_school_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE RESTRICT,
  carton_label text NOT NULL CHECK (char_length(btrim(carton_label)) BETWEEN 2 AND 100),
  label_sequence integer NOT NULL CHECK (label_sequence > 0),
  status text NOT NULL DEFAULT 'ready' CHECK (status = 'ready'),
  created_by_id text NOT NULL CHECK (char_length(btrim(created_by_id)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,school_id,label_sequence),
  UNIQUE(project_id,carton_label)
);
CREATE INDEX IF NOT EXISTS idx_erp_school_cartons_school
  ON public.erp_preparing_school_cartons(project_id,school_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_preparing_school_carton_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
  carton_id uuid NOT NULL REFERENCES public.erp_preparing_school_cartons(id) ON DELETE RESTRICT,
  kit_box_id uuid NOT NULL UNIQUE REFERENCES public.erp_preparing_project_cartons(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_erp_school_carton_kits_carton
  ON public.erp_preparing_school_carton_kits(project_id,carton_id);

ALTER TABLE public.erp_preparing_school_cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_school_carton_kits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_school_cartons, public.erp_preparing_school_carton_kits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_school_cartons, public.erp_preparing_school_carton_kits TO service_role;

-- Transactional RPC is the only supported way to insert a school carton or its Kit links.
-- Once marked Packed, both the carton identity and membership remain immutable.
CREATE OR REPLACE FUNCTION public.erp_preparing_school_carton_insert_guard_v397()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF current_setting('erp_preparing.school_carton_write',true) IS DISTINCT FROM 'enabled' THEN
    RAISE EXCEPTION 'Create school cartons using the verified Pack Carton workflow.';
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.erp_preparing_school_carton_immutable_v397()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Packed school cartons and their Kit contents are immutable.';
END; $$;
DROP TRIGGER IF EXISTS trg_school_cartons_insert_v397 ON public.erp_preparing_school_cartons;
CREATE TRIGGER trg_school_cartons_insert_v397 BEFORE INSERT ON public.erp_preparing_school_cartons
  FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_school_carton_insert_guard_v397();
DROP TRIGGER IF EXISTS trg_school_carton_kits_insert_v397 ON public.erp_preparing_school_carton_kits;
CREATE TRIGGER trg_school_carton_kits_insert_v397 BEFORE INSERT ON public.erp_preparing_school_carton_kits
  FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_school_carton_insert_guard_v397();
DROP TRIGGER IF EXISTS trg_school_cartons_immutable_v397 ON public.erp_preparing_school_cartons;
CREATE TRIGGER trg_school_cartons_immutable_v397 BEFORE UPDATE OR DELETE ON public.erp_preparing_school_cartons
  FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_school_carton_immutable_v397();
DROP TRIGGER IF EXISTS trg_school_carton_kits_immutable_v397 ON public.erp_preparing_school_carton_kits;
CREATE TRIGGER trg_school_carton_kits_immutable_v397 BEFORE UPDATE OR DELETE ON public.erp_preparing_school_carton_kits
  FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_school_carton_immutable_v397();

CREATE OR REPLACE FUNCTION public.erp_preparing_pack_school_carton_v397(
  p_project_id uuid, p_school_id uuid, p_kit_box_ids uuid[], p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  school_rec public.erp_preparing_schools%ROWTYPE;
  new_carton public.erp_preparing_school_cartons%ROWTYPE;
  kits_count integer; valid_count integer; next_seq integer;
  school_code text; stem text; candidate text;
BEGIN
  -- One project-level lock serializes both carton label issuance and Kit assignment.
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO school_rec FROM public.erp_preparing_schools
    WHERE id=p_school_id AND project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'School does not belong to the selected project.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Signed-in ERP member is required.';
  END IF;
  kits_count:=coalesce(cardinality(p_kit_box_ids),0);
  IF kits_count NOT BETWEEN 1 AND 80 OR
     array_position(p_kit_box_ids,NULL) IS NOT NULL OR
     (SELECT count(DISTINCT box_id) FROM unnest(p_kit_box_ids) AS u(box_id)) <> kits_count
  THEN RAISE EXCEPTION 'Select 1 to 80 distinct completed school Kits.'; END IF;

  -- Ready status is the immutable, server-verified v396 packing completion.
  SELECT count(*) INTO valid_count FROM public.erp_preparing_project_cartons b
    WHERE b.id=ANY(p_kit_box_ids) AND b.project_id=p_project_id
      AND b.school_id=p_school_id AND b.generated_kit_label AND b.status='ready';
  IF valid_count<>kits_count THEN
    RAISE EXCEPTION 'Every selected Kit must be Packed and belong to this school and project.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_school_carton_kits k WHERE k.kit_box_id=ANY(p_kit_box_ids)) THEN
    RAISE EXCEPTION 'One or more Kits are already assigned to a packed carton.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.erp_preparing_project_cartons b WHERE b.id=ANY(p_kit_box_ids)
      AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t WHERE t.kit_box_id=b.id)
  ) OR EXISTS(
    SELECT 1 FROM public.erp_preparing_school_kit_targets t
    LEFT JOIN public.erp_preparing_project_carton_lines l ON l.carton_id=t.kit_box_id
      AND l.product_id=t.product_id AND l.product_name=t.product_name
    WHERE t.kit_box_id=ANY(p_kit_box_ids) AND coalesce(l.packed_qty,0)<>t.expected_qty
  ) OR EXISTS(
    SELECT 1 FROM public.erp_preparing_project_carton_lines l WHERE l.carton_id=ANY(p_kit_box_ids)
    AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t
      WHERE t.kit_box_id=l.carton_id AND t.product_id=l.product_id AND t.product_name=l.product_name)
  ) THEN RAISE EXCEPTION 'A selected Kit has incomplete or unexpected physical contents.'; END IF;

  IF (SELECT count(*) FROM public.erp_preparing_school_cartons WHERE project_id=p_project_id) >= 2000 THEN
    RAISE EXCEPTION 'This project exceeds the carton safety limit.';
  END IF;
  -- Reuse the school's existing prefix, preserving IDs if a school is renamed.
  SELECT regexp_replace(c.carton_label,'-[0-9]+$','') INTO stem
    FROM public.erp_preparing_school_cartons c WHERE c.project_id=p_project_id AND c.school_id=p_school_id
    ORDER BY c.label_sequence ASC LIMIT 1;
  IF stem IS NULL THEN
    school_code:=left(split_part(btrim(regexp_replace(upper(school_rec.beneficiary_name),'[^A-Z0-9]+',' ','g')),' ',1),12);
    IF school_code='' THEN school_code:='SCH'||upper(left(replace(p_school_id::text,'-',''),6)); END IF;
    stem:=school_code;
    IF EXISTS(SELECT 1 FROM public.erp_preparing_school_cartons c
              WHERE c.project_id=p_project_id AND c.school_id<>p_school_id
                AND c.carton_label LIKE stem||'-%') THEN
      stem:=left(school_code,8)||upper(left(replace(p_school_id::text,'-',''),4));
    END IF;
  END IF;
  SELECT coalesce(max(label_sequence),0)+1 INTO next_seq
    FROM public.erp_preparing_school_cartons WHERE project_id=p_project_id AND school_id=p_school_id;
  candidate:=stem||'-'||lpad(next_seq::text,2,'0');
  WHILE EXISTS(SELECT 1 FROM public.erp_preparing_school_cartons
               WHERE project_id=p_project_id AND carton_label=candidate) LOOP
    next_seq:=next_seq+1;
    candidate:=stem||'-'||lpad(next_seq::text,2,'0');
  END LOOP;

  PERFORM set_config('erp_preparing.school_carton_write','enabled',true);
  INSERT INTO public.erp_preparing_school_cartons
    (project_id,school_id,carton_label,label_sequence,status,created_by_id)
    VALUES(p_project_id,p_school_id,candidate,next_seq,'ready',btrim(p_member_id))
    RETURNING * INTO new_carton;
  INSERT INTO public.erp_preparing_school_carton_kits(project_id,carton_id,kit_box_id)
    SELECT p_project_id,new_carton.id,b.id FROM public.erp_preparing_project_cartons b
    WHERE b.id=ANY(p_kit_box_ids) ORDER BY b.kit_name,b.label_sequence,b.id;
  PERFORM set_config('erp_preparing.school_carton_write','',true);
  RETURN jsonb_build_object('carton_id',new_carton.id,'carton_label',new_carton.carton_label,
    'school_id',p_school_id,'kit_count',kits_count,'status','ready');
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_pack_school_carton_v397(uuid,uuid,uuid[],text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_pack_school_carton_v397(uuid,uuid,uuid[],text)
  TO service_role;
COMMIT;
