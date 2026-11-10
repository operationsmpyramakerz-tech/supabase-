# ERP v373 — Company SMTP fix

Apply these files over the corresponding paths in version 372. No database migration or new npm package is required.

## Vercel Production environment

- `SMTP_HOST=mail.pro.pyramakerz.com` (confirm outgoing SMTP hostname with the mail provider)
- `SMTP_PORT=587`
- `SMTP_SECURE=false` (STARTTLS; port 587 always uses STARTTLS in v373)
- `SMTP_USER=operations.ERP@pro.pyramakerz.com`
- `SMTP_FROM=operations.ERP@pro.pyramakerz.com`
- `SMTP_PASS=<new mailbox password>` (rotate the exposed old password; do not commit it)

If the mail provider specifies implicit TLS instead, use its documented SMTP hostname and `SMTP_PORT=465`, `SMTP_SECURE=true`. Do not disable TLS certificate verification. Save Production variables and redeploy, then send an Invite to a controlled account and use Notifications > Send Test. Verify receipt (including spam folder) and the sender. SMTP is preferred when fully configured, Resend is used only when SMTP is not configured; no automatic fallback after a failed SMTP send.

The old implementation selected implicit TLS whenever SMTP_SECURE=true even with port 587. The shared transport now selects standard port modes, upgrades before authentication, checks certificates, has a socket timeout, and returns sanitized errors. SMTP delivery logs use the generic provider label `smtp`; existing `gmail-smtp` history remains supported. Sender now comes from SMTP_FROM (or SMTP_USER), not older recovery/Resend-specific sender settings.

## Testing

From `EmptyCanvas/next-frontend`:

```sh
node --test tests/smtp-company-mail-v373.test.mjs tests/users-center-invite-design-v345.test.mjs
```

The new test uses a temporary local TLS certificate, OpenSSL, and mock SMTP servers; it sends no real emails. Production mailbox credentials, SMTP host reachability, server certificate and mail delivery have not been verified. Vercel production build and live delivery must be checked after deployment. The unrelated PDF/Turbopack warnings are not addressed by this patch.
