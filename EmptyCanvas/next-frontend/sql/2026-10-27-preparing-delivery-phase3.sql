-- Projects Preparing Phase 3: carton packing, shipment dispatch and signed school receipt.
-- ADDITIVE to Phase 1+2; nothing is deducted from warehouse stock and existing rows are preserved.
-- Back up production. Run BEFORE deploying matching Phase 3 code. Single transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  carton_label text NOT NULL CHECK (char_length(btrim(carton_label)) BETWEEN 2 AND 100),
  carrier text NOT NULL DEFAULT '' CHECK (char_length(carrier) <= 160),
  tracking_reference text NOT NULL DEFAULT '' CHECK (char_length(tracking_reference) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','dispatched','delivered','cancelled')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  recipient_name text NOT NULL DEFAULT '' CHECK (char_length(recipient_name) <= 160),
  receipt_reference text NOT NULL DEFAULT '' CHECK (char_length(receipt_reference) <= 160),
  receipt_url text NOT NULL DEFAULT '' CHECK (char_length(receipt_url) <= 2048),
  delivery_notes text NOT NULL DEFAULT '' CHECK (char_length(delivery_notes) <= 1000),
  created_by_id text NOT NULL,
  updated_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,carton_label)
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_shipments_school ON public.erp_preparing_shipments(school_id,created_at);
CREATE TABLE IF NOT EXISTS public.erp_preparing_shipment_lines (
  shipment_id uuid NOT NULL REFERENCES public.erp_preparing_shipments(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  packed_qty integer NOT NULL CHECK (packed_qty BETWEEN 1 AND 1000000),
  received_qty integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0 AND received_qty <= packed_qty),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(shipment_id,component_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_shipment_lines_school ON public.erp_preparing_shipment_lines(school_id,component_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_shipping_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.erp_preparing_shipments(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('create','pack','unpack','dispatch','receive','cancel')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_shipping_audit_school ON public.erp_preparing_shipping_audit(school_id,changed_at DESC);
ALTER TABLE public.erp_preparing_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_shipment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_shipping_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_shipments,public.erp_preparing_shipment_lines,public.erp_preparing_shipping_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_shipping_audit_id_seq FROM PUBLIC,anon,authenticated;
-- Explicit server-role permissions; the browser and anon/authenticated roles remain denied.
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.erp_preparing_shipments,public.erp_preparing_shipment_lines TO service_role;
GRANT SELECT,INSERT ON TABLE public.erp_preparing_shipping_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.erp_preparing_shipping_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.erp_preparing_create_shipment(
  p_school_id uuid,p_carton_label text,p_carrier text,p_tracking_reference text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE new_row public.erp_preparing_shipments%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_manifests WHERE school_id=p_school_id) THEN RAISE EXCEPTION 'Capture Proposal Components first.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
    AND stage_key='preparing' AND status='completed') THEN
    RAISE EXCEPTION 'Complete Sorting & Preparing before creating cartons.'; END IF;
  IF length(btrim(coalesce(p_carton_label,''))) NOT BETWEEN 2 AND 100
    OR length(coalesce(p_carrier,''))>160 OR length(coalesce(p_tracking_reference,''))>160
    OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid carton label, carrier, tracking reference or notes.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
     AND stage_key IN ('packing','delivery','delivery_closing','installation','testing','final_closing')) THEN
    RAISE EXCEPTION 'Packing stage is completed. Reopen later completed stages and packing before changing cartons.';
  END IF;
  IF (SELECT count(*) FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status<>'cancelled')>=200 THEN
    RAISE EXCEPTION 'Maximum 200 cartons per school.';
  END IF;
  INSERT INTO public.erp_preparing_shipments (school_id,carton_label,carrier,tracking_reference,notes,created_by_id,updated_by_id)
  VALUES(p_school_id,btrim(p_carton_label),coalesce(p_carrier,''),coalesce(p_tracking_reference,''),coalesce(p_notes,''),p_member_id,p_member_id)
  RETURNING * INTO new_row;
  INSERT INTO public.erp_preparing_shipping_audit (school_id,shipment_id,action,details,changed_by_id)
  VALUES(p_school_id,new_row.id,'create',jsonb_build_object('cartonLabel',new_row.carton_label),p_member_id);
  RETURN to_jsonb(new_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_pack_component(
  p_school_id uuid,p_shipment_id uuid,p_component_id uuid,p_quantity integer,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE shipment_row public.erp_preparing_shipments%ROWTYPE;
  component_row public.erp_preparing_components%ROWTYPE;
  prior public.erp_preparing_shipment_lines%ROWTYPE;
  updated_row public.erp_preparing_shipment_lines%ROWTYPE;
  others integer;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  SELECT * INTO shipment_row FROM public.erp_preparing_shipments WHERE id=p_shipment_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND OR shipment_row.status<>'draft' THEN RAISE EXCEPTION 'Only draft cartons can be edited.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
     AND stage_key IN ('packing','delivery','delivery_closing','installation','testing','final_closing')) THEN
    RAISE EXCEPTION 'Packing is completed. Reopen subsequent stages before editing.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
    AND stage_key='preparing' AND status='completed') THEN
    RAISE EXCEPTION 'Complete Sorting & Preparing before packing components.'; END IF;
  SELECT * INTO component_row FROM public.erp_preparing_components WHERE id=p_component_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not part of the school Proposal.'; END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 1000000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid packed quantity or user.';
  END IF;
  SELECT * INTO prior FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id AND component_id=p_component_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz THEN
      RAISE EXCEPTION 'Packing line changed elsewhere. Refresh before saving.';
    END IF;
  ELSIF p_expected_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Packing line no longer exists. Refresh before saving.';
  END IF;
  SELECT coalesce(sum(packed_qty),0) INTO others FROM public.erp_preparing_shipment_lines
    WHERE school_id=p_school_id AND component_id=p_component_id AND shipment_id<>p_shipment_id;
  IF others+p_quantity>component_row.prepared_qty THEN
    RAISE EXCEPTION 'Total packed across cartons cannot exceed the prepared quantity.';
  END IF;
  IF p_quantity>0 AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id AND component_id=p_component_id)
     AND (SELECT count(*) FROM public.erp_preparing_shipment_lines WHERE school_id=p_school_id)>=9999 THEN
    RAISE EXCEPTION 'Maximum shipment line limit reached for this school.'; END IF;
  IF p_quantity=0 THEN
    DELETE FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id AND component_id=p_component_id;
    UPDATE public.erp_preparing_shipments SET updated_at=clock_timestamp(),updated_by_id=p_member_id WHERE id=p_shipment_id;
    INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
    VALUES(p_school_id,p_shipment_id,'unpack',jsonb_build_object('componentId',p_component_id,'oldPacked',coalesce(prior.packed_qty,0)),p_member_id);
    RETURN jsonb_build_object('removed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id AND component_id=p_component_id)
    AND prior.packed_qty=p_quantity THEN RETURN to_jsonb(prior); END IF;
  INSERT INTO public.erp_preparing_shipment_lines(shipment_id,component_id,school_id,packed_qty)
    VALUES(p_shipment_id,p_component_id,p_school_id,p_quantity)
    ON CONFLICT(shipment_id,component_id) DO UPDATE
      SET packed_qty=excluded.packed_qty,updated_at=clock_timestamp()
    RETURNING * INTO updated_row;
  UPDATE public.erp_preparing_shipments SET updated_at=clock_timestamp(),updated_by_id=p_member_id WHERE id=p_shipment_id;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
  VALUES(p_school_id,p_shipment_id,'pack',jsonb_build_object('componentId',p_component_id,'oldPacked',coalesce(prior.packed_qty,0),'newPacked',p_quantity),p_member_id);
  RETURN to_jsonb(updated_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_cancel_draft_shipment(
  p_school_id uuid,p_shipment_id uuid,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE prior public.erp_preparing_shipments%ROWTYPE; updated_row public.erp_preparing_shipments%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  SELECT * INTO prior FROM public.erp_preparing_shipments WHERE id=p_shipment_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND OR prior.status<>'draft' THEN RAISE EXCEPTION 'Only a draft carton can be cancelled.'; END IF;
  IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
     OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Carton changed. Refresh before cancelling.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
    AND stage_key IN ('packing','delivery','delivery_closing','installation','testing','final_closing')) THEN
    RAISE EXCEPTION 'Reopen completed Packing and later stages before cancelling a carton.';
  END IF;
  -- Clear carton counts while preserving its header and audit history.
  DELETE FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id;
  UPDATE public.erp_preparing_shipments SET status='cancelled',updated_by_id=p_member_id,updated_at=clock_timestamp()
    WHERE id=p_shipment_id RETURNING * INTO updated_row;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
    VALUES(p_school_id,p_shipment_id,'cancel',jsonb_build_object('cartonLabel',prior.carton_label),p_member_id);
  RETURN to_jsonb(updated_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_dispatch_shipment(
  p_school_id uuid,p_shipment_id uuid,p_carrier text,p_tracking_reference text,p_notes text,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE prior public.erp_preparing_shipments%ROWTYPE; updated_row public.erp_preparing_shipments%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  SELECT * INTO prior FROM public.erp_preparing_shipments WHERE id=p_shipment_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND OR prior.status<>'draft' THEN RAISE EXCEPTION 'Only draft cartons can be dispatched.'; END IF;
  IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Carton changed elsewhere. Refresh before dispatch.';
  END IF;
  IF nullif(btrim(coalesce(p_carrier,'')),'') IS NULL OR length(p_carrier)>160 OR length(coalesce(p_tracking_reference,''))>160
     OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a transport provider / vehicle and valid details.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='packing' AND status='completed') THEN
    RAISE EXCEPTION 'Complete Packing & Dispatch stage before dispatching cartons.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id) THEN
    RAISE EXCEPTION 'Cannot dispatch an empty carton.';
  END IF;
  UPDATE public.erp_preparing_shipments SET status='dispatched',carrier=btrim(p_carrier),tracking_reference=coalesce(p_tracking_reference,''),
    notes=coalesce(p_notes,''),dispatched_at=now(),updated_by_id=p_member_id,updated_at=clock_timestamp()
  WHERE id=p_shipment_id RETURNING * INTO updated_row;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
  VALUES(p_school_id,p_shipment_id,'dispatch',jsonb_build_object('carrier',updated_row.carrier,'trackingReference',updated_row.tracking_reference),p_member_id);
  RETURN to_jsonb(updated_row);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_receive_shipment(
  p_school_id uuid,p_shipment_id uuid,p_items jsonb,p_recipient_name text,p_receipt_reference text,
  p_receipt_url text,p_delivery_notes text,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE prior public.erp_preparing_shipments%ROWTYPE; updated_row public.erp_preparing_shipments%ROWTYPE;
  num_rows integer;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  SELECT * INTO prior FROM public.erp_preparing_shipments WHERE id=p_shipment_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND OR prior.status<>'dispatched' THEN RAISE EXCEPTION 'Only dispatched cartons can be received.'; END IF;
  IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Carton changed elsewhere. Refresh before confirming receipt.';
  END IF;
  IF length(btrim(coalesce(p_recipient_name,''))) NOT BETWEEN 2 AND 160
     OR length(btrim(coalesce(p_receipt_reference,''))) NOT BETWEEN 2 AND 160
     OR length(coalesce(p_receipt_url,''))>2048 OR (coalesce(p_receipt_url,'')<>'' AND p_receipt_url !~* '^https://[^[:space:]]+$')
     OR length(coalesce(p_delivery_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Provide recipient, signed handover reference, and valid optional HTTPS evidence link.';
  END IF;
  num_rows:=jsonb_array_length(p_items);
  IF num_rows<1 OR num_rows>1000 OR num_rows<>(SELECT count(*) FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id) THEN
    RAISE EXCEPTION 'Include exactly every packed component line.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e(item)
    LEFT JOIN public.erp_preparing_shipment_lines l
      ON l.shipment_id=p_shipment_id AND l.component_id::text=(e.item->>'componentId')
    WHERE jsonb_typeof(e.item) IS DISTINCT FROM 'object' OR l.component_id IS NULL
       OR (e.item->>'received') !~ '^[0-9]{1,7}$'
       OR (e.item->>'received')::integer>l.packed_qty
  ) OR (SELECT count(DISTINCT e.item->>'componentId') FROM jsonb_array_elements(p_items) AS e(item))<>num_rows THEN
    RAISE EXCEPTION 'Invalid received units, duplicate components, or unexpected shipment items.';
  END IF;
  UPDATE public.erp_preparing_shipment_lines l SET received_qty=(i.item->>'received')::integer,updated_at=clock_timestamp()
  FROM jsonb_array_elements(p_items) AS i(item)
  WHERE l.shipment_id=p_shipment_id AND l.component_id::text=(i.item->>'componentId');
  UPDATE public.erp_preparing_shipments SET status='delivered',recipient_name=btrim(p_recipient_name),
    receipt_reference=btrim(p_receipt_reference),receipt_url=coalesce(p_receipt_url,''),
    delivery_notes=coalesce(p_delivery_notes,''),delivered_at=now(),updated_by_id=p_member_id,updated_at=clock_timestamp()
  WHERE id=p_shipment_id RETURNING * INTO updated_row;
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
  VALUES(p_school_id,p_shipment_id,'receive',jsonb_build_object('recipient',updated_row.recipient_name,
    'receiptReference',updated_row.receipt_reference,'lineItems',p_items),p_member_id);
  RETURN to_jsonb(updated_row);
END; $$;

-- Replace only the Preparing-stage RPC. Phases 1–3 remain ordered and quantities are locked at source.
CREATE OR REPLACE FUNCTION public.erp_preparing_save_stage(
  p_school_id uuid,p_stage_key text,p_status text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE keys text[]:=ARRAY['receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing','final_closing'];
  current_position integer; complete_before integer; completed_later boolean; rows_count integer; unmet integer;
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
    IF complete_before<>current_position-1 THEN RAISE EXCEPTION 'Complete the preceding stages first.'; END IF;
    IF current_position IN (1,2,3) THEN
      SELECT count(*),count(*) FILTER(WHERE CASE WHEN current_position=1 THEN received_qty<planned_qty
         WHEN current_position=2 THEN received_qty<planned_qty OR damaged_qty>0
         ELSE prepared_qty<planned_qty END)
      INTO rows_count,unmet FROM public.erp_preparing_components WHERE school_id=p_school_id;
      IF rows_count=0 THEN RAISE EXCEPTION 'Capture the school Proposal components first.'; END IF;
      IF unmet>0 THEN
        IF current_position=1 THEN RAISE EXCEPTION 'Receiving is incomplete. Check Components & QC.';
        ELSIF current_position=2 THEN RAISE EXCEPTION 'QC has unresolved damaged or missing units.';
        ELSE RAISE EXCEPTION 'Prepare all required components before completing this stage.'; END IF;
      END IF;
    ELSIF current_position=4 THEN
      SELECT count(*),count(*) FILTER(WHERE coalesce((SELECT sum(l.packed_qty) FROM public.erp_preparing_shipment_lines l
        WHERE l.school_id=p_school_id AND l.component_id=c.id),0)<>c.planned_qty)
      INTO rows_count,unmet FROM public.erp_preparing_components c WHERE c.school_id=p_school_id;
      IF rows_count=0 OR unmet>0 THEN RAISE EXCEPTION 'Pack every required component into cartons before completing Packing.'; END IF;
    ELSIF current_position=5 THEN
      IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status IN ('dispatched','delivered')) OR EXISTS(
        SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status='draft') THEN
        RAISE EXCEPTION 'All cartons must be dispatched before completing School Delivery stage.';
      END IF;
    ELSIF current_position=6 THEN
      IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status='delivered') OR EXISTS(
        SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND (
          status IN ('draft','dispatched') OR (status='delivered' AND (btrim(recipient_name)='' OR btrim(receipt_reference)='')))) THEN
        RAISE EXCEPTION 'All cartons must have a recorded school recipient and signed handover reference.';
      END IF;
      IF EXISTS(SELECT 1 FROM public.erp_preparing_components c WHERE c.school_id=p_school_id
        AND coalesce((SELECT sum(l.received_qty) FROM public.erp_preparing_shipment_lines l
          WHERE l.school_id=p_school_id AND l.component_id=c.id),0)<>c.planned_qty) THEN
        RAISE EXCEPTION 'School receipt has quantity discrepancies. Reconcile shortages before Delivery Handover.';
      END IF;
    END IF;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
      AND status='completed' AND array_position(keys,stage_key)>current_position) INTO completed_later;
    IF completed_later THEN RAISE EXCEPTION 'Cannot reopen a stage while later stages are completed.'; END IF;
  END IF;
  INSERT INTO public.erp_preparing_stage_progress
    (school_id,stage_key,status,notes,updated_by_id,updated_at,completed_at)
  VALUES(p_school_id,p_stage_key,p_status,coalesce(p_notes,''),p_member_id,now(),
    CASE WHEN p_status='completed' THEN now() ELSE NULL END)
  ON CONFLICT(school_id,stage_key) DO UPDATE
    SET status=excluded.status,notes=excluded.notes,updated_by_id=excluded.updated_by_id,
      updated_at=now(),completed_at=excluded.completed_at
  RETURNING * INTO output_row;
  RETURN to_jsonb(output_row);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_create_shipment(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_pack_component(uuid,uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_cancel_draft_shipment(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_dispatch_shipment(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_receive_shipment(uuid,uuid,jsonb,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_create_shipment(uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_pack_component(uuid,uuid,uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_cancel_draft_shipment(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_dispatch_shipment(uuid,uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_receive_shipment(uuid,uuid,jsonb,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) TO service_role;
COMMIT;
