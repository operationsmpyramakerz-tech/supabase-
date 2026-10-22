import "server-only";
import { select } from "./supabase-rest";
import { expenseReceiptRowChecker } from "./expenses-users-scope";
import { featureAllowed } from "./feature-permissions-registry";
import { expenseLinksReceiptSource } from "./order-receipt-relations.mjs";

const clean = value => String(value ?? "").trim();
function deny(message = "Order receipts are outside your permitted expense scope.", status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function pages(account) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(value => clean(value).toLowerCase()));
}

// Require an actual Expense page as well as its Feature View grant. Legacy
// accounts retain their prior page grants, not an automatic global bypass.
export function receiptPageAccess(account) {
  const allowed = pages(account);
  return {
    own: allowed.has("expenses") && featureAllowed(account, "expenses.view"),
    users: allowed.has("expenses users") && featureAllowed(account, "expenses.users.view"),
  };
}

function expenseSearchTerms(sourceId, sourceRows) {
  const terms = [clean(sourceId)];
  // The same Notion reference was historically stored with and without dashes.
  const uuid = clean(sourceId).replace(/-/g, "").toLowerCase();
  if (/^[\da-f]{32}$/.test(uuid)) {
    terms.push(uuid, `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`);
  }
  // Probe order labels BEFORE component IDs so large multi-component orders do
  // not truncate the human-readable group code out of the candidate search.
  const numbers = [...new Set(sourceRows.map(row => clean(row?.order_number)).filter(n => /^\d+$/.test(n)))];
  for (const n of numbers.slice(0, 8)) {
    terms.push(`ORD-${n}`, `ORDER-${n}`, `ORD ${n}`, `ORDER ${n}`, `ORD${n}`);
  }
  terms.push(...sourceRows.map(row => clean(row?.id)));
  return [...new Set(terms.filter(Boolean))].slice(0, 30);
}

function safeLike(value) {
  return `ilike.*${clean(value).replace(/[\\%*_]/g, match => `\\${match}`)}*`;
}

// Before any image URL is serialized, prove that at least one expense *visible
// to this account* explicitly links to EACH requested order reference.
// No cross-account cache or partial success when a request mixes IDs.
export async function assertReceiptSourcesAccessible(account, sources) {
  if (!account) deny("A signed-in account is required.", 401);
  const access = receiptPageAccess(account);
  if (!access.own && !access.users) deny();
  if (!Array.isArray(sources) || !sources.length || sources.length > 50) deny("Invalid receipt reference count.", 400);

  // Resolve the authenticated expense owner's canonical team-member ID before
  // inspecting the requested relations. This includes historical/settled rows;
  // it does not trust fuzzy employee-name matches in older ledger loaders.
  const canSeeExpense = await expenseReceiptRowChecker(account, access);

  if (sources.some(({ rows }) => !Array.isArray(rows) || !rows.length)) deny("Order receipt reference was not found.", 404);
  // Batch candidate lookups across all source IDs. Query matches are only
  // candidates: exact relation AND owner checks below decide authorization.
  const terms = [...new Set(sources.flatMap(({ sourceId, rows }) => expenseSearchTerms(sourceId, rows)))];
  const safeTerms = terms.filter(term => /^[\p{L}\p{N} :_-]{1,100}$/u.test(term));
  if (!safeTerms.length) deny("Invalid order receipt reference.", 400);
  const candidateMap = new Map();
  const table = clean(process.env.SUPABASE_EXPENSES_TABLE) || "expenses";
  for (let start = 0; start < safeTerms.length; start += 8) {
    const group = safeTerms.slice(start, start + 8);
    const expression = `(${group.flatMap(term => ["orders_raw", "orders_names"].map(column =>
      `${column}.${safeLike(term)}`)).join(",")})`;
    const params = { or: expression, limit: "300" };
    let candidates;
    try {
      candidates = await select(table, {
        ...params,
        select: "id,orders_raw,orders_names,user_id,team_member_name,team_member_raw",
      }, { profileName: "receipts.expense-link-check" });
    } catch (error) {
      // Pre-migration expense schemas sometimes omit team_member_raw.
      // Retain the exact owner check even with a different projection.
      if (Number(error?.status) !== 400) throw error;
      candidates = await select(table, { ...params, select: "*" }, { profileName: "receipts.expense-link-compat" });
    }
    if (!Array.isArray(candidates) || candidates.length >= 300) deny("Receipt expense links are ambiguous.", 503);
    for (const candidate of candidates) {
      const expenseId = clean(candidate?.id);
      if (expenseId) candidateMap.set(expenseId, candidate);
    }
  }
  const candidates = [...candidateMap.values()];
  for (const { sourceId, rows } of sources) {
    const matched = candidates.some(candidate =>
      expenseLinksReceiptSource(candidate, sourceId, rows) && canSeeExpense(candidate));
    if (!matched) deny();
  }
}
