Purchase Requisition – Operations Orders live item sync (v286)
Based on supabase--main-285.zip

Purpose
- A saved PR no longer hides changes to products/quantities made later in Operations Orders.
- Every PR open, save, PDF export and Word export uses the current server-verified order items.
- Changes to product names, Products ID Codes, requested quantities and product URLs synchronize automatically.
- Items are keyed by the underlying order-row ID to handle duplicate products and changed row order.
- PR-only fields (PR number, department, dates, notes, signatures, delivery info) stay saved.
- Manually added PR items are retained after they are saved with this version.
- Where a product was replaced, obsolete product-specific model/warranty/expiry is not reused.
- If a saved PR is re-synced on page load, a notice asks the user to Save the refreshed snapshot; PDF/Word already render current items.

Deployment
- Replace only the files in this archive, keeping their paths relative to the repository root.
- No SQL or schema change is required. The new per-item source metadata lives in the existing JSON form_data.
- Production only: verify ORD-125 and other edited orders via the existing PR button, then Save and download PDF/Word.
- Keep the source repository and rollback mechanism available before deployment.

Notes
- Existing legacy PR rows that lack row-ID snapshots are reconciled using matching name/code/position on first opening. After Save, stable row IDs are recorded.
- Pre-existing PR-only item additions made in older versions without a manual flag may require checking after this one-time migration.
- This does not change the visual layout of the PR PDF/Word.

Validation
- 67 related Purchase Requisition and Operations test cases passed.
- JSX parser and JS syntax validation passed.
- A full Next.js build and live Production test were not performed.
