# Projects Preparing — Phase 3 (v214)

**Base ZIP:** `supabase--main-213.zip`. **Changed files only**. Scope: school-specific packing, carton dispatch, signed handover *recording* and quantitative delivery reconciliation. No stock decrements, no existing proposals/order changes, no live DB writes during development.

## Implemented

- New **Packing & School Delivery** bottom sheet per school alongside Components & QC.
- Cartons / packing batches with a unique label per school; can create several cartons. Assign each Proposal component row to one or more cartons with packed quantities. The same product name in two Proposal rows remains separate.
- Server-side per-school row locking prevents concurrent overpacking; across ALL cartons the sum of packed units cannot exceed the recorded `Prepared` quantity. Line writes require a row-version match and are audited.
- Cancel a **draft** carton (removes its reserved packing quantities but preserves header and audit log). Dispatched and received cartons cannot be changed or cancelled.
- Record transport provider/vehicle and optional tracking reference when dispatching a carton. Each carton has an immutable recorded dispatch time and status.
- Record actual received quantities by component with the school's recipient name, a **signed-paper receipt reference**, optional HTTPS evidence link, and delivery notes. This operation is one-time, version-checked and audited. Discrepancies are shown as receipt gaps.
- Download CSV Packing List per carton and school-wide reconciliation report. Spreadsheet formula injection from dynamic text is escaped.
- Status transitions for stages **4–6** are now validated transactionally in PostgreSQL, in addition to the existing Phase 2 gates for stages **1–3**.
- Keeps Operations direct work in stages 1–6 and technical installation follow-up in stages 7–9.
- API access still requires **Projects Preparing Page Access** and `preparing.view` to read or `preparing.stage_update` to mutate, with enforced Advanced Permissions.

## Stage sequence and constraints

1. Complete **Warehouse Receiving**, **Inventory & QC** and **Sorting & Preparing** first. Full required units must be prepared. Only then can cartons be created/packed. The earlier Phase 2 quantity freeze protects packing totals.
2. Create cartons and assign packed component counts. Each carton can have a subset. Total packed across cartons must match every Proposal item's planned quantity before stage **Packing & Dispatch (4)** can be completed. The names of the existing stage keys are unchanged.
3. Mark stage 4 complete, then dispatch each carton. Enter the transport provider/vehicle. Stage **School Delivery (5)** can only be completed after every active carton is dispatched (or received), with no active drafts.
4. Record school receipt for each dispatched carton. Enter the *actual signed* paper reference and recipient; discrepancies are allowed but visible. Stage **Delivery Handover (6)** cannot complete until all active cartons have receipt records and **all required quantities are received** for every individual Proposal line.
5. Installation/testing and final school closing remain follow-up stages and are not implemented with new technical checklists in Phase 3.

## Production deployment

1. Verify Phase 1 and Phase 2 code and migrations are already present and working in the current v213 production deployment. Take a DB backup and deployed-code backup; use one non-live test project first.
2. In the Supabase SQL editor, run **`sql/2026-10-27-preparing-delivery-phase3.sql`**, available separately as `Projects_Preparing_Phase3_v214_Supabase.sql`. Run it **before** deploying the code. It creates three isolated new tables and replaces only the Preparing stage RPC for completion validations. It is a single transaction and does **not** rewrite any past shipment/stock/order/Proposal data.
3. Copy the changed files under `EmptyCanvas/next-frontend/...` from the ZIP into their corresponding repository paths, then commit and deploy through the existing production process. Do not replace the entire repository from this ZIP. There is no need to rerun earlier migrations.
4. In Users Center, verify `Projects Preparing` Page Access and `preparing.view`; add `preparing.stage_update` for users permitted to pack, dispatch, and confirm receipts.
5. Open **Projects Preparing → Project Folder → School → Open Delivery**. The phase 3 area appears next to **Open Components**.

## Suggested smoke test (non-live school)

- Use a small test Proposal (two components, e.g. 3 and 2 units). Capture BOM; record full received/prepared counts, complete stages 1–3.
- Create two draft cartons; assign 2 + 1 of the first product across two cartons, and 2 of the second product to one carton. Confirm that packing an extra unit (above prepared total) fails.
- Download individual packing lists. Cancel an empty draft carton if needed. Ensure cancel releases allocated quantities and does not remove audit history.
- Verify stage 4 refuses to complete while quantities are unpacked; complete it when all are allocated.
- Dispatch each carton with transport details; verify attempting to edit/cancel dispatched cartons fails. Complete stage 5.
- Record school recipient, handover reference and actual received amounts; test a short receipt and confirm stage 6 refuses to close. For a clean test school, record every unit as received and complete stage 6.
- Confirm read-only users can export but cannot create cartons or confirm receipts. Check `erp_preparing_shipping_audit` contains the event trail.
- Verify existing Operations Orders, Proposals, Stocktaking and school folders still work.

## Known limits / safeguards

- **No actual document upload** in this phase. Users enter a real signed paper receipt number and optionally an existing **HTTPS evidence URL**. Do not consider merely entering a receipt reference proof of a valid signature. Attaching scans/photos with private access controls needs an additional implementation.
- **No replacement / loss reconciliation after dispatch** in this phase. If the school receives fewer units than dispatched, stage 6 remains blocked. Resolution needs a controlled shortage/return/replacement workflow (planned next), not silent rewriting of historical records.
- **No database stock move**. Tracking prepares/shipping is a project log, not a warehouse financial stock ledger. Inventory adjustments remain in the existing approved flow.
- **No editing confirmed receipts**; erroneous recordings must be handled through a controlled correction workflow in a subsequent phase. Confirm carefully.
- **No backfill of historical completed stage records**. Schools whose stages 4–6 were completed manually in v213 are not automatically recalculated; review those schools before relying on the new gates.
- 200 **active** cartons per school, 9,999 packing lines total per school. Historical cancelled carton records remain in the audit trail.
- Server features are **project-wide** as in phases 1–2, not scoped to selected schools.
- The uploaded archive has no `node_modules`, so a full Next build and authenticated browser testing against production were **not performed**. Local 15 Preparing regression/static tests and syntax parsing passed. The Phase 3 migration has **not** been run against the real database. Keep backups and perform the smoke test before operational usage.

## Next phase

**Phase 4 — Technical Installation Follow-up & Issues**: milestones/checklists for technical team, owner, due date, issues/photos, alerts, resolution status, and technical acceptance. Operations coordinates, but does not directly install machines.
