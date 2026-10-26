# ERP — Phase 2Q3F: Opt-in Atomic Whole-Order Mutations

Base archive: `supabase--main-119.zip`. Focus: the remaining race between checking whether a selected order is complete and performing `Archive / Unarchive / Delete` in **Operations Orders** and **My Orders**.

## Security change

- Added SQL RPC `erp_atomic_order_action` as one Postgres transaction for **one complete order**. A write-conflicting table lock is acquired before re-reading its components and validating the expected snapshot (IDs, statuses, owners, key quantities); a changed, expanded or incomplete order aborts without any mutation.
- The SQL operation updates/deletes exactly the submitted rows and checks the affected count. Exceptions roll back the entire transaction. The function is callable by `service_role` only; `PUBLIC`, `anon`, and `authenticated` are revoked. The Next.js API continues checking feature permissions, admin password, and Own/Team/All scope **before** invoking the server-only RPC.
- My Orders keeps its existing archived/not-archived status checks; the database snapshot prevents a stale status transition after those checks.
- RPC is deliberately **disabled by default** to protect deployed installations that have not run the migration. When `ERP_ATOMIC_ORDER_MUTATIONS=enabled` is set, **there is no fallback** to legacy multi-request writes if the RPC is missing, fails, or denies access.
- The SQL is intentionally scoped to `public.orders`. The RPC path refuses a custom `SUPABASE_ORDERS_TABLE`.

## Deployment — staged rollout required

1. Back up the Staging database and verify that the real table is `public.orders` with expected `id`, `order_number`, `status` and quantity/owner fields. Review `sql/ERP_Phase2Q3F_Atomic_Order_Actions.sql`; apply it manually using the Supabase SQL editor / a privileged migration role in Staging. **The ZIP does not execute SQL.**
2. Deploy the code to Staging with `ERP_ATOMIC_ORDER_MUTATIONS` unset, and verify normal actions still work (legacy behavior).
3. Ensure the server uses a Supabase **service role** credential (never expose it to the browser). Set `ERP_ATOMIC_ORDER_MUTATIONS=enabled` in Staging; run `npm run security:preflight`.
4. Test Archive, Unarchive, and Delete on disposable complete multi-component orders, from both My Orders and Operations Orders. Test incomplete/mixed IDs, changed quantity/status/ownership between load and write, explicitly denied users and Own/Team/All grants. Confirm requests fail with no rows changed, and that a missing SQL function fails closed.
5. Use two concurrent sessions to attempt an insert/update while an archive is executing. Verify only an all-or-nothing mutation is committed and monitor latency. The SQL takes a **table-wide lock** for a short transaction; high write loads may time out (lock wait capped at five seconds) and must be performance tested.
6. Only after these tests and database backup, run the SQL in Production, verify permissions, and enable the flag on **all** app instances in the same controlled release. Watch database logs and mutation latency.

## Rollback

- Set `ERP_ATOMIC_ORDER_MUTATIONS=disabled` or unset it and redeploy all app instances. This restores the **legacy non-atomic path**; this rollback is a compatibility measure, **not a secure final solution**.
- Only after disabling the flag everywhere, optionally execute `DROP FUNCTION IF EXISTS public.erp_atomic_order_action(text,text[],text,jsonb);` as the database owner.
- Disabling the flag does not roll back archive/delete operations already committed. Use backups for data recovery.

## Verification and limitations

- Dependency-free Node regression tests verify request snapshots, invalid selections, SQL transaction/security structure, route wiring, fail-closed behavior and preflight requirements. All project tests: **368/368 passed** (see final run before uploading). JavaScript syntax checks passed.
- **Not** verified against a live PostgreSQL instance. No live Supabase migration, concurrent integration test, end-to-end staging operation, or Production Build was performed.
- No promise of atomicity applies while the flag is disabled. Existing scope checks are outside the SQL transaction; changes to permissions/team mappings during the small execution window require an additional policy review. The SQL snapshot does check order row ownership changes.
- The function is specifically a one-order transaction, not a general solution for other edit flows (e.g., individual component edits, Shipped/Arrived, deliveries or stocktaking).

## Plan remaining

- Phase 2Q2 live: verify Private Storage migration and bucket/RLS policies on Supabase.
- Phase 2Q3: finish reviewing remaining API endpoints and other multi-step order/stocktake operations.
- Phase 2Q4: multi-user Staging permission/ownership test matrix.
- Phase 2Q5: install dependencies, Production Build, Staging deployment, security preflight and final operations review.
- Separate security migration needed for plaintext passwords and name-based Admin trust.
