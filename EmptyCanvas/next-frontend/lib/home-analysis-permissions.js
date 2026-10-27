// Central Home authorization policy. Run on the server before loading analysis data.
import { featureAllowed } from "./feature-permissions-registry";

const clean = (value) => String(value ?? "").trim();

export function homeAdvanced(account = {}) {
  return account?.featureAccess?.mode === "enforced"
    && Object.hasOwn(account.featureAccess.grants || {}, "home.view");
}

export function homeViewAllowed(account = {}) {
  return featureAllowed(account, "home.view");
}

// Data-scope pilot: only Home's user selector uses row-level Own / Team / All.
// A saved scope is not a blanket authorization for any other module.
export function homeAnalysisScope(account = {}) {
  if (!homeViewAllowed(account)) return "none";
  const state = account?.featureAccess;
  // The Home module must be opted in; otherwise preserve the existing legacy policy.
  if (state?.mode !== "enforced" || !Object.hasOwn(state.grants || {}, "home.view")) {
    return featureAllowed(account, "home.analysis") ? "all" : "own";
  }
  if (state.grants?.["home.view"]?.allowed !== true) return "none";
  const grant = state.grants?.["home.analysis"];
  if (grant?.allowed !== true) return "own";
  return ["own", "team", "all"].includes(grant.scope) ? grant.scope : "own";
}

export function homeTeamAnalysisAllowed(account = {}) {
  return ["team", "all"].includes(homeAnalysisScope(account));
}

export function homeFinanceAllowed(account = {}) {
  return featureAllowed(account, "home.financial_analysis");
}

export function accountMemberId(account = {}) {
  return clean(account.teamMemberId || account.userSupabaseId || account.id);
}

// Pure, fail-closed check. A team membership list may only come from the server;
// callers that do not supply it can only authorize the member's own data.
export function homeSelection(account = {}, requested = "all", { teamIds = [] } = {}) {
  if (!homeViewAllowed(account)) return { allowed: false, status: 403, reason: "Home access denied." };
  const scope = homeAnalysisScope(account);
  const requestedId = clean(requested) || "all";
  if (scope === "all") return { allowed: true, userId: requestedId, canSelectUsers: true, analysisScope: scope };
  const self = accountMemberId(account);
  if (!self) return { allowed: false, status: 503, reason: "Unable to verify Home analysis member." };
  if (requestedId === "all" || requestedId === self) {
    return { allowed: true, userId: self, canSelectUsers: scope === "team", analysisScope: scope };
  }
  if (scope === "team" && Array.isArray(teamIds) && teamIds.includes(requestedId)) {
    return { allowed: true, userId: requestedId, canSelectUsers: true, analysisScope: scope };
  }
  return { allowed: false, status: 403, reason: "This member is outside your Home analysis scope." };
}

function canonical(value) {
  return clean(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// This is a *second* gate: a Feature grant must never elevate legacy Page Access.
export function hasExpensesUsersPage(account = {}) {
  const wanted = new Set(["expensesusers", "expensesbyusers", "expensebyusers"]);
  const pages = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const granted = pages.some(row => row?.isEnabled !== false &&
    [row.pageName, row.pageKey, row.routePath, ...(row.aliases || [])].some(alias => wanted.has(canonical(alias))));
  const allowed = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  return granted || allowed.some(alias => wanted.has(canonical(alias)));
}

export function canHomeAccessOtherExpenses(account = {}) {
  return hasExpensesUsersPage(account) && featureAllowed(account, "expenses.users.view");
}
