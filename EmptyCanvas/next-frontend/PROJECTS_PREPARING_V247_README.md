# Projects Preparing v247 — Production Receiving & Box Distribution

**Base code:** `supabase--main-246.zip`  
**Scope:** Additive project-wide Production handover after Warehouse Receiving, before shared Project Kit Cartons.

## Workflow

1. Project Components → 2. Project Testing → 3. Warehouse Receiving → **4. Production Receiving → 5. Box Distribution (existing Project Kit Cartons)** → School Allocation / Delivery.

### Production Receiving
- Displays Project Components grouped by original Kit tags and Warehouse Received per component.
- **Production Received** is the running cumulative quantity signed for by Production. On Edit, this very cell becomes a numeric input; Save records only the delta in an append-only ledger.
- **Received By** automatically records the verified ERP account which saved each movement.
- Summary: Warehouse Received, Production Received, Available for Production, Packed into Boxes, Unpacked.
- Separate Movement History cards contain user, timestamp, reference, quantity delta and optional notes (no deletion of past handovers).
- Export modal: select columns/Kit groups and download CSV or PDF, in values mode or blank physical receiving/signature mode.

### Box Distribution
- Uses the **existing** Project Kit Cartons and school allocations. Box names, Kit selection, physical item packing, sealing and allocation remain in the existing module.
- New SQL triggers stop packing a new/edited carton line if its **aggregated quantity across active project cartons** exceeds Production Received for that component.
- The original school delivery records remain independent and unchanged.
- Existing box lines are **not automatically rewritten**. If cartons were packed before this migration, their quantities still count towards Packed; record legitimate Production handovers before editing them. Do not fabricate transfers.
- **Important existing dependency:** Project Kit Cartons draws its physical packing item choices from captured school components. Ensure at least one school with a component snapshot exists before attempting to pack via the existing carton tool.

### Quantity guardrails
- Available for Production = max(0, Warehouse Received - Production Received).
- Unpacked = max(0, Production Received - active Project Kit Cartons packed quantity).
- Production cumulative receipts may never exceed actual Warehouse Received.
- Decreasing Production Received below existing packed carton quantities is blocked.
- Reducing Warehouse Received below already-handed-over Production quantities is blocked.
- Production receipts and packing are serialized using the project lock in Postgres.
- All new Production ledger tables are service-role-only with RLS enabled; client cannot write directly. UI/API uses existing `preparing.stage_update` permission. Views/exports use `preparing.view`.

## Deployment on existing Production

1. **Back up** Supabase/Postgres and the deployed code; review the SQL on a copy first where practical.
2. Confirm v243 Warehouse Receiving migration and Phase 7 Project Kit Cartons migrations are already installed.
3. Execute `sql/2026-10-29-preparing-production-receiving-v247.sql` using Supabase SQL Editor as a single transaction.
4. Upload the changed-files ZIP paths to GitHub, maintaining their `EmptyCanvas/next-frontend` paths. Deploy using your current company-server process.
5. Confirm the user can view Projects Preparing and has `preparing.stage_update` for Production receipts and carton packing.
6. Open a test project. Record a real Warehouse Receipt for 5 units, then save Production Received = 3. Verify Available for Production = 2 and Production Received = 3, with the correct ERP user's name in History.
7. Pack 2 units in an existing Project Kit carton; verify Unpacked becomes 1. Try packing 4 units overall: DB should reject. Try reducing Production Received below 2: DB should reject.
8. Test CSV Values, CSV Blank, PDF Values and PDF Blank; inspect a multi-page PDF on desktop and tablet before use as an official signed form.
9. Confirm no pre-existing Project Kit Cartons or delivery histories were changed.

## Verification status
- All **167 / 167** `projects-preparing*.test.mjs` tests passed locally, including four new v247 tests.
- Node syntax checks passed for new server files; TypeScript parser checked updated JSX without diagnostics.
- **Not performed:** Production database migration, live Supabase end-to-end exercise, full Next.js build (dependency folder absent in upload), or actual multi-page browser-generated PDF visual inspection.
- Production changes are *not* deployed from this conversation.

## Rollback
- Code can be restored from the prior GitHub revision. The SQL adds a new protected ledger and packing guards. To roll back SQL, use a migration designed against your actual data and any Production handovers recorded; **do not drop the new ledger or triggers blindly after operational use.**
