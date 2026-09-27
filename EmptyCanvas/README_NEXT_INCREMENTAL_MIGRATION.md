# Next.js Migration Status — Phase 46

The Operations Hub application has completed the functional migration from the
legacy Express business layer to the Next.js/Supabase application.

## Current production ownership

The Next.js deployment now owns:

- login, logout, session validation and authorization
- all business reads and mutations
- page bootstrap compatibility data
- exports and PDFs
- Supabase Storage uploads/downloads
- notifications and Web Push
- the scheduled notification scan
- PWA manifest, icons, service worker and offline fallback

The Express deployment no longer executes business APIs. `server/app.js` is a
small compatibility shell that only provides health/readiness responses, old
bookmark redirects, legacy static PWA files during the transition, and an
explicit `410 LEGACY_API_RETIRED` response for stale API calls that were not
already rewritten to Next.

## Required Next.js environment

The Next deployment must keep the normal Supabase environment variables plus a
persistent session backend and the same session secret used when the direct
session cutover was completed:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

`UPSTASH_REDIS_URL` / `REDIS_URL` may be used instead of the REST pair when
appropriate. `LEGACY_BACKEND_ORIGIN` is no longer required by the Next runtime.

## Retirement verification

After deployment, verify:

1. `/next/api/system/retirement-status` returns `retirementReady: true`.
2. Logout and login work from `/next/login`.
3. Home and Create New Order load without the legacy backend.
4. PWA install diagnostics can load `/service-worker.js`, `/manifest.webmanifest`
   and `/icons/icon-192.png` from the Next deployment itself.
5. Browser push Test Notification succeeds.
6. The Vercel cron is owned by the Next project at
   `/next/api/cron/notifications` and only one project schedules it.

## Final shutdown step

Once the checks above pass on the production domain, the legacy deployment can
be removed from routing. Keep it available only as a temporary rollback target
until the final domain/DNS cutover has been observed for the agreed rollback
window.

The application must not reintroduce network fallbacks from Next to Express.
If a direct Next/Supabase path fails, fix that path rather than masking the
failure behind the retired backend.
