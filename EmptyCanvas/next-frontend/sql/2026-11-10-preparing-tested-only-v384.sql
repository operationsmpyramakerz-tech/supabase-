-- v384: tested-only ledger. Run after v240/v243; backup first, pause writes during cutover.
-- Review legacy failures before changing warehouse eligibility. See preflight SQL.
BEGIN;
LOCK TABLE public.erp_preparing_projects IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.erp_preparing_project_test_lines, public.erp_preparing_warehouse_receipt_lines IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.erp_preparing_project_test_lines ADD COLUMN tested_delta bigint;
DO $$
DECLARE legacy_failed_policy text := 'review'; -- choose 'exclude' (safe: keep old warehouse eligibility) or 'include' (preserve all tested counts after physical reconciliation)
BEGIN
 IF legacy_failed_policy NOT IN ('review','exclude','include') THEN RAISE EXCEPTION 'Invalid legacy_failed_policy.'; END IF;
 IF EXISTS (SELECT 1 FROM public.erp_preparing_project_test_lines GROUP BY item_id HAVING sum(failed_delta)<>0) AND legacy_failed_policy='review' THEN
  RAISE EXCEPTION 'Legacy failed units exist. Run preflight; select exclude or include after review.';
 END IF;
 UPDATE public.erp_preparing_project_test_lines SET tested_delta=passed_delta::bigint+CASE WHEN legacy_failed_policy='exclude' THEN 0 ELSE failed_delta::bigint END;
 IF EXISTS (SELECT 1 FROM public.erp_preparing_project_test_lines GROUP BY item_id HAVING sum(tested_delta)<0) THEN RAISE EXCEPTION 'Negative historical testing balance; reconcile before migration.'; END IF;
END $$;
ALTER TABLE public.erp_preparing_project_test_lines ALTER COLUMN tested_delta SET NOT NULL;
-- Legacy combined deltas may reach +/-2,000,000. New writes are limited to +/-1,000,000 by the RPC.
ALTER TABLE public.erp_preparing_project_test_lines ADD CONSTRAINT prep_tested_delta_range_v384 CHECK (tested_delta BETWEEN -2000000 AND 2000000);
-- Historic retests may net to zero; keep their original actor/timestamp/history.
-- Drop obsolete RPCs before removing their source columns; do not use CASCADE.
DROP FUNCTION IF EXISTS public.erp_preparing_project_testing_record(uuid,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.erp_preparing_project_testing_record_v238(uuid,text,text,jsonb,text,text);
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
  SELECT item_id,coalesce(sum(tested_delta),0)::bigint AS tested
  FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id GROUP BY item_id
 ), schools AS (
  SELECT count(*)::bigint AS total FROM public.erp_preparing_schools WHERE project_id=p_project_id
 ), items AS (
  SELECT i.id,i.product_name,i.product_id,
   (i.required_qty * (SELECT total FROM schools))::bigint AS required,
   coalesce(r.accepted,0)::bigint AS accepted,
   coalesce(t.tested,0)::bigint AS tested,
   coalesce(tech.technician_name,'') AS technician_name, coalesce(contrib.people,'[]'::jsonb) AS tested_by
  FROM public.erp_preparing_warehouse_items i
  LEFT JOIN receipts r ON r.item_id=i.id
  LEFT JOIN tested t ON t.item_id=i.id
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
   'accepted',accepted,'tested',tested,
   'technicianName',technician_name,'testedBy',tested_by,'remaining',greatest(0,required-tested),
   'mismatch',accepted>tested
   ) ORDER BY product_name,id),'[]'::jsonb) FROM items),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'reference',b.reference,'notes',b.notes,'createdAt',b.created_at,'createdBy',b.created_by_id,'createdByName',b.created_by_name,
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'itemId',ln.item_id,'testedDelta',ln.tested_delta,
    'technicianName',ln.technician_name)),'[]'::jsonb)
    FROM public.erp_preparing_project_test_lines ln WHERE ln.batch_id=b.id)
   ) ORDER BY b.created_at DESC),'[]'::jsonb)
   FROM (SELECT * FROM public.erp_preparing_project_test_batches WHERE project_id=p_project_id
     ORDER BY created_at DESC LIMIT 100) b)
 ) INTO result;
 RETURN result;
END; $$;



