# Orders Performance — Phase 16

## What changed

- Faster fallback source reconstruction for historical proposal orders: header and items queries now run concurrently (no schema migration required).
- `Server-Timing` now includes `proposalUnresolved`, `proposalRecovered`, and `proposalFallbackTags` for each detail request. These values are **counts**, encoded in the `dur` field like the existing diagnostic flags.
- An optional, **preview-first** SQL script to fill missing `orders.source_kits` only when one exact matching proposal item exists **and** that item has a nonempty JSON array of sources. Ambiguous, deleted or name-mismatched items are NOT updated.
- A new private audit table records every migrated row, previous value and filled value. The script does not change order quantities, prices or statuses.

## Upload and apply

1. Upload the **changed Next.js files** to GitHub keeping the full directory paths. Wait for a successful Vercel deployment.
2. Optional: in **Supabase SQL Editor**, run `supabase_order_sources_backfill_phase16.sql` (creates an audit table and a database function; performs *preview only*, **NO orders are updated yet**). Ensure database backups are current before applying migration changes.
3. Inspect the `eligible` count. When acceptable, **run separately** `select public.erp_order_sources_backfill_phase16(true);`. The resulting `updated` count should reflect rows changed and audited. Do not run the apply command if the preview result is unexpected.
4. Reload Operations Orders, enable Speed, open ORD-3 and copy timings. Look for `proposalUnresolved`, `proposalRecovered`, `proposalFallbackTags`, `proposalFallback`, `bundle`, and `fastPath`.
5. If `eligible` = 0 or `proposalUnresolved` stays positive, the historical rows did not have a unique recoverable source; don't force updates. Send the new timings for a more precise next step.

## Safety and compatibility

- This backfill is **optional**. Existing code works without it.
- SQL targets canonical `orders` and `product_proposal_items`, and requires an existing phase-14 bundle RPC to keep that fast path active. It is not a substitute for phase-14 setup.
- No background cache or bypass of session permissions; all reads use the current permission gate.
- The apply action is **not automatic**, because it writes to historical order rows. The audit table tracks modified records. To roll back, restore only rows still equal to the audited `filled_source_kits`, after reviewing affected rows.
- Never put a Supabase service-role key in a browser or a `NEXT_PUBLIC_*` environment variable.
- No production timings or Vercel build were run in this workspace.
