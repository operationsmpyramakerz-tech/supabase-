-- Phase 4 v216: technical FOLLOW-UP only. Technical team performs work; Operations monitors it.
-- Requires phases 1-3. Additive tables. Existing school/stock/proposal rows unchanged.
-- Back up production. Run as privileged database administrator BEFORE deploying phase 4 code.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_technical_checklist (
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  milestone_key text NOT NULL CHECK (milestone_key IN ('site_ready','equipment_installed','cabling_and_safety','software_configured',
    'power_on','functional_tests','safety_validation','technical_handover')),
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','blocked','completed')),
  owner_name text NOT NULL DEFAULT '' CHECK(length(owner_name)<=160),
  due_date date,
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1500),
  evidence_url text NOT NULL DEFAULT '' CHECK(length(evidence_url)<=2048),
  completed_at timestamptz,
  updated_by_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(school_id,milestone_key)
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_technical_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 180),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  owner_name text NOT NULL DEFAULT '' CHECK(length(owner_name)<=160),
  due_date date,
  resolution_notes text NOT NULL DEFAULT '' CHECK(length(resolution_notes)<=2000),
  evidence_url text NOT NULL DEFAULT '' CHECK(length(evidence_url)<=2048),
  created_by_id text NOT NULL,
  updated_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_technical_issues_school ON public.erp_preparing_technical_issues(school_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.erp_preparing_technical_acceptance (
  school_id uuid PRIMARY KEY REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  technician_name text NOT NULL CHECK(length(btrim(technician_name)) BETWEEN 2 AND 160),
  confirmation_reference text NOT NULL CHECK(length(btrim(confirmation_reference)) BETWEEN 2 AND 160),
  confirmed_on date NOT NULL,
  evidence_url text NOT NULL DEFAULT '' CHECK(length(evidence_url)<=2048),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  updated_by_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_technical_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK(subject_kind IN ('checkpoint','issue','acceptance')),
  subject_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('save','create','update','invalidate')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_erp_preparing_technical_audit_school ON public.erp_preparing_technical_audit(school_id,changed_at DESC);
ALTER TABLE public.erp_preparing_technical_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_technical_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_technical_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_technical_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_technical_checklist,public.erp_preparing_technical_issues,
  public.erp_preparing_technical_acceptance,public.erp_preparing_technical_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.erp_preparing_technical_audit_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.erp_preparing_technical_checklist,
  public.erp_preparing_technical_issues,public.erp_preparing_technical_acceptance TO service_role;
GRANT SELECT,INSERT ON TABLE public.erp_preparing_technical_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.erp_preparing_technical_audit_id_seq TO service_role;

-- All technical operations serialize on the school's parent row, just like Packing/Stages.
CREATE OR REPLACE FUNCTION public.erp_preparing_save_technical_checkpoint(
  p_school_id uuid,p_key text,p_status text,p_owner text,p_due_date date,
  p_notes text,p_evidence_url text,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE phase text; previous public.erp_preparing_technical_checklist%ROWTYPE;
  updated public.erp_preparing_technical_checklist%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF p_key NOT IN ('site_ready','equipment_installed','cabling_and_safety','software_configured',
      'power_on','functional_tests','safety_validation','technical_handover')
    OR p_status NOT IN ('not_started','in_progress','blocked','completed')
    OR length(coalesce(p_owner,''))>160 OR length(coalesce(p_notes,''))>1500
    OR length(coalesce(p_evidence_url,''))>2048
    OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
    OR (p_status='completed' AND nullif(btrim(coalesce(p_owner,'')),'') IS NULL)
  THEN RAISE EXCEPTION 'Invalid technical checklist data.'; END IF;
  phase:=CASE WHEN p_key IN ('site_ready','equipment_installed','cabling_and_safety','software_configured') THEN 'installation' ELSE 'testing' END;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress
     WHERE school_id=p_school_id AND stage_key=CASE WHEN phase='installation' THEN 'delivery_closing' ELSE 'installation' END AND status='completed')
  THEN RAISE EXCEPTION 'Complete the preceding delivery/installation stage before technical follow-up.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key IN
    (CASE WHEN phase='installation' THEN 'installation' ELSE 'testing' END,'final_closing') AND status='completed')
    OR (phase='installation' AND EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='testing' AND status='completed'))
  THEN RAISE EXCEPTION 'Reopen completed technical stages before editing checkpoints.'; END IF;
  SELECT * INTO previous FROM public.erp_preparing_technical_checklist WHERE school_id=p_school_id AND milestone_key=p_key FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR previous.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
    THEN RAISE EXCEPTION 'Checkpoint changed elsewhere. Refresh and retry.'; END IF;
  ELSIF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Checkpoint version changed. Refresh and retry.'; END IF;
  INSERT INTO public.erp_preparing_technical_checklist(school_id,milestone_key,status,owner_name,due_date,notes,evidence_url,completed_at,updated_by_id)
  VALUES(p_school_id,p_key,p_status,btrim(coalesce(p_owner,'')),p_due_date,coalesce(p_notes,''),coalesce(p_evidence_url,''),
    CASE WHEN p_status='completed' THEN now() ELSE NULL END,p_member_id)
  ON CONFLICT(school_id,milestone_key) DO UPDATE SET status=EXCLUDED.status,owner_name=EXCLUDED.owner_name,
    due_date=EXCLUDED.due_date,notes=EXCLUDED.notes,evidence_url=EXCLUDED.evidence_url,
    completed_at=CASE WHEN EXCLUDED.status='completed' AND public.erp_preparing_technical_checklist.status='completed'
      THEN public.erp_preparing_technical_checklist.completed_at ELSE EXCLUDED.completed_at END,
    updated_by_id=EXCLUDED.updated_by_id,updated_at=clock_timestamp()
  RETURNING * INTO updated;
  INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
  VALUES(p_school_id,'checkpoint',p_key,'save',jsonb_build_object('from',to_jsonb(previous),'to',to_jsonb(updated)),p_member_id);
  -- Any changed technical checkpoint makes any earlier acceptance reference stale.
  IF phase IN ('installation','testing') THEN
    DELETE FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id;
    IF FOUND THEN
      INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
      VALUES(p_school_id,'acceptance',p_school_id::text,'invalidate',jsonb_build_object('reason','Technical checkpoint changed'),p_member_id);
    END IF;
  END IF;
  RETURN to_jsonb(updated);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_create_technical_issue(
  p_school_id uuid,p_title text,p_description text,p_severity text,p_owner text,p_due_date date,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE updated public.erp_preparing_technical_issues%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='delivery_closing' AND status='completed')
  THEN RAISE EXCEPTION 'Complete Delivery Handover before registering technical follow-up issues.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key IN ('testing','final_closing') AND status='completed')
  THEN RAISE EXCEPTION 'Reopen Testing before adding an issue.'; END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 180 OR length(coalesce(p_description,''))>2000
    OR length(coalesce(p_owner,''))>160 OR p_severity NOT IN ('low','medium','high','critical')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Invalid technical issue.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_technical_issues WHERE school_id=p_school_id)>=200 THEN
    RAISE EXCEPTION 'Maximum 200 technical issues per school.'; END IF;
  INSERT INTO public.erp_preparing_technical_issues(school_id,title,description,severity,owner_name,due_date,created_by_id,updated_by_id)
  VALUES(p_school_id,btrim(p_title),coalesce(p_description,''),p_severity,btrim(coalesce(p_owner,'')),p_due_date,p_member_id,p_member_id)
  RETURNING * INTO updated;
  INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
  VALUES(p_school_id,'issue',updated.id::text,'create',to_jsonb(updated),p_member_id);
  DELETE FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id;
  IF FOUND THEN
    INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
    VALUES(p_school_id,'acceptance',p_school_id::text,'invalidate',jsonb_build_object('reason','New technical issue'),p_member_id);
  END IF;
  RETURN to_jsonb(updated);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_update_technical_issue(
  p_school_id uuid,p_issue_id uuid,p_title text,p_description text,p_severity text,p_status text,
  p_owner text,p_due_date date,p_resolution_notes text,p_evidence_url text,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE previous public.erp_preparing_technical_issues%ROWTYPE;updated public.erp_preparing_technical_issues%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key IN ('testing','final_closing') AND status='completed')
  THEN RAISE EXCEPTION 'Reopen Testing before modifying issues.'; END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 180 OR length(coalesce(p_description,''))>2000
    OR length(coalesce(p_owner,''))>160 OR length(coalesce(p_resolution_notes,''))>2000
    OR length(coalesce(p_evidence_url,''))>2048 OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR p_severity NOT IN ('low','medium','high','critical') OR p_status NOT IN ('open','in_progress','resolved')
    OR (p_status='resolved' AND length(btrim(coalesce(p_resolution_notes,'')))<3)
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Invalid technical issue data.'; END IF;
  SELECT * INTO previous FROM public.erp_preparing_technical_issues WHERE id=p_issue_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Technical issue not found.'; END IF;
  IF p_expected_updated_at IS NULL OR previous.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
  THEN RAISE EXCEPTION 'Issue changed elsewhere. Refresh and retry.'; END IF;
  UPDATE public.erp_preparing_technical_issues SET title=btrim(p_title),description=coalesce(p_description,''),
    severity=p_severity,status=p_status,owner_name=btrim(coalesce(p_owner,'')),due_date=p_due_date,
    resolution_notes=coalesce(p_resolution_notes,''),evidence_url=coalesce(p_evidence_url,''),
    resolved_at=CASE WHEN p_status='resolved' THEN coalesce(previous.resolved_at,now()) ELSE NULL END,
    updated_by_id=p_member_id,updated_at=clock_timestamp()
  WHERE id=p_issue_id RETURNING * INTO updated;
  INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
  VALUES(p_school_id,'issue',p_issue_id::text,'update',jsonb_build_object('from',to_jsonb(previous),'to',to_jsonb(updated)),p_member_id);
  DELETE FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id;
  IF FOUND THEN
    INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
    VALUES(p_school_id,'acceptance',p_school_id::text,'invalidate',jsonb_build_object('reason','Technical issue changed'),p_member_id);
  END IF;
  RETURN to_jsonb(updated);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_record_technical_acceptance(
  p_school_id uuid,p_technician_name text,p_reference text,p_confirmed_on date,
  p_evidence_url text,p_notes text,p_expected_updated_at text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE previous public.erp_preparing_technical_acceptance%ROWTYPE;
  updated public.erp_preparing_technical_acceptance%ROWTYPE;
BEGIN
  PERFORM id FROM public.erp_preparing_schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key='installation' AND status='completed')
  THEN RAISE EXCEPTION 'Complete the Installation Follow-up stage first.'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_preparing_stage_progress WHERE school_id=p_school_id AND stage_key IN ('testing','final_closing') AND status='completed')
  THEN RAISE EXCEPTION 'Reopen Testing before editing technical acceptance.'; END IF;
  IF (SELECT count(*) FROM public.erp_preparing_technical_checklist WHERE school_id=p_school_id AND status='completed'
    AND milestone_key IN ('power_on','functional_tests','safety_validation','technical_handover'))<>4
    OR EXISTS(SELECT 1 FROM public.erp_preparing_technical_issues WHERE school_id=p_school_id AND status<>'resolved')
  THEN RAISE EXCEPTION 'Complete all testing checkpoints and resolve open technical issues first.'; END IF;
  IF length(btrim(coalesce(p_technician_name,''))) NOT BETWEEN 2 AND 160 OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
    OR p_confirmed_on IS NULL OR p_confirmed_on>current_date OR length(coalesce(p_notes,''))>1000
    OR length(coalesce(p_evidence_url,''))>2048 OR (coalesce(p_evidence_url,'')<>'' AND p_evidence_url !~* '^https://[^[:space:]]+$')
    OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Invalid technical acceptance reference, date or owner.'; END IF;
  SELECT * INTO previous FROM public.erp_preparing_technical_acceptance WHERE school_id=p_school_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR previous.updated_at IS DISTINCT FROM p_expected_updated_at::timestamptz
    THEN RAISE EXCEPTION 'Technical acceptance changed elsewhere. Refresh and retry.'; END IF;
  ELSIF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Acceptance has changed. Refresh and retry.'; END IF;
  INSERT INTO public.erp_preparing_technical_acceptance(school_id,technician_name,confirmation_reference,confirmed_on,evidence_url,notes,updated_by_id)
  VALUES(p_school_id,btrim(p_technician_name),btrim(p_reference),p_confirmed_on,coalesce(p_evidence_url,''),coalesce(p_notes,''),p_member_id)
  ON CONFLICT(school_id) DO UPDATE SET technician_name=EXCLUDED.technician_name,confirmation_reference=EXCLUDED.confirmation_reference,
    confirmed_on=EXCLUDED.confirmed_on,evidence_url=EXCLUDED.evidence_url,notes=EXCLUDED.notes,
    updated_by_id=EXCLUDED.updated_by_id,updated_at=clock_timestamp()
  RETURNING * INTO updated;
  INSERT INTO public.erp_preparing_technical_audit(school_id,subject_kind,subject_id,action,details,changed_by_id)
  VALUES(p_school_id,'acceptance',p_school_id::text,'save',jsonb_build_object('from',to_jsonb(previous),'to',to_jsonb(updated)),p_member_id);
  RETURN to_jsonb(updated);
END; $$;

-- Preserve all Phase 3 quantity and delivery gates; add transaction-locked phase 4 technical gates.
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


REVOKE ALL ON FUNCTION public.erp_preparing_save_technical_checkpoint(uuid,text,text,text,date,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_create_technical_issue(uuid,text,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_update_technical_issue(uuid,uuid,text,text,text,text,text,date,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_record_technical_acceptance(uuid,text,text,date,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_technical_checkpoint(uuid,text,text,text,date,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_create_technical_issue(uuid,text,text,text,text,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_update_technical_issue(uuid,uuid,text,text,text,text,text,date,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_record_technical_acceptance(uuid,text,text,date,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_save_stage(uuid,text,text,text,text) TO service_role;
COMMIT;
