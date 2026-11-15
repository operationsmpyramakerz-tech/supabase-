# ERP Pyramakerz v414 — Users Center per-page Preferences

Based on the uploaded `supabase--main-128.zip` (its contents include the v413 project changes).

## Changes
- Replaced each View/Edit/Admin dropdown in Users Center > Page Access with an icon-only Preferences button.
- Removed the separate Advanced Feature Permissions entry.
- Added a compact, mobile-friendly page-scoped preferences modal.
- Base access (View/Edit/Admin) remains editable from each page's preferences modal.
- The modal displays detailed, enforced actions **only for the matching feature module**, using the existing grants and security model.
- Existing row-level Own/Team/All, Teams Visibility, opt-in module migrations, Preparing stage/tab granular switches and explicit deny markers are preserved.
- A page without a matching actively enforced module displays Base access instead of misleading unguarded actions.
- New users can configure Base access during creation; detailed grants require a saved member ID.
- No database schema/API changes. CSS version bumped to ensure the new UI loads after deployment.

## Save behavior (important)
- `Save Preferences`: applies the Base access level to the parent Page Access draft. Detailed grants (if changed) are persisted via the pre-existing protected `feature-access-save` action after admin verification.
- `Save Access`: persists Page Access levels and Enable toggles (including the chosen Base access). Both saves are necessary if both types of settings were changed.
- Enabling Advanced permissions for a previously legacy profile is a **global profile opt-in** and may affect other page grants; the modal warns before doing so.

## Testing
- Targeted Users Center & permissions suites: 62/62 passed.
- Full Node test suite: 1154 passed, 39 failed (1193 total); the 39 failing test titles exactly match the 39 existing failures in the uploaded original baseline (1148 passed/1187 total).
- JSX syntax checked with TypeScript parser.
- No full Next.js build or live Supabase/production verification was performed.

## Deployment
Replace modified files, deploy, refresh browser; no SQL migration required.
