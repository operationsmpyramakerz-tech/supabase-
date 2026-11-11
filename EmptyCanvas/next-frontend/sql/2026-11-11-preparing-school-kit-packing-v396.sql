-- v396 / Phase 2: per-physical-Kit packing manifests and irreversible completion.
-- Run AFTER v395. No legacy carton rows, movements, or labels are migrated.
-- IMPORTANT: Plan all school+Kit labels BEFORE initializing the group's packing plan.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_preparing_school_kit_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  kit_box_id uuid NOT NULL REFERENCES public.erp_preparing_project_cartons(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE RESTRICT,
  source_component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE RESTRICT,
  product_id text NOT NULL DEFAULT '',
  product_name text NOT NULL,
  expected_qty integer NOT NULL CHECK(expected_qty BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kit_box_id,source_component_id),
  UNIQUE(kit_box_id,product_id,product_name)
);
CREATE INDEX IF NOT EXISTS erp_prep_school_kit_targets_project
  ON public.erp_preparing_school_kit_targets(project_id,kit_box_id);
ALTER TABLE public.erp_preparing_school_kit_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_school_kit_targets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.erp_preparing_school_kit_targets TO service_role;

ALTER TABLE public.erp_preparing_project_carton_audit
  DROP CONSTRAINT IF EXISTS erp_preparing_project_carton_audit_action_check;
ALTER TABLE public.erp_preparing_project_carton_audit
  ADD CONSTRAINT erp_preparing_project_carton_audit_action_check
  CHECK (action IN ('create','set_line','seal','allocate','reverse','cancel','rename','kit_plan','kit_transfer','kit_complete'));

-- A new label would change the per-Kit quantities after a plan has been initialized.
-- Also protect a group that already had physical contents packed in v395.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_kit_group_size_v396()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.generated_kit_label AND (
    EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t
      JOIN public.erp_preparing_project_cartons b ON b.id=t.kit_box_id
      WHERE t.project_id=NEW.project_id AND t.school_id=NEW.school_id AND b.kit_name=NEW.kit_name)
    OR EXISTS(SELECT 1 FROM public.erp_preparing_project_carton_lines l
      JOIN public.erp_preparing_project_cartons b ON b.id=l.carton_id
      WHERE b.project_id=NEW.project_id AND b.school_id=NEW.school_id
        AND b.kit_name=NEW.kit_name AND b.generated_kit_label AND b.status<>'cancelled')
  ) THEN
    RAISE EXCEPTION 'Kit packing has started for this school/group. Cannot generate additional labels.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_kit_group_size_v396 ON public.erp_preparing_project_cartons;
CREATE TRIGGER trg_erp_prep_kit_group_size_v396 BEFORE INSERT
  ON public.erp_preparing_project_cartons FOR EACH ROW
  EXECUTE FUNCTION public.erp_preparing_guard_kit_group_size_v396();

-- Prevent partial box line quantities exceeding a frozen expected manifest.
-- The legacy/manual project pool remains untouched.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_kit_target_v396()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.erp_preparing_project_cartons%ROWTYPE; limit_qty integer;
BEGIN
  SELECT * INTO b FROM public.erp_preparing_project_cartons WHERE id=NEW.carton_id;
  IF NOT FOUND OR NOT b.generated_kit_label THEN RETURN NEW; END IF;
  IF b.status<>'draft' THEN RAISE EXCEPTION 'Packed Kit is locked.'; END IF;
  SELECT expected_qty INTO limit_qty FROM public.erp_preparing_school_kit_targets
    WHERE kit_box_id=NEW.carton_id AND product_id=NEW.product_id AND product_name=NEW.product_name;
  IF limit_qty IS NULL THEN RAISE EXCEPTION 'Prepare this school Kit packing plan before adding contents.'; END IF;
  IF NEW.packed_qty>limit_qty THEN
    RAISE EXCEPTION 'Kit target exceeded: expected %, requested %.',limit_qty,NEW.packed_qty;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_kit_target_v396 ON public.erp_preparing_project_carton_lines;
CREATE TRIGGER trg_erp_prep_kit_target_v396
  BEFORE INSERT OR UPDATE OF carton_id,product_id,product_name,packed_qty
  ON public.erp_preparing_project_carton_lines FOR EACH ROW
  EXECUTE FUNCTION public.erp_preparing_guard_kit_target_v396();

-- A completed physical Kit cannot silently be canceled and repacked elsewhere.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_completed_kit_v396()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF OLD.generated_kit_label AND OLD.status='ready' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Completed Kit is locked; use a dedicated audited reversal workflow.';
  END IF;
  IF OLD.generated_kit_label AND NEW.status='cancelled' AND EXISTS(
    SELECT 1 FROM public.erp_preparing_school_kit_targets WHERE kit_box_id=OLD.id
  ) THEN RAISE EXCEPTION 'Kit plan is locked; cannot cancel a planned physical label.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_completed_kit_v396 ON public.erp_preparing_project_cartons;
