# Projects Preparing — Phase 6 / v220: Master Project Dashboard & Reports

Source: user-provided `supabase--main-219.zip`, October 27, 2026. This update is **code-only** and read-only as regards school data. No SQL migration, DB writes, production deployment or external credentials were used.

## Scope delivered

- Added **Project Dashboard** entry within each complete project folder. The existing project/school screens and their existing permissions and workflows remain unchanged.
- Dashboard provides total beneficiaries, handover-complete schools, formally closed schools, average stage completion (all 9 stages), open technical issues, overdue issues, and schools whose BOM snapshots have not been captured.
- Workflow stage distribution, component totals from captured manifests, packed/received quantities from active shipments (cancelled shipments excluded), school-level matrix with search/filter/sort, and risk / follow-up board.
- Overdue = issue status is not `resolved`, has an assigned `due_date`, and date is earlier than *today in Africa/Cairo*. No blanket SLA is applied. Operations monitors issues; the technical team executes installation/repairs.
- A school is counted as formally Closed only if both `final_closing` stage is completed and Final Closing approval status is `approved`. Mismatched records are flagged for manual review.
- Two CSV exports: **internal Operations report** (detailed quantities, issues, closing progress) and **Ministry informational status report** (handover, technical acceptance, unresolved issues, and internal closing). Ministry export is **not** a company internal closing approval or a certification of machine condition. Machine condition is marked *Not separately assessed in ERP* because Phase 4 records no machine-by-machine inspection state.
- The reporting API and page require the existing **Projects Preparing** Page Access + `preparing.view` gate. The reporting endpoint is GET-only and returns `Cache-Control: private, no-store`; SQL/REST access is exclusively server-side via the existing service role. It uses selected fields, per-project school filtering and paginated reads with explicit errors on exceeded limits instead of showing incomplete totals.
- CSV strings are quoted and formula prefixes are escaped, including leading whitespace. Missing BOMs show as N/A; the project quantity summary includes only schools where the manifest has been captured, and visibly states the omitted number.

## Changed files (repository-relative)

1. `lib/preparing-reports.js` (new) — pure project report aggregation, Cairo date, CSV builders.
2. `lib/preparing-report-service.js` (new) — authenticated server-side read aggregation from existing 9 tables.
3. `app/api/projects-preparing/reports/route.js` (new) — feature-gated, no-cache GET endpoint.
4. `components/preparing/ProjectDashboard.jsx` (new) — project dashboard, table, risks, exports.
5. `components/preparing/PreparingClient.jsx` — dashboard entry in project folder, leave school workflow untouched.
6. `public/css/projects-preparing.css` — modern responsive layout for the dashboard.
7. `app/projects-preparing/page.jsx` — stylesheet version update.
8. `tests/projects-preparing-phase6.test.mjs` (new) — reporting regression tests.
9. `PROJECTS_PREPARING_PHASE6.md` (this file).

## Apply safely on your existing production deployment

1. Create a Git backup/commit of the running release and, as routine best practice for production, retain a Supabase backup. **No new SQL is needed for Phase 6.** Existing Phase 1–5 migrations must already be successfully installed.
2. Upload the changed files to GitHub preserving the same `EmptyCanvas/next-frontend/` paths used by the current ERP, then deploy through your existing process. Do not upload this ZIP as a complete codebase, and do not delete any other files.
3. Access `Projects Preparing` with an account granted the page and `preparing.view`. Select a project folder (e.g. 30 June Schools), then click **Project Dashboard** / **Open Dashboard**.
4. Check the reported school count vs the project's actual beneficiaries, validate delivery and closing counts against a few school folders, and check quantities on at least one school with a captured BOM and one without.
5. Verify the Overdue Issues view for an unresolved issue with a real past due date, and confirm resolved/future-due issues are excluded.
6. Test both CSV downloads in Excel; confirm user-entered content remains text. The Ministry status file must be reviewed before external circulation and does not constitute formal school sign-off.
7. If the page fails, roll back only the application files to the previous deployed Git revision; no DB rollback is required because this change adds no database objects or writes.

## Important limits / pending work

- **Full Next.js build, server execution and live Supabase data test were not run** (uploaded ZIP has no dependencies/secrets). Tests are pure logic/static regression tests; JavaScript/JSX was syntax-checked with the installed TypeScript transpiler.
- The current packing module models **school-specific cartons**. The actual operating model is **project-level kit-type cartons assigned to schools during dispatch**. That separate Phase 3 architecture change remains open; the new report *reads* the current school-carton schema and does not claim to have refactored packing.
- The system currently lacks formal planned school delivery dates, individual machine operating-condition records, and Ministry-report issuance/approval history. It cannot report these as actual data. Do not infer them from technical issue or approval counts.
- Reports are a series of bounded read requests, not a single database transaction; simultaneous operational writes could briefly create a non-atomic view. Click Refresh before final external reporting.
- For large projects the API fails rather than silently truncate data (400 schools max and per-dataset read limits). Any future large deployment could benefit from a reviewed materialized/aggregate endpoint.
