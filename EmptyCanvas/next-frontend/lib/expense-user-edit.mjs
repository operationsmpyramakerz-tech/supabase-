const clean = value => String(value ?? "").trim();
export const expenseOrderCode = value => {
  const match = clean(value).match(/^ORD[-\s]?(\d+)$/i);
  return match ? `ORD-${match[1]}` : "";
};
export function duplicateExpenseOrderReason(reason, orders = []) {
  const raw = clean(reason);
  if (!raw || !orders.length) return false;
  const codes = new Set(orders.flatMap(order => [expenseOrderCode(order?.orderId), expenseOrderCode(order?.label)]).filter(Boolean));
  const segments = raw.split(/[,;،\n]+/).map(clean).filter(Boolean);
  if (segments.length && segments.every(segment => codes.has(expenseOrderCode(segment)))) return true;
  return orders.some(order => [order?.orderId, order?.label].some(value => clean(value) && clean(value).toLowerCase() === raw.toLowerCase()));
}
export function sameExpenseSelection(a = [], b = []) {
  return a.length === b.length && new Set(a).size === new Set(b).size && a.every(value => b.includes(value));
}
export function retainedExpenseReceipts(existing, requested) {
  if (requested === undefined) return existing;
  if (!Array.isArray(requested)) throw Object.assign(new Error("Invalid receipt selection."), { status: 400 });
  const allowed = new Set(existing.map(shot => shot.url));
  if (requested.some(url => !allowed.has(clean(url)))) throw Object.assign(new Error("Unknown receipt reference."), { status: 400 });
  const retained = new Set(requested.map(clean));
  return existing.filter(shot => retained.has(shot.url));
}
