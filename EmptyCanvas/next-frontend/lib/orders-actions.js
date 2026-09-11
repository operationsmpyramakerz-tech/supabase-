import "server-only";
import { timingSafeEqual } from "crypto";
import { fetchLegacyJson } from "./legacy-api";
import { selectAll, supabaseRequest, updateByIds } from "./supabase-rest";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.url || value.external?.url || value.file?.url);
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function token(value) {
  return canonical(value).replace(/[^\p{L}\p{N}]+/gu, "");
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

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function currentOrdersPageAliases() {
  return new Set(["currentorders", "orders", "currentorder"]);
}

function accountIsBuiltInAdmin(account = {}) {
  const name = token(account.name || account.username);
  const position = token(account.position);
  return name === "admin" || position.includes("admin");
}

function accountIsCurrentOrdersAdmin(account = {}) {
  if (accountIsBuiltInAdmin(account)) return true;
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const aliases = currentOrdersPageAliases();
  return rows.some((row) => {
    if (row?.isEnabled === false || row?.is_enabled === false) return false;
    if (canonical(row?.accessLevel || row?.access_level) !== "admin") return false;
    const candidates = [
      row?.pageName,
      row?.page_name,
      row?.pageKey,
      row?.page_key,
      row?.routePath,
      row?.route_path,
      ...(Array.isArray(row?.aliases) ? row.aliases : []),
    ].map(token).filter(Boolean);
    return candidates.some((candidate) => aliases.has(candidate) || candidate.endsWith("currentorders"));
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length !== b.length || !a.length) return false;
  return timingSafeEqual(a, b);
}

async function sharedAdminPasswordMatches(inputPassword) {
  const password = String(inputPassword || "").trim();
  if (!password) return false;

  const rows = await selectAll(teamMembersTable(), { limit: 5000 });
  const normalized = Array.isArray(rows) ? rows : [];
  const adminRow =
    normalized.find((row) => canonical(valueFor(row, ["Name", "name"])) === "admin") ||
    normalized.find((row) => canonical(valueFor(row, ["Position", "position"])).includes("admin")) ||
    normalized.find((row) => canonical(valueFor(row, ["Name", "name"])).includes("admin")) ||
    null;

  if (!adminRow) return false;
  const stored = text(valueFor(adminRow, ["Password", "password"]));
  return safeEqual(stored, password);
}

export function normalizeCurrentOrderIds(orderIds = []) {
  return [...new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  )];
}

export function areSupabaseCurrentOrderIds(ids = []) {
  return Array.isArray(ids) && ids.length > 0 && ids.every((id) => /^\d+$/.test(String(id)));
}

export async function verifyCurrentOrdersActionPassword(account = {}, adminPassword = "") {
  const password = String(adminPassword || "").trim();
  if (!password) {
    const error = new Error("adminPassword required");
    error.status = 400;
    throw error;
  }

  if (accountIsCurrentOrdersAdmin(account)) return true;
  const ok = await sharedAdminPasswordMatches(password);
  if (!ok) {
    const error = new Error("Invalid admin password");
    error.status = 401;
    throw error;
  }
  return true;
}

export async function archiveCurrentOrders(ids = []) {
  const updated = await updateByIds(ordersTable(), ids, { status: "Archive" });
  return {
    success: true,
    status: "Archive",
    statusColor: "purple",
    updated: Array.isArray(updated) ? updated.length : ids.length,
    source: "supabase",
  };
}

export async function unarchiveCurrentOrders(ids = []) {
  const updated = await updateByIds(ordersTable(), ids, { status: "In progress" });
  return {
    success: true,
    status: "In progress",
    statusColor: "yellow",
    updated: Array.isArray(updated) ? updated.length : ids.length,
    source: "supabase",
  };
}

export async function deleteCurrentOrders(ids = []) {
  const cleanIds = normalizeCurrentOrderIds(ids);
  if (!cleanIds.length) return { success: true, deleted: 0, source: "supabase" };
  const inList = cleanIds.join(",");
  const rows = await supabaseRequest(
    `/${encodeURIComponent(ordersTable())}?id=in.(${encodeURIComponent(inList)})`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  return {
    success: true,
    deleted: Array.isArray(rows) ? rows.length : cleanIds.length,
    source: "supabase",
  };
}

export async function legacyCurrentOrdersActionFallback(action, body = {}) {
  const allowed = new Set(["archive", "unarchive", "delete"]);
  const key = String(action || "").trim().toLowerCase();
  if (!allowed.has(key)) {
    const error = new Error("Unsupported Current Orders action.");
    error.status = 400;
    throw error;
  }

  const response = await fetchLegacyJson(`/api/orders/current/${key}`, {
    method: "POST",
    timeoutMs: 20000,
    body,
  });
  if (!response.ok) {
    const error = new Error(response.data?.error || response.error || `Failed to ${key} order.`);
    error.status = response.status || 503;
    throw error;
  }
  return { ...(response.data || {}), source: response.data?.source || "legacy" };
}

export async function warmLegacyCurrentOrdersCache() {
  try {
    await fetchLegacyJson("/api/orders?_fresh=1", { timeoutMs: 8000 });
  } catch {}
}
