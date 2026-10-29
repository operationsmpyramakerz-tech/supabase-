# Projects Preparing v246 — Header Search & Warehouse Edit Accessibility

Based on `supabase--main-245.zip`.

## Changes

- Removed the redundant refresh icon from the Projects Preparing index and project pages.
- Removed the duplicate search boxes in those two pages.
- Connected the global top-header search field (AppShell / HeaderSearch) to Projects, Schools, and School Preparing Workflow. The search is cleared on navigation and listeners are cleaned up when the view changes.
- Warehouse Receiving's Edit control now responds to a click even without the `preparing.warehouse_receive` feature grant: it displays a clear inline access message instead of silently remaining greyed out. **This does not grant permissions.** Authorized users can edit their Received value inline and Save subject to the existing quantity limits.
- Warehouse Receiving keeps its own component search and refresh inside its modal, because the global header is behind the modal overlay.
- Existing warehouse API/server-side `preparing.warehouse_receive` gate remains unchanged; no authorization bypass or data migration.

## Enable Warehouse Receiving edits for a user

From Users Center, open that member's access profile:
1. Make sure Projects Preparing Page Access is enabled.
2. If Advanced Permissions are enabled for this member, under Projects Preparing enable View and **Capture project BOM and receive from central warehouse** (`preparing.warehouse_receive`).
3. Save and refresh the ERP.

The front-end button cannot automatically grant this permission, and the server rejects unauthorized saves.

## Deploy

Unzip inside `EmptyCanvas/next-frontend/` so paths (`components/preparing/…`, `tests/…`) are preserved. No SQL changes. Deploy via your existing GitHub / production workflow; retain a rollback copy. Validate top-header search and receiving permissions using a test project before live receiving.

## Validation

`node --test tests/projects-preparing-*.test.mjs` — 163 tests passed locally (static/logic/JSX checks). No full Next.js build, browser integration test, production Supabase connection, or production deployment has been performed in this session.
