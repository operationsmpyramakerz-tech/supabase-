// Shared, dependency-free shape/validation for the purchase requisition form.
export const PR_SIGNERS = ["requester", "manager", "technical", "approver"];
export const PR_COLUMNS = ["code", "description", "unit", "quantity", "model", "warranty", "expiry"];
const string = (value, limit = 240) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit);
export function normalizePrForm(raw = {}) {
  const fields = ["prNumber","requestDate","department","costCenter","requester","workOrder","requestType","priority","requiredDate","deliveryPlace","minShelfLife","inspection","attachments","alternative","stockAvailable","purchaseReason","notes"];
  const form = Object.fromEntries(fields.map(key => [key, string(raw[key], key === "notes" ? 1800 : 250)]));
  form.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 1000).map(item => Object.fromEntries(PR_COLUMNS.map(key => [key, key === "quantity" ? string(item?.[key], 30) : string(item?.[key], key === "description" ? 280 : 120)])));
  form.signatures = Object.fromEntries(PR_SIGNERS.map(role => [role, {
    name: string(raw.signatures?.[role]?.name, 100),
    signature: string(raw.signatures?.[role]?.signature, 100),
    date: string(raw.signatures?.[role]?.date, 30),
  }]));
  return form;
}
export function prInitialForm(items = [], account = {}) {
  const first = items[0] || {};
  const numbers = [...new Set(items.map(item => Number(item?.orderIdNumber || item?.orderNumber || item?.order_number)).filter(Number.isFinite))];
  const orderLabel = numbers.length === 1 ? `ORD-${numbers[0]}` : numbers.length ? `ORD-${numbers.join(", ")}` : "";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  return normalizePrForm({
    prNumber: orderLabel ? `PR-${orderLabel}` : "",
    requestDate: date,
    requester: first?.createdByName || first?.assignedToName || "",
    workOrder: orderLabel,
    purchaseReason: first?.reason || "",
    items: items.map(item => ({
      code: item?.customizeId || item?.productCode || "",
      description: item?.productName || "",
      unit: "قطعة",
      // A purchase request uses requested quantity, not already-received quantity.
      quantity: item?.quantityRequested ?? item?.quantity ?? "",
      model: "", warranty: "", expiry: "",
    })),
    signatures: { requester: { name: first?.createdByName || first?.assignedToName || "" } },
  });
}
