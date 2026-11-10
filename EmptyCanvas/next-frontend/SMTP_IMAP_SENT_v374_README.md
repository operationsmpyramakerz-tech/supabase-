# ERP v374 — IMAP Sent archive (on top of v373)

Replace lib/notification-smtp.js. Tests are optional for deployment. No SQL or new dependencies.

Keep existing working SMTP variables. Add Production environment variables:
- IMAP_SAVE_SENT=true
- IMAP_HOST=mail.pro.pyramakerz.com
- IMAP_PORT=993
- IMAP_SENT_FOLDER: optional; leave absent for discovery (LIST, special-use \\Sent then conventional Sent names). Set exact mailbox name if needed (e.g. Sent or INBOX.Sent).
- IMAP_USER and IMAP_PASS: optional; fall back to SMTP_USER and SMTP_PASS (or SMTP_PASSWORD). Only set if different.

Redeploy after changing variables. Send a test message, verify its receipt and check the sender mailbox's Sent folder in webmail. The TLS certificate must be valid. IMAP uses implicit TLS, not STARTTLS. The code uses LOGIN over verified TLS and APPEND with the same MIME bytes SMTP accepted. No automatic creation of folders or resend on archive failure. An archive failure logs a safe error code to runtime logs (SMTP accepted; Sent archive failed: ...), and SMTP still reports success. An eight-second deadline bounds the archive attempt. Prior messages are not backfilled. Resend fallback is not archived. Only enable this for a mailbox that does not already save SMTP submissions, to avoid duplicate Sent copies. Sent may contain ERP passwords because the legacy invitation and password recovery messages include them; restrict mailbox access and plan to replace those emails with expiring links.

Tests: node --test tests/imap-sent-v374.test.mjs tests/smtp-company-mail-v373.test.mjs
