# Projects Preparing — Sidebar & Advanced Permissions Fix (v212)

## Based on
`supabase--main-211.zip` (27 October 2026).

## Why the item may be absent
Two independent gates protect Projects Preparing:
1. Users Center > Page Access > Projects Preparing must be **enabled** for the user.
2. For users with **Use Advanced Permissions = ON**, `preparing.view` must be explicitly **allowed**. An enabled Page Access row does not override a missing or denied Feature View grant.

Additionally, the original sidebar item was below Kits in the scrolling sidebar, which can fall below the visible tablet viewport. And the Advanced Permissions editor did not initialize Preparing as an active strictly-gated module, showing a misleading legacy status.

## Files changed
- `lib/navigation-config.js` — move Preparing immediately under Operations Orders, near the top, in both navigation sources.
- `components/AppShell.jsx` — distinct folder/check icon.
- `components/users-center/UsersCenterDialogs.jsx` — always show the strictly feature-gated Preparing module in an Advanced profile, persist/display its View state and give accurate Page Access guidance.
- `tests/permissions-phase2-regression.test.mjs` — remove stale hard-coded feature count (new Preparing keys increased the count from 188 to 192).
- `tests/projects-preparing-sidebar-v212.test.mjs` — tests for sidebar ordering and dual authorization gates.

## Safe production steps
1. Back up the code/repository revision, then merge the changed files into their existing paths, preserving the `EmptyCanvas/next-frontend` folder structure. Do not replace the entire project with this small patch.
2. Deploy the same Next.js production app used for `supabase--main-211.zip`.
3. **No new SQL or database schema changes are needed.** Do not re-run Phase 1 SQL for this patch.
4. In Users Center open the target user > Page Access and verify `Projects Preparing` is enabled; save if needed.
5. If this user uses Advanced Permissions: in the same member's Page Access screen open **Advanced Feature Permissions**. Search for `Projects Preparing` or choose it in Module. Make sure **Use Advanced Permissions** is ON and turn ON **View preparing projects** (`preparing.view`). Turn on Create, Manage or Update stage only as needed. Save Features.
6. Refresh or sign out and sign in again if the sidebar continues to show cached navigation (auth/page-access cache can briefly lag). The entry should now be near `Operations Orders` with a folder-check icon.
7. Open `/next/projects-preparing` to confirm the route renders for that member. Without both gates, the route intentionally remains restricted.

## Validation
- 46 passing Node tests: phase 1 preparing, new sidebar tests, plus permission suites phase 2–2F.
- TypeScript parser checked modified JS/JSX syntax.
- No live Supabase access, login, full Next.js production build or browser smoke test was performed here.
- This patch does not modify existing proposals, schools, orders, or preparing data.
