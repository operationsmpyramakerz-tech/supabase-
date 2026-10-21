// Explicit opt-in. Existing Task Management grants keep legacy data visibility.
export const TASK_SCOPE_MARKER = "tasks.__scoped";
const rank = Object.freeze({ own: 0, team: 1, all: 2 });
const clean = (value) => String(value ?? "").trim();

export function taskScopeFor(account = {}, key = "") {
  if (!key.startsWith("tasks.")) return null;
  const state = account?.featureAccess;
  if (state?.mode !== "enforced" || state.grants?.[TASK_SCOPE_MARKER]?.allowed !== true) return null;
  const view = state.grants?.["tasks.view"];
  const action = state.grants?.[key];
  if (view?.allowed !== true || action?.allowed !== true) return "none";
  const v = clean(view.scope || "all");
  const a = clean(action.scope || "all");
  if (!Object.hasOwn(rank, v) || !Object.hasOwn(rank, a)) return "none";
  return rank[v] <= rank[a] ? v : a;
}

export function taskOwnerAllowed(ticket = {}, scope = "none", permittedIds = []) {
  if (scope === null || scope === "all") return true;
  if (scope === "none") return false;
  // Never fall back to a matching person's name or their department.
  const ownerId = clean(ticket?.createdById ?? ticket?.created_by_id);
  return !!ownerId && permittedIds.includes(ownerId);
}

export function taskAssigneeAllowed(assignment = {}, scope = "none", permittedIds = []) {
  if (scope === null || scope === "all") return true;
  if (scope === "none") return false;
  const assigneeId = clean(assignment?.assigneeId ?? assignment?.assignee_id);
  return !!assigneeId && permittedIds.includes(assigneeId);
}

// UI hint only; the server checks the live scope for every mutation.
export function taskCardAllows(policy, key, ticket = {}, { personalWork = false } = {}) {
  if (!policy?.scopes || !Object.hasOwn(policy.scopes, key)) return true;
  const scope = policy.scopes[key];
  if (scope === "all") return true;
  if (scope === "none") return false;
  const ids = scope === "own" ? [policy.self] : (policy.teamIds || []);
  if (personalWork) {
    return Array.isArray(ticket.scopeAssigneeIds) && ticket.scopeAssigneeIds.some(id => ids.includes(id));
  }
  return taskOwnerAllowed(ticket, scope, ids);
}
