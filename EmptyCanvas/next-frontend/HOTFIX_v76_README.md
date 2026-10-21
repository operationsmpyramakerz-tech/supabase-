# ERP Advanced Permissions — Hotfix v76

**Base archive:** `supabase--main-76.zip` (changes relative to `EmptyCanvas/next-frontend/`).

## Symptoms addressed

1. Home and Request Products show the same Next.js server-render failure after Advanced Permissions are enabled.
2. Products suddenly shows "Your account does not have access" when an admin only intended to enable Expenses by Users.

## Technical changes

- `lib/feature-permissions-server.js` now builds the `grants` map with a standard `{}` prototype via `lib/feature-grants-transfer.mjs`, rather than `Object.create(null)`. The prior null-prototype object was passed through Server Component props to the client, which is not a supported React Server Components value.
- `lib/feature-permissions-registry.js` adds explicit legacy opt-out markers for the two original always-enforced Phase 2A modules: `products.__legacy` and `orders.operations.__legacy`. These markers are intentionally **not** auto-assigned to existing advanced accounts because a missing grant might be an intentional revocation. Legacy opt-out cannot override ordinary Page Access or a route's other authorization requirements.
- `components/users-center/UsersCenterDialogs.jsx` provides independent toggles for Products and Operations Orders, default OFF for new Advanced profiles. Saving OFF stores a legacy marker. The existing Expenses by Users feature/scopes are preserved.
- Includes new regression tests and restores the missing *reference copy* of the already-existing Phase 2L SQL used by tests. This hotfix requires **no new Supabase SQL**.

## Deployment

1. Back up the current GitHub version and database.
2. Extract the ZIP into `EmptyCanvas/next-frontend/` inside the repository, preserving paths. The ZIP is **only changed files**.
3. Deploy/restart the Next.js server to clear old cached RSC output and feature snapshots.
4. **Existing affected account:** go to Users Center → Page Access → Advanced Feature Permissions. Leave `Use Advanced Permissions` ON and `Expenses by Users` ON. Turn **Products OFF** and **Operations Orders OFF** only if those modules should continue to use their existing Page Access settings. Save Features. This is a deliberate, one-time authorization change and must be done by an authorized administrator; it does **not** grant a page that Page Access denies.
5. Sign out / sign back in or hard refresh the affected user, then test Home, Products, Request Products, Expenses by Users. Ensure the account has Page Access for each page expected to open.
6. Test with two users: one with Products explicitly denied, one with Products Page Access granted and the new Products toggle OFF. The first must remain denied; the second should open the page.

## Validation

- `node --test tests/*.test.mjs`: **124/124 pass**.
- `node --check` on changed JS and test files: pass.
- JSX code checked structurally, but a full Next.js production build and a live Supabase/production test were **not performed**; production configuration and the screenshot's original server log are unavailable.
- If server-render failures remain after deployment, use the deployment/server logs and the error digest `3480293561` (shown in the screenshots) to identify the next failure. Do not work around this by bypassing feature checks.

## Rollback

Revert the changed files as one commit and redeploy. SQL is unchanged. Permission markers already saved in Supabase do not change the database schema; the old code would ignore them, so prefer rolling back both app changes and affected account settings together if necessary.
