# V425 — Maintenance Report date fields

## Summary
- Header metadata field `Date` is now labeled `Request Date` and displays the order creation timestamp (`payload.createdAt`).
- Each maintenance log's metadata field `Date` is now labeled `Log Date` and displays that specific log's saved `loggedAt` timestamp.
- If a historical log has no saved date, the PDF displays `—` rather than assuming report-generation time, order creation time, or latest row-update time.
- Date/time formatting is explicitly set to `Africa/Cairo` to match the ERP's Egypt-based operation.

## Where maintenance log dates are stored
- PostgreSQL table: `public.orders` (default; may be overridden by `SUPABASE_ORDERS_TABLE`).
- Column: `spare_parts_replaced`.
- Format: JSON string/object; the `logs` array contains objects with a `loggedAt` timestamp per log. The top-level JSON can also contain a latest `loggedAt` value.
- The log date is set in `lib/maintenance-orders-data.js` from `new Date().toISOString()` on save. When an existing log is edited, its original `loggedAt` is preserved.
- Request creation date comes from `notion_created_time`, with fallbacks to `created_time`, `created_at`, and `Created time` in `lib/order-details-data.js`. `payload.createdAt` uses the earliest creation timestamp for all rows of the order.

## Changed files (copy into the same paths in the project)
- `lib/maintenanceReceiptPdf.js`
- `lib/order-export-service.js`

## Regression test
- `tests/maintenance-report-dates-v425.test.mjs`

Run with:

```bash
node --test tests/maintenance-report-dates-v425.test.mjs tests/maintenance-shared-order-details-v306.test.mjs tests/maintenance-review-layout-v368.test.mjs
```

No SQL migration required; existing log data is unchanged. The change applies to newly downloaded maintenance PDFs after deployment. Verified by syntax checks and source/regression tests; not yet validated by rendering a PDF against live ERP data.
