-- Phase 2Q3F: opt-in, whole-order transaction for archive / unarchive / delete.
-- Run manually on Staging first, as a privileged DB owner. DO NOT execute
-- against production without testing and a verified database backup.
-- Only supports the public.orders table (default SUPABASE_ORDERS_TABLE).
-- All the application permission and Own/Team/All checks are still required.
CREATE OR REPLACE FUNCTION public.erp_atomic_order_action(
  p_order_number text,
  p_ids text[],
  p_action text,
  p_expected jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_requested integer;
  v_affected integer;
  v_locked_snapshot jsonb;
  v_next_status text;
BEGIN
  v_requested := COALESCE(array_length(p_ids, 1), 0);
  IF p_order_number IS NULL OR p_order_number !~ '^[0-9]+$'
     OR p_action IS NULL OR p_action NOT IN ('archive', 'unarchive', 'delete')
     OR v_requested < 1 OR v_requested > 999
     OR p_expected IS NULL OR jsonb_typeof(p_expected) <> 'object'
     OR EXISTS (SELECT 1 FROM unnest(p_ids) AS id WHERE id IS NULL OR id !~ '^[0-9]+$')
     OR (SELECT count(DISTINCT id) FROM unnest(p_ids) AS id) <> v_requested
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid whole-order request';
  END IF;

  -- Blocks concurrent inserts/updates/deletes against orders until this
  -- transaction commits or rolls back. Short but TABLE-WIDE lock; monitor
  -- write latency under production load before enabling widely.
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)::integer,
         COALESCE(jsonb_object_agg(o.id::text, jsonb_build_object(
           'status', to_jsonb(o)->'status',
           'team_member_id', to_jsonb(o)->'team_member_id',
           'team_member_name', to_jsonb(o)->'team_member_name',
           'quantity_requested', to_jsonb(o)->'quantity_requested',
           'quantity_progress', to_jsonb(o)->'quantity_progress',
           'quantity_remaining', to_jsonb(o)->'quantity_remaining',
           'quantity_received_by_operations', to_jsonb(o)->'quantity_received_by_operations',
           'quantity_edited_by_supervisor', to_jsonb(o)->'quantity_edited_by_supervisor'
         )), '{}'::jsonb)
    INTO v_count, v_locked_snapshot
    FROM public.orders AS o
   WHERE o.order_number::text = p_order_number;

  IF v_count <> v_requested OR v_count >= 1000
     OR v_locked_snapshot IS DISTINCT FROM p_expected
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Order snapshot has changed';
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM public.orders AS o
     WHERE o.order_number::text = p_order_number AND o.id::text = ANY(p_ids);
  ELSE
    v_next_status := CASE WHEN p_action = 'archive' THEN 'Archive' ELSE 'In progress' END;
    UPDATE public.orders AS o SET status = v_next_status
     WHERE o.order_number::text = p_order_number AND o.id::text = ANY(p_ids);
  END IF;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> v_requested THEN
    -- An exception rolls back the whole RPC transaction, not a subset.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Atomic order mutation incomplete';
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', p_action, 'affected', v_affected);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_atomic_order_action(text,text[],text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_atomic_order_action(text,text[],text,jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_atomic_order_action(text,text[],text,jsonb) TO service_role;

-- Rollback after DISABLING ERP_ATOMIC_ORDER_MUTATIONS on every app instance:
-- DROP FUNCTION IF EXISTS public.erp_atomic_order_action(text,text[],text,jsonb);
