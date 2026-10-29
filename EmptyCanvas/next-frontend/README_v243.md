# Projects Preparing v243 — Testing Passed → Warehouse Receiving

Source version: supabase--main-242.zip

## Purpose
Warehouse Receiving now displays **Available to Receive = max(0, Passed Testing − warehouse Received)** for each unique component. Editing Received remains inline. The new total must not exceed Passed Testing, and it cannot fall below quantities already allocated to schools. The **school allocation** stock remains **Received − Allocated**, a separate balance.

Example: 2 Passed, 0 Received, 0 Allocated gives 2 Available to Receive and 0 Available for Schools. After recording 1 Received, Available to Receive becomes 1 and Available for Schools becomes 1. After recording the second unit, those values become 0 and 2 respectively.

## Production application order
1. Back up Supabase and your current deployed source.
2. Apply `sql/2026-10-29-preparing-warehouse-passed-availability-v243.sql` using SQL Editor with a database role authorized to create functions and triggers. This script adds only read/guard functions and an INSERT trigger. It does not rewrite existing stock or test history.
3. Upload the changed code files in their original relative paths under `EmptyCanvas/next-frontend/` to your GitHub repository and deploy the website.
4. Open the project with a component Passed=2, Warehouse Received=0. Verify it shows Passed Testing=2 and Available to Receive=2.
5. Click Edit in the warehouse component card, enter Received=2 and Save; after reloading it should show Available to Receive=0 and stock available for school allocation=2. Try a fresh component with Passed=2, Received=3: the UI should show a validation error. The SQL trigger independently rejects a direct over-limit write.
6. Verify School Allocation still uses only physically Received quantities and that CSV/PDF Values export uses the new Available to Receive definition.

## Existing data and safeguards
- Historical receipts, damaged entries, and testing records remain unchanged.
- A project whose historical warehouse Received exceeds Passed Testing cannot accept more positive receipts for that component until the passed quantity is reconciled. Legitimate negative corrections remain possible subject to existing school allocations.
- The new server read depends on the new SQL function, so **run SQL before deploying code**.
- The database trigger enforces the limit for all warehouse receipt paths, not just the user interface. Existing project-level write locks serialize ERP Testing and Warehouse operations.
- User permissions remain unchanged (`preparing.view` and `preparing.warehouse_receive`).

## Verification
`node --test tests/projects-preparing*.test.mjs`: 157 passed, 0 failed in the current source checkout. No real Supabase database or production application was accessed; full Next.js build was not run.
