# v309 — Shopping Cart controls & request metadata

Based on `supabase--main-308.zip`. Changed files only, with their original repository-relative paths.

## UI changes
- Select and Add New choice cards are compact and side-by-side on tablet/mobile. Select uses a checklist icon; Add New uses black styling, including after the first cart item.
- Open and Delete on cart items (including maintenance) now show icons only, with accessible labels and hover tooltips.
- Reason panel additionally contains Priority Level (Low, Normal, High, Urgent; default Normal) and Delivery Date (optional requested date) on Request Products / Withdraw Products.

## Data behavior
- The two metadata values survive local Shopping Cart draft saving and order edit, and are sent through the existing authorized direct-submission endpoint.
- They are stored on each order row, just as Reason is. The same values appear in My Orders, Operations Orders, and Orders Review detail panels when present.
- Maintenance orders are unchanged and are not written to the two new columns.
- Existing orders with no priority/date remain valid (NULL); no backfill occurs. The date represents the *requested* date, not an actual delivery confirmation.

## Required deployment order
1. **Back up production** (this ERP runs on production). Execute `sql/2026-11-04-shopping-cart-priority-delivery-v309.sql` in the production Supabase SQL editor. This is additive and idempotent (`ADD COLUMN IF NOT EXISTS`), with no row updates.
2. Upload only the files in this ZIP in their matching repository paths and deploy.
3. Smoke-test Request Products submission, a reopened order showing priority/date, order editing, Add New and Select, and Maintenance flow. This package was not deployed against the live ERP.

If the application config sets `SUPABASE_ORDERS_TABLE` to something other than `orders`, adapt the migration's table name before running.

## QA
- Source-policy, maintenance, order-flow, edit, and v309 metadata checks run in Node test mode.
- Modified JSX and JS files parsed using the installed TypeScript parser; CSS parsed with `tinycss2`.
