# ERP Orders – Phase 14: one-call detail loading

## Installation (order matters)

1. Open **Supabase → SQL Editor** and execute the entire `supabase_order_details_fast_path.sql` file. Run it using your database administrator account. This script creates three functions and conditional indexes; it does not delete or rewrite order data and can be rerun.
2. In **Vercel → project → Environment Variables**, make sure `SUPABASE_SERVICE_ROLE_KEY` (or the server-side service-role alternative already used by the backend) is configured for your server deployment. **Never** put a service-role key in `NEXT_PUBLIC_` variables or client JavaScript. The RPC is intentionally not executable with an anon/authenticated key.
3. Upload only the changed files in this package to GitHub, preserving their directory paths, and deploy. The `supabase_order_details_fast_path.sql` file does not need to be deployed for runtime operation, but keep it in the repository for reproducibility.
4. Open Operations Orders, enable **Speed**, and open ORD-3 after a fresh page reload. Copy the timings. Look for `bundle;dur=...` and `fastPath;dur=1.0` in `serverTiming`.
5. If `fastPath` is missing, the safe legacy fallback was used. Check SQL execution, service role configuration, and whether your environment uses custom names for the canonical tables. Nothing is silently dropped from the detail payload.

## Design

- Reads all exact requested order component IDs in PostgreSQL, plus matching product metadata, kit memberships/folders and proposal sources, in a single server-to-Supabase call. Indexes support keyed lookups, including legacy name-only rows.
- No new persistent snapshot table and no background stale cache: data are read live. Existing authentication and page-level visibility/ownership checks are preserved.
- All four details endpoints use the new RPC paths: Operations, Orders Review and Maintenance use full metadata, My Orders uses a lightweight raw-only function.
- If the new function is unavailable, the database schema differs, or required records are incomplete, the original verified REST loader continues to work. **This fallback may still be slow**.
- This package was statically checked; the SQL has not been executed on your live Supabase instance and no Vercel end-to-end benchmark was possible here. Do not assume a guaranteed speed until the Speed panel is tested after deployment.

## SQL objects

- `public.erp_detail_rows_by_key_v1(...)` (internal)
- `public.erp_order_detail_bundle_v1(text[])` (full read)
- `public.erp_order_detail_rows_v1(text[])` (raw-only)
- Access: `service_role` only, grants to `anon`, `authenticated` and `PUBLIC` revoked.
