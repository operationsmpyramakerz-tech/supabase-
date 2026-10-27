# Orders Workspace — Phase 26: stable speed measurements

Baseline observed after the `fra1` Vercel region change (October 2026):
- ORD-3: 1,357 ms
- ORD-6: 1,324 ms
- ORD-36: 1,203 ms
- ORD-54: 1,116 ms

These are user-provided *individual* Click → Visible measurements, not a controlled benchmark. The region is already configured in `next-frontend/vercel.json`; do not change it for this phase.

## What changed

- The four order screens assign a private, anonymous opening-attempt number when a card is clicked.
- Speed diagnostics now distinguish **API request**, **Memory cache**, **Reused pending request**, and **Already loaded**.
- The visible/render/API measurements are matched by opening attempt. A cache hit cannot inherit the previous opening's API or Supabase timing.
- A new click clears stale readings immediately, and a late response from an older opening cannot override the current attempt.
- All changes are client-side diagnostics only. No changes to Supabase, authorization, order storage, FastPath RPC, pagination, exports, or mutations.

## Install

Copy only the files in this ZIP into the matching repository paths. Commit to GitHub and wait for Vercel deployment. **No SQL migration required.**

## Verify

1. Open Operations Orders, enable **Speed**, then click an order.
2. Open the same order again within 45 seconds: the second reading should say **Memory cache**; API timing should display `—` rather than reusing the old request's time.
3. Open another order with a fresh request: it should say **API request**, with the corresponding server timing.
4. Repeat in My Orders, Orders Review, and Maintenance Orders, checking the existing functions still work.
5. Test one changed order after mutation to confirm the usual cache invalidation remains intact.

The anonymous attempt number is diagnostic only; it is not an order ID. Measurements are kept only in the browser and are not sent to the database.

## Tests

From `EmptyCanvas/next-frontend`:

```sh
node --experimental-default-type=module scripts/test-orders-opening-phase26.mjs
node --experimental-default-type=module scripts/test-order-phase24-transport.mjs
node scripts/test-order-compact-bundle.mjs
node scripts/test-order-proposal-full-bundle.mjs
```

Static JS/JSX syntax checks passed. A full Vercel build and production API run were not available in the offline workspace; validate after deployment.
