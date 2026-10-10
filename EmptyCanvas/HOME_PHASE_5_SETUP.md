# Home Dashboard — Phase 5: optional SLA monitoring

## What is included

- **SLA monitoring** card on Home for authorized Current / Review / Operations / Maintenance workspaces.
- Status counts based only on complete audited histories: open on track, open approaching, open overdue, completed on time, completed late.
- Top 5 currently overdue order numbers (from the user's already-authorized order scope), with a link to the workspace.
- An audited-coverage count, and a completion-on-time percentage **only when completed samples exist**.
- A per-workspace **disabled-by-default** policy table in Supabase. The UI is read-only; this phase does not create notifications or automatic escalation.

## Deploy in this order

1. Verify the **Phase 4** audit table `public.erp_order_lifecycle_events` exists and records events for *new* orders. This phase uses those events. It is intentionally not capable of calculating true lifecycle times for unaudited historical orders.
2. In **Supabase SQL Editor**, run `EmptyCanvas/supabase_home_sla_policies.sql` once. It adds the policy table with four disabled rows. Rerunning the script does not overwrite previously configured targets.
3. Upload the changed app files from this ZIP to GitHub under their exact paths. The version query of `home-dashboard-v2.css` was updated to avoid cached CSS.
4. Deploy on Vercel. The home SLA card will show **No active target** until policy values are approved and enabled.
5. **Only after agreeing actual SLA targets** for each workflow, configure the table in Supabase SQL Editor. Example (illustration, not an approved target):

```sql
update public.erp_home_sla_policies
set target_hours = 48, warning_percent = 80, enabled = true, updated_at = now()
where workspace = 'review';
```

Set target hours to the policy you really approve. `warning_percent = 80` means the warning starts at 80% of the configured time. Repeat for other workspaces only if agreed; leave unapproved workspaces disabled.

To switch off a policy immediately:

```sql
update public.erp_home_sla_policies
set enabled = false, updated_at = now()
where workspace = 'review';
```

## Precisely measured intervals

| Workspace | Start | End |
|---|---|---|
| Current | First recorded row creation | All recorded rows completed/delivered |
| Review | First recorded row creation | All recorded rows approved by supervisor |
| Operations | All recorded rows approved by supervisor | All rows completed/delivered |
| Maintenance | All recorded rows approved by supervisor | All rows completed/delivered |

- Durations are **elapsed calendar hours**, not working hours, and do **not** exclude Fridays, weekends, public holidays, leave, or pauses. Do not activate the targets until this basis is accepted.
- A target breach is informational in the Home dashboard. It does not change order status or send email / mobile push / in-app notifications.
- Only orders with a valid **creation** event and matching recorded component-row counts can be judged. Old/incomplete/renumbered/deleted histories are intentionally excluded from compliance claims.
- Current stages with no verified start event are counted as **Awaiting this workflow stage**, not overdue.
- User scopes, date filters, and access checks remain server-side; the SLA query shares the same lifecycle events already filtered for the signed-in account.
- `SUPABASE_SERVICE_ROLE_KEY` or an equivalent server-only privileged credential is necessary. **Do not expose it in a `NEXT_PUBLIC_*` variable**. If the policy table is missing, the UI shows an informative setup message.

## Validation performed

- `node scripts/test-home-sla-analytics.mjs`
- Existing lifecycle, backlog, and trend analytics tests.
- JS/JSX parser and CSS parser validation.
- A full Next.js build and live Supabase migration were **not** run here.

## Recommended next phase

If the business requires time to count only during approved working hours, create a work-calendar configuration (working days, holidays, exceptions) and agree whether weekends/pauses stop the clock. An authenticated administrator policy-editor page and configurable escalation notifications can be added once roles and target rules are specified. No alerts or forced channels have been introduced in this phase.
