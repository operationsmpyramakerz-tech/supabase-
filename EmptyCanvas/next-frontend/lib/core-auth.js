import "server-only";

import crypto from "node:crypto";
import { createClient } from "redis";
import { insert, select, selectAll } from "./supabase-rest";
import { sendPasswordRecoveryEmail } from "./users-center-email";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
let redisClient = null;
let redisConnectPromise = null;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canon(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) if (wanted.has(canon(key))) return value;
  return null;
}

function urlValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = urlValue(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") return urlValue(value.url || value.publicUrl || value.public_url || value.href || value.src || value.external?.url || value.file?.url);
  const raw = text(value);
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  try { return urlValue(JSON.parse(raw)); } catch { return ""; }
}

function teamMembersTable() { return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members"; }
function signupRequestsTable() { return text(process.env.SUPABASE_SIGNUP_REQUESTS_TABLE) || "team_member_signup_requests"; }
function cookieName() { return text(process.env.SESSION_COOKIE_NAME) || "op.sid"; }
function sessionSecret() { return String(process.env.SESSION_SECRET || "dev-fallback-secret"); }
function redisUrl() { return text(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL); }
function restUrl() { return text(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, ""); }
function restToken() { return text(process.env.UPSTASH_REDIS_REST_TOKEN); }

function signSessionId(sid) {
  const signature = crypto.createHmac("sha256", sessionSecret()).update(sid).digest("base64").replace(/=+$/g, "");
  return `s:${sid}.${signature}`;
}

function safeDecode(value) {
  const raw = String(value || "").trim();
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function unsignSessionCookie(value) {
  const raw = safeDecode(value);
  const normalized = raw.startsWith("s:") ? raw.slice(2) : raw;
  const splitAt = normalized.lastIndexOf(".");
  if (splitAt <= 0) return "";
  const sid = normalized.slice(0, splitAt);
  const signature = normalized.slice(splitAt + 1);
  const expected = crypto.createHmac("sha256", sessionSecret()).update(sid).digest("base64").replace(/=+$/g, "");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (!left.length || left.length !== right.length || !crypto.timingSafeEqual(left, right)) return "";
  return sid;
}

async function redis() {
  const url = redisUrl();
  if (!url) return null;
  if (redisClient?.isReady) return redisClient;
  if (redisConnectPromise) return await redisConnectPromise;
  const pending = (async () => {
    const client = redisClient || createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        tls: /^rediss:/i.test(url),
        keepAlive: 30_000,
        connectTimeout: 2_000,
        reconnectStrategy: false,
      },
    });
    if (!redisClient) {
      redisClient = client;
      client.on("error", () => {});
    }
    if (!client.isOpen) await client.connect();
    return client;
  })();
  redisConnectPromise = pending;
  try { return await pending; }
  finally { if (redisConnectPromise === pending) redisConnectPromise = null; }
}

async function upstash(command) {
  const url = restUrl();
  const token = restToken();
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) throw new Error(payload?.error || `Upstash REST request failed with HTTP ${response.status}`);
  return payload?.result;
}

async function persistSession(sid, session) {
  const raw = JSON.stringify(session);
  let wrote = false;
  let lastError = null;

  if (redisUrl()) {
    try {
      const client = await redis();
      await client.set(`op:${sid}`, raw, { EX: SESSION_TTL_SECONDS });
      wrote = true;
    } catch (error) { lastError = error; }
  }
  if (restUrl() && restToken()) {
    try {
      await upstash(["SET", `op:sess:${sid}`, raw, "EX", SESSION_TTL_SECONDS]);
      wrote = true;
    } catch (error) { lastError = error; }
  }
  if (!wrote) {
    const error = new Error(lastError?.message || "Direct session storage is not configured.");
    error.status = 503;
    throw error;
  }
}

async function destroySessionId(sid) {
  if (!sid) return;
  const tasks = [];
  if (redisUrl()) tasks.push(redis().then((client) => client.del([`op:${sid}`, `op:sess:${sid}`])));
  if (restUrl() && restToken()) tasks.push(upstash(["DEL", `op:${sid}`, `op:sess:${sid}`]));
  await Promise.allSettled(tasks);
}

function normalizeEmail(value) {
  const email = text(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value) { return String(value || "").replace(/\s+/g, "").trim().slice(0, 40); }

function splitValues(value) {
  if (Array.isArray(value)) return value.map(text).map((item) => item.trim()).filter(Boolean);
  if (value && typeof value === "object") {
    if (Array.isArray(value.items)) return value.items.map(text).map((item) => item.trim()).filter(Boolean);
    if (Array.isArray(value.values)) return value.values.map(text).map((item) => item.trim()).filter(Boolean);
  }
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).map((item) => item.trim()).filter(Boolean);
  } catch {}
  return raw.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}
