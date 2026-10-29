# Projects Preparing – v245 (Warehouse Receiving compact layout)

Base version: `supabase--main-244.zip`

## Scope
Only the project-level **Warehouse Receiving** page was changed. School Allocation and the existing testing/warehouse data flows remain unchanged.

- Per-component card now shows **Available to Receive**, **Received**, **Received By** and action buttons. Removed **Passed Testing** and **Allocated** from these component cards.
- Top summary now displays **Project Required**, **Received** and **Available to Receive**.
- **Edit** is always visible. Clicking it (when authorized) changes the *same* Received value into an editable number input; **Save** records the change, **Cancel** dismisses it. The input is the new **cumulative Received total**, not an additional increment.
- A missing `preparing.warehouse_receive` permission leaves Edit visibly disabled, with an explanatory tooltip; it does not bypass authorization.
- Existing `warehouseReceiptLimit` validation and the database guard remain unchanged: `Received <= Passed Testing`, and it cannot be reduced below units allocated to schools.
- Updated responsive grids at 940px and 620px; CSS version bumped from `241` to `245` to avoid stale browser CSS.
- Updated historical tests referencing the old CSS query-string and added three specific new tests.

## Install
1. Keep a backup of production code; don't change database data for this release.
2. Extract this ZIP into the **`EmptyCanvas/next-frontend/`** directory (the ZIP contents use paths relative to it), preserving directory structure.
3. Deploy by your usual GitHub/server workflow, and hard-refresh the ERP page.
4. If Edit is disabled, go to **Users Center → Advanced Permissions → Projects Preparing** and grant **`preparing.warehouse_receive`** to that user, then refresh/re-login if needed. Do **not** disable permission checks globally.
5. Test on a demo project with 2 Passed and 0 Received: change Received to 1, save; available-to-receive should become 1. Then change Received total to 2; available should become 0. Trying 3 must be refused. Verify Received By and Movement History.

## Checks completed
`node --test tests/projects-preparing-*.test.mjs` – 160/160 passed (includes 3 new v245 tests). JSX syntax parsed by TypeScript parser. No SQL migration needed. No live Production or full Next.js build test was performed.

## Files included
- `components/preparing/ProjectWarehouseReceiving.jsx`
- `public/css/projects-preparing.css`
- `app/projects-preparing/page.jsx`
- related regression tests (old stylesheet version updated)
- `tests/projects-preparing-v245-warehouse-compact.test.mjs`
