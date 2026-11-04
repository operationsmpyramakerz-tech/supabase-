import "server-only";

import { getProductsCatalog } from "./products-service";
import { CREATE_ORDER_TYPES } from "./shopping-cart-support";

function componentItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.products)) return payload.products;
  return [];
}

export async function loadShoppingCartInitialData() {
  // The same Products catalog supplies the official Unit and Tag options.
  // Read it once, instead of fetching separate lists as the form opens.
  const catalog = await getProductsCatalog();
  return {
    source: "supabase-next",
    orderTypes: [...CREATE_ORDER_TYPES],
    components: componentItems(catalog.products),
    tagsCatalog: catalog.tagsCatalog || [],
    unitsCatalog: catalog.unitsCatalog || [],
  };
}

export const __shoppingCartDataTest = {
  DEFAULT_ORDER_TYPES: CREATE_ORDER_TYPES,
  componentItems,
};
