# Production Receiving — v403

Based on v402. This package changes only the Production Receiving UI and its focused regression tests.

## Changes
- Removed the `Projects Preparing › project › Production Receiving` breadcrumb above the title.
- Removed the subtitle under `Production Receiving`.
- Product image thumbnails open a large, centered, white modal with a dark backdrop, matching the Shopping Cart image preview. Image navigation works for products with multiple images. The portal is rendered at `document.body` so the parent stage window does not clip it.
- **Received** tab now displays `Required` followed by `Received` (without `Remaining`).
- **Remaining to Receive** tab now displays `Remaining` followed by `Received` (without `Required`).
- **All Components** retains `Required`, `Received`, `Remaining` and remains read-only.
- Inline editing stays in-row on the actionable tabs, respecting the existing stage and tab permissions.

## Deploy
1. Copy the included files into the repository at the same relative paths.
2. Commit and deploy normally.
3. Hard-refresh the page if old styles are cached.

No SQL changes or new packages required. The only edited production files are `components/preparing/ProjectProductionIntake.jsx` and `public/css/projects-preparing.css`.

## Tests
`node --test tests/projects-preparing-v401-intake-layout.test.mjs tests/projects-preparing-v402-intake-inline-edit.test.mjs tests/projects-preparing-v403-intake-photo-tabs.test.mjs`

11/11 targeted tests passed. A wider run of `tests/projects-preparing*.test.mjs` reported 382/387 passing; the five failures are in legacy production/testing/warehouse/search tests unrelated to the modified Production Receiving UI. A full Next.js build / production browser test was not run.
