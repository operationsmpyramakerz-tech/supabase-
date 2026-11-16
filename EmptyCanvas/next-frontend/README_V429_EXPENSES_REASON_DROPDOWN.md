# Expenses – Upward Reason Dropdown & Other Reason button (V429)

## Changes
1. On screens up to 768px, the Orders/Reason dropdown inside **Expenses → Choose Order** opens **upward** so the navigation bar does not hide the choices. Desktop placement remains adaptive.
2. The dropdown responds to scroll, resize and mobile keyboard visual viewport changes.
3. Removed the right-arrow icon from **Other reason** and changed its button background from `#0c1222` to a softer navy `#28354a` (`#35445c` on hover / when selected).
4. Updated the Expenses stylesheet cache token to `v429-upward-picker`.

## Changed code files (copy to exactly the same relative paths)
- `components/expenses/ExpensesDialogs.jsx`
- `lib/expense-order-menu-position.mjs` (new helper; **required**)
- `public/css/expenses-classic-inline.css`
- `app/expenses/page.jsx`

## Regression tests (include in source; not needed to run the app)
- `tests/expenses-order-picker-upward-v429.test.mjs` (new)
- `tests/expenses-picker-excel-links-v427.test.mjs` (updated CSS color assertion)
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs` (updated CSS token assertion)

## Install
1. Merge these files into the latest project, preserving directory structure.
2. Deploy the Next.js app and refresh the Expenses page.
3. On Android/mobile, open Cash Out → Choose Order → Orders and verify the list opens above the field, search works and Other reason has no arrow.

No DB / Supabase SQL migration, API, order selection state, or expense calculation changes.

## Validation
`node --test tests/expenses-*.test.mjs`: 24 tests pass. TypeScript JSX parser reported zero syntax diagnostics for the modified JSX; CSS top-level parse reported zero errors. Visual validation in a real deployed device remains recommended.
