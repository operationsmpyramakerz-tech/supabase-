# V435 — Choose Order: fix floating Cash Out icon horizontal alignment

## Root cause
The shared `expenses-redesign.css` rule animates *every direct child* of `.ex-modal-box` with `expenses-content-enter`. That animation sets `transform: translate3d(0,0,0)` and overrides the cash-out badge's own `translateX(-50%)`, leaving it offset right by half its width.

## Fix
- `public/css/expenses-classic-inline.css`: On the existing floating red Cash Out badge rule, set `animation: none !important` so `left:50%` and `transform:translateX(-50%)` correctly center it, keeping 28px above and below the top edge.
- `app/expenses/page.jsx`: Bust the CSS cache with `v435-cash-out-centered`.
- Tests: assert the animation/transform fix and update stylesheet version assertions.

## Installation
Overlay the files in this archive over `EmptyCanvas/next-frontend/`, preserving their relative paths. Redeploy after copying.

## Verification
- `node --test tests/expenses-*.test.mjs` (32 of 32 passing).
- Still requires actual mobile visual confirmation after deployment.

No API, database, or expense business logic changed.
