# Phase 2Q4C — Production-only, low-risk permission audit (v124)

**Decision:** ERP operates on a single Production environment. No Staging will be created for this phase. We will not bypass Staging guardrails or certify untested destructive transactions.

## Delivered

- New opt-in `security:production-readonly` command. Sends five *unauthenticated GET* requests to fixed, protected endpoints: Operations Orders list, My Orders list, Expenses types, Stocktaking columns, Users Center directory.
- Requires HTTPS, exact hostname confirmation and an explicit production read-only acknowledgement. Does not send or read user cookies, passwords, API keys, Authorization tokens, response data or personal information.
- Does **not** modify any database row, file, account, permission, token, order or configuration. Never sends POST/PATCH/PUT/DELETE requests. Never follows redirects.
- Logs only check name, HTTP status and sanitized result, not response bodies, URLs or credentials.
- Status interpretation: 401/403 = PASS (anonymous denied). 200 = FAIL (anonymous allowed). All other statuses and network failures = BLOCKED (inconclusive), not a success.

## Run from GitHub Codespaces terminal, not Supabase SQL Editor

Run with the application folder as current working directory (`EmptyCanvas/next-frontend`). Set the following variables **only in the Codespaces terminal**:

```bash
export ERP_PRODUCTION_READONLY_BASE_URL='https://operation.propyramakerz.com/next'
export ERP_PRODUCTION_READONLY_EXPECTED_HOSTNAME='operation.propyramakerz.com'
export ERP_PRODUCTION_READONLY_CONSENT='I_CONFIRM_ANONYMOUS_PRODUCTION_READ_ONLY'
npm run security:production-readonly
```

The address is an example from the user's earlier screenshots. Check that it still corresponds exactly to the Production deployment before executing. **Do not paste session cookies or secrets into chat.** This command does not require them.

## Safe production-only continuation (no staging)

1. Ensure Production `ERP_ATOMIC_ORDER_MUTATIONS` is **disabled** until a controlled transactional test is formally approved. Redeploy/restart if needed for changes to take effect.
2. Confirm a recent recoverable database + storage backup *without* exposing backup contents, and test restore feasibility separately.
3. Run offline tests (`npm run security:test-multiuser`) and the anonymous production GET checks above.
4. Use normal existing user accounts to review *read-only* UI visibility and details access; do not change grants or impersonate employees to manufacture the test setup. Obtain permission from account owners; do not share session cookies or passwords.
5. Record any 200 on anonymous protected endpoints as an access-control incident. Any 3xx/404/429/5xx is inconclusive and needs diagnosis before declaring a pass.
6. Separate review of Production private-storage bucket access using metadata inspection only, no migration/cutover/deletion.
7. Do **not** run Archive/Unarchive/Delete/Update to test the atomic RPC on real orders. Because the RPC exists in Production but its transaction behavior was not tested live, that gate remains open. A controlled test transaction on explicitly approved throwaway records in the same environment would require a separate risk review and explicit approval; no such test is included here.

## Limits and open gates

- This anonymous audit proves only the five named endpoints deny unauthenticated GET access. It does **not** prove Own/Team/All, authentication resilience, account revocation or all 188 permissions.
- Atomic RPC verified installed / secure search path / service role grants via preceding SQL check; live transaction safety unverified, no automatic enablement.
- Live private-storage migration, legacy plaintext password remediation, other API surface, Production Build/runtime review remain to be completed.
