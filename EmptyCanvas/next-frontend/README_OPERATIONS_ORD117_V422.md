# Operations Orders — ORD-117 legacy Remaining receipt fix (V422)

## What happened
`operations_receive_remaining_v421` rejected any component with status `Arrived`/`Delivered` and `quantity_received_by_operations = 0`, even when `quantity_remaining` equals the entire requested quantity. This is a legacy status inconsistency, not evidence that the component has been stocked. ORD-117 component row 11659 surfaced this error.

## Install (required)
1. Confirm that Stocktaking is using the default `public.stocktaking` table with a `source_order_id` column. This SQL assumes `SUPABASE_STOCKTAKING_TABLE` has NOT been overridden to another table name.
2. Back up the database and run `2026-11-16-operations-legacy-unreceived-v422.sql` in the **self-hosted Supabase SQL Editor**. This **replaces the already installed `operations_receive_remaining_v421` function** and is repeatable. It changes no order data just by being installed.
3. No frontend/API deployment is needed for this issue. Refresh Operations Orders and retry **Received by operations** for ORD-117.
4. After confirmation, its received quantity appears under **Shipping** on the same ORD-117. **Mark as Delivered** adds that row only to the requester's Stocktaking; other already-delivered components are unaffected.

## Safety
- Only a legacy delivered row with `received = 0`, `remaining = base`, and **NO stocktaking row with `source_order_id = order component ID`** is converted in place to Shipped.
- Linked stock sources remain blocked, even when their current Stocktaking quantity is zero (it could have been consumed).
- Normal partial deliveries with positive received quantities still get a new `Shipped` component row under the original order number, preserving the delivered source row.
- The transaction locks the order row; repeated receiving cannot exceed the remaining balance.
- A missing `public.stocktaking.source_order_id` fails closed. Do not bypass this protection by marking delivered rows as shipped manually.
- This is a database migration; tests are static/regression checks, not a live test of the company's Supabase data.

## Optional read-only verification of ORD-117
```sql
SELECT id, order_number, product_name, status,
       quantity_requested, quantity_edited_by_supervisor,
       quantity_received_by_operations, quantity_remaining
FROM public.orders
WHERE order_number = 117
ORDER BY id;

SELECT id, source_order_id
FROM public.stocktaking
WHERE source_order_id::text = '11659';
```
The expected case is source row 11659 with received = 0/NULL, remaining = 7, and no Stocktaking link. If a stock source row is found, investigate its history rather than importing it again.
