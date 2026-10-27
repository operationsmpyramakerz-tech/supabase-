# Projects Preparing — v224 UI refinement & regression audit

Base archive: `supabase--main-223.zip`

## Scope
- Compact responsive Project Folders, project schools, school workspace, stages and metrics.
- Removed nonessential instructional / informational text from page headers, cards and module intros; kept warnings required for workflow safety.
- Introduced short icon-driven tools at project and school level with no duplicate Project Dashboard / Kit Cartons actions.
- Removed duplicated Schools vs Beneficiaries counters at project level; project metrics now Schools / Delivered / Closed / overall stage progress. School metrics now show completed / remaining stages and delivery / closing status.
- Simplified the school header, proposal information and stage cards.
- Fixed contextual Back so it returns from a school to **its project**, and only from the project to all projects.
- Kept all API calls, existing operational actions, authorizations, modal workflows and warehouse / delivery / technical / closing logic unchanged.
- Bumped CSS asset query to `v=224` for cache busting.
- Refreshed old static tests whose assertions depended on removed button copy; added Phase 9 UI checks.

## Verification
- `node --test tests/projects-preparing-*.test.mjs` => **65 passed, 0 failed**.
- All 8 Preparing JSX components parsed successfully by TypeScript JSX parser.
- CSS reviewed for scoped style rules and mobile breakpoints.
- No SQL migration required: no database changes and no server API mutations.
- Next.js production build, browser visual regression and Production Supabase integration were **not** run: dependencies/service are not available in this environment.

## Deploy (existing Production system, no staging)
1. Keep a code backup / deployment rollback point.
2. Merge the changed-files ZIP into the repo root, preserving `EmptyCanvas/next-frontend/...` paths.
3. Deploy through the normal existing process. **Do not run SQL** for v224.
4. Check desktop + tablet + phone at `/next/projects-preparing`: list → project → school → back (school should return to project) → project dashboard / kit cartons → all five school tools → 9 stages.
5. Confirm permission-denied user remains unable to access the page and that creating and closing actions still obey feature permissions.
6. If the UI looks stale, hard-refresh to fetch the `?v=224` stylesheet.

## Remaining operational sign-off
- Full end-to-end school workflow in the real environment using test records, including quantities, allocation, actual signed delivery, technical sign-off and closing.
- Cross-user role matrix and permission-denied API checks on deployment.
- Live SQL schema and production read consistency checks for versions 1–8.
- Read-only comparison of dashboard aggregate totals with individual school records.

This is a UI-focused Phase 9 increment, **not a claim of full Production audit completion**.
