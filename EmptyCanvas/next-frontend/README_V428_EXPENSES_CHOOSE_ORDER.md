# Expenses – Choose Order Bottom Sheet (V428)

Based on the uploaded `supabase--main.zip` dated 16 November 2026.

## Changed files
- `components/expenses/ExpensesDialogs.jsx` – makes Choose Order a dedicated bottom-sheet variant, removes helper text and duplicate order IDs in summary, sets `1 selection` / `N selections`, adds banknote-plus Add Expense icon, sets Confirm to green and Close to Cancel.
- `public/css/expenses-classic-inline.css` – mobile bottom-sheet positioning above the navigation dock, drag handle, better selected chips and action styling, dark-mode/small-screen adjustments.
- `app/expenses/page.jsx` – CSS URL cache bust so users receive the new styles after deploy.
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs` – regression tests (optional to deploy; recommended to retain in source).

## Deployment
Copy the files to the **same relative paths** in `EmptyCanvas/next-frontend` in your repository. Deploy normally. No SQL migration is required. No backend order or expenses logic changed.

## Expected behavior
On phones up to 768px, Choose Order slides up as a sheet and stops above the bottom navigation bar, with scroll when the sheet is taller than the viewport. Larger screens keep the centered dialog. Other Expenses dialogs are unchanged. The Order multi-select and multi-order save flow remain in place.

Confirm remains disabled until at least one expense draft exists, but uses green styling. Adding an expense is still required before saving.

## Checks performed
`node --test tests/expenses-choose-order-bottom-sheet-v428.test.mjs tests/expenses-picker-excel-links-v427.test.mjs tests/expenses-multi-orders-v426.test.mjs` – 16 tests passed.
JSX syntax parsed with TypeScript compiler (2 files): passed.
CSS stylesheet parsed with tinycss2: no top-level errors.
Not yet visually tested in the user's deployed browser/device.
