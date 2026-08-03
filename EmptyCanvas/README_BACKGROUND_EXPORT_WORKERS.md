# Background PDF Export Workers

PDF rendering is now executed outside the main Express event loop by Node.js Worker Threads.
This keeps page/API responses responsive while a user generates a large PDF.

## Default behavior

- One export worker thread is created lazily inside each PM2 application worker.
- Export jobs are queued and processed one at a time per application worker.
- The following PDFs use the worker queue:
  - Delivery / withdrawal order receipts
  - Maintenance receipts and reports
  - Event request reports
  - Expense reports
- If the deployment is serverless, worker threads are disabled by default and the same renderer runs inline.
- If the queue is full, the request is rejected with a temporary error by default so heavy rendering never falls back onto the Express event loop.

## Environment variables

```env
# Enable or disable Worker Threads explicitly.
EXPORT_WORKERS_ENABLED=true

# Number of export threads inside each PM2 application worker.
# Keep this at 1 unless the server has enough CPU and RAM.
EXPORT_WORKER_CONCURRENCY=1

# Maximum jobs waiting per PM2 application worker.
EXPORT_QUEUE_MAX=24

# Maximum rendering time for one export job.
EXPORT_JOB_TIMEOUT_MS=120000

# Maximum generated file size accepted from a worker (50 MB by default).
EXPORT_MAX_OUTPUT_BYTES=52428800

# When the queue is full, run the export in the main process instead of rejecting it.
EXPORT_INLINE_FALLBACK=false
```

## Diagnostics

Open this endpoint while logged in:

```text
/api/export-worker-diagnostics
```

It reports queue depth, active workers, completed jobs, failures, timeouts,
average queue time, and average render time. It does not expose document data.

Generated responses also include these headers:

```text
X-ERP-Export-Mode: worker | inline
X-ERP-Export-Queue-Ms: <milliseconds>
X-ERP-Export-Render-Ms: <milliseconds>
```

## PM2 sizing guidance

With `WEB_CONCURRENCY=2` and `EXPORT_WORKER_CONCURRENCY=1`, the server runs:

- 2 Express/PM2 application workers
- 1 export thread inside each application worker

That is usually a safe starting point for a small server. Avoid increasing both values
at the same time without checking CPU and memory usage.

## Graceful shutdown

`server/local.js` closes export workers during PM2 reload or shutdown. Queued jobs are
cancelled cleanly and active worker threads are terminated before Redis resources close.