function normalizeSignupText(value, maxLen = 255) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen); }

async function teamRows() {
  return await selectAll(teamMembersTable(), { limit: 5000, profileName: "core-auth.team-members" });
}

async function findMemberByName(username) {
  const wanted = canon(username);
  if (!wanted) return null;
  try {
    const rows = await select(teamMembersTable(), { select: "*", name: `eq.${text(username)}`, limit: "2" }, { profileName: "core-auth.login-name" });
    const exact = (Array.isArray(rows) ? rows : []).find((row) => canon(valueFor(row, ["name", "Name", "username", "full_name"])) === wanted);
    if (exact) return exact;
  } catch {}
  return (await teamRows()).find((row) => canon(valueFor(row, ["name", "Name", "username", "full_name"])) === wanted) || null;
}

async function findMemberByEmail(email) {
  const wanted = normalizeEmail(email);
  if (!wanted) return null;
  try {
    const rows = await select(teamMembersTable(), { select: "*", email: `eq.${wanted}`, limit: "2" }, { profileName: "core-auth.recovery-email" });
    const exact = (Array.isArray(rows) ? rows : []).find((row) => normalizeEmail(valueFor(row, ["email", "Email", "mail"])) === wanted);
    if (exact) return exact;
  } catch {}
  return (await teamRows()).find((row) => normalizeEmail(valueFor(row, ["email", "Email", "mail"])) === wanted) || null;
}

function legacyPageName(page = {}) {
  const key = text(page.page_key || page.pageKey).toLowerCase();
  const names = {
    "current-orders": "Current Orders", "operations-orders": "Requested Orders", "maintenance-orders": "Maintenance Orders",
    "shopping-cart": "Create New Order", stocktaking: "Stocktaking", products: "Products", proposals: "Proposals", kits: "Kits",
    "orders-review": "Orders Review", expenses: "Expenses", "expenses-users": "Expenses Users", b2b: "B2B", "task-management": "Task Management",
    "all-tasks": "All Tasks", "my-tasks": "My Tasks", "delegated-tasks": "Delegated Tasks", b2c: "B2C", "customer-database": "Customer Database",
    "customer-form": "Customer Form", kpis: "KPIs", events: "Events", "event-calendar": "Event Calendar", "event-requests": "Event Requests",
    "event-components": "Event Components", "event-team": "Event Team", history: "History", backup: "Backup", database: "Backup", "users-center": "Users Center", "user-access-data": "Users Center",
  };
  return names[key] || text(page.page_name || page.pageName || page.name || page.route_path || page.routePath);
}

function expandUiAliases(values = []) {
  const set = new Set(values.map(text).filter(Boolean));
  const add = (...items) => items.forEach((item) => item && set.add(item));
  if (set.has("Requested Orders")) add("Schools Requested Orders", "Operations Orders");
  if (set.has("Products")) add("Product", "Components", "/products");
  if (set.has("Proposals")) add("Saved Quotations", "/proposals");
  if (set.has("Kits")) add("Product Kits", "Saved Kits", "/kits");
  if (set.has("Task Management")) add("All Tasks", "My Tasks", "Delegated Tasks", "/task-management", "/task-management/all-tasks", "/task-management/my-tasks", "/task-management/delegated-tasks");
  if (set.has("Events")) add("Event Calendar", "Event Requests", "Event Components", "Event Team", "/events", "/events/calendar", "/events/requests", "/events/components", "/events/team");
  if (set.has("B2C")) add("Customer Database", "Customer Form", "/b2c/database", "/b2c/form");
  if (set.has("Users Center")) add("User Access & Data", "User Access and Data", "User Access", "Team Members");
  return Array.from(set);
}

