-- v247: Production team physical handover and cartons capacity guard.
-- Run AFTER v243 (passed testing warehouse balance) and existing Project Kit Cartons Phase 7.
-- BACK UP PRODUCTION. Additive ledger; no existing receipts/cartons are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_production_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL,
 qty_delta integer NOT NULL CHECK(qty_delta<>0 AND qty_delta BETWEEN -1000000 AND 1000000),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 2 AND 160),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 received_by_id text NOT NULL CHECK(length(btrim(received_by_id))>0),
 received_by_name text NOT NULL CHECK(length(btrim(received_by_name)) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,item_id) REFERENCES public.erp_preparing_warehouse_items(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS prep_production_handoff_project_date ON public.erp_preparing_production_handoffs(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS prep_production_handoff_item ON public.erp_preparing_production_handoffs(project_id,item_id);
ALTER TABLE public.erp_preparing_production_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_preparing_production_handoffs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.erp_preparing_production_handoffs TO service_role;

-- Only signed-in ERP users via the protected server route may invoke the service-role RPC.
-- Project-row lock serializes warehouse, Production, and Project Carton changes.
CREATE OR REPLACE FUNCTION public.erp_preparing_production_handoff_v247(
 p_project_id uuid,p_item_id uuid,p_new_total integer,p_expected_total integer,
 p_reference text,p_notes text,p_member_id text,p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item public.erp_preparing_warehouse_items%ROWTYPE;
 warehouse_qty bigint; previous_qty bigint; packed_qty bigint; duplicates integer;
 result public.erp_preparing_production_handoffs%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or archived.'; END IF;
 SELECT * INTO item FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Component does not belong to this project.'; END IF;
 IF p_new_total IS NULL OR p_new_total NOT BETWEEN 0 AND 1000000000 OR
    p_expected_total IS NULL OR p_expected_total NOT BETWEEN 0 AND 1000000000 OR
    abs(p_new_total::bigint-p_expected_total::bigint)>1000000 OR
    length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160 OR
    length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR
    length(btrim(coalesce(p_actor_name,''))) NOT BETWEEN 1 AND 160
 THEN RAISE EXCEPTION 'Invalid Production handover details or quantity.'; END IF;
 SELECT count(*) INTO duplicates FROM public.erp_preparing_warehouse_items
 WHERE project_id=p_project_id AND lower(btrim(product_id))=lower(btrim(item.product_id))
 AND lower(btrim(product_name))=lower(btrim(item.product_name));
 IF duplicates<>1 THEN RAISE EXCEPTION 'Ambiguous component identity. Resolve duplicate BOM items before packing.'; END IF;
 SELECT coalesce(sum(accepted_delta),0) INTO warehouse_qty FROM public.erp_preparing_warehouse_receipt_lines
 WHERE project_id=p_project_id AND item_id=p_item_id;
 SELECT coalesce(sum(qty_delta),0) INTO previous_qty FROM public.erp_preparing_production_handoffs
 WHERE project_id=p_project_id AND item_id=p_item_id;
 IF previous_qty<>p_expected_total THEN RAISE EXCEPTION 'Production receipt changed. Refresh before saving.'; END IF;
 SELECT coalesce(sum(ln.packed_qty),0) INTO packed_qty FROM public.erp_preparing_project_carton_lines ln
 JOIN public.erp_preparing_project_cartons c ON c.id=ln.carton_id AND c.project_id=p_project_id AND c.status<>'cancelled'
 WHERE ln.project_id=p_project_id AND lower(btrim(ln.product_id))=lower(btrim(item.product_id))
 AND lower(btrim(ln.product_name))=lower(btrim(item.product_name));
 IF p_new_total>warehouse_qty THEN RAISE EXCEPTION 'Production cannot receive more than Warehouse Received (%).',warehouse_qty; END IF;
 IF p_new_total<packed_qty THEN RAISE EXCEPTION 'Cannot reduce Production Received below % units already packed into cartons.',packed_qty; END IF;
 IF p_new_total=previous_qty THEN RAISE EXCEPTION 'Enter a changed Production Received quantity.'; END IF;
 INSERT INTO public.erp_preparing_production_handoffs
 (project_id,item_id,qty_delta,reference,notes,received_by_id,received_by_name)
 VALUES(p_project_id,p_item_id,p_new_total-previous_qty,btrim(p_reference),coalesce(p_notes,''),p_member_id,btrim(p_actor_name))
 RETURNING * INTO result;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.erp_preparing_production_handoff_v247(uuid,uuid,integer,integer,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_production_handoff_v247(uuid,uuid,integer,integer,text,text,text,text) TO service_role;

-- Warehouse corrections may not take back units already handed to Production.
-- Retains v243 Passed guard and the v241 usable-only guard.
CREATE OR REPLACE FUNCTION public.erp_preparing_production_protect_warehouse_v247()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE before_qty bigint; handed_qty bigint;
BEGIN
 IF NEW.accepted_delta<0 THEN
  SELECT coalesce(sum(accepted_delta),0) INTO before_qty FROM public.erp_preparing_warehouse_receipt_lines
  WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  SELECT coalesce(sum(qty_delta),0) INTO handed_qty FROM public.erp_preparing_production_handoffs
  WHERE project_id=NEW.project_id AND item_id=NEW.item_id;
  IF before_qty+NEW.accepted_delta<handed_qty THEN
   RAISE EXCEPTION 'Cannot reduce Warehouse Received below % unit(s) already handed to Production.',handed_qty;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prep_prod_warehouse_guard_v247 ON public.erp_preparing_warehouse_receipt_lines;
CREATE TRIGGER prep_prod_warehouse_guard_v247 BEFORE INSERT ON public.erp_preparing_warehouse_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_production_protect_warehouse_v247();

-- A new/modified box line must be covered by the Production handover balance.
-- Existing sealed or historical box lines remain untouched until legitimately edited.
-- Lock order is the same as existing carton RPC: project first, carton second.
CREATE OR REPLACE FUNCTION public.erp_preparing_production_box_guard_v247()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target_item uuid; duplicates integer; handed_qty bigint; already_packed bigint;
BEGIN
 IF TG_OP='UPDATE' AND NEW.project_id<>OLD.project_id THEN RAISE EXCEPTION 'Box project cannot be changed.'; END IF;
 SELECT count(*) INTO duplicates FROM public.erp_preparing_warehouse_items i
 WHERE i.project_id=NEW.project_id AND lower(btrim(i.product_id))=lower(btrim(NEW.product_id))
 AND lower(btrim(i.product_name))=lower(btrim(NEW.product_name));
 IF duplicates<>1 THEN RAISE EXCEPTION 'Box component must match one unique project BOM item.'; END IF;
 SELECT i.id INTO target_item FROM public.erp_preparing_warehouse_items i
 WHERE i.project_id=NEW.project_id AND lower(btrim(i.product_id))=lower(btrim(NEW.product_id))
 AND lower(btrim(i.product_name))=lower(btrim(NEW.product_name)) LIMIT 1;
 SELECT coalesce(sum(qty_delta),0) INTO handed_qty FROM public.erp_preparing_production_handoffs
 WHERE project_id=NEW.project_id AND item_id=target_item;
 SELECT coalesce(sum(ln.packed_qty),0) INTO already_packed
 FROM public.erp_preparing_project_carton_lines ln
 JOIN public.erp_preparing_project_cartons c ON c.id=ln.carton_id AND c.status<>'cancelled'
 WHERE ln.project_id=NEW.project_id AND ln.id IS DISTINCT FROM NEW.id
 AND lower(btrim(ln.product_id))=lower(btrim(NEW.product_id))
 AND lower(btrim(ln.product_name))=lower(btrim(NEW.product_name));
 IF already_packed+NEW.packed_qty>handed_qty THEN
  RAISE EXCEPTION 'Production unpacked balance insufficient: % available, requested %.',
    greatest(0,handed_qty-already_packed),NEW.packed_qty;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prep_prod_box_guard_v247 ON public.erp_preparing_project_carton_lines;
CREATE TRIGGER prep_prod_box_guard_v247 BEFORE INSERT OR UPDATE OF packed_qty,product_id,product_name
ON public.erp_preparing_project_carton_lines FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_production_box_guard_v247();
COMMIT;
