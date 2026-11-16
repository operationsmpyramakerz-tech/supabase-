import "server-only";

import { insert, isSupabaseConfigured } from "./supabase-rest";

/**
 * Server-only audit writer owned by Chat 09. This MUST be invoked by the owner
 * of each successful mutation/login/logout endpoint, using its VERIFIED server
 * session account. Do not expose this helper through an unauthenticated client
 * POST route, and never accept actor identity from a request body.
 *
 * History currently is a read-only legacy table until these integrations exist.
 */
function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function tableName() {
  return clean(process.env.SUPABASE_HISTORY_TABLE, 200) || "operation_history";
}

function safeCode(value) {
  const code = Number(value);
  return Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
}

function normalizeMethod(value) {
  const method = clean(value, 12).toUpperCase();
  return ["POST", "PATCH", "PUT", "DELETE", "GET"].includes(method) ? method : null;
}

export async function recordHistoryForAccount({
  account,
  memberId,
  pageName,
  pageKey,
  actionLabel,
  actionKey,
  entityType = "",
  entityId = "",
  entityLabel = "",
  method = "",
  path = "",
  statusCode = 200,
  durationMs = null,
} = {}) {
  if (!isSupabaseConfigured()) throw new Error("History auditing requires a configured Supabase service connection.");
  const actorId = clean(memberId || account?.teamMemberId || account?.memberId || account?.id || account?.userSupabaseId, 120);
  const actorName = clean(account?.name || account?.username, 160);
  const action = clean(actionLabel, 180);
  const page = clean(pageName, 120);
  if (!account || !actorId || !actorName) throw new Error("History actor must come from a verified server account.");
  if (!action || !page) throw new Error("History actionLabel and pageName are required.");
  const duration = Number(durationMs);
  const payload = {
    actor_team_member_id: actorId,
    actor_name: actorName,
    actor_department: clean(account?.department, 120),
    actor_position: clean(account?.position, 120),
    page_key: clean(pageKey || page.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 120),
    page_name: page,
    action_key: clean(actionKey || action.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 120),
    action_label: action,
    entity_type: clean(entityType, 120),
    entity_id: clean(entityId, 160),
    entity_label: clean(entityLabel, 220),
    method: normalizeMethod(method),
    path: clean(path, 500),
    status_code: safeCode(statusCode),
    duration_ms: Number.isFinite(duration) && duration >= 0 && durationMs !== null ? Math.round(duration) : null,
    created_at: new Date().toISOString(),
  };
  return await insert(tableName(), payload);
}
