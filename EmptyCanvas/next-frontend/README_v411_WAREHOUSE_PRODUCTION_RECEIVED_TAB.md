# v411 — Warehouse Return / Production Received tab

## Requested change
In Stage 3 (Warehouse Return), the first status tab previously called **All Components** is now **Production Received**. It lists only BOM components with a positive physical received balance recorded in Stage 1 (Production Receiving), even if they have not yet been tested.

## Data flow
- Stage 1 authoritative source: `erp_preparing_intake_snapshot_v388`, as used by the Production Receiving screen.
- Stage 3 GET now attaches read-only `intakeBalances` to its presentation snapshot, mapped by the **warehouse item UUID** (`itemId`), not product name.
- The first tab filters by `productionIntakeReceived > 0`. It displays **Production Received** and a smaller **Tested** count so users can distinguish the intake quantity from the tested/returnable quantity.
- **Remaining to Return** still shows only positive `tested - returned` quantities.
- **Returned** still shows only components with positive warehouse-return balances.
- The actual Return edit is still limited to tested quantities and retains warehouse allocations and audit/history constraints. Rows with no tested or returned quantity do not present Edit actions.
- The existing permission key `preparing.tab.warehouse.all` remains unchanged, but its user-facing name and server-side membership checks now follow Production Received. Existing assigned permission values are preserved.
- Existing Warehouse Return CSV/PDF exports remain based on tested/returned rows (not this display filter) to avoid dropping historical return reports.

## Technical scope
- No SQL migrations, new tables or changed warehouse stock transactions.
- Shared Warehouse Return math only gains the optional Stage 1 balance projection.
- Stage 1, Stage 2 and Stages 4–6 UIs and write procedures remain untouched.
- The Projects Preparing stylesheet URL has a v411 cache-busting suffix.

## Tests
- Focused checks: 26/26 passing.
- Full `node --test tests/*.test.mjs`: 1132/1171 passing, 39 failures.
- The uploaded source baseline: 1126/1166 passing, 40 failures.
- All 39 remaining failure cases already failed in the uploaded source (no newly introduced failing test).
- No full Next.js production build or live-server test was run.
