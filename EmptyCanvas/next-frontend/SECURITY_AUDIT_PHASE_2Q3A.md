# ERP Permissions — Phase 2Q3A: API Security Audit

Base: `supabase--main-114.zip` (2026-10-26). This is a **focused hardening pass**, not a certification that every endpoint is secure.

## Scope and findings

The repository contains **170** `app/api/**/route.js` files. The review focused on operations and current-order mutations, expense mutation and receipt access, authenticated storage access, sensitive diagnostics, and authorization helper code. Many API handlers delegate their authorization to service modules and therefore cannot be classified by the presence/absence of a gate import alone.

### Fixed: order-wide destructive actions accepting a subset of IDs

`lib/current-orders-data.js` previously checked that the submitted IDs existed and (when scoped mode was enabled) belonged to the permitted scope; it did not compare those IDs to **all** saved components of the order. That could allow partial archive, unarchive, or delete by directly submitting a shortened `orderIds` array. The server now:

1. Requires a single valid order number for the selected rows.
2. Fetches all stored component IDs for that order and rejects incomplete/stale sets with HTTP 409.
3. Rejects results at the 1,000-row PostgREST boundary rather than trusting a potentially truncated list; large orders require a different paginated/transactional implementation.
4. Verifies allowed Own / Team / All scope as before, and checks that the number of deleted rows is exactly the expected number.
5. Rejects oversized input sets instead of silently truncating the caller's list.

The same PostgREST-limit fail-closed guard was strengthened for operations-order deletion. No order data was changed by this code-only review.

### Fixed: internal diagnostics exposure

`/api/system/session-diagnostics` and `/api/storage/direct-diagnostics` previously exposed configuration flags and/or internal counters to unaudited callers (the session endpoint was public). Both now require an authenticated **trusted legacy admin**. Generic `/api/health` and `/api/system/retirement-status` status endpoints remain available as originally designed; their privileged details continue to require admin access.

## Verification

- `node --test tests/*.test.mjs`: **342 passed / 0 failed**.
- `node --check` on the modified JavaScript modules and routes: passed.
- Added pure guard tests for normal, partial, duplicated, mixed-number, stale, and oversized component lists.
- Updated the existing Phase 29 order-action mock harness to include saved-row verification; added a regression case rejecting partial deletion.
- No SQL changes, live Supabase writes, Production Build, or staging multi-user integration tests were performed.

## Important remaining work

1. **2Q3B — Complete sensitive endpoint coverage:** continue manual checks across inventory/export/upload/delete routes, including record ownership and denial tests for every action and page; avoid interpreting a static import scan as proof of access control.
2. **Database consistency:** read-then-write validation is not atomic. Consider transactional RPCs with row locks for order-wide delete/archive to prevent concurrent changes between the check and write.
3. **Admin identity:** audit and pin the reserved legacy Admin account to immutable identifiers before deprecating name-based trust; take care not to break the original built-in Admin user.
4. **Password storage:** legacy plaintext member passwords need a staged password-hash migration, rollback plan, and compatibility tests.
5. **Private Storage:** production migration coverage (including receipts and avatars) remains unverified. See `STORAGE_MIGRATION_AUDIT_PHASE_2Q2.md`.
6. **2Q4:** test an admin, ordinary member, Own, Team, All, and explicitly denied profile against real staging Supabase.
7. **2Q5:** run Production Build, server environment/security preflight, and staging deployment checks.

## Deploy

Overlay the included changed files onto the repository at the same `EmptyCanvas/next-frontend/` paths. Keep existing environment variables and grant configuration. There is no SQL migration for Phase 2Q3A. Test archive / unarchive / delete on disposable staging orders, including multi-component orders, before deploying to production.
