import "server-only";

import { select, selectAll, selectById } from "./supabase-rest";

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).normalize("NFKC").toLowerCase();
const scopeRank = { own: 0, team: 1, all: 2 };
const keys = new Set(["expenses.users.view", "expenses.users.edit", "expenses.users.delete", "expenses.users.export"]);

function fail(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// The View scope caps every other action. No independent Edit/Delete grant may
// expand a user's visibility beyond their View grant.
export function expensesUsersActionScope(account = {}, key = "expenses.users.view") {
  if (!keys.has(key)) return "none";
  const state = account.featureAccess;
  if (state?.mode !== "enforced" || !Object.hasOwn(state.grants || {}, "expenses.users.view")) {
    return "legacy"; // Keep pre-migration accounts unchanged.
  }
  const view = state.grants["expenses.users.view"];
  const action = state.grants[key];
  if (view?.allowed !== true || action?.allowed !== true) return "none";
  const viewScope = clean(view.scope || "all");
  const actionScope = clean(action.scope || "all");
  if (!(viewScope in scopeRank) || !(actionScope in scopeRank)) return "none";
  return scopeRank[viewScope] < scopeRank[actionScope] ? viewScope : actionScope;
}

function accountId(account = {}) {
  return clean(account.teamMemberId || account.userSupabaseId || account.id);
}

// An employee code can be a valid expenses user_id, while a team-members UUID
// is usually NOT the ID stored on expense rows. Resolve identities centrally,
// and reject duplicate aliases instead of guessing which employee owns them.
function indexDirectory(rows = []) {
  const byId = new Map();
  const aliasOwners = new Map();
  for (const row of rows) {
    const id = clean(row?.id);
    if (!id) continue;
    const person = { id, code: clean(row?.employee_code), name: clean(row?.name) };
    byId.set(id, person);
    for (const alias of [person.id, person.code, person.name].map(norm).filter(Boolean)) {
      if (!aliasOwners.has(alias)) aliasOwners.set(alias, new Set());
      aliasOwners.get(alias).add(id);
    }
  }
  return { byId, aliasOwners };
}

function ownerForAlias(index, alias) {
  // A verified member primary key takes precedence over fuzzy display names.
  // Aliases (employee code or name) still require global uniqueness.
  if (index.byId.has(clean(alias))) return clean(alias);
  const owners = index.aliasOwners.get(norm(alias));
  return owners?.size === 1 ? [...owners][0] : "";
}

async function permittedDirectory(account, scope) {
  const self = accountId(account);
  if (!self) fail("Unable to verify employee identity.", 503);
  let team = [];
  if (scope === "team") {
    // Reuse the protected explicit Home reporting links, but without relying on
    // Home Analysis privileges. An unavailable table MUST NOT expand to All.
    let links;
    try {
      links = await select("erp_member_scope_team_links", {
        select: "visible_member_id",
        manager_member_id: `eq.${self}`,
        limit: "5000",
      }, { profileName: "expenses.scope-team-links" });
    } catch {
      fail("Team relationships could not be verified.", 503);
    }
    if (!Array.isArray(links)) fail("Unable to verify team relationships.", 503);
    team = links.map(row => clean(row?.visible_member_id)).filter(Boolean);
  }
  let directory;
  try {
    directory = await selectAll(clean(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members", {
      select: "id,name,employee_code",
      limit: 5000,
      profileName: "expenses.scope-member-identities",
    });
  } catch {
    fail("Employee directory could not be verified.", 503);
  }
  if (!Array.isArray(directory) || directory.length >= 5000) fail("Unable to verify the complete employee directory.", 503);
  const index = indexDirectory(directory);
  if (!index.byId.has(self)) fail("Employee identity is not in the directory.", 503);
  const visible = new Set([self, ...team]);
  return { ...index, visible };
}

function resolveIdentity(index, candidate) {
  const owner = ownerForAlias(index, candidate);
  return owner && index.visible.has(owner) ? index.byId.get(owner) : null;
}

export async function scopeExpenseUsersSummary(account, rows = []) {
  const scope = expensesUsersActionScope(account, "expenses.users.view");
  if (scope === "none") fail("Expenses by Users access denied.");
  if (scope === "all" || scope === "legacy") return rows;
  const index = await permittedDirectory(account, scope);
  return (Array.isArray(rows) ? rows : []).filter(row =>
    Boolean(resolveIdentity(index, row?.id || row?.userId || row?.name)));
}

// Check a requested user BEFORE running its expensive data lookup. The returned
// lookup identifier is canonical for the expenses schema (employee code/name).
export async function resolveExpenseUserAccess(account, key, requestedId) {
  const scope = expensesUsersActionScope(account, key);
  if (scope === "none") fail("Expense access denied.");
  if (!clean(requestedId)) fail("A valid employee identifier is required.", 400);
  if (scope === "all" || scope === "legacy") return clean(requestedId);
  const index = await permittedDirectory(account, scope);
  const member = resolveIdentity(index, requestedId);
  if (!member) fail("This employee is outside the permitted data scope.");
  return member.code || member.name || fail("Employee expenses identity is unavailable.", 503);
}

function ownerOfExpenseRow(index, row = {}) {
  const code = clean(row?.user_id);
  if (code) return ownerForAlias(index, code); // Never fall back to name when the authoritative code disagrees.
  return ownerForAlias(index, row?.team_member_name || row?.team_member_raw);
}

export async function assertExpenseRecordAccess(account, key, expenseId) {
  const scope = expensesUsersActionScope(account, key);
  if (scope === "none") fail("Expense action not permitted.");
  if (!clean(expenseId)) fail("Expense ID is required.", 400);
  if (scope === "legacy" || scope === "all") return;
  const index = await permittedDirectory(account, scope);
  let row;
  try {
    row = await selectById(clean(process.env.SUPABASE_EXPENSES_TABLE) || "expenses", clean(expenseId), {
      profileName: "expenses.scope-row-owner",
    });
  } catch {
    fail("Expense ownership could not be verified.", 503);
  }
  if (!row || !index.visible.has(ownerOfExpenseRow(index, row))) fail("Expense is outside your permitted scope.");
}

// Defense in depth for older expense schemas that can return records via a
// fallback identity matcher. Never return an item whose owner is unexpected.
export async function scopeExpenseDetail(account, key, requestedId, payload) {
  const scope = expensesUsersActionScope(account, key);
  if (scope === "all" || scope === "legacy") return payload;
  const index = await permittedDirectory(account, scope);
  const expected = resolveIdentity(index, requestedId);
  if (!expected) fail("This employee is outside your permitted scope.");
  return {
    ...payload,
    items: (Array.isArray(payload?.items) ? payload.items : []).filter(row => {
      const id = clean(row?.userId);
      const found = id ? ownerForAlias(index, id) : ownerForAlias(index, row?.teamMemberName);
      return found === expected.id;
    }),
  };
}

// Receipt authorization reuses exactly the same canonical owner resolution as
// the Expenses by Users Data Scope. The caller must ALSO verify that an expense
// has an exact order relation; checking employee ownership alone is not enough.
export async function expenseReceiptRowChecker(account, { own = false, users = false } = {}) {
  const usersScope = users ? expensesUsersActionScope(account, "expenses.users.view") : "none";
  const unrestricted = users && (usersScope === "all" || usersScope === "legacy");
  if (unrestricted) return () => true;
  const ownIndex = own ? await permittedDirectory(account, "own") : null;
  const usersIndex = users && ["own", "team"].includes(usersScope)
    ? await permittedDirectory(account, usersScope) : null;
  return row => Boolean(
    (ownIndex && ownIndex.visible.has(ownerOfExpenseRow(ownIndex, row))) ||
    (usersIndex && usersIndex.visible.has(ownerOfExpenseRow(usersIndex, row)))
  );
}
