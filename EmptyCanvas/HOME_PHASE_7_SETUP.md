# ERP Home / SLA Notifications — Phase 7

## Prerequisites

1. Phase 4 lifecycle audit is installed and is recording all components of NEW orders.
2. Phase 6 `erp_home_sla_policies` and `erp_home_sla_calendar` tables are installed.
3. The existing notification preference system, SMTP/web push (optional), and the protected notification cron are configured.
4. Server must use a Supabase service-role credential. Never expose this key to a browser.

## Installation

1. Run `EmptyCanvas/supabase_home_sla_notifications_phase7.sql` in the Supabase SQL Editor. It creates an RLS-protected outbox and a claim RPC. It does not enable any alert, SLA policy, or channel.
2. Upload the changed/new files in `next-frontend` to their matching GitHub paths.
3. Deploy to Vercel. Keep `CRON_SECRET` configured; the existing scheduled path is `/next/api/cron/notifications`.
4. In *Notification preferences*, each user can choose the **SLA alerts** row and its In-App, Push and Email columns (all **OFF** by default). Warning, overdue and personal follow-up alerts have individual toggles.
5. Enable relevant target(s) in *Home → SLA Settings* using authorized Admin access; if working hours are used, configure the work calendar first.

## Behavior

- The existing Vercel cron runs **daily** at `0 6 * * *` (UTC); notifications are not real-time. Warning and overdue alerts can be detected only on its next run. To deliver sooner a supported plan may use a shorter interval; do not promise minute-accurate deadlines with daily scanning.
- Alerts go **only to the originating team member** for their own order, **only if** that user can see the corresponding workspace, and only for complete verified lifecycle histories. Team/manager broadcasts are intentionally not enabled. There is no administrator-enforced alert channel.
- Each warning and overdue stage is sent at most once per audited stage/policy version per user. Optional follow-ups are capped at one per UTC date after at least 24 additional *measured* hours overdue. Reopening does not reuse a completed timeline.
- A missing table/migration or service interruption does not break the main notification queue. Queue inserts use a stable hash ID and are deduplicated by PostgreSQL. Provider delivery errors are retried up to five attempts; delivery state is tracked independently for each channel.
- If a user disables their SLA channel/type after alerts were queued, delivery rechecks their choices. Quiet hours suppress push. Existing email provider configuration is required for email.
- This does not notify the manager or modify approval workflows. Future supervisor escalation needs an explicit recipient mapping, scoped authorization and both parties' consent.

## Validation

- `node next-frontend/scripts/test-home-sla-alert-planner.mjs`
- Check the outbox: `SELECT status, kind, count(*) FROM public.erp_sla_alert_outbox GROUP BY status, kind;`
- Run the protected cron after one audited order approaches/exceeds an enabled policy. Check notification preferences and delivery channels for that user.
- The migration does **not** send catch-up alerts automatically to historical orders without complete audit history.

## Reapplication verification (current uploaded version)

This package was re-applied to the user's newly uploaded `supabase--main.zip` (not to the earlier ZIP). The existing seven files were compared line-by-line against this upload before integration. Five missing files were added. All other existing files, including the Phase 6 SLA settings and Home CSS repair, were left unchanged.

Only the twelve changed/new files are packaged. SQL migration can be rerun safely if it was executed for the previous Phase 7 package; it creates the table/indexes if absent and replaces the claim function. Existing records and notification preferences are not reset by the migration.

Validation: notification audit and Home trend, backlog, lifecycle, working calendar, SLA analysis, and SLA opt-in alert planner tests passed; updated JS/JSX was syntax-checked and the notification CSS was parsed. A full Next.js/Vercel production build and a live Supabase delivery test were not performed here.
