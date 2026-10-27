-- Projects Preparing Phase 2: per-school immutable Proposal snapshot + stock/QC progress.
-- ADDITIVE schema: preserves all Phase 1 rows. Run AFTER Phase 1 SQL and BEFORE Phase 2 code.
-- Requires existing erp_preparing_* tables, created by 2026-10-27-preparing-projects-phase1.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_manifests (
  school_id uuid PRIMARY KEY REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  proposal_id text NOT NULL,
  proposal_name text NOT NULL,
  proposal_updated_at text,
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 1000),
  created_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_manifests(school_id) ON DELETE CASCADE,
  proposal_item_id text NOT NULL,
  product_id text NOT NULL DEFAULT '',
  product_name text NOT NULL CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 500),
  source_kits jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_order integer NOT NULL,
  planned_qty integer NOT NULL CHECK (planned_qty BETWEEN 1 AND 1000000),
  received_qty integer NOT NULL DEFAULT 0 CHECK (received_qty BETWEEN 0 AND 1000000),
  damaged_qty integer NOT NULL DEFAULT 0 CHECK (damaged_qty BETWEEN 0 AND 1000000),
  prepared_qty integer NOT NULL DEFAULT 0 CHECK (prepared_qty BETWEEN 0 AND 1000000),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  updated_by_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preparing_qty_valid CHECK (damaged_qty <= received_qty AND prepared_qty <= received_qty - damaged_qty AND prepared_qty <= planned_qty),
  UNIQUE(school_id,proposal_item_id),
  UNIQUE(school_id,item_order)
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_components_school ON public.erp_preparing_components(school_id,item_order);
CREATE TABLE IF NOT EXISTS public.erp_preparing_component_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE CASCADE,
  old_received integer NOT NULL,
  old_damaged integer NOT NULL,
  old_prepared integer NOT NULL,
  old_notes text NOT NULL,
  new_received integer NOT NULL,
  new_damaged integer NOT NULL,
  new_prepared integer NOT NULL,
  new_notes text NOT NULL,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_component_audit_school ON public.erp_preparing_component_audit(school_id,changed_at DESC);
