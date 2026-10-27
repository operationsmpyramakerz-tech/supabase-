-- Phase 8 v222: append-only school return ledger + controlled replacement dispatch.
-- Run AFTER phases 1-7, BEFORE v222 app deployment. No existing delivery row backfill/mutation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_delivery_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.erp_preparing_shipments(id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1500),
  reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 2 AND 160),
  evidence_url text NOT NULL DEFAULT '' CHECK (char_length(evidence_url)<=2048),
  created_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prep_returns_school_component ON public.erp_preparing_delivery_returns(school_id,component_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_replacement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL UNIQUE REFERENCES public.erp_preparing_shipments(id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES public.erp_preparing_components(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  reference text NOT NULL CHECK(char_length(btrim(reference)) BETWEEN 2 AND 160),
  reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 10 AND 1500),
  created_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prep_replacements_school_component ON public.erp_preparing_replacement_batches(school_id,component_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_reconciliation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('return','replacement_create','replacement_cancel')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prep_reconciliation_audit_school ON public.erp_preparing_reconciliation_audit(school_id,changed_at DESC);
ALTER TABLE public.erp_preparing_delivery_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_replacement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_reconciliation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_delivery_returns,public.erp_preparing_replacement_batches,public.erp_preparing_reconciliation_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_reconciliation_audit_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_delivery_returns,public.erp_preparing_replacement_batches,public.erp_preparing_reconciliation_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.erp_preparing_reconciliation_audit_id_seq TO service_role;

-- Return receipts and replacement metadata are immutable (even for service role).
CREATE OR REPLACE FUNCTION public.erp_preparing_immutable_reconciliation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Signed reconciliation history is append-only.'; END; $$;
DROP TRIGGER IF EXISTS trg_prep_returns_immutable ON public.erp_preparing_delivery_returns;
CREATE TRIGGER trg_prep_returns_immutable BEFORE UPDATE OR DELETE ON public.erp_preparing_delivery_returns
FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_immutable_reconciliation();
DROP TRIGGER IF EXISTS trg_prep_replacements_immutable ON public.erp_preparing_replacement_batches;
CREATE TRIGGER trg_prep_replacements_immutable BEFORE UPDATE OR DELETE ON public.erp_preparing_replacement_batches
FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_immutable_reconciliation();

-- Prevent school standard pack/unpack/cancel calls from changing replacement allocations.
-- Existing receive RPC may still update received_qty and dispatch the batch normally.
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_replacement_line() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.shipment_id ELSE NEW.shipment_id END;
  IF current_setting('erp_preparing.replacement_write',true) IS DISTINCT FROM 'enabled'
    AND EXISTS(SELECT 1 FROM public.erp_preparing_replacement_batches WHERE shipment_id=target)
    AND (TG_OP IN ('INSERT','DELETE') OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
         OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.component_id IS DISTINCT FROM OLD.component_id
         OR NEW.packed_qty IS DISTINCT FROM OLD.packed_qty)
  THEN RAISE EXCEPTION 'Replacement packing is immutable. Use Returns & Replacements.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prep_replacement_line_guard ON public.erp_preparing_shipment_lines;
CREATE TRIGGER trg_prep_replacement_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.erp_preparing_shipment_lines
FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_replacement_line();
CREATE OR REPLACE FUNCTION public.erp_preparing_guard_replacement_batch() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF current_setting('erp_preparing.replacement_write',true) IS DISTINCT FROM 'enabled'
    AND EXISTS(SELECT 1 FROM public.erp_preparing_replacement_batches WHERE shipment_id=OLD.id)
    AND (NEW.status='cancelled' OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.carton_label IS DISTINCT FROM OLD.carton_label)
  THEN RAISE EXCEPTION 'Cancel replacement only from Returns & Replacements.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prep_replacement_batch_guard ON public.erp_preparing_shipments;
CREATE TRIGGER trg_prep_replacement_batch_guard BEFORE UPDATE ON public.erp_preparing_shipments
FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_guard_replacement_batch();

CREATE OR REPLACE FUNCTION public.erp_preparing_record_school_return(
  p_school_id uuid,p_shipment_id uuid,p_component_id uuid,p_quantity integer,
  p_reference text,p_reason text,p_evidence_url text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE line_row public.erp_preparing_shipment_lines%ROWTYPE;
  returned bigint; entry public.erp_preparing_delivery_returns%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
    AND stage_key IN ('delivery_closing','installation','testing','final_closing'))
  THEN RAISE EXCEPTION 'Reopen Delivery Handover and later stages before recording returns.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE id=p_shipment_id AND school_id=p_school_id
    AND status='delivered' AND btrim(receipt_reference)<>'')
  THEN RAISE EXCEPTION 'Returns require an original signed school receipt.'; END IF;
  SELECT * INTO line_row FROM public.erp_preparing_shipment_lines
   WHERE shipment_id=p_shipment_id AND school_id=p_school_id AND component_id=p_component_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component not present on this signed receipt.'; END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000
    OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1500
    OR length(coalesce(p_evidence_url,''))>2048
    OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Return requires positive units, reason, signed reference and valid optional HTTPS evidence.'; END IF;
  SELECT coalesce(sum(quantity),0) INTO returned FROM public.erp_preparing_delivery_returns
    WHERE shipment_id=p_shipment_id AND component_id=p_component_id;
  IF returned+p_quantity>line_row.received_qty THEN RAISE EXCEPTION 'Returns exceed units originally signed as received.'; END IF;
  -- A return invalidates prior custody/archiving sign-off; retain old references in the audit trail.
  INSERT INTO public.erp_preparing_closing_audit (school_id,action,details,changed_by_id)
    SELECT p_school_id,'check_save',jsonb_build_object('reverifyAfterReturn',true,
      'oldCheck',to_jsonb(ch),'shipmentId',p_shipment_id,'componentId',p_component_id),p_member_id
    FROM public.erp_preparing_closing_checks ch
    WHERE ch.school_id=p_school_id AND ch.check_key IN ('custody_settlement','closing_archive') AND ch.status='verified';
  UPDATE public.erp_preparing_closing_checks SET status='pending',reference='',verified_on=NULL,
      notes='Reverification required after documented return.',updated_by_id=p_member_id,updated_at=clock_timestamp()
    WHERE school_id=p_school_id AND check_key IN ('custody_settlement','closing_archive') AND status='verified';
  INSERT INTO public.erp_preparing_delivery_returns
   (school_id,shipment_id,component_id,quantity,reference,reason,evidence_url,created_by_id)
   VALUES(p_school_id,p_shipment_id,p_component_id,p_quantity,btrim(p_reference),btrim(p_reason),coalesce(p_evidence_url,''),p_member_id)
   RETURNING * INTO entry;
  INSERT INTO public.erp_preparing_reconciliation_audit(school_id,action,details,changed_by_id)
   VALUES(p_school_id,'return',jsonb_build_object('returnId',entry.id,'shipmentId',p_shipment_id,
      'componentId',p_component_id,'quantity',p_quantity,'reference',entry.reference),p_member_id);
  RETURN to_jsonb(entry);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_create_replacement_batch(
  p_school_id uuid,p_component_id uuid,p_quantity integer,p_reference text,p_reason text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE planned integer; received bigint; returned bigint; reserved bigint;
  new_batch public.erp_preparing_shipments%ROWTYPE; label text;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='packing' AND status='completed')
  THEN RAISE EXCEPTION 'Complete initial Packing before issuing a replacement.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
      AND stage_key IN ('delivery','delivery_closing','installation','testing','final_closing'))
  THEN RAISE EXCEPTION 'Reopen School Delivery and later completed stages before replacement.'; END IF;
  SELECT planned_qty INTO planned FROM public.erp_preparing_components WHERE id=p_component_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component not in the captured school Proposal.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments s JOIN public.erp_preparing_shipment_lines l ON l.shipment_id=s.id
    WHERE s.school_id=p_school_id AND s.status='delivered' AND l.component_id=p_component_id)
  THEN RAISE EXCEPTION 'Record the original school handover before creating replacement units.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_shipment_lines l
      JOIN public.erp_preparing_shipments s ON s.id=l.shipment_id
      WHERE l.school_id=p_school_id AND l.component_id=p_component_id AND s.status IN ('draft','dispatched')
        AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_replacement_batches r WHERE r.shipment_id=s.id))
  THEN RAISE EXCEPTION 'Receive all original batches for this component before issuing a replacement.'; END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000
    OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1500
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Replacement requires positive units, documented reference and reason.'; END IF;
  SELECT coalesce(sum(l.received_qty),0) INTO received
    FROM public.erp_preparing_shipment_lines l JOIN public.erp_preparing_shipments s ON s.id=l.shipment_id
    WHERE l.school_id=p_school_id AND l.component_id=p_component_id AND s.status='delivered';
  SELECT coalesce(sum(quantity),0) INTO returned FROM public.erp_preparing_delivery_returns
    WHERE school_id=p_school_id AND component_id=p_component_id;
  SELECT coalesce(sum(l.packed_qty),0) INTO reserved
    FROM public.erp_preparing_replacement_batches r
    JOIN public.erp_preparing_shipments s ON s.id=r.shipment_id AND s.status IN ('draft','dispatched')
    JOIN public.erp_preparing_shipment_lines l ON l.shipment_id=r.shipment_id
    WHERE r.school_id=p_school_id AND r.component_id=p_component_id;
  IF received-returned+reserved+p_quantity>planned
  THEN RAISE EXCEPTION 'Replacement would exceed the outstanding net school receipt quantity.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status<>'cancelled')>=200
  THEN RAISE EXCEPTION 'Maximum 200 active batches per school.'; END IF;
  label:='RPL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,18));
  INSERT INTO public.erp_preparing_shipments
    (school_id,carton_label,notes,created_by_id,updated_by_id)
  VALUES(p_school_id,label,left('Replacement: '||btrim(p_reference)||' – '||btrim(p_reason),1000),p_member_id,p_member_id)
  RETURNING * INTO new_batch;
  INSERT INTO public.erp_preparing_shipment_lines(shipment_id,school_id,component_id,packed_qty)
    VALUES(new_batch.id,p_school_id,p_component_id,p_quantity);
  INSERT INTO public.erp_preparing_replacement_batches
    (school_id,shipment_id,component_id,quantity,reference,reason,created_by_id)
    VALUES(p_school_id,new_batch.id,p_component_id,p_quantity,btrim(p_reference),btrim(p_reason),p_member_id);
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
    VALUES(p_school_id,new_batch.id,'create',jsonb_build_object('replacement',true,'quantity',p_quantity,'reference',p_reference),p_member_id);
  INSERT INTO public.erp_preparing_reconciliation_audit(school_id,action,details,changed_by_id)
    VALUES(p_school_id,'replacement_create',jsonb_build_object('shipmentId',new_batch.id,'componentId',p_component_id,
      'quantity',p_quantity,'reference',p_reference),p_member_id);
  RETURN to_jsonb(new_batch);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_cancel_replacement_batch(
  p_school_id uuid,p_shipment_id uuid,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE batch public.erp_preparing_shipments%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_replacement_batches WHERE school_id=p_school_id AND shipment_id=p_shipment_id)
  THEN RAISE EXCEPTION 'Replacement batch not found.'; END IF;
  SELECT * INTO batch FROM public.erp_preparing_shipments WHERE id=p_shipment_id FOR UPDATE;
  IF batch.status<>'draft' THEN RAISE EXCEPTION 'Only draft replacement batches may be cancelled.'; END IF;
  IF p_expected_updated_at IS NULL OR batch.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
  THEN RAISE EXCEPTION 'Replacement batch changed. Refresh and retry.'; END IF;
  IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Verified user required.'; END IF;
  PERFORM set_config('erp_preparing.replacement_write','enabled',true);
  DELETE FROM public.erp_preparing_shipment_lines WHERE shipment_id=p_shipment_id;
  UPDATE public.erp_preparing_shipments SET status='cancelled',updated_by_id=p_member_id,updated_at=clock_timestamp()
    WHERE id=p_shipment_id;
  PERFORM set_config('erp_preparing.replacement_write','',true);
  INSERT INTO public.erp_preparing_shipping_audit(school_id,shipment_id,action,details,changed_by_id)
    VALUES(p_school_id,p_shipment_id,'cancel',jsonb_build_object('replacement',true),p_member_id);
  INSERT INTO public.erp_preparing_reconciliation_audit(school_id,action,details,changed_by_id)
    VALUES(p_school_id,'replacement_cancel',jsonb_build_object('shipmentId',p_shipment_id),p_member_id);
  RETURN jsonb_build_object('cancelled',true,'shipmentId',p_shipment_id);
