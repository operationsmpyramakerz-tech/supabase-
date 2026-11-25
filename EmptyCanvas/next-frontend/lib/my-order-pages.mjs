// MY_ORDERS_THREE_WORKSPACES_V1
import { OPERATIONS_ORDER_PAGES } from "./operations-order-pages.mjs";

export const MY_ORDER_PAGES = Object.freeze(OPERATIONS_ORDER_PAGES.map(page => Object.freeze({
  ...page, route: `/next/orders/${page.key}`,
})));
export function myOrderPageForType(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return MY_ORDER_PAGES.find(page => page.type === key) || null;
}
export function myOrderPageForPath(value) {
  const path = String(value ?? "").replace(/\/+$/, "").replace(/^\/next(?=\/)/, "");
  return MY_ORDER_PAGES.find(page => page.route.slice(5) === path) || null;
}
const first = value => Array.isArray(value) ? value[0] : value;
const TABS = new Set(["all", "under-supervision", "approved", "rejected", "remaining", "shipped", "arrived", "archive"]);
export function myOrderFilters(params = {}) {
  const tab = String(first(params.tab) || "all");
  return { tab: TABS.has(tab) ? tab : "all", query: String(first(params.q) || "").trim() };
}
export function myOrderExplicitPage(params = {}) {
  return myOrderPageForType(first(params.type ?? params.filterType ?? params.orderTypeKey));
}
export function myOrderLegacyDestination(params = {}, fallback = MY_ORDER_PAGES[0]) {
  const page = myOrderExplicitPage(params) || fallback || MY_ORDER_PAGES[0];
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || ["type", "filterType", "orderTypeKey"].includes(key)) continue;
    for (const entry of Array.isArray(value) ? value : [value]) values.append(key, String(entry));
  }
  const query = values.toString();
  return `${page.route.slice(5)}${query ? `?${query}` : ""}`;
}
