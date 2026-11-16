# V427 — Expenses order picker polish + multiple Excel order links

Base: user-uploaded `supabase--main.zip` (16 November 2026). Apply this patch **after V426**.

## Files

1. `components/expenses/ExpensesDialogs.jsx` — uses the exact `ClassicOrderIcon` maintenance wrench from Operations Orders; renders Other reason as a distinct black action rather than a checkbox option; replaces selected-order chips with smaller rounded cards and a compact circular X icon.
2. `public/css/expenses-classic-inline.css` — styles the manual action, consistent type icon, and selected-order chips in desktop/mobile layouts.
3. `lib/expense-export-service.js` — Excel Reasons show all linked order numbers. Dynamically inserts one independently clickable `Order N` link column per order needed in the export; updates screenshot and numeric formatting column positions without altering rows or totals.
4. `lib/expense-export-order-links.mjs` (new) — pure mapping from server-read expense order links to authorized in-app tracking and grouped receipt viewer URLs.
5. `tests/expenses-picker-excel-links-v427.test.mjs` (new) — regression tests for multi-order export, manual/legacy cases, link safety and code wiring.

## Why separate link columns?

The standard `.xlsx` hyperlink structure allows **one actionable hyperlink per cell**, not independent clickable segments within one cell. Accordingly, the **Reason** cell displays all order numbers and, if their stored component IDs are present, opens their combined receipt viewer. The adjacent `Order 1`, `Order 2`, etc., cells are **independent hyperlinks** that open each order's tracking page. This preserves one expense per spreadsheet row, and ensures Cash In/Cash Out totals are not multiplied.

An order's tracking or receipt viewer may require the corresponding account permission; the export cannot grant access beyond the user's ERP permissions.

## Installation

Copy the above files into their original paths in the ERP Next.js project. Run your normal build/deploy process. No SQL migration is required.

## Checks

- `node --check` — service and helper modules passed.
- TypeScript parser — modified `.jsx` / `.js` / `.mjs` parsed without diagnostics.
- `node --test tests/expenses-picker-excel-links-v427.test.mjs tests/expenses-multi-orders-v426.test.mjs tests/expenses-own-car-rate.test.mjs tests/permissions-phase2n4-storage-expenses.test.mjs` — 22 tests passed.

Test with an Expenses Users export that includes a single-order expense, a two-order expense, and a manually entered expense. The production database and a deployed UI were not available to the test runner, so live end-to-end export and permission behavior must be verified after deployment.
