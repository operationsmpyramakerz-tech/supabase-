# Incremental Next.js Frontend Pilot

This stage adds an optional Next.js frontend beside the existing Express ERP.
The current application remains the source of truth for authentication,
permissions, APIs, Supabase access, Redis sessions, uploads, exports, and all
business rules.


## Production topology used by this repository on Vercel

The production setup can use two Vercel projects connected to the same Git
repository:

1. The existing Express ERP project keeps `EmptyCanvas` as its application root.
2. The Next.js pilot project uses `EmptyCanvas/next-frontend` as its Root Directory.
3. The Next.js project keeps `basePath=/next`. Opening the pilot project root `/`
   redirects to `/next/login`.
4. The Next.js project must define `LEGACY_BACKEND_ORIGIN` with the public HTTPS
   origin of the existing Express ERP project. Example only:
   `https://operations-pro-pyramakerz.vercel.app`
5. Requests that do not belong to the Next application (for example `/api/*`,
   classic rollback URLs, and legacy static assets) are proxied by Next.js to the
   existing Express ERP through a fallback rewrite. This keeps browser requests
   same-origin on the pilot domain and allows the Express session cookie to be
   reused by the Next.js server-side adapter.

After changing `LEGACY_BACKEND_ORIGIN`, redeploy the Next.js Vercel project
because routing configuration is evaluated when the Next build is created.

Do not enable the legacy URL cutover until login, session persistence, account
loading, protected API calls, uploads/downloads, and classic rollback links have
all passed the pilot smoke test.

## Completion rule: visual parity is mandatory

A page is no longer considered migrated merely because its API calls work. Each
page must pass all of the following before production approval:

1. Functional parity and permissions.
2. Data and error-state parity.
3. Classic UI parity: layout, navigation, typography, spacing, colors, cards,
   tables, forms, modals, buttons, menus, badges, loading and empty states.
4. Interaction parity: filters, dropdowns, pagination, three-dot menus, hover,
   focus, disabled states, loaders, and transitions.
5. Responsive parity on desktop, tablet, and mobile.
6. Page-by-page QA with `?classic=1` kept as the rollback path.

Visual redesign or modernization should be a separate project after the Classic
interface has been reproduced and approved in Next.js.

## What is available

- The functional Next.js page set lives below `/next/*`.
- Next.js pilot home: `/next/home`
- Migration status: `/next/migration-status`
- Next process health: `/next/api/health`
- Express-side proxy diagnostics after login: `/api/next-frontend-diagnostics`
- Classic pages remain available with `?classic=1` during migration.
- Existing Express APIs remain the source of truth; database/business logic is not duplicated in Next.js.

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
