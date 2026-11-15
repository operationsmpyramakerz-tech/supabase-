# ERP Pyramakerz v415 — Direct Detailed Permissions

Source: the user's uploaded `supabase--main.zip` (already includes v414 Users Center preferences).

## User-interface change

- Users Center > Page Access retains the per-page Preferences icon and the page's Enable toggle.
- Opening Preferences now shows **Detailed permissions** immediately, with every audited action belonging to the selected page's module.
- Removed the Base access View/Edit/Admin section and the separate legacy/advanced opt-in controls from the per-page dialog.
- Saved Advanced profiles display their existing action grants and scopes. Legacy profiles display an **initial compatibility preview** based on that page's existing enabled state and level, not a claim that granular grants have already been stored.
- New members (no member ID yet) and administrators without Feature Access authority see read-only action descriptions; they cannot silently assign grants. Newly created accounts default to View in Page Access when a page is enabled; configure granular rights after creating their account.
- When the feature service is unavailable, actions are displayed read-only and Save Preferences is disabled.

## Existing permissions are protected

1. Opening or closing Preferences never updates permissions, enables Advanced mode, or sends a mutation.
2. Save Preferences remains disabled until a real change. The existing protected `feature-access-save` endpoint and administrative verification are retained.
3. For a legacy user, changing and explicitly saving one page's detailed action enables granular enforcement for **that user's selected module**, not an automatic global conversion of all user accounts.
4. Unedited opt-in modules remain on their legacy Page Access path. Old Products/Operations legacy markers are retained. The special Projects Preparing module is seeded from the user's existing Page Access so its required `preparing.view`, stage updates, and warehouse actions are not silently removed when another page is migrated.
5. For a newly migrated legacy user, default-allowed personal/shared-service grants in **unrelated** modules are *not* converted to unconditional ALLOW rows. This prevents unintentionally broadening access when the profile changes mode.
6. The new permanent Operations Orders delete action is **never inherited** from legacy page access. Granular Preparing and Shopping source flags also stay opt-in.
7. Page Access, Enable toggles, data scopes, and server-side authorization checks are not redefined by this UI update. There are no SQL updates or bulk user-account changes.

**Operational caution:** The initial compatibility preview estimates the legacy page's read/edit capabilities; any customized, feature-specific legacy restrictions may not map 1:1. On the FIRST deliberate Save Preferences for a legacy user, review the action list and the admin confirmation before saving. Verify access with one test user before migrating many profiles on Production. Page Enable changes must still be saved with **Save Access**.

## Files

- `components/users-center/UsersCenterDialogs.jsx`
- `lib/users-center-legacy-permission-preview.mjs` (new, pure helpers)
- `app/users-center/page.jsx` (CSS cache query updated)
- `tests/users-center-per-page-preferences-v414.test.mjs` (updated expectations)
- `tests/users-center-direct-detailed-v415.test.mjs` (new regression tests)

## Verification

- Targeted v414/v415 tests: 12/12 pass.
- Full `node --test tests/*.test.mjs`: **1160 pass, 39 fail, 1199 total**.
- Compared failure names with the untouched uploaded baseline: **same 39**; **0 new failures**.
- JSX parsed with TypeScript parser. No full Next.js build (dependencies not installed in test environment) and no live Production / Supabase test performed.
- No SQL migration required.
