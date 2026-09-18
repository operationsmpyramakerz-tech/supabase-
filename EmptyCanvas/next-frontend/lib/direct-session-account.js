import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { select, selectAll, selectById } from "./supabase-rest";

const SESSION_LOOKUP_TIMEOUT_MS = 3500;
const APP_PAGES_CACHE_TTL_MS = 60_000;
const MEMBER_ACCESS_CACHE_TTL_MS = 2_500;

let appPagesCache = null;
let appPagesInflight = null;
const memberAccessCache = new Map();
const memberAccessInflight = new Map();

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.email || value.url);
  }
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

function directUrl(value) {
  const raw = valueFor({ value }, ["value"]);
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = directUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (raw && typeof raw === "object") {
    return text(raw.url || raw.publicUrl || raw.public_url || raw.href || raw.src);
  }
  return "";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function accessLevel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "admin") return "admin";
  if (raw === "view") return "view";
  return "edit";
}

function pageAliases(value = "") {
  const normalized = token(value);
  const groups = {
    currentorders: ["currentorders", "orders", "currentorder"],
    requestedorders: ["requestedorders", "operationsorders", "operationsrequestedorders"],
    operationsorders: ["operationsorders", "requestedorders", "operationsrequestedorders"],
    maintenanceorders: ["maintenanceorders", "maintenance"],
    createneworder: ["createneworder", "shoppingcart", "ordersnew", "neworder"],
    ordersreview: ["ordersreview", "svorders", "supervisionorders"],
    expensesusers: ["expensesusers", "expensesbyuser", "expensesbyusers"],
    userscenter: ["userscenter", "useraccessdata", "useraccess", "teammembers"],
    useraccessdata: ["userscenter", "useraccessdata", "useraccess", "teammembers"],
    backup: ["backup", "backups", "database", "systemdatabase", "systembackup"],
    kpis: ["kpis", "kpi"],
    proposals: ["proposals", "productproposals"],
    kits: ["kits", "productkits"],
    events: ["events", "eventcalendar", "eventrequests", "eventcomponents"],
    eventcalendar: ["eventcalendar", "eventscalendar", "events"],
    eventrequests: ["eventrequests", "events"],
    eventcomponents: ["eventcomponents", "events"],
    taskmanagement: ["taskmanagement", "departmenttickets", "taskmanagementtickets"],
    departmenttickets: ["taskmanagement", "departmenttickets", "taskmanagementtickets"],
    alltasks: ["alltasks", "taskmanagement", "departmenttickets", "taskmanagementtickets"],
    mytasks: ["mytasks", "taskmanagement", "departmenttickets", "taskmanagementtickets"],
    delegatedtasks: ["delegatedtasks", "taskmanagement", "departmenttickets", "taskmanagementtickets"],
    b2c: ["b2c", "businesstocustomer", "customerdatabase", "customerform"],
    customerdatabase: ["customerdatabase", "b2c", "b2ccustomerdatabase"],
    customerform: ["customerform", "b2c", "b2ccustomerform"],
  };
  return Array.from(new Set([normalized, ...(groups[normalized] || [])].filter(Boolean)));
}

const LEGACY_PAGE_KEY_NAMES = Object.freeze({
  "current-orders": "Current Orders",
  "operations-orders": "Requested Orders",
  "maintenance-orders": "Maintenance Orders",
  "shopping-cart": "Create New Order",
  stocktaking: "Stocktaking",
  products: "Products",
  proposals: "Proposals",
  "product-proposals": "Proposals",
  kits: "Kits",
  "product-kits": "Kits",
  "orders-review": "Orders Review",
  expenses: "Expenses",
  "expenses-users": "Expenses Users",
  b2b: "B2B",
  "task-management": "Task Management",
  taskmanagement: "Task Management",
  "department-tickets": "Task Management",
  departmenttickets: "Task Management",
  "task-management-all-tasks": "All Tasks",
  "all-tasks": "All Tasks",
  "task-management-my-tasks": "My Tasks",
  "my-tasks": "My Tasks",
  "task-management-delegated-tasks": "Delegated Tasks",
  "delegated-tasks": "Delegated Tasks",
  b2c: "B2C",
  "b2c-customer-database": "Customer Database",
  "customer-database": "Customer Database",
  "b2c-customer-form": "Customer Form",
  "customer-form": "Customer Form",
  kpis: "KPIs",
  kpi: "KPIs",
  events: "Events",
  "event-calendar": "Event Calendar",
  "events-calendar": "Event Calendar",
  "event-requests": "Event Requests",
  "event-components": "Event Components",
  history: "History",
  "system-history": "History",
  backup: "Backup",
  "back-up": "Backup",
  database: "Backup",
  "system-database": "Backup",
  "system-backup": "Backup",
  "user-access-data": "Users Center",
  "users-center": "Users Center",
});

