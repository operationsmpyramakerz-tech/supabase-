-- Phase 10 - Project-wide warehouse receipt and school allocation.
-- Independent from school QC, cartons, shipments and signed school delivery.
-- Apply AFTER Projects Preparing phases 1-8. Execute as one transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
 item_key text NOT NULL CHECK (length(item_key) BETWEEN 2 AND 700),
 product_id text NOT NULL DEFAULT '',
 product_name text NOT NULL CHECK (length(product_name) BETWEEN 1 AND 500),
 required_qty bigint NOT NULL DEFAULT 0 CHECK (required_qty BETWEEN 0 AND 1000000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,item_key), UNIQUE(project_id,id)
);
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_demands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL,
 school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
 item_id uuid NOT NULL,
 required_qty integer NOT NULL CHECK (required_qty BETWEEN 1 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (project_id,item_id) REFERENCES public.erp_preparing_warehouse_items(project_id,id) ON DELETE CASCADE,
 UNIQUE(school_id,item_id)
);
CREATE INDEX IF NOT EXISTS idx_prep_wh_demand_project ON public.erp_preparing_warehouse_demands(project_id,school_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.erp_preparing_projects(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('receipt','adjustment')),
 reference text NOT NULL CHECK (length(reference) BETWEEN 2 AND 160),
 notes text NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
 created_by_id text NOT NULL CHECK (length(created_by_id)>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prep_wh_receipts_project ON public.erp_preparing_warehouse_receipts(project_id,created_at DESC);
-- Avoid duplicate warehouse receipts when an operator retries a request after a timeout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prep_wh_voucher_unique ON public.erp_preparing_warehouse_receipts(project_id,lower(reference));
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_receipt_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_id uuid NOT NULL REFERENCES public.erp_preparing_warehouse_receipts(id) ON DELETE CASCADE,
 project_id uuid NOT NULL,
 item_id uuid NOT NULL,
 accepted_delta integer NOT NULL CHECK (accepted_delta BETWEEN -1000000 AND 1000000),
 damaged_delta integer NOT NULL CHECK (damaged_delta BETWEEN -1000000 AND 1000000),
 FOREIGN KEY (project_id,item_id) REFERENCES public.erp_preparing_warehouse_items(project_id,id),
 CHECK (accepted_delta<>0 OR damaged_delta<>0), UNIQUE(receipt_id,item_id)
);
CREATE INDEX IF NOT EXISTS idx_prep_wh_receipt_lines_item ON public.erp_preparing_warehouse_receipt_lines(item_id);
CREATE TABLE IF NOT EXISTS public.erp_preparing_warehouse_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL,
 school_id uuid NOT NULL REFERENCES public.erp_preparing_schools(id) ON DELETE CASCADE,
 item_id uuid NOT NULL,
 delta_qty integer NOT NULL CHECK (delta_qty BETWEEN -1000000 AND 1000000 AND delta_qty <> 0),
 reference text NOT NULL CHECK (length(reference) BETWEEN 2 AND 160),
 notes text NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
 created_by_id text NOT NULL CHECK (length(created_by_id)>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (project_id,item_id) REFERENCES public.erp_preparing_warehouse_items(project_id,id)
);
CREATE INDEX IF NOT EXISTS idx_prep_wh_alloc_project ON public.erp_preparing_warehouse_allocations(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prep_wh_alloc_item ON public.erp_preparing_warehouse_allocations(item_id,school_id);

ALTER TABLE public.erp_preparing_warehouse_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_warehouse_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_warehouse_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_warehouse_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_preparing_warehouse_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_preparing_warehouse_items,public.erp_preparing_warehouse_demands,
 public.erp_preparing_warehouse_receipts,public.erp_preparing_warehouse_receipt_lines,
 public.erp_preparing_warehouse_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.erp_preparing_warehouse_items,public.erp_preparing_warehouse_demands TO service_role;
GRANT SELECT,INSERT ON public.erp_preparing_warehouse_receipts,public.erp_preparing_warehouse_receipt_lines,
 public.erp_preparing_warehouse_allocations TO service_role;

-- Frozen source BOM per school. New schools can be captured later, but old baseline is never rewritten.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_capture(
 p_project_id uuid,p_schools jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s jsonb; c jsonb; school_rec public.erp_preparing_schools%ROWTYPE; target uuid;
 created_count integer:=0; qty integer; key_text text;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF nullif(btrim(coalesce(p_member_id,'')),'') IS NULL OR jsonb_typeof(p_schools) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_schools) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid project BOM payload.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_schools) LOOP
   IF jsonb_typeof(s) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid school record.'; END IF;
   SELECT * INTO school_rec FROM public.erp_preparing_schools
    WHERE id=(s->>'schoolId')::uuid AND project_id=p_project_id FOR UPDATE;
   IF NOT FOUND OR school_rec.proposal_id IS DISTINCT FROM (s->>'proposalId') THEN
     RAISE EXCEPTION 'School or proposal changed. Refresh and retry.';
   END IF;
   IF EXISTS(SELECT 1 FROM public.erp_preparing_warehouse_demands WHERE school_id=school_rec.id) THEN CONTINUE; END IF;
   IF jsonb_typeof(s->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'items') NOT BETWEEN 1 AND 1000
     THEN RAISE EXCEPTION 'Each school requires 1-1000 proposal components.'; END IF;
   IF (SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(s->'items') AS t(v)) <> jsonb_array_length(s->'items')
     THEN RAISE EXCEPTION 'Duplicate component in a school BOM.'; END IF;
   FOR c IN SELECT value FROM jsonb_array_elements(s->'items') LOOP
     key_text := c->>'key';
     IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR length(coalesce(key_text,'')) NOT BETWEEN 2 AND 700
       OR length(coalesce(c->>'name','')) NOT BETWEEN 1 AND 500
       OR length(coalesce(c->>'productId',''))>500 OR (c->>'qty') !~ '^[0-9]{1,7}$'
       THEN RAISE EXCEPTION 'Invalid source component.'; END IF;
     qty := (c->>'qty')::integer;
     IF qty NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Invalid source quantity.'; END IF;
     INSERT INTO public.erp_preparing_warehouse_items(project_id,item_key,product_id,product_name)
       VALUES(p_project_id,key_text,coalesce(c->>'productId',''),c->>'name')
       ON CONFLICT(project_id,item_key) DO NOTHING;
     SELECT id INTO target FROM public.erp_preparing_warehouse_items WHERE project_id=p_project_id AND item_key=key_text;
     INSERT INTO public.erp_preparing_warehouse_demands(project_id,school_id,item_id,required_qty)
       VALUES(p_project_id,school_rec.id,target,qty);
   END LOOP;
   created_count:=created_count+1;
 END LOOP;
 UPDATE public.erp_preparing_warehouse_items i SET required_qty=tot.qty FROM (
   SELECT item_id,sum(required_qty) AS qty FROM public.erp_preparing_warehouse_demands
   WHERE project_id=p_project_id GROUP BY item_id
 ) tot WHERE i.id=tot.item_id AND i.project_id=p_project_id;
 RETURN jsonb_build_object('schoolsCaptured',created_count);
END; $$;

-- Append-only voucher / correction transactions. Serializes all project writes under one row lock.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_receive(
 p_project_id uuid,p_kind text,p_reference text,p_notes text,p_lines jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; target uuid; good integer; damaged integer;
 prior_good bigint; prior_damaged bigint; reserved bigint; receipt_id uuid; line_count integer;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF p_kind NOT IN ('receipt','adjustment') OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
  OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid warehouse receipt.'; END IF;
 line_count:=jsonb_array_length(p_lines);
 IF line_count NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) t(v))<>line_count
  THEN RAISE EXCEPTION 'Invalid or duplicate receipt lines.'; END IF;
 -- Inserts are all-or-nothing; this audit entry must never be deleted to correct a voucher.
 INSERT INTO public.erp_preparing_warehouse_receipts(project_id,kind,reference,notes,created_by_id)
 VALUES(p_project_id,p_kind,btrim(p_reference),coalesce(p_notes,''),p_member_id) RETURNING id INTO receipt_id;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (entry->>'accepted') !~ '^-?[0-9]{1,7}$'
   OR (entry->>'damaged') !~ '^-?[0-9]{1,7}$' THEN RAISE EXCEPTION 'Invalid receipt quantities.'; END IF;
  good:=(entry->>'accepted')::integer; damaged:=(entry->>'damaged')::integer;
  IF abs(good)>1000000 OR abs(damaged)>1000000 OR (good=0 AND damaged=0)
   OR (p_kind='receipt' AND (good<0 OR damaged<0)) THEN RAISE EXCEPTION 'Invalid receipt/correction quantities.'; END IF;
  SELECT id INTO target FROM public.erp_preparing_warehouse_items
    WHERE id=(entry->>'itemId')::uuid AND project_id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Component is not in the project BOM.'; END IF;
  SELECT coalesce(sum(accepted_delta),0),coalesce(sum(damaged_delta),0)
    INTO prior_good,prior_damaged FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=target;
  SELECT coalesce(sum(delta_qty),0) INTO reserved FROM public.erp_preparing_warehouse_allocations WHERE item_id=target;
  IF prior_good+good<reserved OR prior_good+good<0 OR prior_damaged+damaged<0
    THEN RAISE EXCEPTION 'Correction would make received stock negative or below allocated quantity.'; END IF;
  INSERT INTO public.erp_preparing_warehouse_receipt_lines(receipt_id,project_id,item_id,accepted_delta,damaged_delta)
    VALUES(receipt_id,p_project_id,target,good,damaged);
 END LOOP;
 RETURN jsonb_build_object('receiptId',receipt_id,'lineCount',line_count);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_allocate(
 p_project_id uuid,p_school_id uuid,p_item_id uuid,p_delta integer,p_reference text,p_notes text,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE school_limit bigint; school_balance bigint; total_good bigint; total_allocated bigint; entry_id uuid;
BEGIN
 PERFORM 1 FROM public.erp_preparing_projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
 IF p_delta IS NULL OR p_delta=0 OR p_delta NOT BETWEEN -1000000 AND 1000000
  OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 2 AND 160
  OR length(coalesce(p_notes,''))>1000 OR nullif(btrim(coalesce(p_member_id,'')),'') IS NULL
  THEN RAISE EXCEPTION 'Invalid school allocation.'; END IF;
 SELECT required_qty INTO school_limit FROM public.erp_preparing_warehouse_demands
  WHERE project_id=p_project_id AND school_id=p_school_id AND item_id=p_item_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'This school does not require the selected component.'; END IF;
 SELECT coalesce(sum(delta_qty),0) INTO school_balance FROM public.erp_preparing_warehouse_allocations
  WHERE item_id=p_item_id AND school_id=p_school_id;
 SELECT coalesce(sum(delta_qty),0) INTO total_allocated FROM public.erp_preparing_warehouse_allocations WHERE item_id=p_item_id;
 SELECT coalesce(sum(accepted_delta),0) INTO total_good FROM public.erp_preparing_warehouse_receipt_lines WHERE item_id=p_item_id;
 IF school_balance+p_delta<0 OR school_balance+p_delta>school_limit
  THEN RAISE EXCEPTION 'School allocation exceeds its requirement or available assignment.'; END IF;
 IF total_allocated+p_delta>total_good THEN RAISE EXCEPTION 'Not enough accepted warehouse stock to allocate.'; END IF;
 INSERT INTO public.erp_preparing_warehouse_allocations(project_id,school_id,item_id,delta_qty,reference,notes,created_by_id)
  VALUES(p_project_id,p_school_id,p_item_id,p_delta,btrim(p_reference),coalesce(p_notes,''),p_member_id)
  RETURNING id INTO entry_id;
 RETURN jsonb_build_object('allocationId',entry_id,'schoolAllocated',school_balance+p_delta);
END; $$;

-- One atomic assignment of many component types to the same school.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_allocate_batch(
 p_project_id uuid,p_school_id uuid,p_reference text,p_notes text,p_lines jsonb,p_member_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE entry jsonb; count_lines integer; delta_qty integer;
BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid allocation list.'; END IF;
 count_lines:=jsonb_array_length(p_lines);
 IF count_lines NOT BETWEEN 1 AND 200 OR
   (SELECT count(DISTINCT v->>'itemId') FROM jsonb_array_elements(p_lines) t(v))<>count_lines
 THEN RAISE EXCEPTION 'Invalid or duplicated school allocation components.'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (entry->>'delta') !~ '^-?[0-9]{1,7}$'
   THEN RAISE EXCEPTION 'Invalid assignment quantity.'; END IF;
   delta_qty:=(entry->>'delta')::integer;
   PERFORM public.erp_preparing_warehouse_allocate(p_project_id,p_school_id,(entry->>'itemId')::uuid,
     delta_qty,p_reference,p_notes,p_member_id);
 END LOOP;
 RETURN jsonb_build_object('savedLines',count_lines);
END; $$;

REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_capture(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_receive(uuid,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_allocate(uuid,uuid,uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_capture(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_receive(uuid,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_allocate(uuid,uuid,uuid,integer,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_allocate_batch(uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_allocate_batch(uuid,uuid,text,text,jsonb,text) TO service_role;
COMMIT;
