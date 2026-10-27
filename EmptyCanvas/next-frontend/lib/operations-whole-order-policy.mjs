// Dependency-free validation for destructive order-wide Operations mutations.
// PostgREST queries have a 1,000-row default cap. A truncated response can
// look like a complete order: fail closed when the limit is reached.
const id = value => String(value ?? "").trim();

export function validateWholeOperationsOrder(requestedIds, selectedRows, savedRows) {
  if (!Array.isArray(requestedIds) || !requestedIds.length || requestedIds.length >= 1000) {
    return { ok: false, reason: "invalid-selection" };
  }
  if (!Array.isArray(selectedRows) || !Array.isArray(savedRows) || savedRows.length >= 1000) {
    return { ok: false, reason: "incomplete-query" };
  }
  const requested = requestedIds.map(id);
  const requestedSet = new Set(requested);
  if (requestedSet.size !== requested.length || requestedSet.has("")) return { ok: false, reason: "duplicate-request" };
  if (selectedRows.length !== requested.length || savedRows.length !== requested.length) {
    return { ok: false, reason: "partial-selection" };
  }
  const numbers = new Set(selectedRows.map(row => id(row?.order_number)));
  if (numbers.size !== 1 || !/^\d+$/.test([...numbers][0] || "")) return { ok: false, reason: "mixed-orders" };
  const savedNumbers = new Set(savedRows.map(row => id(row?.order_number)));
  if (savedNumbers.size !== 1 || !savedNumbers.has([...numbers][0])) return { ok: false, reason: "mixed-saved-orders" };
  const selectedSet = new Set(selectedRows.map(row => id(row?.id)));
  const savedSet = new Set(savedRows.map(row => id(row?.id)));
  if (selectedSet.size !== requested.length || savedSet.size !== requested.length) return { ok: false, reason: "duplicate-saved-ids" };
  if (requested.some(item => !selectedSet.has(item) || !savedSet.has(item))) return { ok: false, reason: "stale-selection" };
  return { ok: true };
}
