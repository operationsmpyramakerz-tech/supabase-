# ERP — Phase 2Q3C: API File / Export Security Hardening

Base: `supabase--main-116.zip` (2026-10-26). This is another scoped review, **not** proof that all 170 API routes are secure and not a production certification.

## Completed in this phase

1. **Products image proxy: removed elevated credential forwarding.** `getSupabaseConfig()` can select `SUPABASE_SERVICE_ROLE_KEY`; the image proxy previously forwarded it in `Authorization` and `apikey` headers to user-configurable product-image URLs on the Supabase Storage origin. That inadvertently allowed a Products viewer to have the backend request Storage files with stronger credentials than their own. Neither the route nor the shared fetch helper now sends service credentials, cookies, or proxy authorization headers. Public product images and previously signed URLs remain supported. Images that genuinely require a privileged Storage service key will no longer load through this endpoint; implement an explicitly authorized private-image flow instead of re-adding key forwarding.
2. **Task Management legacy inline attachment uploads: bounded, strict decoding.** The prior route decoded arbitrary Base64 input via Node before enforcing the 10 MB size limit. A pure validation helper now checks valid Data URL syntax, MIME token syntax, encoded length, alphabet, padding and exact decoded length before allocating the decoded buffer. The 10 MB limit and normal PDF/image/general attachment support remain unchanged. This does not replace edge-layer HTTP body-size limits; the JSON body is still parsed by Next.js before this decoder is invoked.
3. **Backup CSV spreadsheet formula hardening.** CSV cells beginning with a spreadsheet formula marker after whitespace, control characters or BOM are escaped before CSV quoting. The prior export caught the leading marker only when it was the first character. The CSV field layout and import database contents were not changed.

## Verification

- `node --test tests/*.test.mjs`: **351 passed, 0 failed** (346 prior + 5 new tests).
- New tests check size-boundary and malformed uploads, CSV formula escaping, and a real local HTTP server asserting that the product proxy does not forward an injected `Authorization`, `apikey` or `Cookie` header even for a configured Storage origin.
- `node --check` on all modified/new JS/MJS files: passed.
- No Production Build (dependencies not installed), staging Supabase test, environment inspection, real user actions or SQL changes were done.

## Deployment checks

- Test a publicly accessible Products image and a product whose image is a signed URL; any image that relied on implicit service-role access now requires an explicit authorized flow.
- Test Task Management uploading files near 10 MB, small images, PDFs and attachments from older browsers; noncanonical/malformed Base64 is now intentionally rejected.
- Test Backup CSV export/open for product and member names, multiline text and negative numeric fields.
- Test with at least admin, Own, Team, All, and explicitly denied accounts on staging.

## Open risks / remainder

- **Phase 2Q3, continued:** More routes still need focused ownership/scope and high-volume mutation tests. Read-then-write checks on multi-component order archive/delete are not a database transaction; atomic RPC/transaction remains an open migration.
- **Phase 2Q2 live:** Verify Storage bucket ACLs and record-association RPCs, then plan migration of legacy public receipts/files. No live migration has run from this patch.
- **Phase 2Q4:** Multi-account permission matrix on staging.
- **Phase 2Q5:** Production build, `npm run security:preflight`, staged deployment and monitoring.
- **Separate:** Plan password-hash migration from legacy plaintext password fields and replace name-based privileged account assumptions with immutable IDs.

Overlay only the changed files at their existing project paths. No SQL is required for these changes.
