# Projects Preparing – v235 Project Components Testing

**Base:** `supabase--main-234.zip`. Changed-files-only release. Does not overwrite existing warehouse receipts, per-school QC, school delivery, project cartons, or project final closing data.

## What is new

**Projects Preparing → Project folder → Project Testing** (immediately after Warehouse Receiving). The page uses the same modal and card-based UI as Warehouse Receiving.

- One row per **project Master BOM component**; shows warehouse accepted stock, Passed, Failed and Not tested quantities.
- Search and filters: All / Not fully tested / Has failed units / Fully tested.
- Click **Edit** on a component to enable its **Passed** and **Failed** fields inline. Save a single row or select several rows and save them in one atomic test report.
- Every change requires a unique test reference, supports notes, and appears in the **Testing History** tab. No earlier report is deleted. Failed units can be retested by decreasing Failed and increasing Passed in a new, signed report.
- CSV export and project summary counters.

### Operational definition

- **Accepted:** physically accepted good stock in the central Warehouse Receiving ledger.
- **Passed/Failed:** current classification of tested units; these two counts may not exceed Accepted.
- **Not tested:** Accepted - Passed - Failed.
- The page is **project-wide** and distinct from school Components & QC and the technical installation / commissioning tests.
- New test records **do not increase or decrease physical warehouse stock**, change school allocations, or automatically block carton packing/allocations; QC release enforcement can be a separately approved improvement.
- The migration adds a guard preventing *subsequent warehouse receiving corrections* from reducing Accepted below units already tested.

## Deploy on the live server carefully

1. Take a database and code backup. Confirm v234 is running and its SQL is applied.
2. Execute **`sql/2026-10-28-preparing-project-testing-v235.sql`** in Supabase SQL Editor. Check for `Success`. The migration is wrapped in `BEGIN/COMMIT`, creates two tables, an append-only save RPC, a read-only aggregate RPC and a receipt guard trigger.
3. Upload the ZIP files to the **same relative paths** in GitHub, then deploy using your established production process. Do not replace the repository with the ZIP; merge changed paths.
4. Users Center: `preparing.view` permits reading Project Testing and `preparing.stage_update` permits saving test results. No new permission name or Users Center SQL migration.
5. Open **a test project** on production (no staging needed). Receive 10 units for one component first. Record 6 Passed and 2 Failed under reference `TEST-001`, then record retest as 8 Passed / 0 Failed under a **different** reference (`TEST-002`). Verify history has both reports, Not tested is 2, and Warehouse Accepted remains 10. Confirm testing 11 units or using a duplicate reference is rejected. Verify reducing Warehouse Accepted below 8 is rejected. Make sure school QC is unchanged.

## Constraints and verification

- SQL migration has **not** been executed against the company's PostgreSQL/Supabase instance; execute it before the new UI goes live. There is no local full Next.js build or live browser against your company server.
- **122/122 preparing tests passed** with five new tests; JSX parsing and JS syntax checks passed. PostgreSQL SQL syntax was reviewed statically, not compiled by a live PostgreSQL server.
- View shows the latest 100 testing reports, while counters use the **entire** append-only history. CSV exports current item totals (not report history).
- Does not implement photographs, serial numbers, equipment-specific test protocols or automatic QA release to school allocations yet.
