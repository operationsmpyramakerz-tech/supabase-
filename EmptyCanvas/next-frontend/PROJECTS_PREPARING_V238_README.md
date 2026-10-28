# Projects Preparing v238 — Components Testing Identity, Remaining & UI

Source: supabase--main-237.zip (latest uploaded project).

## What changed
- Removed manually typed Tested By from edit forms and POST payload. The server obtains the verified ERP user ID + name from the signed-in account; saves are attributed to that user, not a client string.
- The database keeps the user name snapshot (`created_by_name`) on each append-only test report; `created_by_id` remains the stable identity. The per-component view lists distinct contributing users (deduplicated by account ID). Tested By appears after saving, not in edit mode.
- History displays a separate, modern card for each saved component change, including actor, timestamp, item, reference and signed quantity deltas.
- `Not tested` is renamed to `Remaining`: max(0, Project Required - Testing Received), per item and in overall totals. This is distinct from received-but-unclassified testing intake.
- Refined summary cards with semantic accent colors and responsive testing row/history styling; CSS cache version v238.

## Apply to production (no automated deployment was performed)
1. Back up Supabase and current production code. Verify v235, v236 and v237 have been deployed successfully.
2. Run `sql/2026-10-28-preparing-testing-identity-and-remaining-v238.sql` in Supabase SQL Editor as postgres. This is a single transaction (BEGIN/COMMIT); do not run v236 again. It only adds one column, replaces the overview RPC, and introduces a new v238 save RPC; it does not delete or rewrite existing records.
3. Upload the changed-files ZIP into the repository preserving its paths and deploy via your normal production workflow. SQL must be applied before deploying the v238 app code.
4. Test as two different signed-in users, each with `preparing.stage_update` access: update the same test component and confirm both names appear as chips; confirm two distinct audit entries exist with the correct editor and time.
5. Check `Remaining` with a 10-unit required component and 4 Testing Received: expected 6, independently of Passed/Failed split. Confirm user name never appears as an editable input. Verify CSV export.
6. Verify read-only users can view reports but cannot edit results. Test mobile and tablet before operational rollout.

## Existing test records
Older test reports retain their stored authorship IDs and earlier manually entered technician labels. Names not originally stored as authenticated identities are **not** fabricated or backfilled. History explicitly marks these as legacy records. New test records will have the authenticated editor name.

## Safety and scope
- This does NOT change Warehouse Receiving, school QC, school allocations, any stock balances, or the test-pass-to-warehouse restriction.
- Only authenticated users who can update preparing stages can save testing changes.
- A new function `erp_preparing_project_testing_record_v238` avoids silently changing the old RPC signature; the older function is retained for rollback compatibility.
- Browser source code uses an independent aggregate of unique account IDs for Tested By; repeat changes by the same person do not create duplicate name chips.

## Validation
- 136/136 automated node tests passed (updated legacy assertions + v238 identity/remaining tests).
- TypeScript parser reported no JSX/JS parse diagnostics in changed program files.
- Chromium visual smoke tests at 1440px / 760px / 390px showed no horizontal document overflow with sample component rows and history cards.
- This environment has NOT executed the migration on real PostgreSQL/Supabase, nor performed a complete Next.js build or production API end-to-end test. Apply cautiously and validate on test project data in your production instance.
