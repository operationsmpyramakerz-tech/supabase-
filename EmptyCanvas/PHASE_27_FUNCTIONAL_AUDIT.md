# Phase 27 — Orders workflow correctness (changed files only)

Based on `supabase--main-38.zip`. No SQL migration or Vercel Region changes.

## Fixed in this phase

1. **Orders Review / Approve all and Reject all:** one server request and one database update instead of one request per component. The server validates all component IDs, reviewer visibility, edit permission, proposal-generated rows and archive state before writing. A rejected decision requires a reason; approving already-approved components preserves their later shipping status. The UI updates the group only after the server confirms the batch, locks item actions during saving and clears stale detail cache.
2. **Orders Review / Edit Qty:** blank / nonnumeric inputs are rejected; non-withdrawal quantities cannot be negative; new totals cannot be lower than quantities already received by operations. A failed save keeps the editor open.
3. **Operations Orders / Receive Components:** an incomplete, invalid or out-of-range `quantities` map is rejected **before** writing any component. The intentionally empty map used by the Technical Visit flow remains supported.
4. **Current Orders / Received endpoint:** now requires edit/admin permission rather than permitting users with view-only access to change order status.

## Tests performed

- `node scripts/test-order-phase27-workflows.mjs`: bulk approval of 160 lines in one update, existing shipped approvals, rejection reason, archived/unauthorized requests, review quantity restrictions, invalid Receive Components quantities, Current Orders view-only permissions.
- `node scripts/combined-order-export.test.mjs`: the existing 22 tests passed.
- Static syntax checks passed for all changed JavaScript/JSX files using TypeScript's parser.

Not tested: production Supabase database, actual cross-user permission policies, Vercel build or end-to-end browser flows. Please test on a staging deployment before production actions and keep a database backup.

## Next workflow audit

- Operations: shipped/arrived transitions, receipts, edit-save consistency and concurrent status changes.
- Maintenance: second logs, spare part association, archive/delivery conditions and log state transitions.
- Current Orders / My Orders: ownership visibility, edit flows, archive and restore statuses.
- Regression tests for cross-page synchronization and server-side authorization.
