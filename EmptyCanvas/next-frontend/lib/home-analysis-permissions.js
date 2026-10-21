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

export function homeTeamAnalysisAllowed(account = {}) {
  return featureAllowed(account, "home.analysis");
}

export function homeFinanceAllowed(account = {}) {
  return featureAllowed(account, "home.financial_analysis");
}

export function accountMemberId(account = {}) {
  return clean(account.teamMemberId || account.userSupabaseId || account.id);
}

export function homeSelection(account = {}, requested = "all") {
  if (!homeViewAllowed(account)) return { allowed: false, status: 403, reason: "Home access denied." };
  const id = clean(requested) || "all";
  if (homeTeamAnalysisAllowed(account)) return { allowed: true, userId: id, canSelectUsers: true };
  const self = accountMemberId(account);
  if (!self) return { allowed: false, status: 503, reason: "Unable to verify Home analysis member." };
  if (id !== "all" && id !== self) return { allowed: false, status: 403, reason: "Team analysis access denied." };
  // A default Home navigation is own-scope, never all-team, for view-only users.
  return { allowed: true, userId: self, canSelectUsers: false };
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
