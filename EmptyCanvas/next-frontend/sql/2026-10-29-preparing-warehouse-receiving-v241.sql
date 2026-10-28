-- v241. Physical warehouse receipt changes are usable-only; earlier damaged entries are preserved.
-- Run AFTER v240; back up production first. Append-only audit, no data deletions.
BEGIN;
ALTER TABLE public.erp_preparing_warehouse_receipts
 ADD COLUMN IF NOT EXISTS created_by_name text NOT NULL DEFAULT '';
ALTER TABLE public.erp_preparing_warehouse_receipts
 DROP CONSTRAINT IF EXISTS prep_wh_receipt_actor_name_len;
ALTER TABLE public.erp_preparing_warehouse_receipts
 ADD CONSTRAINT prep_wh_receipt_actor_name_len CHECK (length(created_by_name)<=160);

-- Database-level barrier also protects the legacy RPC from recording NEW damaged transactions.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_usable_only_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.damaged_delta<>0 THEN
  RAISE EXCEPTION 'Warehouse Receiving records usable units only; damaged stock must be handled outside this receiving ledger.';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prep_wh_usable_only_guard ON public.erp_preparing_warehouse_receipt_lines;
CREATE TRIGGER prep_wh_usable_only_guard BEFORE INSERT ON public.erp_preparing_warehouse_receipt_lines
 FOR EACH ROW EXECUTE FUNCTION public.erp_preparing_warehouse_usable_only_guard();

-- Keep the existing transaction/locking + quantity guards in the original ERP RPC.
-- Wrapper atomically captures the server-verified ERP user's display name at voucher creation.
CREATE OR REPLACE FUNCTION public.erp_preparing_warehouse_receive_v241(
 p_project_id uuid,p_kind text,p_reference text,p_notes text,p_lines jsonb,p_member_id text,p_actor_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; voucher_id uuid; entry jsonb;
BEGIN
 IF nullif(btrim(coalesce(p_actor_name,'')),'') IS NULL OR length(p_actor_name)>160
 THEN RAISE EXCEPTION 'Verified ERP user name is required.'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid warehouse lines.'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF (entry->>'damaged') IS DISTINCT FROM '0' THEN
   RAISE EXCEPTION 'Warehouse Receiving does not accept damaged quantities.';
  END IF;
 END LOOP;
 result:=public.erp_preparing_warehouse_receive(p_project_id,p_kind,p_reference,p_notes,p_lines,p_member_id);
 voucher_id:=(result->>'receiptId')::uuid;
 UPDATE public.erp_preparing_warehouse_receipts SET created_by_name=btrim(p_actor_name)
 WHERE id=voucher_id AND project_id=p_project_id AND created_by_id=p_member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unable to record receiver identity.'; END IF;
 RETURN result;
END; $$;
GRANT UPDATE ON TABLE public.erp_preparing_warehouse_receipts TO service_role;
REVOKE ALL ON FUNCTION public.erp_preparing_warehouse_receive_v241(uuid,text,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_preparing_warehouse_receive_v241(uuid,text,text,text,jsonb,text,text) TO service_role;
COMMIT;
