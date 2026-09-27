# Operations Hub ERP — Current Architecture

## Overview

Operations Hub is the Pyramakerz operations ERP. The application has completed
its migration from the historical Express/Notion architecture to a Next.js +
Supabase architecture.

## Production application

- **Framework:** Next.js App Router
- **Application root:** `EmptyCanvas/next-frontend`
- **Primary database:** Supabase
- **Sessions:** signed session cookie + Upstash Redis
- **File storage:** Supabase Storage
- **Deployment:** Vercel
- **PWA:** manifest, service worker, offline fallback and icons are served by the
  Next deployment
- **Notifications:** Supabase-backed notifications + Web Push
- **Scheduled work:** Vercel cron runs the Next notification scanner

## Authentication and authorization

Login, logout, session validation, page permissions and admin verification run
inside the Next application. The Next session store requires `SESSION_SECRET`
and persistent Upstash/Redis configuration.

## Legacy backend status

Phase 47 retires the Express backend from production runtime traffic. Legacy
Vercel configs are edge-forwarding compatibility only and do not execute the
old business server. Old page URLs and compatibility API URLs are owned by the
Next Vercel configuration.

The source under `EmptyCanvas/server/` is retained temporarily only as rollback
history and can be deleted after the rollback window. New work must not add
business logic or network fallbacks to that legacy server.

## Migration rule

All new reads, mutations, exports, uploads, authentication and scheduled jobs
must be implemented in `EmptyCanvas/next-frontend` using Next/Supabase. Do not
reintroduce Express or Notion as a production data path.

For deployment and cleanup details, see:

- `EmptyCanvas/README_NEXT_INCREMENTAL_MIGRATION.md`
- `EmptyCanvas/README_BACKEND_RETIREMENT.md`
