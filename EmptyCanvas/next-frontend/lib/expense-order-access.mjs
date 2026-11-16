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


// One Cash Out may reference several complete orders. The client can specify
// their display order, but labels always come from verified database rows.
export function verifiedExpenseOrderGroups(rows = [], requestedKeys = []) {
  const invalid = (message) => { const error = new Error(message); error.status = 400; throw error; };
  if (!Array.isArray(rows) || !rows.length) invalid("Select at least one order.");
  if (!Array.isArray(requestedKeys) || requestedKeys.length > 25) invalid("Invalid selected order list.");
  const numbers = [...new Set(rows.map((row) => clean(row?.order_number)))];
  if (numbers.some((number) => !/^\d+$/.test(number)) || numbers.length > 25) invalid("Invalid order number.");
  if (!requestedKeys.length && numbers.length === 1) return [verifiedExpenseOrderLabel(rows)];
  if (!requestedKeys.length) invalid("Select all orders using the multi-order picker.");
  const requestedNumbers = requestedKeys.map((key) => {
    const match = clean(key).match(/^(?:ord:|ORD-)(\d+)$/);
    if (!match) invalid("Invalid order reference.");
    return match[1];
  });
  const expected = new Set(numbers);
  if (requestedNumbers.length !== expected.size || new Set(requestedNumbers).size !== expected.size || requestedNumbers.some((number) => !expected.has(number))) {
    invalid("Selected orders do not match the referenced components.");
  }
  return requestedNumbers.map((number) => `ORD-${number}`);
}
