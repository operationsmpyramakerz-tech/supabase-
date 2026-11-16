# Expenses UI – V431

Source: uploaded `supabase--main.zip` (16 November 2026).

## Production files to replace
- `components/expenses/ExpensesDialogs.jsx`
  - The **Cash out > Add Expense** modal uses a mobile bottom-flush variant, with no transparent/dim lower rounded corners.
  - The **Choose Order** sheet gets a centered banknote-plus icon at its top.
  - Selected orders preview is a compact picker-style card: first order's type icon, order ID, creator and **selected expense date**; additional selected orders appear as `+1`, `+2`, etc. The `Change` action remains.
- `public/css/expenses-classic-inline.css`
  - Mobile edge-to-edge bottom alignment for the Choose Order sheet, replacing the previous 110px bottom offset.
  - Square lower corners for both mobile sheets and a responsive/dark-mode preview card.
- `app/expenses/page.jsx`
  - CSS query-string bump to `v431-expenses-modal-cards` so clients see fresh styles.

## Date note
The preview shows the expense date chosen in the preceding **Choose Order > Date** input, not the database creation date of the order. The order picker API does not currently supply order creation dates. No fake order date was introduced.

## Compatibility and deployment
- Replace the three production files at their exact relative paths within `EmptyCanvas/next-frontend`.
- Existing Orders dropdown selection, manual reason, multi-order linking, and pending draft/confirmation logic were retained.
- No database migration, API contract change, or server-side expense calculations changed.
- Other modals (e.g. Cash in and Settle) were not made bottom-flush.
- On a phone, verify the native navigation bar, screen keyboard, and scroll behavior with actual device safe-area settings.

## Checks
- `node --test tests/expenses-*.test.mjs` — see test output.
- `ExpensesDialogs.jsx` — TypeScript JSX parser: 0 syntax diagnostics.
- CSS stylesheet parse: no errors.
- No browser or physical device visual checks were run.
