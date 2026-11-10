# Components Testing v384 — cutover instructions

This change removes the received/passed/failed testing ledger fields, consolidates each historical change into `tested_delta`, and keeps batch identity, tester, timestamp and stage closure documents. Required remains in the project BOM; Remaining is derived from Required − Tested. Warehouse Receiving uses Tested as the quantity eligible for physical handover, not a separate passed balance. A reduction cannot invalidate already received stock. Existing closure behavior is unchanged.

## Production sequence
1. Take a database backup (including all `erp_preparing_project_test_*` tables). Pause traffic/writes to Projects Preparing and Warehouse Receiving for the cutover; old code and new schema are not compatible.
2. Run the read-only `sql/2026-11-10-preparing-tested-only-preflight-v384.sql` and export the result. Check historical failed quantities, incomplete testing intake, and warehouse mismatches against the physical stock. Export the original testing records too if their pass/fail breakdown must be retained; those columns will be permanently removed from the live database.
3. Open `sql/2026-11-10-preparing-tested-only-v384.sql`. By default `legacy_failed_policy := 'review'` stops the transaction if historical failed units remain. If none remain, no change is necessary. If they exist, choose explicitly:
   - `exclude` (recommended if rejected units still exist): backfill Tested from old Passed. Old warehouse eligibility is preserved; Tested totals decrease by historical failed counts.
   - `include` (only after confirming historical failed units are physically resolved/eligible): backfill Tested from old Passed + Failed, preserving the displayed v383 Tested totals. This may increase the quantity eligible for Warehouse Receiving. Never use this for still-rejected units.
   Run the migration once. It is transactional, drops obsolete RPCs and columns without CASCADE, and replaces the warehouse trigger. The removed legacy testing intake table only held historical intake, not completed test results. The existing warehouse receipt ledger and stage closure records are not rewritten.
4. Deploy the modified code immediately after successful migration, then reopen traffic. Do not apply an older testing SQL migration again. If the migration fails, its transaction rolls back; investigate the error and do not deploy the new code until it succeeds.
5. Verify a test project: edit Tested; confirm History, Remaining, Warehouse Available to Receive and closure progress. Check any preflight warehouse mismatch, which is grandfathered but cannot be increased beyond Tested.

## Rollback
Because the old fields are deliberately dropped, restoring the old version requires the database backup (or a carefully prepared reverse migration that restores the old field values); reverting only code is insufficient. Do not restore a backup over newer production writes without a recovery plan.
