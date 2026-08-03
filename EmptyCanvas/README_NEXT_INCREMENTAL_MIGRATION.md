# Incremental Next.js Frontend Pilot

This stage adds an optional Next.js frontend beside the existing Express ERP.
The current application remains the source of truth for authentication,
permissions, APIs, Supabase access, Redis sessions, uploads, exports, and all
business rules.

## What is available

- Next.js pilot home: `/next/home`
- Migration status: `/next/migration-status`
- Next process health: `/next/api/health`
- Express-side proxy diagnostics after login: `/api/next-frontend-diagnostics`
- Automatic fallback message when the pilot process is unavailable
- Existing pages and APIs are unchanged

## One-time installation

Run from `EmptyCanvas`:

```bash
npm run next:install
npm run next:build
```

The new frontend has its own `next-frontend/package.json`; it does not add
Next.js or React to the existing Express runtime.

## Enable the pilot on the self-hosted server

Export these values before starting or reloading PM2:

```bash
export ENABLE_NEXT_FRONTEND=true
export NEXT_FRONTEND_PORT=3001
export NEXT_FRONTEND_ORIGIN=http://127.0.0.1:3001
export LEGACY_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:5000
```

Then reload the PM2 ecosystem:

```bash
npm run pm2:reload
```

PM2 will run:

1. The existing Express ERP in cluster mode on port `5000`.
2. One Next.js frontend process bound to `127.0.0.1:3001`.
3. Express will proxy only `/next` requests to the Next.js process.

The Next.js port is not intended to be exposed publicly. Users continue to use
the same ERP hostname and session cookie.

## Disable without removing files

```bash
export ENABLE_NEXT_FRONTEND=false
npm run pm2:reload
```

All existing ERP routes continue to work. Visiting `/next` will show a safe
unavailable message with a link back to `/home`.

## Development

Keep the current Express server running, then in another terminal run:

```bash
npm run next:dev
```

For development through the Express `/next` proxy, set:

```bash
ENABLE_NEXT_FRONTEND=true
NEXT_FRONTEND_ORIGIN=http://127.0.0.1:3001
```

Direct access to port `3001` is also possible locally.

## Migration rule

Move one low-risk page at a time. Each migrated page should:

1. Reuse `/api/account` and existing protected APIs.
2. Forward the current session cookie on server-side requests.
3. Keep a legacy route available until the replacement is approved.
4. Compare first render, API count, error handling, and permissions before the
   old page is retired.

Do not move database or business logic into Next.js during the pilot. The
existing Node.js backend remains the only API layer.
