# Home Dashboard Phase 6 — SLA Settings & Work Calendar

## What changes

- Adds **SLA Settings** link on the Home SLA Monitoring card for authenticated **Users Center Admin-level** accounts (including the built-in Admin account).
- Adds a protected `/next/sla-settings` page and `/next/api/home/sla-settings` endpoint to edit each workflow's target, warning threshold, optional time basis, and shared working calendar.
- Lets each workflow choose `elapsed` (original continuous hours) or `working` (configured working days, time zone, hours, and explicit holiday dates). Existing policies default to **elapsed** and preserve their enabled/disabled state.
- Does **not** introduce mandatory notifications, push, email or escalation. Does not alter any order state or approval workflow.
- Only audited completed histories are classified; no fabricated completion timestamps for historical orders.

## Deploy order

1. **First**, use Supabase SQL Editor to run `EmptyCanvas/supabase_home_sla_calendar_phase6.sql`. It is re-runnable and keeps existing SLA targets intact. The calendar begins **disabled**, with placeholder Sunday–Thursday 09:00–17:00 (Cairo) values. This is not a company-approved schedule.
2. Upload the **Next.js files** in this update, preserving folder paths.
3. Wait for Vercel deployment. Sign in as an account with **Users Center `admin` permission**, then open Home → SLA Monitoring → **SLA settings**.
4. Enter the actual work days, office hours, Cairo time zone or other supported zone, and explicitly list holidays as `YYYY-MM-DD`. Enable and **Save calendar**.
5. For each workflow, review target hours, warning threshold and whether elapsed or working time is appropriate. Enable and **Save policy** only after approval. Disabled policies never mark orders late.
6. Refresh Home to see recalculated indicators.

## Permissions and security

- All GET/PUT configuration operations re-check the signed-in account **on the server**, require Admin-level Users Center access, and never trust a client-only role flag.
- Direct public PostgREST access to both configuration tables is revoked for `anon` and `authenticated`. A **server-only Supabase service-role credential** is required; do not place it in `NEXT_PUBLIC_*`.
- PUT validates fields (timezone, working-day indices, clock times, holidays, hours and percentages) and rejects cross-origin browser writes.
- Saving each workflow or the calendar is an explicit operation. No bulk background writes occur.

## Rules and limitations

- Normal opening hours have **one time interval per day**, do not cross midnight and use a single shared company calendar. Breaks, overtime, per-school calendars, partial-day closures and auto-fetched Egyptian public holidays are **not implemented**.
- Calendar dates are interpreted in the configured IANA time zone (e.g. `Africa/Cairo`), including applicable summer-time offsets. Weekend days and holiday dates contribute zero hours.
- An active working-hours policy with a missing/disabled calendar is **not evaluated** and shows a setup notice instead of misleading 0-overdue data.
- SLA compliance uses only **verified audited lifecycle events** from Phase 4. Older/incomplete audit histories remain excluded.
- Processing Time metrics use elapsed calendar time independently of the SLA calendar (clearly stated on Home).
- If the phase 6 SQL has not run, the new policy query will show a setup/unavailable message until the migration is applied.
- No full Next.js production build or live database migration was run in this environment. Check Vercel logs after deployment.

## Validation

```bash
cd EmptyCanvas/next-frontend
node scripts/test-home-working-calendar.mjs
node scripts/test-home-sla-analytics.mjs
node scripts/test-home-lifecycle-analytics.mjs
node scripts/test-home-operational-analytics.mjs
node scripts/test-home-trend-analytics.mjs
```
