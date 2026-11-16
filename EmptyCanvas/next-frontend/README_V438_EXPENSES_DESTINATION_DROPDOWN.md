# V438 — Searchable Destination dropdown cards

## Changes
- In `Choose Order`, Destination is now a dedicated searchable single-user dropdown.
- The list shows one person per card with a person icon, name and department (if provided).
- A search input is pinned to the top and filters by name or department. It is not auto-focused.
- The popup is anchored flush with the Destination field. It opens upward when there is insufficient space beneath and automatically repositions during scrolling or keyboard/viewport resizing.
- Selection, required validation, and saved Destination IDs/names remain unchanged from V437.
- Styling supports light and dark themes; CSS cache key was updated to V438.

## Files (relative to `supabase--main/EmptyCanvas/next-frontend`)
- `components/expenses/ExpensesDialogs.jsx`
- `lib/expense-destination-menu-position.mjs` (new)
- `public/css/expenses-classic-inline.css`
- `app/expenses/page.jsx`
- `tests/expenses-destination-picker-v438.test.mjs` (new)
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs`
- `tests/expenses-order-picker-upward-v429.test.mjs`
- `tests/expenses-order-search-ui-v430.test.mjs`
- `tests/expenses-modal-polish-v431.test.mjs`

## Validation
- Command: `node --test tests/expenses-*.test.mjs tests/permissions-phase2n4-storage-expenses.test.mjs`
- Result: 48 tests passed, 0 failed (source and unit tests; mobile browser not verified).

## Deployment
- Copy the paths above into the same Next.js project.
- No database migration, backend or API updates needed for this UI change.
- Run your build and verify dropdown placement on mobile.
