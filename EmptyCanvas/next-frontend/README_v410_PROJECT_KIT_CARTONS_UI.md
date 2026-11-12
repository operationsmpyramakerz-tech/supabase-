# v410 — Stage 6 Project Kit Cartons UI

Source: user-uploaded `supabase--main-407.zip`. This archive already contained the v409 Stage 5 changes, despite its outer filename.

## Changes
- Stage 6 **SchoolKitCartons.jsx** (the actual Stage 6 entry point) now uses the common Stages 1–5 header, scoped Kit icon and styling, stage progress / sign-off row, tab controls, global-style expandable single-X search, and coloured Kit-group folders.
- Selected school stays visible in a compact dropdown + three counters (available Kits, school cartons, Kits inside cartons).
- Collapsible coloured groups of verified Kits support per-Kit checkbox, permission-aware Select group/Deselect group and sticky-in-flow Pack Carton action. The pack RPC, confirmation, validation, and immutable school carton records are unchanged.
- Packed Cartons tab exposes locked school cartons as expandable cards. The verified Kit manifests, component quantities, and printable public QR carton label are preserved.
- Legacy Cartons continues to open the original **ProjectKitCartons.jsx** unchanged. Users without edit-tab permission retain view-only access.
- Progress shows verified packed units placed in outer school cartons (plus ready legacy-carton units) against the school BOM quantity. Loose verified Kits are **not** counted as packed outer cartons, consistent with the project's preparation progress model.
- No new server endpoints, SQL, package dependencies or database migrations. Stage 1–5 functionality is not modified.

## Files changed
- `components/preparing/SchoolKitCartons.jsx`
- `components/preparing/StageFilterTabs.jsx` (icons for `kits` / `cartons` tabs only)
- `public/css/projects-preparing.css`
- `app/projects-preparing/page.jsx` (CSS cache key v410)
- `tests/projects-preparing-v410-project-kit-cartons-ui.test.mjs` (new)
- `README_v410_PROJECT_KIT_CARTONS_UI.md`
- `MODIFIED_FILES_v410.txt`

## Quality checks
- JSX parsing/transpilation via global TypeScript: clean.
- PostCSS stylesheet parsing: clean.
- Targeted carton / permissions / Stage 5 tests: passing.
- Full project test suite contains existing legacy structural failures inherited from v409 (not regressions in Stage 6).
- No live Production test or full Next.js build: dependencies are not installed in the provided archive.

## Deploy
Copy the files at the same relative repo paths, or replace with the complete ZIP. Redeploy normally. No SQL required.
