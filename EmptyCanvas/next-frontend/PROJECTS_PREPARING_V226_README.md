# Projects Preparing — v226 (Home-page UI parity)

## Base and scope

Based on the user-provided `supabase--main-225.zip`.
Changes are limited to **the FIRST Projects Preparing screen**. All school workflows, server APIs, database tables, and user permissions are unchanged.

## Exact Proposals folder parity

The previous Projects folders were 218 × 204 px with a 2 px outline. The final effective folder rules in `public/css/proposals.css` use:

- Folder card: **154 × 144 px**; 5 px `#101217` border; 20 px corner radius.
- Folder grid: fixed 154 px tracks, 18 × 16 px gaps; no enlarged single card when there is only one project.
- Matching orange gradient, three paper sheets, black folder front/lip, typography and bottom count placement.
- Project folders only receive the updated dimensions. School folders remain unchanged.
- Opening a folder and the existing long-press/right-click/three-dot actions are preserved; the three-dot icon now draws correctly.

## First-page header and controls

- Compact dark **New Project** action and clean Refresh button.
- Removed the four oversized index metric cards and introduced accessible, working **All Projects**, **Active**, **Delivered**, and **Closed** filter tabs with counts.
- Modern search field, compact folder count, responsive layout, and mobile horizontally-scrollable tabs.
- Filter semantics: Active = a project with at least one beneficiary not marked closed; Delivered = at least one school delivered; Closed = every school closed and at least one school exists. These are project-wide summary filters, not new database statuses.
- No decorative controls or links; search and filter compose.

## Modified paths

- `EmptyCanvas/next-frontend/components/preparing/PreparingClient.jsx`
- `EmptyCanvas/next-frontend/public/css/projects-preparing.css`
- `EmptyCanvas/next-frontend/app/projects-preparing/page.jsx` (asset cache-busting `v=226`)
- `EmptyCanvas/next-frontend/tests/projects-preparing-v225-folders-products.test.mjs` (updated assertions for the current design)

## Validation

- 72/72 related Preparing tests passed via `node --test tests/projects-preparing-*.test.mjs`.
- TypeScript/JSX parser reported no JSX syntax errors.
- CSS parsed without errors.
- Chromium visual mock inspected at desktop and mobile sizes; measured Project folder bounds are exactly **154 × 144 px** in both. This was a static design fixture, NOT a connected ERP runtime test.
- **Not performed:** full Next.js build (dependencies are not bundled), Supabase integration testing, or production deployment.

## Apply to production

1. Keep a code backup; no database migration is required.
2. Extract the changed-files ZIP and copy the `EmptyCanvas/next-frontend/...` paths onto matching paths in the existing repo.
3. Deploy via your usual company server/GitHub process.
4. Refresh `/next/projects-preparing`; test the four tabs, search, folder opening, and folder actions. Verify viewport sizes on the actual app.

No SQL changes. No data or permissions changes. Do not use this ZIP to replace the entire project.
