import "server-only";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { select } from "./supabase-rest";
import { orderScopeFor } from "./order-data-scope.mjs";
import { resolveOrderScope, visibleOrderRow } from "./order-data-scope";
import { expenseOrderReferenceIds, verifiedExpenseOrderLabel, verifiedExpenseOrderGroups } from "./expense-order-access.mjs";

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
function createdByName(row = {}) {
  return String(row?.team_member_name || row?.teams_members || row?.created_by_name || row?.created_by || row?.supervisor || "").trim();
}
async function enrichOrderNames(options = [], indexed = null) {
  const firstIds = [...new Set(options.map((option) => String(option?.relationIds?.[0] || "").trim()).filter(Boolean))];
  if (!firstIds.length) return options;
  const names = new Map(indexed || []);
  const missing = firstIds.filter((id) => !names.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    for (const row of await loadRawOrderRowsByIds(missing.slice(i, i + 200))) {
      names.set(String(row?.id || "").trim(), row);
    }
  }
  return options.map((option) => ({ ...option, createdByName: createdByName(names.get(String(option?.relationIds?.[0] || "").trim())) }));
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
  const ids = expenseOrderReferenceIds(payload);
  if (!ids.length) {
    if (String(payload?.orderId || "").trim() || (Array.isArray(payload?.orderKeys) && payload.orderKeys.length)) {
      deny("Select verified orders before linking the expense.", 400);
    }
    return null; // Manual expenses are not order-linked.
  }
  const rows = await verifiedRows(ids);
  const requestedKeys = Array.isArray(payload.orderKeys) && payload.orderKeys.length
    ? payload.orderKeys : (String(payload?.orderId || "").trim() ? [payload.orderId] : []);
  const labels = verifiedExpenseOrderGroups(rows, requestedKeys);
  const numbers = labels.map((label) => label.slice(4));

  // Validate the ENTIRE set of selected order groups. A browser must not be
  // able to link just one visible component of an otherwise private order.
  const group = await select(String(process.env.SUPABASE_ORDERS_TABLE || "orders"), {
    select: "*", order_number: `in.(${numbers.join(",")})`, limit: "5001",
  }, { profileName: "expenses.verify-linked-order-group" });
  if (!Array.isArray(group) || !group.length || group.length >= 5001) deny("Order group could not be fully verified.", 503);
  const expected = new Set(group.map((row) => String(row?.id || "").trim()));
  if (expected.size !== ids.length || ids.some((id) => !expected.has(id))) {
    deny("Select all verified components of the order.", 400);
  }
  if (scopes !== null && !rowsAllowed(group, scopes)) deny("Order is outside your permitted data scope.");
  return { orderLabel: labels.join(", "), orderLabels: labels };
}

export async function scopeExpenseOrderOptions(account, options = []) {
  const scopes = await allowedScopes(account);
  if (scopes === null) return await enrichOrderNames(options);
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
  }).map(({ option }) => ({ ...option, createdByName: createdByName(indexed.get(String(option?.relationIds?.[0] || "").trim())) }));
}