function legacyPageName(page = {}) {
  const key = String(page.page_key || page.pageKey || "").trim().toLowerCase();
  if (LEGACY_PAGE_KEY_NAMES[key]) return LEGACY_PAGE_KEY_NAMES[key];
  const name = text(page.page_name || page.pageName || page.name);
  return name || text(page.route_path || page.routePath);
}

function expandUiAliases(values = []) {
  const set = new Set(values.map((value) => text(value)).filter(Boolean));
  const add = (...items) => items.forEach((item) => item && set.add(item));

  if (set.has("Requested Orders")) add("Schools Requested Orders", "Operations Orders");
  if (set.has("Products")) add("Product", "Components", "/products");
  if (set.has("Proposals")) add("Saved Quotations", "/proposals");
  if (set.has("Kits")) add("Product Kits", "Saved Kits", "/kits");
  if (set.has("Task Management")) add("All Tasks", "My Tasks", "Delegated Tasks", "/task-management", "/task-management/all-tasks", "/task-management/my-tasks", "/task-management/delegated-tasks");
  if (set.has("All Tasks")) add("/task-management/all-tasks");
  if (set.has("My Tasks")) add("/task-management/my-tasks");
  if (set.has("Delegated Tasks")) add("/task-management/delegated-tasks");
  if (set.has("Events")) add("Event Calendar", "Event Requests", "Event Components", "/events", "/events/calendar", "/events/requests", "/events/components");
  if (set.has("Event Calendar")) add("/events/calendar");
  if (set.has("Event Requests")) add("/events/requests");
  if (set.has("Event Components")) add("/events/components");
  if (set.has("B2C")) add("Customer Database", "Customer Form", "/b2c/database", "/b2c/form");
  if (set.has("Customer Database")) add("B2C Customer Database", "/b2c/database");
  if (set.has("Customer Form")) add("B2C Customer Form", "/b2c/form");
  if (set.has("Users Center")) add("User Access & Data", "User Access and Data", "User Access", "Team Members");

  return Array.from(set);
}

function safeDecodeCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function base64NoPadding(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/=+$/g, "");
}

function unsignSessionCookie(rawValue, secret) {
  const raw = safeDecodeCookie(rawValue);
  const normalized = raw.startsWith("s:") ? raw.slice(2) : raw;
  const splitAt = normalized.lastIndexOf(".");
  if (splitAt <= 0) return "";
  const sid = normalized.slice(0, splitAt);
  const signature = normalized.slice(splitAt + 1);
  if (!sid || !signature) return "";

  const expected = base64NoPadding(crypto.createHmac("sha256", secret).update(sid).digest());
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return "";
  return sid;
}

