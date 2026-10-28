-- v236: Project Testing is first, Warehouse Receiving follows Passed QC.
-- Requires v235. Non-destructive: past reports and receipts are left untouched.
-- Run as postgres in Supabase SQL Editor after a database backup.
BEGIN;

-- Per-item immutable baseline preserves existing v235 test results which used
-- warehouse stock as the original ceiling. New, untested items start at zero.
CREATE TABLE IF NOT EXISTS public.erp_preparing_project_test_legacy_intake (
 item_id uuid PRIMARY KEY REFERENCES public.erp_preparing_warehouse_items(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
 intake_qty bigint NOT NULL CHECK (intake_qty >= 0),
 migrated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.erp_preparing_project_test_legacy_intake (item_id,project_id,intake_qty)
SELECT t.item_id,t.project_id,greatest(coalesce(r.accepted,0),t.classified)
FROM (
 SELECT item_id,project_id,sum(passed_delta+failed_delta)::bigint AS classified
 FROM public.erp_preparing_project_test_lines GROUP BY item_id,project_id
) t LEFT JOIN (
 SELECT item_id,sum(accepted_delta)::bigint AS accepted
 FROM public.erp_preparing_warehouse_receipt_lines GROUP BY item_id
) r ON r.item_id=t.item_id
WHERE t.classified>0
ON CONFLICT (item_id) DO NOTHING;
ALTER TABLE public.erp_preparing_project_test_legacy_intake ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_project_test_legacy_intake FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.erp_preparing_project_test_legacy_intake TO service_role;

ALTER TABLE public.erp_preparing_project_test_lines
 ADD COLUMN IF NOT EXISTS received_delta integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS technician_name text NOT NULL DEFAULT '';
-- Old constraint required Passed or Failed to change; new reports may record
-- test intake before the technician has completed classification.
DO $drop_old_test_line_constraint$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='public.erp_preparing_project_test_lines'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%passed_delta%'
  AND pg_get_constraintdef(oid) LIKE '%failed_delta%'
  AND pg_get_constraintdef(oid) NOT LIKE '%received_delta%'
 LOOP
  EXECUTE format('ALTER TABLE public.erp_preparing_project_test_lines DROP CONSTRAINT %I',c.conname);
 END LOOP;
END;
$drop_old_test_line_constraint$;
ALTER TABLE public.erp_preparing_project_test_lines
 DROP CONSTRAINT IF EXISTS preparing_test_intake_change_chk;
ALTER TABLE public.erp_preparing_project_test_lines
 ADD CONSTRAINT preparing_test_intake_change_chk
 CHECK (received_delta BETWEEN -1000000 AND 1000000
 AND (received_delta<>0 OR passed_delta<>0 OR failed_delta<>0));
ALTER TABLE public.erp_preparing_project_test_lines
 DROP CONSTRAINT IF EXISTS preparing_test_technician_chk;
ALTER TABLE public.erp_preparing_project_test_lines
 ADD CONSTRAINT preparing_test_technician_chk
 CHECK (length(technician_name)<=160);

CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_overview(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL)
 THEN RAISE EXCEPTION 'Project not found.'; END IF;
 WITH receipts AS (
  SELECT item_id,coalesce(sum(accepted_delta),0)::bigint AS accepted
  FROM public.erp_preparing_warehouse_receipt_lines WHERE project_id=p_project_id GROUP BY item_id
 ), tested AS (
  SELECT item_id,coalesce(sum(received_delta),0)::bigint AS received,
    coalesce(sum(passed_delta),0)::bigint AS passed,coalesce(sum(failed_delta),0)::bigint AS failed
  FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id GROUP BY item_id
 ), schools AS (
  SELECT count(*)::bigint AS total FROM public.erp_preparing_schools WHERE project_id=p_project_id
 ), items AS (
  SELECT i.id,i.product_name,i.product_id,
   (i.required_qty * (SELECT total FROM schools))::bigint AS required,
   coalesce(r.accepted,0)::bigint AS accepted,
   (coalesce(l.intake_qty,0)+coalesce(t.received,0))::bigint AS received,
   coalesce(t.passed,0)::bigint AS passed,coalesce(t.failed,0)::bigint AS failed,
   coalesce(tech.technician_name,'') AS technician_name
  FROM public.erp_preparing_warehouse_items i
  LEFT JOIN receipts r ON r.item_id=i.id
  LEFT JOIN tested t ON t.item_id=i.id
  LEFT JOIN public.erp_preparing_project_test_legacy_intake l ON l.item_id=i.id
  LEFT JOIN LATERAL (
   SELECT ln.technician_name FROM public.erp_preparing_project_test_lines ln
   JOIN public.erp_preparing_project_test_batches b ON b.id=ln.batch_id
   WHERE ln.item_id=i.id AND length(btrim(ln.technician_name))>0
   ORDER BY b.created_at DESC,ln.id DESC LIMIT 1
  ) tech ON true
  WHERE i.project_id=p_project_id
 )
 SELECT jsonb_build_object(
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'name',product_name,'code',product_id,'required',required,
   'accepted',accepted,'received',received,'passed',passed,'failed',failed,
   'technicianName',technician_name,'pending',greatest(0,received-passed-failed),
   'mismatch',passed+failed>received OR accepted>passed
   ) ORDER BY product_name,id),'[]'::jsonb) FROM items),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'reference',b.reference,'notes',b.notes,'createdAt',b.created_at,'createdBy',b.created_by_id,
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'itemId',ln.item_id,'receivedDelta',ln.received_delta,
    'passedDelta',ln.passed_delta,'failedDelta',ln.failed_delta,
    'technicianName',ln.technician_name)),'[]'::jsonb)
    FROM public.erp_preparing_project_test_lines ln WHERE ln.batch_id=b.id)
   ) ORDER BY b.created_at DESC),'[]'::jsonb)
   FROM (SELECT * FROM public.erp_preparing_project_test_batches WHERE project_id=p_project_id
     ORDER BY created_at DESC LIMIT 100) b)
 ) INTO result;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_record(
 p_project_id uuid,p_reference text,p_notes text,p_lines jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; target uuid; new_received bigint; new_passed bigint; new_failed bigint;
 prior_received bigint; prior_passed bigint; prior_failed bigint; baseline bigint;
 warehouse_accepted bigint; dr integer; dp integer; df integer; technician text;
 batch uuid; total integer;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or archived.'; END IF;
 IF length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
  OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid testing record.'; END IF;
 total:=jsonb_array_length(p_lines);
 IF total NOT BETWEEN 1 AND 200
  OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) AS t(v))<>total
 THEN RAISE EXCEPTION 'Select 1-200 distinct components.'; END IF;
 INSERT INTO public.erp_preparing_project_test_batches(project_id,reference,notes,created_by_id)
 VALUES(p_project_id,btrim(p_reference),coalesce(p_notes,''),p_member_id) RETURNING id INTO batch;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
    OR coalesce(entry->>'itemId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(entry->>'receivedDelta','') !~ '^-?[0-9]{1,7}$'
    OR coalesce(entry->>'passedDelta','') !~ '^-?[0-9]{1,7}$'
    OR coalesce(entry->>'failedDelta','') !~ '^-?[0-9]{1,7}$'
    OR coalesce(entry->>'expectedReceived','') !~ '^[0-9]{1,12}$'
    OR coalesce(entry->>'expectedPassed','') !~ '^[0-9]{1,12}$'
    OR coalesce(entry->>'expectedFailed','') !~ '^[0-9]{1,12}$'
  THEN RAISE EXCEPTION 'Invalid test quantities.'; END IF;
  dr:=(entry->>'receivedDelta')::integer;
  dp:=(entry->>'passedDelta')::integer;
  df:=(entry->>'failedDelta')::integer;
  technician:=btrim(coalesce(entry->>'technicianName',''));
  IF abs(dr)>1000000 OR abs(dp)>1000000 OR abs(df)>1000000
   OR (dr=0 AND dp=0 AND df=0) OR length(technician) NOT BETWEEN 2 AND 160
  THEN RAISE EXCEPTION 'Invalid testing change or technician name.'; END IF;
  SELECT id INTO target FROM public.erp_preparing_warehouse_items
   WHERE project_id=p_project_id AND id=(entry->>'itemId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not in project.'; END IF;
  SELECT coalesce(intake_qty,0) INTO baseline
   FROM public.erp_preparing_project_test_legacy_intake WHERE item_id=target;
  baseline:=coalesce(baseline,0);
  SELECT baseline+coalesce(sum(received_delta),0),coalesce(sum(passed_delta),0),coalesce(sum(failed_delta),0)
   INTO prior_received,prior_passed,prior_failed
   FROM public.erp_preparing_project_test_lines WHERE item_id=target;
  IF prior_received<>(entry->>'expectedReceived')::bigint
    OR prior_passed<>(entry->>'expectedPassed')::bigint
    OR prior_failed<>(entry->>'expectedFailed')::bigint
  THEN RAISE EXCEPTION 'Testing quantities changed. Refresh before saving.'; END IF;
  new_received:=prior_received+dr;
  new_passed:=prior_passed+dp;
  new_failed:=prior_failed+df;
  SELECT coalesce(sum(accepted_delta),0) INTO warehouse_accepted
   FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=target;
  IF new_received<0 OR new_passed<0 OR new_failed<0 OR new_passed+new_failed>new_received
  THEN RAISE EXCEPTION 'Test Received must cover Passed and Failed quantities.'; END IF;
  IF new_passed<prior_passed AND new_passed<warehouse_accepted
  THEN RAISE EXCEPTION 'Cannot reduce Passed below warehouse quantities already received.'; END IF;
  INSERT INTO public.erp_preparing_project_test_lines(
   batch_id,project_id,item_id,received_delta,passed_delta,failed_delta,technician_name
  ) VALUES(batch,p_project_id,target,dr,dp,df,technician);
 END LOOP;
 RETURN jsonb_build_object('batchId',batch,'lineCount',total);
END; $$;

-- Replace old v235 AFTER INSERT guard; testing no longer depends on receipts.
-- New positive warehouse receipts must be covered by passed tests; existing
-- pre-migration warehouse quantities are grandfathered (not rewritten).
CREATE OR REPLACE FUNCTION public.erp_preparing_testing_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE total_accepted bigint; passed_total bigint; old_accepted bigint;
BEGIN
 SELECT coalesce(sum(accepted_delta),0) INTO total_accepted
 FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=NEW.item_id;
 old_accepted:=total_accepted-NEW.accepted_delta;
 SELECT coalesce(sum(passed_delta),0) INTO passed_total
 FROM public.erp_preparing_project_test_lines WHERE item_id=NEW.item_id;
 IF NEW.accepted_delta>0 AND total_accepted>greatest(old_accepted,passed_total)
 THEN RAISE EXCEPTION 'Warehouse Accepted cannot exceed Passed testing quantity; complete testing first.'; END IF;
 RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_overview(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_record(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_overview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_record(uuid,text,text,jsonb,text) TO service_role;
COMMIT;
