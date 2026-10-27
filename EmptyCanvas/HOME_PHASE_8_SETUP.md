# ERP Home – Phase 8: Optional Supervisor SLA Escalation

## What's added

- **SLA Settings → Supervisor routes**: a Users Center Admin can explicitly configure an order owner, a supervisor and the workflow to monitor. Every new route starts **disabled** until deliberately enabled.
- **Notification Preferences → SLA alert types**: two independent personal consent controls:
  - **Allow escalation of my overdue orders** (owner consent), default OFF.
  - **Receive overdue escalation for orders I supervise** (supervisor consent), default OFF.
- At least one **SLA channel** (In-App, Push, Email) must be enabled **by the supervisor**. Every SLA channel remains optional; no admin-controlled or forced channels.
- Escalation occurs **only after 24 additional measured hours beyond the active SLA target**, never merely at the warning threshold. 'Measured hours' respects the policy's choice of working or elapsed hours.
- Only orders with complete verified multi-row audit histories can generate escalation. Before sending, the worker revalidates owner, stage, policy, both consents, the route and supervisor's explicit **Admin-level access to the order workspace**. An ordinary `view` permission is insufficient; a display name such as "Admin" does not grant access.
- Disabled route, disabled consent, completed order or revoked access makes pending alerts ineligible. Delivery uses the existing daily scheduled notification cron and its retry/deduplication outbox.
- **Delivery health** in SLA Settings summarizes **only the latest 100 queued SLA alerts** (not all-time totals). It shows status counts and the number of recent supervisor messages, not a guarantee of provider delivery.

## Deployment order

1. Ensure Phase 4 lifecycle audit, Phase 6 policies & work calendar, and Phase 7 notifications are installed.
2. If Phase 7 SQL was not already run, execute `EmptyCanvas/supabase_home_sla_notifications_phase7.sql` from this archive first. Its copy is included because the latest uploaded repository omitted it. **Do not interpret the missing SQL file in GitHub as evidence that the database migration was not run.**
3. Run **`EmptyCanvas/supabase_home_sla_escalation_phase8.sql`** from Supabase SQL Editor. It adds a protected routes table and nullable `owner_id` on the existing outbox. It doesn't alter existing personal alerts or consent settings and it creates no active routes.
4. Upload the 11 new/changed `EmptyCanvas/next-frontend/...` files to GitHub, preserving paths, then deploy on Vercel.
5. From an account with Users Center Admin permissions, open **Home → SLA Monitoring → SLA Settings → Supervisor routes**. Choose an order owner with page access and a supervisor with **Admin** permission on that workspace. Create and explicitly enable the route.
6. Both staff members go to **Notifications → Preferences**. The owner enables *Allow escalation of my overdue orders*. The supervisor enables *Receive overdue escalation*, plus the desired personal SLA channels. Neither person has to opt into other personal SLA alert types.
7. Confirm the workspace SLA policy is enabled. The existing cron runs daily at **06:00 UTC**, so scans are **not real-time**. Test with a legitimately audited overdue order and verify the queue / Notifications UI after the scheduled cron runs.

## Validation and diagnostics

From `EmptyCanvas/next-frontend`:

```bash
node scripts/test-home-sla-escalation.mjs
node scripts/test-home-sla-alert-planner.mjs
node scripts/test-home-sla-analytics.mjs
node scripts/test-home-working-calendar.mjs
node scripts/test-notification-audit.mjs
```

In Supabase SQL Editor, with appropriate admin access:

```sql
SELECT workspace, enabled, count(*) AS configured_routes
FROM public.erp_sla_escalation_routes GROUP BY workspace, enabled;
SELECT status, (owner_id IS NOT NULL) AS supervisor_escalation, count(*)
FROM public.erp_sla_alert_outbox GROUP BY status, (owner_id IS NOT NULL);
```

The outbox `kind` remains `overdue` for escalation to preserve compatibility with Phase 7. The non-null `owner_id` distinguishes supervisor notifications from personal alerts. The stable hashed key incorporates the recipient, owner and audited stage to deduplicate each escalation.

## Security, limits and known limitations

- Routes table and outbox changes are RLS-protected; read/writes go through server-only service-role credentials and an authenticated Users Center Admin API. Do not expose a service-role key in browser bundles.
- Supervisor escalation is **not** enabled by simply saving an SLA policy or an Admin-defined route: both people must opt in. Either can revoke consent at any time.
- Supervisor authorization is deliberately conservative: explicit workflow **Admin** permission is required. Granting general dashboard access or being listed as a manager doesn't make someone eligible. Existing order row-level permission rules are unchanged.
- The current system has **one company work calendar**. The 24-hour waiting period is measured under the SLA policy's time basis; alerts may arrive after that due to daily Cron cadence.
- A healthy queue response doesn't prove email SMTP or push subscription delivery. Use the existing notification delivery reports and provider logs when diagnosing.
- The test scripts and JavaScript/JSX/CSS syntax checks ran locally. **No production Next.js build, Supabase migration execution, or live end-to-end notification delivery was performed here.**
