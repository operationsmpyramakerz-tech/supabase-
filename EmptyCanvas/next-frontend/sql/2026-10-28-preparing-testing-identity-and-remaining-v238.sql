-- v238: Testing editor identity comes from the authenticated ERP session.
-- Each saved change keeps an append-only actor snapshot. The Components Testing
-- screen shows distinct authenticated contributors for each component.
-- Safe for existing v236 data: older author names remain blank (not guessed).
-- Apply after v236; take a database backup; run as postgres.
BEGIN;
ALTER TABLE public.erp_preparing_project_test_batches
 ADD COLUMN IF NOT EXISTS created_by_name text NOT NULL DEFAULT '';
ALTER TABLE public.erp_preparing_project_test_batches
 DROP CONSTRAINT IF EXISTS preparing_test_actor_name_len_chk;
ALTER TABLE public.erp_preparing_project_test_batches
 ADD CONSTRAINT preparing_test_actor_name_len_chk CHECK (length(created_by_name)<=160);

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
   coalesce(tech.technician_name,'') AS technician_name, coalesce(contrib.people,'[]'::jsonb) AS tested_by
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
  LEFT JOIN LATERAL (
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',user_rows.created_by_id,'name',user_rows.created_by_name)
     ORDER BY user_rows.created_by_name,user_rows.created_by_id),'[]'::jsonb) AS people
   FROM (
     SELECT DISTINCT ON (b.created_by_id) b.created_by_id,b.created_by_name
     FROM public.erp_preparing_project_test_lines ln
     JOIN public.erp_preparing_project_test_batches b ON b.id=ln.batch_id
     WHERE ln.item_id=i.id AND length(btrim(coalesce(b.created_by_name,'')))>0
     ORDER BY b.created_by_id,b.created_at DESC,b.id DESC
   ) user_rows
  ) contrib ON true
  WHERE i.project_id=p_project_id
 )
 SELECT jsonb_build_object(
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'name',product_name,'code',product_id,'required',required,
   'accepted',accepted,'received',received,'passed',passed,'failed',failed,
   'technicianName',technician_name,'testedBy',tested_by,'remaining',greatest(0,required-received),'pending',greatest(0,received-passed-failed),
   'mismatch',passed+failed>received OR accepted>passed
   ) ORDER BY product_name,id),'[]'::jsonb) FROM items),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'reference',b.reference,'notes',b.notes,'createdAt',b.created_at,'createdBy',b.created_by_id,'createdByName',b.created_by_name,
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


CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_record_v238(
 p_project_id uuid,p_reference text,p_notes text,p_lines jsonb,p_member_id text,p_actor_name text
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
  OR length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid testing record.'; END IF;
 total:=jsonb_array_length(p_lines);
 IF total NOT BETWEEN 1 AND 200
  OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) AS t(v))<>total
 THEN RAISE EXCEPTION 'Select 1-200 distinct components.'; END IF;
 INSERT INTO public.erp_preparing_project_test_batches(project_id,reference,notes,created_by_id,created_by_name)
 VALUES(p_project_id,btrim(p_reference),coalesce(p_notes,''),p_member_id,btrim(p_actor_name)) RETURNING id INTO batch;
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
  -- Actor comes from authenticated ERP account; ignore any client technicianName.
  technician:=btrim(p_actor_name);
  IF abs(dr)>1000000 OR abs(dp)>1000000 OR abs(df)>1000000
   OR (dr=0 AND dp=0 AND df=0) OR length(technician) NOT BETWEEN 1 AND 160
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


REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_record_v238(uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_record_v238(uuid,text,text,jsonb,text,text) TO service_role;
COMMIT;
