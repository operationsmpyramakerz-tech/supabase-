# Operations Hub ERP — Final Architecture

## Production application

Operations Hub is now a Next.js + Supabase application. The historical Express
backend has been retired and is not required by the production runtime.

- **Application root:** `EmptyCanvas/next-frontend`
- **Framework:** Next.js App Router
- **Database:** Supabase
- **Sessions:** signed cookie + Upstash Redis
- **Storage:** Supabase Storage
- **Deployment:** Vercel
- **PWA:** owned by the Next deployment
- **Notifications:** Supabase-backed notifications + Web Push
- **Scheduled jobs:** Vercel Cron -> Next notification scanner

## Repository layout

Runtime source lives under `EmptyCanvas/next-frontend/`.

The SQL files directly under `EmptyCanvas/` are retained database migrations /
performance scripts and are intentionally not part of the application runtime.

The repository no longer needs the historical `EmptyCanvas/server/`,
`EmptyCanvas/api/`, legacy `EmptyCanvas/public/`, PM2 configuration, parent
Vercel forwarding configs, or Express/Notion package dependencies.

## Required production environment

Keep the active Supabase variables plus:

- `SESSION_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Keep feature variables that are in use, such as the VAPID keys and
`CRON_SECRET`. `NEXT_FRONTEND_BASE_PATH` is optional because `/next` is the
default base path.

Legacy routing variables such as `LEGACY_BACKEND_ORIGIN`,
`NEXT_FRONTEND_ORIGIN`, `NEXT_FRONTEND_PUBLIC_ORIGIN`, and
`ENABLE_NEXT_FRONTEND` are not part of the runtime anymore.

## Development rule

All new reads, mutations, exports, uploads, authentication, scheduled jobs and
business logic must stay inside `EmptyCanvas/next-frontend` and use
Next/Supabase. Do not reintroduce Express or Notion as a production data path.

A small local-only compatibility helper remains for four pre-existing
bracket-named routes/pages. It performs no network request to a legacy backend.
