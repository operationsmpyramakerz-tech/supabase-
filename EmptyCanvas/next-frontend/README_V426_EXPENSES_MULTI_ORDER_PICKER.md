# Expenses — Multi-order Cash Out picker (V426)

Base: user's `supabase--main.zip`, 16 Nov 2026.

## Changed files

- `components/expenses/ExpensesDialogs.jsx`: custom compact multi-select with type icons and creator names; preserves draft-specific relation IDs, keys and dates for multi-order Cash Out.
- `public/css/expenses-classic-inline.css`: compact order cards, selection indicators, search, responsive picker and selected chips.
- `lib/expense-order-access.js`: enriches order options with the creator's `team_member_name` (and legacy aliases); validates every component of every selected order against the database and the account's configured scope.
- `lib/expense-order-access.mjs`: pure validation of selected order group keys and verified database order numbers.
- `tests/expenses-multi-orders-v426.test.mjs`: new multi-order selection validation regression tests.
- `tests/permissions-phase2n4-storage-expenses.test.mjs`: updates the legacy test expectation after strengthening relation validation and adding name enrichment.

## Deploy

Place each file at the same relative path in the existing Next.js project, then redeploy. **No SQL migration is required.** Do not replace unrelated files.

## Behavior

- Dropdown allows selecting multiple order numbers; **Other reason** is exclusive.
- List shows `ORD-NNN`, request creator name and request-type icon. The creator name is sourced from `orders.team_member_name` or equivalent legacy fields; if empty, the UI shows `Unknown user` rather than inventing a name.
- Cash Out associates the expense with all of the selected order rows, and saves the canonical, server-verified order numbers in `expenses.orders_names` and IDs in `expenses.orders_raw`.
- Existing one-order expenses and manual reasons remain supported. Pending expenses keep the selected relations that were current when each expense was added (changing the picker after adding a draft does not alter an existing draft).
- Server rejects incomplete order groups, cross-scope components and unverified relation keys; the combined relation IDs remain subject to the existing 200-row bound.

## Validation performed

- Node built-in tests: **15 passed** from three expense/security test suites.
- TypeScript parser check: all modified JS/JSX/MJS files parsed without diagnostics.
- No integration test against the production Supabase or running browser was performed. Test with two small approved orders before using it for production expenses.
