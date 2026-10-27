# ERP Security & Deployment Audit — Phase 2Q1 (v109)

## Implemented

- Removed the **known hardcoded fallback** used to sign session cookies and Events / Shopping Cart authorization tokens.
- Centralized session/action signing in `lib/session-signing-secret.mjs`.
- In production, missing/default `SESSION_SECRET` blocks startup with a clear, non-secret-bearing configuration error. Development uses a **random per-process**, not hardcoded, key.
- Added read-only `npm run security:preflight`: validates session signing, Redis sessions, Supabase service credentials for advanced permissions, and private Storage rollout switches. This command **does not write to Supabase**.
- Added regression tests for signing and deployment configuration.

## Deployment steps — required

1. Verify the **existing** `SESSION_SECRET` is set in the ERP **Next.js runtime environment** before deploying these files. Use the same value on all production server instances. **Do not change an existing valid value unnecessarily**, because it would sign out current users and invalidate short-lived action tokens.
2. If missing, set a long random value. Example command to generate locally: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Add it to the server's environment; never put the value in GitHub or send it in chat.
3. Run `npm run security:preflight` **on the server where the real environment variables are available**. Fix ERRORs before restart. WARNINGs require review but do not fail preflight.
4. Run `node --test tests/*.test.mjs` and `npm run build` after installing dependencies, then test on staging before production.
5. Recommended: `FORCE_SECURE_COOKIE=true` with an HTTPS reverse proxy, plus separate `STORAGE_LINK_SECRET`.

## Storage migration status: not verified on live data

The project contains private-bucket rollout switches and legacy-storage copy/reference cutover tools. Phase 2Q1 only validates their **configuration**. It does **not** enable the flags, migrate files, run SQL, delete old public files, or assert that production Storage is private. The state of the actual bucket, records and legacy URLs must be checked against Supabase and staged before cutover.

## Remaining critical review items

- Server-to-server API authorization/integration and cross-account scope testing in staging.
- Complete private-file inventory, Storage bucket policies, reference cutover, signed URL expiry / revocation tests.
- Legacy plaintext password storage and login protections (needs **separate planned migration**, not a silent breaking password change).
- CSRF/origin handling, rate limits, reverse-proxy/TLS/session cookie behavior.
- Production build, deployment verification, backup, rollback, log monitoring.
