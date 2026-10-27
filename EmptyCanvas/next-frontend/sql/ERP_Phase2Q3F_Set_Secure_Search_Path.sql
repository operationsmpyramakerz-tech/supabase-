-- Phase 2Q3F: one-time hardening for the already installed RPC.
-- Run on STAGING first after backup. Does NOT modify rows in public.orders.
-- The function resolves its table as public.orders and built-ins from pg_catalog.
ALTER FUNCTION public.erp_atomic_order_action(text,text[],text,jsonb)
  SET search_path = pg_catalog, pg_temp;

-- Verify the stored function-local configuration without executing the function.
SELECT p.proconfig AS function_config
FROM pg_catalog.pg_proc AS p
WHERE p.oid = 'public.erp_atomic_order_action(text,text[],text,jsonb)'::regprocedure;