async function accessBundle(memberId, memberRow = {}) {
  const [pages, access] = await Promise.all([
    selectAll("app_pages", { limit: 1000, order: "sort_order.asc", profileName: "core-auth.app-pages" }).catch(() => []),
    select("team_member_page_access", { select: "*", team_member_id: `eq.${memberId}`, limit: "1000" }, { profileName: "core-auth.page-access" }).catch(() => []),
  ]);
  const pagesById = new Map((pages || []).map((page) => [text(page.id || page.page_id), page]).filter(([id]) => id));
  const pageAccess = [];
  for (const row of access || []) {
    if (!bool(row.is_enabled ?? row.isEnabled, false)) continue;
    const pageId = text(row.page_id || row.pageId);
    const page = pagesById.get(pageId) || row;
    const pageName = legacyPageName(page);
    const pageKey = text(page.page_key || page.pageKey || row.page_key || row.pageKey);
    const routePath = text(page.route_path || page.routePath || row.route_path || row.routePath);
    if (!pageName && !pageKey && !routePath) continue;
    pageAccess.push({
      pageId,
      pageKey,
      pageName,
      aliases: Array.from(new Set([pageName, text(page.page_name || page.pageName), pageKey, routePath].filter(Boolean))),
      routePath,
      accessLevel: text(row.access_level || row.accessLevel).toLowerCase() === "admin" ? "admin" : text(row.access_level || row.accessLevel).toLowerCase() === "view" ? "view" : "edit",
      isEnabled: true,
    });
  }
  if (!pageAccess.length) {
    const fallbackAllowed = splitValues(valueFor(memberRow, ["allowed_pages", "allowedPages", "Allowed Pages", "pages", "Pages"]));
    for (const pageName of fallbackAllowed) {
      pageAccess.push({ pageId: "", pageKey: "", pageName, aliases: [pageName], routePath: "", accessLevel: "edit", isEnabled: true });
    }
  }
  const allowedPages = expandUiAliases(pageAccess.flatMap((row) => [row.pageName, ...(row.aliases || [])]).filter(Boolean));
  return { pageAccess, allowedPages };
}

function accountPayload(row, username, bundle) {
  const id = text(valueFor(row, ["id", "ID"]));
  const name = text(valueFor(row, ["name", "Name", "full_name", "Full Name"])) || username;
  const account = {
    id,
    userSupabaseId: id,
    teamMemberId: id,
    name,
    username: name || username,
    department: text(valueFor(row, ["department", "Department"])),
    position: text(valueFor(row, ["position", "Position", "role", "Role"])),
    photoUrl: urlValue(valueFor(row, ["profile_picture", "profile_picture_url", "Profile picture", "Profile Picture", "photo", "photo_url"])),
    phone: text(valueFor(row, ["phone", "Phone", "mobile"])),
    email: text(valueFor(row, ["email", "Email", "mail"])),
    employeeCode: text(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code"])) || null,
    passwordSet: Boolean(text(valueFor(row, ["password", "Password", "passcode", "pin"]))),
    allowedPages: bundle.allowedPages,
    pageAccess: { pages: bundle.pageAccess },
    source: "supabase-next",
  };
  return account;
}

export async function loginDirect({ username = "", password = "" } = {}) {
  const providedUsername = text(username);
  const providedPassword = String(password || "").trim();
  if (!providedUsername || !providedPassword) {
    const error = new Error("Invalid username or password."); error.status = 401; throw error;
  }
  const row = await findMemberByName(providedUsername);
  if (!row) { const error = new Error("Invalid username or password."); error.status = 401; throw error; }
  const storedPassword = text(valueFor(row, ["password", "Password", "passcode", "pin"]));
  if (!storedPassword || storedPassword !== providedPassword) { const error = new Error("Invalid username or password."); error.status = 401; throw error; }

  const id = text(valueFor(row, ["id", "ID"]));
  if (!id) { const error = new Error("This account does not have a valid Supabase ID."); error.status = 500; throw error; }
  const bundle = await accessBundle(id, row);
  const account = accountPayload(row, providedUsername, bundle);
  const now = Date.now();
  const expires = new Date(now + SESSION_TTL_SECONDS * 1000);
  const session = {
    cookie: { originalMaxAge: SESSION_TTL_SECONDS * 1000, expires: expires.toISOString(), secure: true, httpOnly: true, path: "/", sameSite: "lax" },
    authenticated: true,
    authIssuedAt: now,
    username: account.username || providedUsername,
    allowedPages: bundle.allowedPages,
    pageAccess: bundle.pageAccess,
    userSupabaseId: id,
    accountCache: account,
    accountCacheTs: now,
  };
  const sid = crypto.randomBytes(24).toString("base64url");
  await persistSession(sid, session);
  return {
    session: { sid, cookieValue: signSessionId(sid), expires },
    response: { success: true, message: "Login successful", allowedPages: bundle.allowedPages, source: "supabase-next", redirect: "/home" },
  };
}

export async function logoutDirect(cookieValue = "") {
  const sid = unsignSessionCookie(cookieValue);
  if (sid) await destroySessionId(sid);
  return { success: true };
}

function secureCookieForRequest(request) {
  const forwarded = text(request?.headers?.get?.("x-forwarded-proto")).split(",")[0].trim().toLowerCase();
  return String(process.env.FORCE_SECURE_COOKIE || "").toLowerCase() === "true" || forwarded === "https" || String(request?.url || "").startsWith("https://");
}

export function setSessionCookie(response, request, session) {
  const secure = secureCookieForRequest(request);
  response.cookies.set(cookieName(), session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: session.expires,
  });
}

