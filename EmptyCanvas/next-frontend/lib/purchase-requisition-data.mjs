// Shared, dependency-free shape/validation for the purchase requisition form.
export const PR_SIGNERS = ["requester", "manager", "technical", "approver"];
export const PR_COLUMNS = ["code", "description", "unit", "quantity", "model", "warranty", "expiry", "url"];
const string = (value, limit = 240) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit);
export function normalizePrForm(raw = {}) {
  const fields = ["prNumber","requestDate","department","costCenter","requester","workOrder","requestType","priority","requiredDate","deliveryPlace","minShelfLife","inspection","attachments","alternative","stockAvailable","purchaseReason","notes"];
  const form = Object.fromEntries(fields.map(key => [key, string(raw[key], key === "notes" ? 1800 : 250)]));
  form.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 1000).map(item => Object.fromEntries(PR_COLUMNS.map(key => [key, key === "url" ? safePrProductUrl(item?.url) : key === "quantity" ? string(item?.[key], 30) : string(item?.[key], key === "description" ? 280 : 120)])));
  form.signatures = Object.fromEntries(PR_SIGNERS.map(role => [role, {
    name: string(raw.signatures?.[role]?.name, 100),
    signature: string(raw.signatures?.[role]?.signature, 100),
    date: string(raw.signatures?.[role]?.date, 30),
  }]));
  return form;
}
// Only allow web links supplied by Products/approved order data in generated documents.
export function safePrProductUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.href.slice(0, 1800) : "";
  } catch { return ""; }
}

// Match the canonical Products ID Code and URL, without mistaking a database row ID
// or an order's customize_id for the user-visible Products catalogue code.
// An ambiguous product name is never used as a fallback match.
export function prApplyProductCatalog(form, orderRows = [], products = []) {
  const byId = new Map();
  const byUrl = new Map();
  const byName = new Map();
  const norm = value => String(value ?? "").trim().toLocaleLowerCase();
  for (const product of products || []) {
    if (product?.id) byId.set(String(product.id), product);
    const url = safePrProductUrl(product?.url);
    if (url) byUrl.set(url, product);
    const name = norm(product?.name);
    if (name) byName.set(name, byName.has(name) ? null : product);
  }
  return {...form, items:(form.items || []).map((item, index) => {
    const row = orderRows[index] || {};
    const rowName = norm(row.productName);
    const itemName = norm(item.description);
    const sameRow = rowName && itemName === rowName;
    const match = (sameRow && byId.get(String(row.productId || "")))
      || byUrl.get(safePrProductUrl(item.url))
      || byUrl.get(safePrProductUrl(row.productUrl))
      || byName.get(itemName)
      || (sameRow && byName.get(rowName)) || null;
    if (!match) return {...item, url:safePrProductUrl(item.url || (sameRow ? row.productUrl : ""))};
    return {
      ...item,
      code:String(match.displayId || item.code || ""),
      url:safePrProductUrl(match.url || item.url || row.productUrl),
    };
  })};
}
export function prInitialForm(items = [], account = {}, products = []) {
  const first = items[0] || {};
  const numbers = [...new Set(items.map(item => Number(item?.orderIdNumber || item?.orderNumber || item?.order_number)).filter(Number.isFinite))];
  const orderLabel = numbers.length === 1 ? `ORD-${numbers[0]}` : numbers.length ? `ORD-${numbers.join(", ")}` : "";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const initial = normalizePrForm({
    prNumber: orderLabel ? `PR-${orderLabel}` : "",
    requestDate: date,
    requester: first?.createdByName || first?.assignedToName || "",
    workOrder: orderLabel,
    purchaseReason: first?.reason || "",
    items: items.map(item => ({
      code: item?.productIdCode || item?.effectiveIdCode || item?.customizeId || item?.productCode || "",
      url: item?.productUrl || "",
      description: item?.productName || "",
      unit: "قطعة",
      // A purchase request uses requested quantity, not already-received quantity.
      quantity: item?.quantityRequested ?? item?.quantity ?? "",
      model: "", warranty: "", expiry: "",
    })),
    signatures: { requester: { name: first?.createdByName || first?.assignedToName || "" } },
  });
  return prApplyProductCatalog(initial, items, products);
}
