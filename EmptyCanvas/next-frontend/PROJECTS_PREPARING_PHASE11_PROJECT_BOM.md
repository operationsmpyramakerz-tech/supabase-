# Projects Preparing v229 — Project Source Proposal and Editable Master BOM

Base: `supabase--main-228.zip` (no production updates performed).

## Purpose

1. `New Project` now requires a **Source Proposal** and snapshots its component identities and quantities in a single database transaction with project creation.
2. The project has a new **Project Components** workspace, with independent planned project quantities, add/edit/remove actions, searchable rows, and an append-only audit trail.
3. **Warehouse Receiving** immediately shows the project components and lets Operations record stock vouchers before adding any schools.
4. School proposal demand capture is still used to set per-school allocation ceilings. For projects created with a source Proposal, it does **not** overwrite the project's master required quantities.
5. Old projects can import a Proposal **only if** they have no master BOM, receipts, allocations, or school demand. Existing projects with activity must retain their records and edit their component quantities manually instead.

## Deployment to the live ERP

1. Back up the Supabase database and currently deployed code. Do not overwrite any existing migration.
2. In SQL Editor run `EmptyCanvas/next-frontend/sql/2026-10-28-preparing-project-proposal-bom-phase11.sql` as one transaction, after confirming Phase 10 was applied.
3. Copy changed files in the ZIP to their existing relative paths under `EmptyCanvas/next-frontend/`, and deploy normally.
4. Check **Users Center**: `preparing.create` for project creation, `preparing.manage` for Project Components editing, `preparing.warehouse_receive` for warehouse receipts, `preparing.warehouse_allocate` for school assignments.
5. Create a disposable project using one real Source Proposal. Open **Project Components** and verify the BOM matches the Proposal, then open **Warehouse Receiving** and verify planned quantities match without pressing any school-capture button.
6. Test adding a project component, changing its required quantity, and removing an unused component. Save a small receipt using a disposable voucher number, then confirm the received component cannot be deleted.
7. Check that school Components & QC, Packing & Delivery, and the Project Dashboard continue to open normally. Do not use actual stock on the test project.

## Rules and limits

- A Source Proposal is a *snapshot*, not a live link. Future changes to Proposals do not silently alter the project.
- `Project Components` uses project-wide required quantities; it does not represent stock received or stock delivered to schools.
- Accepted and damaged warehouse quantities are recorded only by warehouse voucher operations. Manual edits in Project Components do not change them.
- Components with warehouse receipts, allocations, or school requirements cannot be removed. Their identity is frozen; their planned quantity may be adjusted but not below already allocated units.
- Component changes use optimistic concurrency and an audit table. Changes do not modify original Proposals, school QC, shipments, or signed handovers.
- Adding schools still uses school-specific Proposals and the **Capture School Requirements** action. School requirement capture must be run for each school before warehouse allocation to that school; it cannot change a source-project Master BOM.
- Products can be added by entering a component name and optional product code; this iteration does not add an automatic product-catalog picker.
- The new SQL has not been executed against the live Supabase PostgreSQL database. The full application build and real end-to-end flows have not been performed here. Static/regression tests: 89 passed.