END; $$;

-- Replace the latest Phase 5 versions, retaining every other stage and closing check.
-- Delivery Handover and Final Closing compare NET accepted receipts (gross signed minus documented returns).
CREATE OR REPLACE FUNCTION public.erp_preparing_save_stage(
  p_school_id uuid,p_stage_key text,p_status text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE keys text[]:=ARRAY['receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing','final_closing'];
  current_position integer; complete_before integer; completed_later boolean; rows_count integer; unmet integer;
  output_row public.erp_preparing_stage_progress%ROWTYPE;
BEGIN
  IF p_stage_key='final_closing' THEN
    RAISE EXCEPTION 'Use the dedicated Final Closing approval or reopening workflow.';
  END IF;
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
        WHERE l.school_id=p_school_id AND l.component_id=c.id
          AND NOT EXISTS(SELECT 1 FROM public.erp_preparing_replacement_batches r WHERE r.shipment_id=l.shipment_id)),0)<>c.planned_qty)
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
        AND (coalesce((SELECT sum(l.received_qty) FROM public.erp_preparing_shipment_lines l
          JOIN public.erp_preparing_shipments s ON s.id=l.shipment_id AND s.status='delivered'
          WHERE l.school_id=p_school_id AND l.component_id=c.id),0)
          - coalesce((SELECT sum(r.quantity) FROM public.erp_preparing_delivery_returns r
          WHERE r.school_id=p_school_id AND r.component_id=c.id),0))<>c.planned_qty) THEN
        RAISE EXCEPTION 'School receipt has quantity discrepancies. Reconcile shortages before Delivery Handover.';
      END IF;
    ELSIF current_position=7 THEN
      IF (SELECT count(*) FROM public.erp_preparing_technical_checklist WHERE school_id=p_school_id
          AND status='completed' AND milestone_key IN ('site_ready','equipment_installed','cabling_and_safety','software_configured'))<>4
      THEN RAISE EXCEPTION 'Complete all four installation checkpoints in Technical Follow-up first.'; END IF;
    ELSIF current_position=8 THEN
      IF (SELECT count(*) FROM public.erp_preparing_technical_checklist WHERE school_id=p_school_id
          AND status='completed' AND milestone_key IN ('power_on','functional_tests','safety_validation','technical_handover'))<>4
      THEN RAISE EXCEPTION 'Complete all four testing checkpoints first.'; END IF;
      IF EXISTS(SELECT 1 FROM public.erp_preparing_technical_issues WHERE school_id=p_school_id AND status<>'resolved')
      THEN RAISE EXCEPTION 'Resolve all technical issues before approving Testing.'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id
        AND btrim(technician_name)<>'' AND btrim(confirmation_reference)<>'')
      THEN RAISE EXCEPTION 'Record the technical team''s acceptance reference first.'; END IF;
    ELSIF current_position=9 THEN
      RAISE EXCEPTION 'Final School Closing is reserved for the documented Closing workflow in Phase 5.';
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

