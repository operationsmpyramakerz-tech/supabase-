# v406 — Stage 2: Components Testing UI parity

Baseline: user-supplied `supabase--main-405.zip`.

## Updated stage
- **Only Stage 2 (Components Testing)** receives the approved visual treatment of Stage 1 (Production Receiving). Stages 1, 3, 4, 5 and 6 retain their existing UI.
- Compact flask heading, single **Project Progress** bar (`Tested / Project Required`), with the original signed **Stage Sign-off / Close Stage** panel alongside it.
- Same all-black active status tabs and inline icon-only Search / History / Download actions as Stage 1. The Search expands into the matching ERP pill with one custom X, disabled native browser search clear icon, auto-focus, and Escape-to-close; mobile and dark themes reuse v405 CSS.
- Same solid kit-color panels, compact component rows, product photo thumbnails with centered enlarged image preview, and real tester profile avatars (with initial fallback).
- Same small inline Edit input and icon-only Save / Cancel actions. The `Tested` quantity and validation are unchanged.
- All Components, Remaining to Test, and Fully Tested retain Stage 2-specific filters, Testing History, and CSV/PDF (blank and values) export. All Components remains editable **where previously permitted**, unlike the Production Receiving stage: this is intentional to preserve Testing's original workflow.
- **Remaining to Test** uses `max(0, Production Received - Tested)` to respect Stage 1 gating. `Fully Tested` is still based on meeting the project's required quantity.
- Testing's REST GET route enriches only display data: matched product catalog photos and tester's public profile photos. The write RPC and data calculations were not changed.

## Files to replace (relative to `EmptyCanvas/next-frontend/`)
1. `components/preparing/ProjectTesting.jsx`
2. `lib/preparing-project-testing.js`
3. `app/api/projects-preparing/testing/route.js`

Additional optional files:
- `tests/projects-preparing-v406-testing-stage-ui.test.mjs`
- This README and `MODIFIED_FILES_v406.txt`.

No CSS change: both stages reuse the v405 `public/css/projects-preparing.css` already included. No new SQL, API mutation, environment variable, or package dependency.

## Validation
- 33/33 targeted tests passed (v401–v406 intake/testing UI, testing math, per-tab permissions, JSX and CSS syntax).
- Broader historical Projects Preparing suite: 379/395 passed; the 16 legacy failures include 5 known failures in the v405 baseline and older tests expecting Stage 2's *superseded* KPI/search/row markup. Review and update these historical UI snapshot assertions separately if keeping the entire legacy suite green is required.
- A full Next.js build, live browser test and production deploy were **not** performed. Verify the design on your tablet and confirm Testing edit permissions (including non-admin user) prior to production rollout.
