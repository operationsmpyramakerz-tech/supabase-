# Phase 23 — Lossless Compact Bundle Transport

## Why
The last `ORD-3` Speed log measured `bundleBody=701ms` while PostgreSQL stages totalled about `32ms`. The JSON response was 568,432 bytes (555.1 KiB **uncompressed**). The new optional transport sends field names once per table-shaped collection, then restores the original rows on Vercel. **All fields and nested values are retained.**

## Install (SQL FIRST)

1. In Supabase SQL Editor, run **the complete** `EmptyCanvas/supabase_orders_phase23_compact_bundle.sql`. The phase 20 function `erp_order_detail_bundle_v1(text[])` must already exist.
2. Upload the modified/new files to the **same paths** under `EmptyCanvas/` in your GitHub repository, then wait for a successful Vercel deployment.
3. In Operations Orders, enable **Speed**. Open a large order (e.g. ORD-3) after waiting 45+ seconds or reloading the page to avoid the client cache. Use **Copy timings**.

## Expected diagnostics

- `bundleCompact=1`: compact transport is active.
- `bundleCompact=0` and possibly `bundleCompactFallback=1`: old full-data RPC was used safely; check that SQL is installed and the Vercel deployment is up to date.
- `bundleDbPack`: PostgreSQL time packing the arrays.
- `bundleUnpack`: Node.js time restoring the original row objects.
- `bundleBody`: elapsed time reading Supabase RPC response body.
- `bundleBytes`: size of actual RPC JSON returned to Vercel, *before HTTP compression*.

Collect at least three **uncached** timings and compare medians with the original 555.1 KiB / 701ms response body, not just a single run. There is no guaranteed savings percentage or server latency improvement until tested on the real data and network.

## Safety and compatibility

- The SQL creates a **new** read-only RPC and packing helper. The existing RPC is not modified. No tables or order/product/kit records are updated.
- Both SQL functions have execution revoked from `public`, `anon` and `authenticated`, and are granted to `service_role` only, matching the protected old route. No service key ever goes to browser code.
- The existing Next.js API checks session and access permissions **before** the new RPC is used. Invalid/missing/incompatible compact results automatically trigger the original RPC.
- Arrays with differing object columns are sent unchanged (`raw`) instead of dropping fields. The decoder rejects truncated arrays. The original validation of order IDs still applies.
- Optional emergency fallback: set `ORDERS_COMPACT_BUNDLE_ENABLED=false` in Vercel and redeploy to force the original v1 RPC without reverting other changes.
- Run the pure JS compatibility test if needed: `node EmptyCanvas/next-frontend/scripts/test-order-compact-bundle.mjs`.
