# Projects Preparing v237 — Testing inline editing and save fix

Base: `supabase--main-236.zip`.

## Changes

- Fixed a confirmed UI blocker when saving from a component row: the Test Report Reference field showed only a placeholder, but the client required a nonempty value. An empty manual reference now generates a unique `QC-<uuid>` server-side, preserving the existing append-only testing history and uniqueness rules. A manually entered reference remains supported.
- One component card has exactly two sections: header with component name/code and the required project quantity aligned to the right; a second row with Testing Received, Passed, Failed, Not tested (computed), Tested By, and Edit.
- In edit mode the displayed numeric values become actual inputs *in the same positions*, along with the technician field. Save/Cancel act within that row. No duplicate input row is rendered.
- Row-specific validation and API errors appear directly below the corresponding component.
- A successful POST is reported as saved even if the subsequent list refresh fails; users are told to refresh instead of encouraged to submit duplicate data.
- CSS version bumped to v237 to avoid production browser caching.
- No database schema or SQL changes. No modification to Warehouse Receiving, school QC, or previous Testing records.

## Deployment

1. Back up the currently deployed repository code. Keep the already-applied v235 and v236 migrations.
2. Copy the ZIP's `EmptyCanvas/next-frontend/...` paths over the same repository paths. Upload the changed files to GitHub and deploy as usual. Do not re-run any prior SQL just for this release.
3. Hard-refresh the page after deployment.
4. Open Projects Preparing > a project > Project Testing. On a **test project**, click Edit on a component, enter Testing Received=2, Passed=1, Failed=1, and a technician name, and click that row's Save **without entering a report reference**.
5. Confirm values persist after Refresh, then check Testing History for an automatically generated QC reference. Retest with your own reference (choose a new unique one each time).
6. Verify the same row edits work on tablet/mobile; Not tested is computed automatically and is intentionally read-only.

## Verification in this environment

- `node --test tests/projects-preparing*.test.mjs`: 131 passed, 0 failed.
- JavaScript/JSX parsing passed.
- Responsive Chromium checks at 1440px, 760px, 390px: no cross-row overlap or horizontal overflow in a static CSS preview.
- **Not run:** full Next.js production build, live Supabase RPC tests, or production deployment. Real database functionality must be verified in the post-deploy test described above.

## Scope/known constraint

A technician's name is saved together with a nonzero testing quantity change under existing v236 database rules. Changing *only* the technician name without any quantity difference is not supported by the existing RPC/SQL (a separate audit-safe metadata update would require a new migration).
