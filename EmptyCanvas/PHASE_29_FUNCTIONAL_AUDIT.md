# Phase 29 — Orders functional audit

Base: `supabase--main-40.zip`

## Changes

1. **My Orders desktop empty state** — The `.co-cards` container uses desktop CSS grid auto-fill tracks; the empty-state card previously occupied only the first track. It now spans the entire grid and is horizontally centered with a 440 px maximum width. Media query `min-width: 769px` leaves mobile unchanged. Shared rule also benefits other orders pages' empty states.
2. **Operations edit — stale/mismatched changes** — Validate that all updated/deleted component IDs and quantity keys belong to the selected order *before* any database write. Reject stale source-specific edits/deletions when an existing source cannot be matched; in particular, a deleted or missing source list can no longer cause an unintended full component deletion. Respond with HTTP 409 so the operator reloads the order.
3. **My Orders Archive/Restore** — Require appropriate row states (archive only active, restore only wholly archived) and verify all selected rows are returned by the update. Existing restore destination `In progress` is intentionally left unchanged for backwards compatibility.
4. **Post-save refresh** — After a confirmed Operations edit, Current Orders Archive/Restore, or Current Orders Delete, a failed list-refresh now logs a warning without reporting that the committed mutation failed. Reopening/refeshing the page fetches the latest information.

## Tests

- `node --test tests/orders-phase29-edit-archive.test.mjs` — 7/7 passed
- `node --test tests/orders-phase28-workflow.test.mjs` — 11/11 passed
- `node scripts/combined-order-export.test.mjs` — 22/22 passed
- JS syntax checked with Node, JSX parsed using TypeScript, CSS parsed using PostCSS.

## Deferred / important limitations

- There is no live Supabase / Vercel validation in this package.
- Multi-row Operations edits, insert/delete operations, and Stocktaking synchronization are still not a single atomic database transaction. A write/network failure between statements can require reconciliation; true atomicity would require a carefully scoped database function/transaction and live schema verification.
- The existing Current Orders unarchive behavior restores status to `In progress`, not the original pre-archive status. Persisting previous statuses requires a schema/workflow design before changing this safely.
- Cross-page consistency still relies on refetch/refresh and server-side cache invalidation; no new cross-tab broadcasts have been introduced.

## Deployment

Upload only modified/new files by their original paths. No SQL migration or Vercel Region change is required for Phase 29.
