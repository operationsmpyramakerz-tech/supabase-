# ERP — Phase 2Q3E: Expense Export Integrity & Trusted Install Links

Base archive: `supabase--main-118.zip`.

This patch covers two verified weaknesses in API input handling. It does NOT certify every API endpoint or close the outstanding Supabase transaction/migration concerns.

## Findings and fixes

### Expense report integrity (`POST /next/api/expenses/export-direct`)

- Previously, the endpoint mapped user-provided row IDs to authorized server-side rows but did not reject **duplicate** IDs. Repeating the same ID several times would duplicate the same valid expense row in the exported report and inflate its total, without changing the database.
- The endpoint also accepted the browser's `userName` and `userId` for the PDF/Excel report header, permitting misleading report titles and identity details.
- Now it checks each selected ID is authorized, rejects duplicates with HTTP 400, and passes only server-authorized row values to the renderer. Server-side expense row identity is used for report headings. For legacy records with no row identity, the account or canonical verified lookup ID provides a fallback.
- Previously supported output formats (PDF, Excel) and row selection ordering are preserved.

### App install links (`GET /next/api/system/app-download-links`)

- Previously, `X-Forwarded-Host`, `X-Forwarded-Proto`, or `Host` request headers could influence absolute PWA install links. Misconfigured proxies could pass attacker-controlled values into a JSON response shared with users.
- Now absolute PWA/manifest links use **only** validated `ERP_PUBLIC_URL` (for example `https://erp.example.com`). If it is not configured or invalid, the API returns safe relative `/next/...` links, resolved by the client's current origin. Explicit Android/Windows links from their own configured environment variables remain unchanged.

## Files changed

- `app/api/expenses/export-direct/route.js`
- `lib/expense-export-input-policy.mjs` (new)
- `app/api/system/app-download-links/route.js`
- `lib/app-public-origin.mjs` (new)
- `tests/security-phase2q3e-export-install-links.test.mjs` (new)
- `tests/permissions-phase2g-regression.test.mjs` (updated existing test assertion)
- `SECURITY_AUDIT_PHASE_2Q3E.md` (this report)

## Verification

- `node --test tests/*.test.mjs`: 362 passed / 0 failed.
- `node --check` on modified JS and MJS files: pass.
- Tested duplicate, unknown, oversized, and forged expense input; canonical report identity; safe install link origin; API wiring.
- No npm `next build`, live Supabase test, actual PDF generation in the production environment, or live multi-user staging test was performed. No SQL or data migration was executed.

## Deployment checks

1. Deploy changed files to a staging build; check `ERP_PUBLIC_URL` if the application requires **absolute** PWA install URLs. The origin should be a full HTTP(S) URL without a path/query/credentials. If unset, relative links should remain functional in the ERP website.
2. Export a PDF and Excel report from both `Expenses` and `Expenses Users` and confirm the employee name, ID, rows, totals, and PDF receipts are correct.
3. Submit a duplicate-ID expense export and confirm HTTP 400, without generating a misleading file. A forged employee name should not affect the document header.
4. Exercise the app-install page behind the company reverse proxy; sending a forged forwarded host must not alter PWA URLs.

## Remaining plan

- Phase 2Q3: audit remaining endpoints and transaction consistency; use a server-side database transaction/RPC for whole-order atomic archive/unarchive/delete after carefully reviewing and testing SQL migrations.
- Phase 2Q2 live: confirm all private storage buckets, ownership policies and old link migration on actual Supabase.
- Phase 2Q4: run deny/Own/Team/All permission tests with separate staging accounts.
- Phase 2Q5: run Production Build, security preflight, staging rollout and production readiness review.
- Independent urgent modernization: migrate legacy plaintext member passwords and name-based Admin trust via a planned backward-compatible rollout.