async function upstashCommand(command) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const tokenValue = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !tokenValue) {
    const error = new Error("Direct Upstash REST session access is not configured.");
    error.code = "DIRECT_SESSION_UNAVAILABLE";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      const error = new Error(payload?.error || `Upstash REST request failed with HTTP ${response.status}`);
      error.code = "DIRECT_SESSION_READ_FAILED";
      throw error;
    }
    return payload?.result;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Direct session lookup timed out after ${SESSION_LOOKUP_TIMEOUT_MS}ms.`);
      timeoutError.code = "DIRECT_SESSION_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSessionValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

async function readDirectSession() {
  const cookieStore = await cookies();
  const cookieName = String(process.env.SESSION_COOKIE_NAME || "op.sid").trim() || "op.sid";
  const cookie = cookieStore.get(cookieName);
  if (!cookie?.value) return { definitive: true, status: 401, session: null, error: "Authentication required." };

  const secret = String(process.env.SESSION_SECRET || "dev-fallback-secret");
  const sid = unsignSessionCookie(cookie.value, secret);
  if (!sid) return { definitive: true, status: 401, session: null, error: "Invalid session cookie." };

  let values;
  try {
    // RedisStore uses `op:<sid>` while the REST fallback store uses
    // `op:sess:<sid>`. MGET supports both deployment modes without guessing.
    values = await upstashCommand(["MGET", `op:${sid}`, `op:sess:${sid}`]);
  } catch (error) {
    return { definitive: false, status: 503, session: null, error: error?.message || "Direct session lookup failed." };
  }

  const candidates = Array.isArray(values) ? values : [values];
  const sessionValue = candidates.map(parseSessionValue).find(Boolean) || null;
  if (!sessionValue) {
    // The REST endpoint can point at a different Redis deployment than the URL
    // session store. Let the legacy bridge decide rather than logging the user out.
    return { definitive: false, status: 503, session: null, error: "Session was not found in the direct REST store." };
  }

  if (!sessionValue.authenticated) {
    return { definitive: true, status: 401, session: null, error: "Authentication required." };
  }

  const expiresAt = sessionValue?.cookie?.expires ? new Date(sessionValue.cookie.expires).getTime() : 0;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return { definitive: true, status: 401, session: null, error: "Session expired." };
  }

  const userId = text(sessionValue.userSupabaseId || sessionValue.userNotionId);
  if (userId) {
    try {
      const revokedAt = Number(await upstashCommand(["GET", `op:auth-revoked:${userId}`])) || 0;
      const issuedAt = Number(sessionValue.authIssuedAt || 0);
      if (revokedAt && issuedAt <= revokedAt) {
        return { definitive: true, status: 401, session: null, error: "Session invalidated." };
      }
    } catch (error) {
      // Do not bypass a revocation check when the direct Redis read is unhealthy.
      return { definitive: false, status: 503, session: null, error: error?.message || "Session revocation lookup failed." };
    }
  }

  return { definitive: true, status: 200, session: sessionValue, error: "" };
}

async function listAppPages() {
  const now = Date.now();
  if (appPagesCache?.expiresAt > now) return appPagesCache.value;
  if (appPagesInflight) return await appPagesInflight;

  const pending = selectAll("app_pages", { limit: 1000, order: "sort_order.asc" });
  appPagesInflight = pending;
  try {
    const rows = await pending;
    appPagesCache = { value: Array.isArray(rows) ? rows : [], expiresAt: Date.now() + APP_PAGES_CACHE_TTL_MS };
    return appPagesCache.value;
  } finally {
    if (appPagesInflight === pending) appPagesInflight = null;
  }
}

async function listMemberAccess(memberId) {
  const id = text(memberId);
  if (!id) return [];
  const cached = memberAccessCache.get(id);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (memberAccessInflight.has(id)) return await memberAccessInflight.get(id);

  const pending = select("team_member_page_access", {
    select: "*",
    team_member_id: `eq.${id}`,
    limit: "1000",
  }).then((rows) => Array.isArray(rows) ? rows : []);
  memberAccessInflight.set(id, pending);
  try {
    const rows = await pending;
    memberAccessCache.set(id, { value: rows, expiresAt: Date.now() + MEMBER_ACCESS_CACHE_TTL_MS });
    if (memberAccessCache.size > 250) memberAccessCache.delete(memberAccessCache.keys().next().value);
    return rows;
  } finally {
    memberAccessInflight.delete(id);
  }
}

function directPageAccessRows(appPages = [], accessRows = []) {
  const pagesById = new Map(
    appPages.map((page) => [text(page.id || page.page_id), page]).filter(([id]) => id),
  );

  const out = [];
  for (const access of accessRows) {
    if (!bool(access.is_enabled ?? access.isEnabled, false)) continue;
    const pageId = text(access.page_id || access.pageId);
    const page = pagesById.get(pageId) || access;
    const key = text(page.page_key || page.pageKey || access.page_key || access.pageKey);
    const rawName = text(page.page_name || page.pageName || page.name || access.page_name || access.pageName);
    const routePath = text(page.route_path || page.routePath || access.route_path || access.routePath);
    const pageName = legacyPageName({ ...page, page_key: key, page_name: rawName, route_path: routePath });
    const aliases = Array.from(new Set([pageName, rawName, key, routePath].filter(Boolean)));
    if (!pageName && !key && !routePath) continue;
    out.push({
      pageId,
      pageKey: key,
      pageName,
      aliases,
      routePath,
      accessLevel: accessLevel(access.access_level || access.accessLevel),
      isEnabled: true,
    });
  }
  return out;
}

function accountFromFreshMember(baseAccount = {}, row = {}, session = {}) {
  const name = text(valueFor(row, ["name", "Name", "full_name", "Full Name"])) || text(baseAccount.name || session.username);
  const position = text(valueFor(row, ["position", "Position", "job_title", "Job Title"])) || text(baseAccount.position);
  const department = text(valueFor(row, ["department", "Department"])) || text(baseAccount.department);
  const photoUrl = directUrl(valueFor(row, ["profile_picture", "Profile picture", "Profile Picture", "photo_url", "Photo URL"])) || text(baseAccount.photoUrl || baseAccount.profilePicture || baseAccount.profile_picture);
  const coverPhotoUrl = directUrl(valueFor(row, ["cover_photo", "Cover photo", "Cover Photo", "cover_photo_url", "Cover URL"])) || text(baseAccount.coverPhotoUrl || baseAccount.coverPhoto);
  const phone = text(valueFor(row, ["phone", "Phone"])) || text(baseAccount.phone);
  const email = text(valueFor(row, ["email", "Email"])) || text(baseAccount.email);
  const employeeCode = text(valueFor(row, ["employee_code", "Employee Code"])) || baseAccount.employeeCode || null;
  const passwordValue = valueFor(row, ["password", "Password"]);
  return {
    ...baseAccount,
    name,
    username: text(baseAccount.username || session.username || name),
    department,
    position,
    photoUrl,
    coverPhotoUrl,
    phone,
    email,
    employeeCode,
    passwordSet: passwordValue === null || typeof passwordValue === "undefined" ? Boolean(baseAccount.passwordSet) : Boolean(text(passwordValue)),
    source: baseAccount.source || "supabase",
  };
}

function builtInAdmin(account = {}, session = {}) {
  const name = token(account.name || session.username);
  const position = token(account.position);
  return name === "admin" || position.includes("admin");
}

function rowMatchesRequiredPage(row = {}, requiredPage = "") {
  const wanted = new Set(pageAliases(requiredPage));
  const candidates = [row.pageName, row.pageKey, row.routePath, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .flatMap((value) => pageAliases(value));
  return candidates.some((candidate) => wanted.has(candidate));
}

function gateFromAccount(account, session, requiredPages = []) {
  const pages = (Array.isArray(requiredPages) ? requiredPages : [requiredPages]).map(text).filter(Boolean);
  if (!pages.length || builtInAdmin(account, session)) return { ok: true, status: 200, error: "", account };

  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const hasAccess = pages.some((required) => rows.some((row) => row?.isEnabled !== false && rowMatchesRequiredPage(row, required)));
  if (hasAccess) return { ok: true, status: 200, error: "", account };
  return {
    ok: false,
    status: 403,
    error: `${pages.join(" or ")} access is not allowed for this account.`,
    account,
  };
}

export async function getDirectSessionAccountGate(requiredPages = []) {
  // This path is intentionally opt-in by capability rather than by feature flag:
  // if the same Upstash REST database used by express-session is reachable,
  // Next can validate the session without booting the 40k-line Express app.
  if (!String(process.env.UPSTASH_REDIS_REST_URL || "").trim() || !String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()) {
    return null;
  }

  const resolved = await readDirectSession();
  if (!resolved.definitive) return null;
  if (resolved.status === 401) {
    return { ok: false, status: 401, error: resolved.error || "Authentication required.", account: null, source: "direct-session" };
  }

  const session = resolved.session || {};
  const memberId = text(session.userSupabaseId);
  const baseAccount = session.accountCache && typeof session.accountCache === "object"
    ? { ...session.accountCache }
    : null;

  // Legacy/Notion sessions and very old sessions without the account snapshot
  // keep using the existing Express bridge. This makes rollout reversible and
  // avoids changing behavior for accounts that have not migrated to Supabase.
  if (!memberId || !baseAccount) return null;

  try {
    const [memberRow, pages, accessRows] = await Promise.all([
      selectById(teamMembersTable(), memberId),
      listAppPages(),
      listMemberAccess(memberId),
    ]);
    if (!memberRow) return null;

    // Refresh identity/position from Supabase as well. In particular this keeps
    // the built-in Admin bypass equivalent to Express: a removed admin position
    // cannot survive only because an older session snapshot still said Admin.
    const freshBaseAccount = accountFromFreshMember(baseAccount, memberRow, session);
    const freshPageAccess = directPageAccessRows(pages, accessRows);
    const isAdmin = builtInAdmin(freshBaseAccount, session);
    if (!isAdmin && !freshPageAccess.length && Array.isArray(baseAccount?.pageAccess?.pages) && baseAccount.pageAccess.pages.length) {
      // A missing/old permission schema should never silently downgrade or
      // broaden access. Let the established Express account route resolve it.
      return null;
    }

    const allowedPages = isAdmin
      ? expandUiAliases(Array.isArray(baseAccount.allowedPages) ? baseAccount.allowedPages : [])
      : expandUiAliases(
          freshPageAccess.flatMap((row) => [row.pageName, ...(Array.isArray(row.aliases) ? row.aliases : [])]).filter(Boolean),
        );
    const account = {
      ...freshBaseAccount,
      allowedPages,
      pageAccess: { pages: freshPageAccess },
    };

    return { ...gateFromAccount(account, session, requiredPages), source: "direct-session", memberId };
  } catch {
    return null;
  }
}

export const __directSessionAccountTest = {
  unsignSessionCookie,
  directPageAccessRows,
  rowMatchesRequiredPage,
  expandUiAliases,
};
