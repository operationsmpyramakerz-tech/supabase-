# PM2 Cluster Deployment

This stage runs the Node.js ERP with multiple workers and graceful, zero-downtime reloads.

## Required before cluster mode

Configure a persistent shared session store. Use either:

```env
UPSTASH_REDIS_URL=rediss://...
```

or:

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Also configure a strong production secret:

```env
SESSION_SECRET=replace-with-a-long-random-secret
```

The server intentionally refuses to start in PM2 cluster mode with the in-memory session store because users could appear logged out when the next request reaches a different worker.

## Install PM2 once on the server

```bash
npm install -g pm2
```

## Start

From the `EmptyCanvas` folder:

```bash
npm run pm2:start
```

By default the configuration uses up to two workers (or one on a single-core server). To choose another fixed number:

```bash
WEB_CONCURRENCY=2 npm run pm2:start
```

For most small ERP servers, `2` is a safe starting point. Do not set more workers than the available CPU cores, and monitor memory because each worker has its own Node.js heap.

## Zero-downtime deploy/reload

After replacing application files:

```bash
npm run pm2:reload
```

PM2 starts a replacement worker, waits for its `ready` signal, then gracefully drains the old worker.

## Save startup configuration

```bash
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`, then run `pm2 save` again.

## Monitoring

```bash
pm2 status
pm2 monit
pm2 logs operations-hub
```

Health endpoints:

```text
/health  - process liveness
/ready   - readiness/draining state
```

Every response also contains an `X-ERP-Worker` header. Repeated requests should show different worker IDs when load balancing is active.

## Useful environment controls

```env
WEB_CONCURRENCY=2
PM2_MAX_MEMORY_RESTART=750M
GRACEFUL_SHUTDOWN_TIMEOUT_MS=30000
KEEP_ALIVE_TIMEOUT_MS=65000
HEADERS_TIMEOUT_MS=66000
REQUEST_TIMEOUT_MS=120000
```

`ALLOW_UNSAFE_MEMORY_SESSIONS=true` exists only for temporary local testing and must not be used in production cluster mode.