CREATE TRIGGER trg_erp_prep_completed_kit_v396 BEFORE UPDATE ON public.erp_preparing_project_cartons
  FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_completed_kit_v396();

-- Snapshot the SCHOOL's group BOM across ALL existing physical labels.
-- Every source_kits[].quantity is the school's total requirement for that group,
-- not a quantity to repeat per physical label. Deterministic remainder allocation
-- (lowest label_sequence first) preserves the full school quantity exactly.
CREATE OR REPLACE FUNCTION public.erp_preparing_initialize_school_kit_plan_v396(
  p_project_id uuid,p_school_id uuid,p_kit_name text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE box_count integer; box_rec record; component_rec record; total_qty bigint;
  source_qty bigint; target_qty bigint; base_qty bigint; remainder_qty bigint;
  already_packed bigint; packed_in_box bigint;
  counted integer:=0; row_no integer; grouped_total bigint:=0;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Signed-in user required.'; END IF;
  PERFORM 1 FROM public.erp_preparing_schools WHERE id=p_school_id AND project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'School is not in this project.'; END IF;
  SELECT count(*) INTO box_count FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=p_school_id AND kit_name=p_kit_name
      AND generated_kit_label AND status<>'cancelled';
  IF box_count<1 THEN RAISE EXCEPTION 'Generate school Kit labels first.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_project_cartons
    WHERE project_id=p_project_id AND school_id=p_school_id AND kit_name=p_kit_name
      AND generated_kit_label AND status='ready')
  THEN RAISE EXCEPTION 'Cannot change the plan of an already completed Kit.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t
    JOIN public.erp_preparing_project_cartons b ON b.id=t.kit_box_id
    WHERE t.project_id=p_project_id AND t.school_id=p_school_id AND b.kit_name=p_kit_name)
  THEN RAISE EXCEPTION 'Packing plan already initialized.'; END IF;

  -- Multiple captured rows for the same product in one group make the physical
  -- box line ambiguous; refuse rather than guess which row supplies the target.
  IF EXISTS (
    SELECT 1 FROM public.erp_preparing_components c WHERE c.school_id=p_school_id
      AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_kits) k(v)
          WHERE k.v->>'kitName'=p_kit_name))
    GROUP BY lower(btrim(c.product_id)),lower(btrim(c.product_name)) HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate components in the school Kit group: review the school BOM first.'; END IF;

  FOR component_rec IN
    SELECT c.* FROM public.erp_preparing_components c WHERE c.school_id=p_school_id
      AND ((p_kit_name='General' AND coalesce(jsonb_array_length(c.source_kits),0)=0)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_kits) k(v)
          WHERE k.v->>'kitName'=p_kit_name))
    ORDER BY c.item_order,c.id
  LOOP
    IF p_kit_name='General' THEN source_qty:=component_rec.planned_qty;
    ELSE
      SELECT coalesce(sum((k.v->>'quantity')::bigint),0) INTO source_qty
      FROM jsonb_array_elements(component_rec.source_kits) k(v)
      WHERE k.v->>'kitName'=p_kit_name;
    END IF;
    IF source_qty<=0 OR source_qty>100000000 THEN RAISE EXCEPTION 'Invalid school Kit quantity in Proposal.'; END IF;
    grouped_total:=grouped_total+source_qty;
    -- Respect quantities physically packed under v395 before manifests existed.
    -- Distribute only the UNPACKED school remainder, never rewrite prior work.
    SELECT coalesce(sum(l.packed_qty),0) INTO already_packed
      FROM public.erp_preparing_project_carton_lines l
      JOIN public.erp_preparing_project_cartons b ON b.id=l.carton_id
      WHERE b.project_id=p_project_id AND b.school_id=p_school_id AND b.kit_name=p_kit_name
        AND b.generated_kit_label AND b.status<>'cancelled'
        AND l.product_id=component_rec.product_id AND l.product_name=component_rec.product_name;
    IF already_packed>source_qty THEN RAISE EXCEPTION
      'Existing packed quantities exceed this school Kit BOM for %; unpack the excess before planning.',component_rec.product_name;
    END IF;
    base_qty:=(source_qty-already_packed)/box_count;
    remainder_qty:=mod(source_qty-already_packed,box_count);
    row_no:=0;
    FOR box_rec IN SELECT id FROM public.erp_preparing_project_cartons
      WHERE project_id=p_project_id AND school_id=p_school_id AND kit_name=p_kit_name
        AND generated_kit_label AND status<>'cancelled'
      ORDER BY label_sequence,id
    LOOP
      row_no:=row_no+1;
      SELECT coalesce(sum(l.packed_qty),0) INTO packed_in_box
        FROM public.erp_preparing_project_carton_lines l
        WHERE l.carton_id=box_rec.id AND l.product_id=component_rec.product_id
          AND l.product_name=component_rec.product_name;
      target_qty:=packed_in_box+base_qty+CASE WHEN row_no<=remainder_qty THEN 1 ELSE 0 END;
      IF target_qty>0 THEN
        INSERT INTO public.erp_preparing_school_kit_targets
          (project_id,kit_box_id,school_id,source_component_id,product_id,product_name,expected_qty)
        VALUES(p_project_id,box_rec.id,p_school_id,component_rec.id,
          component_rec.product_id,component_rec.product_name,target_qty);
        counted:=counted+1;
      END IF;
    END LOOP;
  END LOOP;
  IF grouped_total<box_count OR EXISTS (
    SELECT 1 FROM public.erp_preparing_project_cartons b
    WHERE b.project_id=p_project_id AND b.school_id=p_school_id AND b.kit_name=p_kit_name
      AND b.generated_kit_label AND b.status<>'cancelled'
      AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets t WHERE t.kit_box_id=b.id)
  ) THEN RAISE EXCEPTION 'More labels than available Kit contents. Reduce labels or fix the school Proposal.'; END IF;
  -- v395 may already contain manually packed draft lines. Check them against
  -- the new snapshot; never silently rewrite or discard physical quantities.
  IF EXISTS (
    SELECT 1 FROM public.erp_preparing_project_carton_lines l
    JOIN public.erp_preparing_project_cartons b ON b.id=l.carton_id
    LEFT JOIN public.erp_preparing_school_kit_targets t ON t.kit_box_id=b.id
      AND t.product_id=l.product_id AND t.product_name=l.product_name
    WHERE b.project_id=p_project_id AND b.school_id=p_school_id AND b.kit_name=p_kit_name
      AND b.generated_kit_label AND b.status<>'cancelled'
      AND (t.id IS NULL OR l.packed_qty>t.expected_qty)
  ) THEN RAISE EXCEPTION 'Existing packed quantities differ from planned Kit contents; no changes saved.'; END IF;
  INSERT INTO public.erp_preparing_project_carton_audit
    (project_id,action,details,changed_by_id)
  VALUES (p_project_id,'kit_plan',jsonb_build_object('school_id',p_school_id,
    'kit_name',p_kit_name,'labels',box_count,'component_targets',counted),p_member_id);
  RETURN jsonb_build_object('labels',box_count,'targets',counted,'kit_name',p_kit_name);