CREATE OR REPLACE FUNCTION public.erp_preparing_project_testing_record_v384(
 p_project_id uuid,p_reference text,p_notes text,p_lines jsonb,p_member_id text,p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; target uuid; prior_tested bigint; next_tested bigint; accepted bigint; dt bigint; batch uuid; total integer;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or archived.'; END IF;
 IF length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160 OR length(coalesce(p_notes,''))>1000
 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160
 OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid testing record.'; END IF;
 total:=jsonb_array_length(p_lines);
 IF total NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) t(v))<>total THEN RAISE EXCEPTION 'Select 1-200 distinct components.'; END IF;
 INSERT INTO public.erp_preparing_project_test_batches(project_id,reference,notes,created_by_id,created_by_name)
 VALUES(p_project_id,btrim(p_reference),coalesce(p_notes,''),p_member_id,btrim(p_actor_name)) RETURNING id INTO batch;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR coalesce(entry->>'itemId','') !~ '^[0-9a-fA-F-]{36}$'
   OR coalesce(entry->>'testedDelta','') !~ '^-?[0-9]{1,7}$' OR coalesce(entry->>'expectedTested','') !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'Invalid tested quantity.'; END IF;
  dt:=(entry->>'testedDelta')::bigint;
  IF dt=0 OR abs(dt)>1000000 THEN RAISE EXCEPTION 'Invalid tested change.'; END IF;
  SELECT id INTO target FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND id=(entry->>'itemId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not in project.'; END IF;
  SELECT coalesce(sum(tested_delta),0) INTO prior_tested FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id AND item_id=target;
  IF prior_tested<>(entry->>'expectedTested')::bigint THEN RAISE EXCEPTION 'Testing quantities changed. Refresh before saving.'; END IF;
  next_tested:=prior_tested+dt;
  SELECT coalesce(sum(accepted_delta),0) INTO accepted FROM public.erp_preparing_warehouse_receipt_lines WHERE project_id=p_project_id AND item_id=target;
  IF next_tested<0 OR (next_tested<prior_tested AND next_tested<accepted) THEN RAISE EXCEPTION 'Tested cannot be negative or reduced below warehouse received quantities.'; END IF;
  INSERT INTO public.erp_preparing_project_test_lines(batch_id,project_id,item_id,tested_delta,technician_name)
  VALUES(batch,p_project_id,target,dt,btrim(p_actor_name));
 END LOOP;
 RETURN jsonb_build_object('batchId',batch,'lineCount',total);
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_project_testing_record_v384(uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_project_testing_record_v384(uuid,text,text,jsonb,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_testing_balances_v384(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Project not found or archived.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',t.item_id,'tested',t.tested) ORDER BY t.item_id),'[]'::jsonb) INTO result
 FROM (SELECT item_id,coalesce(sum(tested_delta),0)::bigint AS tested FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id GROUP BY item_id) t;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_testing_balances_v384(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_testing_balances_v384(uuid) TO service_role;
DROP FUNCTION IF EXISTS public.erp_preparing_warehouse_testing_balances_v243(uuid);
-- Existing BEFORE guard now reads the tested ledger. Keep the project lock for concurrent writes.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_tested_limit_v384()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE tested_total bigint; received_before bigint;
BEGIN
 IF NEW.accepted_delta>0 THEN
  PERFORM 1 FROM public.erp_preparing_projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT coalesce(sum(tested_delta),0) INTO tested_total FROM public.erp_preparing_project_test_lines WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  SELECT coalesce(sum(accepted_delta),0) INTO received_before FROM public.erp_preparing_warehouse_receipt_lines WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  IF received_before+NEW.accepted_delta>tested_total THEN RAISE EXCEPTION 'Only % Tested unit(s) remain available to receive.',greatest(0,tested_total-received_before); END IF;
 END IF;
 RETURN NEW;
END; $$;
-- Replace the old BEFORE trigger and remove the obsolete function.
DROP TRIGGER IF EXISTS prep_wh_passed_limit_v243 ON public.erp_preparing_warehouse_receipt_lines;
DROP FUNCTION IF EXISTS public.erp_preparing_warehouse_passed_limit_v243();
CREATE TRIGGER prep_wh_tested_limit_v384 BEFORE INSERT ON public.erp_preparing_warehouse_receipt_lines
 FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_warehouse_tested_limit_v384();
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_tested_limit_v384() FROM PUBLIC,anon,authenticated;
-- The new BEFORE guard is authoritative; retire the duplicate legacy AFTER guard.
DROP TRIGGER IF EXISTS tr_preparing_testing_receipt_guard ON public.erp_preparing_warehouse_receipt_lines;
DROP FUNCTION IF EXISTS public.erp_preparing_testing_receipt_guard();
ALTER TABLE public.erp_preparing_project_test_lines DROP COLUMN received_delta, DROP COLUMN passed_delta, DROP COLUMN failed_delta;
DROP TABLE public.erp_preparing_project_test_legacy_intake;
NOTIFY pgrst, 'reload schema';
COMMIT;
