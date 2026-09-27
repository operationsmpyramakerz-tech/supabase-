# Backend Retirement — Phase 47

Phase 47 retires the legacy Express backend from production execution.

## What is active now

The primary Vercel project is `EmptyCanvas/next-frontend`. It contains the UI,
all API routes, direct Supabase access, Upstash-backed sessions, exports, PWA
assets, Web Push and the notification cron.

The old Vercel project may remain temporarily as an edge forwarding layer, but
it no longer needs to execute `server/app.js` or `api/index.js`. Both legacy
`vercel.json` files forward every request directly to the Next deployment.

## Environment variables that must stay in Next

Core:

- Supabase URL and service/secret key used by the current app
- `SESSION_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Feature variables should stay when used, for example:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `CRON_SECRET`
- password-recovery/email variables
- storage/table override variables

## Variables safe to remove from the Next Vercel project

After Phase 47 is deployed successfully, these legacy routing variables are no
longer read by the Next application:

- `LEGACY_BACKEND_ORIGIN`
- `NEXT_FRONTEND_ORIGIN`
- `NEXT_FRONTEND_PUBLIC_ORIGIN`
- `ENABLE_NEXT_FRONTEND`

`NEXT_FRONTEND_BASE_PATH` is optional because `/next` is the built-in default.
Keep it only if your deployment intentionally overrides that default.

## Final Vercel cutover

1. Deploy Phase 47 to the Next project.
2. Verify `/next/api/system/retirement-status` and the main workflows.
3. In Vercel, attach the production custom domain to the Next project.
4. Remove that custom domain from the legacy project.
5. Leave the legacy project available only during the rollback window.
6. After the rollback window, delete the legacy Vercel project.

## Legacy source files that can be deleted after the rollback window

These are no longer required by the Next production deployment:

- `EmptyCanvas/api/`
- `EmptyCanvas/server/`
- `EmptyCanvas/public/` (legacy duplicate PWA assets)
- `EmptyCanvas/ecosystem.config.cjs`
- `EmptyCanvas/README_PM2_CLUSTER.md`
- `EmptyCanvas/README_VERCEL_UPSTASH.md`
- `EmptyCanvas/README_BACKGROUND_EXPORT_WORKERS.md`
- root `service-worker.js` if no separate non-Next deployment uses it

Do not delete `EmptyCanvas/next-frontend/` or its `public/` directory.

The old package files can be simplified separately after the rollback window;
leaving them in Git does not make the Express backend active because Vercel no
longer routes requests into the legacy function.
