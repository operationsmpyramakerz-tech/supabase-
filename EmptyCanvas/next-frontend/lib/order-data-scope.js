import "server-only";
import { select } from "./supabase-rest";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { orderScopeFor, ownerInOrderScope } from "./order-data-scope.mjs";

function deny(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function clean(v) { return String(v ?? "").trim(); }

// One lookup per request; never treat an unavailable Team table as global access.
export async function resolveOrderScope(account = {}, key = "") {
  const scope = orderScopeFor(account, key);
  if (scope === null || scope === "all") return { scope, visibleIds: [] };
  if (scope === "none") deny("This order action is not permitted.");
  const self = clean(account.teamMemberId || account.userSupabaseId);
  if (!self) deny("Order owner identity could not be verified.", 503);
  if (scope === "own") return { scope, visibleIds: [self] };
  let links;
  try {
    links = await select("erp_member_scope_team_links", {
      select: "visible_member_id",
      manager_member_id: `eq.${self}`,
      limit: "5000",
    }, { profileName: "orders.scope-team-links" });
  } catch {
    deny("Order team relationships could not be verified.", 503);
  }
  if (!Array.isArray(links) || links.length >= 5000) deny("Order team relationships could not be verified.", 503);
  return {
    scope,
    visibleIds: [...new Set([self, ...links.map(link => clean(link.visible_member_id)).filter(Boolean)])],
  };
}

export function visibleOrderRow(row, resolved) {
  return ownerInOrderScope(row, resolved?.scope ?? null, resolved?.visibleIds || []);
}

// All requested components must belong to the permitted scope; do not filter
// the list before modifying it (which could silently perform partial updates).
export async function assertOrderIdsInScope(account, permissionKey, requestedIds) {
  const resolved = await resolveOrderScope(account, permissionKey);
  if (resolved.scope === null) return;
  const ids = [...new Set((Array.isArray(requestedIds) ? requestedIds : [requestedIds])
    .map(clean).filter(Boolean))];
  if (!ids.length || ids.length > 5000) deny("Invalid order component count.", 400);
  // Combined Excel exports can legitimately select thousands of components.
  // Verify in bounded batches rather than trimming IDs and accidentally
  // authorizing an unchecked tail of the request.
  for (let offset = 0; offset < ids.length; offset += 400) {
    const batch = ids.slice(offset, offset + 400);
    const rows = await loadRawOrderRowsByIds(batch);
    const found = new Map((Array.isArray(rows) ? rows : []).map(row => [clean(row.id), row]));
    if (batch.some(id => !found.has(id))) deny("Order components could not be found.", 404);
    if (batch.some(id => !visibleOrderRow(found.get(id), resolved))) deny("Order is outside your permitted data scope.");
  }
}

export async function orderUiScopePolicy(account, featureKeys = {}) {
  const scopes = Object.fromEntries(Object.entries(featureKeys).map(([action, key]) =>
    [action, orderScopeFor(account, key)]).filter(([, scope]) => scope !== null));
  if (!Object.keys(scopes).length) return null;
  const self = clean(account.teamMemberId || account.userSupabaseId);
  const requiresIdentity = Object.values(scopes).some(scope => scope === "own" || scope === "team");
  if (!self && requiresIdentity) deny("Order owner identity could not be verified.", 503);
  let visibleIds = self ? [self] : [];
  const teamKey = Object.entries(featureKeys).find(([action]) => scopes[action] === "team")?.[1];
  if (teamKey) visibleIds = (await resolveOrderScope(account, teamKey)).visibleIds;
  return { self, visibleIds, scopes };
}
