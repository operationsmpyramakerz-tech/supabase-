# v394 — Warehouse Return after Components Testing / Box Distribution tab cleanup

## Changes
1. Box Distribution: **Not Packed** is removed. Its former filter is not accessible through the UI, shared tab registry, server-side granular edit permission, or public feature catalog. Available to Pack / Packed / All Components and Box History remain unchanged. Existing carton and stock ledger records are preserved.
2. Stage 3 is renamed from **Warehouse Receiving** to **Warehouse Return**: tested components flow back to the project's warehouse before Operations Receiving.
3. Warehouse Return tabs: **Tested Components**, **Ready to Return**, **Returned**. The default is Ready to Return. Untested components do not appear in the return list. A partially returned component can appear in both Ready to Return and Returned.
4. Summary: **Tested**, **Returned**, **Ready to Return**. The return quantity is limited to the tested quantity. Formula per component: `readyToReturn = max(0, tested - returned)`.
5. UI, status/permission labels, history, CSV/PDF exports and the Operations Receiving warehouse input label were updated. The warehouse return screen no longer shows the unrelated school requirement capture callout.
6. All existing stage edit permissions remain opt-in. The stage keys, tab keys for `warehouse.all` / `warehouse.available` / `warehouse.received`, audit and service routes are **unchanged**. Historical grant entries for `warehouse.short` and `boxes.not_packed` are not used anymore and can be left in the database; this patch does not delete them.

## Important: database and workflow
- The existing `erp_preparing_warehouse_receipt*` tables/RPCs record the warehouse-return movement. **No additional SQL is needed**, provided the v384 Tested-only trigger and the v247 Production handoff guard are already installed. The v388 Production intake migration must remain in place.
- The original warehouse **receipt** DB column `accepted_delta` still means the number of units returned to the project's warehouse in the updated UI. No existing project quantities, ledger rows, historical entries, references, sign-offs, school stock or allocations are migrated or deleted.
- The database enforces `Returned <= Tested` on positive return writes (v384), and disallows reducing Returned below units already handed to Operations (v247) or allocated to schools. Operations Receiving still uses this warehouse ledger as its authoritative capacity limit.
- This is a **project warehouse handover**, not an automatic mutation of the global company's Stocktaking/Stock module. Do not automatically double-credit global stock without a dedicated inventory reconciliation workflow.
- The legacy API route `/projects-preparing/warehouse` and internal stage key `warehouse` intentionally remain unchanged to preserve existing closures, permissions and audit integrity.

## Deployment on production
1. Back up Supabase data and verify v384, v247, and v388 migrations are applied. No new SQL is included in this patch.
2. Replace the files at the exact repository paths in this ZIP (do not replace the complete repository), deploy as usual.
3. Test a component with Production Received 5 and Tested 3. Warehouse Return → Ready to Return should show 3.
4. Save Returned 2. It should remain Ready to Return (1) and also show under Returned (2). Operations Receiving must allow at most 2 units.
5. Return the remaining 1. Ready to Return becomes 0; Operations Receiving capacity becomes 3.
6. Try to return more than Tested: should be denied. Try to reverse a return below Operations Received: should be denied by the existing DB guard.
7. Verify Box Distribution tabs are All Components / Available to Pack / Packed (no Not Packed), and check the corresponding Users Center edit grants.
8. Confirm PDF/CSV return exports contain Tested and Returned values, and blank forms preserve the tested baseline for the warehouse receiver.

## Checks
- New v394 regression tests pass, plus targeted previous tests. Modified JS/JSX files parse using the TypeScript syntax parser.
- Complete Projects Preparing suite: 343 tests, **337 passed**, 6 failed. These same 6 failures were already present in the uploaded v393 baseline (they are unrelated historical tests: v237 inline reference, v240 strict testing panel, v245 warehouse edit selector, v246 header search/warehouse edit, v287 box labels panel).
- Full Next.js build and live Production smoke test were **not** performed here. Exercise the smoke steps above before continuing live project movements.
