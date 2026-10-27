# Orders performance — Phase 21 (mobile diagnostics and regression check)

No SQL changes are required. Upload only the files in this package to their identical paths in the repository.

## What's changed
- Server-Timing now appears as readable auth/bundle/preparation figures and expandable PostgreSQL query stages instead of one very long string.
- Last five observed opening times have a median, fastest and slowest time to avoid chasing single-network outliers.
- Speed enabled from the in-page button now instruments detailed API requests even after navigation to another orders page (the earlier code checked only the URL parameter, not the enabled session state).
- Raw JSON timings are unchanged and can still be copied using **Copy timings**.
- Does not change the detail retrieval logic, SQL, permissions, caches, editing, or response payloads.

## How to compare
1. Deploy the changed UI files.
2. In Operations Orders tap **Speed** and open several different uncached orders, e.g. ORD-3, ORD-7, ORD-11. Note the five-run median.
3. Expand **Server breakdown → PostgreSQL query stages** and copy the timings. These stages come from the Phase 20 SQL RPC already installed.
4. If bundle remains the biggest part, examine its SQL stage values. If all SQL stage values are small but bundle is high, the difference can be connection/PostgREST overhead or unmeasured SQL work; don't infer an index fix from bundle time alone.

## Checks performed
- JavaScript and JSX syntax parsed using TypeScript's parser.
- Node tests passed for server timing parsing and rolling median calculations.
- ZIP contents and file paths verified.
- Vercel build and live Supabase performance not measured in this environment.
