import "server-only";
import { loadOperationsOrderDetails } from "./operations-orders-data";
import { getProductsForOrderDetails } from "./products-service";
import { prInitialForm, prSyncSavedWithLiveOrder, prClearLegacyAutofilledNumber } from "./purchase-requisition-data.mjs";

// Called after permission and order-scope checks. Always reload order details,
// so a PR opened earlier cannot overwrite or export stale components.
export async function prRefreshItemsFromOrder(orderIds, submittedForm, account = {}) {
  // Reuse the Products snapshot from the order-detail enrichment when present.
  const productsSnapshot = [];
  const items = await loadOperationsOrderDetails(orderIds, { productsSink: productsSnapshot });
  const wanted = new Set(orderIds.map(String));
  const found = new Set((items || []).map(row => String(row.id ?? "")));
  if (!items?.length || wanted.size !== found.size || [...wanted].some(id => !found.has(id))) {
    const error = new Error("Order components changed. Reopen the Purchase Requisition from the current order.");
    error.status = 409;
    throw error;
  }
  const products = productsSnapshot.length ? productsSnapshot : await getProductsForOrderDetails(items);
  const live = prInitialForm(items, account, products);
  const saved = prClearLegacyAutofilledNumber(submittedForm, live.workOrder);
  return prSyncSavedWithLiveOrder(saved, live);
}
