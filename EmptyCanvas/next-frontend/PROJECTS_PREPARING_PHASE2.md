# Projects Preparing — Phase 2: School Component Manifest & QC

**Base:** `supabase--main-212.zip`. **Scope:** Only Preparing module; legacy Proposals, Orders, Users Center, stocktaking and warehouse balances are untouched.

## Delivered

- New **Components & QC** bottom-sheet in a school within a project folder.
- Explicit **Capture Proposal Components** action records an immutable, school-specific snapshot of all the existing Proposal's line items, quantities, product IDs and source-kit tags. The Proposal itself is never edited. Each school has its own snapshot even if schools share the same Proposal.
- Per-line **Required** (frozen), **Received** (current physical count), **Damaged** (subset of received), **Prepared** (usable/ready), **Missing** (required - received, floored at zero), and **Usable shortage** (required - received + damaged, floored at zero), with notes.
- Edit quantities only with `preparing.stage_update` (and Projects Preparing Page Access); `preparing.view` is sufficient for reading.
- Search, shortage/damage/preparing filters, summary counters, UTF-8 CSV export, and responsive modal UI.
- Transactional initialization (no partial snapshot on failure), quantity constraint and optimistic concurrency check, plus append-only quantity-change audit log.
- Database-gated completion: **Warehouse Receiving** requires all source quantities received; **Inventory & QC** requires quantities received and no current damage; **Sorting & Preparing** requires all required quantities prepared. Later stage completion still follows existing 9-step sequence.
- When a receiving/QC stage is already Completed, users cannot overwrite quantities in ways that would invalidate that completed stage; first reopen completed later steps and then the affected stage. All quantity edits are locked once Preparing or a subsequent stage is completed.

## Apply to existing production safely

1. Back up the database and deployed code. Avoid using real operational data for the first smoke test.
2. Ensure Phase 1 is already installed and the existing Projects Preparing page loads on v212.
3. In Supabase SQL Editor execute **`sql/2026-10-27-preparing-components-phase2.sql`** *before* deploying Phase 2 code. All changes are in a single transaction. The migration adds three new tables and replaces the *existing Preparing-only stage RPC* with additional quantity checks. There are no schema changes to legacy Proposals/Orders.
4. Upload only the changed files in the ZIP to the **matching paths**, then deploy your usual server build to production. **Do not** import the ZIP as a whole project or re-run Phase 1 SQL.
5. In Users Center ensure `Projects Preparing` Page Access plus `preparing.view`, and `preparing.stage_update` for users who maintain physical counts (if Advanced Permissions is active).
6. Test one non-live project/school: create/select a school with Proposal; open Components & QC; click Capture Proposal Components; check required quantities and source-kit labels; enter partial receipt, damaged and prepared counts; verify Missing/Usable shortage; try to mark Receiving Completed before full receipt (must reject), then complete after full quantity. Check QC rejects damaged units. Verify CSV. Repeat with a second school using the same Proposal to confirm independent counters.
7. Confirm users without stage_update cannot capture or edit quantities. Check audit records appear in `public.erp_preparing_component_audit`. If successful, use the feature for the 11 real schools.

### Important operational limitations

- The Proposal snapshot is **intentionally fixed**. Future Proposal edits do not change this school's required quantities automatically. Controlled baseline revisions with explicit grade/scope change approval are a future feature.
- This module tracks **school-specific physical counts**. It is not a warehouse stock transaction or delivery receipt and does not deduct stock from existing ERP stocktaking. Phase 3 will provide picking/shipment quantities, carton IDs, delivery evidence and handover documents.
- Existing Phase 1 stage progress is **not rewritten**. Schools with stages already marked complete may have legacy history that predates the quantity checks. For those schools, explicitly review/reconcile before using Phase 2.
- Snapshot maximum: **1000 distinct Proposal item rows per school**; no automatic merge of duplicate product names. This avoids PostgREST page-limit truncation and preserves kit-line provenance.
- No deletion, re-baselining or retroactive rewriting of component audit records is included.
- Permissions are project-wide as in Phase 1, not scoped per school yet.

## Validation

- Pure workflow math tests, Preparing permissions/ordering tests, component API access tests, and SQL invariant checks have passed locally.
- TypeScript parser syntax check passed for all new/modified JS and JSX files.
- Live Supabase SQL execution, real Next.js build (dependencies not included), and authenticated browser tests cannot be performed from this upload, so production integration is **not verified**.

## Next phase

Phase 3 — **Packing & School Delivery**: carton/pick-list records, quantities issued for packing vs dispatched vs received by school, signed receiving document/photos, transport details, exception report, observation grace-period and Delivery Closing evidence.
