const text = value => String(value ?? "").trim();
const norm = value => text(value).normalize("NFKC").toLowerCase();
const token = value => norm(value).replace(/[^\p{L}\p{N}]+/gu, "");

// Only destinations attached to authorized expense rows and still in the
// directory are offered. A deleted ID must never match a new user by name.
export function buildExpenseDestinationFilters(items = [], directory = []) {
  const byId = new Map();
  const byName = new Map();
  for (const member of directory) {
    const id = text(member?.id), name = text(member?.name);
    if (!id || !name) continue;
    byId.set(id, { id, name });
    const key = norm(name);
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(id);
  }
  const used = new Set();
  const rows = items.map(item => {
    const id = text(item.destinationUserId);
    const matches = byName.get(norm(item.destinationUserName));
    const resolved = id ? (byId.has(id) ? id : "") : (matches?.size === 1 ? [...matches][0] : "");
    if (resolved) used.add(resolved);
    return { ...item, destinationFilterId: resolved };
  });
  return { items: rows, destinationOptions: [...used].map(id => byId.get(id)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}

export const EMPTY_EXPENSE_FILTERS = Object.freeze({ from: "", to: "", fundsType: "", destination: "", otherReason: false });
export function expenseFilterCount(filters = {}) {
  return Number(Boolean(filters.from || filters.to)) + Number(Boolean(filters.fundsType)) + Number(Boolean(filters.destination)) + Number(Boolean(filters.otherReason));
}
export function expenseFundsTypeOptions(items = []) {
  const values = new Map();
  for (const item of items) {
    const label = text(item?.fundsType) || (Number(item?.cashIn) > 0 ? "Cash In" : "Cash Out");
    const key = norm(label);
    if (!values.has(key)) values.set(key, { value: key, label });
  }
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
}
export function isOtherExpenseReason(item) {
  if (Number(item?.cashIn) > 0 || [item?.reason, item?.fundsType].some(v => token(v) === "settledmyaccount")) return false;
  const orders = Array.isArray(item?.orders) ? item.orders.filter(Boolean) : [];
  const manual = new Set(["otherreason", "manualreason", "manual"]);
  // The legacy serializer represents the literal Other reason as an order.
  if (orders.length) return orders.every(order => manual.has(token(order?.label || order?.orderId)) || manual.has(token(order?.orderType)));
  // Older manual tickets can have a free-text reason and no linked orders.
  const raw = text(item?.ordersRaw);
  const emptyRelation = !raw || raw === "[]" || raw === "null" || manual.has(token(raw));
  return Boolean(text(item?.reason)) && !/\bORD[-\s]*\d+\b/i.test(text(item.reason)) && emptyRelation;
}
export function matchesExpenseUserFilters(item, filters = {}, dateKey) {
  if (filters.from || filters.to) {
    const key = dateKey(item?.date || item?.createdTime || item?.created_time);
    if (!key || (filters.from && key < filters.from) || (filters.to && key > filters.to)) return false;
  }
  const fundsType = norm(text(item?.fundsType) || (Number(item?.cashIn) > 0 ? "Cash In" : "Cash Out"));
  if (filters.fundsType && fundsType !== filters.fundsType) return false;
  if (filters.destination && text(item?.destinationFilterId) !== filters.destination) return false;
  if (filters.otherReason && !isOtherExpenseReason(item)) return false;
  return true;
}
