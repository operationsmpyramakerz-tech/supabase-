// The three Operations workspaces share one permission set and one workflow.
export const OPERATIONS_ORDER_PAGES = Object.freeze([
  Object.freeze({ key: "request-products", type: "requestproducts", label: "Request Products", icon: "shopping-cart", route: "/next/operations-orders/request-products" }),
  Object.freeze({ key: "withdraw-products", type: "withdrawproducts", label: "Withdraw Products", icon: "log-out", route: "/next/operations-orders/withdraw-products" }),
  Object.freeze({ key: "request-maintenance", type: "requestmaintenance", label: "Request Maintenance", icon: "tool", route: "/next/operations-orders/request-maintenance" }),
]);

export function operationsPageForType(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return OPERATIONS_ORDER_PAGES.find(page => page.type === key) || null;
}

export function operationsPageForPath(value) {
  const path = String(value ?? "").replace(/\/+$/, "").replace(/^\/next(?=\/)/, "");
  return OPERATIONS_ORDER_PAGES.find(page => page.route.slice(5) === path) || null;
}

// Old bookmarks with a type query continue to work. Never allow query values
// to change the type selected by a canonical workspace path.
export function operationsLegacyDestination(searchParams = {}) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value == null || ["type", "filterType", "orderTypeKey"].includes(key)) continue;
    for (const entry of Array.isArray(value) ? value : [value]) values.append(key, String(entry));
  }
  const rawType = searchParams.type ?? searchParams.filterType ?? searchParams.orderTypeKey;
  const page = operationsPageForType(Array.isArray(rawType) ? rawType[0] : rawType) || OPERATIONS_ORDER_PAGES[0];
  const query = values.toString();
  return `${page.route.slice(5)}${query ? `?${query}` : ""}`;
}
