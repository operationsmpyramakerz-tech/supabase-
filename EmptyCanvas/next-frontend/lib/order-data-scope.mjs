// Shared, dependency-free scope rules for the opt-in Orders data-scope pilot.
// Legacy permission profiles are intentionally unaffected.
export const ORDER_SCOPE_MARKERS = Object.freeze({
  "orders.my": "orders.my.__scoped",
  "orders.operations": "orders.operations.__scoped",
  "orders.maintenance": "orders.maintenance.__scoped",
});
const rank = { own: 0, team: 1, all: 2 };
const clean = (value) => String(value ?? "").trim();

export function orderScopeFor(account = {}, key = "") {
  const module = key.startsWith("orders.my.") ? "orders.my" : key.startsWith("orders.operations.") ? "orders.operations" : key.startsWith("orders.maintenance.") ? "orders.maintenance" : "";
  if (!module) return null;
  const state = account?.featureAccess;
  if (state?.mode !== "enforced" || state.grants?.[ORDER_SCOPE_MARKERS[module]]?.allowed !== true) return null;
  const view = state.grants?.[`${module}.view`];
  // Prior Phase 2P4A profiles may not yet contain the new, more granular
  // details grant. Inherit the same row scope as View until configured.
  const fallback = key === "orders.my.view_details" ? "orders.my.view"
    : key === "orders.operations.details" ? "orders.operations.view" : "";
  const grant = state.grants?.[key] ?? (fallback ? state.grants?.[fallback] : undefined);
  if (view?.allowed !== true || grant?.allowed !== true) return "none";
  const a = clean(view.scope || "all");
  const b = clean(grant.scope || "all");
  if (!(a in rank) || !(b in rank)) return "none";
  return rank[a] <= rank[b] ? a : b;
}

export function ownerInOrderScope(row = {}, scope, visibleIds = []) {
  if (scope === null) return true; // legacy path retains legacy checks
  if (scope === "all") return true;
  if (scope === "none") return false;
  // Never infer ownership from names, schools, department or other free text.
  // Imported records with no trustworthy member ID are inaccessible via Own/Team.
  const owner = clean(row?.team_member_id ?? row?._scopeOwnerId ?? row?.teamMemberId);
  return Boolean(owner) && visibleIds.includes(owner);
}

// Presentation-only policy: the server's fresh scope check is authoritative.
// The UI uses the same owner-ID rules to hide actions for out-of-scope cards.
export function orderCardAllows(policy, action, group) {
  if (!policy?.scopes || !Object.hasOwn(policy.scopes, action)) return true;
  const scope = policy.scopes[action];
  if (scope === "all") return true;
  if (scope === "none") return false;
  const ids = scope === "own" ? [policy.self] : policy.visibleIds;
  const items = Array.isArray(group?.items) && group.items.length ? group.items : [group];
  return items.every(item => {
    const owner = clean(item?.createdById ?? item?.teamMemberId);
    return Boolean(owner) && Array.isArray(ids) && ids.includes(owner);
  });
}
