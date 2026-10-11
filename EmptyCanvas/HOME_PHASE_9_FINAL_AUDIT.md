# ERP Home — Phase 9: Stabilization & Final Audit

Base: the user's `supabase--main-4.zip` (Phase 8 code). Deliverable includes **only new and changed files**, not a full repository.

## Findings and corrections

1. **Incorrect delivery accounting (fixed for future events).** Phase 8 marked cancelled/ineligible SLA alerts as `delivered`, inflating Delivery Health. The worker now marks these `skipped`. A SQL migration extends the accepted outbox states, and Supervisor Routes now shows a separate **Skipped** count. Historical `delivered` entries are intentionally **not** retroactively changed because we cannot reliably determine which had been sent.
2. **Cron run visibility (added).** The SLA cycle records privacy-safe run summaries (status, inspected, queued, processed, delivered) in `erp_sla_cycle_runs`. Recording failure is best-effort and does not block alert delivery. No recipients, credentials or message content are stored in this table.
3. **Admin diagnostics (added).** In Home → SLA Settings, use **Run diagnostics**. This checks schema readability and `CRON_SECRET` presence and displays the latest SLA cycle. The endpoint is read-only and enforces server-side Admin access; only static labels and aggregate counts are exposed. It does not trigger a cron or send messages.
4. **Styles (updated).** Added responsive diagnostics styling to the existing dashboard CSS, and changed Home's stylesheet cache version to prevent stale mobile styles.

## Install order — important

1. In **Supabase SQL Editor**, run `EmptyCanvas/supabase_home_sla_phase9.sql` **before deploying the Next.js changes**. It is safe to rerun. It does not erase existing alerts, routes, policies or preferences. The Phase 7 SLA outbox must already exist.
2. Upload the changed files inside `EmptyCanvas/next-frontend/` to GitHub at their original paths; upload the SQL and documentation only if keeping migration history in GitHub. **Do not upload the root `EmptyCanvas` prefix if your repository already starts at `next-frontend`.**
3. Wait for successful Vercel deployment. Run Home → SLA Settings → **Run diagnostics** as a Users Center Admin.
4. The **Recent SLA cycle** check may remain pending until the next scheduled notification Cron run. `vercel.json` currently schedules `/next/api/cron/notifications` at `06:00 UTC` daily. Cron secret present is *not* proof that Vercel invoked the route; inspect Vercel Cron and Function logs.
5. Test with a **new test order** and explicitly opted-in test users. Confirm lifecycle events, enabled SLA policy/approved calendar, preferences, warning/overdue scheduling, no duplicates, opt-out behavior, and optional Supervisor Routes. Never force notifications on real users for testing.

## Verification actually performed locally

- All eight existing scripts under `next-frontend/scripts/test-home-*.mjs` and `test-notification-audit.mjs` passed.
- New `test-home-sla-phase9-audit.mjs` passed (static integration assertions; does not connect to Supabase).
- Parsed the changed JSX/JS with TypeScript's JSX parser and the dashboard CSS with PostCSS without syntax errors.
- Reviewed permissions: new endpoint requires authenticated Admin; Cron remains protected by `CRON_SECRET`.

## Not verified / release blockers

- **No full Next.js production build:** dependency directory (`node_modules`) and project lockfile are absent from the supplied ZIP/environment; do not claim the deployment is built until Vercel succeeds.
- **No access to live Supabase or Vercel:** migrations, RLS with real accounts, deployed runtime, cron invocation, provider delivery, and actual mobile screenshot **not** tested here. Use the new diagnostics and Vercel logs, plus manual end-to-end verification.
- Sample Delivery Health shows the latest 100 SLA outbox records; it is not a lifetime delivery rate, and `delivered` means the worker completed processing, *not* necessarily that a push/email reached an inbox/device.
- `Cron execution history` is best-effort, and requires Phase 9 SQL. If absent or older than ~36h, investigate schedule/logs; an intentionally disabled SLA policy can still yield a healthy `ok` scan with zero candidates.

## Suggested production acceptance checklist

- [ ] SQL migration completes without errors; Diagnostics sees all six database tables.
- [ ] Vercel build and deployment complete; Home and SLA Settings load correctly on desktop and mobile, light and dark mode.
- [ ] Cron secret is configured; Vercel function shows a completed scheduled invocation and `Recent SLA cycle` reports `ok` within ~36 hours.
- [ ] Existing users' per-channel notification choices remain unchanged.
- [ ] A fully audited test order passes through create → approval → complete and appears correctly in Processing Time/SLA (if enabled).
- [ ] Test a warning and an overdue alert via opted-in test users; verify quiet hours, cancellation, duplicate protection and opt-out.
- [ ] For optional escalation, confirm both parties opt in and route is enabled; verify removal of either consent stops new alerts.
- [ ] Check Delivery Health counts `Skipped` separately from `Delivered`.

Once the above are verified in the deployed environment, the original Home/SLA plan can be considered operationally accepted. No mandatory additional feature phases are recommended.
