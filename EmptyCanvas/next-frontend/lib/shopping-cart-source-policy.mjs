// Source permissions are about how an item is selected in Shopping Cart.
// The existing order table stores flattened products, not a kit order object.
// For a Kits-only account, verify every submitted product's originating kit
// membership against the trusted kit service, never client-provided names.
const clean = value => String(value ?? "").trim();
const orderKey = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

export async function assertShoppingCartSources({
  orderType = "", products = [], allowComponents = true, allowKits = true, getKit,
} = {}) {
  // Maintenance uses a separate mandatory component-only workflow. For every
  // other cart type (including user-defined types), source restrictions apply.
  if (orderKey(orderType) === "requestmaintenance") return;
  if (!allowComponents && !allowKits) {
    const error = new Error("Neither Components nor Kits are allowed for this account.");
    error.status = 403;
    throw error;
  }
  if (allowComponents && allowKits) return;
  const rows = Array.isArray(products) ? products : [];
  if (!rows.length) return; // Existing submission validation handles empty orders.
  if (!allowKits) {
    if (rows.some(row => Array.isArray(row?.kitSourceIds) && row.kitSourceIds.length)) {
      const error = new Error("Adding Kits is not allowed for this account.");
      error.status = 403;
      throw error;
    }
    return;
  }

  const itemSources = rows.map(row => ({
    productId: clean(row?.id),
    kits: Array.isArray(row?.kitSourceIds) ? [...new Set(row.kitSourceIds.map(clean).filter(Boolean))] : [],
  }));
  if (itemSources.some(row => !row.productId || !row.kits.length || row.kits.length > 15)) {
    const error = new Error("This account can select Kits only. Remove individual Components and select a Kit again.");
    error.status = 403;
    throw error;
  }
  const kitIds = [...new Set(itemSources.flatMap(row => row.kits))];
  if (kitIds.length > 30) {
    const error = new Error("Too many source Kits in this order.");
    error.status = 400;
    throw error;
  }
  if (typeof getKit !== "function") throw new Error("Kit membership lookup is unavailable.");
  const memberships = new Map();
  for (const id of kitIds) {
    const kit = await getKit(id);
    memberships.set(id, new Set((Array.isArray(kit?.items) ? kit.items : []).map(item => clean(item?.productId ?? item?.product_id)).filter(Boolean)));
  }
  if (itemSources.some(row => !row.kits.every(kitId => memberships.get(kitId)?.has(row.productId)))) {
    const error = new Error("One or more components do not belong to the selected source Kits.");
    error.status = 403;
    throw error;
  }
}
