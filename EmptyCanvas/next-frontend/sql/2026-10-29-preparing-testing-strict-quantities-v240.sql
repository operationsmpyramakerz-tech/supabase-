-- v240: strict testing reconciliation. Does not modify historic results.
-- Apply AFTER v238. Existing mismatched historical rows remain readable;
-- the next edit of a row must bring it into balance.
-- Back up the database before running this migration on production.
BEGIN;
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
  IF new_received<0 OR new_passed<0 OR new_failed<0 OR new_passed+new_failed<>new_received
  THEN RAISE EXCEPTION 'Passed + Failed must equal Testing Received before you can save.'; END IF;
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
