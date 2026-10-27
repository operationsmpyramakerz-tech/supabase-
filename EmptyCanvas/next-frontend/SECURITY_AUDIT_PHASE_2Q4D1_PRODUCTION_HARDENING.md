# Phase 2Q4D.1 — Production Authenticated Scope Probe Hardening (v208)

## Status
- Source audit tool hardened; no live Production account sessions were used.
- Full test suite: 410 / 410 passed using Node 22.
- No Next.js Production Build was performed (dependencies not installed here).
- No API routes, user permission grants, order records, SQL or Vercel environment variables were changed.

## Fixes
1. **Pinned credential destination:** the production authenticated scope probe accepts only the reviewed `https://operation.propyramakerz.com/next` URL. Matching operator-controlled hostname fields are no longer sufficient to authorize an arbitrary destination for session cookies. Redirects are never followed.
2. **Bounded streamed responses:** enforce a post-decompression 2 MB response-body ceiling, even when `Content-Length` is missing; invalid or oversized JSON cannot produce a false PASS.
3. **Safe CLI preparation:** `--help` and `--check-config` are offline. The latter validates only consent, destination and three existing order numbers; no cookies are read, no requests are sent.
4. **Regression tests:** malicious lookalike hosts, oversized responses, streaming valid responses, and offline CLI modes are tested.

## Safe next steps on the same Production system (no Staging)
1. Upload the four existing/new files from the ZIP to their exact paths on GitHub, then pull into Codespaces.
2. In `EmptyCanvas/next-frontend`, run `npm run security:production-auth-scope -- --help` (no environment variables required, no network).
3. Identify three pre-existing orders representing actual Own, Team and Outside cases; **do not** edit any order for test setup. Set the nonsecret production URL, expected hostname, references and consent as documented in `SECURITY_AUDIT_PHASE_2Q4D_PRODUCTION_AUTH_SCOPE.md`.
4. Run `npm run security:production-auth-scope -- --check-config`. `PASS` only confirms these inputs are correctly formatted; it is **not** a permissions test.
5. The full authenticated probe requires four distinct, explicitly authorized accounts (Denied, Own, Team, All) with their real permissions and relationships already configured. If those conditions are not already met, **do not run** the full matrix. Do not acquire other employees' cookies without authorization, change any employee's grants, or paste session values into chat or screenshots.
6. Keep `ERP_ATOMIC_ORDER_MUTATIONS=disabled` for Production until the transactional operations can be validated safely. Live private-storage migration, authenticated role testing and final Production acceptance are still outstanding.

## Limitations
The audit does not inspect or change Production records. Source-code tests do not prove live authorization works. The full authenticated scope audit was NOT run against Production as part of this patch. Host pinning is intentional; if the official Production URL changes, review the source before running a cookie-bearing test.
