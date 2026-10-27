# Projects Preparing — Phase 7 (v221): Central Kit Cartons & School Allocation

Base: `supabase--main-220.zip` supplied by the user. This is an additive change; previous school-specific packing and receiving continues unchanged. **No SQL executed or production changes made.**

## Delivered

- Added **Project Kit Cartons** to the **project folder** (not a school). Select Kit type from captured school Proposal snapshots, enter unique physical carton label, and enter total packed quantity per product; seal when packed.
- Project carton balances show **packed, allocated, free units**, and a list of school allocations. Packing per Kit/product is capped by total captured Proposal demand for that Kit/product; it does not alter warehouse stock or order balances.
- Allocate available carton units to a specific school's matching Proposal item after **Sorting & Preparing** is completed. An atomic DB operation reserves project carton quantity and creates an auditable **school delivery batch** using the existing `erp_preparing_shipments` and `erp_preparing_shipment_lines` tables. This maintains existing stage 4–6 gates, dispatch, signed receipt and reporting.
- A physical project carton can supply several schools. Components from the **same carton to the same school share one delivery batch**, so dispatch and signed receipt are recorded once per school/carton rather than once per product. Linked school delivery batches are *allocation/dispatch units*, not claims that an additional physical box was packed per school.
- Prevent school-level editing/cancellation of allocations from bypassing project balances, both in the school UI and through DB triggers. Undispatched allocations can be reversed safely in the project screen; dispatched/received allocations are irreversible through this workflow.
- Existing school shipments are not migrated, deleted or re-labeled. Project carton operations are audited in a new table. All endpoints enforce existing Page Access + `preparing.view` / `preparing.stage_update` features. No new permission required.
- All database writes are executed through database RPCs under the server's service role and are transactional, with per-project locks for concurrent allocation and per-school locks for coexistence with legacy packing.

## Production install (after backup)

1. Confirm prior Phase 1–5 SQL migrations are applied. Back up the Supabase database and retain the currently deployed code revision.
2. Execute **`sql/2026-10-27-preparing-project-cartons-phase7.sql`** once in Supabase SQL Editor. It creates 4 new tables, guarded triggers on existing shipment tables and RPC functions. It does **not** backfill existing cartons. Run SQL **before** code deployment (the new page expects the new tables).
3. Deploy only the changed files from the v221 ZIP under their original `EmptyCanvas/next-frontend/` relative paths to the existing production Git repository. Do not delete or overwrite other code. No direct Git push was done.
4. Open Projects Preparing → a project with captured school BOMs → **Project Kit Cartons**. Ensure the account has Page Access and `preparing.view`, plus `preparing.stage_update` for editing.
5. Use a throwaway project/beneficiary in the existing production environment (not actual school inventory) for the smoke-test below, then explicitly clean up test records through your approved DB procedure. A full automated DB transaction test was not run.

## Recommended smoke test

- Capture matching BOM components in 2 schools and complete school Sorting & Preparing. Create 1 project carton labelled `G2-C01`, add a product with 5 packed units, seal it.
- Allocate 2 units to School A and 3 to School B; verify free balance is 0. Try allocating 1 more; expect a database rejection. Verify both schools now show linked draft delivery batches in their **Packing & School Delivery** pages.
- Ensure direct quantity editing/cancelling is blocked on linked school batches. Before dispatch, reverse allocation B and confirm 3 units become free and its batch is cancelled, with unchanged audit history.
- Reallocate 3 to School B; complete school Packing, dispatch, and enter signed school receipt using the original school workflow. Confirm reverse now fails.
- Check stages 4–6 and project Dashboard still agree with delivery totals. Check that an existing legacy school carton remains accessible and unchanged.
- Verify read-only permissions: view-only users can see project pools but cannot create, change, allocate or reverse.

## Limitations and next steps

- **This is not a stock ledger** and does not debit actual warehouse inventory, reconcile damages, upload scanned receipt evidence, or reconstruct older physical cartons automatically. The physical packed count still needs verification against actual stock and the signed Warehouse Receiving record.
- Kit labels must match the captured `source_kits[].kitName` value; Proposal product identity uses product ID and product name. If different schools use renamed/duplicated SKUs or kit source metadata is incomplete, review the BOM before allocation instead of merging by name blindly.
- Carton content becomes immutable when sealed; cancel and recreate a carton if no active allocations. Once dispatched, preserve allocations/receipts (returns and replacement need their own controlled workflow).
- Allocation creates one school **delivery batch per project-carton/school pair**, with multiple product lines. The same physical project carton can supply multiple schools. It deliberately maintains existing school-stage gates, but the paperwork should identify the physical project carton label.
- A full Next.js build, live Postgres execution and authenticated browser smoke test were not performed: the uploaded archive has no installed `node_modules`, network credentials or production database connection. Static syntax and regression tests are included; test on a non-live project first.
- Next recommended improvement: **returns / replacements / after-dispatch discrepancy reconciliation**, and printable physical carton labels with cross-reference to school allocation batch and signed handover evidence.
