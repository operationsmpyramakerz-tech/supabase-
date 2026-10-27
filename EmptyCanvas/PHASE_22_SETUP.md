# Phase 22 — Order transport diagnostics

## Deployment

1. Upload the changed `EmptyCanvas/next-frontend/` files with their existing paths to GitHub.
2. Deploy the application on Vercel. No SQL changes and no additional environment variables are required.
3. Open Operations Orders (or the other orders pages), enable **Speed**, and open a large order twice at least a minute apart to avoid the page-local 45-second cache.
4. Expand **Server breakdown** and select **Copy timings**.

## New diagnostics (durations in milliseconds)

- `bundleHeaders`: elapsed time for the Vercel server to receive the Supabase RPC HTTP response headers. Includes connection/network, PostgREST, database processing and server-side scheduling. Do not assume it equals database query time.
- `bundleBody`: time reading the Supabase RPC response body on Vercel.
- `bundleParse`: time parsing the Supabase RPC JSON on Vercel.
- **Bundle JSON size (before compression)**: UTF-8 byte length of the RPC JSON response, before HTTP compression; it is **not** a measurement of actual network bytes.
- **Vercel region**: deployment region if Vercel provides `VERCEL_REGION`.

The existing `bundleDb...` SQL timings are still present. Compare `bundleHeaders` to those query timings and inspect body/JSON size before deciding to change schema or deployment region. Review Supabase project region separately; never guess it from a custom database domain.

## Safety

These are diagnostics only. No order values, permissions, API contracts, cache policies, or mutation behavior were changed. The callback receives durations and response byte counts only, with no private order data, URLs, or credentials. Instrumentation errors are isolated from the request. The optional on-screen panel is still user-controlled. No SQL required.

## Recommended interpretation

- Large `bundleHeaders` with tiny `bundleDb...`: investigate geographic proximity, connection setup, PostgREST processing and backend response scheduling.
- Large `bundleBody` or uncompressed byte size: investigate narrower projections or payload compression after confirming all detail fields are needed.
- Large `bundleParse`: investigate JSON decoding/response shape on the server.
- For comparisons, measure multiple uncached opens and use the median rather than a single sample.
