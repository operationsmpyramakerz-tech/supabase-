# Projects Preparing — Phase 8 (v222) | Returns & Replacements

**Starting point:** user-supplied `supabase--main-221.zip`. This release builds upon the deployed Phase 1–7 schema. **The assistant did not connect to production, execute SQL, or deploy.**

## Delivered

- A new **Returns & Replacements** section inside every school folder with a component-by-component **gross signed receipt / physical returns / net accepted / outstanding / pending replacement** view.
- Returns link to an actual delivered batch and component, capture an immutable quantity + signed return reference + reason (+ optional HTTPS evidence), and cannot exceed quantities originally signed as received *minus prior returns*.
- Before creating a replacement, the server verifies the proposal demand, existing net school receipt, outstanding draft/dispatched replacement reservations and that the original batch(es) for the component have finished receipt. **No replacement exceeds the remaining net shortage.**
- Replacement creation reserves quantity as a new auditable **school delivery batch**. Operators use the existing School Delivery module to dispatch it and record a signed receipt, and may cancel it in the reconciliation screen only while Draft. School Delivery and database triggers block ordinary pack/unpack/cancel operations on these replacement batches.
- Original signed school receipts are not overwritten, and return entries/replacement metadata are append-only. Every corrective operation has an audit event. Creating or cancelling replacement batches does not touch the project-wide carton pool or the historic shared-kit allocation records.
- Delivery Handover and Final School Closing database gates now validate **net school receipt = gross signed received units − documented physical returns** against the original planned quantities. Returns automatically invalidate previously verified custody settlement/archive closing checks, preserving their prior values in closing audit records, so Operations must re-verify them.
- School Packing & Delivery and Master Project Dashboard display net receipts and returns. The internal Operations CSV includes gross signed / returned / net units. The reconciliation screen exports a CSV ledger with spreadsheet formula neutralization.
- Permission gates reuse Page Access + `preparing.view` / `preparing.stage_update`; existing `preparing.close` still controls formal closing/reopening.

## Production rollout (SQL before application)

1. Take an actual Supabase backup/snapshot, and keep a copy of the currently running Git revision. This system is production-only, as requested. Do not run the migration on an incomplete Phase 1–7 schema.
2. In the Supabase SQL Editor execute **`sql/2026-10-27-preparing-reconciliation-phase8.sql`** completely. It uses **BEGIN/COMMIT**; creates three tables, guarded triggers and replacement/return RPCs, and replaces the *Phase 5* definitions of `erp_preparing_save_stage` and `erp_preparing_finalize_school` to account for returns. It does not backfill, delete, or amend existing signed shipment lines. The only existing-check modifications take place later when an actual return is recorded (re-verification of custody/archive).
3. Deploy only files in the accompanying changed-files ZIP using the exact existing directory structure under `EmptyCanvas/next-frontend/`. No Git push was performed.
4. Open **Projects Preparing → project → school → Returns & Replacements**. Users need `preparing.view` to see this section, and `preparing.stage_update` to record returns or create/cancel replacement batches.
5. Confirm the main **Packing & Delivery**, **Project Dashboard**, and existing **Final School Closing** screens still work. Use a non-live demo school/project if available; do not make fictitious warehouse entries in real school records.

## Practical checks

- For a component planned at 10, a signed batch originally dispatched at 10 but school receipt of 8 means **outstanding 2**. Record a replacement batch for 2 (if School Delivery stage is already Completed, reopen it first). Attempting 3 should fail at the database.
- For a fully signed receipt of 10, record a **physical return of 2** with a real return handover reference. Net accepted becomes 8. A replacement of 2 (not 3) is allowed, once original batch receipt is complete and the Delivery stage is reopened if necessary.
- Dispatch that replacement from **Open Delivery**, capture a signed school receipt for 2, and verify net = 10 and stage 6/Closing can pass again once all other requirements are met.
- Attempt to return 11 against a receipt for 10, to create a replacement beyond net shortage, to edit replacement packed quantities in the regular School Delivery form, and to cancel a dispatched replacement: all must be refused.
- Verify a view-only member cannot create or change reconciliation entries.
- If the school has already completed stage 6 or later, **reopen later completed stages in reverse order** before a corrective return; formally closed schools must first be reopened by a member with `preparing.close`. Re-verify custody settlement and closing archive after the return.

## Scope / limitations

- Reconciliation is a **delivery evidence ledger, not a warehouse inventory or Accounts custody ledger**. A physical return requires a separate genuine warehouse receiving/custody settlement transaction outside this module; replacement issues require actual stock availability approval. This module never changes actual warehouse stock.
- One controlled replacement batch currently contains one component. Multiple components may be replaced via separate batches; this is intentional for clear auditing.
- Signed evidence is recorded by HTTPS reference; uploading a new scan/photo directly is not included.
- New returns and replacements are deliberately disallowed without reopening completed stages that would otherwise represent obsolete delivery approval.
- Project kit cartons are not repacked automatically; replacement batches are new explicitly marked school allocations and must be labeled and moved physically according to the approved logistics workflow.
- This delivery reconciliation is distinct from post-handover technical maintenance tickets; it does not silently modify a certified final project.

## Verification performed

- **60/60** Phase 1–8/Sidebar tests passed (including 11 new Phase 8 tests).
- Updated JS files pass `node --check`. Updated JSX files pass TypeScript TSX parse checks.
- SQL reviewed for transaction boundaries and constraints. No live Postgres execution, full Next build, authenticated browser test or end-to-end stock reconciliation was possible in this environment.

For rollback, restore the former application revision **and the corresponding database backup**, rather than dropping tables or deleting new returns/replacement records. A DB rollback after real reconciliation actions requires an explicit data-preservation decision.
