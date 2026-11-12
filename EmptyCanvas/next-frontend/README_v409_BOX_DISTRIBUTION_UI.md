# v409 — Stage 5 Box Distribution UI parity

Source: the user's uploaded `supabase--main-406.zip` (its internal files already contain Stage 4 v408 changes).

## Implemented
- Independent Stage 5 layout with the same compact heading, black Project Progress bar and Stage Sign-off row used by Stages 1–4.
- Progress shows actual packed physical quantities / total project required quantities, clamped 0–100%; data refreshed after successful packing or label changes.
- Same horizontal status tabs (All Components, Remaining to Pack, Packed) and global-style expandable search with one custom X.
- Toolbar controls for Boxes Label, Box History and scoped CSV/PDF download, maintained alongside stage tabs.
- Solid color Kit folders with thumbnails, product code, Operations Received, Packed, Remaining, packing-actor initials when available, and compact edit icon.
- Existing **SchoolEqualPackingEditor** remains the ONLY per-component packing editor. It still calls `pack_schools` as a single atomic server operation for equal whole-number distribution across school labels.
- Existing Boxes Label generation, manifest verification, locks, rename/delete, modal keyboard behavior, history and role/tab permissions retained.
- Product photos are fetched through read-only presentation enrichment for both authorized views; Box Distribution never receives private operations handoff history or receiver profile photos.
- Project stylesheet cache key advanced to v409.

## Changed files
- `components/preparing/ProjectProductionReceiving.jsx`
- `components/preparing/ProjectBoxDistribution.jsx`
- `lib/preparing-production-presentation.js`
- `app/api/projects-preparing/production/route.js`
- `public/css/projects-preparing.css`
- `app/projects-preparing/page.jsx`
- UI tests in `tests/projects-preparing-v409-box-distribution-ui.test.mjs`, `tests/projects-preparing-v408-operations-stage-ui.test.mjs`, `tests/projects-preparing-v285-box-distribution-parity.test.mjs`, `tests/projects-preparing-v287-boxes-label-panel.test.mjs`

## Checks
- Targeted v409 + existing packing/Stage 4 suite: **35/35 passing**.
- Broader Projects Preparing test collection: **390/421 passing**. The 31 failures are legacy structural assertions from previously redesigned screens, including old box KPI/toolbar expectations. No sign that the preserved `pack_schools` contract, label actions or quantity visibility rules failed.
- TypeScript JSX/JS parsing and PostCSS parsing passed.
- No full Next.js build or live production test was performed; package dependencies are not installed in this archive's environment.

## Deploy
Copy the modified production files into the matching paths in the repo or replace with the full archive; redeploy as usual. No SQL migrations are needed.
