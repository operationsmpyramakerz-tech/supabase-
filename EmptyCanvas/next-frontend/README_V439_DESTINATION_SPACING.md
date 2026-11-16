# V439 — Destination field spacing

The **Choose Order** bottom sheet now has 16px of vertical space between the Destination dropdown and the **Add Expense** button.

## Files changed
- `public/css/expenses-classic-inline.css` — scoped spacing rule.
- `app/expenses/page.jsx` — changed CSS version query to ensure a fresh stylesheet loads.
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs` — updated CSS-version expectation.
- `tests/expenses-destination-picker-v438.test.mjs` — updated CSS-version expectation.
- `tests/expenses-modal-polish-v431.test.mjs` — updated CSS-version expectation.
- `tests/expenses-order-picker-upward-v429.test.mjs` — updated CSS-version expectation.
- `tests/expenses-order-search-ui-v430.test.mjs` — updated CSS-version expectation.
- `tests/expenses-destination-spacing-v439.test.mjs` — new spacing regression check.

Copy files to the same paths inside `EmptyCanvas/next-frontend`. No database/API changes.
