-- V464: durable, scoped approval notices for newly submitted orders.
-- Run once in Supabase SQL Editor as the database owner BEFORE deploying V464.
-- No existing orders are updated and there is no historical backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_order_supervision_notification_events (
  id text PRIMARY KEY,
  recipient_id text NOT NULL,
  owner_id text NOT NULL,
  order_number text NOT NULL,
  source_row_ids text[] NOT NULL,
  category text NOT NULL DEFAULT 'orders',
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,
  in_app_done boolean NOT NULL DEFAULT false,
  push_done boolean NOT NULL DEFAULT false,
  email_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  lease_token text,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  delivery_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.erp_order_supervision_notification_events
  ADD COLUMN IF NOT EXISTS delivery_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS erp_order_sv_notification_due_idx
  ON public.erp_order_supervision_notification_events (status, next_attempt_at, created_at);
ALTER TABLE public.erp_order_supervision_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_order_supervision_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.erp_order_supervision_notification_events TO service_role;

-- Only real new orders trigger this event, not a change of status, an edit
-- adding another component to an existing order, or approved proposal orders.
-- Statement-level transition rows give us exactly one event per order/recipient,
-- even when Shopping Cart inserts dozens of components in one batch.
CREATE OR REPLACE FUNCTION public.erp_enqueue_new_order_supervision_v464()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  WITH eligible AS (
    SELECT n.id::text AS row_id, n.order_number::text AS order_number,
           m.id::text AS owner_id, COALESCE(NULLIF(btrim(m.name::text), ''), 'Team member') AS owner_name,
           COALESCE(NULLIF(btrim(n.order_type::text), ''), 'Order') AS order_type
    FROM inserted_order_rows n
    JOIN public.team_members m ON m.id::text = COALESCE(
      NULLIF(btrim(n.team_member_id::text), ''),
      (SELECT min(old_member.id::text) FROM public.team_members old_member
        WHERE lower(btrim(old_member.name::text)) = lower(btrim(n.team_member_name::text))
          AND NULLIF(btrim(n.team_member_name::text), '') IS NOT NULL
        HAVING count(*) = 1)
    )
    WHERE n.order_number::text ~ '^[0-9]+$'
      AND regexp_replace(lower(COALESCE(n.status::text,'')), '[^a-z]', '', 'g') IN ('undersupervision','notstarted')
      AND regexp_replace(lower(COALESCE(n.sv_approval::text,'')), '[^a-z]', '', 'g') IN ('','notstarted','pending')
      AND regexp_replace(lower(COALESCE(n.order_type::text,'')), '[^a-z]', '', 'g')
          IN ('requestproducts','withdrawproducts','withdrawalproducts','requestwithdrawal','requestmaintenance')
      AND NOT EXISTS (
        SELECT 1 FROM public.orders previous
        WHERE previous.order_number = n.order_number
          AND NOT EXISTS (SELECT 1 FROM inserted_order_rows ins WHERE ins.id = previous.id)
      )
  ), batches AS (
    SELECT order_number, owner_id, owner_name, order_type,
           array_agg(row_id ORDER BY row_id) AS source_row_ids
    FROM eligible GROUP BY order_number, owner_id, owner_name, order_type
  )
  INSERT INTO public.erp_order_supervision_notification_events
    (id, recipient_id, owner_id, order_number, source_row_ids, title, body, url, next_attempt_at)
  SELECT DISTINCT 'ordersv:' || md5(b.source_row_ids[1] || ':' || s.team_member_id::text),
    s.team_member_id::text, b.owner_id, b.order_number, b.source_row_ids,
    'New order awaiting approval',
    left(b.owner_name, 200) || ' submitted ORD-' || b.order_number || ' (' || left(b.order_type, 80) || '). Your approval is required.',
    '/next/orders-review?q=ORD-' || b.order_number, now() + interval '2 minutes'
  FROM batches b
  JOIN public.team_member_sv_schools s ON s.visible_team_member_id::text = b.owner_id
  JOIN public.team_members supervisor ON supervisor.id::text = s.team_member_id::text
  WHERE COALESCE(to_jsonb(supervisor)->>'is_active', 'true') <> 'false'
  ON CONFLICT (id) DO NOTHING;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.erp_enqueue_new_order_supervision_v464() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS erp_new_order_supervision_v464 ON public.orders;
CREATE TRIGGER erp_new_order_supervision_v464
  AFTER INSERT ON public.orders
  REFERENCING NEW TABLE AS inserted_order_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.erp_enqueue_new_order_supervision_v464();

-- Normal Shopping Cart submissions release their notices immediately after the
-- complete save (including custom catalog requests). A short fallback delay
-- keeps concurrent refreshes away from an unfinished/rolled-back submission.
CREATE OR REPLACE FUNCTION public.erp_release_order_supervision_notifications_v464(
  p_order_number text, p_owner_id text, p_row_ids text[]
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  UPDATE public.erp_order_supervision_notification_events e
  SET next_attempt_at = least(e.next_attempt_at, now())
  WHERE e.order_number = p_order_number AND e.owner_id = p_owner_id
    AND e.source_row_ids <@ p_row_ids AND cardinality(p_row_ids) > 0
    AND e.status = 'pending' AND e.attempts = 0;
$$;
REVOKE ALL ON FUNCTION public.erp_release_order_supervision_notifications_v464(text,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_release_order_supervision_notifications_v464(text,text,text[]) TO service_role;

-- The same leased/retry-based delivery pattern as the existing event worker.
CREATE OR REPLACE FUNCTION public.erp_claim_order_supervision_notifications_v464(p_limit integer DEFAULT 6)
RETURNS SETOF public.erp_order_supervision_notification_events
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  WITH picked AS (
    SELECT e.id FROM public.erp_order_supervision_notification_events e
    WHERE (e.status = 'pending' AND e.next_attempt_at <= now())
       OR (e.status = 'processing' AND e.lease_until <= now())
    ORDER BY e.created_at, e.id
    LIMIT greatest(1, least(20, COALESCE(p_limit,6))) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.erp_order_supervision_notification_events e
  SET status = 'processing', attempts = e.attempts + 1,
      lease_token = md5(random()::text || clock_timestamp()::text || e.id),
      lease_until = now() + interval '5 minutes'
  FROM picked WHERE e.id = picked.id RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.erp_claim_order_supervision_notifications_v464(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_claim_order_supervision_notifications_v464(integer) TO service_role;

-- Recheck the requested order and the exact supervision link before each
-- delivery attempt. An undone/deleted/reviewed order or revoked supervision
-- must not produce a new approval reminder. Source IDs prevent number reuse.
CREATE OR REPLACE FUNCTION public.erp_order_supervision_notice_current_v464(p_id text, p_lease_token text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_order_supervision_notification_events e
    JOIN public.team_member_sv_schools s ON s.team_member_id::text = e.recipient_id
                                        AND s.visible_team_member_id::text = e.owner_id
    JOIN public.team_members m ON m.id::text = e.recipient_id
    WHERE e.id = p_id AND e.lease_token = p_lease_token AND e.status = 'processing'
      AND e.lease_until > now()
      AND COALESCE(to_jsonb(m)->>'is_active', 'true') <> 'false'
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id::text = ANY(e.source_row_ids) AND o.order_number::text = e.order_number
          AND regexp_replace(lower(COALESCE(o.status::text,'')), '[^a-z]', '', 'g') IN ('undersupervision','notstarted')
          AND regexp_replace(lower(COALESCE(o.sv_approval::text,'')), '[^a-z]', '', 'g') IN ('','notstarted','pending')
          AND (o.team_member_id::text = e.owner_id OR (
            NULLIF(btrim(o.team_member_id::text), '') IS NULL AND e.owner_id = (
              SELECT min(owner_member.id::text) FROM public.team_members owner_member
              WHERE lower(btrim(owner_member.name::text)) = lower(btrim(o.team_member_name::text))
                AND NULLIF(btrim(o.team_member_name::text), '') IS NOT NULL
              HAVING count(*) = 1
            )
          ))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.erp_order_supervision_notice_current_v464(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_order_supervision_notice_current_v464(text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
