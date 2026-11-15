# ERP Pyramakerz v416 — Project Preparing compact responsive UI

Source: uploaded `supabase--main.zip` (2026-11-15). This is a frontend-only update.

## Project Preparing index / overview
- Remove the decorative `Projects Workflow` banner at the project list.
- Remove the redundant count label (`1 project` / `N projects`) beneath project filter tabs; project statistic cards and filters are unaffected.
- Remove the two informational subtitles underneath `Project Overview` and `Overall Progress` headings. Keep the headings, KPI values, progress calculations and detailed dashboard intact.

## All six stages (shared CSS)
- Reduce spacing and vertical whitespace in Stage Sign-off, especially on mobile; its button and closure record continue to work as before.
- Reduce the tab bar and icon-button dimensions while keeping horizontal tab scrolling on narrow screens.
- Keep Search, History, Download (and stage-specific Label / Legacy actions) on one toolbar row.
- Anchor Search to its closed position: when opened, the pill expands leftward **over the tab strip** instead of wrapping beneath it. The Search icon does not move while the field opens.
- Keep the original search state handlers, single custom clear button, permissions and data-editing logic unchanged.

## Files
- `components/preparing/PreparingClient.jsx`
- `public/css/projects-preparing.css`
- `app/projects-preparing/page.jsx` (stylesheet cache-busting)
- `tests/projects-preparing-v416-compact-mobile-toolbar.test.mjs`

## Verification
- New regression tests: 7 / 7 passed.
- Prior targeted stage UI regression tests: 43 / 43 passed.
- Full test suite: 1167 / 1206 passed; exactly the same 39 tests failed as the unmodified upload, no new regressions.
- Responsive-search DOM/CSS smoke test using headless Chromium at viewport widths 360px, 390px, 768px and 1200px: opening search kept icon x/y stable and search pill inside viewport.
- No SQL or DB changes. No full Next.js production build or connected production-server test was performed.

Rollout: deploy UI files, then hard-refresh the Project Preparing page on the device. Verify opening/closing Search and stage sign-off on real mobile devices before promoting more widely.
