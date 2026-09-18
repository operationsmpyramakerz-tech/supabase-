import "server-only";

import { isSupabaseConfigured, select, selectAll } from "./supabase-rest";
import { serializeOperationsSummaryRow } from "./operations-orders-data";
import { stocktakingForAccount } from "./stocktaking-data";
import { expensesForAccount } from "./expenses-data";
import { listTeamMembersLite } from "./team-members-service";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOME_ROWS_CACHE_TTL_MS = 15_000;
const HOME_ROW_PAGE_SIZE = 1000;
const HOME_ROW_MAX = 50_000;
const HOME_SUMMARY_SELECT = [
  "id",
  "reason",
  "order_number",
  "order_type",
  "notion_created_time",
  "product_name",
  "unit_price",
  "quantity_requested",
  "quantity_progress",
  "quantity_edited_by_supervisor",
  "quantity_received_by_operations",
  "quantity_remaining",
  "status",
  "issue_description",
  "serial_number",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "spare_parts_replaced",
  "operations_approval",
  "rejected_reason",
  "receipt_number",
  "team_member_id",
  "team_member_name",
  "person_received_by_operations",
  "sv_approval",
].join(",");

const homeRowsCache = new Map();
const homeRowsInflight = new Map();

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lower(value) {
  return text(value).toLowerCase();
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

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function filterText(value) {
  return String(value ?? "").trim().replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
}

function cacheKeyForFilters(filters = {}) {
  return Object.entries(filters || {})
    .filter(([, value]) => value !== null && typeof value !== "undefined" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|") || "all";
}

async function selectHomeRows(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  const key = cacheKeyForFilters(filters);
  const cached = homeRowsCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (homeRowsInflight.has(key)) return await homeRowsInflight.get(key);

  const load = async () => {
    const rows = [];
    let offset = 0;
    let useProjection = true;

    while (offset < HOME_ROW_MAX) {
      const base = {
        order: "notion_created_time.desc,id.desc",
        limit: String(HOME_ROW_PAGE_SIZE),
        offset: String(offset),
        ...(filters || {}),
      };

      let chunk;
      if (useProjection) {
        try {
          chunk = await select(ordersTable(), { ...base, select: HOME_SUMMARY_SELECT }, { profileName: "home.orders-summary" });
        } catch {
          useProjection = false;
          chunk = await select(ordersTable(), { ...base, select: "*" }, { profileName: "home.orders-summary-fallback" });
        }
      } else {
        chunk = await select(ordersTable(), { ...base, select: "*" }, { profileName: "home.orders-summary-fallback" });
      }

      const page = Array.isArray(chunk) ? chunk : [];
      rows.push(...page);
      if (page.length < HOME_ROW_PAGE_SIZE) break;
      offset += page.length;
    }

    return rows.map(serializeOperationsSummaryRow);
  };

  const pending = load();
  homeRowsInflight.set(key, pending);
  try {
    const rows = await pending;
    homeRowsCache.set(key, { value: rows, expiresAt: Date.now() + HOME_ROWS_CACHE_TTL_MS });
    if (homeRowsCache.size > 16) homeRowsCache.delete(homeRowsCache.keys().next().value);
    return rows;
  } finally {
    if (homeRowsInflight.get(key) === pending) homeRowsInflight.delete(key);
  }
}

function identityFromAccount(account = {}) {
  return {
    id: text(account.id || account.userId || account.userSupabaseId),
    name: text(account.username || account.name),
    username: text(account.username || account.name),
    email: text(account.email),
    employeeCode: text(account.employeeCode),
  };
}

function itemOwnerValues(item = {}) {
  return [
    item.createdById,
    item.createdByName,
    item.teamMemberId,
    item.teamMemberName,
    item.userId,
    item.userName,
    item.username,
    item.requestedBy,
    item.ownerName,
    item.createdBy,
    item.requesterName,
  ].flatMap((value) => Array.isArray(value) ? value : [value]).map(lower).filter(Boolean);
}

function itemMatchesUser(item, user) {
  if (!user) return true;
  const targets = [user.id, user.name, user.username, user.email, user.employeeCode].map(lower).filter(Boolean);
  if (!targets.length) return true;
  const owners = itemOwnerValues(item);
  return targets.some((target) => owners.some((owner) => owner === target || owner.includes(target) || target.includes(owner)));
}

function currentRowMatchesAccount(item = {}, account = {}) {
  const username = lower(account.username || account.name);
  const by = lower(item.createdByName || item.teamMemberName);
  // Match the legacy Current Orders rule: a row without a creator is visible,
  // otherwise the stored name must match the signed-in username in either direction.
  if (!by) return true;
  return !!username && (by.includes(username) || username.includes(by));
}

function identityFilter(identity = {}, { includeUnnamed = false } = {}) {
  const clauses = [];
  const id = String(identity.id || "").replace(/[^0-9A-Za-z_-]/g, "");
  if (id) clauses.push(`team_member_id.eq.${id}`);
  const rawNames = [identity.username, identity.name].map(filterText).filter(Boolean);
  const names = Array.from(new Set(rawNames.flatMap((value) => [
    value,
    value.split(/\s+/)[0] || "",
  ]).filter((value) => value.length >= 2)));
  for (const name of names) clauses.push(`team_member_name.ilike.*${name}*`);
  if (includeUnnamed) clauses.push("team_member_name.is.null", "team_member_name.eq.");
  return clauses.length ? { or: `(${clauses.join(",")})` } : {};
}

async function loadCurrentRows(account = {}) {
  const identity = identityFromAccount(account);
  if (!identity.name) return [];
  let rows;
  try {
    rows = await selectHomeRows(identityFilter(identity, { includeUnnamed: true }));
  } catch {
    rows = await selectHomeRows({});
  }
  return (Array.isArray(rows) ? rows : []).filter((row) => currentRowMatchesAccount(row, account));
}

async function loadRequestedRows() {
  let rows;
  try {
    rows = await selectHomeRows({ sv_approval: "ilike.*approved*" });
  } catch {
    rows = await selectHomeRows({});
  }
  return (Array.isArray(rows) ? rows : []).filter((row) => lower(row.svApproval ?? row.approval) === "approved");
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
  return raw.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

function memberMatchesAccount(row = {}, account = {}) {
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  const rowId = text(valueFor(row, ["id", "ID"]));
  if (accountId && rowId && accountId === rowId) return true;

  const names = [account.username, account.name].map(canonical).filter(Boolean);
  const rowNames = [
    valueFor(row, ["username", "Username"]),
    valueFor(row, ["name", "Name", "full_name", "Full Name"]),
  ].map(canonical).filter(Boolean);
  if (names.some((name) => rowNames.includes(name))) return true;

  const email = canonical(account.email);
  const rowEmail = canonical(valueFor(row, ["email", "Email"]));
  return !!email && !!rowEmail && email === rowEmail;
}

async function findReviewerMember(account = {}) {
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  if (accountId) {
    try {
      const rows = await select(teamMembersTable(), {
        select: "*",
        id: `eq.${String(accountId).replace(/[^0-9A-Za-z_-]/g, "")}`,
        limit: "2",
      });
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {}
  }

  const username = filterText(account.username || account.name);
  if (username) {
    try {
      const rows = await select(teamMembersTable(), {
        select: "*",
        name: `ilike.${username}`,
        limit: "5",
      });
      const exact = (Array.isArray(rows) ? rows : []).find((row) => memberMatchesAccount(row, account));
      if (exact) return exact;
    } catch {}
  }

  // Compatibility only: customized schemas may not expose canonical id/name
  // columns. Keep the old broad lookup as a last resort instead of making it
  // part of every Home request.
  const rows = await selectAll(teamMembersTable(), { limit: 5000 });
  return (Array.isArray(rows) ? rows : []).find((row) => memberMatchesAccount(row, account)) || null;
}

async function reviewerIdentityRows() {
  try {
    return await selectAll(teamMembersTable(), { limit: 5000, select: "id,name" });
  } catch {
    return await selectAll(teamMembersTable(), { limit: 5000 });
  }
}

async function reviewerVisibility(account = {}) {
  const current = await findReviewerMember(account);
  if (!current) return { ids: [], names: [] };

  const currentId = text(valueFor(current, ["id", "ID"]));
  let ids = [];
  let names = [];

  if (currentId) {
    try {
      const junction = await select("team_member_sv_schools", {
        select: "visible_team_member_id,visible_team_member_name",
        team_member_id: `eq.${currentId}`,
        limit: "5000",
      });
      if (Array.isArray(junction) && junction.length) {
        ids = junction.map((row) => text(row.visible_team_member_id)).filter(Boolean);
        names = junction.map((row) => text(row.visible_team_member_name)).filter(Boolean);
      }
    } catch {
      // Older schemas keep the visibility list on team_members.
    }
  }

  if (!ids.length) {
    ids = splitValues(valueFor(current, ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"]));
  }
  if (!names.length) {
    names = splitValues(valueFor(current, ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"]));
  }

  if (names.length) {
    const members = await reviewerIdentityRows().catch(() => []);
    const byName = new Map((Array.isArray(members) ? members : []).map((row) => [
      canonical(valueFor(row, ["name", "Name", "full_name", "Full Name"])),
      row,
    ]));
    for (const name of names) {
      const row = byName.get(canonical(name));
      const id = row ? text(valueFor(row, ["id", "ID"])) : "";
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return {
    ids: [...new Set(ids.map(text).filter(Boolean))],
    names: [...new Set(names.map(text).filter(Boolean))],
  };
}

function reviewerFilter(visible = {}) {
  const clauses = [];
  for (const value of visible.ids || []) {
    const id = String(value || "").replace(/[^0-9A-Za-z_-]/g, "");
    if (id) clauses.push(`team_member_id.eq.${id}`);
  }
  for (const value of visible.names || []) {
    const name = filterText(value);
    if (name) clauses.push(`team_member_name.ilike.*${name}*`);
  }
  return clauses.length ? { or: `(${clauses.join(",")})` } : {};
}

function visibleToReviewer(item = {}, visible = {}) {
  const ids = new Set((visible.ids || []).map(text).filter(Boolean));
  const names = new Set((visible.names || []).map(canonical).filter(Boolean));
  const id = text(item.createdById || item.teamMemberId);
  const name = canonical(item.createdByName || item.teamMemberName);
  return (!!id && ids.has(id)) || (!!name && names.has(name));
}

async function loadReviewRows(account = {}) {
  const visible = await reviewerVisibility(account);
  if (!visible.ids.length && !visible.names.length) return [];

  let rows;
  try {
    rows = await selectHomeRows(reviewerFilter(visible));
  } catch {
    rows = await selectHomeRows({});
  }

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!visibleToReviewer(row, visible)) return false;
    if (/^created from proposal:/i.test(text(row.issueDescription))) return false;
    return !/archive|archived/.test(lower(row.status));
  });
}

async function loadSelectedSystemRows(selectedUser = null) {
  if (!selectedUser) return null;
  let rows;
  try {
    rows = await selectHomeRows(identityFilter(selectedUser));
  } catch {
    rows = await selectHomeRows({});
  }
  return (Array.isArray(rows) ? rows : []).filter((row) => itemMatchesUser(row, selectedUser));
}

function allowedSet(account = {}) {
  return new Set((Array.isArray(account.allowedPages) ? account.allowedPages : []).map((value) => lower(value)));
}

function accountIsAdmin(account = {}) {
  const name = canonical(account.name || account.username);
  const position = canonical(account.position);
  return name === "admin" || position.includes("admin");
}

function hasAccess(account = {}, aliases = []) {
  if (accountIsAdmin(account)) return true;
  const allowed = allowedSet(account);
  if (aliases.some((alias) => allowed.has(lower(alias)))) return true;

  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  return rows.some((row) => {
    if (row?.isEnabled === false) return false;
    const candidates = [
      row.pageName,
      row.pageKey,
      row.routePath,
      ...(Array.isArray(row.aliases) ? row.aliases : []),
    ].map(canonical).filter(Boolean);
    return candidates.some((candidate) => wanted.has(candidate));
  });
}

export async function listHomeAnalysisUsers() {
  const members = await listTeamMembersLite();
  return (Array.isArray(members) ? members : [])
    .map((member) => ({
      id: text(member.id),
      name: text(member.name) || "Unnamed",
      username: text(member.name) || "Unnamed",
      stocktakingColumn: text(member.stocktakingColumn) || null,
    }))
    .filter((member) => member.id && member.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveSelectedUser(requestedUserId = "all") {
  const id = text(requestedUserId) || "all";
  if (id === "all") return null;
  const users = await listHomeAnalysisUsers();
  return users.find((user) => String(user.id) === id) || { id, name: id, username: "" };
}

async function loadStockRows(account = {}, selectedUser = null) {
  const identity = selectedUser || account;
  try {
    const rows = await stocktakingForAccount(identity);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if ([400, 404].includes(Number(error?.status))) return [];
    throw error;
  }
}

async function loadExpenseItems(account = {}, selectedUser = null) {
  const identity = selectedUser || account;
  try {
    const payload = await expensesForAccount(identity);
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch (error) {
    if ([400, 404].includes(Number(error?.status))) return [];
    throw error;
  }
}

function rowCost(row = {}) {
  const quantity = number(row.quantity ?? row.qty ?? row.requestedQuantity ?? row.requested_quantity ?? 1);
  const unit = number(row.unitPrice ?? row.unit_price ?? row.unityPrice ?? row.price ?? row.cost);
  const explicit = number(row.totalCost ?? row.total_cost ?? row.total ?? row.amount);
  return explicit || quantity * unit;
}

function rowDate(row = {}) {
  return text(row.createdAt ?? row.created_at ?? row.createdTime ?? row.notionCreatedTime ?? row.notion_created_time ?? row.date ?? row.requestDate ?? row.request_date);
}

function groupKey(row = {}, index = 0) {
  const direct = text(row.orderId ?? row.order_id ?? row.requestId ?? row.request_id ?? row.orderCode ?? row.order_code ?? row.code);
  if (direct) return direct;
  const date = rowDate(row).slice(0, 16);
  const owner = text(row.requestedBy ?? row.requested_by ?? row.userName ?? row.username ?? row.createdBy ?? row.createdByName ?? row.teamMemberName);
  return `${date}|${owner}|${index}`;
}

function groupRows(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = groupKey(row, index);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.values()].map((items) => ({
    items,
    cost: items.reduce((sum, item) => sum + rowCost(item), 0),
  }));
}

function bucketCurrent(group) {
  const statuses = group.items.map((item) => lower(item.status ?? item.orderStatus ?? item.order_status));
  if (statuses.some((status) => status.includes("reject") || status.includes("cancel"))) return "rejected";
  if (statuses.length && statuses.every((status) => status.includes("complete") || status.includes("deliver") || status.includes("done") || status.includes("arrived"))) return "completed";
  return "progress";
}

function bucketReview(group) {
  const statuses = group.items.map((item) => lower(item.approval ?? item.svApproval ?? item.sv_approval ?? item.status));
  if (statuses.some((status) => status.includes("reject"))) return "rejected";
  if (statuses.length && statuses.every((status) => status.includes("approve"))) return "approved";
  return "pending";
}

function bucketOperations(group) {
  const statuses = group.items.map((item) => lower(item.status));
  if (statuses.some((status) => status.includes("deliver") || status.includes("complete") || status.includes("arrived"))) return "delivered";
  if (statuses.some((status) => status.includes("receive") || status.includes("prepare") || status.includes("ship"))) return "received";
  return "pending";
}

function bucketMaintenance(group) {
  const statuses = group.items.map((item) => lower(item.status));
  const hasWork = group.items.some((item) => text(item.repairAction ?? item.repair_action ?? item.resolutionMethod ?? item.resolution_method));
  if (statuses.some((status) => status.includes("deliver") || status.includes("complete") || status.includes("done") || status.includes("arrived"))) return "completed";
  if (hasWork || statuses.some((status) => status.includes("progress") || status.includes("repair") || status.includes("receive"))) return "progress";
  return "pending";
}

const TYPE_ANALYSIS_DEFINITIONS = [
  { key: "request", label: "Request", color: "#176b3a" },
  { key: "withdrawal", label: "Withdrawal", color: "#dc2626" },
  { key: "maintenance", label: "Maintenance", color: "#eab308" },
];

function optionText(value) {
  if (Array.isArray(value)) return value.map(optionText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return text(value.name ?? value.label ?? value.title ?? value.value);
  return text(value);
}

function orderTypeBucket(group = {}) {
  const rows = Array.isArray(group.items) ? group.items : [];
  const candidates = [
    group.orderType,
    group.order_type,
    group.type,
    ...rows.flatMap((row) => [row.orderType, row.order_type, row.type, row.requestType, row.request_type]),
  ];
  for (const candidate of candidates) {
    const key = lower(optionText(candidate)).replace(/[^a-z0-9]+/g, "");
    if (!key) continue;
    if (/(withdraw|withdrawal)/.test(key)) return "withdrawal";
    if (/(maintenance|requestmaintenance)/.test(key)) return "maintenance";
    if (/(request|delivery|product)/.test(key)) return "request";
  }
  return "request";
}

function groupCreatedDate(group = {}) {
  const dates = (Array.isArray(group.items) ? group.items : [])
    .map((row) => new Date(rowDate(row) || 0))
    .filter((date) => Number.isFinite(date.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function filterGroupsByTime(groups = [], range = "all") {
  const source = Array.isArray(groups) ? groups : [];
  if (range === "all") return source;
  const now = new Date();
  const from = new Date(now);
  if (range === "week") from.setDate(from.getDate() - 7);
  else if (range === "month") from.setMonth(from.getMonth() - 1);
  else if (range === "year") from.setFullYear(from.getFullYear() - 1);
  else return source;
  return source.filter((group) => {
    const date = groupCreatedDate(group);
    return date && date >= from && date <= now;
  });
}

function groupMatchesUser(group, user) {
  if (!user) return true;
  return (Array.isArray(group?.items) ? group.items : []).some((item) => itemMatchesUser(item, user));
}

function summarizeGroupList(groups, definitions, bucketFn) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const buckets = definitions.map((definition) => ({ ...definition, count: 0, cost: 0 }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  safeGroups.forEach((group) => {
    const bucket = byKey.get(bucketFn(group)) || buckets[0];
    bucket.count += 1;
    bucket.cost += number(group.cost);
  });
  return {
    total: safeGroups.length,
    totalCost: safeGroups.reduce((sum, group) => sum + number(group.cost), 0),
    buckets,
  };
}

function analysisMatrix(groups, statusDefinitions, statusBucketFn) {
  const result = { status: {}, type: {} };
  for (const mode of ["status", "type"]) {
    const definitions = mode === "type" ? TYPE_ANALYSIS_DEFINITIONS : statusDefinitions;
    const bucketFn = mode === "type" ? orderTypeBucket : statusBucketFn;
    for (const range of ["all", "week", "month", "year"]) {
      result[mode][range] = summarizeGroupList(filterGroupsByTime(groups, range), definitions, bucketFn);
    }
  }
  return result;
}

function filterItemsByDuration(items = [], duration = "all") {
  const source = Array.isArray(items) ? items : [];
  if (duration === "all") return source;
  const now = new Date();
  const from = new Date(now);
  if (duration === "week") from.setDate(from.getDate() - 7);
  else if (duration === "month") from.setMonth(from.getMonth() - 1);
  else if (duration === "year") from.setFullYear(from.getFullYear() - 1);
  else return source;
  return source.filter((item) => {
    const date = new Date(item.date ?? item.createdAt ?? item.created_at ?? item.expense_date ?? 0);
    return Number.isFinite(date.getTime()) && date >= from && date <= now;
  });
}

function stockTagName(item = {}) {
  return text(item?.tag?.name ?? item?.tag) || "Untagged";
}

function stockSummary(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    const quantity = number(row.quantity ?? row.qty);
    summary.quantity += quantity;
    summary.cost += quantity * number(row.unitPrice ?? row.unit_price ?? row.unityPrice ?? row.price);
    summary.records += 1;
    return summary;
  }, { quantity: 0, cost: 0, records: 0 });
}

function stockTagAnalysis(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const tags = Array.from(new Set(source.map(stockTagName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const summaries = { all: stockSummary(source) };
  tags.forEach((tag) => {
    summaries[tag] = stockSummary(source.filter((row) => stockTagName(row) === tag));
  });
  return { tags, summaries };
}

function expensesSummary(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const year = new Date().getFullYear();
  const values = Array(12).fill(0);
  items.forEach((item) => {
    const date = new Date(item.date ?? item.createdAt ?? item.created_at ?? item.expense_date ?? "");
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) return;
    values[date.getMonth()] += number(item.cashOut ?? item.cash_out);
  });
  const currentMonth = new Date().getMonth();
  return {
    year,
    currentMonth,
    months: MONTHS.map((label, index) => ({ label, value: values[index] })),
  };
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function recentOrders(rows = []) {
  const groups = groupRows(rows).map((group, index) => {
    const first = group.items[0] || {};
    const created = rowDate(first);
    const statusKey = bucketCurrent(group);
    const status = statusKey === "completed" ? "Completed" : statusKey === "rejected" ? "Rejected" : "In progress";
    const tone = statusKey === "completed" ? "success" : statusKey === "rejected" ? "danger" : "info";
    return {
      key: `${groupKey(first, index)}-${index}`,
      title: text(first.reason ?? first.orderReason ?? first.order_reason ?? first.productName ?? first.product_name) || "Order",
      itemCount: group.items.length,
      status,
      tone,
      date: formatDate(created),
      createdTs: new Date(created || 0).getTime() || 0,
      total: group.cost,
      href: "/next/orders",
    };
  });
  return groups.sort((a, b) => b.createdTs - a.createdTs).slice(0, 5);
}

const CURRENT_STATUS_DEFINITIONS = [
  { key: "progress", label: "In progress", color: "#f97316" },
  { key: "completed", label: "Completed", color: "#168455" },
  { key: "rejected", label: "Rejected", color: "#dc2626" },
];
const REVIEW_STATUS_DEFINITIONS = [
  { key: "pending", label: "Pending", color: "#f97316" },
  { key: "approved", label: "Approved", color: "#168455" },
  { key: "rejected", label: "Rejected", color: "#dc2626" },
];
const OPERATIONS_STATUS_DEFINITIONS = [
  { key: "pending", label: "Pending", color: "#f97316" },
  { key: "received", label: "Received", color: "#101828" },
  { key: "delivered", label: "Delivered", color: "#168455" },
];
const MAINTENANCE_STATUS_DEFINITIONS = [
  { key: "pending", label: "Pending", color: "#f97316" },
  { key: "progress", label: "In progress", color: "#18223a" },
  { key: "completed", label: "Completed", color: "#168455" },
];

function buildHomeOverview({
  currentRows = [],
  reviewRows = [],
  requestedRows = [],
  selectedSystemRows = null,
  selectedUser = null,
  duration = "all",
  stockRows = [],
  expenseItems = [],
} = {}) {
  const globalDuration = ["all", "week", "month", "year"].includes(duration) ? duration : "all";
  const applyGlobalFilters = (groups) => filterGroupsByTime(
    (Array.isArray(groups) ? groups : []).filter((group) => groupMatchesUser(group, selectedUser)),
    globalDuration,
  );

  const selectedRowsAvailable = Array.isArray(selectedSystemRows);
  const selectedApprovedRows = selectedRowsAvailable
    ? selectedSystemRows.filter((row) => lower(row.svApproval ?? row.sv_approval ?? row.approval) === "approved")
    : null;

  const currentGroups = selectedRowsAvailable
    ? filterGroupsByTime(groupRows(selectedSystemRows), globalDuration)
    : applyGlobalFilters(groupRows(currentRows));
  const reviewGroups = selectedRowsAvailable
    ? filterGroupsByTime(groupRows(selectedSystemRows), globalDuration)
    : applyGlobalFilters(groupRows(reviewRows));
  const requestedGroups = groupRows(selectedApprovedRows ?? requestedRows);
  const operationsGroups = selectedRowsAvailable
    ? filterGroupsByTime(requestedGroups.filter((group) => orderTypeBucket(group) !== "maintenance"), globalDuration)
    : applyGlobalFilters(requestedGroups.filter((group) => orderTypeBucket(group) !== "maintenance"));
  const maintenanceGroups = selectedRowsAvailable
    ? filterGroupsByTime(requestedGroups.filter((group) => orderTypeBucket(group) === "maintenance"), globalDuration)
    : applyGlobalFilters(requestedGroups.filter((group) => orderTypeBucket(group) === "maintenance"));

  const currentMatrix = analysisMatrix(currentGroups, CURRENT_STATUS_DEFINITIONS, bucketCurrent);
  const reviewMatrix = analysisMatrix(reviewGroups, REVIEW_STATUS_DEFINITIONS, bucketReview);
  const operationsMatrix = analysisMatrix(operationsGroups, OPERATIONS_STATUS_DEFINITIONS, bucketOperations);
  const maintenanceSummary = summarizeGroupList(maintenanceGroups, MAINTENANCE_STATUS_DEFINITIONS, bucketMaintenance);
  const stockAnalysis = stockTagAnalysis(stockRows);
  const filteredExpenseItems = filterItemsByDuration(expenseItems, globalDuration);

  return {
    currentMatrix,
    reviewMatrix,
    operationsMatrix,
    maintenanceSummary,
    stockTagSummaries: stockAnalysis.summaries,
    stockTags: stockAnalysis.tags,
    expenseSummary: expensesSummary({ items: filteredExpenseItems }),
    recentOrders: recentOrders(currentRows),
    currentTotalGroups: currentMatrix?.status?.all?.total || 0,
  };
}

export async function loadHomeOverviewDirect({
  account = {},
  requestedUserId = "all",
  duration = "all",
} = {}) {
  if (!isSupabaseConfigured()) return null;

  const selectedDuration = ["all", "week", "month", "year"].includes(String(duration || "").toLowerCase())
    ? String(duration).toLowerCase()
    : "all";

  const showCurrent = hasAccess(account, ["Current Orders", "/orders"]);
  const showReview = hasAccess(account, ["Orders Review", "/orders-review"]);
  const showOperations = hasAccess(account, ["Requested Orders", "Operations Orders", "/operations-orders"]);
  const showMaintenance = hasAccess(account, ["Maintenance Orders", "/maintenance-orders"]);
  const showStock = hasAccess(account, ["Stocktaking", "/stocktaking"]);
  const showExpenses = hasAccess(account, ["Expenses", "/expenses"]);
  const needsOrderOverview = showCurrent || showReview || showOperations || showMaintenance;

  const selectedUser = await resolveSelectedUser(requestedUserId);

  const currentPromise = showCurrent ? loadCurrentRows(account) : Promise.resolve([]);
  const requestedPromise = !selectedUser && (showOperations || showMaintenance)
    ? loadRequestedRows()
    : Promise.resolve([]);
  const reviewPromise = !selectedUser && showReview
    ? loadReviewRows(account)
    : Promise.resolve([]);
  const selectedRowsPromise = selectedUser && needsOrderOverview
    ? loadSelectedSystemRows(selectedUser)
    : Promise.resolve(null);
  const stockPromise = showStock
    ? loadStockRows(account, selectedUser)
    : Promise.resolve([]);
  const expensesPromise = showExpenses
    ? loadExpenseItems(account, selectedUser)
    : Promise.resolve([]);

  const [
    currentRows,
    requestedRows,
    reviewRows,
    selectedSystemRows,
    stockRows,
    expenseItems,
  ] = await Promise.all([
    currentPromise,
    requestedPromise,
    reviewPromise,
    selectedRowsPromise,
    stockPromise,
    expensesPromise,
  ]);

  const overview = buildHomeOverview({
    currentRows: Array.isArray(currentRows) ? currentRows : [],
    reviewRows: Array.isArray(reviewRows) ? reviewRows : [],
    requestedRows: Array.isArray(requestedRows) ? requestedRows : [],
    selectedSystemRows: Array.isArray(selectedSystemRows) ? selectedSystemRows : null,
    selectedUser,
    duration: selectedDuration,
    stockRows: Array.isArray(stockRows) ? stockRows : [],
    expenseItems: Array.isArray(expenseItems) ? expenseItems : [],
  });

  return {
    ...overview,
    selectedUser: selectedUser?.id ? {
      id: String(selectedUser.id),
      name: selectedUser.name || selectedUser.username || String(selectedUser.id),
      username: selectedUser.username || selectedUser.name || "",
    } : null,
    selectedUserId: selectedUser?.id ? String(selectedUser.id) : "all",
    selectedDuration,
    showCurrent,
    showReview,
    showOperations,
    showMaintenance,
    showStock,
    showExpenses,
    source: "supabase-direct",
  };
}
