# v407 — Stage 3: Warehouse Return UI parity

Baseline: `ERP_Pyramakerz_v406_Full_Code.zip` (itself based on the supplied v405 source).

## Changed
- Only Stage 3 **Warehouse Return** now has the same layout as Production Receiving (Stage 1) and Components Testing (Stage 2): compact icon heading; Project Progress (`Returned / Project Required`); Stage Sign-off; in-row status tabs and icon-only Search, History and Download; color-coded kit folders; compact component rows with component codes and thumbnails, user avatars, small inline Edit/Save/Cancel, with an optional reversal icon.
- Search reuses the global header's expanding pill, with one custom close X (native clear suppressed) and Escape-to-close.
- Stage 3 keeps its existing `all`, `available`, `received` filter IDs and access rules. The filter labels now read `All Components`, `Remaining to Return`, and `Returned`; `All Components` still includes **only tested/previously returned** rows as mandated by the existing warehouse view filter.
- Stage 3's progress percentage is `Returned / Project Required`, capped to [0, 100] for display; actual counts are unchanged.
- The `/warehouse` GET handler decorates existing records with catalog product photos and return-record editor profile photos (capped at 60 distinct profile requests). Missing media is ignored; original stock data is never changed.
- Inline saving uses the existing `warehouseReceiptLimit(current, next, tested, allocated)` guard and the existing `/warehouse` POST `receive` action / receipt ledger. The available balance cannot be increased above tested or decreased below allocated units. A reversal action remains available as an icon, retaining signed ledger corrections and full history. Existing CSV/PDF blank/filled exports remain in place.
- The stage's history and sign-off sections remain intact. A successful write is not misreported as a failed write if the subsequent refresh fails.

## Production files modified (relative to `EmptyCanvas/next-frontend/`)
1. `components/preparing/ProjectWarehouseReceiving.jsx`
2. `lib/preparing-warehouse-presentation.js` (**new**)
3. `app/api/projects-preparing/warehouse/route.js`
4. `public/css/projects-preparing.css`

Optional test: `tests/projects-preparing-v407-warehouse-stage-ui.test.mjs`.

## Validation
- 7/7 new Stage 3 UI/presentation/permission/math tests passed.
- 16/16 older Stage 1/2 and warehouse math tests in focused run passed.
- Broader Projects Preparing tests: 385/408 passed, 23 failures in legacy source-assertion tests (16 pre-existing failures from v406 plus seven that require updating to Stage 3's approved new markup); no confirmed functional regression found in tested warehouse math.
- **Not performed:** live browser run, full Next.js production build (Next/React dependencies are not installed in this workspace), or deployment to the company production server.
- No SQL, migrations, dependency additions, environment changes, or writes to live production.
