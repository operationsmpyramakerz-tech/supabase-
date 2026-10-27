# ERP — Phase 2Q3D: Operations Orders Whole-Order Mutation Validation

Base archive: `supabase--main-117.zip`. This is a focused API hardening patch, not a certification of all API endpoints.

## Findings and fixes

- **Partial archive / unarchive:** The Operations Orders API validated the submitted component IDs for scope, but the service archived/restored exactly those IDs without proving that the request contained **every component** in the saved order. A direct request with one ID from a multi-component order could create an inconsistent partial archive. Now Archive, Unarchive, and Delete all verify an exact complete set of component IDs from **one order number** before a mutation.
- **Stale or mixed selection:** Validation rejects IDs from multiple order numbers, incomplete/stale sets, duplicate saved IDs, missing records, and unavailable or truncated queries. The verification query has a `1001` limit, and results at or above the 1,000-row PostgREST boundary are rejected rather than trusted.
- **Oversized ID payloads:** The previous `cleanOperationsActionIds` silently sliced lists down to 1,000 IDs. Oversized requests now fail explicitly with HTTP 400, instead of modifying an unadvertised subset.
- **Write confirmation:** Archive and Unarchive now verify the number of rows returned by Supabase PATCH equals the selected count, just as Delete verifies its DELETE row count. Mismatches return HTTP 409 and require a refresh; an attempted mutation must not be retried blindly because some writes may have committed.

## Compatibility

- The user interface and access permissions are unchanged; `Operations Orders` sends `group.orderIds` for Archive / Unarchive / Delete already.
- No schema, SQL, migration, environment, or storage change is part of this patch.
- Actions on orders containing 1,000 or more components are intentionally rejected until they have a safe transactional/paginated implementation.

## Verification

- `node --test tests/*.test.mjs`: **355 passed, 0 failed**.
- `node --check` for changed JS and MJS modules: passed.
- Added deterministic tests for complete, partial, stale, mixed-number, duplicate, and >999-row sets. Updated two legacy source-shape tests to check the new shared validation and actual behavior.
- No Production Build, live Supabase mutation, or staging multi-user integration tests were performed.

## Deployment checks

1. In staging, create a multi-component Operations Order. Archive all components, restore it, and optionally delete a disposable order. Verify all rows receive the expected status.
2. Confirm that a direct API request containing only some component IDs fails with HTTP 409 and does not change their statuses.
3. Test explicitly denied, Own, Team, and All-scoped users; API authorization must prevent accessing an order outside the user's grant.
4. Test the regular lists and archive views after every action, and retry only after refreshing order data.

## Remaining security work

- **Race condition:** Preflight read and PostgREST PATCH/DELETE are separate transactions; a concurrent insert/change can still race the check. Closing this fully requires a database transaction or a locked RPC under verified server-side authorization and a tested rollout/rollback plan.
- **2Q3 follow-up:** Continue auditing remaining API endpoints, uploads, and exports with targeted access/scope tests. 2Q3A–D have not established full endpoint coverage.
- **2Q2 live:** Private Storage migration and bucket/RLS verification remain unconfirmed.
- **2Q4:** Multi-account staging tests against live RLS/feature grants remain required.
- **2Q5:** Production build, security preflight, staging deployment, and monitoring remain required.
- **Separate:** Legacy plaintext member passwords and name-based admin trust should be migrated safely.
