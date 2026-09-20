import "server-only";

import { performance } from "node:perf_hooks";
import { recordPerformanceSample } from "./performance-profiler";
import { select, selectAll } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";

const VISIBILITY_CACHE_TTL_MS = 15_000;
const visibilityCache = new Map();
const visibilityInflight = new Map();

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
  }
  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function tableName() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function safeId(value) {
  return String(value || "").trim().replace(/[^0-9A-Za-z_-]/g, "");
}

function safeName(value) {
  return String(value || "").trim().replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
}

function splitValues(value) {
  if (value === null || typeof value === "undefined") return [];
  if (Array.isArray(value)) return value.flatMap(splitValues).filter(Boolean);
  if (value && typeof value === "object") {
    const source = Array.isArray(value.values) ? value.values : Object.values(value);
    return source.flatMap(splitValues).filter(Boolean);
  }

  const raw = String(value || "").trim();
  if (!raw || /^null$/i.test(raw)) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.flatMap(splitValues).filter(Boolean);
  } catch {}
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw.slice(1, -1)
      .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
      .map((item) => item.trim().replace(/^\"|\"$/g, "").replace(/\\\"/g, '"'))
      .filter(Boolean);
  }
  return raw.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

function accountMemberId(account = {}) {
  return safeId(account.teamMemberId || account.userSupabaseId || account.id || account.userId);
}

function accountName(account = {}) {
  return safeName(account.username || account.name);
}

function cacheKey(account = {}) {
  const id = accountMemberId(account);
  if (id) return `id:${id}`;
  const name = canonical(accountName(account));
  return name ? `name:${name}` : "";
}

function memberMatchesAccount(row = {}, account = {}) {
  const wantedId = accountMemberId(account);
  const rowId = safeId(valueFor(row, ["id", "ID"]));
  if (wantedId && rowId && wantedId === rowId) return true;
  const wantedName = canonical(accountName(account));
  const rowName = canonical(valueFor(row, ["name", "Name", "full_name", "Full Name"]));
  return !!wantedName && !!rowName && wantedName === rowName;
}

async function loadReviewerRow(account = {}) {
  const memberId = accountMemberId(account);
  if (memberId) {
    try {
      const rows = await select(tableName(), {
        select: "*",
        id: `eq.${memberId}`,
        limit: "2",
      }, { profileName: "reviewer-visibility.member-by-id" });
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {}
  }

  const name = accountName(account);
  if (name) {
    try {
      const rows = await select(tableName(), {
        select: "*",
        name: `ilike.${name}`,
        limit: "5",
      }, { profileName: "reviewer-visibility.member-by-name" });
      const exact = (Array.isArray(rows) ? rows : []).find((row) => memberMatchesAccount(row, account));
      if (exact) return exact;
    } catch {}
  }

  // Compatibility only for custom/legacy schemas. This path should be rare;
  // the normal direct-session account already carries the canonical member ID.
  const rows = await selectAll(tableName(), {
    limit: 5000,
    profileName: "reviewer-visibility.member-fallback",
  });
  return (Array.isArray(rows) ? rows : []).find((row) => memberMatchesAccount(row, account)) || null;
}

function normalizeStoredIds(value) {
  return splitValues(value).map(safeId).filter(Boolean);
}

async function resolveReviewerVisibility(account = {}) {
  const current = await loadReviewerRow(account);
  if (!current) return { ids: [], names: [], queryNames: [] };

  const currentId = safeId(valueFor(current, ["id", "ID"]));
  let ids = [];
  let names = [];

  if (currentId) {
    try {
      const rows = await select("team_member_sv_schools", {
        select: "visible_team_member_id,visible_team_member_name",
        team_member_id: `eq.${currentId}`,
        limit: "5000",
      }, { profileName: "reviewer-visibility.junction" });
      if (Array.isArray(rows) && rows.length) {
        ids = rows.map((row) => safeId(row.visible_team_member_id)).filter(Boolean);
        names = rows.map((row) => text(row.visible_team_member_name)).filter(Boolean);
      }
    } catch {
      // Older schemas keep the visibility list directly on team_members.
    }
  }

  if (!ids.length) {
    ids = normalizeStoredIds(valueFor(current, ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"]));
  }
  if (!names.length) {
    names = splitValues(valueFor(current, ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"])).map(text).filter(Boolean);
  }

  if (names.length) {
    // Reuse the shared 30s lightweight directory rather than downloading the
    // entire team_members table separately from Home and Orders Review.
    const members = await listTeamMembersLite().catch(() => []);
    const byName = new Map((Array.isArray(members) ? members : []).map((member) => [canonical(member?.name), member]));
    for (const name of names) {
      const key = canonical(name);
      const member = byName.get(key);
      const id = safeId(member?.id);
      if (id) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }

  const cleanNames = [...new Set(names.map(text).filter(Boolean))];
  return {
    ids: [...new Set(ids.map(safeId).filter(Boolean))],
    names: cleanNames,
    // Always keep the assigned names in the database-side visibility query.
    // Older/manual order rows can have team_member_name populated while
    // team_member_id is null. Dropping a name merely because it resolved to a
    // Team Members ID makes those legitimate orders disappear from Review.
    queryNames: cleanNames,
  };
}

export async function getReviewerVisibility(account = {}, { fresh = false } = {}) {
  const key = cacheKey(account);
  if (!key) return { ids: [], names: [], queryNames: [] };
  if (fresh) visibilityCache.delete(key);

  const cached = visibilityCache.get(key);
  if (!fresh && cached?.expiresAt > Date.now()) return cached.value;
  if (!fresh && visibilityInflight.has(key)) return await visibilityInflight.get(key);

  const startedAt = performance.now();
  const pending = resolveReviewerVisibility(account);
  if (!fresh) visibilityInflight.set(key, pending);
  let ok = false;
  try {
    const result = await pending;
    ok = true;
    visibilityCache.set(key, {
      value: result,
      expiresAt: Date.now() + VISIBILITY_CACHE_TTL_MS,
    });
    if (visibilityCache.size > 100) visibilityCache.delete(visibilityCache.keys().next().value);
    return result;
  } finally {
    if (!fresh && visibilityInflight.get(key) === pending) visibilityInflight.delete(key);
    recordPerformanceSample({
      category: "auth",
      name: "reviewer-visibility",
      durationMs: performance.now() - startedAt,
      ok,
      status: ok ? 200 : 500,
      meta: { cached: false },
    });
  }
}

export function invalidateReviewerVisibility(account = null) {
  if (!account) {
    visibilityCache.clear();
    visibilityInflight.clear();
    return;
  }
  const key = cacheKey(account);
  if (key) {
    visibilityCache.delete(key);
    visibilityInflight.delete(key);
  }
}

export const __reviewerVisibilityTest = {
  safeId,
  splitValues,
  cacheKey,
};
