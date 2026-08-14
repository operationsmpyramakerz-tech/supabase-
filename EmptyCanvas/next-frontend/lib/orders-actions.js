import "server-only";
import { selectAll, supabaseRequest, updateByIds } from "./supabase-rest";

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
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

function actionError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function normalizeOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw actionError("orderIds required", 400);
  }

  const ids = [...new Set(orderIds.map((id) => text(id)).filter(Boolean))];
  if (!ids.length) throw actionError("orderIds required", 400);
  if (!ids.every((id) => /^\d+$/.test(id))) {
    throw actionError("Current Orders actions are available for Supabase orders only.", 400);
  }
  return ids;
}

function pageAccessRows(account = {}) {
  const candidates = [
    account?.pageAccess?.pages,
    account?.page_access?.pages,
    account?.pageAccess,
    account?.page_access,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function hasCurrentOrdersAdminAccess(account = {}) {
  return pageAccessRows(account).some((row) => {
    if (!row || typeof row !== "object") return false;
    const enabledRaw = valueFor(row, ["is_enabled", "isEnabled", "enabled", "Enabled"]);
    if (enabledRaw === false || canonical(enabledRaw) === "false" || canonical(enabledRaw) === "0") return false;

    const page = text(valueFor(row, ["page_name", "pageName", "page", "Page", "name", "Name"]));
    const level = canonical(valueFor(row, ["access_level", "accessLevel", "level", "Level"]));
    return canonical(page) === canonical("Current Orders") && level === "admin";
  });
}

async function verifySharedAdminPassword(inputPassword) {
  const password = text(inputPassword);
  if (!password) return false;

  const rows = await selectAll(teamMembersTable(), { limit: 5000 });
  const admin = rows.find((row) => canonical(valueFor(row, ["Name", "name"])) === "admin")
    || rows.find((row) => canonical(valueFor(row, ["Position", "position"])).includes("admin"))
    || rows.find((row) => canonical(valueFor(row, ["Name", "name"])).includes("admin"))
    || null;

  if (!admin) return false;
  const stored = text(valueFor(admin, ["Password", "password"]));
  return !!stored && stored === password;
}

async function requireCurrentOrdersAdmin(account, adminPassword) {
  const password = text(adminPassword);
  if (!password) throw actionError("adminPassword required", 400);

  // Match the Express behavior: a page-level Admin still submits a non-empty
  // password field, but does not need the shared Admin account password.
  if (hasCurrentOrdersAdminAccess(account)) return true;

  const ok = await verifySharedAdminPassword(password);
  if (!ok) throw actionError("Invalid admin password", 401);
  return true;
}

async function deleteOrdersByIds(ids) {
  const clean = normalizeOrderIds(ids);
  const filter = clean.join(",");
  const rows = await supabaseRequest(
    `/${encodeURIComponent(ordersTable())}?id=in.(${encodeURIComponent(filter)})`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function executeCurrentOrderAction(action, { orderIds, adminPassword, account } = {}) {
  const ids = normalizeOrderIds(orderIds);
  await requireCurrentOrdersAdmin(account || {}, adminPassword);

  if (action === "archive") {
    await updateByIds(ordersTable(), ids, { status: "Archive" });
    return { success: true, status: "Archive", statusColor: "purple", source: "supabase" };
  }

  if (action === "unarchive") {
    await updateByIds(ordersTable(), ids, { status: "In progress" });
    return { success: true, status: "In progress", statusColor: "yellow", source: "supabase" };
  }

  if (action === "delete") {
    const deleted = await deleteOrdersByIds(ids);
    return { success: true, deleted: deleted.length, source: "supabase" };
  }

  throw actionError("Unsupported Current Orders action.", 400);
}
