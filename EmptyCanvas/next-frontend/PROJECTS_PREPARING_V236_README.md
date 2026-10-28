# Projects Preparing v236 – Testing BEFORE Warehouse Receiving

Base: `supabase--main-235.zip`. Changed-files-only. No direct deployment or database migration was performed.

## Workflow

1. **Project Testing** (project-wide): all Master BOM items appear even when Warehouse Accepted = 0. Enter **Testing Received** (quantity sent for QC), **Passed**, **Failed**, and **Tested By** inline for each component. A report reference and technician name are required to save. A test intake alone can be recorded before its eventual pass/fail classification. Test reports remain append-only, with technician name stored per component.
2. **Warehouse Receiving**: physically receive only quantities with Passed QC results; record separate signed warehouse vouchers. The new guard disallows increases of Warehouse Accepted beyond Passed, while respecting pre-migration accepted quantities.
3. **School Allocation**: existing stock/allocation implementation remains unchanged.

The displayed `Testing Received` is NOT the warehouse balance. `Warehouse accepted` is shown separately as an informational value. `Not tested = Testing Received - Passed - Failed`. `Passed + Failed <= Testing Received`. Failed units can be retested with a new testing report (net state plus history).

## Database

Apply **`sql/2026-10-28-preparing-testing-before-receiving-v236.sql`** ONLY AFTER the existing v235 migration. It:

- Adds `received_delta` and `technician_name` to test lines, keeping past records unchanged.
- Stores a per-item legacy test intake baseline for items with existing tests, so historical reports remain consistent without rewriting them. Historic entries will have no technician name unless originally recorded elsewhere. Do not guess the technician.
- Changes the test summary and atomic report RPC to validate test intake independently of receipts, record technicians, prevent lost updates, and prevent reducing Passed below existing physical warehouse stock via corrections.
- Changes the receipt trigger to require new positive warehouse receipt quantities to be covered by currently Passed QC. Already recorded warehouse receipts are grandfathered and are not modified. If preexisting warehouse stock exceeds Passed, new positive receipts will remain blocked until the relevant test quantities are reconciled.
- Uses `BEGIN/COMMIT`, grants reads to the existing `service_role` only, and leaves schools / shipments / existing receipt logs alone.

## Production instructions

1. Back up database and code. Verify v235 SQL is applied.
2. Run the v236 SQL in Supabase SQL Editor. Read any errors before proceeding. The migration has **not** been compiled or executed against an actual PostgreSQL instance by this deliverable.
3. Merge the files from the changed-files ZIP into identical relative paths in GitHub, then deploy your existing Production process. Do not replace the whole repository with the ZIP.
4. Hard-refresh the ERP. Open **Projects Preparing → project folder → Project Testing**. It now precedes Warehouse Receiving in the project tool order.
5. Using a test project with 0 warehouse receipts: edit an item to `Testing Received=10, Passed=8, Failed=2`, enter a technician and unique reference, and save. Verify Testing History lists the technician, and the warehouse balance is still zero.
6. In Warehouse Receiving, record 8 Accepted: it should work. Attempt 9 Accepted: it should be refused (Passed=8). Test a new test intake or retest before receiving more.
7. Verify editing a test quantity only via inline `Edit`, and check the Received/Passed/Failed/Technician fields on a narrow tablet view. Confirm school QC and prior warehouse receipts stay unchanged.

Existing permission keys are unchanged: `preparing.view` to read and `preparing.stage_update` to save testing results; warehouse receives still require `preparing.warehouse_receive`.

## Local verification

`node --test tests/projects-preparing*.test.mjs` succeeded with **126/126** tests, including new test-before-receive and technician tests and earlier regressions. JSX and JS parsing passed. This is **not** a full Next.js production build and does not validate SQL in real PostgreSQL. Changes have not been pushed or deployed.
