# Home Dashboard — Phase 4: audited processing time

## Deployment order

1. Open the **Supabase SQL Editor** and run `EmptyCanvas/supabase_order_lifecycle_audit.sql` once. It creates an append-only lifecycle events table and a database trigger on `public.orders`. It does **not** rewrite old orders. The SQL assumes `SUPABASE_ORDERS_TABLE=orders`.
2. Confirm your **server-side** Vercel environment includes `SUPABASE_SERVICE_ROLE_KEY` or one of the supported Supabase server secret-key alternatives. The audit table is not readable via an anon key; never put the service key in a `NEXT_PUBLIC_*` variable or frontend code.
3. Upload the changed Next.js files preserving their paths under `EmptyCanvas/next-frontend/`. The SQL script is for Supabase, **not** for GitHub execution.
4. After deploy, create a new order, approve it and deliver it. In Supabase SQL Editor verify events were captured:
   ```sql
   select id,order_number,row_id,event_type,status,sv_approval,occurred_at
   from public.erp_order_lifecycle_events order by id desc limit 30;
   ```
5. Reload Home → Processing time. A completed audited order is required before a non-empty duration appears.

## What the metrics mean

- **Current**: from first captured creation event to the moment **all** of its recorded component rows are completed/delivered.
- **Review**: creation → the moment all recorded rows are approved by supervisor (`sv_approval`).
- **Operations / Maintenance**: last supervisor approval → all rows delivered/completed.
- The card shows median, average, fastest, longest and the verified sample count. Times use **calendar hours**, not working days/hours.
- Old orders and incomplete/mixed histories are **excluded**, not assigned an artificial timestamp. The UI displays `—` when no verified completed timeline exists.
- Each workspace keeps the same user/period visibility filters as the rest of Home. Timelines are calculated separately for each workspace, not combined.

## Limitations / next step

- A formally enforced SLA **is not yet enabled**: the company must define deadlines, operating hours, exclusions and escalation rules for each workflow before overdue flags can be considered accurate.
- Stage changes based solely on maintenance log fields without changes to `status`, `sv_approval`, `operations_approval`, or `order_type` are not timestamped as a distinct step. Final delivery statuses are tracked.
- A new/old order number change causes conservative exclusion from completion metrics; historical IDs are not silently assumed to refer to the same timeline.
- A Supabase outage or missing permissions does not break Home: a nonblocking message appears in Processing time.
- The reporting query has a safety limit for unusually large selections. Apply a shorter Analysis period or a specific user if requested.

## Files in this phase

- `EmptyCanvas/supabase_order_lifecycle_audit.sql`
- `EmptyCanvas/next-frontend/lib/home-lifecycle-analytics.mjs`
- `EmptyCanvas/next-frontend/lib/home-lifecycle-data.js`
- `EmptyCanvas/next-frontend/lib/home-overview-data.js`
- `EmptyCanvas/next-frontend/components/home/HomeOverviewClient.jsx`
- `EmptyCanvas/next-frontend/app/home/page.jsx`
- `EmptyCanvas/next-frontend/public/css/home-dashboard-v2.css`
- `EmptyCanvas/next-frontend/scripts/test-home-lifecycle-analytics.mjs`
