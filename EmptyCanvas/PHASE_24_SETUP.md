# Orders Phase 24 — Compression and Region Verification

## What this phase does
Phase 23 has already reduced the observed ORD-3 upstream bundle from ~555 KiB to ~320 KiB, with ORD-3 opening in ~1.94 seconds in one screenshot. PostgreSQL query stages together take ~29ms, while reading the Supabase HTTP response body takes ~568ms. **These are individual observed measurements, not a speed guarantee.**

Phase 24 only adds two _transport diagnostics_: the Supabase `Content-Encoding` header and its optional `Content-Length` header. It does **not** change SQL, RPCs, order detail data, sessions, permissions, or the Vercel deployment region.

## Upload
Upload only the changed files in the accompanying ZIP, preserving their exact `EmptyCanvas/...` paths. Nothing needs to be executed in Supabase SQL Editor. Deploy the frontend as usual.

## How to measure
1. Open Operations Orders and enable **Speed**.
2. Open an uncached large order such as ORD-3. Wait 45 seconds after previous openings, or reload the tab. Do this 3–5 times across different times of day.
3. In Speed > Server breakdown, note **Supabase response encoding**, **Upstream Content-Length** (if provided), **Bundle JSON size**, **Supabase: reading response**, and **Vercel region**.
4. Use **Copy timings** and share it. The new fields are `bundleEncoding` and `bundleDeclaredBytes`.

`Bundle JSON size` is the decompressed JSON byte count returned to the Vercel server, not the number of transmitted bytes. `Upstream Content-Length` is shown **only if Supabase supplies the header**; a missing header must not be treated as no compression. `gzip`/`br` means content encoding is active on that response; `not specified` is not conclusive evidence of no intermediate compression.

## Region matching — next decision, not an automatic change
Your earlier logs show Vercel running in `iad1` (Washington, D.C.). Determine the **actual physical location of the Supabase/PostgREST server**:
- Managed Supabase: inspect the Supabase project region.
- Self-hosted Supabase or custom `supabase2.propyramakerz.com`: inspect the VPS/cloud host or server's actual geographic region; a custom domain alone does not disclose it.

If that server is far from `iad1`, test moving the Vercel project's **Function Region** close to the database in a controlled preview deployment. Vercel > Project > Settings > Functions > Function Regions. IMPORTANT: This project also uses Redis/Upstash and session checks; moving functions may help Supabase but worsen authentication, so compare **median of 5 cold opens** and auth/bundle timings before keeping the change. Roll back if the result worsens. Do not move locations based on user location (Egypt) alone; the database is the relevant destination for these backend calls.

Reference: https://vercel.com/docs/functions/configuring-functions/region

## Safety checks
- No database writes, schema changes, session cache changes, or new RPC calls.
- Existing fast-path and compact RPC fallback retained.
- Added HTTP metadata contains no order data, credentials or identities.
- Existing `Cache-Control: private, no-store` remains unchanged.
- Verified using `node next-frontend/scripts/test-order-phase24-transport.mjs` and `node next-frontend/scripts/test-order-compact-bundle.mjs`.
