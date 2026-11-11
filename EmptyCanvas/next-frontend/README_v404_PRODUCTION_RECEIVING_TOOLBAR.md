# Production Receiving — v404

Built on the user-provided v403 repository. This is a UI-only update scoped to the Production Receiving stage.

## Changes

- On inline Edit, the **Received** caption is identical to its read-only appearance. Only the numeric value becomes a compact input; the row's background, border and layout remain stable. Save and Cancel remain icon-only actions on the same row.
- Replaced the always-visible full-width search field with a circular, header-style Search icon. Clicking it expands the search input; clicking again or pressing Escape closes it and clears the search. The input receives keyboard focus automatically when opened, and includes a clear-query action.
- Moved **Search, Receiving History, and Download** to the right of the existing status tabs, on the same horizontal toolbar. Search remains next to History and Download in collapsed state.
- The status tabs retain their black active style, keyboard behavior, existing permissions, and filters.
- On narrow screens, the tabs stay horizontally scrollable while the three actions remain on the right. The search input expands in a small popover beneath these controls so the actions do not wrap or leave the screen.
- Both light and dark themes covered. No API, quantity calculation, user permissions or database logic changed.

## Files

- `components/preparing/ProjectProductionIntake.jsx`
- `public/css/projects-preparing.css`
- `tests/projects-preparing-v404-intake-search-toolbar.test.mjs` (new)

## Validation

- Targeted v401–v404 tests: 16/16 passed.
- Projects Preparing test suite: 387/392 passed; the same five unrelated legacy tests were already failing in v403 (Testing/Warehouse/search tests).
- CSS parsed without syntax errors, and the tab/search layout was visually checked at desktop, tablet, and narrow-phone widths in a standalone browser harness. This is not a production app browser test.
- A complete Next.js build and live Production verification were not performed.

## Deployment

Replace only these files at their listed paths inside `EmptyCanvas/next-frontend/`, commit, and deploy. No SQL changes, new environment variables or dependencies are needed. Smoke test open/close Search, typing and clearing a query, History, Download, and inline Edit on both status tabs.
