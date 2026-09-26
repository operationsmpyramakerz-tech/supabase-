import "server-only";
import { performance } from "node:perf_hooks";
import { deleteById, deleteStorageObjects, getSupabaseConfig, insert, rpc, select, selectAll, selectById, storagePublicUrl, updateById, uploadStorageObject } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";
import { recordPerformanceSample } from "./performance-profiler";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.url || value.external?.url || value.file?.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function dateValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function dateTimeValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitValues).filter(Boolean);
  if (value && typeof value === "object") return [text(value)].filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.flatMap(splitValues).filter(Boolean);
  } catch {}
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function screenshotPublicUrl(value, bucketOverride = "") {
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return "";
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;

  const config = getSupabaseConfig();
  const bucket = text(bucketOverride) || text(config.storageBucket);
  if (!config.url || !bucket) return "";

  if (/^\/?storage\/v1\/object\/public\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, "");
    return `${config.url}/${clean}`;
  }

  if (/^\/?object\/public\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, "").replace(/^object\/public\//i, "");
    return `${config.url}/storage/v1/object/public/${clean}`;
  }

  const looksLikeStoragePath = raw.includes("/") && !/^[A-Za-z]:[\\/]/.test(raw) && !/\s/.test(raw);
  if (!looksLikeStoragePath) return "";
  let objectPath = raw.replace(/^\/+/, "");
  if (objectPath.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) objectPath = objectPath.slice(bucket.length + 1);
  return storagePublicUrl(objectPath, bucket);
}

