// Pure order reference validation used by Expenses. Never trust labels or
// order numbers submitted by the browser as proof of order ownership.
const clean = value => String(value ?? "").trim();
export function expenseOrderReferenceIds(payload = {}) {
  const input = payload?.orderIds;
  if (input != null && !Array.isArray(input)) {
    const error = new Error("Invalid order relation list."); error.status = 400; throw error;
  }
  const ids = Array.isArray(input) ? input.map(clean).filter(Boolean) : [];
  if (ids.length > 200 || ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    const error = new Error("Invalid order relation list."); error.status = 400; throw error;
  }
  return [...new Set(ids)];
}
export function verifiedExpenseOrderLabel(rows = [], requestedKey = "") {
  if (!rows.length) return "";
  const numbers = new Set(rows.map(row => clean(row?.order_number)));
  if (numbers.size !== 1 || !clean(rows[0]?.order_number)) {
    const error = new Error("Selected components must belong to one order."); error.status = 400; throw error;
  }
  const number = clean(rows[0].order_number);
  const key = clean(requestedKey);
  if (key && key !== `ord:${number}` && key !== `ORD-${number}`) {
    const error = new Error("Order reference does not match selected components."); error.status = 400; throw error;
  }
  return `ORD-${number}`;
}
