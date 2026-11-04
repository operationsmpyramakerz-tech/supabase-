-- v309 | Shopping Cart order priority and requested delivery date.
-- Run on the same Supabase instance as the production ERP BEFORE deploying the code.
-- No existing orders are modified or removed; existing rows keep NULL values.
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS priority_level text,
  ADD COLUMN IF NOT EXISTS requested_delivery_date date;
COMMENT ON COLUMN public.orders.priority_level IS 'Shopping Cart request priority: Low, Normal, High, Urgent.';
COMMENT ON COLUMN public.orders.requested_delivery_date IS 'Requested delivery date entered in Shopping Cart (not a confirmed shipment date).';
COMMIT;
