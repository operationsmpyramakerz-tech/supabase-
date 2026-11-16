# V421 — Operations Orders: Receive Remaining Quantities After Partial Delivery

## Installation (required order)

1. **Backup the `orders` and `stocktaking` tables** before rollout.
2. Run `2026-11-16-operations-remaining-receipts-v421.sql` in the **self-hosted Supabase SQL Editor** (server's `public.orders` table). This installs the atomic receipt-batch database function; it does **not** change any existing order by itself.
3. Deploy the modified frontend/backend source files using their preserved repository-relative paths.
4. Test on a non-production order with a partial delivery and an already-synced stock item, then verify the user's Stocktaking assignment.

**The new Receive Remaining action cannot complete until the SQL function is installed.** The API displays a helpful setup error if the function is missing. The SQL function is callable by `service_role` only, and the route verifies the logged-in user's edit, feature and order-scope permissions before invoking it.

## Workflow

- In **Remaining**, open a partially received/delivered **Request Products** order and select **Received by operations**. Enter **Received now** values, capped by each component's remaining quantity.
- For an outstanding component already marked **Arrived/Delivered**, the SQL function atomically does two things: keeps the original row with its original ID and the **previously delivered quantity**, and creates a new **Shipped** row with **the SAME `order_number`** holding the newly received quantity. The new row has a different ID, starts without a signed delivery receipt, and holds any still-remaining balance.
- If a component is still **Shipped**, the operation increases only its pending received amount; the component has not yet entered stock, so no split is needed.
- The same ORD number now appears in **Shipping** for the new Shipped batch and in **Delivered** for the old Arrived batch. The **Remaining** tab continues to show outstanding amounts.
- From **Shipping**, select **Mark as Delivered**, attach the new signed receipt photos, and deliver **only the Shipped component IDs** (never the already-delivered ones).
- Existing automatic delivery-to-Stock synchronization uses `source_order_id` and imports **only the new Shipped batch's received amount** after its delivery, keeping the previous batches unchanged and preventing re-import of earlier stock items.
- **Send to Stock** remains available for manual reconciliation of eligible delivered rows. Existing Withdraw Products and Maintenance workflows retain their previous receive controls.

### Example

ORD-108: requested 10, already delivered 5, remaining 5, existing Stocktaking source order component `id=20` contains 5.

- Receive 3: original `id=20` stays Arrived with requested=5, received=5, remaining=0. New row `id=21` stays under ORD-108, with requested=5, received=3, remaining=2, status=Shipped.
- Before delivery: old Stocktaking row remains 5. New row is NOT in Stock yet.
- Mark `id=21` Delivered: Stocktaking automatically receives a **new** record linked to `source_order_id=21` with quantity=3. The original 5 remains untouched.
- Still Remaining 2. A later receipt of 2 creates a further Shipped batch under ORD-108; once delivered, only those 2 are added.

## Verification

- Node syntax checks passed for the modified server files; TypeScript JSX parser reported no syntax errors in the modified JSX files.
- Focused existing order, partial delivery and stock regression tests passed alongside `tests/operations-receive-remaining-v421.test.mjs`.
- **Live Supabase integration tests were not run** in this offline environment. The SQL migration must be validated on your self-hosted instance before production rollout.

## Rollback

Revert the modified source files. If no longer needed, remove only the new SQL function with:

```sql
DROP FUNCTION IF EXISTS public.operations_receive_remaining_v421(jsonb, text, text, text);
```

**Do not delete batch rows or change previously synced stock source IDs without auditing actual deliveries first.** Reverting this feature does not automatically merge rows created by subsequent user actions.