function parseScreenshots(value) {
  const out = [];
  const seen = new Set();

  const add = (entry, index = 0) => {
    if (entry === null || typeof entry === "undefined") return;

    if (typeof entry === "string") {
      const raw = text(entry);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
          add(parsed, index);
          return;
        }
      } catch {}
      const url = screenshotPublicUrl(raw);
      if (!url) return;
      const key = url;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name: `Receipt ${index + 1}`, url });
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach((item, itemIndex) => add(item, itemIndex));
      return;
    }

    if (typeof entry === "object") {
      const rawUrl = entry.url || entry.href || entry.publicUrl || entry.public_url || entry.signedUrl || entry.signedURL || entry.downloadUrl || entry.downloadURL || entry.file?.url || entry.external?.url || entry.dataUrl || entry.data_url || entry.path || entry.fullPath || entry.full_path || entry.storagePath || entry.storage_path || entry.key || entry.Key || "";
      const bucket = entry.bucket || entry.bucketName || entry.bucket_name || "";
      const url = screenshotPublicUrl(rawUrl, bucket);
      if (!url) return;
      const name = text(entry.name || entry.filename || entry.fileName || entry.originalName || entry.original_name) || `Receipt ${index + 1}`;
      const key = `${url}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, url });
    }
  };

  add(value, 0);

  if (!out.length && typeof value === "string") {
    const raw = text(value);
    const urlMatches = raw.match(/https?:\/\/[^\s,"'<>]+/gi) || [];
    urlMatches.forEach((url, index) => add(url, index));
  }

  return out;
}

function expenseOrders(row = {}) {
  const names = splitValues(valueFor(row, ["orders_names", "Orders", "orders_raw"]));
  const urls = splitValues(valueFor(row, ["orders_urls", "orders_url"]));
  return names.map((name, index) => {
    const label = text(name) || "Order";
    const url = text(urls[index]);
    const match = label.match(/(?:ORD[-\s]?)?(\d+)/i);
    const orderId = match?.[1] ? `ORD-${match[1]}` : label;
    return {
      key: `${orderId}:${index}`,
      orderId,
      orderType: "",
      label,
      trackingGroupId: orderId,
      trackingUrl: url || "",
      relationIds: [],
      receiptEntries: [],
      items: [],
      receiptViewerUrl: url || "",
    };
  });
}

function serializeExpense(row = {}) {
  const screenshots = parseScreenshots(valueFor(row, ["screenshot", "Screenshot", "files_media"]));
  const createdTime = dateTimeValue(valueFor(row, ["notion_created_time", "created_at", "Created time"])) || new Date().toISOString();
  return {
    id: text(valueFor(row, ["id", "ID"])),
    createdTime,
    date: dateValue(valueFor(row, ["expense_date", "Date", "date"])),
    reason: text(valueFor(row, ["reason", "Reason"])),
    fundsType: text(valueFor(row, ["funds_type", "Funds Type"])),
    from: text(valueFor(row, ["from_location", "From", "cash_in_from"])),
    to: text(valueFor(row, ["to_location", "To"])),
    kilometer: number(valueFor(row, ["kilometer", "Kilometer"]), 0),
    cashIn: number(valueFor(row, ["cash_in", "Cash in"]), 0),
    cashOut: number(valueFor(row, ["cash_out", "Cash out"]), 0),
    cashInFrom: text(valueFor(row, ["cash_in_from", "from_location", "From"])),
    orders: expenseOrders(row),
    screenshots,
    screenshotUrl: screenshots[0]?.url || "",
    screenshotName: screenshots[0]?.name || "",
    teamMemberName: text(valueFor(row, ["team_member_name", "Team Member"])),
    userId: text(valueFor(row, ["user_id", "employee_code"])),
    receiptNumber: text(valueFor(row, ["receipt_number", "receiptNumber", "orders_raw", "orders_names"])),
    ordersRaw: text(valueFor(row, ["orders_raw", "orders_names"])),
    source: "supabase",
  };
}

function memberIdentity(account = {}, rows = []) {
  const accountNames = [account.username, account.name].map(canonical).filter(Boolean);
  const accountEmail = canonical(account.email);
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  const hit = (rows || []).find((row) => {
    const rowId = text(valueFor(row, ["id", "ID"]));
    if (accountId && rowId && accountId === rowId) return true;
    const rowNames = [valueFor(row, ["Name", "name"]), valueFor(row, ["Username", "username"])].map(canonical).filter(Boolean);
    if (accountNames.some((name) => rowNames.includes(name))) return true;
    const rowEmail = canonical(valueFor(row, ["Email", "email"]));
    return !!accountEmail && !!rowEmail && accountEmail === rowEmail;
  });

  const name = text(valueFor(hit || {}, ["Name", "name"])) || text(account.name || account.username);
  const code = text(valueFor(hit || {}, ["Employee Code", "employee_code", "code"]));
  const id = text(valueFor(hit || {}, ["id", "ID"])) || accountId;
  const email = text(valueFor(hit || {}, ["Email", "email"])) || text(account.email);
  return { row: hit || null, name, code, id, email };
}

function expenseRowMatchesMember(row = {}, member = {}) {
  const name = canonical(member.name);
  const rowName = canonical(valueFor(row, ["team_member_name", "Team Member", "team_member_raw"]));
  if (name && rowName && (rowName === name || rowName.includes(name) || name.includes(rowName))) return true;
  const rowUserId = canonical(valueFor(row, ["user_id", "employee_code"]));
  const memberIds = [member.code, member.id].map(canonical).filter(Boolean);
  if (rowUserId && memberIds.includes(rowUserId)) return true;
  const email = canonical(member.email);
  const rowEmail = canonical(valueFor(row, ["email", "Email"]));
  return !!email && !!rowEmail && email === rowEmail;
}

function expensesTable() {
  return text(process.env.SUPABASE_EXPENSES_TABLE) || "expenses";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

const EXPENSE_SUPPORT_CACHE_TTL_MS = 60_000;
const EXPENSE_RPC_COOLDOWN_MS = 10 * 60_000;
const EXPENSE_ROW_SELECT = [
  "id",
  "expense_date",
  "notion_created_time",
  "reason",
  "funds_type",
  "from_location",
  "to_location",
  "kilometer",
  "cash_in",
  "cash_out",
  "orders_names",
  "orders_raw",
  "screenshot",
  "team_member_name",
  "team_member_raw",
  "user_id",
].join(",");

let expenseOrderOptionsCache = null;
let expenseOrderOptionsInflight = null;
let expenseOrderRpcUnavailableUntil = 0;
let expenseTypeOptionsCache = null;
let expenseTypeOptionsInflight = null;
let expenseTypeRpcUnavailableUntil = 0;
let expenseRowProjectionSupported = null;

function orderNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingRpc(error) {
  const status = Number(error?.status) || 0;
  const detail = [error?.message, error?.details?.message, error?.details?.hint, error?.details?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return status === 404 || detail.includes("pgrst202") || detail.includes("could not find the function") || detail.includes("does not exist");
}

function normalizeRelationIds(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {}
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function serializeExpenseOrderOption({ orderNumberValue = null, rowId = "", orderType = "", relationIds = [] } = {}) {
  const num = orderNumber(orderNumberValue);
  const cleanRowId = text(rowId);
  const displayId = num !== null ? `ORD-${num}` : (cleanRowId ? `ORD-${cleanRowId}` : "Order");
  const key = num !== null ? `ord:${num}` : `row:${cleanRowId || displayId}`;
  const type = text(orderType) || "Request Products";
  return {
    id: key,
    key,
    orderId: displayId,
    orderType: type,
    label: [displayId, type].filter(Boolean).join(" - "),
    relationIds: Array.from(new Set((Array.isArray(relationIds) ? relationIds : []).map(text).filter(Boolean))),
    receiptEntries: [],
    trackingGroupId: key,
    trackingUrl: `/orders/tracking?groupId=${encodeURIComponent(key)}`,
  };
}

async function loadExpenseOrderOptionsFallback() {
  // Compatibility path for deployments where the compact RPC has not been
  // installed yet. Keep the old behavior but only transfer picker fields.
  const rows = await select(ordersTable(), {
    select: "id,order_number,order_type,sv_approval,notion_created_time",
    sv_approval: "ilike.*approved*",
    order: "order_number.desc,notion_created_time.desc,id.desc",
    limit: "5000",
  }, { profileName: "expenses.order-options-fallback" });

  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const num = orderNumber(valueFor(row, ["order_number", "Order - ID", "Order ID"]));
    const rowId = text(valueFor(row, ["id", "ID"]));
    const key = num !== null ? `ord:${num}` : `row:${rowId || "order"}`;
    if (!groups.has(key)) {
      groups.set(key, serializeExpenseOrderOption({
        orderNumberValue: num,
        rowId,
        orderType: valueFor(row, ["order_type", "Order Type"]),
        relationIds: rowId ? [rowId] : [],
      }));
      continue;
    }
    if (rowId && !groups.get(key).relationIds.includes(rowId)) groups.get(key).relationIds.push(rowId);
  }

  return [...groups.values()]
    .sort((a, b) => String(b.orderId || "").localeCompare(String(a.orderId || ""), undefined, { numeric: true }))
    .slice(0, 300);
}

export async function expenseOrderOptions({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && expenseOrderOptionsCache && expenseOrderOptionsCache.expiresAt > now) return expenseOrderOptionsCache.value;
  if (!fresh && expenseOrderOptionsInflight) return await expenseOrderOptionsInflight;

  const load = async () => {
    if (Date.now() >= expenseOrderRpcUnavailableUntil) {
      try {
        const rows = await rpc("erp_expense_order_options", {}, { profileName: "expenses.order-options-rpc" });
        const options = (Array.isArray(rows) ? rows : []).map((row) => serializeExpenseOrderOption({
          orderNumberValue: row?.order_number,
          orderType: row?.order_type,
          relationIds: normalizeRelationIds(row?.relation_ids),
        })).filter((item) => item.orderId && item.relationIds.length);
        return options.slice(0, 300);
      } catch (error) {
        if (isMissingRpc(error)) expenseOrderRpcUnavailableUntil = Date.now() + EXPENSE_RPC_COOLDOWN_MS;
      }
    }
    return await loadExpenseOrderOptionsFallback();
  };

  const pending = load();
  if (!fresh) expenseOrderOptionsInflight = pending;
  try {
    const options = await pending;
    expenseOrderOptionsCache = { value: options, expiresAt: Date.now() + EXPENSE_SUPPORT_CACHE_TTL_MS };
    return options;
  } finally {
    if (!fresh && expenseOrderOptionsInflight === pending) expenseOrderOptionsInflight = null;
  }
}

function ilike(value, contains = true) {
  const safe = text(value).replace(/[%*_]/g, (match) => `\\${match}`);
  return `ilike.${contains ? `*${safe}*` : safe}`;
}

async function selectExpenseRows(params = {}, { profileName = "expenses.rows" } = {}) {
  if (expenseRowProjectionSupported !== false) {
    try {
      const rows = await select(expensesTable(), { ...params, select: EXPENSE_ROW_SELECT }, { profileName });
      expenseRowProjectionSupported = true;
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      // The expenses table predates the current canonical projection in some
      // deployments. Remember compatibility mode to avoid one failed projected
      // request on every refresh.
      if (Number(error?.status) === 400) expenseRowProjectionSupported = false;
      else throw error;
    }
  }
  const rows = await select(expensesTable(), { ...params, select: "*" }, { profileName: `${profileName}-fallback` });
  return Array.isArray(rows) ? rows : [];
}

function memberFromAccount(account = {}) {
  return {
    row: null,
    name: text(account.name || account.username),
    code: text(account.employeeCode || account.employee_code),
    id: text(account.teamMemberId || account.userSupabaseId || account.userId || account.id),
    email: text(account.email),
  };
}

function expenseIdentityOr(member = {}) {
  const clauses = [];
  const code = text(member.code);
  const id = text(member.id);
  const name = text(member.name);
  if (code) clauses.push(`user_id.eq.${code}`);
  if (id && id !== code) clauses.push(`user_id.eq.${id}`);
  if (name) {
    clauses.push(`team_member_name.${ilike(name, false)}`);
    clauses.push(`team_member_raw.${ilike(name, false)}`);
  }
  return clauses.length ? `(${clauses.join(",")})` : "";
}

async function selectCurrentExpenseRows(member) {
  const baseParams = {
    order: "expense_date.desc,notion_created_time.desc,id.desc",
    limit: "5000",
  };

  // Normal path: one PostgreSQL request can match both modern user_id rows and
  // older name-based rows, preserving historical expenses without 3-4 parallel
  // full payload requests.
  const identityOr = expenseIdentityOr(member);
  if (identityOr) {
    try {
      const rows = await selectExpenseRows({ ...baseParams, or: identityOr }, { profileName: "expenses.current-identity" });
      const matched = rows.filter((row) => expenseRowMatchesMember(row, member));
      if (matched.length || rows.length === 0) return matched;
    } catch {}
  }

  // Compatibility path for schemas missing one of the canonical identity
  // columns used by the OR expression. Queries remain isolated so one missing
  // optional column cannot break the page.
  const specs = [];
  if (member.code) specs.push(["user_id", `eq.${text(member.code)}`]);
  if (member.id && text(member.id) !== text(member.code)) specs.push(["user_id", `eq.${text(member.id)}`]);
  if (member.name) {
    specs.push(["team_member_name", ilike(member.name, true)]);
    specs.push(["team_member_raw", ilike(member.name, true)]);
  }
  if (member.email) specs.push(["email", ilike(member.email, false)]);

  if (specs.length) {
    const results = await Promise.allSettled(specs.map(([column, filter]) => selectExpenseRows({
      ...baseParams,
      [column]: filter,
    }, { profileName: `expenses.current-${column}` })));
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    if (fulfilled.length) {
      const merged = new Map();
      for (const result of fulfilled) {
        for (const row of Array.isArray(result.value) ? result.value : []) {
          const id = text(valueFor(row, ["id", "ID"])) || JSON.stringify(row);
          if (!merged.has(id)) merged.set(id, row);
        }
      }
      const matched = [...merged.values()].filter((row) => expenseRowMatchesMember(row, member));
      if (matched.length || merged.size === 0) return matched;
    }
  }

  const all = await selectAll(expensesTable(), {
    limit: 5000,
    order: "expense_date.desc,notion_created_time.desc,id.desc",
    profileName: "expenses.current-full-fallback",
  });
  return all.filter((row) => expenseRowMatchesMember(row, member));
}

function lastSettledInfo(rows = []) {
  let lastSettledAt = null;
  let lastSettledDate = null;
  for (const row of rows || []) {
    const fundsType = canonical(valueFor(row, ["funds_type", "Funds Type"]));
    const reason = canonical(valueFor(row, ["reason", "Reason"]));
    if (fundsType !== "settled my account" && reason !== "settled my account") continue;
    const created = dateTimeValue(valueFor(row, ["notion_created_time", "created_at"]));
    if (!created) continue;
    if (!lastSettledAt || new Date(created).getTime() > new Date(lastSettledAt).getTime()) {
      lastSettledAt = created;
      lastSettledDate = dateValue(valueFor(row, ["expense_date", "Date"]));
    }
  }
  return { lastSettledAt, lastSettledDate };
}

export async function expensesForAccount(account = {}) {
  const startedAt = performance.now();
  let ok = false;
  let itemCount = 0;
  try {
    let member = memberFromAccount(account);
    if (!member.name) {
      // Only very old/legacy account payloads should need the directory lookup.
      const members = await selectAll(teamMembersTable(), { limit: 5000, order: "name.asc,id.asc", profileName: "expenses.member-directory-fallback" });
      member = memberIdentity(account, members);
    }
    if (!member.name) {
      const error = new Error("User not found.");
      error.status = 400;
      throw error;
    }
    const rows = await selectCurrentExpenseRows(member);
    const info = lastSettledInfo(rows);
    itemCount = rows.length;
    ok = true;
    return {
      success: true,
      items: rows.map(serializeExpense),
      lastSettledAt: info.lastSettledAt,
      lastSettledDate: info.lastSettledDate,
      source: "supabase-next-compact",
    };
  } finally {
    recordPerformanceSample({
      category: "expenses",
      name: "current-load",
      durationMs: performance.now() - startedAt,
      ok,
      status: ok ? 200 : 500,
      meta: { items: itemCount },
    });
  }
}

export async function expenseTypeOptions({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && expenseTypeOptionsCache && expenseTypeOptionsCache.expiresAt > now) return expenseTypeOptionsCache.value;
  if (!fresh && expenseTypeOptionsInflight) return await expenseTypeOptionsInflight;

  const load = async () => {
    if (Date.now() >= expenseTypeRpcUnavailableUntil) {
      try {
        const rows = await rpc("erp_expense_type_options", {}, { profileName: "expenses.type-options-rpc" });
        return (Array.isArray(rows) ? rows : []).map((row) => text(row?.value ?? row?.funds_type)).filter(Boolean);
      } catch (error) {
        if (isMissingRpc(error)) expenseTypeRpcUnavailableUntil = Date.now() + EXPENSE_RPC_COOLDOWN_MS;
      }
    }

    // Even without the RPC, transfer one short text column rather than every
    // expense receipt/order payload just to build a dropdown.
    const rows = await select(expensesTable(), {
      select: "funds_type",
      order: "funds_type.asc",
      limit: "5000",
    }, { profileName: "expenses.type-options-fallback" });
    const seen = new Set();
    const options = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const value = text(valueFor(row, ["funds_type", "Funds Type"]));
      const key = canonical(value);
      if (!value || !key || seen.has(key)) continue;
      seen.add(key);
      options.push(value);
    }
    return options.sort((a, b) => a.localeCompare(b));
  };

  const pending = load();
  if (!fresh) expenseTypeOptionsInflight = pending;
  try {
    const options = await pending;
    expenseTypeOptionsCache = { value: options, expiresAt: Date.now() + EXPENSE_SUPPORT_CACHE_TTL_MS };
    return options;
  } finally {
    if (!fresh && expenseTypeOptionsInflight === pending) expenseTypeOptionsInflight = null;
  }
}

export async function cashInFromOptions({ fresh = false } = {}) {
  const rows = await listTeamMembersLite({ fresh });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: text(row?.id) || text(row?.name),
    name: text(row?.name) || "Unnamed",
  })).filter((item) => item.id && item.name);
}

let expenseUsersSummaryCache = null;
let expenseUsersSummaryInflight = null;
let expenseUsersSummaryRpcUnavailableUntil = 0;
let expenseMemberOrProjectionSupported = null;

function sortExpenseRows(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aStamp = new Date(valueFor(a, ["expense_date", "notion_created_time", "created_at"]) || 0).getTime();
    const bStamp = new Date(valueFor(b, ["expense_date", "notion_created_time", "created_at"]) || 0).getTime();
    if (Number.isFinite(aStamp) && Number.isFinite(bStamp) && aStamp !== bStamp) return bStamp - aStamp;
    return number(valueFor(b, ["id", "ID"]), 0) - number(valueFor(a, ["id", "ID"]), 0);
  });
}

async function expenseUsersSummaryRows() {
  // Compatibility path for deployments where the aggregate RPC has not been
  // installed yet. Keep the transfer narrow even here.
  const rows = await select(expensesTable(), {
    select: "id,expense_date,notion_created_time,funds_type,reason,cash_in,cash_out,team_member_name,team_member_raw,user_id",
    order: "expense_date.desc,notion_created_time.desc,id.desc",
    limit: "5000",
  }, { profileName: "expenses.users-summary-fallback" });
  return sortExpenseRows(rows);
}

function serializeExpenseUsersSummaryRpcRow(row = {}) {
  const name = text(row?.member_name ?? row?.name) || "Unknown User";
  const key = text(row?.member_key ?? row?.user_id ?? row?.id) || name;
  return {
    id: key,
    userId: key,
    name,
    total: number(row?.total ?? row?.balance, 0),
    count: Math.max(0, Math.round(number(row?.item_count ?? row?.count, 0))),
    lastSettledDate: dateValue(row?.last_settled_date ?? row?.lastSettledDate),
  };
}

async function loadExpenseUsersSummaryFallback() {
  const rows = await expenseUsersSummaryRows();
  const perUser = new Map();

  for (const row of rows) {
    const name = text(valueFor(row, ["team_member_name", "Team Member", "team_member_raw"])) || "Unknown User";
    const userId = text(valueFor(row, ["user_id", "employee_code"])) || name;
    const key = userId || name;
    if (!perUser.has(key)) {
      perUser.set(key, {
        id: key,
        userId: key,
        name,
        total: 0,
        count: 0,
        lastSettledDate: null,
      });
    }

    const aggregate = perUser.get(key);
    aggregate.total += number(valueFor(row, ["cash_in", "Cash in"]), 0) - number(valueFor(row, ["cash_out", "Cash out"]), 0);
    aggregate.count += 1;

    const fundsType = canonical(valueFor(row, ["funds_type", "Funds Type"]));
    const reason = canonical(valueFor(row, ["reason", "Reason"]));
    if (!aggregate.lastSettledDate && (fundsType === "settled my account" || reason === "settled my account")) {
      aggregate.lastSettledDate = dateValue(valueFor(row, ["expense_date", "Date"]));
    }
  }

  return Array.from(perUser.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function expenseUsersSummary({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && expenseUsersSummaryCache && expenseUsersSummaryCache.expiresAt > now) {
    return expenseUsersSummaryCache.value;
  }
  if (!fresh && expenseUsersSummaryInflight) return await expenseUsersSummaryInflight;

  const load = async () => {
    const startedAt = performance.now();
    let source = "fallback";
    let users = [];
    let ok = false;
    try {
      if (Date.now() >= expenseUsersSummaryRpcUnavailableUntil) {
        try {
          const rows = await rpc("erp_expense_users_summary", {}, { profileName: "expenses.users-summary-rpc" });
          users = (Array.isArray(rows) ? rows : [])
            .map(serializeExpenseUsersSummaryRpcRow)
            .filter((item) => item.id)
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
          source = "rpc";
          ok = true;
          return users;
        } catch (error) {
          if (isMissingRpc(error)) expenseUsersSummaryRpcUnavailableUntil = Date.now() + EXPENSE_RPC_COOLDOWN_MS;
          else if (Number(error?.status) !== 400) throw error;
        }
      }

      users = await loadExpenseUsersSummaryFallback();
      ok = true;
      return users;
    } finally {
      recordPerformanceSample({
        category: "expenses",
        name: "users-summary",
        durationMs: performance.now() - startedAt,
        ok,
        status: ok ? 200 : 500,
        meta: { source, users: users.length },
      });
    }
  };

  const pending = load();
  if (!fresh) expenseUsersSummaryInflight = pending;
  try {
    const users = await pending;
    expenseUsersSummaryCache = { value: users, expiresAt: Date.now() + 10_000 };
    return users;
  } finally {
    if (!fresh) expenseUsersSummaryInflight = null;
  }
}

function expenseRowMatchesMemberId(row = {}, memberId = "") {
  const wanted = canonical(memberId);
  if (!wanted) return false;
  const rowUserId = canonical(valueFor(row, ["user_id", "employee_code"]));
  const rowName = canonical(valueFor(row, ["team_member_name", "Team Member", "team_member_raw"]));
  const rowId = canonical(valueFor(row, ["id", "ID"]));
  return wanted === rowUserId || wanted === rowName || wanted === rowId;
}

async function selectExpensesForMemberId(memberId) {
  const raw = text(memberId);
  if (!raw) return [];

  // Normal schema: one request covers the modern user_id and both historical
  // name fields. This replaces three parallel full-row requests whenever the
  // canonical identity columns are available.
  if (expenseMemberOrProjectionSupported !== false) {
    try {
      const rows = await select(expensesTable(), {
        select: "*",
        or: `(user_id.eq.${raw},team_member_name.${ilike(raw, false)},team_member_raw.${ilike(raw, false)})`,
        order: "expense_date.desc,notion_created_time.desc,id.desc",
        limit: "5000",
      }, { profileName: "expenses.member-detail-or" });
      expenseMemberOrProjectionSupported = true;
      const matched = sortExpenseRows((Array.isArray(rows) ? rows : []).filter((row) => expenseRowMatchesMemberId(row, raw)));
      if (matched.length || !rows?.length) return matched;
    } catch (error) {
      if (Number(error?.status) === 400) expenseMemberOrProjectionSupported = false;
      else throw error;
    }
  }

  const specs = [
    ["user_id", `eq.${raw}`],
    ["team_member_name", ilike(raw, false)],
    ["team_member_raw", ilike(raw, false)],
  ];

  const results = await Promise.allSettled(specs.map(([column, filter]) => select(expensesTable(), {
    select: "*",
    [column]: filter,
    order: "expense_date.desc,notion_created_time.desc,id.desc",
    limit: "5000",
  }, { profileName: `expenses.member-detail-${column}` })));

  const successful = results.filter((result) => result.status === "fulfilled");
  if (successful.length) {
    const merged = new Map();
    for (const result of successful) {
      for (const row of Array.isArray(result.value) ? result.value : []) {
        const id = text(valueFor(row, ["id", "ID"])) || JSON.stringify(row);
        if (!merged.has(id)) merged.set(id, row);
      }
    }
    const matched = sortExpenseRows(Array.from(merged.values()).filter((row) => expenseRowMatchesMemberId(row, raw)));
    if (matched.length) return matched;
  }

  // Compatibility recovery for custom/older expense schemas. This path is only
  // used when the canonical indexed identity columns cannot resolve the user.
  const all = await selectAll(expensesTable(), {
    limit: 5000,
    order: "expense_date.desc,notion_created_time.desc,id.desc",
    profileName: "expenses.member-detail-full-fallback",
  });
  return sortExpenseRows(all.filter((row) => expenseRowMatchesMemberId(row, raw)));
}

export async function expensesForMemberId(memberId) {
  const raw = text(memberId);
  if (!raw) {
    const error = new Error("Missing memberId.");
    error.status = 400;
    throw error;
  }

  const rows = await selectExpensesForMemberId(raw);
  const info = lastSettledInfo(rows);
  return {
    success: true,
    items: rows.map(serializeExpense),
    lastSettledAt: info.lastSettledAt,
    lastSettledDate: info.lastSettledDate,
    source: "supabase-next",
  };
}

function expenseError(message, status = 400, code = "DIRECT_EXPENSE_MUTATION_FAILED") {
  const error = new Error(message || "Expense action failed.");
  error.status = Number(status) || 400;
  error.code = code;
  return error;
}

function expenseFundsTypeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
}

async function resolveExpenseMember(account = {}) {
  let member = memberFromAccount(account);
  if (!member.name) {
    const members = await selectAll(teamMembersTable(), {
      limit: 5000,
      order: "name.asc,id.asc",
      profileName: "expenses.member-directory-mutation-fallback",
    });
    member = memberIdentity(account, members);
  }
  if (!member.name) throw expenseError("User not found.", 400);
  return member;
}

function expenseBaseRowForMember(member = {}, extra = {}) {
  return {
    notion_created_time: new Date().toISOString(),
    team_member_name: text(member.name),
    user_id: text(member.code || member.id),
    team_member_raw: text(member.name),
    team_member_url: "",
    ...extra,
  };
}

function cleanStorageObjectPath(filenameHint = "upload.bin") {
  const parts = text(filenameHint || "upload.bin")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9._-]/gi, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean);
  return parts.join("/") || `upload-${Date.now()}.bin`;
}

async function uploadExpenseDataUrl(dataUrl, filenameHint = "receipt.jpg") {
  const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw expenseError("Invalid receipt image payload.", 400);
  const contentType = text(match[1]) || "application/octet-stream";
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw expenseError("The receipt image is empty.", 400);
  if (buffer.length > 15 * 1024 * 1024) throw expenseError("The receipt image is too large.", 413);
  const uploaded = await uploadStorageObject(cleanStorageObjectPath(filenameHint), buffer, {
    contentType,
    upsert: true,
  });
  if (!uploaded?.publicUrl) throw expenseError("Receipt upload did not return a public URL.", 502);
  return uploaded.publicUrl;
}

async function buildExpenseScreenshotText({ screenshots, screenshotDataUrl, screenshotName, prefix = "expense" } = {}) {
  const files = [];
  const list = Array.isArray(screenshots) ? screenshots : [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index] || {};
    const dataUrl = text(item.dataUrl || item.screenshotDataUrl);
    if (!dataUrl) continue;
    const originalName = text(item.name || item.filename) || "receipt.png";
    const safeName = originalName.replace(/[^a-z0-9._-]/gi, "_");
    const filename = `${prefix}-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}-${safeName}`;
    const url = await uploadExpenseDataUrl(dataUrl, filename);
    files.push({ name: originalName, url });
  }
  if (!files.length && text(screenshotDataUrl)) {
    const originalName = text(screenshotName) || `${prefix}-${Date.now()}.png`;
    const safeName = originalName.replace(/[^a-z0-9._-]/gi, "_");
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
    const url = await uploadExpenseDataUrl(screenshotDataUrl, filename);
    files.push({ name: originalName, url });
  }
  return files.length ? JSON.stringify(files) : null;
}

function expenseScreenshotField(entries = []) {
  const clean = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({
      name: text(entry?.name) || `Receipt ${index + 1}`,
      url: text(entry?.url || entry?.href || entry?.publicUrl),
    }))
    .filter((entry) => entry.url);
  return clean.length ? JSON.stringify(clean) : null;
}

function storagePathsFromExpenseScreenshots(entries = []) {
  const config = getSupabaseConfig();
  const base = text(config.url).replace(/\/+$/, "");
  const bucket = text(config.storageBucket);
  if (!base || !bucket) return [];
  const markers = [
    `/storage/v1/object/public/${encodeURIComponent(bucket)}/`,
    `/storage/v1/object/sign/${encodeURIComponent(bucket)}/`,
  ];
  const out = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const rawUrl = text(entry?.url || entry);
    if (!rawUrl) continue;
    let path = "";
    try {
      const parsed = new URL(rawUrl);
      for (const marker of markers) {
        if (parsed.pathname.includes(marker)) {
          path = parsed.pathname.split(marker)[1] || "";
          break;
        }
      }
    } catch {}
    if (!path) continue;
    try { path = decodeURIComponent(path); } catch {}
    path = path.replace(/^\/+/, "").split("?")[0];
    if (path) out.push(path);
  }
  return [...new Set(out)];
}

function invalidateExpenseDataCaches() {
  expenseUsersSummaryCache = null;
  expenseUsersSummaryInflight = null;
  expenseTypeOptionsCache = null;
  expenseTypeOptionsInflight = null;
}

export async function createExpenseCashIn(account = {}, payload = {}) {
  const member = await resolveExpenseMember(account);
  const date = text(payload.date);
  const rawAmount = payload.amount;
  if (!date || rawAmount === undefined || rawAmount === null || rawAmount === "") {
    throw expenseError("Missing required fields.", 400);
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) throw expenseError("Invalid amount.", 400);
  const paymentBy = text(payload.paymentBy || payload.cashInFrom);
  if (!paymentBy) throw expenseError("Payment by is required.", 400);

  const fundsTypeRaw = text(payload.fundsType);
  const fundsTypeKey = expenseFundsTypeKey(fundsTypeRaw);
  const isOnlineTransfer = fundsTypeKey === "onlinetransfer";
  const isCashPayment = ["cashpayment", "cashreceipt", "cashreciept"].includes(fundsTypeKey);
  if (!fundsTypeKey || (!isOnlineTransfer && !isCashPayment)) throw expenseError("Invalid funds type.", 400);

  const receiptNumber = text(payload.receiptNumber);
  if (isCashPayment && !receiptNumber) throw expenseError("Missing receipt number.", 400);
  const hasScreenshot = (Array.isArray(payload.screenshots) && payload.screenshots.some((shot) => text(shot?.dataUrl || shot?.screenshotDataUrl))) || !!text(payload.screenshotDataUrl);
  if (isOnlineTransfer && !hasScreenshot) throw expenseError("Screenshot is required for online transfer.", 400);

  const fundsType = fundsTypeRaw || (isOnlineTransfer ? "Online Transfer" : "Cash Payment");
  const screenshot = await buildExpenseScreenshotText({
    screenshots: payload.screenshots,
    screenshotDataUrl: payload.screenshotDataUrl,
    screenshotName: payload.screenshotName,
    prefix: "cashin",
  });
  const row = await insert(expensesTable(), expenseBaseRowForMember(member, {
    reason: receiptNumber || fundsType || "Cash In",
    expense_date: date,
    funds_type: fundsType,
    cash_in: amount,
    cash_out: null,
    from_location: paymentBy,
    to_location: member.name || "",
    screenshot,
  }));
  invalidateExpenseDataCaches();
  return { success: true, message: "Cash in recorded", item: serializeExpense(row || {}), source: "supabase-next" };
}

export async function createExpenseCashOut(account = {}, payload = {}) {
  const member = await resolveExpenseMember(account);
  const fundsType = text(payload.fundsType);
  const date = text(payload.date);
  if (!fundsType || !date) throw expenseError("Missing required fields.", 400);
  const fundsTypeKey = expenseFundsTypeKey(fundsType);
  const screenshotRequired = new Set(["owncar", "swvl", "gobus", "bybus", "train", "indrive", "uber", "uper", "didi"]);
  const hasScreenshot = (Array.isArray(payload.screenshots) && payload.screenshots.some((shot) => text(shot?.dataUrl || shot?.screenshotDataUrl))) || !!text(payload.screenshotDataUrl);
  if (screenshotRequired.has(fundsTypeKey) && !hasScreenshot) {
    throw expenseError(fundsTypeKey === "owncar" ? "A Google Maps screenshot is required for Own car" : "Screenshot is required for this funds type", 400);
  }
  const amount = Number(payload.amount);
  if (fundsTypeKey !== "owncar" && (!Number.isFinite(amount) || amount <= 0)) throw expenseError("Cash out amount is required.", 400);

  const reason = text(payload.reason) || [
    text(payload.orderLabel),
    !text(payload.orderLabel) ? text(payload.orderDisplayId) : "",
    !text(payload.orderLabel) ? text(payload.orderType) : "",
    fundsType,
  ].filter(Boolean).join(" • ") || "Cash out";
  const screenshot = await buildExpenseScreenshotText({
    screenshots: payload.screenshots,
    screenshotDataUrl: payload.screenshotDataUrl,
    screenshotName: payload.screenshotName,
    prefix: "receipt",
  });
  const row = await insert(expensesTable(), expenseBaseRowForMember(member, {
    reason,
    expense_date: date,
    funds_type: fundsType,
    from_location: text(payload.from),
    to_location: text(payload.to),
    cash_out: fundsTypeKey === "owncar" ? 0 : amount,
    cash_in: null,
    kilometer: fundsTypeKey === "owncar" ? number(payload.kilometer, 0) : null,
    screenshot,
    orders_names: text(payload.orderLabel || payload.orderDisplayId) || null,
    orders_raw: Array.isArray(payload.orderIds) ? payload.orderIds.map(text).filter(Boolean).join(",") : (text(payload.orderId) || null),
  }));
  invalidateExpenseDataCaches();
  return { success: true, message: "Cash out saved successfully", item: serializeExpense(row || {}), source: "supabase-next" };
}

export async function settleExpenseAccount(account = {}, payload = {}) {
  const member = await resolveExpenseMember(account);
  const receiptNumber = text(payload.receiptNumber);
  const settledBy = text(payload.settledBy || payload.paymentBy);
  const date = text(payload.date) || new Date().toISOString().slice(0, 10);
  const fundsTypeRaw = text(payload.fundsType);
  const fundsTypeKey = expenseFundsTypeKey(fundsTypeRaw);
  const isOnlineTransfer = fundsTypeKey === "onlinetransfer" || fundsTypeKey === "onlinepayment";
  const isCashPayment = ["cashpayment", "cashreceipt", "cashreciept"].includes(fundsTypeKey);
  const hasScreenshot = (Array.isArray(payload.screenshots) && payload.screenshots.some((shot) => text(shot?.dataUrl || shot?.screenshotDataUrl))) || !!text(payload.screenshotDataUrl);
  if (!fundsTypeKey || (!isOnlineTransfer && !isCashPayment)) throw expenseError("Invalid funds type.", 400);
  if (isCashPayment && !receiptNumber) throw expenseError("Missing receipt number.", 400);
  if (isOnlineTransfer && !hasScreenshot) throw expenseError("Screenshot is required for online transfer.", 400);
  if (!settledBy) throw expenseError("Settled by is required.", 400);

  const rows = await selectCurrentExpenseRows(member);
  const totalCashIn = rows.reduce((sum, row) => sum + number(valueFor(row, ["cash_in", "Cash in"]), 0), 0);
  const totalCashOut = rows.reduce((sum, row) => sum + number(valueFor(row, ["cash_out", "Cash out"]), 0), 0);
  const balance = totalCashIn - totalCashOut;
  const settleAmount = Math.abs(balance);
  const isPositive = balance > 0;
  const screenshot = await buildExpenseScreenshotText({
    screenshots: payload.screenshots,
    screenshotDataUrl: payload.screenshotDataUrl,
    screenshotName: payload.screenshotName,
    prefix: "settlement",
  });
  await insert(expensesTable(), expenseBaseRowForMember(member, {
    reason: "Settled my account",
    expense_date: date,
    funds_type: fundsTypeRaw || (isOnlineTransfer ? "Online Transfer" : "Cash Payment"),
    from_location: settledBy,
    to_location: member.name || "",
    cash_in: isPositive ? 0 : settleAmount,
    cash_out: isPositive ? settleAmount : 0,
    orders_raw: receiptNumber || null,
    orders_names: receiptNumber || null,
    screenshot,
  }));
  invalidateExpenseDataCaches();
  return {
    success: true,
    totalCashIn,
    totalCashOut,
    balance,
    settleAmount,
    direction: isPositive ? "cash_out" : "cash_in",
    source: "supabase-next",
  };
}

export async function updateExpenseForAdmin(expenseId, payload = {}) {
  const id = text(expenseId);
  if (!id) throw expenseError("Missing expense ID.", 400);
  const current = await selectById(expensesTable(), id);
  if (!current) throw expenseError("Expense not found.", 404);

  const screenshots = [];
  const existingUrls = Array.isArray(payload.screenshotUrls)
    ? payload.screenshotUrls
    : String(payload.screenshotUrls || "").split(/[\n,]+/);
  existingUrls.map(text).filter(Boolean).forEach((url, index) => screenshots.push({ name: `Receipt ${index + 1}`, url }));

  const newScreenshotText = await buildExpenseScreenshotText({
    screenshots: Array.isArray(payload.screenshots) ? payload.screenshots : [],
    screenshotDataUrl: payload.screenshotDataUrl,
    screenshotName: payload.screenshotName,
    prefix: `expense-edit-${id}`,
  });
  if (newScreenshotText) {
    try {
      const parsed = JSON.parse(newScreenshotText);
      if (Array.isArray(parsed)) parsed.forEach((entry) => { if (text(entry?.url)) screenshots.push({ name: text(entry?.name) || "Receipt", url: text(entry.url) }); });
    } catch {}
  }

  const unique = [];
  const seen = new Set();
  for (const shot of screenshots) {
    const url = text(shot?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push({ name: text(shot?.name) || "Receipt", url });
  }

  const patch = {
    reason: text(payload.reason) || null,
    expense_date: text(payload.date) || null,
    funds_type: text(payload.fundsType) || null,
    from_location: text(payload.from) || null,
    to_location: text(payload.to) || null,
    cash_in: number(payload.cashIn, 0),
    cash_out: number(payload.cashOut, 0),
    kilometer: number(payload.kilometer, 0),
    cash_in_from: text(payload.cashInFrom) || null,
    screenshot: expenseScreenshotField(unique),
  };
  const updated = await updateById(expensesTable(), id, patch);
  invalidateExpenseDataCaches();
  return { success: true, item: serializeExpense(updated || {}), source: "supabase-next" };
}

export async function deleteExpenseForAdmin(expenseId) {
  const id = text(expenseId);
  if (!id) throw expenseError("Missing expense ID.", 400);
  const row = await selectById(expensesTable(), id);
  if (!row) throw expenseError("Expense not found.", 404);

  const entries = parseScreenshots(valueFor(row, ["screenshot", "Screenshot", "files_media"]));
  const paths = storagePathsFromExpenseScreenshots(entries);
  let storage = { deleted: 0, paths: [] };
  if (paths.length) {
    try { storage = await deleteStorageObjects(paths); }
    catch (error) { storage = { deleted: 0, paths, error: error?.message || String(error) }; }
  }
  await deleteById(expensesTable(), id);
  invalidateExpenseDataCaches();
  return { success: true, deletedId: id, storage, source: "supabase-next" };
}


export async function expenseScreenshotForId(expenseId, index = 0) {
  const id = text(expenseId);
  if (!id) {
    const error = new Error("Missing expenseId.");
    error.status = 400;
    throw error;
  }

  const idCandidates = [id];
  const compactUuid = id.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compactUuid)) {
    const hyphenated = `${compactUuid.slice(0, 8)}-${compactUuid.slice(8, 12)}-${compactUuid.slice(12, 16)}-${compactUuid.slice(16, 20)}-${compactUuid.slice(20)}`;
    if (!idCandidates.includes(hyphenated)) idCandidates.push(hyphenated);
    if (!idCandidates.includes(compactUuid)) idCandidates.push(compactUuid);
  }

  let row = null;
  for (const candidate of idCandidates) {
    row = await selectById(expensesTable(), candidate).catch(() => null);
    if (row) break;
  }
  if (!row) {
    const error = new Error("Expense screenshot not found.");
    error.status = 404;
    throw error;
  }

  const screenshots = parseScreenshots(valueFor(row, ["screenshot", "Screenshot", "files_media"]));
  const parsedIndex = Number.parseInt(String(index ?? "0"), 10);
  const safeIndex = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
  const shot = screenshots[safeIndex] || screenshots[0] || null;
  const url = text(shot?.url);
  if (!url || !/^https?:\/\//i.test(url)) {
    const error = new Error("No screenshot.");
    error.status = 404;
    throw error;
  }

  return {
    id,
    index: safeIndex,
    name: text(shot?.name) || `Receipt ${safeIndex + 1}`,
    url,
  };
}
