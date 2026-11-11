# v405 — Production Receiving search parity

Built from the user's `supabase--main-404.zip`.

## Changes
- Restyles Production Receiving's expanding search to match the classic ERP header search pill: compact dark search icon, unified rounded input, animated expansion, and one right-side close X.
- Hides the browser's native `input[type=search]` cancel control to eliminate the second X.
- One X closes the search and clears the query, matching the main header search. The search icon also toggles open/close; Escape closes and clears.
- On tablet/mobile widths, the full search pill appears below the toolbar actions to keep status tabs/history/download usable.
- Preserves component name/code filtering, project receiving quantity edits, status tabs, permissions, history and exports.

## Files updated
- `components/preparing/ProjectProductionIntake.jsx`
- `public/css/projects-preparing.css`

## Test added
- `tests/projects-preparing-v405-search-parity.test.mjs`

## Validation
- v401–v404 targeted Production Receiving suite: 16/16 passed.
- v405 new parity tests: 3/3 passed.
- CSS parsing: no syntax errors.
- No database migrations, new dependencies, environment-variable changes or API changes.
- Complete Next.js build and live deployment validation were not performed.
