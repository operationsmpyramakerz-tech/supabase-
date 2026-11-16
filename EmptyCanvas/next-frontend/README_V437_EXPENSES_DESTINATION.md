# V437 — Required Destination in Expenses > Cash Out > Choose Order

## Deploy order
1. Open Supabase SQL Editor (self-hosted) and execute `2026-11-16-expenses-destination-v437.sql` **before** deploying this code.
2. Copy the modified files onto the existing project using their exact directory paths.
3. Deploy and refresh `/next/expenses`; the CSS cache key was updated.
4. Test Cash Out > Choose Order: select order, date and destination user; add an expense and confirm.
5. In the `expenses` table, check `destination_user_id` and `destination_user_name` for the new expense.

## Database
- `public.expenses.destination_user_id` (`text`, nullable for historical/other kinds of expense)
- `public.expenses.destination_user_name` (`text`, nullable; user-name snapshot)
- `team_members.id` is the source of the destination id, and `team_members.name` supplies its display name.
- Destination **does not** change the account charged for the expense or transfer funds to the selected user. It is classification / metadata only.

## Behavior
- Destination is a required single-select, below Date, populated from the full team-members list.
- The server rejects missing and unknown IDs (not just browser validation).
- Destination is copied to every expense draft and persisted in every Cash Out record on Confirm.
- Historical Cash In, settlement and existing expenses are untouched.

## Modified code
- `components/expenses/ExpensesDialogs.jsx`
- `components/expenses/ExpensesClient.jsx`
- `lib/expenses-data.js`
- `app/api/expenses/destinations/options/route.js` (new)
- `app/expenses/page.jsx` (CSS cache key)
- `tests/expenses-destination-v437.test.mjs` (new)
- 4 existing Expenses UI tests (updated CSS version assertion)