CREATE OR REPLACE FUNCTION public.erp_preparing_finalize_school(
  p_school_id uuid,p_approver_name text,p_reference text,p_approved_on date,
  p_evidence_url text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE output_row public.erp_preparing_stage_progress%ROWTYPE;
  previous public.erp_preparing_closing_approval%ROWTYPE;
  approval public.erp_preparing_closing_approval%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND status='completed'
      AND stage_key IN ('receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing'))<>8
  THEN RAISE EXCEPTION 'Complete all eight preceding stages before final closing.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='final_closing' AND status='completed')
  THEN RAISE EXCEPTION 'This school is already closed. Reopen it before a new approval.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_closing_checks WHERE school_id=p_school_id AND status='verified'
      AND length(btrim(reference))>=2 AND verified_on IS NOT NULL)<>6
  THEN RAISE EXCEPTION 'Verify all six Final Closing checklist records with evidence references.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status='delivered')
    OR EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status NOT IN ('delivered','cancelled'))
    OR EXISTS(SELECT 1 FROM public.erp_preparing_shipments WHERE school_id=p_school_id AND status='delivered'
      AND (btrim(recipient_name)='' OR btrim(receipt_reference)='' OR delivered_at IS NULL))
  THEN RAISE EXCEPTION 'School handover is incomplete or has unresolved shipments.'; END IF;
  IF (now() AT TIME ZONE 'Africa/Cairo')::date < (SELECT verified_on + 7 FROM public.erp_preparing_closing_checks
    WHERE school_id=p_school_id AND check_key='signed_handover' AND status='verified')
  THEN RAISE EXCEPTION 'Seven-day review from signed handover is not finished.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_components c WHERE c.school_id=p_school_id
     AND (coalesce((SELECT sum(l.received_qty) FROM public.erp_preparing_shipment_lines l
         JOIN public.erp_preparing_shipments s ON s.id=l.shipment_id AND s.status='delivered'
       WHERE l.school_id=p_school_id AND l.component_id=c.id),0)
       - coalesce((SELECT sum(r.quantity) FROM public.erp_preparing_delivery_returns r
         WHERE r.school_id=p_school_id AND r.component_id=c.id),0))<>c.planned_qty)
  THEN RAISE EXCEPTION 'Delivery quantities have discrepancies.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id
    AND length(btrim(confirmation_reference))>=2)
    OR EXISTS(SELECT 1 FROM public.erp_preparing_technical_issues WHERE school_id=p_school_id AND status<>'resolved')
  THEN RAISE EXCEPTION 'Technical sign-off or issue resolution is still pending.'; END IF;
  IF length(btrim(coalesce(p_approver_name,''))) NOT BETWEEN 2 AND 160
    OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
    OR p_approved_on IS NULL OR p_approved_on>(now() AT TIME ZONE 'Africa/Cairo')::date
    OR length(coalesce(p_evidence_url,''))>2048 OR length(coalesce(p_notes,''))>1500
    OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Valid Operations approver, reference and approval date are required.'; END IF;
  IF p_approved_on < (SELECT verified_on + 7 FROM public.erp_preparing_closing_checks
     WHERE school_id=p_school_id AND check_key='signed_handover' AND status='verified')
    OR p_approved_on < (SELECT max(verified_on) FROM public.erp_preparing_closing_checks WHERE school_id=p_school_id)
  THEN RAISE EXCEPTION 'Final approval date cannot precede completion of the school review and documented checks.'; END IF;
  SELECT * INTO previous FROM public.erp_preparing_closing_approval WHERE school_id=p_school_id FOR UPDATE;
  INSERT INTO public.erp_preparing_closing_approval
    (school_id,approver_name,approval_reference,approved_on,evidence_url,notes,status,reopened_reason,approved_by_id,reopened_by_id)
  VALUES(p_school_id,btrim(p_approver_name),btrim(p_reference),p_approved_on,
    coalesce(p_evidence_url,''),coalesce(p_notes,''),'approved','',p_member_id,NULL)
  ON CONFLICT(school_id) DO UPDATE SET approver_name=excluded.approver_name,
    approval_reference=excluded.approval_reference,approved_on=excluded.approved_on,
    evidence_url=excluded.evidence_url,notes=excluded.notes,status='approved',
    reopened_reason='',approved_by_id=excluded.approved_by_id,reopened_by_id=NULL,
    updated_at=clock_timestamp() RETURNING * INTO approval;
  INSERT INTO public.erp_preparing_stage_progress
    (school_id,stage_key,status,notes,updated_by_id,updated_at,completed_at)
  VALUES(p_school_id,'final_closing','completed','Final closing reference: '||btrim(p_reference),p_member_id,now(),now())
  ON CONFLICT(school_id,stage_key) DO UPDATE SET status='completed',notes=excluded.notes,
    updated_by_id=excluded.updated_by_id,updated_at=now(),completed_at=now() RETURNING * INTO output_row;
  INSERT INTO public.erp_preparing_closing_audit(school_id,action,details,changed_by_id)
  VALUES(p_school_id,'approve',jsonb_build_object('before',to_jsonb(previous),'approval',to_jsonb(approval),'stage',to_jsonb(output_row)),p_member_id);
  RETURN jsonb_build_object('stage',to_jsonb(output_row),'approval',to_jsonb(approval));
END; $$;

-- Explicit RPC access; browser sessions cannot call these or write ledger tables directly.
REVOKE ALL ON FUNCTION public.erp_preparing_record_school_return(uuid,uuid,uuid,integer,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_record_school_return(uuid,uuid,uuid,integer,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.erp_preparing_create_replacement_batch(uuid,uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_create_replacement_batch(uuid,uuid,integer,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.erp_preparing_cancel_replacement_batch(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_cancel_replacement_batch(uuid,uuid,text,text) TO service_role;
COMMIT;
