import "server-only";

import { fetchLegacyJson } from "./legacy-api";
import { getProductsList } from "./products-service";

const DEFAULT_ORDER_TYPES = Object.freeze([
  "Request Products",
  "Withdraw Products",
  "Request Maintenance",
]);

function componentItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.products)) return payload.products;
  return [];
}

export async function loadShoppingCartInitialData() {
  // The Shopping Cart only needs the products catalog to paint. Order types are
  // the three fixed ERP flows, while the user/session draft stays lazy in the
  // client because it lives in the established Express session store.
  try {
    const products = await getProductsList();
    return {
      source: "supabase-next",
      orderTypes: [...DEFAULT_ORDER_TYPES],
      components: products,
    };
  } catch (error) {
    // Compatibility for older/customized deployments. This is intentionally a
    // narrow resource fallback instead of the monolithic page-bootstrap call.
    const legacy = await fetchLegacyJson("/api/components", { timeoutMs: 20_000 });
    if (legacy.ok) {
      return {
        source: "legacy-components-fallback",
        orderTypes: [...DEFAULT_ORDER_TYPES],
        components: componentItems(legacy.data),
      };
    }

    const wrapped = new Error(
      legacy.error || legacy.data?.error || error?.message || "Failed to load Shopping Cart products.",
    );
    wrapped.status = legacy.status || error?.status || 502;
    throw wrapped;
  }
}

export const __shoppingCartDataTest = {
  DEFAULT_ORDER_TYPES,
  componentItems,
};
