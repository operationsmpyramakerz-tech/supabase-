# V436 — Add Expense UI refinements

## Changes
- Make **Cash out → Add Expense** a full-width mobile bottom sheet (no side gutters).
- Remove the Selected Orders preview from the Add Expense form. The selected order(s) still remain in component state and are still included in saved draft + backend payload. Use the existing Back button to change selected orders in Choose Order.
- Add a centered, floating **Add Money** icon with a black background and white glyph at the top sheet edge. The 56px badge has 28px above and 28px below the edge, matching the Shopping Cart Add Component pattern.
- Keep the form scrollable independent of its floating icon and preserve native bottom-edge coverage.
- Update CSS cache query to v436.

## Installation
Copy the seven supplied files over the matching relative paths in `EmptyCanvas/next-frontend/` in your latest source tree. Keep the directory paths in the ZIP; do not add duplicated directory names.

## Verification
`node --test tests/expenses*.test.mjs` — 32 tests passed in a selective workspace populated with source dependencies from the uploaded ZIP.

No database changes. No API changes. All changes are scoped to Expenses UI and its checks. Mobile appearance has not been tested on a physical device.