END; $$;

-- Transfer required contents from one DRAFT label to another in the SAME group.
-- Allows unequal real-world kit contents without changing school Proposal totals.
CREATE OR REPLACE FUNCTION public.erp_preparing_transfer_school_kit_target_v396(
  p_project_id uuid,p_from_box_id uuid,p_to_box_id uuid,p_source_component_id uuid,
  p_quantity integer,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE from_box public.erp_preparing_project_cartons%ROWTYPE;
  to_box public.erp_preparing_project_cartons%ROWTYPE;
  old_target public.erp_preparing_school_kit_targets%ROWTYPE;
  current_packed bigint; new_from_qty integer;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  IF p_from_box_id=p_to_box_id OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Choose two different Kits and a positive transfer quantity.'; END IF;
  SELECT * INTO from_box FROM public.erp_preparing_project_cartons WHERE id=p_from_box_id AND project_id=p_project_id FOR UPDATE;
  SELECT * INTO to_box FROM public.erp_preparing_project_cartons WHERE id=p_to_box_id AND project_id=p_project_id FOR UPDATE;
  IF from_box.id IS NULL OR to_box.id IS NULL OR from_box.status<>'draft' OR to_box.status<>'draft'
     OR NOT from_box.generated_kit_label OR NOT to_box.generated_kit_label
     OR from_box.school_id IS DISTINCT FROM to_box.school_id OR from_box.kit_name IS DISTINCT FROM to_box.kit_name
  THEN RAISE EXCEPTION 'Only draft labels of the same school and Kit group can share targets.'; END IF;
  SELECT * INTO old_target FROM public.erp_preparing_school_kit_targets
    WHERE kit_box_id=from_box.id AND source_component_id=p_source_component_id FOR UPDATE;
  IF NOT FOUND OR old_target.expected_qty<p_quantity THEN RAISE EXCEPTION 'Insufficient expected quantity to transfer.'; END IF;
  SELECT coalesce(sum(packed_qty),0) INTO current_packed FROM public.erp_preparing_project_carton_lines
    WHERE carton_id=from_box.id AND product_id=old_target.product_id AND product_name=old_target.product_name;
  new_from_qty:=old_target.expected_qty-p_quantity;
  IF current_packed>new_from_qty THEN RAISE EXCEPTION 'Unpack the source Kit before transferring its required quantity.'; END IF;
  IF new_from_qty=0 THEN
    DELETE FROM public.erp_preparing_school_kit_targets WHERE id=old_target.id;
  ELSE
    UPDATE public.erp_preparing_school_kit_targets SET expected_qty=new_from_qty,updated_at=clock_timestamp()
    WHERE id=old_target.id;
  END IF;
  INSERT INTO public.erp_preparing_school_kit_targets
    (project_id,kit_box_id,school_id,source_component_id,product_id,product_name,expected_qty)
  VALUES (p_project_id,to_box.id,to_box.school_id,old_target.source_component_id,
    old_target.product_id,old_target.product_name,p_quantity)
  ON CONFLICT (kit_box_id,source_component_id) DO UPDATE SET
    expected_qty=public.erp_preparing_school_kit_targets.expected_qty+excluded.expected_qty,
    updated_at=clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_school_kit_targets WHERE kit_box_id=from_box.id)
  THEN RAISE EXCEPTION 'A physical Kit must contain at least one component target.'; END IF;
  INSERT INTO public.erp_preparing_project_carton_audit
    (project_id,carton_id,action,details,changed_by_id)
  VALUES(p_project_id,from_box.id,'kit_transfer',jsonb_build_object(
    'to_box_id',to_box.id,'source_component_id',p_source_component_id,
    'component',old_target.product_name,'quantity',p_quantity),p_member_id);
  RETURN jsonb_build_object('transferred',p_quantity,'from',from_box.carton_label,'to',to_box.carton_label);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_complete_school_kit_v396(
  p_project_id uuid,p_kit_box_id uuid,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.erp_preparing_project_cartons%ROWTYPE; required_count integer;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO b FROM public.erp_preparing_project_cartons
    WHERE id=p_kit_box_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR NOT b.generated_kit_label OR b.status<>'draft'
  THEN RAISE EXCEPTION 'Only a draft school Kit label can be completed.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR p_expected_updated_at IS NULL
    OR b.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
  THEN RAISE EXCEPTION 'Kit changed or invalid user. Refresh before confirming.'; END IF;
  SELECT count(*) INTO required_count FROM public.erp_preparing_school_kit_targets WHERE kit_box_id=b.id;
  IF required_count=0 THEN RAISE EXCEPTION 'Initialize Kit packing plan first.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.erp_preparing_school_kit_targets t
    LEFT JOIN public.erp_preparing_project_carton_lines l ON l.carton_id=t.kit_box_id
      AND l.product_id=t.product_id AND l.product_name=t.product_name
    WHERE t.kit_box_id=b.id AND coalesce(l.packed_qty,0)<>t.expected_qty
  ) OR EXISTS(
    SELECT 1 FROM public.erp_preparing_project_carton_lines l
    WHERE l.carton_id=b.id AND NOT EXISTS(
      SELECT 1 FROM public.erp_preparing_school_kit_targets t
      WHERE t.kit_box_id=b.id AND t.product_id=l.product_id AND t.product_name=l.product_name)
  ) THEN RAISE EXCEPTION 'Kit contents are incomplete or differ from its packing manifest.'; END IF;
  UPDATE public.erp_preparing_project_cartons SET status='ready',updated_by_id=p_member_id,
    updated_at=clock_timestamp() WHERE id=b.id RETURNING * INTO b;
  INSERT INTO public.erp_preparing_project_carton_audit
    (project_id,carton_id,action,details,changed_by_id)
  VALUES(p_project_id,b.id,'kit_complete',jsonb_build_object(
    'label',b.carton_label,'school_id',b.school_id,'target_lines',required_count),p_member_id);
  RETURN to_jsonb(b);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_initialize_school_kit_plan_v396(uuid,uuid,text,text),
  public.erp_preparing_transfer_school_kit_target_v396(uuid,uuid,uuid,uuid,integer,text),
  public.erp_preparing_complete_school_kit_v396(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_initialize_school_kit_plan_v396(uuid,uuid,text,text),
  public.erp_preparing_transfer_school_kit_target_v396(uuid,uuid,uuid,uuid,integer,text),
  public.erp_preparing_complete_school_kit_v396(uuid,uuid,text,text)
  TO service_role;
COMMIT;
