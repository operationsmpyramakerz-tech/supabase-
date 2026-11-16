# V440 — Expenses title alignment & Funds Type dropdown cards

## Changes
1. Centered the title in **Choose Order** beneath the floating red Cash Out icon.
2. Centered the title in **Add Expense** beneath the floating black Add Money icon.
3. Redesigned the **Funds Type** dropdown options into compact, independently bordered cards with:
   - a contextual icon;
   - funds type title and the existing screenshot hint;
   - status badge for Optional, Required, or Maps required.
4. Improved the dropdown positioning using its estimated content height instead of a fixed empty space, while keeping internal scrolling for long lists.
5. Bumped the Expenses stylesheet version so clients fetch the updated styles.

## Modified production files
- `components/expenses/ExpensesDialogs.jsx`
- `public/css/expenses-classic-inline.css`
- `app/expenses/page.jsx`

## Tests
- Updated 6 existing Expenses tests for the stylesheet version.
- Added `tests/expenses-funds-type-cards-v440.test.mjs`.
- Run from `EmptyCanvas/next-frontend`:
  `node --test tests/expenses-*.test.mjs`
- Result at packaging: **48 passing / 48 total**.
- The JSX file was also checked by the TypeScript JSX parser (0 diagnostics).

## Installation
Copy the paths from this ZIP on top of the corresponding files in the latest repository, then redeploy. No SQL migration, database or API changes are needed.
