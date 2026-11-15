# ERP Pyramakerz v417 — Stage Header Search / History layout

Source: latest user-uploaded `supabase--main.zip`. This patch affects **Projects Preparing** stage presentation only.

## Changes
- Stages 1–6: the search button now follows the same icon → input → single clear (X) sequence, pill background, transition, rounded controls, and keyboard Escape / auto-focus behavior as the ERP header's `HeaderSearch`.
- Open search overlaps the filter tabs to its **left**, anchored to the right edge of the existing search slot; it does not wrap or shift Download/Labels/buttons to a new row.
- Stages 1–5: History has moved to the stage heading, directly before the stage-close X. The original per-stage history state and audit rendering are retained.
- Stage 5: clicking the new header History action switches between Box Distribution and Box History; when History opens, any active component search is closed and cleared as previously.
- Stage 6 has no existing History action, so no new unimplemented history control has been invented.
- The stage title, History and X controls stay on one line at narrow mobile widths.
- Updated the `projects-preparing.css` cache-busting query in the Projects Preparing page.

## Code files
- `components/preparing/ProjectProductionIntake.jsx`
- `components/preparing/ProjectTesting.jsx`
- `components/preparing/ProjectWarehouseReceiving.jsx`
- `components/preparing/ProjectProductionReceiving.jsx`
- `components/preparing/ProjectBoxDistribution.jsx`
- `public/css/projects-preparing.css`
- `app/projects-preparing/page.jsx`

## Validation
- Current targeted tests: 40/40 passed (including 6 new v417 regression tests).
- Full Node test run: 1175/1212 passed. The remaining 37 failures are legacy tests not introduced by these changes.
- Chromium responsive smoke test in a static isolated stage mock: at widths 320, 360, 390, 430, 768, and 1200px, search expanded left while maintaining the same toolbar y position and right anchor; History stayed next to the stage X without overlap or horizontal viewport overflow.
- All six JSX components parsed with TypeScript JSX parser; CSS parsed with PostCSS.

No SQL or database changes. No full Next.js production build or direct test against Production was performed. Run a hard refresh after deployment and verify the on-device behavior in the live application.
