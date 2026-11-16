# ERP Expenses V434 — Floating Cash Out icon (Choose Order)

## Installation
Copy the folders from this ZIP into `EmptyCanvas/next-frontend/`, preserving the relative paths. Replace only the files listed below and redeploy/rebuild the app.

## Modified production files
1. `components/expenses/ExpensesDialogs.jsx` — Move the floating badge out of the scrollable content, keep the arrow-up-right Cash Out icon in white on red.
2. `public/css/expenses-classic-inline.css` — Position a 56 x 56 px badge at the exact top midpoint of the bottom sheet, 28 px outside and 28 px inside. Keep the sheet itself overflow-visible while the internal content remains scrollable. Reserve clearance for narrow displays.
3. `app/expenses/page.jsx` — Bump the stylesheet query version to `v434-floating-cash-out-edge` to avoid an outdated cached CSS file.

## Updated tests
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs`
- `tests/expenses-modal-polish-v431.test.mjs`
- `tests/expenses-order-picker-upward-v429.test.mjs`
- `tests/expenses-order-search-ui-v430.test.mjs`

## Test results
- `node --test tests/expenses-*.test.mjs` — 32/32 passing (using existing project tests).
- Front-end visual validation on a mobile device should be completed after deployment.

## Scope
UI / stylesheet cache update only. No API, DB, state, selection, or expense-saving logic changes.