ALTER TABLE public.erp_preparing_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_component_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_manifests,public.erp_preparing_components,public.erp_preparing_component_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_component_audit_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.erp_preparing_initialize_manifest(
  p_school_id uuid, p_proposal_id text, p_proposal_name text,
  p_proposal_updated_at text, p_items jsonb, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  school_rec public.erp_preparing_schools%ROWTYPE;
  snapshot public.erp_preparing_manifests%ROWTYPE;
  item_count integer;
BEGIN
  SELECT * INTO school_rec FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF school_rec.proposal_id IS DISTINCT FROM p_proposal_id THEN RAISE EXCEPTION 'Proposal has changed. Refresh the school.'; END IF;
  IF p_member_id IS NULL OR length(btrim(p_member_id))=0 OR length(coalesce(p_proposal_name,'')) > 500
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid manifest payload.'; END IF;
  item_count:=jsonb_array_length(p_items);
  IF item_count < 1 OR item_count > 1000 THEN RAISE EXCEPTION 'Manifest must contain between 1 and 1000 items.'; END IF;
  IF EXISTS (SELECT 1 FROM public.erp_preparing_manifests WHERE school_id=p_school_id) THEN
    RAISE EXCEPTION 'This school already has a frozen component baseline.';
  END IF;
  -- Validate all source rows before writing anything. Fail the entire transaction on any bad row.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR nullif(btrim(item->>'itemId'),'') IS NULL
      OR length(coalesce(item->>'itemId',''))>500
      OR nullif(btrim(item->>'productName'),'') IS NULL
      OR length(coalesce(item->>'productName',''))>500
      OR (item->>'planned') !~ '^[0-9]{1,7}$'
      OR (item->>'planned')::integer NOT BETWEEN 1 AND 1000000
      OR jsonb_typeof(item->'sourceKits') IS DISTINCT FROM 'array'
  ) OR (SELECT count(DISTINCT item->>'itemId') FROM jsonb_array_elements(p_items) item)<>item_count THEN
    RAISE EXCEPTION 'Invalid or duplicated source proposal items.';
  END IF;
  -- Do not silently attach a new baseline to a school already beyond physical preparing.
  IF EXISTS (SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
    AND stage_key IN ('preparing','packing','delivery','delivery_closing','installation','testing','final_closing')) THEN
    RAISE EXCEPTION 'School preparing has already been completed. Reopen the completed stages before capturing a baseline.';
  END IF;
  INSERT INTO public.erp_preparing_manifests (school_id,proposal_id,proposal_name,proposal_updated_at,item_count,created_by_id)
  VALUES(p_school_id,p_proposal_id,p_proposal_name,p_proposal_updated_at,item_count,p_member_id) RETURNING * INTO snapshot;
  INSERT INTO public.erp_preparing_components
    (school_id,proposal_item_id,product_id,product_name,source_kits,item_order,planned_qty)
  SELECT p_school_id,item->>'itemId',coalesce(item->>'productId',''),item->>'productName',
    item->'sourceKits',ord::integer-1,(item->>'planned')::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS elements(item,ord);
  RETURN jsonb_build_object('schoolId',p_school_id,'count',item_count,'createdAt',snapshot.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_preparing_update_component(
  p_school_id uuid, p_component_id uuid,
  p_received integer, p_damaged integer, p_prepared integer,
  p_notes text, p_expected_updated_at text, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  prior public.erp_preparing_components%ROWTYPE;
  current_row public.erp_preparing_components%ROWTYPE;
BEGIN
  -- Per-school lock serializes writes against stage-completion RPCs.
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  SELECT * INTO prior FROM public.erp_preparing_components WHERE school_id=p_school_id AND id=p_component_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component not found for this school.'; END IF;
  IF coalesce(p_member_id,'')='' OR length(coalesce(p_notes,''))>1000
    OR p_received IS NULL OR p_damaged IS NULL OR p_prepared IS NULL
    OR p_received NOT BETWEEN 0 AND 1000000 OR p_damaged NOT BETWEEN 0 AND p_received
    OR p_prepared NOT BETWEEN 0 AND LEAST(prior.planned_qty,p_received-p_damaged)
    THEN RAISE EXCEPTION 'Invalid received, damaged or prepared quantities.'; END IF;
  IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'This row changed elsewhere. Refresh before saving.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
    AND stage_key IN ('preparing','packing','delivery','delivery_closing','installation','testing','final_closing')) THEN
    RAISE EXCEPTION 'Preparing is already complete. Reopen the subsequent completed stages before editing quantities.';
  END IF;
  IF p_received < prior.planned_qty AND EXISTS (
    SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
      AND stage_key='receiving' AND status='completed') THEN
    RAISE EXCEPTION 'Receiving stage is complete. Reopen it before recording a shortage.';
  END IF;
  IF (p_received < prior.planned_qty OR p_damaged>0) AND EXISTS (
    SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
      AND stage_key='quality' AND status='completed') THEN
    RAISE EXCEPTION 'QC stage is complete. Reopen it before recording damaged or missing units.';
  END IF;
  IF (prior.received_qty,prior.damaged_qty,prior.prepared_qty,prior.notes)
     IS NOT DISTINCT FROM (p_received,p_damaged,p_prepared,coalesce(p_notes,'')) THEN RETURN to_jsonb(prior); END IF;
  UPDATE public.erp_preparing_components SET
    received_qty=p_received,damaged_qty=p_damaged,prepared_qty=p_prepared,notes=coalesce(p_notes,''),
    updated_by_id=p_member_id,updated_at=clock_timestamp()
  WHERE id=p_component_id RETURNING * INTO current_row;
  INSERT INTO public.erp_preparing_component_audit
    (school_id,component_id,old_received,old_damaged,old_prepared,old_notes,
     new_received,new_damaged,new_prepared,new_notes,changed_by_id)
  VALUES (p_school_id,p_component_id,prior.received_qty,prior.damaged_qty,prior.prepared_qty,prior.notes,
    p_received,p_damaged,p_prepared,coalesce(p_notes,''),p_member_id);
  RETURN to_jsonb(current_row);
END;
$$;

-- Keep Phase 1 stage progression behavior, but enforce verified quantities for the first three stages.
-- If a school completed early stages before Phase 2, those historical records are NOT rewritten.
CREATE OR REPLACE FUNCTION public.erp_preparing_save_stage(
  p_school_id uuid, p_stage_key text, p_status text, p_notes text, p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  keys text[] := ARRAY['receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing','final_closing'];
  current_position integer;
  complete_before integer;
  completed_later boolean;
  rows_count integer;
  unmet integer;
  output_row public.erp_preparing_stage_progress%ROWTYPE;
BEGIN
  SELECT array_position(keys,p_stage_key) INTO current_position;
  IF current_position IS NULL OR p_status NOT IN ('not_started','in_progress','blocked','completed')
     OR length(coalesce(p_notes,''))>2000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid stage transition.';
  END IF;
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF p_status='completed' THEN
    SELECT count(*) INTO complete_before FROM public.erp_preparing_stage_progress
    WHERE school_id=p_school_id AND status='completed' AND array_position(keys,stage_key)<current_position;
    IF complete_before <> current_position-1 THEN RAISE EXCEPTION 'Complete the preceding stages first.'; END IF;
    IF current_position IN (1,2,3) THEN
      SELECT count(*),count(*) FILTER (WHERE
        CASE WHEN current_position=1 THEN received_qty<planned_qty
             WHEN current_position=2 THEN received_qty<planned_qty OR damaged_qty>0
             ELSE prepared_qty<planned_qty END)
      INTO rows_count,unmet FROM public.erp_preparing_components WHERE school_id=p_school_id;
      IF rows_count=0 THEN RAISE EXCEPTION 'Capture the school Proposal components before completing this stage.'; END IF;
      IF unmet>0 THEN
        IF current_position=1 THEN RAISE EXCEPTION 'Receiving is incomplete. Check missing quantities in Components & QC.';
        ELSIF current_position=2 THEN RAISE EXCEPTION 'QC has missing or damaged units. Reconcile before completing.';
        ELSE RAISE EXCEPTION 'Some components are not fully prepared. Check Components & QC.';
        END IF;
      END IF;
    END IF;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.erp_preparing_stage_progress
      WHERE school_id=p_school_id AND status='completed'
      AND array_position(keys,stage_key)>current_position) INTO completed_later;
    IF completed_later THEN RAISE EXCEPTION 'Cannot reopen a stage while later stages are completed.'; END IF;
  END IF;
  INSERT INTO public.erp_preparing_stage_progress
    (school_id,stage_key,status,notes,updated_by_id,updated_at,completed_at)
  VALUES(p_school_id,p_stage_key,p_status,coalesce(p_notes,''),p_member_id,now(),
    CASE WHEN p_status='completed' THEN now() ELSE NULL END)
  ON CONFLICT(school_id,stage_key)
  DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_by_id=excluded.updated_by_id,
    updated_at=now(),completed_at=excluded.completed_at RETURNING * INTO output_row;
  RETURN to_jsonb(output_row);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_preparing_initialize_manifest(uuid,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_update_component(uuid,uuid,integer,integer,integer,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_initialize_manifest(uuid,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_update_component(uuid,uuid,integer,integer,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) TO service_role;
COMMIT;
