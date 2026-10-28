-- v235: independent PROJECT-level component testing, after warehouse receipt.
-- Does not mark school QC, technical commissioning or allocation complete.
-- Apply only after v234. Take a database backup first.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_test_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
 reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 2 AND 160),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 created_by_id text NOT NULL CHECK (length(btrim(created_by_id)) > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_test_ref ON public.erp_preparing_project_test_batches(project_id,lower(btrim(reference)));
CREATE INDEX IF NOT EXISTS idx_pr_test_history ON public.erp_preparing_project_test_batches(project_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_preparing_project_test_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.erp_preparing_project_test_batches(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.erp_preparing_warehouse_items(id) ON DELETE RESTRICT,
 passed_delta integer NOT NULL CHECK (passed_delta BETWEEN -1000000 AND 1000000),
 failed_delta integer NOT NULL CHECK (failed_delta BETWEEN -1000000 AND 1000000),
 CHECK (passed_delta <> 0 OR failed_delta <> 0),
 UNIQUE(batch_id,item_id)
);
CREATE INDEX IF NOT EXISTS idx_pr_test_line_project_item ON public.erp_preparing_project_test_lines(project_id,item_id);

ALTER TABLE public.erp_preparing_project_test_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_project_test_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_project_test_batches,public.erp_preparing_project_test_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_project_test_batches,public.erp_preparing_project_test_lines TO service_role;

CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_overview(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Project not found.';
 END IF;
 WITH receipts AS (
  SELECT item_id,coalesce(sum(accepted_delta),0)::bigint AS accepted
  FROM public.erp_preparing_warehouse_receipt_lines WHERE project_id=p_project_id GROUP BY item_id
 ), tested AS (
  SELECT item_id,coalesce(sum(passed_delta),0)::bigint AS passed,coalesce(sum(failed_delta),0)::bigint AS failed
  FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id GROUP BY item_id
 ), schools AS (
  SELECT count(*)::bigint AS total FROM public.erp_preparing_schools WHERE project_id=p_project_id
 ), items AS (
  SELECT i.id,i.product_name,i.product_id,
   (i.required_qty * (SELECT total FROM schools))::bigint AS required,
   coalesce(r.accepted,0)::bigint AS accepted,
   coalesce(t.passed,0)::bigint AS passed,
   coalesce(t.failed,0)::bigint AS failed
  FROM public.erp_preparing_warehouse_items i
  LEFT JOIN receipts r ON r.item_id=i.id
  LEFT JOIN tested t ON t.item_id=i.id
  WHERE i.project_id=p_project_id
 )
 SELECT jsonb_build_object(
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',product_name,'code',product_id,'required',required,'accepted',accepted,'passed',passed,'failed',failed,'pending',greatest(0,accepted-passed-failed),'mismatch',passed+failed>accepted) ORDER BY product_name,id),'[]'::jsonb) FROM items),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'reference',b.reference,'notes',b.notes,'createdAt',b.created_at,'createdBy',b.created_by_id,'lines',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',l.item_id,'passedDelta',l.passed_delta,'failedDelta',l.failed_delta)),'[]'::jsonb) FROM public.erp_preparing_project_test_lines l WHERE l.batch_id=b.id)) ORDER BY b.created_at DESC),'[]'::jsonb)
    FROM (SELECT * FROM public.erp_preparing_project_test_batches WHERE project_id=p_project_id ORDER BY created_at DESC LIMIT 100) b)
 ) INTO result;
 RETURN result;
END; $$;

-- An append-only, atomic test batch. Negative failed deltas allow a retest
-- of previously failed units; the matching positive passed delta preserves
-- both the current balances and the audit history.
CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_record(
 p_project_id uuid,p_reference text,p_notes text,p_lines jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; target uuid; new_passed bigint; new_failed bigint;
 prior_passed bigint; prior_failed bigint; accepted bigint; delta_passed integer; delta_failed integer;
 batch uuid; total integer;
BEGIN
 -- Same lock as the warehouse receipt/allocations RPCs: serialize updates per project.
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or archived.'; END IF;
 IF length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
  OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid testing record.'; END IF;
 total:=jsonb_array_length(p_lines);
 IF total NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) AS t(v))<>total
 THEN RAISE EXCEPTION 'Select 1-200 distinct components.'; END IF;
 INSERT INTO public.erp_preparing_project_test_batches(project_id,reference,notes,created_by_id)
 VALUES(p_project_id,btrim(p_reference),coalesce(p_notes,''),p_member_id) RETURNING id INTO batch;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
    OR coalesce(entry->>'itemId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(entry->>'passedDelta','') !~ '^-?[0-9]{1,7}$'
    OR coalesce(entry->>'failedDelta','') !~ '^-?[0-9]{1,7}$'
    OR coalesce(entry->>'expectedPassed','') !~ '^[0-9]{1,12}$'
    OR coalesce(entry->>'expectedFailed','') !~ '^[0-9]{1,12}$'
  THEN RAISE EXCEPTION 'Invalid test quantities.'; END IF;
  delta_passed:=(entry->>'passedDelta')::integer;
  delta_failed:=(entry->>'failedDelta')::integer;
  IF abs(delta_passed)>1000000 OR abs(delta_failed)>1000000 OR (delta_passed=0 AND delta_failed=0)
  THEN RAISE EXCEPTION 'Testing changes must be non-zero integers up to 1,000,000.'; END IF;
  SELECT id INTO target FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND id=(entry->>'itemId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not in project.'; END IF;
  SELECT coalesce(sum(accepted_delta),0) INTO accepted FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=target;
  SELECT coalesce(sum(passed_delta),0),coalesce(sum(failed_delta),0) INTO prior_passed,prior_failed
    FROM public.erp_preparing_project_test_lines WHERE item_id=target;
  IF prior_passed <> (entry->>'expectedPassed')::bigint OR prior_failed <> (entry->>'expectedFailed')::bigint
  THEN RAISE EXCEPTION 'Testing quantities changed. Refresh before saving.'; END IF;
  new_passed:=prior_passed+delta_passed;
  new_failed:=prior_failed+delta_failed;
  IF new_passed<0 OR new_failed<0 OR new_passed+new_failed>accepted
  THEN RAISE EXCEPTION 'Passed and failed quantities cannot exceed accepted warehouse stock or become negative.'; END IF;
  INSERT INTO public.erp_preparing_project_test_lines(batch_id,project_id,item_id,passed_delta,failed_delta)
    VALUES(batch,p_project_id,target,delta_passed,delta_failed);
 END LOOP;
 RETURN jsonb_build_object('batchId',batch,'lineCount',total);
END; $$;

-- Do not allow a later warehouse correction to invalidate existing testing.
-- This checks after each receipt line is appended, inside the same transaction.
CREATE OR REPLACE FUNCTION public.erp_preparing_testing_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE accepted bigint; tested bigint;
BEGIN
 SELECT coalesce(sum(accepted_delta),0) INTO accepted FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=NEW.item_id;
 SELECT coalesce(sum(passed_delta+failed_delta),0) INTO tested FROM public.erp_preparing_project_test_lines WHERE item_id=NEW.item_id;
 IF accepted<tested THEN RAISE EXCEPTION 'Warehouse correction would reduce received stock below already tested quantities.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS tr_preparing_testing_receipt_guard ON public.erp_preparing_warehouse_receipt_lines;
CREATE TRIGGER tr_preparing_testing_receipt_guard AFTER INSERT ON public.erp_preparing_warehouse_receipt_lines
 FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_testing_receipt_guard();

REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_overview(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_record(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_overview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_record(uuid,text,text,jsonb,text) TO service_role;
COMMIT;
