-- v243: warehouse receiving capacity follows Passed Testing, NOT warehouse stock
-- available for school allocation. No backfill or destructive changes.
-- Apply AFTER the v241 warehouse migration. Back up production first.
BEGIN;

-- A small, project-scoped read for Warehouse Receiving and its PDF export.
-- Do not duplicate entries for the same component across multiple Kit tags.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_testing_balances_v243(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.erp_preparing_projects
                WHERE id=p_project_id AND deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Project not found or archived.';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',t.item_id,'passed',t.passed)
                           ORDER BY t.item_id),'[]'::jsonb) INTO result
 FROM (
   SELECT ln.item_id, coalesce(sum(ln.passed_delta),0)::bigint AS passed
   FROM public.erp_preparing_project_test_lines ln
   WHERE ln.project_id=p_project_id
   GROUP BY ln.item_id
 ) t;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_testing_balances_v243(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_testing_balances_v243(uuid)
 TO service_role;

-- Guard every NEW positive receipt (including the existing v241 and legacy RPCs).
-- The AFTER INSERT legacy guard cannot prevent a concurrent stale UI calculation;
-- this trigger uses the authoritative database balance under the ERP project lock.
-- Old transactions and historical damaged lines remain unchanged.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_passed_limit_v243()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE passed_total bigint; received_before bigint;
BEGIN
 IF NEW.accepted_delta > 0 THEN
  SELECT coalesce(sum(passed_delta),0)::bigint INTO passed_total
  FROM public.erp_preparing_project_test_lines
  WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  SELECT coalesce(sum(accepted_delta),0)::bigint INTO received_before
  FROM public.erp_preparing_warehouse_receipt_lines
  WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  IF received_before + NEW.accepted_delta > passed_total THEN
   RAISE EXCEPTION 'Only % Passed unit(s) remain available to receive for this component.',
     greatest(0,passed_total-received_before);
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prep_wh_passed_limit_v243
 ON public.erp_preparing_warehouse_receipt_lines;
CREATE TRIGGER prep_wh_passed_limit_v243
 BEFORE INSERT ON public.erp_preparing_warehouse_receipt_lines
 FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_warehouse_passed_limit_v243();
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_passed_limit_v243()
 FROM PUBLIC,anon,authenticated;
COMMIT;
