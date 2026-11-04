-- Run once in Supabase SQL Editor before deploying v308.
-- Pending additions are NOT inserted into products until an authorized reviewer approves.
CREATE TABLE IF NOT EXISTS public.product_addition_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 250),
  id_code text,
  unit_price numeric(18,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  unit text,
  tag text,
  url text,
  image_url text,
  quantity numeric(16,3) NOT NULL CHECK (quantity > 0),
  order_row_id text NOT NULL,
  order_number bigint NOT NULL,
  requested_by_id text,
  requested_by_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','approved')),
  approved_product_id text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_additions_status_created ON public.product_addition_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_additions_order_row ON public.product_addition_requests(order_row_id);
ALTER TABLE public.product_addition_requests ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: only the server's service-role API can read/write.
REVOKE ALL ON public.product_addition_requests FROM anon, authenticated;