export function clearSessionCookie(response, request) {
  const secure = secureCookieForRequest(request);
  response.cookies.set(cookieName(), "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0, expires: new Date(0) });
  // Clean up the historical default cookie too; older deployments used it.
  response.cookies.set("connect.sid", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0, expires: new Date(0) });
}

export function sessionCookieName() { return cookieName(); }

export async function createSignupRequestDirect(body = {}) {
  const username = normalizeSignupText(body?.username, 120);
  const password = String(body?.password || "").trim();
  const repeatPassword = String(body?.repeatPassword || body?.confirmPassword || "").trim();
  const employeeCode = normalizeSignupText(body?.employeeCode || body?.employee_code, 80);
  const phone = normalizePhone(body?.phone);
  const email = normalizeEmail(body?.email);
  if (!username) { const error = new Error("Username is required."); error.status = 400; throw error; }
  if (!password || password.length < 4) { const error = new Error("Password must be at least 4 characters."); error.status = 400; throw error; }
  if (repeatPassword && password !== repeatPassword) { const error = new Error("Passwords do not match."); error.status = 400; throw error; }
  if (!employeeCode) { const error = new Error("Employee code is required."); error.status = 400; throw error; }
  if (!phone) { const error = new Error("Phone is required."); error.status = 400; throw error; }
  if (!email) { const error = new Error("Please enter a valid email."); error.status = 400; throw error; }

  const members = await teamRows();
  const wantedName = canon(username); const wantedEmail = normalizeEmail(email); const wantedCode = canon(employeeCode);
  const existing = members.find((row) => canon(valueFor(row, ["name", "Name", "username", "full_name"])) === wantedName || normalizeEmail(valueFor(row, ["email", "Email", "mail"])) === wantedEmail || canon(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code"])) === wantedCode);
  if (existing) { const error = new Error("This username, email, or employee code already exists."); error.status = 409; throw error; }

  let pending = [];
  try { pending = await select(signupRequestsTable(), { select: "*", status: "eq.pending", limit: "1000" }, { profileName: "core-auth.signup-pending" }); }
  catch (error) {
    if (/signup|schema cache|Could not find the table|relation .* does not exist|42P01|PGRST205/i.test(String(error?.message || error))) {
      const wrapped = new Error("Sign up requests table is not installed. Run the signup requests SQL migration first."); wrapped.status = 500; throw wrapped;
    }
    throw error;
  }
  const duplicate = (pending || []).find((row) => canon(valueFor(row, ["username", "name", "Name"])) === wantedName || normalizeEmail(valueFor(row, ["email", "Email"])) === wantedEmail || canon(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code"])) === wantedCode);
  if (duplicate) { const error = new Error("A pending sign up request already exists for this username, email, or employee code."); error.status = 409; throw error; }

  const created = await insert(signupRequestsTable(), { username, password, employee_code: employeeCode, phone, email, status: "pending" });
  return {
    ok: true,
    request: {
      id: text(valueFor(created || {}, ["id", "ID"])), username, employeeCode, phone, email,
      status: text(valueFor(created || {}, ["status"])) || "pending",
      createdAt: text(valueFor(created || {}, ["created_at", "createdAt"])) || new Date().toISOString(),
    },
    message: "Your sign up request was sent successfully.",
  };
}

export async function recoverPasswordDirect(emailValue = "") {
  const email = normalizeEmail(emailValue);
  if (!email) { const error = new Error("Please enter a valid email."); error.status = 400; throw error; }
  const row = await findMemberByEmail(email);
  if (!row) { const error = new Error("No user found with this email."); error.status = 404; throw error; }
  const password = text(valueFor(row, ["password", "Password", "passcode", "pin"]));
  if (!password) { const error = new Error("This user does not have a saved password."); error.status = 409; throw error; }
  const to = normalizeEmail(valueFor(row, ["email", "Email", "mail"])) || email;
  const name = text(valueFor(row, ["name", "Name", "full_name"])) || email;
  await sendPasswordRecoveryEmail({ to, name, password });
  return { success: true, message: "Password sent successfully. Please check your inbox.", source: "supabase-next" };
}

export const __coreAuthTest = { canon, signSessionId, unsignSessionCookie, normalizeEmail };
