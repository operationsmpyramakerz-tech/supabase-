import "server-only";

import { isSupabaseConfigured, select, selectAll } from "./supabase-rest";

const PAGE_ADMIN_BYPASS_TOKEN = "__OPS_PAGE_ADMIN_BYPASS__";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function token(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(token).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(token(key))) return value;
  }
  return null;
}

function aliasesForPage(value = "") {
  const clean = token(value);
  const groups = {
    currentorders: ["currentorders", "orders", "currentorder"],
    requestedorders: ["requestedorders", "operationsorders", "operationsrequestedorders", "schoolsrequestedorders"],
    operationsorders: ["operationsorders", "requestedorders", "operationsrequestedorders", "schoolsrequestedorders"],
    maintenanceorders: ["maintenanceorders", "maintenance"],
    ordersreview: ["ordersreview", "svorders", "supervisionorders"],
    eventrequests: ["eventrequests", "eventsrequests", "events", "eventsnew", "eventsrequestsnew", "eventsrequestscreate"],
    eventcomponents: ["eventcomponents", "events"],
    eventcalendar: ["eventcalendar", "eventscalendar", "events"],
  };
  return new Set([clean, ...(groups[clean] || [])].filter(Boolean));
}

function rowMatchesPage(row = {}, pageName = "") {
  const wanted = aliasesForPage(pageName);
  const candidates = [
    row?.pageName,
    row?.pageKey,
    row?.routePath,
    ...(Array.isArray(row?.aliases) ? row.aliases : []),
  ].map(token).filter(Boolean);
  return candidates.some((candidate) => wanted.has(candidate));
}

function builtInAdmin(account = {}) {
  const name = token(account?.name || account?.username);
  const position = token(account?.position);
  return name === "admin" || position.includes("admin");
}

export function directPageAccessLevel(account = {}, pageNameOrNames = []) {
  if (builtInAdmin(account)) return "admin";
  const requested = (Array.isArray(pageNameOrNames) ? pageNameOrNames : [pageNameOrNames]).map(text).filter(Boolean);
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : null;
  if (!rows) return null;

  const rank = { view: 1, edit: 2, admin: 3 };
  let best = "";
  for (const row of rows) {
    if (row?.isEnabled === false) continue;
    if (!requested.some((pageName) => rowMatchesPage(row, pageName))) continue;
    const raw = text(row?.accessLevel || row?.access_level).toLowerCase();
    const level = raw === "admin" ? "admin" : raw === "view" ? "view" : "edit";
    if (!best || rank[level] > rank[best]) best = level;
  }
  return best;
}

export function directPageMutationAccess(account = {}, pageNameOrNames = []) {
  const level = directPageAccessLevel(account, pageNameOrNames);
  if (level === null) return null;
  return level === "edit" || level === "admin";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

async function adminPasswordFromSupabase() {
  if (!isSupabaseConfigured()) return { supported: false, password: "" };

  let candidates = [];
  let hadSuccessfulLookup = false;
  const attempts = [
    { select: "*", name: "ilike.admin", limit: "10" },
    { select: "*", position: "ilike.*admin*", limit: "20" },
  ];

  for (const params of attempts) {
    try {
      const rows = await select(teamMembersTable(), params);
      hadSuccessfulLookup = true;
      if (Array.isArray(rows) && rows.length) candidates.push(...rows);
    } catch {
      // Older/custom schemas may reject one of these filters. Keep trying.
    }
    if (candidates.length) break;
  }

  if (!candidates.length) {
    try {
      const rows = await selectAll(teamMembersTable(), { limit: 1000 });
      hadSuccessfulLookup = true;
      candidates = Array.isArray(rows) ? rows : [];
    } catch {
      return { supported: false, password: "" };
    }
  }
  if (!hadSuccessfulLookup) return { supported: false, password: "" };

  const adminRow = candidates.find((row) => token(valueFor(row, ["name", "Name"])) === "admin")
    || candidates.find((row) => token(valueFor(row, ["position", "Position"])).includes("admin"))
    || candidates.find((row) => token(valueFor(row, ["name", "Name"])).includes("admin"));
  if (!adminRow) return { supported: false, password: "" };

  const password = text(valueFor(adminRow, ["password", "Password"]));
  if (!password) return { supported: false, password: "" };
  return { supported: true, password };
}

// Mirrors the established Express _verifyPageAdminPassword behavior:
// page-level Admin access accepts any non-empty password field, otherwise the
// shared Admin user's password is checked in Supabase. `null` means the direct
// schema cannot prove compatibility and the caller should use Legacy fallback.
export async function verifyPageAdminPasswordDirect(account = {}, password = "", pageNameOrNames = []) {
  const clean = text(password);
  if (!clean || clean === PAGE_ADMIN_BYPASS_TOKEN) return false;

  const level = directPageAccessLevel(account, pageNameOrNames);
  if (level === "admin") return true;
  if (level === null) return null;

  const admin = await adminPasswordFromSupabase();
  if (!admin.supported) return null;
  return admin.password === clean;
}

// Verify the shared Admin account password exactly, without the page-Admin
// convenience bypass. Events workflow actions use this stronger check because
// the product intentionally asks for the shared password even when the signed-in
// user already has Admin access to the Events page.
export async function verifySharedAdminPasswordDirect(password = "") {
  const clean = text(password);
  if (!clean || clean === PAGE_ADMIN_BYPASS_TOKEN) return false;
  const admin = await adminPasswordFromSupabase();
  if (!admin.supported) return null;
  return admin.password === clean;
}

export const __orderActionAuthTest = {
  aliasesForPage,
  rowMatchesPage,
  builtInAdmin,
};
