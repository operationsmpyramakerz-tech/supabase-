-- Projects Preparing phase 5: documented, auditable school closing.
-- Requires completed Phase 1-4 migrations (including corrected Phase 4 SQL).
-- Server-only/RLS. Additive tables; no existing school data is changed.
-- BACK UP the production database before executing as a privileged SQL Editor role.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_closing_checks (
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  check_key text NOT NULL CHECK (check_key IN ('signed_handover','proposal_grades','custody_settlement','grace_review','technical_clearance','closing_archive')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','blocked')),
  reference text NOT NULL DEFAULT '' CHECK (length(reference)<=160),
  evidence_url text NOT NULL DEFAULT '' CHECK(length(evidence_url)<=2048),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1500),
  verified_on date,
  updated_by_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(school_id,check_key)
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_closing_approval (
  school_id uuid PRIMARY KEY REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  approver_name text NOT NULL CHECK(length(btrim(approver_name)) BETWEEN 2 AND 160),
  approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 2 AND 160),
  approved_on date NOT NULL,
  evidence_url text NOT NULL DEFAULT '' CHECK(length(evidence_url)<=2048),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1500),
  status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','reopened')),
  reopened_reason text NOT NULL DEFAULT '' CHECK(length(reopened_reason)<=1500),
  approved_by_id text NOT NULL,
  reopened_by_id text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_closing_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('check_save','approve','reopen')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_closing_audit_school ON public.erp_preparing_closing_audit(school_id,changed_at DESC);
ALTER TABLE public.erp_preparing_closing_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_closing_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_closing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_closing_checks,public.erp_preparing_closing_approval,public.erp_preparing_closing_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_closing_audit_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.erp_preparing_closing_checks,public.erp_preparing_closing_approval TO service_role;
GRANT SELECT,INSERT ON TABLE public.erp_preparing_closing_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.erp_preparing_closing_audit_id_seq TO service_role;

-- Save checklist evidence under the school lock. Cannot edit completed final closing.
CREATE OR REPLACE FUNCTION public.erp_preparing_save_closing_check(
  p_school_id uuid,p_key text,p_status text,p_reference text,p_evidence_url text,
  p_notes text,p_verified_on date,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE previous public.erp_preparing_closing_checks%ROWTYPE; result_row public.erp_preparing_closing_checks%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='final_closing' AND status='completed')
  THEN RAISE EXCEPTION 'Reopen the school through Final Closing before changing evidence.'; END IF;
  IF p_key NOT IN ('signed_handover','proposal_grades','custody_settlement','grace_review','technical_clearance','closing_archive')
    OR p_status NOT IN ('pending','verified','blocked')
    OR length(coalesce(p_reference,''))>160 OR length(coalesce(p_notes,''))>1500
    OR length(coalesce(p_evidence_url,''))>2048
    OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
    OR (p_status='verified' AND (length(btrim(coalesce(p_reference,'')))<2 OR p_verified_on IS NULL OR p_verified_on>(now() AT TIME ZONE 'Africa/Cairo')::date))
  THEN RAISE EXCEPTION 'Invalid closing checklist entry. Verified checks require a real reference and verification date.'; END IF;
  IF p_status='verified' AND p_key='grace_review' AND (
    NOT EXISTS(SELECT 1 FROM public.erp_preparing_closing_checks WHERE school_id=p_school_id
      AND check_key='signed_handover' AND status='verified' AND verified_on IS NOT NULL)
    OR p_verified_on < (SELECT verified_on + 7 FROM public.erp_preparing_closing_checks
      WHERE school_id=p_school_id AND check_key='signed_handover' AND status='verified')
  ) THEN RAISE EXCEPTION 'Seven days must elapse from the documented signed handover date before verifying the receipt review.'; END IF;
  IF p_status='verified' AND p_key='technical_clearance' AND NOT EXISTS(
    SELECT 1 FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id)
  THEN RAISE EXCEPTION 'Technical acceptance must be recorded before technical clearance can be verified.'; END IF;
  SELECT * INTO previous FROM public.erp_preparing_closing_checks WHERE school_id=p_school_id AND check_key=p_key FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR previous.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
    THEN RAISE EXCEPTION 'Closing check changed elsewhere. Refresh and retry.'; END IF;
  ELSIF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Closing check version changed. Refresh and retry.'; END IF;
  INSERT INTO public.erp_preparing_closing_checks (school_id,check_key,status,reference,evidence_url,notes,verified_on,updated_by_id)
  VALUES(p_school_id,p_key,p_status,btrim(coalesce(p_reference,'')),coalesce(p_evidence_url,''),coalesce(p_notes,''),
    CASE WHEN p_status='verified' THEN p_verified_on ELSE NULL END,p_member_id)
  ON CONFLICT(school_id,check_key) DO UPDATE SET status=excluded.status,reference=excluded.reference,
    evidence_url=excluded.evidence_url,notes=excluded.notes,verified_on=excluded.verified_on,
    updated_by_id=excluded.updated_by_id,updated_at=clock_timestamp() RETURNING * INTO result_row;
  INSERT INTO public.erp_preparing_closing_audit(school_id,action,details,changed_by_id)
  VALUES(p_school_id,'check_save',jsonb_build_object('key',p_key,'before',to_jsonb(previous),'after',to_jsonb(result_row)),p_member_id);
  RETURN to_jsonb(result_row);
