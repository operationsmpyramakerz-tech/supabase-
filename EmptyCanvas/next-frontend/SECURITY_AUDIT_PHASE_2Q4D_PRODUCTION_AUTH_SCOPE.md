# Phase 2Q4D — Authenticated Production GET-only permission audit (v207)

## Goal and limits

Continue the ERP permission audit **without Staging** and without changes to Production records. This adds an **opt-in command** that issues only `GET` requests against the existing `auth/session-status` and `orders/requested/paged-summary` endpoints. No SQL changes, permissions changes, creation, login, archive, deletion or uploads. The app's running APIs are not modified by this phase.

The previous 2Q4C live production test passed 5/5 anonymous protections, as reported by the operator; that does not establish authenticated data scope. This phase adds an optional *authenticated* Own / Team / All and explicit-denial comparison **only if four authorized existing accounts already have appropriate grants and relationships**. It must not be used to impersonate personnel or to request their passwords/cookies. If such sessions are not available with authorization, **skip the live matrix** and leave the gate open. Never alter current employees' grants solely to satisfy the test.

## Checks

The tool validates four distinct logged-in session identities through `/api/auth/session-status` and then checks:

- Anonymous access denied to the Operations Orders summary.
- A real user explicitly denied `orders.operations.view` receives HTTP 403.
- An authorized All user can find each of three preexisting reference orders, so missing records cannot yield false security passes.
- Own user can see OWN and cannot see TEAM or OUTSIDE.
- Team user can see OWN and TEAM (using actual existing team links) and cannot see OUTSIDE.

Use **three existing ORDER NUMBERS** in the form `117` (not `ORD-117` and not the component database UUID). Orders may contain multiple components; choose ones with consistent ownership and appropriate team relationships. Never edit orders for this audit.

The requirements for the four user profiles **must already be met** before running: `DENIED` explicitly denies `orders.operations.view`; `OWN` has `orders.operations.view` scope Own; `TEAM` has View scope Team and a saved link to the owner of OWN and TEAM; `ALL` has View scope All. The feature profile must be *enforced*, the module's `orders.operations.__scoped` marker enabled for Own and Team. The All session must see all three referenced orders through the real application. Ensure OWN and TEAM have permission to access the Operations Orders page. Four distinct accounts are necessary, not four tabs of one account.

## Safe local workflow (GitHub Codespaces)

**DO NOT RUN** until the operator has authorization from account owners to use these sessions. Do not use employee credentials without consent. Only prepare non-sensitive variables first in `EmptyCanvas/next-frontend`:

```bash
export ERP_PROD_SCOPE_BASE_URL='https://operation.propyramakerz.com/next'
export ERP_PROD_SCOPE_EXPECTED_HOSTNAME='operation.propyramakerz.com'
export ERP_PROD_SCOPE_ORDER_OWN='11'      # REPLACE with verified OWN order number
export ERP_PROD_SCOPE_ORDER_TEAM='22'     # REPLACE with verified TEAM order number
export ERP_PROD_SCOPE_ORDER_OUTSIDE='33'  # REPLACE with verified OUTSIDE order number
export ERP_PROD_SCOPE_CONSENT='I_CONFIRM_AUTHENTICATED_PRODUCTION_GET_ONLY'
```

Use the *current production hostname*, not an assumed copy. Above order numbers are placeholders. To avoid putting cookies in shell history, enter them via **silent terminal prompts**, one by one, in a private and trusted Codespaces terminal. The text you type is not echoed:

```bash
read -r -s -p 'DENIED session Cookie header: ' ERP_PROD_SCOPE_COOKIE_DENIED; echo
read -r -s -p 'OWN session Cookie header: ' ERP_PROD_SCOPE_COOKIE_OWN; echo
read -r -s -p 'TEAM session Cookie header: ' ERP_PROD_SCOPE_COOKIE_TEAM; echo
read -r -s -p 'ALL session Cookie header: ' ERP_PROD_SCOPE_COOKIE_ALL; echo
export ERP_PROD_SCOPE_COOKIE_DENIED ERP_PROD_SCOPE_COOKIE_OWN ERP_PROD_SCOPE_COOKIE_TEAM ERP_PROD_SCOPE_COOKIE_ALL
npm run security:production-auth-scope
unset ERP_PROD_SCOPE_COOKIE_DENIED ERP_PROD_SCOPE_COOKIE_OWN ERP_PROD_SCOPE_COOKIE_TEAM ERP_PROD_SCOPE_COOKIE_ALL
```

Use the complete Cookie header value from an authorized authenticated session. **Do not send any cookie/session token to ChatGPT, a screenshot, GitHub issues or the repository.** Never commit cookies or store them in `.env`, package scripts or ZIP. Prefer a dedicated trusted development environment; Codespaces environment holders can access process variables, so confirm all session owners approve the test.

The CLI accepts strictly HTTPS, exact hostname, three unique numeric order numbers, four distinct cookies, and an explicit consent phrase **before** any requests. It never follows redirects or logs identities, response bodies, rows, credentials or order identifiers. It performs no writes and requires no production environment variable changes or redeploy; this is a local dev-only audit tool.

## Interpret results

- `PASS`: expected refusal (403 or a verified empty filtered list), or expected visibility after the All-account record canary.
- `FAIL`: unexpected success (e.g. OWN sees OUTSIDE), denied user sees the list, or expected allowed record missing from an otherwise verified filtered list.
- `BLOCKED`: invalid/duplicate/expired session, unavailable endpoint, invalid JSON, missing reference order, network error, or unexpected status. **Never** count blocked as pass.

Output is only check names, HTTP codes, and sanitized reasons. A given account may not legitimately have the configured scope; a FAIL should trigger manual policy/fixture validation before labeling it an exploit.

## What is NOT validated

This audit does **not** test other 188 permissions, fine-grained details access, write access, image/receipt URLs, revocation propagation, live Atomic Orders behavior, SQL permissions, or all Production API endpoints. It cannot prove object-level authorization for direct detail endpoints, which currently use read-only POST, because this phase explicitly never makes POST requests against Production. It does not run automatically during deployment. The 2Q3F transactional mutation feature must remain **disabled** until safely validated. The live Storage migration and final production audit are still open.
