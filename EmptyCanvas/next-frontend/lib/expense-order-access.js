import "server-only";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { select } from "./supabase-rest";
import { orderScopeFor } from "./order-data-scope.mjs";
import { resolveOrderScope, visibleOrderRow } from "./order-data-scope";
import { expenseOrderReferenceIds, verifiedExpenseOrderLabel } from "./expense-order-access.mjs";

const KEYS = ["orders.my.view", "orders.operations.view"];
function deny(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
async function allowedScopes(account) {
  const enabled = KEYS.filter(key => orderScopeFor(account, key) !== null);
  if (!enabled.length) return null; // Data Scope not opted into: legacy behavior.
  const resolved = [];
  for (const key of enabled) {
    if (orderScopeFor(account, key) === "none") continue;
    resolved.push(await resolveOrderScope(account, key));
  }
  return resolved;
}
async function verifiedRows(ids) {
  if (!ids.length || ids.length > 200) deny("Invalid order references.", 400);
  const rows = await loadRawOrderRowsByIds(ids);
  const indexed = new Map((Array.isArray(rows) ? rows : []).map(row => [String(row?.id || "").trim(), row]));
  if (ids.some(id => !indexed.has(id))) deny("Selected order components were not found.", 404);
  return ids.map(id => indexed.get(id));
}
function rowsAllowed(rows, scopes) {
  return rows.every(row => scopes.some(scope => visibleOrderRow(row, scope)));
}

export async function assertExpenseOrderReferences(account, payload = {}) {
  const scopes = await allowedScopes(account);
  if (scopes === null) return null;
  const ids = expenseOrderReferenceIds(payload);
  if (!ids.length) {
    if (String(payload?.orderId || "").trim()) deny("Select a verified order before linking the expense.", 400);
    return null; // Manual expenses are not order-linked.
  }
  const rows = await verifiedRows(ids);
  const orderLabel = verifiedExpenseOrderLabel(rows, payload?.orderId);
  // Validate the ENTIRE order group, not a user-selected subset of its rows.
  // Otherwise an attacker could submit only an in-scope component from a
  // multi-owner order and create an unauthorized expense association.
  const numericOrder = orderLabel.slice(4);
  if (!/^\d+$/.test(numericOrder)) deny("Unsupported order number.", 400);
  const group = await select(String(process.env.SUPABASE_ORDERS_TABLE || "orders"), {
    select: "*", order_number: `eq.${numericOrder}`, limit: "5001",
  }, { profileName: "expenses.verify-linked-order-group" });
  if (!Array.isArray(group) || !group.length || group.length >= 5001) deny("Order group could not be fully verified.", 503);
  const expected = new Set(group.map(row => String(row?.id || "").trim()));
  if (expected.size !== ids.length || ids.some(id => !expected.has(id))) {
    deny("Select all verified components of the order.", 400);
  }
  if (!rowsAllowed(group, scopes)) deny("Order is outside your permitted data scope.");
  return { orderLabel };
}

export async function scopeExpenseOrderOptions(account, options = []) {
  const scopes = await allowedScopes(account);
  if (scopes === null) return options;
  // Picker results must be reduced on the server, rather than rendered then hidden.
  const candidateOptions = [];
  const uniqueIds = new Set();
  for (const option of options) {
    let ids;
    try { ids = expenseOrderReferenceIds({ orderIds: option?.relationIds }); } catch { continue; }
    if (!ids.length) continue;
    // Avoid unbounded scans when older schemas expose unusually large groups.
    if (uniqueIds.size + ids.length > 5000) deny("Order picker is too large to verify safely.", 503);
    ids.forEach(id => uniqueIds.add(id));
    candidateOptions.push({ option, ids });
  }
  if (!candidateOptions.length) return [];
  const allIds = [...uniqueIds];
  const indexed = new Map();
  for (let i = 0; i < allIds.length; i += 200) {
    const rows = await loadRawOrderRowsByIds(allIds.slice(i, i + 200));
    for (const row of rows || []) indexed.set(String(row?.id || "").trim(), row);
  }
  return candidateOptions.filter(({ option, ids }) => {
    if (!ids.every(id => indexed.has(id))) return false;
    const rows = ids.map(id => indexed.get(id));
    try { verifiedExpenseOrderLabel(rows, option.id); } catch { return false; }
    return rowsAllowed(rows, scopes);
  }).map(({ option }) => option);
}
