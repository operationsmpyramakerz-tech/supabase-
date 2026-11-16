# V424 — Database > Orders: Search by Order Number

## What changed
- The existing search control in the header of **Database > Orders** now searches the **complete Supabase orders table** by the `order_number` field, not only the 50 rows currently shown.
- Supports entering `117`, `ORD-117`, `ord117`, or `ORD #117`. Matches the **exact order number** and returns all component rows for it.
- Keeps paging (50 rows per page) for orders with many component records.
- Clearing or closing search restores the normal Orders table.
- All other Database tables keep their previous local search behavior.
- Uses the existing Database read permission and API; no migrations or new environment variables.

## Deployment
Copy files from `supabase--main/EmptyCanvas/next-frontend/` in this ZIP to the **same paths** in the current repository, replacing existing files with identical names, then deploy Next.js normally.

Modified files:
- `components/backup/BackupTableClient.jsx`
- `app/api/backup/rows-direct/route.js`
- `lib/backup-data.js`

New files:
- `lib/backup-order-number-search.mjs`
- `tests/backup-order-number-search-v424.test.mjs`

## How to verify
1. Go to Database > Orders, open the top search icon, enter `117`.
2. Confirm all database rows belonging to ORD-117 appear (including any beyond the initial 50 rows).
3. Try `ORD-117`: it should show exactly the same results.
4. Clear search: normal pagination returns.
5. Go to another Database table; its search is unchanged.

## Validation
- 16 V424 targeted tests passed.
- JSX and JS source files passed syntax parsing checks.
- No live ERP database was contacted during local tests.
