-- V421: additional Operations receipts for an already partially delivered order.
-- Run ONCE in self-hosted Supabase SQL Editor BEFORE deploying the frontend patch.
-- All changes for the selected components execute in a single PostgreSQL transaction.
-- The function is only callable with the server-side service_role key.
-- IMPORTANT: uses public.orders, the same default orders table as the ERP.

CREATE OR REPLACE FUNCTION public.operations_receive_remaining_v421(
  p_quantities jsonb,
  p_received_by text,
  p_receipt_number text DEFAULT NULL,
  p_issue_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_pair record;
  v_order public.orders%ROWTYPE;
  v_id bigint;
  v_new_id bigint;
  v_now numeric;
  v_base numeric;
  v_received numeric;
  v_remaining numeric;
  v_order_number bigint;
  v_status text;
  v_copy jsonb;
  v_columns text;
  v_values text;
  v_receipt text;
  v_count integer := 0;
  v_new_ids jsonb := '[]'::jsonb;
BEGIN
  IF p_quantities IS NULL OR jsonb_typeof(p_quantities) <> 'object'
     OR p_quantities = '{}'::jsonb THEN
    RAISE EXCEPTION 'Select at least one component quantity to receive.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_received_by, '')), '') IS NULL THEN
    RAISE EXCEPTION 'The Operations recipient must be identified.' USING ERRCODE = '22023';
  END IF;

  -- Copy all existing business columns without guessing custom schema fields.
  -- Exclude generated, identity, database primary key, and legacy unique Notion IDs.
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
         string_agg(format('(x.r).%I', a.attname), ', ' ORDER BY a.attnum)
    INTO v_columns, v_values
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.orders'::regclass
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attgenerated = '' AND a.attidentity = ''
     AND a.attname NOT IN ('id', 'notion_page_id', 'notion_id', 'page_id', 'notionPageId')
     AND NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index idx
        WHERE idx.indrelid = a.attrelid AND idx.indisunique
          AND idx.indnkeyatts = 1 AND idx.indkey[0] = a.attnum
     );
  IF v_columns IS NULL OR v_values IS NULL THEN
    RAISE EXCEPTION 'Orders table columns could not be verified.' USING ERRCODE = '22023';
  END IF;

  FOR v_pair IN SELECT key, value FROM jsonb_each(p_quantities) ORDER BY key LOOP
    IF v_pair.key !~ '^[0-9]+$' OR jsonb_typeof(v_pair.value) <> 'number' THEN
      RAISE EXCEPTION 'Invalid Operations component ID or quantity.' USING ERRCODE = '22023';
    END IF;
    v_now := (v_pair.value #>> '{}')::numeric;
    IF v_now < 0 OR v_now > 1000000000 OR scale(v_now) > 6 THEN
      RAISE EXCEPTION 'Invalid receipt quantity for component %.', v_pair.key USING ERRCODE = '22023';
    END IF;
    IF v_now = 0 THEN CONTINUE; END IF;

    v_id := v_pair.key::bigint;
    SELECT * INTO v_order FROM public.orders WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Component % no longer exists. Refresh the order.', v_id USING ERRCODE = '22023';
    END IF;
    IF regexp_replace(lower(coalesce(v_order.order_type, '')), '[^a-z0-9]', '', 'g') <> 'requestproducts' THEN
      RAISE EXCEPTION 'Additional receipts only support Request Products.' USING ERRCODE = '22023';
    END IF;
    IF v_order_number IS NULL THEN v_order_number := v_order.order_number;
    ELSIF v_order.order_number IS DISTINCT FROM v_order_number THEN
      RAISE EXCEPTION 'Receive components for only one order per request.' USING ERRCODE = '22023';
    END IF;

    v_status := lower(btrim(coalesce(v_order.status, '')));
    IF v_status NOT IN ('shipped', 'shipping', 'arrived', 'delivered', 'received') THEN
      RAISE EXCEPTION 'Component % is not in Shipping/Delivered.', v_id USING ERRCODE = '22023';
    END IF;

    v_base := coalesce(v_order.quantity_edited_by_supervisor,
                       v_order.quantity_requested, v_order.quantity_progress, 0);
    v_received := coalesce(v_order.quantity_received_by_operations, 0);
    v_remaining := coalesce(v_order.quantity_remaining, v_base - v_received);
    IF v_base <= 0 OR v_received < 0 OR v_remaining <= 0
       OR abs((v_received + v_remaining) - v_base) > 0.000001
       OR v_now > v_remaining THEN
      RAISE EXCEPTION 'Receipt exceeds the outstanding quantity or stored quantities changed for component %. Refresh the order.', v_id
        USING ERRCODE = '22023';
    END IF;

    v_receipt := NULLIF(btrim(coalesce(p_receipt_number, '')), '');
    IF v_status IN ('arrived', 'delivered', 'received') THEN
      -- The previously delivered quantity belongs to the existing stock source
      -- row. Never change that row's ID or its signed receipt photos.
      IF v_received <= 0 THEN
        RAISE EXCEPTION 'Previously delivered component % has no received quantity. Reconcile it before receiving another batch.', v_id
          USING ERRCODE = '22023';
      END IF;

      -- The new Shipped row is a new delivery batch under the SAME order_number.
      -- Its distinct ID will become the idempotent Stocktaking source ID when
      -- the user later uploads a delivery receipt for only this batch.
      v_copy := to_jsonb(v_order) || jsonb_build_object(
        'status', 'Shipped',
        'quantity_requested', v_remaining,
        'quantity_progress', v_remaining,
        'quantity_edited_by_supervisor', NULL,
        'quantity_received_by_operations', v_now,
        'quantity_remaining', v_remaining - v_now,
        'order_receipt', NULL,
        'maintenance_receipt', NULL,
        'receipt_number', v_receipt,
        'person_received_by_operations', p_received_by,
        'issue_description', CASE WHEN nullif(btrim(coalesce(p_issue_description, '')), '') IS NOT NULL
                                  THEN p_issue_description ELSE v_order.issue_description END
      );
      EXECUTE format(
        'INSERT INTO public.orders (%s) SELECT %s FROM (SELECT jsonb_populate_record(NULL::public.orders, $1) AS r) x RETURNING id',
        v_columns, v_values
      ) INTO v_new_id USING v_copy;
      IF v_new_id IS NULL THEN
        RAISE EXCEPTION 'Could not create the next delivery batch.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.orders
         SET quantity_requested = v_received,
             quantity_progress = v_received,
             quantity_edited_by_supervisor = NULL,
             quantity_received_by_operations = v_received,
             quantity_remaining = 0
       WHERE id = v_id;
      v_new_ids := v_new_ids || jsonb_build_array(v_new_id);

    ELSE
      -- A still-Shipped component has not entered Stock yet: increase its
      -- cumulative received quantity, do not create a second stock source row.
      UPDATE public.orders
         SET quantity_received_by_operations = v_received + v_now,
             quantity_remaining = v_remaining - v_now,
             status = 'Shipped',
             person_received_by_operations = p_received_by,
             receipt_number = CASE
               WHEN v_receipt IS NULL THEN receipt_number
               WHEN receipt_number IS NULL OR btrim(receipt_number) = '' THEN v_receipt
               WHEN v_receipt = ANY(string_to_array(replace(receipt_number, ', ', ','), ',')) THEN receipt_number
               ELSE receipt_number || ', ' || v_receipt
             END,
             issue_description = coalesce(NULLIF(btrim(coalesce(p_issue_description, '')), ''), issue_description)
       WHERE id = v_id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Enter at least one received quantity.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('success', true, 'receivedCount', v_count, 'newRowIds', v_new_ids);
END;
$fn$;

REVOKE ALL ON FUNCTION public.operations_receive_remaining_v421(jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operations_receive_remaining_v421(jsonb, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.operations_receive_remaining_v421(jsonb, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.operations_receive_remaining_v421(jsonb, text, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
