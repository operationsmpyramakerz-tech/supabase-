# Vercel + Upstash — Current Next.js Setup (Phase 47)

The legacy Express Vercel backend is retired. The production application now
runs from `EmptyCanvas/next-frontend`.

## Required session configuration

The Next Vercel project must keep a persistent session store and secret:

```text
SESSION_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

`UPSTASH_REDIS_URL` or `REDIS_URL` can be used instead of the REST pair when an
appropriate Redis connection is available, but the REST pair is the preferred
serverless configuration on Vercel.

The same Next project must also keep its Supabase URL/service key variables.

## No legacy origin required

Phase 47 does not use the Express backend for authentication or business data.
The following variables are no longer required by the Next runtime and can be
removed after the Phase 47 deployment is verified:

```text
LEGACY_BACKEND_ORIGIN
NEXT_FRONTEND_ORIGIN
NEXT_FRONTEND_PUBLIC_ORIGIN
ENABLE_NEXT_FRONTEND
```

Do not remove `SESSION_SECRET` or the Upstash values; they are part of the live
Next authentication/session implementation.

See `README_BACKEND_RETIREMENT.md` for the final domain cutover and cleanup.
