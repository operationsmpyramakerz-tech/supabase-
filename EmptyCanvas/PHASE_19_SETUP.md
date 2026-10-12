# Orders Workspace — Phase 19 (Full Proposal Data in Existing Bundle)

## Install

1. **Supabase SQL Editor first:** run `supabase_orders_phase19_full_proposal_bundle.sql` in full. This replaces the existing *read-only* `public.erp_order_detail_bundle_v1(text[])` function, keeping its current name, signature and service-role-only access. Requires the Phase 14 helper `erp_detail_rows_by_key_v1`; no order, product or Kit rows are edited. No new tables are created.
2. **GitHub / Vercel:** upload the changed JavaScript files while keeping their original paths. Deploy after SQL completes successfully.
3. Reload **Operations Orders**, enable **Speed**, and open ORD-3 for a fresh measurement.

## Why

The Phase 14 bundle returned only proposal items matching the order's current product IDs or names. Historical orders may contain a renamed/deleted product, so one unresolved row triggered `getProposalForOrderSources(...)` *after* the database bundle had completed. This was about 650 ms in the last user-supplied trace, and still produced `proposalRecovered=0`.

The new SQL obtains all items from **only the original proposals referenced by the requested order**, via the indexed `proposal_id` key, as part of the existing single RPC call. The bundle sets `proposalItemsComplete: true` only on the upgraded SQL. With that explicit proof, the server can distinguish an actual missing original proposal/product entry from an incomplete older bundle. Only the proven-no-match case skips the redundant follow-up query. Malformed source information still falls back to the original recovery path.

## Speed diagnostics

- `bundleProposalComplete=1`: new SQL installed and used.
- `bundleProposalNoMatch`: how many historical order rows are provably absent from the full source proposal (these can now skip a pointless repeat lookup).
- `bundleProposalEmpty`: number of legacy rows with no recoverable source in the live bundle.
- `proposalUnresolved=0`: no extra Proposal source query was required.
- `fastPath=1`: bundle used successfully.

If `bundleProposalComplete=0`, deploy status or migration likely needs checking; the old request path is preserved. The SQL must be executed first to activate this optimization.

## Safety / rollback

The function has `security invoker` and is executable only by `service_role`; existing Next.js page-access checks still run before the DB read. No persistent user data cache or unsafe guessed Kit sources. If a proposal has an unusually large number of items, the complete bundle may be larger. Watch `bundle` duration and JSON parsing, not just the total time; use the original Phase 14 SQL function definition to roll back if this workload becomes worse.

Static JavaScript/classification tests pass; SQL has not been executed against live Supabase here, and no production/Vercel benchmark has been run. Do not assume an exact speed improvement until measuring after deployment.
