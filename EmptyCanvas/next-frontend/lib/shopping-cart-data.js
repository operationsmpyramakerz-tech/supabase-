import "server-only";

import { getProductsList } from "./products-service";
import { CREATE_ORDER_TYPES } from "./shopping-cart-support";

function componentItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.products)) return payload.products;
  return [];
}

export async function loadShoppingCartInitialData() {
  const products = await getProductsList();
  return {
    source: "supabase-next",
    orderTypes: [...CREATE_ORDER_TYPES],
    components: componentItems(products),
  };
}

export const __shoppingCartDataTest = {
  DEFAULT_ORDER_TYPES: CREATE_ORDER_TYPES,
  componentItems,
};
