# Orders performance — Phase 20 (reduce duplicate reads + measure DB query stages)

## Install order

1. In **Supabase > SQL Editor**, run `supabase_orders_phase20_bundle_optimization.sql` (separate download). It replaces only `public.erp_order_detail_bundle_v1(text[])` and keeps the Phase 19 return contract. It does **not** edit records, change access grants, create a persistent cache, or add tables.
2. In GitHub, upload just the five changed JavaScript files from the patch ZIP, keeping their original directory paths, then wait for Vercel deployment.
3. Reload Operations Orders and measure an **uncached** first opening of ORD-3 with the existing Speed panel. Prefer taking at least three measurements; cold starts and mobile networking can vary substantially.

## What changed

- Product name fallback is queried only for order rows whose stored ID does **not** resolve to a product with the same saved name. Existing renamed/removed/missing ID fallbacks stay available.
- Proposal headers are queried by name only where a row has no stored proposal ID.
- The original proposal's item list is skipped only when no proposal-generated row needs kit-source recovery and all such rows have a usable nonempty `source_kits` JSON array. Ambiguous and legacy rows still perform the complete original-proposal lookup, as in Phase 19.
- DB step timings are now included in the RPC JSON metadata and exposed in the existing `Server-Timing` response header as `bundleDbRows`, `bundleDbProductsId`, `bundleDbProductsName`, `bundleDbProposalHeaders`, `bundleDbKitItems`, `bundleDbKits`, `bundleDbFolders`, `bundleDbProposalItems`, plus `bundleProposalScanSkipped` (0 or 1).

## Interpreting timings

`bundle` includes the full RPC HTTP round-trip, SQL execution, and response parsing. `bundleDb...` values measure individual queries inside PostgreSQL only; their sum will normally be **less** than `bundle`, and any difference is not purely network latency (SQL assembly and JSON serialization also take time). With this breakdown, further optimization can target the actual slow SQL stage rather than guessing.

## Compatibility and rollback

The older JavaScript works with the new SQL and vice versa (unrecognized `dbTimings` is ignored). Access remains service-role only, behind the existing API authorization checks. If needed, restore the **Phase 19 SQL** (`supabase_orders_phase19_full_proposal_bundle.sql`) in Supabase SQL Editor and revert these changed JS files. This avoids making changes to stored order or proposal data.

## Tests and limitations

Node syntax and existing proposal-classification regression tests are checked in this environment. The SQL has **not** been executed against live Supabase, and full Next.js build / real latency are **not** verified here. No timing improvement is guaranteed until the deployment is measured.
