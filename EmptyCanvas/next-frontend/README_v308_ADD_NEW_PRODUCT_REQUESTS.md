# ERP Pyramakerz v308 — Shopping Cart: Add New Product Request

Based on **supabase--main-307.zip**. This ZIP contains only modified/new files; original relative paths are preserved under `EmptyCanvas/next-frontend/`.

## One-time database migration (MUST run first)
1. Back up your production Supabase database / ensure you have a recent backup.
2. In Supabase SQL Editor, run `sql/2026-11-04-product-addition-requests-v308.sql` once.
3. Verify `public.product_addition_requests` exists. This migration is additive and does not modify existing data tables.
4. Deploy the changed code. No automatic SQL migration happens on deploy.

## Behavior
- `Shopping Cart → Request Products`: initial `Add new` is renamed to **Select** (existing Components/Kits).
- Second **Add New** opens product-details form: name, ID code, unit price, unit of measurement, tag, product URL, image, **Qty**. It creates a custom cart item, *not* a Products row.
- New items appear within the existing submitted **Request Products** order, and are stored separately in `product_addition_requests` as `pending`. They are only put in the review queue **after the order is submitted**; abandoned drafts are not submitted.
- `Products → Addition Requests`: users with `products.create` permission can see pending requests, edit details, and use **Add to Products** to approve and create the official Product. The original order row is linked to the approved Product when possible.
- The `Products` catalog does not change automatically on Shopping Cart submission.
- Existing Orders (without new components), Withdraw Products, Maintenance, and source-level permission behavior are preserved.
- New component entry requires **Components** source permission, not Kits-only access. Existing `products.create` manages queue access. Image upload permissions are respected for review edits.
- Quantity edits on the review page are synchronized with an original order only if it is still `Under Supervision` and no quantity has been received. Other orders refuse quantity editing rather than silently modifying an active shipment.
- A pending-component order can't be reopened for order editing until the component is added to Products, to avoid silently losing its unregistered item.
- During the short post-submit Undo window, a successfully undone order also removes the associated pending catalog additions. If an approved product already exists, it is not deleted by Undo.

## QA
- `node --test tests/product-addition-requests-v308.test.mjs tests/shopping-cart-source-permissions-v306.test.mjs`: 9/9 pass.
- Full existing test suite: 802/806 pass; **four pre-existing tests assert exactly 188 permission keys but the v307 source currently has 204**, independent of these changes.
- JSX source files parsed without syntax errors. No live Production requests, migrations, or deployment were performed in this workspace. A live end-to-end test is still required after migration/deployment.

## Notes
- SQL table defaults to `product_addition_requests`. Optional server env var `SUPABASE_PRODUCT_ADDITION_REQUESTS_TABLE` may override it only if you also create the matching table.
- Image files upload to the existing Products Storage bucket using short-lived Supabase signed upload URLs. Unsubmitted draft images might remain unused in Storage and can be cleaned up by a future storage-maintenance routine.
- If an approval completes but the original order row cannot be linked, the review screen displays a warning; review that order manually.
