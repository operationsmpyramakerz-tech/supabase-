# Expenses — V432 Cash Out floating icon

## Requested change
- On mobile **Choose Order**, replace the black money-add hero icon with the existing Expenses **Cash out** up-right arrow icon in red.
- Center the badge on the top edge of the sheet (28px outside / 28px inside), matching the Shopping Cart Add Component visual.
- Keep the Choose Order sheet flush with the phone navigation edge.

## Implementation
- `components/expenses/ExpensesDialogs.jsx`: render the badge in an outer `.ex-modal-sheet-frame` as a sibling of the scrollable dialog section. The floating half is not clipped when the sheet scrolls.
- `public/css/expenses-classic-inline.css`: red icon badge styling, precise edge positioning, responsive height, and reduced-motion handling.
- `app/expenses/page.jsx`: bump CSS cache version.
- `tests/expenses-modal-polish-v431.test.mjs`: update the previous layout expectation to the new icon and floating geometry.

No database, API, or cash-out saving logic changes.
