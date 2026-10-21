import "server-only";

import { rpc, select } from "./supabase-rest";
import { isKnownFeature, featureAllowed } from "./feature-permissions-registry";
import { buildSerializableFeatureGrants } from "./feature-grants-transfer.mjs";

const profilesTable = "erp_member_feature_profiles";
const grantsTable = "erp_member_feature_grants";
const grantCache = new Map();

function requireServerCredential() {
  // With only an anon key, RLS returns zero rows for protected grant tables,
  // which would incorrectly look like a legacy profile (privilege bypass).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY) return;
  const error = new Error("Advanced permissions require a Supabase service-role credential on the server.");
  error.status = 503;
  throw error;
}

function clean(value) { return String(value ?? "").trim(); }

// No cross-request profile cache: comparing its incrementing version on every
// gated request makes grant revocations visible across server instances.
export async function loadMemberFeatureAccess(memberId) {
  if (process.env.ERP_ADVANCED_PERMISSIONS_ENABLED !== "1") return { mode: "legacy" };
  requireServerCredential();
  const id = clean(memberId);
  if (!id) throw new Error("A verified member ID is required for feature permissions.");
  const profiles = await select(profilesTable, {
    select: "team_member_id,enabled,version",
    team_member_id: `eq.${id}`,
    limit: "1",
  }, { profileName: "auth.feature-profile" });
  const profile = profiles?.[0];
  if (!profile?.enabled) return { mode: "legacy" };

  const version = Number(profile.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid member feature permission version.");
  const cacheKey = `${id}:${version}`;
  const cached = grantCache.get(cacheKey);
  if (cached) return cached;
  const rows = await select(grantsTable, {
    select: "permission_key,is_allowed,data_scope",
    team_member_id: `eq.${id}`,
    limit: "1000",
  }, { profileName: "auth.feature-grants" });
  const grants = buildSerializableFeatureGrants(rows, isKnownFeature);
  const result = { mode: "enforced", version, grants };
  for (const key of grantCache.keys()) if (key.startsWith(`${id}:`)) grantCache.delete(key);
  grantCache.set(cacheKey, result);
  if (grantCache.size > 300) grantCache.delete(grantCache.keys().next().value);
  return result;
}

export function invalidateFeaturePermissionCache(memberId = "") {
  const id = clean(memberId);
  if (!id) { grantCache.clear(); return; }
  for (const key of grantCache.keys()) if (key.startsWith(`${id}:`)) grantCache.delete(key);
}

export function featureGate(gate, key, options = {}) {
  if (!gate?.ok) return gate;
  if (featureAllowed(gate.account, key, options)) return gate;
  return { ...gate, ok: false, status: 403, error: `Permission ${key} is not allowed.` };
}

// The replacement is a single database transaction (SQL RPC). Never delete
// and reinsert grants from separate HTTP requests: partial saves could revoke
// some actions while retaining stale privileges for others.
export async function replaceMemberFeatureAccess(memberId, rows, { enabled = true } = {}) {
  if (process.env.ERP_ADVANCED_PERMISSIONS_ENABLED !== "1") {
    const error = new Error("Advanced permissions are not enabled on this server.");
    error.status = 503;
    throw error;
  }
  requireServerCredential();
  const id = clean(memberId);
  if (!id) { const error = new Error("Missing member ID."); error.status = 400; throw error; }
  if (!Array.isArray(rows) || rows.length > 250) {
    const error = new Error("Invalid feature list."); error.status = 400; throw error;
  }
  const unique = new Set();
  const grants = rows.map((entry) => {
    const key = clean(entry?.key || entry?.permission_key);
    const scope = clean(entry?.scope || entry?.data_scope) || "all";
    if (!isKnownFeature(key) || unique.has(key) || !["own", "assigned", "team", "all"].includes(scope)) {
      const error = new Error(`Invalid or duplicate feature permission: ${key}`); error.status = 400; throw error;
    }
    unique.add(key);
    return { key, allowed: entry?.allowed === true, scope };
  });
  const result = await rpc("erp_replace_member_feature_grants", {
    p_member_id: id,
    p_grants: grants,
    p_enabled: enabled === true,
  }, { profileName: "permissions.replace-grants" });
  invalidateFeaturePermissionCache(id);
  return { enabled: enabled === true, version: Number(result?.[0]?.version || 0), grants };
}

export function getFeaturePermissionSetupStatus() {
  if (process.env.ERP_ADVANCED_PERMISSIONS_ENABLED !== "1") return { available: false, reason: "server_flag_disabled" };
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)) return { available: false, reason: "missing_service_credential" };
  return { available: true, reason: "ready" };
}

export async function getMemberFeatureAccessForAdmin(memberId) {
  const setup = getFeaturePermissionSetupStatus();
  if (!setup.available) return { ...setup, enabled: false, grants: [] };
  requireServerCredential();
  const id = clean(memberId);
  if (!id) { const error = new Error("Missing member ID."); error.status = 400; throw error; }
  const [profiles, grants] = await Promise.all([
    select(profilesTable, { select: "enabled,version", team_member_id: `eq.${id}`, limit: "1" }),
    select(grantsTable, { select: "permission_key,is_allowed,data_scope", team_member_id: `eq.${id}`, limit: "1000" }),
  ]);
  return {
    available: true,
    enabled: profiles?.[0]?.enabled === true,
    version: Number(profiles?.[0]?.version || 0),
    grants: (grants || []).filter(row => isKnownFeature(row.permission_key)).map(row => ({
      key: row.permission_key, allowed: row.is_allowed === true, scope: row.data_scope || "all",
    })),
  };
}
