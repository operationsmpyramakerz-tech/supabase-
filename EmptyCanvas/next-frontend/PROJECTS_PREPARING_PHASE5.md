# Projects Preparing — Phase 5 / v219: Final School Closing

Based on customer archive `supabase--main-218.zip` (October 27, 2026). **Files changed only**, no automatic deployment or production DB writes.

## Delivered

* A **Final School Closing** panel within each beneficiary school folder, preserving the Operations ERP bottom-sheet appearance on desktop and mobile.
* Six auditable checks: signed handover; approved proposal/actual grades; warehouse/Accounts custody settlement; seven-day school receipt review; technical acceptance and open issues; document archive.
* Each Verified checkpoint records the actual document reference and verification date; notes and HTTPS evidence links are optional. **The date for Signed School Handover is the actual signed minutes date**, not the time the ERP recorded a delivery.
* The seven-day review is enforced from the signed handover date for the `grace_review` check and again for final approval, using **Africa/Cairo** for current-date database checks.
* Dedicated final approval and reopening RPCs. Approve & Close requires completion of the eight earlier workflow stages, all six Verified records, resolved technical issues, technical acceptance, reconciled delivery quantities and recorded signed school receipts. It marks the ninth stage `completed` **atomically** with the approval. Reopen requires a reason of >=10 characters; earlier approvals remain in the audit trail.
* New `preparing.close` Feature-level permission, separate from `preparing.stage_update`. The regular stage editor cannot close or reopen a school.
* Closing CSV report with protection against spreadsheet formula injection; recent 100 audit records visible. Historical audit persists in Supabase.

## Files changed

* `lib/preparing-closing.js` — static checklist and summaries (new)
* `lib/preparing-service.js` — server validation and RPC binding
* `lib/feature-permissions-registry.js` — `preparing.close`
* `app/api/projects-preparing/closing/route.js` — permission-gated API (new)
* `components/preparing/FinalSchoolClosing.jsx` — checklist / signoff / reopening UI (new)
* `components/preparing/PreparingClient.jsx` — Closing entry, remove regular stage mutation
* `public/css/projects-preparing.css` — responsive styling
* `app/projects-preparing/page.jsx` — refreshed stylesheet URL
* `sql/2026-10-27-preparing-final-closing-phase5.sql` — additive tables / RPCs (new)
* `tests/projects-preparing-phase5.test.mjs` — new regression tests
* `tests/projects-preparing-phase4.test.mjs` — match the previously fixed PostgreSQL escape (`team''s`) in its static assertion
* This file

## Safe production installation

1. Confirm **Phase 4 corrected SQL** succeeded and Phase 1–3 schema is present. DO NOT execute the original broken Phase 4 SQL again.
2. Take a DB backup and a copy of your current production Git state. Use a maintenance window if possible; no staging deployment is required.
3. In Supabase SQL Editor (privileged role), run **the entire** `sql/2026-10-27-preparing-final-closing-phase5.sql` file. Its `BEGIN/COMMIT` protects against a partial migration if any statement fails. New tables only; existing projects/Proposals/orders are not deleted/modified. The Phase 4 stage RPC is **replaced** with the same earlier stage checks plus a reserved Final Closing guard.
4. Upload the changed-files ZIP to your GitHub repo, preserving relative paths from repo root (`EmptyCanvas/next-frontend/...`), then deploy as you normally do. Do not overwrite unrelated files or production environment variables.
5. In Users Center grant Page Access **Projects Preparing** and `preparing.view`. For checklist editing grant `preparing.stage_update`. Grant **`preparing.close`** only to approvers authorized to close/reopen schools (e.g., Operations manager). Existing profiles have no implicit new approval grant.
6. Navigate to `/next/projects-preparing`, open a project -> school -> **Open Closing**. Save real supporting references; approve only after signed acceptance/review and technical sign-off.

## Suggested manual smoke checks (Production safe)

* Without `preparing.close`, the Approve/Reopen buttons cannot issue an approval (UI and API enforced).
* Saving Verified without document reference/date is rejected.
* Verify a signed-handover date from more than 7 days ago to avoid waiting, for a genuine completed delivery only. Review remains blocked until 7 calendar days from the **signed** date.
* Finalize before all eight earlier stages are completed -> rejected; pending check -> rejected; unresolved technical issue -> rejected; quantities differ -> rejected; missing technical acceptance -> rejected.
* After real approval, school shows **Closed** in project workspace when panel closes. A second approval is rejected. Reopening asks for a reason and keeps prior approval in audit history.
* Save/edit with stale updated_at -> rejected (refresh then retry).

## Limits and follow-up

* No executable SQL was run against the company DB; no deployment done. Node structural tests passed **28/28**, JS/JSX Syntax checked; full Next.js build and live database tests **not** run (dependencies/server credentials absent in the uploaded archive).
* References and HTTPS URLs are evidence pointers, **not** genuine digital signatures or uploaded documents; the responsible team must manually confirm their authenticity. Direct file upload is not yet implemented.
* Phase 3 currently models **school-specific cartons** in the previous code. The approved real-world packing process uses identical **project-wide, kit-type cartons** (e.g., eleven identical Arduino kit cartons, assigned at dispatch). This deserves a separate refactor **before operational rollout**, not an unreviewed change to production in Phase 5.
* Final reporting/dashboard and project-level progress analytics are Phase 6.
* If deployment must be rolled back, roll back application files from Git backup first and retain the new additive DB tables pending a separately reviewed rollback; DO NOT drop shared data from production.
