# Next.js Migration Status — Phase 48

The Operations Hub functional migration is complete. Phase 48 performs the final GitSync-safe Next-runtime cleanup. The Next.js/Supabase
deployment is now the primary application and the historical Express backend is
retired from Vercel runtime traffic.

## Production ownership

The Next deployment owns:

- login, logout, session validation and authorization
- all business reads and mutations
- page bootstrap compatibility data
- exports and PDFs
- Supabase Storage uploads/downloads
- notifications and Web Push
- the scheduled notification scan
- PWA manifest, icons, service worker and offline fallback
- compatibility API rewrites for old cached clients
- redirects for old Express/classic HTML bookmarks
- health/readiness compatibility URLs

The legacy Vercel configs now contain only an edge rewrite to the Next
deployment. They do not build or invoke the Express serverless function.
`EmptyCanvas/api/index.js` is a 410 retirement safety stub only.

## Required Next.js environment

Keep these core variables in the Next Vercel project:

```text
SUPABASE_URL (or the Supabase URL alias already used by the app)
SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY
SESSION_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Keep the feature-specific variables you actively use, including the VAPID keys
for browser push and `CRON_SECRET` when the notification cron is protected.

The Next runtime no longer needs:

```text
LEGACY_BACKEND_ORIGIN
NEXT_FRONTEND_ORIGIN
NEXT_FRONTEND_PUBLIC_ORIGIN
ENABLE_NEXT_FRONTEND
```

Do not remove `SESSION_SECRET` or the Upstash variables; they are now part of
the primary Next session implementation.

## Phase 47 verification

After deployment, verify:

1. `/next/api/system/retirement-status` returns `phase: 47` and
   `retirementReady: true`.
2. `/health` and `/ready` work directly on the Next deployment/domain.
3. Old paths such as `/home`, `/login.html`, `/current-orders.html` and
   `/orders/order-receipt-viewer` redirect to their `/next/...` equivalents.
4. Old compatibility API paths such as `/api/login`, `/api/session-status`,
   `/api/page-bootstrap` and `/api/components` resolve in the Next project.
5. Login, Home, Create Order, Current Orders, uploads, exports, notifications,
   push and PWA install all work normally.

## Domain cutover and legacy project shutdown

Once the verification above passes, move the production custom domain from the
legacy Vercel project to the Next Vercel project. The Next project already owns
root PWA assets and old bookmark redirects, so no Express routing is required.

Keep the old Vercel project without the production domain only for the desired
rollback window. Its current config is edge-only and forwards to the Next
deployment. After the rollback window, the legacy Vercel project can be deleted.

See `README_BACKEND_RETIREMENT.md` for the final cleanup list.


## Phase 48 — GitSync-safe Next runtime cleanup

All non-dynamic pages now call the direct page-bootstrap helper explicitly instead
of going through `legacy-api.js`. The compatibility helper has **no network access**
and remains only for four existing bracket-named route/page files that are intentionally
left unchanged because those paths are difficult to upload through the Android GitSync
workflow. This does not create a production dependency on Express.

The remaining work is repository pruning only: remove the retired `server/`, `api/`,
legacy `public/` and PM2 files after the rollback window. No business migration remains.
