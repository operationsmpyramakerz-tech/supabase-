# Projects Preparing — Phase 10 / v228: Central Warehouse Receiving

Base source: `supabase--main-227.zip`. This is a **changed-files-only** release. It does not change or recalculate existing school component quantities, kit cartons, delivery receipts, closing records, user data, or underlying Stocktaking inventory.

## The new operational separation

**1. Project Warehouse Receiving** — Operations Team Leader captures the aggregated project Master BOM from each assigned school's linked Proposal, then records warehouse issue vouchers with **Accepted (usable)** and **Damaged** quantities. This is a signed central project custody ledger, not a delivery to a school. Multiple partial vouchers are supported; records are append-only. Corrections use their own reference and signed delta. The same voucher reference cannot be entered twice for one project.

**2. School Allocation** — Assign whole-number component quantities to each school against its frozen per-school demand. School assignment is not a warehouse receipt and is not a school delivery. Batch allocation supports many components in one atomic database transaction; if one item has insufficient stock, no lines are saved. Negative allocation adjustments reverse part or all of an earlier assignment, without deleting movement history.

**3. School Components & QC / School Delivery** — these remain **separate** existing records. The new central ledger does not automatically overwrite `erp_preparing_components.received_qty`, `prepared_qty`, school shipment receipts, production carton quantities, or ERP/Stocktaking stock on hand. The per-school workflow stage label was changed from `Warehouse Receiving` to `School Preparation Intake` to reduce confusion; its database key and previous statuses remain unchanged.

For the 30 June Schools project, capture the requirements for the 11 schools once all are enrolled. If schools are added later, **Capture Project BOM** adds only those new schools and preserves all previously frozen demand and receipts. Existing school demand is intentionally not recalculated automatically after later Proposal edits; reconcile an approved revised BOM in a separate controlled future workflow.

## New UI

Projects Preparing → open project folder → **Warehouse Receiving** (new first tile). Inside:

- **Warehouse Receiving:** full project component list; required, accepted, damaged, shortage; one reference covering many component lines; CSV export; signed quantity corrections.
- **School Allocation:** school selector, required and already assigned quantities, warehouse availability, batch assignment (or line assignment), internal allocation reference, adjustments.
- **Movement History:** all warehouse vouchers and school assignment transactions.

## Database setup (production-safe sequence)

1. Back up PostgreSQL and the currently deployed code before doing anything.
2. Verify Preparing Phases 1–8 are already applied.
3. Run **only** `sql/2026-10-28-preparing-central-warehouse-phase10.sql` from the new ZIP, in the Supabase SQL Editor. It wraps its creation work in `BEGIN`/`COMMIT`, only adds project warehouse tables and SQL RPCs, and is written to be re-runnable. It does **not** deduct from live Warehouse or Stocktaking balances.
4. Upload the ZIP's changed files to their exact existing repository paths on GitHub and deploy to the company's existing production server. No staging environment is required or created.
5. Users Center → Projects Preparing Advanced Permissions: grant **View** plus **Capture project BOM and receive from central warehouse** (`preparing.warehouse_receive`) to authorized Operations receiving staff/Team Leader; grant **Assign central warehouse components to schools** (`preparing.warehouse_allocate`) to authorized staff. Both are separately gated at the server route.
6. Open a non-live test project on production. Enroll 2 example schools, capture the project Master BOM, record a partial receipt with one damaged part, allocate valid quantities, verify an attempted over-allocation is rejected, test negative adjustment, and check the movement history. Confirm school delivery and QC quantities have not been automatically modified. Then use the actual 30 June project.

## Important boundaries

- Warehouse ledger is project-custody **evidence**, not a direct transfer of the original ERP warehouse's stock balance. The official warehouse issue voucher and accounts/custody documents remain mandatory.
- Central assignment does not itself mark a school as having physically received components. School QC and Packing/Delivery retain their own confirmations and their previous validation rules. Project Kit Cartons is also a separate packing ledger; linking its consumption to central allocations is an additional integration task, intentionally not silently imposed on existing live shipments.
- Granular permissions are feature-level across all projects, consistent with the current Preparing module, not per-school restrictions.
- Changes only to this Preparing module, UI feature registry, its CSS cache-bust, and tests. No legacy module data mutation.

## Local validation

- All **84 Projects Preparing tests passed** (77 prior tests plus 7 warehouse tests).
- New service and API JS passed `node --check`; all changed JSX parsed with TypeScript's JSX parser; project CSS parsed with PostCSS.
- The SQL migration was inspected statically but **not executed against a PostgreSQL/Supabase server**. A complete production-connected Next.js build/browser test was not available. Verify the SQL succeeds before deployment and smoke-test the new UI carefully.
