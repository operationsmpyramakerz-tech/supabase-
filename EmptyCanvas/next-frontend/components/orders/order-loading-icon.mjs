// ERP_COMPACT_ORDER_LIST_LOADING_V1
// Match the existing OrderTypeBadge / secondary navigation icon vocabulary.
export function orderLoadingIcon(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  switch (key) {
    case "requestproducts": return "shopping-cart";
    case "withdrawproducts": return "log-out";
    case "requestmaintenance": return "tool";
    default: return "layers";
  }
}