END; $$;

-- Single locked transaction: rechecks every prior prerequisite and writes approval + completed stage together.
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
     AND coalesce((SELECT sum(l.received_qty) FROM public.erp_preparing_shipment_lines l
       WHERE l.school_id=p_school_id AND l.component_id=c.id),0)<>c.planned_qty)
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

-- Reopen for corrections, preserving audit history. Only privileged server route exposes this RPC.
CREATE OR REPLACE FUNCTION public.erp_preparing_reopen_school(
  p_school_id uuid,p_reason text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE output_row public.erp_preparing_stage_progress%ROWTYPE;
  previous_approval public.erp_preparing_closing_approval%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id
    AND stage_key='final_closing' AND status='completed')
  THEN RAISE EXCEPTION 'School is not closed.'; END IF;
  IF length(btrim(coalesce(p_reason,'')))<10 OR length(p_reason)>1500
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'A documented reopening reason of at least 10 characters is required.'; END IF;
  UPDATE public.erp_preparing_stage_progress SET status='in_progress',notes='Reopened: '||btrim(p_reason),
    updated_by_id=p_member_id,updated_at=now(),completed_at=NULL
  WHERE school_id=p_school_id AND stage_key='final_closing' RETURNING * INTO output_row;
  SELECT * INTO previous_approval FROM public.erp_preparing_closing_approval WHERE school_id=p_school_id FOR UPDATE;
  UPDATE public.erp_preparing_closing_approval SET status='reopened',reopened_reason=btrim(p_reason),
    reopened_by_id=p_member_id,updated_at=clock_timestamp() WHERE school_id=p_school_id;
  INSERT INTO public.erp_preparing_closing_audit(school_id,action,details,changed_by_id)
  VALUES(p_school_id,'reopen',jsonb_build_object('reason',btrim(p_reason),'previous_approval',
    to_jsonb(previous_approval)),p_member_id);
  RETURN to_jsonb(output_row);
END; $$;

-- Prevent manual stage status updates from bypassing / reopening formal Closing.
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

REVOKE ALL ON FUNCTION public.erp_preparing_save_closing_check(uuid,text,text,text,text,text,date,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_finalize_school(uuid,text,text,date,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_reopen_school(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_closing_check(uuid,text,text,text,text,text,date,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_finalize_school(uuid,text,text,date,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_reopen_school(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) TO service_role;
COMMIT;
