# Phase 28 — Operations and Maintenance workflow audit

Base: `supabase--main-39.zip`. This delivery includes **only modified/new files**. No SQL, Supabase migration, Vercel configuration or FastPath changes are required.

## Corrections

1. **Maintenance-only delivery permission**: The Maintenance Orders route checks the existing Maintenance/Operations/Requested edit rights. When delegating to the shared delivery function, it no longer mistakenly requires an additional Operations permission. The shared function independently verifies the actual database order types before accepting a Maintenance-scoped request. A Maintenance-scoped request cannot deliver Products or Withdrawal orders.
2. **Safe delivery transitions**: Reject attempts to mark an already delivered or archived order as delivered again, before uploading any photos. Product/Withdrawal orders must be in Shipped status. Maintenance orders may be In Progress due to having a saved maintenance log, even if the raw status has not reached Shipped; without any maintenance log they cannot be delivered.
3. **Receipt number validation**: For maintenance orders with replaced spare parts, a numeric store receipt number is mandatory on the server as well as in the UI. Malformed receipt numbers are rejected before any photo upload.
4. **Safe Receive Components**: Reject attempts to ship/receive an already completed/archived order, or a rejected component. Allow valid partial receipts of Shipped orders to continue as before.
5. **Safe first/second Maintenance Logs**: Validate *every* selected component before saving the first one. Reject creating a second log without a first log, creating a third log, second logs with no new repair information, or empty replacements. This prevents avoidable partial writes and accidental erasure of prior log data.
6. **Maintenance log persistence**: The `spare_parts_replaced` metadata field holding log history cannot be silently discarded by the optional-column fallback; instead the save fails visibly if this required column is missing.
7. **Saved action vs. failed list refresh**: After Archive/Delete/Log/Deliver commits, a temporary list-refresh error no longer reports the successful mutation as failed. The detail cache is cleared immediately. A follow-up notice asks the user to refresh the list when appropriate.

## Checks

- `node --test tests/orders-phase28-workflow.test.mjs`: 11 focused simulated workflow tests passed (permissions, product vs. maintenance delivery, delivered/archived guards, store receipts, second logs and all-row preflight).
- `node --test scripts/combined-order-export.test.mjs`: 22 existing Combined Orders tests passed.
- `node --check` for both changed server libraries: passed.
- JavaScript/JSX static syntax parser check: passed.

**Limitations:** No full `next build` or live database / Vercel staging test was possible. A cross-row PATCH failure (e.g. network outage *during* writes) is still not transactional; preflight prevents predictable validation-caused partial commits, not all partial writes. A future database-transaction RPC would be needed for strict all-or-nothing multi-row maintenance log writes.

## Suggested smoke tests in staging

1. Log a first maintenance visit; add a second log, edit it, then confirm both history entries remain visible after refresh.
2. Sign in as a user with Maintenance Orders Edit but no Operations Orders Edit and mark a logged maintenance order delivered, with signed photo and numeric store receipt if spares were replaced.
3. Attempt to deliver an already delivered order again: expect a clear conflict rather than photos being overwritten.
4. Receive partial quantities, then complete delivery from Operations Orders; check statuses and photos in other order screens.
5. Retry any action after a temporary list-load error: existing successful writes must not be sent again.

## Next phase

Review Operations edit-save/stocktaking reconciliation, Current Orders archive/restore, cross-page list invalidation and ownership visibility. Keep the established FastPath/Compact Bundle and `fra1` settings unchanged.
