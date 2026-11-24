// Orders Review workspaces: one existing supervisor workflow, three type-scoped pages.
export const REVIEW_ORDER_PAGES = Object.freeze([
  Object.freeze({ key: "request-products", type: "requestproducts", label: "Request Products", icon: "shopping-cart", route: "/next/orders-review/request-products" }),
  Object.freeze({ key: "withdraw-products", type: "withdrawproducts", label: "Withdraw Products", icon: "log-out", route: "/next/orders-review/withdraw-products" }),
  Object.freeze({ key: "request-maintenance", type: "requestmaintenance", label: "Request Maintenance", icon: "tool", route: "/next/orders-review/request-maintenance" }),
]);

function normalizeType(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function reviewPageForType(value) {
  return REVIEW_ORDER_PAGES.find(page => page.type === normalizeType(value)) || null;
}

export function reviewPageForPath(value) {
  const path = String(value || "").replace(/\/+$/, "").replace(/^\/next(?=\/)/, "");
  return REVIEW_ORDER_PAGES.find(page => page.route.slice(5) === path) || null;
}

export function reviewLegacyDestination(searchParams = {}) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value == null || ["type", "filterType", "orderTypeKey"].includes(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) values.append(key, String(item));
  }
  const selectedType = searchParams.type ?? searchParams.filterType ?? searchParams.orderTypeKey;
  const page = reviewPageForType(Array.isArray(selectedType) ? selectedType[0] : selectedType) || REVIEW_ORDER_PAGES[0];
  const search = values.toString();
  return `${page.route.slice(5)}${search ? `?${search}` : ""}`;
}
