-- v388: additive production intake before QC. Run after successful v384 migration.
-- Back up and pause project writes during migration/deployment.
BEGIN;
LOCK TABLE public.erp_preparing_projects IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.erp_preparing_project_test_lines IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.erp_preparing_production_intake_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.erp_preparing_warehouse_items(id) ON DELETE RESTRICT,
 qty_delta bigint NOT NULL CHECK(qty_delta<>0),
 received_by_id text NOT NULL,
 received_by_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reference text NOT NULL,
 notes text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS prep_intake_project_item_v388 ON public.erp_preparing_production_intake_lines(project_id,item_id);
ALTER TABLE public.erp_preparing_production_intake_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_production_intake_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_production_intake_lines TO service_role;
-- Opening balance: existing tested units necessarily already reached QC. No fabricated user attribution.
INSERT INTO public.erp_preparing_production_intake_lines(project_id,item_id,qty_delta,received_by_id,received_by_name,reference,notes)
SELECT t.project_id,t.item_id,sum(t.tested_delta),'migration-v388','Opening balance (migration)','OPENING-V388','Inferred from existing tested quantity; not a new physical receipt.'
FROM public.erp_preparing_project_test_lines t
WHERE NOT EXISTS(SELECT 1 FROM public.erp_preparing_production_intake_lines l WHERE l.project_id=t.project_id AND l.item_id=t.item_id)
GROUP BY t.project_id,t.item_id HAVING sum(t.tested_delta)>0;
-- Keep historic stage keys and documents; new intake uses its own key.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.erp_preparing_project_stage_closures'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%stage_key%' LOOP
  EXECUTE format('ALTER TABLE public.erp_preparing_project_stage_closures DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.erp_preparing_project_stage_closures ADD CONSTRAINT prep_stage_key_v388 CHECK(stage_key IN ('intake','testing','warehouse','production','boxes','cartons'));
CREATE OR REPLACE FUNCTION public.erp_preparing_intake_snapshot_v388(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Project not found.'; END IF;
 RETURN jsonb_build_object('balances',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',item_id,'received',received,'people',people)) FROM (
 SELECT item_id,sum(qty_delta) AS received,jsonb_agg(DISTINCT jsonb_build_object('id',received_by_id,'name',received_by_name)) AS people FROM public.erp_preparing_production_intake_lines WHERE project_id=p_project_id GROUP BY item_id) x),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'reference',reference,'notes',notes,'createdAt',created_at,'createdBy',received_by_id,'createdByName',received_by_name,'lines',jsonb_build_array(jsonb_build_object('itemId',item_id,'testedDelta',qty_delta))) ORDER BY created_at DESC,id DESC) FROM (SELECT * FROM public.erp_preparing_production_intake_lines WHERE project_id=p_project_id ORDER BY created_at DESC,id DESC LIMIT 100) h),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.erp_preparing_intake_snapshot_v388(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_intake_snapshot_v388(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.erp_preparing_intake_record_v388(p_project_id uuid,p_lines jsonb,p_member_id text,p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; target uuid; prior bigint; next_qty bigint; tested bigint; dt bigint; cnt integer; ref text;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid intake record.'; END IF;
 cnt:=jsonb_array_length(p_lines);
 IF cnt NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) t(v))<>cnt THEN RAISE EXCEPTION 'Select 1-200 distinct components.'; END IF;
 ref:='INTAKE-'||gen_random_uuid()::text;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF coalesce(entry->>'testedDelta','') !~ '^-?[0-9]{1,7}$' OR coalesce(entry->>'expectedTested','') !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'Invalid received quantity.'; END IF;
  dt:=(entry->>'testedDelta')::bigint;
  IF dt=0 OR abs(dt)>1000000 THEN RAISE EXCEPTION 'Invalid received change.'; END IF;
  SELECT id INTO target FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND id=(entry->>'itemId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not in project.'; END IF;
  SELECT coalesce(sum(qty_delta),0) INTO prior FROM public.erp_preparing_production_intake_lines WHERE project_id=p_project_id AND item_id=target;
  IF prior<>(entry->>'expectedTested')::bigint THEN RAISE EXCEPTION 'Receiving quantities changed. Refresh before saving.'; END IF;
  next_qty:=prior+dt;
  SELECT coalesce(sum(tested_delta),0) INTO tested FROM public.erp_preparing_project_test_lines WHERE project_id=p_project_id AND item_id=target;
  IF next_qty<0 OR next_qty<tested THEN RAISE EXCEPTION 'Received cannot be lower than already tested quantity (%).',tested; END IF;
  INSERT INTO public.erp_preparing_production_intake_lines(project_id,item_id,qty_delta,received_by_id,received_by_name,reference) VALUES(p_project_id,target,dt,p_member_id,btrim(p_actor_name),ref);
 END LOOP;
 RETURN jsonb_build_object('lineCount',cnt);
END $$;
REVOKE ALL ON FUNCTION public.erp_preparing_intake_record_v388(uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_intake_record_v388(uuid,jsonb,text,text) TO service_role;
-- Enforce the QC ceiling at the database, including existing v384 RPC writes.
CREATE OR REPLACE FUNCTION public.erp_preparing_testing_intake_guard_v388() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE received bigint; prior bigint;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=NEW.project_id FOR UPDATE;
 SELECT coalesce(sum(qty_delta),0) INTO received FROM public.erp_preparing_production_intake_lines WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
 SELECT coalesce(sum(tested_delta),0) INTO prior FROM public.erp_preparing_project_test_lines WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
 IF NEW.tested_delta>0 AND prior+NEW.tested_delta>received THEN RAISE EXCEPTION 'Tested cannot exceed Production Received (%).',received; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prep_testing_intake_guard_v388 ON public.erp_preparing_project_test_lines;
CREATE TRIGGER prep_testing_intake_guard_v388 BEFORE INSERT ON public.erp_preparing_project_test_lines FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_testing_intake_guard_v388();
REVOKE ALL ON FUNCTION public.erp_preparing_testing_intake_guard_v388() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
