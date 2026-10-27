# Phase 2Q4B — Read-only Staging Permission Probes (v123)

**Scope:** Add a black-box Staging checker for server-enforced permissions. No production user passwords, real user information, database mutations, or Supabase keys are included.

## What's delivered

- `lib/staging-permissions-probe.mjs`: twelve checks for four test identities (Denied, Own, Team, All), including anonymous access, direct order details, scope boundaries and list routes.
- `scripts/security-staging-readonly.mjs`: standalone Node CLI, no packages required, reports only check names, HTTP codes and sanitized reasons.
- `tests/security-phase2q4b-staging-probe.test.mjs`: tests the staging guard, allow/deny statuses, privacy, absent data, network failure and approved read-only routes using an in-memory fake. These are **offline tests**, not proof of live permission enforcement.
- `npm run security:staging-readonly`: opt-in live Staging check, never invoked automatically by `npm test`, `npm run build` or deployment.

## Mandatory Staging setup

**The Staging app, Supabase database, cookies, and order component IDs must be isolated from production.** Do not try these tests on production just because they are read-only. Staging accounts must have access to the appropriate pages as well as feature grants. Prepare three disposable *components* with different owner IDs; IDs must be the raw component database IDs, **not** the human-readable `ORD-123` codes:

1. `OWN`: owned by the Own test user; Team test user has the OWN owner's ID explicitly linked as a team member.
2. `TEAM`: owned by a different employee whose ID is explicitly linked to the Team test user.
3. `OUTSIDE`: owned by neither the Own test user nor anybody linked to Team test user.

Configure test profiles via Users Center: `DENIED` explicitly denies `orders.operations.view`; `OWN` has `orders.operations.view` and `orders.operations.details` scoped Own; `TEAM` grants the same two with Team scope and a saved team link; `ALL` grants both with All scope. `orders.operations.__scoped` must be enabled for Own and Team profiles. Advanced permissions must be enabled and saved at the database level; users must use **four distinct Staging sessions**.

Do not commit secrets or copy session cookies into GitHub issues, chat, or test reports. Set the following environment variables privately in a local Staging shell (example values are placeholders; never use these literal cookie values):

```bash
export ERP_STAGING_BASE_URL='https://staging.example.test/next'
export ERP_STAGING_EXPECTED_HOSTNAME='staging.example.test'
export ERP_STAGING_COMPONENT_OWN='raw-component-id-own'
export ERP_STAGING_COMPONENT_TEAM='raw-component-id-linked-colleague'
export ERP_STAGING_COMPONENT_OUTSIDE='raw-component-id-outsider'
export ERP_STAGING_COOKIE_DENIED='erp_session=<staging-only-cookie>'
export ERP_STAGING_COOKIE_OWN='erp_session=<staging-only-cookie>'
export ERP_STAGING_COOKIE_TEAM='erp_session=<staging-only-cookie>'
export ERP_STAGING_COOKIE_ALL='erp_session=<staging-only-cookie>'
export ERP_STAGING_PROBE_CONSENT='I_CONFIRM_ISOLATED_STAGING'
npm run security:staging-readonly
```

Use the actual cookie name and value from each authorized Staging browser session, as needed. The runner does **not** request passwords or login and it does not store any cookie in a file. If your session requires several cookies, provide the complete `Cookie` header value. Ensure cookies are not logged by shell tooling. **Never run this in an untrusted terminal.**

The guard requires HTTPS, an explicitly confirmed staging hostname, four distinct cookies, three distinct component IDs and a manual Staging confirmation. If the environment also has `ERP_PUBLIC_URL` and it matches the Staging origin, the script refuses to run. This is a safety guard, not a substitute for confirming infrastructure isolation.

## Meaning of results

- **PASS**: HTTP response has the expected auth status (200 for permitted, 401/403/404 for rejected) and every authorized order-detail response contains the exact requested component ID.
- **FAIL**: unexpected response, cross-scope success, blank permitted response, or redirected request. Treat any forbidden 200 as a release blocker.
- **BLOCKED**: request could not be completed (TLS/network/timeout). No assumption about authorization.

Only **GET page summaries** and **POST details-direct** (read-only handler) are called. Requests use `redirect: 'manual'` to avoid leaking cookies via redirection. No image, receipt or data is output. The script deliberately does **not** run Archive, Unarchive, Delete, receipt uploads, password changes, grant changes, or SQL.

The real-account matrix in `SECURITY_AUDIT_PHASE_2Q4A.md` S01–S22 must still be completed manually on Staging. Especially **S17** live revocations, **S18–S22** Atomic Orders transactions/concurrency and all mutations cannot be certified by this non-destructive runner. Keep `ERP_ATOMIC_ORDER_MUTATIONS` disabled on Production until atomic RPC tests have been verified on Staging.

## Remaining release gates

- **2Q4B** black-box tooling delivered; results on user's isolated Staging environment still pending.
- **2Q3F** RPC installed and function grants/search path checked in Supabase, but live transaction/rollback testing still pending.
- **2Q2** live private-storage migration and access-policy audit pending.
- **2Q5** Production Build, user journeys, runtime security and deployment verification pending.
- Separate planned work: legacy plaintext-password migration, hardening of legacy Admin identity, and transaction-safe business mutations beyond the Atomic Orders pilot.
