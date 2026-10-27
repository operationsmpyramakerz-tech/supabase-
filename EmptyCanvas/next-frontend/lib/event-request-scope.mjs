// Event Requests scope is explicitly opt-in. Never infer ownership from names.
export const EVENT_REQUEST_SCOPE_MARKER = "events.requests.__scoped";
const rank = Object.freeze({ own: 0, team: 1, all: 2 });
const clean = value => String(value ?? "").trim();
const ROW_KEYS = new Set([
  "events.requests.view", "events.requests.edit", "events.requests.workflow",
  "events.requests.cancel", "events.requests.archive", "events.requests.pdf",
]);

export function eventRequestScopeFor(account = {}, key = "") {
  if (!ROW_KEYS.has(key)) return null;
  const state = account?.featureAccess;
  if (state?.mode !== "enforced" || state.grants?.[EVENT_REQUEST_SCOPE_MARKER]?.allowed !== true) return null;
  const view = state.grants?.["events.requests.view"];
  const action = state.grants?.[key];
  if (view?.allowed !== true || action?.allowed !== true) return "none";
  const v = clean(view.scope || "all");
  const a = clean(action.scope || "all");
  if (!Object.hasOwn(rank,v) || !Object.hasOwn(rank,a)) return "none";
  return rank[v] <= rank[a] ? v : a;
}

export function eventRequestOwnerAllowed(event = {}, scope = null, ids = []) {
  if (scope === null || scope === "all") return true;
  if (scope === "none") return false;
  const owner = clean(event?.createdByUserId ?? event?.created_by_user_id);
  return owner.length > 0 && Array.isArray(ids) && ids.includes(owner);
}

export function eventRequestCardAllowed(policy, key, event = {}) {
  if (!policy?.scopes || !Object.hasOwn(policy.scopes,key)) return true;
  const scope = policy.scopes[key];
  const ids = scope === "own" ? [policy.self] : policy.visibleIds;
  return eventRequestOwnerAllowed(event,scope,ids);
}
