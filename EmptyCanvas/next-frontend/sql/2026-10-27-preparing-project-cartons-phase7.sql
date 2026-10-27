-- Projects Preparing Phase 7: shared project Kit cartons with auditable school allocations.
-- Additive to Phases 1-6. Old school cartons/receipts remain untouched.
-- Deploy this SQL BEFORE the matching application. No automatic migration of legacy cartons.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  carton_label text NOT NULL CHECK (char_length(btrim(carton_label)) BETWEEN 2 AND 100),
  kit_name text NOT NULL CHECK (char_length(btrim(kit_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','cancelled')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_by_id text NOT NULL,
  updated_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,carton_label)
);
CREATE INDEX IF NOT EXISTS idx_erp_prep_pool_cartons_project ON public.erp_preparing_project_cartons(project_id,created_at);

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_carton_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  carton_id uuid NOT NULL REFERENCES public.erp_preparing_project_cartons(id) ON DELETE CASCADE,
  product_id text NOT NULL DEFAULT '',
  product_name text NOT NULL CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 500),
  packed_qty integer NOT NULL CHECK (packed_qty BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(carton_id,product_id,product_name)
);
CREATE INDEX IF NOT EXISTS idx_erp_prep_pool_lines_project ON public.erp_preparing_project_carton_lines(project_id,carton_id);

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  carton_id uuid NOT NULL REFERENCES public.erp_preparing_project_cartons(id) ON DELETE RESTRICT,
  carton_line_id uuid NOT NULL REFERENCES public.erp_preparing_project_carton_lines(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE RESTRICT,
  shipment_id uuid NOT NULL REFERENCES public.erp_preparing_shipments(id) ON DELETE RESTRICT,
  allocated_qty integer NOT NULL CHECK (allocated_qty BETWEEN 1 AND 1000000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  created_by_id text NOT NULL,
  reversed_by_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shipment_id,component_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_prep_pool_alloc_project ON public.erp_preparing_project_allocations(project_id,carton_line_id,status);
CREATE INDEX IF NOT EXISTS idx_erp_prep_pool_alloc_school ON public.erp_preparing_project_allocations(school_id,status);

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_carton_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
  carton_id uuid REFERENCES public.erp_preparing_project_cartons(id) ON DELETE SET NULL,
  allocation_id uuid REFERENCES public.erp_preparing_project_allocations(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create','set_line','seal','allocate','reverse','cancel')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_prep_pool_audit ON public.erp_preparing_project_carton_audit(project_id,changed_at DESC);

ALTER TABLE public.erp_preparing_project_cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_project_carton_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_project_carton_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_project_cartons,public.erp_preparing_project_carton_lines,
 public.erp_preparing_project_allocations,public.erp_preparing_project_carton_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_project_carton_audit_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.erp_preparing_project_cartons,public.erp_preparing_project_carton_lines,
 public.erp_preparing_project_allocations TO service_role;
GRANT DELETE ON public.erp_preparing_project_carton_lines TO service_role;
GRANT SELECT,INSERT ON public.erp_preparing_project_carton_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.erp_preparing_project_carton_audit_id_seq TO service_role;

-- Legacy school-carton editing must never silently change quantities reserved from the project pool.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_project_allocation_line() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
  target := CASE WHEN TG_OP='DELETE' THEN OLD.shipment_id ELSE NEW.shipment_id END;
  IF current_setting('erp_preparing.pool_write',true) IS DISTINCT FROM 'enabled'
    AND EXISTS(SELECT 1 FROM public.erp_preparing_project_allocations WHERE shipment_id=target AND status='active')
  THEN RAISE EXCEPTION 'This line belongs to a project carton allocation. Manage it from Project Kit Cartons.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_guard_pool_lines ON public.erp_preparing_shipment_lines;
CREATE TRIGGER trg_erp_prep_guard_pool_lines BEFORE INSERT OR UPDATE OR DELETE
  ON public.erp_preparing_shipment_lines FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_project_allocation_line();

CREATE OR REPLACE FUNCTION public.erp_preparing_guard_project_allocation_shipment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF current_setting('erp_preparing.pool_write',true) IS DISTINCT FROM 'enabled'
    AND EXISTS(SELECT 1 FROM public.erp_preparing_project_allocations WHERE shipment_id=OLD.id AND status='active')
    AND (NEW.status='cancelled' OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.carton_label IS DISTINCT FROM OLD.carton_label)
  THEN RAISE EXCEPTION 'Cannot cancel or reassign a linked project carton from School Delivery.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_erp_prep_guard_pool_shipment ON public.erp_preparing_shipments;
CREATE TRIGGER trg_erp_prep_guard_pool_shipment BEFORE UPDATE
  ON public.erp_preparing_shipments FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_project_allocation_shipment();

CREATE OR REPLACE FUNCTION public.erp_preparing_create_project_carton(
  p_project_id uuid,p_carton_label text,p_kit_name text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE out_row public.erp_preparing_project_cartons%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project does not exist.'; END IF;
  IF char_length(btrim(coalesce(p_carton_label,''))) NOT BETWEEN 2 AND 100
    OR char_length(btrim(coalesce(p_kit_name,''))) NOT BETWEEN 1 AND 160
    OR char_length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Invalid carton label, Kit name or user.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_project_cartons WHERE project_id=p_project_id AND status<>'cancelled')>=500
  THEN RAISE EXCEPTION 'Maximum 500 active project cartons.'; END IF;
  INSERT INTO public.erp_preparing_project_cartons(project_id,carton_label,kit_name,notes,created_by_id,updated_by_id)
  VALUES(p_project_id,btrim(p_carton_label),btrim(p_kit_name),coalesce(p_notes,''),p_member_id,p_member_id)
  RETURNING * INTO out_row;
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,action,details,changed_by_id)
  VALUES(p_project_id,out_row.id,'create',jsonb_build_object('label',out_row.carton_label,'kit',out_row.kit_name),p_member_id);
  RETURN to_jsonb(out_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_set_project_carton_line(
  p_project_id uuid,p_carton_id uuid,p_source_component_id uuid,p_quantity integer,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE carton public.erp_preparing_project_cartons%ROWTYPE; source_item public.erp_preparing_components%ROWTYPE;
  existing public.erp_preparing_project_carton_lines%ROWTYPE; out_row public.erp_preparing_project_carton_lines%ROWTYPE;
  project_demand bigint; packed_elsewhere bigint;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO carton FROM public.erp_preparing_project_cartons WHERE project_id=p_project_id AND id=p_carton_id FOR UPDATE;
  IF NOT FOUND OR carton.status<>'draft' THEN RAISE EXCEPTION 'Only draft project cartons may be packed.'; END IF;
  IF p_expected_updated_at IS NULL OR carton.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
  THEN RAISE EXCEPTION 'Project carton changed. Refresh and retry.'; END IF;
  SELECT c.* INTO source_item FROM public.erp_preparing_components c
    JOIN public.erp_preparing_schools s ON s.id=c.school_id
    WHERE c.id=p_source_component_id AND s.project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a component from a captured Proposal in this project.'; END IF;
  IF NOT (carton.kit_name='General' AND jsonb_array_length(source_item.source_kits)=0)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(source_item.source_kits) AS k(item)
      WHERE k.item->>'kitName'=carton.kit_name)
  THEN RAISE EXCEPTION 'Component does not belong to the selected Kit.'; END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 1000000
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Invalid packed quantity or user.'; END IF;
  -- A project carton is a physical packing record, not unlimited virtual stock.
  -- Bound all active pool cartons for this Kit/product by the captured project BOM demand.
  SELECT coalesce(sum(c.planned_qty),0) INTO project_demand
  FROM public.erp_preparing_components c
  JOIN public.erp_preparing_schools s ON s.id=c.school_id
  WHERE s.project_id=p_project_id AND c.product_id=source_item.product_id
    AND lower(btrim(c.product_name))=lower(btrim(source_item.product_name))
    AND ((carton.kit_name='General' AND jsonb_array_length(c.source_kits)=0)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_kits) AS k(entry)
         WHERE k.entry->>'kitName'=carton.kit_name));
  SELECT coalesce(sum(l.packed_qty),0) INTO packed_elsewhere
  FROM public.erp_preparing_project_carton_lines l
  JOIN public.erp_preparing_project_cartons k ON k.id=l.carton_id
  WHERE k.project_id=p_project_id AND k.kit_name=carton.kit_name AND k.status<>'cancelled'
    AND l.product_id=source_item.product_id
    AND lower(btrim(l.product_name))=lower(btrim(source_item.product_name))
    AND NOT (k.id=carton.id AND l.product_name=source_item.product_name);
  IF packed_elsewhere+p_quantity>project_demand THEN
    RAISE EXCEPTION 'Total project cartons for this Kit/product exceed the captured project Proposal demand.';
  END IF;
  SELECT * INTO existing FROM public.erp_preparing_project_carton_lines
    WHERE carton_id=carton.id AND product_id=source_item.product_id AND product_name=source_item.product_name FOR UPDATE;
  IF p_quantity=0 THEN
    IF FOUND THEN DELETE FROM public.erp_preparing_project_carton_lines WHERE id=existing.id; END IF;
  ELSE
    IF NOT FOUND AND (SELECT count(*) FROM public.erp_preparing_project_carton_lines WHERE carton_id=carton.id)>=1000
    THEN RAISE EXCEPTION 'Maximum 1000 component types per carton.'; END IF;
    INSERT INTO public.erp_preparing_project_carton_lines(project_id,carton_id,product_id,product_name,packed_qty)
    VALUES(p_project_id,carton.id,source_item.product_id,source_item.product_name,p_quantity)
    ON CONFLICT(carton_id,product_id,product_name) DO UPDATE
      SET packed_qty=excluded.packed_qty,updated_at=clock_timestamp()
    RETURNING * INTO out_row;
  END IF;
  UPDATE public.erp_preparing_project_cartons SET updated_by_id=p_member_id,updated_at=clock_timestamp() WHERE id=carton.id;
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,action,details,changed_by_id)
  VALUES(p_project_id,carton.id,'set_line',jsonb_build_object('component',source_item.product_name,'quantity',p_quantity),p_member_id);
  RETURN CASE WHEN p_quantity=0 THEN jsonb_build_object('removed',true) ELSE to_jsonb(out_row) END;
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_seal_project_carton(
  p_project_id uuid,p_carton_id uuid,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE out_row public.erp_preparing_project_cartons%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  SELECT * INTO out_row FROM public.erp_preparing_project_cartons WHERE id=p_carton_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR out_row.status<>'draft' THEN RAISE EXCEPTION 'Only draft project cartons can be sealed.'; END IF;
  IF p_expected_updated_at IS NULL OR out_row.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
  THEN RAISE EXCEPTION 'Carton changed elsewhere. Refresh and retry.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_project_carton_lines WHERE carton_id=p_carton_id)
  THEN RAISE EXCEPTION 'Add at least one component before sealing.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Invalid user.'; END IF;
  UPDATE public.erp_preparing_project_cartons SET status='ready',updated_by_id=p_member_id,
    updated_at=clock_timestamp() WHERE id=p_carton_id RETURNING * INTO out_row;
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,action,changed_by_id)
  VALUES(p_project_id,p_carton_id,'seal',p_member_id);
  RETURN to_jsonb(out_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_allocate_project_carton(
  p_project_id uuid,p_carton_line_id uuid,p_school_id uuid,p_component_id uuid,p_quantity integer,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE school public.erp_preparing_schools%ROWTYPE; carton public.erp_preparing_project_cartons%ROWTYPE;
  pool_line public.erp_preparing_project_carton_lines%ROWTYPE; item public.erp_preparing_components%ROWTYPE;
  allocated integer; previously_packed integer; shipment_id uuid; allocation_id uuid;
  shipment_label text;
BEGIN
  -- Lock project first to serialize allocations across all beneficiary schools and avoid oversubscribing a shared carton.
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO school FROM public.erp_preparing_schools WHERE id=p_school_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School is not part of this project.'; END IF;
  SELECT * INTO pool_line FROM public.erp_preparing_project_carton_lines
    WHERE id=p_carton_line_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project carton line not found.'; END IF;
  SELECT * INTO carton FROM public.erp_preparing_project_cartons WHERE id=pool_line.carton_id FOR UPDATE;
  IF carton.status<>'ready' THEN RAISE EXCEPTION 'Seal the project carton before allocating.'; END IF;
  SELECT * INTO item FROM public.erp_preparing_components WHERE id=p_component_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a component from this school Proposal.'; END IF;
  IF item.product_id IS DISTINCT FROM pool_line.product_id
    OR lower(btrim(item.product_name)) IS DISTINCT FROM lower(btrim(pool_line.product_name))
  THEN RAISE EXCEPTION 'Chosen component does not match the project carton product.'; END IF;
  IF NOT (carton.kit_name='General' AND jsonb_array_length(item.source_kits)=0)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item.source_kits) AS k(entry)
      WHERE k.entry->>'kitName'=carton.kit_name)
  THEN RAISE EXCEPTION 'School component does not belong to this project carton Kit.'; END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Invalid allocation quantity or user.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
    AND stage_key='preparing' AND status='completed') THEN RAISE EXCEPTION 'Complete Sorting & Preparing at this school first.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
    AND stage_key IN ('packing','delivery','delivery_closing','installation','testing','final_closing'))
  THEN RAISE EXCEPTION 'School Packing is already completed; allocation is locked.'; END IF;
  SELECT coalesce(sum(allocated_qty),0) INTO allocated FROM public.erp_preparing_project_allocations
    WHERE carton_line_id=pool_line.id AND status='active';
  IF allocated+p_quantity>pool_line.packed_qty THEN RAISE EXCEPTION 'Not enough free units in this project carton.'; END IF;
  SELECT coalesce(sum(packed_qty),0) INTO previously_packed FROM public.erp_preparing_shipment_lines
    WHERE school_id=p_school_id AND component_id=p_component_id;
  IF previously_packed+p_quantity>item.prepared_qty
  THEN RAISE EXCEPTION 'Allocation exceeds remaining prepared units at this school.'; END IF;
  -- Use ONE school delivery batch for all product lines originating from this physical carton.
  -- That batch can later be dispatched/received once. Other schools get separate batches.
  SELECT a.shipment_id INTO shipment_id FROM public.erp_preparing_project_allocations a
    WHERE a.project_id=p_project_id AND a.carton_id=carton.id AND a.school_id=p_school_id
      AND a.status='active' LIMIT 1;
  IF shipment_id IS NULL THEN
    IF (SELECT count(*) FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status<>'cancelled')>=200
    THEN RAISE EXCEPTION 'Maximum 200 delivery batches per school.'; END IF;
    shipment_id:=gen_random_uuid();
    shipment_label:='POOL-'||left(carton.id::text,8)||'-'||shipment_id::text;
    INSERT INTO public.erp_preparing_shipments(id,school_id,carton_label,notes,created_by_id,updated_by_id)
    VALUES(shipment_id,p_school_id,shipment_label,
      left('Project Kit carton '||carton.carton_label||' ('||carton.kit_name||'). School allocation batch; one physical carton can supply several schools.',1000),
      p_member_id,p_member_id);
    INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
    VALUES(p_school_id,shipment_id,'create',jsonb_build_object('projectCarton',carton.carton_label),p_member_id);
  ELSIF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE id=shipment_id AND school_id=p_school_id AND status='draft') THEN
    RAISE EXCEPTION 'Linked school batch was already dispatched. Cannot add more components.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_shipment_lines WHERE shipment_id=shipment_id AND component_id=p_component_id)
  THEN RAISE EXCEPTION 'This Proposal item is already allocated from this carton. Reverse it before reallocating.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_shipment_lines WHERE school_id=p_school_id)>=9999
  THEN RAISE EXCEPTION 'Maximum 9999 shipment lines per school.'; END IF;
  -- The protected existing school batch can only be extended through this verified project allocation RPC.
  PERFORM set_config('erp_preparing.pool_write','enabled',true);
  UPDATE public.erp_preparing_shipments SET updated_by_id=p_member_id,updated_at=clock_timestamp()
    WHERE id=shipment_id;
  INSERT INTO public.erp_preparing_shipment_lines(shipment_id,component_id,school_id,packed_qty)
  VALUES(shipment_id,p_component_id,p_school_id,p_quantity);
  INSERT INTO public.erp_preparing_project_allocations(project_id,carton_id,carton_line_id,school_id,component_id,shipment_id,
    allocated_qty,created_by_id) VALUES(p_project_id,carton.id,pool_line.id,p_school_id,p_component_id,shipment_id,
    p_quantity,p_member_id) RETURNING id INTO allocation_id;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
  VALUES(p_school_id,shipment_id,'pack',jsonb_build_object('componentId',p_component_id,'newPacked',p_quantity,'source','project_carton'),p_member_id);
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,allocation_id,action,details,changed_by_id)
  VALUES(p_project_id,carton.id,allocation_id,'allocate',
    jsonb_build_object('schoolId',p_school_id,'componentId',p_component_id,'qty',p_quantity,'shipmentId',shipment_id),p_member_id);
  RETURN jsonb_build_object('allocationId',allocation_id,'shipmentId',shipment_id,'quantity',p_quantity);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_reverse_project_allocation(
  p_project_id uuid,p_allocation_id uuid,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE allocation public.erp_preparing_project_allocations%ROWTYPE;
  shipment public.erp_preparing_shipments%ROWTYPE; others integer;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO allocation FROM public.erp_preparing_project_allocations
    WHERE project_id=p_project_id AND id=p_allocation_id FOR UPDATE;
  IF NOT FOUND OR allocation.status<>'active' THEN RAISE EXCEPTION 'Active allocation not found.'; END IF;
  PERFORM id FROM public.erp_preparing_schools WHERE id=allocation.school_id FOR UPDATE;
  SELECT * INTO shipment FROM public.erp_preparing_shipments WHERE id=allocation.shipment_id FOR UPDATE;
  IF shipment.status<>'draft' THEN RAISE EXCEPTION 'Only undispatched project allocations may be reversed.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=allocation.school_id AND status='completed'
    AND stage_key IN ('packing','delivery','delivery_closing','installation','testing','final_closing'))
  THEN RAISE EXCEPTION 'Reopen Packing and later completed stages before reversing.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Invalid user.'; END IF;
  PERFORM set_config('erp_preparing.pool_write','enabled',true);
  SELECT count(*) INTO others FROM public.erp_preparing_project_allocations
    WHERE shipment_id=allocation.shipment_id AND status='active' AND id<>allocation.id;
  DELETE FROM public.erp_preparing_shipment_lines
    WHERE shipment_id=allocation.shipment_id AND component_id=allocation.component_id;
  IF others=0 THEN
    UPDATE public.erp_preparing_shipments SET status='cancelled',updated_by_id=p_member_id,updated_at=clock_timestamp()
      WHERE id=allocation.shipment_id;
  ELSE
    UPDATE public.erp_preparing_shipments SET updated_by_id=p_member_id,updated_at=clock_timestamp()
      WHERE id=allocation.shipment_id;
  END IF;
  UPDATE public.erp_preparing_project_allocations SET status='reversed',reversed_by_id=p_member_id,
    reversed_at=now(),updated_at=clock_timestamp() WHERE id=allocation.id;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
  VALUES(allocation.school_id,allocation.shipment_id,CASE WHEN others=0 THEN 'cancel' ELSE 'unpack' END,
    jsonb_build_object('allocationId',allocation.id,'componentId',allocation.component_id),p_member_id);
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,allocation_id,action,details,changed_by_id)
  VALUES(p_project_id,allocation.carton_id,allocation.id,'reverse',
    jsonb_build_object('schoolId',allocation.school_id,'qty',allocation.allocated_qty),p_member_id);
  RETURN jsonb_build_object('reversed',true,'allocationId',allocation.id);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_cancel_project_carton(
  p_project_id uuid,p_carton_id uuid,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE carton public.erp_preparing_project_cartons%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
  SELECT * INTO carton FROM public.erp_preparing_project_cartons WHERE id=p_carton_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR carton.status='cancelled' THEN RAISE EXCEPTION 'Active carton not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_project_allocations WHERE carton_id=p_carton_id AND status='active')
  THEN RAISE EXCEPTION 'Reverse every undispatched allocation before cancelling this carton.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Invalid user.'; END IF;
  UPDATE public.erp_preparing_project_cartons SET status='cancelled',updated_by_id=p_member_id,
    updated_at=clock_timestamp() WHERE id=p_carton_id;
  INSERT INTO public.erp_preparing_project_carton_audit(project_id,carton_id,action,changed_by_id)
  VALUES(p_project_id,p_carton_id,'cancel',p_member_id);
  RETURN jsonb_build_object('cancelled',true);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_guard_project_allocation_line() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_guard_project_allocation_shipment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_create_project_carton(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_set_project_carton_line(uuid,uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_seal_project_carton(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_allocate_project_carton(uuid,uuid,uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_reverse_project_allocation(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_cancel_project_carton(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_create_project_carton(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_set_project_carton_line(uuid,uuid,uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_seal_project_carton(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_allocate_project_carton(uuid,uuid,uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_reverse_project_allocation(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_cancel_project_carton(uuid,uuid,text) TO service_role;
COMMIT;
