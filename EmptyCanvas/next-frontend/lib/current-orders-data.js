import "server-only";

import { isSupabaseConfigured, select } from "./supabase-rest";
import { serializeOperationsSummaryRow } from "./operations-orders-data";
import { loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";
import { loadOrderRowsByNumbers, scanOrderNumberCandidates } from "./order-pagination";
import { applyOrderSearchPlan, canUseOrderSearchText, createOrderSearchPlan, noteOrderSearchTextError } from "./order-search-hotpath";
import { canUseOrderCandidateRpc, loadOrderCandidateNumbersRpc, noteOrderCandidateRpcError } from "./order-candidate-rpc";

const PAGE_LIMIT = 36;
const PAGE_MAX = 80;
const SUMMARY_SELECT = [
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

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function num(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tableName() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function pageLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return PAGE_LIMIT;
  return Math.max(10, Math.min(PAGE_MAX, Math.floor(parsed)));
}

function pageCursor(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFilterText(value) {
  return String(value ?? "").trim().replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
}

function orderTypeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function orderTypeLabel(value) {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return "Request Products";
  if (key === "withdrawproducts") return "Withdraw Products";
  if (key === "requestmaintenance") return "Request Maintenance";
  return "";
}

function accountUsername(account = {}) {
  return text(account?.username || account?.name);
}

function memberMatches(createdByName, username) {
  const user = norm(username);
  const by = norm(createdByName);
  if (!user || !by) return true;
  return by.includes(user) || user.includes(by);
}

function statusIndex(value) {
  const status = norm(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress)/.test(status)) return 2;
  return 1;
}

function approvalState(value) {
  const state = norm(value).replace(/[_.-]+/g, " ");
  if (state.includes("reject")) return "rejected";
  if (state.includes("approv")) return "approved";
  return "";
}

function receivedQuantity(item) {
  const value = item?.quantityReceived ?? item?.quantity_received_by_operations;
  if (value === null || value === undefined || value === "") return 0;
  return finite(value);
}

function baseQuantity(item) {
  const edited = item?.quantityEditedBySupervisor ?? item?.quantity_edited_by_supervisor ?? item?.quantityProgress ?? item?.quantity_progress;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  const original = item?.quantityRequested ?? item?.quantity_requested;
  if (original !== null && original !== undefined && original !== "") return finite(original);
  return finite(item?.quantity);
}

function remainingQuantity(item) {
  const base = baseQuantity(item);
  const received = receivedQuantity(item);
  const storedRaw = item?.quantityRemaining ?? item?.quantity_remaining;
  const stored = storedRaw === null || storedRaw === undefined || storedRaw === "" ? null : finite(storedRaw);
  const edited = Boolean(item?.quantityReceivedEdited ?? item?.quantity_received_edited);
  if (stored !== null) {
    if (!edited && Math.abs(base) > 1e-9 && Math.abs(received) < 1e-9 && Math.abs(stored) < 1e-9) return base;
    return stored;
  }
  return base - received;
}

function isMaintenanceOrder(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function rejectedReason(item) {
  return text(item?.rejectedReason ?? item?.rejected_reason);
}

function statusTabForItem(item) {
  const idx = statusIndex(item?.status);
  const supervisor = approvalState(item?.svApproval ?? item?.sv_approval);
  const operations = approvalState(item?.operationsApproval ?? item?.operations_approval);

  if (idx >= 5) return "archive";
  if (supervisor === "rejected" || operations === "rejected" || rejectedReason(item)) return "rejected";
  if (idx >= 4) return "arrived";
  if (idx >= 3) return "shipped";
  if (supervisor === "approved" || operations === "approved" || idx >= 2) return "approved";
  return "under-supervision";
}

function groupMatchesTab(items = [], tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
  if (cleanTab === "all") return true;
  if (cleanTab === "remaining" || cleanTab === "shipped") {
    const stage = Math.max(1, ...items.map((item) => statusIndex(item?.status)));
    const hasRemaining = items.some((item) => Math.abs(remainingQuantity(item)) > 1e-9);
    const hasReceived = items.some((item) => Math.abs(receivedQuantity(item)) > 1e-9);
    const maintenance = isMaintenanceOrder(items?.[0]?.orderType);
    if (cleanTab === "remaining") return stage === 3 && !maintenance && hasRemaining;
    return stage === 3 && (maintenance || hasReceived);
  }
  return items.some((item) => statusTabForItem(item) === cleanTab);
}

function groupSearchText(items = []) {
  return items.flatMap((item) => [
    item?.orderId,
    item?.orderIdNumber,
    item?.reason,
    item?.createdByName,
    item?.createdById,
    item?.orderType,
    item?.productName,
  ]).map((value) => norm(value)).join(" ");
}

const SEARCH_COLUMNS = ["reason", "team_member_name", "product_name", "order_type"];

function searchLogic(query = "") {
  return createOrderSearchPlan(query, SEARCH_COLUMNS);
}

function memberCandidateNames(account = {}) {
  const clean = safeFilterText(accountUsername(account));
  if (!clean) return [];
  return Array.from(new Set([
    clean,
    clean.split(/\s+/)[0] || "",
  ].map((value) => String(value || "").trim()).filter((value) => value.length >= 2)));
}

function memberClauses(account = {}) {
  const clauses = [];
  const memberId = String(account?.teamMemberId || account?.userSupabaseId || "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "");
  if (memberId) clauses.push(`team_member_id.eq.${memberId}`);

  // Keep the legacy name branches for old rows that predate team_member_id.
  // Modern rows hit the exact indexed ID branch first, while compatibility is
  // preserved for historical data.
  const candidates = memberCandidateNames(account);
  if (!candidates.length) return clauses;
  return [
    ...clauses,
    ...candidates.map((value) => `team_member_name.ilike.*${value}*`),
    "team_member_name.is.null",
    "team_member_name.eq.",
  ];
}

function logicalParams({ account = {}, query = "", type = "all", searchMode = "fast" } = {}) {
  const params = {};
  const logicGroups = [];
  const member = memberClauses(account);
  if (member.length) logicGroups.push(member);

  applyOrderSearchPlan({ params, logicGroups, plan: searchLogic(query), mode: searchMode });

  const typeLabel = orderTypeLabel(type);
  if (typeLabel) params.order_type = `ilike.*${typeLabel.replace(/[*%]/g, "")}*`;

  if (logicGroups.length === 1) params.or = `(${logicGroups[0].join(",")})`;
  else if (logicGroups.length > 1) params.and = `(${logicGroups.map((clauses) => `or(${clauses.join(",")})`).join(",")})`;
  return params;
}

async function candidateNumbers({ cursor = null, scanGroups = 90, filters = {}, searchMode = "", rpcOptions = null, signal = null } = {}) {
  const suffix = searchMode ? `.search-${searchMode}` : "";
  if (rpcOptions && canUseOrderCandidateRpc()) {
    try {
      return await loadOrderCandidateNumbersRpc({
        ...rpcOptions,
        cursor,
        wanted: scanGroups,
        profileName: `orders.current${suffix}.candidates-rpc`,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      noteOrderCandidateRpcError(error);
    }
  }
  return await scanOrderNumberCandidates({
    table: tableName(),
    cursor,
    wanted: scanGroups,
    minWanted: 20,
    maxWanted: 240,
    rowChunk: 1000,
    maxScannedRows: 12000,
    filters,
    queryProfileName: `orders.current${suffix}.candidates`,
    scanProfileName: `orders.current${suffix}.candidate-scan`,
    signal,
  });
}

async function rowsByNumbers(numbers = [], signal = null) {
  return await loadOrderRowsByNumbers({
    table: tableName(),
    numbers,
    selectExpr: SUMMARY_SELECT,
    queryProfileName: "orders.current.summary",
    fallbackProfileName: "orders.current.summary-fallback",
    loadProfileName: "orders.current.summary-load",
    signal,
  });
}

function groupRows(rows = [], account = {}) {
  const username = accountUsername(account);
  const groups = new Map();
  for (const row of rows) {
    const item = serializeOperationsSummaryRow(row);
    if (!memberMatches(item?.createdByName, username)) continue;
    const orderNumber = Number(item?.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  return groups;
}

export async function loadCurrentOrdersPage({
  account = {},
  tab = "all",
  type = "all",
  query = "",
  cursor = null,
  limit = PAGE_LIMIT,
  signal = null,
} = {}) {
  if (!isSupabaseConfigured()) return null;
  const username = accountUsername(account);
  if (!username) return null;

  const safeLimit = pageLimit(limit);
  const outputGroups = [];
  let nextCursor = pageCursor(cursor);
  let hasMore = true;
  let loops = 0;

  while (outputGroups.length < safeLimit && hasMore && loops < 20) {
    loops += 1;
    const searchPlan = searchLogic(query);
    const hasTextSearch = Boolean(searchPlan?.clean && !Number.isFinite(searchPlan?.orderNumber));
    const fastSearch = hasTextSearch && canUseOrderSearchText();
    const filters = logicalParams({ account, query, type, searchMode: fastSearch ? "fast" : "legacy" });
    let candidates;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 72),
        filters,
        searchMode: hasTextSearch ? (fastSearch ? "fast" : "legacy") : "",
        rpcOptions: !searchPlan ? {
          context: "current",
          memberId: account?.teamMemberId || account?.userSupabaseId || "",
          memberNames: memberCandidateNames(account),
          orderType: orderTypeLabel(type),
        } : null,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      if (fastSearch && noteOrderSearchTextError(error)) {
        try {
          candidates = await candidateNumbers({
            cursor: nextCursor,
            scanGroups: Math.max(safeLimit * 2, 72),
            filters: logicalParams({ account, query, type, searchMode: "legacy" }),
            searchMode: "legacy",
            signal,
          });
        } catch (fallbackError) {
          if (signal?.aborted || fallbackError?.code === "REQUEST_ABORTED" || fallbackError?.name === "AbortError") throw fallbackError;
          candidates = null;
        }
      }
      if (!candidates) {
        // Custom/older schemas may reject a projected filter column. Preserve the
        // direct paged read and apply creator/search/type rules after the query.
        candidates = await candidateNumbers({
          cursor: nextCursor,
          scanGroups: Math.max(safeLimit * 2, 72),
          filters: {},
          searchMode: hasTextSearch ? "local" : "",
          signal,
        });
      }
    }
    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const rows = await rowsByNumbers(candidates.numbers, signal);
    const groups = groupRows(rows, account);
    const cleanType = orderTypeKey(type);
    const directSearch = searchLogic(query);
    const needle = Number.isFinite(directSearch?.orderNumber) ? "" : norm(directSearch?.clean || query);
    let processedCandidates = 0;

    for (const orderNumber of candidates.numbers) {
      processedCandidates += 1;
      nextCursor = orderNumber;
      const items = groups.get(orderNumber) || [];
      if (!items.length || !groupMatchesTab(items, tab)) continue;
      if (cleanType && cleanType !== "all" && orderTypeKey(items[0]?.orderType || "") !== cleanType) continue;
      if (needle && !groupSearchText(items).includes(needle)) continue;
      outputGroups.push({ orderNumber, items });
      if (outputGroups.length >= safeLimit) break;
    }

    hasMore = candidates.hasMore || processedCandidates < candidates.numbers.length;
    if (outputGroups.length >= safeLimit || !hasMore) break;
  }

  const pageGroups = outputGroups.slice(0, safeLimit);
  return {
    items: pageGroups.flatMap((group) => group.items),
    pageInfo: {
      limit: safeLimit,
      groupCount: pageGroups.length,
      hasMore: !!hasMore,
      nextCursor: hasMore && pageCursor(nextCursor) !== null ? pageCursor(nextCursor) : null,
    },
  };
}

export async function loadCurrentOrdersInitialPage({ account, limit = PAGE_LIMIT } = {}) {
  return await loadCurrentOrdersPage({ account, tab: "all", type: "all", query: "", cursor: null, limit });
}

export async function loadCurrentOrderDetails({ account = {}, orderIds = [] } = {}) {
  if (!isSupabaseConfigured()) return null;
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .slice(0, 500);
  if (!ids.length) return [];

  const rows = await loadRawOrderRowsByIds(ids);
  const username = accountUsername(account);
  const visible = (Array.isArray(rows) ? rows : []).filter((row) => {
    const item = serializeOperationsOrderDetail(row);
    return memberMatches(item?.createdByName, username);
  });

  const visibleIds = new Set(visible.map((row) => text(row?.id)).filter(Boolean));
  if (ids.some((id) => !visibleIds.has(id))) {
    const error = new Error("One or more order components are not available for this account.");
    error.status = 404;
    throw error;
  }

  return visible.map(serializeOperationsOrderDetail);
}
