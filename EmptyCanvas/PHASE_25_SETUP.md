# Phase 25 — Place Vercel Functions closer to Egypt-hosted Supabase

## Background
- Supabase is hosted on the company server in Egypt.
- Previous measurements showed Vercel region `iad1` (Washington, D.C., USA).
- First experiment: deploy Vercel Functions in `fra1` (Frankfurt, Germany).
- This change is a Vercel setting only. No SQL, new environment variables, or edits to authentication/data access code.

## Changed file
- `EmptyCanvas/next-frontend/vercel.json`: adds `"regions": ["fra1"]` at the top level.
- Applies to **all Node.js Vercel Functions in this Next.js project** (not just Orders). Static assets remain on Vercel's global CDN.

## Deploy
1. Upload the changed `vercel.json` to the same path in GitHub (keeping the existing rewrites, redirects and settings).
2. Confirm the Vercel project Root Directory is `EmptyCanvas/next-frontend`, so this is the `vercel.json` used for builds. If the deployment has a different root, configure its region in the Vercel Dashboard instead: Project > Settings > Functions > Function Regions > Frankfurt (`fra1`).
3. Wait for a new **Production** deployment to succeed, and hard-refresh the app.
4. Open Operations Orders > Speed > ORD-3. Check that the panel says **Vercel region: fra1**. If it still says **iad1**, the deployment did not apply the setting; check project root and the active deployment before comparing times.
5. Test at least five first-load openings of several large orders on the same connection. Compare median `Click -> visible`, `auth`, `bundle`, `bundleHeaders`, and `bundleBody` with the current US results (roughly 1.9 to 2.5 s full open for ORD-3, varying by request). Include time variance; don't judge from one sample.
6. Test My Orders, Orders Review, Maintenance, login/session, save/update operations, and notification delivery; this config affects **all** functions, and an externally hosted session store may behave differently from Egypt-hosted Supabase.

## If it gets slower
- Try Dubai **`dxb1`** (the letter sequence is d-x-b-one, NOT `dub1`, which is Dublin, Ireland) by replacing `"regions": ["fra1"]` with `"regions": ["dxb1"]` and redeploying. Test the same orders and connection. Or restore the original Vercel setting by deleting the `regions` line (default is normally `iad1`).
- Region selection changes the route of requests and might increase Redis/Upstash latency if that store is hosted elsewhere. It does not move your Egypt database.

## What is not modified
- No order fields, prices, status changes, SQL functions, or permissions.
- No Supabase connection URL, tokens, secrets, or authentication flow changes.

## Verification of code package
- JSON syntax and the presence of the region setting are checked, as is preservation of all previous keys. Build and live-region behavior must be verified on Vercel.
