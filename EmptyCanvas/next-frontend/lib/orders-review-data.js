import "server-only";
import { performance } from "node:perf_hooks";
import { isSupabaseConfigured, select, selectAll, selectById, updateById, updateByIds } from "./supabase-rest";
import { enrichOrderDetailGrouping, loadRawOrderRowsByIds, serializeReviewOrderDetail } from "./order-details-data";
import { consumeOrderSummaryWindows, loadOrderRowsByNumbers, scanOrderNumberCandidates } from "./order-pagination";
import { applyOrderSearchPlan, canUseOrderSearchText, createOrderSearchPlan, noteOrderSearchTextError } from "./order-search-hotpath";
import { canUseOrderCandidateRpc, loadOrderCandidateNumbersRpc, noteOrderCandidateRpcError } from "./order-candidate-rpc";
import { canUseOrderCardSummaryRpc, canUseOrderSummaryRpc, loadOrderCardSummariesRpc, loadOrderSummaryRowsRpc, noteOrderCardSummaryRpcError, noteOrderSummaryRpcError } from "./order-summary-rpc";
import { getReviewerVisibility as reviewerVisibility } from "./reviewer-visibility-service";
import { measurePerformance, recordPerformanceSample } from "./performance-profiler";

const PAGE_LIMIT = 36;
const PAGE_MAX = 80;
const REVIEW_SUMMARY_BASE_SELECT = [
  "id",
  "reason",
  "order_number",
  "order_type",
  "notion_created_time",
  "unit_price",
  "quantity_requested",
  "quantity_progress",
  "quantity_edited_by_supervisor",
  "status",
  // Needed to keep proposal-generated rows out of the supervisor queue.
  "issue_description",
  "sv_approval",
  "team_member_id",
  "team_member_name",
];
const REVIEW_SUMMARY_SEARCH_SELECT = [
  ...REVIEW_SUMMARY_BASE_SELECT,
  "product_name",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "person_received_by_operations",
  "receipt_number",
  "rejected_reason",
].join(",");
const REVIEW_SUMMARY_SELECT = REVIEW_SUMMARY_BASE_SELECT.join(",");

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function norm(value) {
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

function num(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function tableName() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
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

function orderTypeColor(orderType) {
  const value = norm(orderType);
  if (/maintenance/.test(value)) return "purple";
  if (/withdraw/.test(value)) return "red";
  if (/request/.test(value)) return "green";
  return "default";
}

function approvalLabel(value) {
  const raw = text(value);
  const valueKey = norm(raw);
  if (!valueKey || valueKey === "notstarted" || valueKey === "not started") return "Not Started";
  if (valueKey === "approved") return "Approved";
  if (valueKey === "rejected") return "Rejected";
  return raw || "Not Started";
}

function approvalKey(value) {
  const state = norm(value).replace(/[_.-]+/g, " ");
  if (state.includes("reject")) return "rejected";
  if (state.includes("approv")) return "approved";
  return "not-started";
}

function approvalColor(value) {
  const key = approvalKey(value);
  if (key === "approved") return "green";
  if (key === "rejected") return "red";
  return "yellow";
}

function ownerId(row = {}) {
  const direct = text(row?.team_member_id);
  return direct || text(valueFor(row, ["team_member_id", "team_members_id", "created_by_id", "owner_id"]));
}

function ownerName(row = {}) {
  const direct = text(row?.team_member_name);
  return direct || text(valueFor(row, ["team_member_name", "teams_members", "Teams Members", "created_by_name", "created_by", "Created By"]));
}

function serializeReviewSummary(row = {}) {
  const orderNumber = num(valueFor(row, ["order_number", "Order - ID", "Order ID", "order id"]));
  const quantityProgress = num(valueFor(row, ["quantity_progress", "Quantity Progress"]));
  const quantityRequested = num(valueFor(row, ["quantity_requested", "Quantity Requested", "quantity", "Quantity"]));
  const quantityBase = quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0);
  const quantityEdited = num(valueFor(row, ["quantity_edited_by_supervisor", "Quantity Edited by supervisor", "quantity_edited", "edited_quantity"]));
  const approval = approvalLabel(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"]));
  const rejectedReason = text(valueFor(row, ["rejected_reason", "Rejected Reason", "Reject Reason", "rejection_reason", "Rejection Reason"])) || null;
  const operationsApproval = text(valueFor(row, ["operations_approval", "Operations Approval", "operation_approval", "Operation Approval"])) || null;
  const orderType = text(valueFor(row, ["order_type", "Order Type"])) || null;
  const createdByName = ownerName(row);
  const createdById = ownerId(row);
  const id = text(valueFor(row, ["id", "ID"]));

  return {
    id,
    teamMemberId: createdById || createdByName || null,
    createdById: createdById || createdByName || null,
    createdByName: createdByName || null,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdPrefix: Number.isFinite(orderNumber) ? "ORD" : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(valueFor(row, ["reason", "Reason"])) || "No Reason",
    issueDescription: text(valueFor(row, ["issue_description", "Issue Description", "actual_issue_description", "Actual Issue Description"])) || "",
    productName: text(valueFor(row, ["product_name", "Product Name", "product", "Product"])) || "Unknown Product",
    productImage: null,
    unitPrice: num(valueFor(row, ["unit_price", "Unit price", "Unity Price", "Price"])),
    quantity: quantityBase,
    quantityRequested: quantityRequested !== null ? quantityRequested : quantityBase,
    quantityEdited,
    status: text(valueFor(row, ["status", "Status"])) || "",
    approval,
    approvalColor: approvalColor(approval),
    rejectedReason,
    operationsApproval,
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    createdTime: dateValue(valueFor(row, ["notion_created_time", "created_time", "created_at", "Created time"])) || new Date().toISOString(),
    productTag: text(valueFor(row, ["product_tag", "Product Tag", "component_tag", "Component Tag", "tag", "Tag"])) || null,
    kitTag: text(valueFor(row, ["kit_tag", "Kit Tag", "kit_name", "Kit Name", "source_kit", "Source Kit"])) || null,
    kitFolderName: text(valueFor(row, ["kit_folder", "Kit Folder", "kit_folder_name", "Kit Folder Name"])) || null,
    summaryOnly: true,
    source: "supabase",
  };
}


function serializeReviewCompactRow(row = {}, { includeSearchText = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(row || {}, "order_number")) {
    const legacy = serializeReviewSummary(row);
    const item = compactReviewSummaryItem(legacy);
    if (includeSearchText) item._summarySearchText = groupSearchText([legacy]);
    return item;
  }
  const id = text(row.id);
  const orderNumber = num(row.order_number);
  const quantityProgress = num(row.quantity_progress);
  const quantityRequested = num(row.quantity_requested);
  const quantityBase = quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0);
  const quantityEdited = num(row.quantity_edited_by_supervisor);
  const approval = approvalLabel(row.sv_approval);
  const orderType = text(row.order_type) || null;
  const createdByName = ownerName(row);
  const createdById = ownerId(row);
  const item = {
    id,
    teamMemberId: createdById || createdByName || null,
    createdById: createdById || createdByName || null,
    createdByName: createdByName || null,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(row.reason) || "No Reason",
    unitPrice: num(row.unit_price),
    quantity: quantityBase,
    quantityRequested: quantityRequested !== null ? quantityRequested : quantityBase,
    quantityEdited,
    status: text(row.status) || "",
    approval,
    approvalColor: approvalColor(approval),
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    createdTime: dateValue(row.notion_created_time) || new Date().toISOString(),
    summaryOnly: true,
    source: "supabase",
  };
  if (includeSearchText) {
    item._summarySearchText = [
      row.reason,
      row.team_member_name,
      row.product_name,
      row.issue_description,
      row.actual_issue_description,
      row.repair_action,
      row.resolution_method,
      row.person_received_by_operations,
      row.receipt_number,
      row.rejected_reason,
    ].map(text).filter(Boolean).join(" ");
  }
  return item;
}

function splitArray(value) {
  if (value === null || typeof value === "undefined") return [];
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === "object") {
    const candidates = Array.isArray(value.values) ? value.values : Object.values(value);
    return candidates.flatMap(splitArray).map(text).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw || /^null$/i.test(raw)) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {}
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw.slice(1, -1)
      .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
      .map((item) => item.trim().replace(/^\"|\"$/g, "").replace(/\\\"/g, '"'))
      .filter(Boolean);
  }
  return raw.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

function splitIds(value) {
  return splitArray(value)
    .map((item) => String(item || "").trim())
    .map((item) => item.match(/\d+/)?.[0] || "")
    .filter(Boolean);
}

function visibleToReviewer(row, visible) {
  const ids = new Set((visible?.ids || []).map(text).filter(Boolean));
  const names = new Set((visible?.names || []).map(norm).filter(Boolean));
  const id = ownerId(row);
  const name = ownerName(row);
  return (!!id && ids.has(id)) || (!!name && names.has(norm(name)));
}

function filterText(value) {
  return String(value ?? "").trim().replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
}

const SEARCH_COLUMNS = [
  "reason",
  "team_member_name",
  "product_name",
  "issue_description",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "person_received_by_operations",
  "receipt_number",
  "rejected_reason",
];

function searchLogic(query = "") {
  return createOrderSearchPlan(query, SEARCH_COLUMNS);
}

function visibilityLogic(visible) {
  const clauses = [];
  for (const id of visible?.ids || []) {
    const clean = String(id || "").replace(/[^0-9A-Za-z_-]/g, "");
    if (clean) clauses.push(`team_member_id.eq.${clean}`);
  }
  for (const name of visible?.queryNames || visible?.names || []) {
    const clean = filterText(name);
    if (clean) clauses.push(`team_member_name.ilike.*${clean}*`);
  }
  return clauses.length ? clauses : null;
}

function statusLogic(tab = "all") {
  const clean = String(tab || "all").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (clean === "archive") return ["status.ilike.*archive*"];
  if (clean === "approved") return ["sv_approval.ilike.*approved*"];
  if (clean === "rejected") return ["sv_approval.ilike.*rejected*"];
  // Not Started can be NULL/empty/text depending on migration age. Keep this
  // broad and apply the exact normalization after the rows are loaded.
  return null;
}

function logicalParams({ visible, query = "", tab = "all", type = "all", searchMode = "fast" } = {}) {
  const params = {};
  const logicGroups = [];
  const visibleClauses = visibilityLogic(visible);
  if (visibleClauses?.length) logicGroups.push(visibleClauses);

  applyOrderSearchPlan({ params, logicGroups, plan: searchLogic(query), mode: searchMode });

  const statusClauses = statusLogic(tab);
  if (statusClauses?.length) logicGroups.push(statusClauses);

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
        profileName: `orders.review${suffix}.candidates-rpc`,
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
    queryProfileName: `orders.review${suffix}.candidates`,
    scanProfileName: `orders.review${suffix}.candidate-scan`,
    signal,
  });
}

function reviewStageStatus(stage) {
  const value = Number(stage) || 1;
  if (value >= 5) return "Archive";
  if (value === 4) return "Delivered";
  if (value === 3) return "Shipped";
  if (value === 2) return "In progress";
  return "Pending";
}

function reviewCardSummaryItem(row = {}, tab = "all") {
  const orderIds = Array.isArray(row?.orderIds) ? row.orderIds.map(text).filter(Boolean) : [];
  const orderNumber = Number(row?.orderNumber);
  const cleanTab = String(tab || "all").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const approvalState = cleanTab === "approved" || cleanTab === "rejected" || cleanTab === "not-started"
    ? cleanTab
    : (text(row?.approvalState).toLowerCase() || "not-started");
  const approval = approvalState === "approved" ? "Approved" : approvalState === "rejected" ? "Rejected" : approvalState === "mixed" ? "Mixed" : "Not Started";
  return {
    id: orderIds[0] || `summary-${Number.isFinite(orderNumber) ? orderNumber : "order"}`,
    orderIds,
    teamMemberId: text(row?.teamMemberId) || text(row?.teamMemberName) || null,
    createdById: text(row?.teamMemberId) || text(row?.teamMemberName) || null,
    createdByName: text(row?.teamMemberName) || null,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(row?.reason) || "No Reason",
    unitPrice: 0,
    quantity: 1,
    quantityRequested: 1,
    quantityEdited: null,
    status: reviewStageStatus(row?.stage),
    approval,
    approvalColor: approvalColor(approval),
    orderType: text(row?.orderType) || null,
    orderTypeColor: orderTypeColor(row?.orderType),
    createdTime: dateValue(row?.createdTime) || new Date().toISOString(),
    summaryOnly: true,
    source: "supabase",
    _summaryCard: true,
    _summaryTab: cleanTab,
    _groupApproval: approvalState,
    _groupArchived: Boolean(row?.archived),
  };
}

async function rowsByNumbers(numbers = [], signal = null, includeLocalSearchFields = false, { tab = "all", visible = null } = {}) {
  if (!includeLocalSearchFields && canUseOrderCardSummaryRpc()) {
    try {
      const rows = await loadOrderCardSummariesRpc({
        numbers,
        context: "review",
        tab,
        visibleIds: visible?.ids || [],
        visibleNames: visible?.queryNames || visible?.names || [],
        profileName: "orders.review.card-summary-rpc",
        signal,
      });
      return rows.map((row) => reviewCardSummaryItem(row, tab));
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      noteOrderCardSummaryRpcError(error);
    }
  }

  if (canUseOrderSummaryRpc()) {
    try {
      return await loadOrderSummaryRowsRpc({
        numbers,
        profileName: "orders.review.summary-rpc",
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      noteOrderSummaryRpcError(error);
    }
  }

  return await loadOrderRowsByNumbers({
    table: tableName(),
    numbers,
    selectExpr: includeLocalSearchFields ? REVIEW_SUMMARY_SEARCH_SELECT : REVIEW_SUMMARY_SELECT,
    queryProfileName: "orders.review.summary",
    fallbackProfileName: "orders.review.summary-fallback",
    loadProfileName: "orders.review.summary-load",
    signal,
  });
}

function groupRows(rows = [], includeLocalSearchFields = false) {
  const startedAt = performance.now();
  const groups = new Map();
  for (const row of rows) {
    const item = row?._summaryCard ? row : serializeReviewCompactRow(row, { includeSearchText: includeLocalSearchFields });
    const orderNumber = Number(item.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  recordPerformanceSample({
    category: "orders-summary",
    name: "orders.review.summary-transform",
    durationMs: performance.now() - startedAt,
    meta: { rows: rows.length, groups: groups.size, localSearch: includeLocalSearchFields },
  });
  return groups;
}

function compactReviewSummaryItem(item = {}) {
  return {
    id: item.id,
    teamMemberId: item.teamMemberId,
    createdById: item.createdById,
    createdByName: item.createdByName,
    orderId: item.orderId,
    orderIdNumber: item.orderIdNumber,
    reason: item.reason,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    quantityRequested: item.quantityRequested,
    quantityEdited: item.quantityEdited,
    status: item.status,
    approval: item.approval,
    approvalColor: item.approvalColor,
    orderType: item.orderType,
    orderTypeColor: item.orderTypeColor,
    createdTime: item.createdTime,
    summaryOnly: true,
    source: "supabase",
  };
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
    item?.issueDescription,
    item?.rejectedReason,
    item?._summarySearchText,
  ]).map((value) => norm(value)).join(" ");
}

export async function loadOrdersReviewPage({
  account = null,
  tab = "all",
  type = "all",
  query = "",
  cursor = null,
  limit = PAGE_LIMIT,
  signal = null,
} = {}) {
  if (!isSupabaseConfigured() || !account) return null;
  const safeLimit = pageLimit(limit);
  const visible = await reviewerVisibility(account);
  if (!visible.ids.length && !visible.names.length) {
    return { items: [], pageInfo: { limit: safeLimit, groupCount: 0, hasMore: false, nextCursor: null } };
  }

  const cleanTab = String(tab || "all").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const outputGroups = [];
  let nextCursor = pageCursor(cursor);
  let hasMore = true;
  let loops = 0;

  while (outputGroups.length < safeLimit && hasMore && loops < 12) {
    loops += 1;
    const searchPlan = searchLogic(query);
    const hasTextSearch = Boolean(searchPlan?.clean && !Number.isFinite(searchPlan?.orderNumber));
    const fastSearch = hasTextSearch && canUseOrderSearchText();
    const filters = logicalParams({ visible, query, tab: cleanTab, type, searchMode: fastSearch ? "fast" : "legacy" });
    let candidates;
    let localSearchFallback = false;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 60),
        filters,
        searchMode: hasTextSearch ? (fastSearch ? "fast" : "legacy") : "",
        rpcOptions: !searchPlan ? {
          context: "review",
          visibleIds: visible.ids,
          visibleNames: visible.queryNames || visible.names,
          orderType: orderTypeLabel(type),
          tab: cleanTab,
        } : null,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      if (fastSearch && noteOrderSearchTextError(error)) {
        try {
          candidates = await candidateNumbers({
            cursor: nextCursor,
            scanGroups: Math.max(safeLimit * 2, 60),
            filters: logicalParams({ visible, query, tab: cleanTab, type, searchMode: "legacy" }),
            searchMode: "legacy",
            signal,
          });
        } catch (fallbackError) {
          if (signal?.aborted || fallbackError?.code === "REQUEST_ABORTED" || fallbackError?.name === "AbortError") throw fallbackError;
          candidates = null;
        }
      }
      if (!candidates) {
        // Keep order-number paging even if a customized/older schema rejects one
        // of the direct DB filter columns. Exact visibility and tab filtering is
        // still applied below before anything is returned to the reviewer.
        localSearchFallback = hasTextSearch;
        candidates = await candidateNumbers({
          cursor: nextCursor,
          scanGroups: Math.max(safeLimit * 3, 80),
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

    const cleanType = orderTypeKey(type);
    const directSearch = searchLogic(query);
    const needle = localSearchFallback && !Number.isFinite(directSearch?.orderNumber) ? norm(directSearch?.clean || query) : "";
    const windowResult = await consumeOrderSummaryWindows({
      numbers: candidates.numbers,
      remainingGroups: safeLimit - outputGroups.length,
      loadRows: (numbers, loadSignal) => rowsByNumbers(numbers, loadSignal, localSearchFallback, { tab: cleanTab, visible }),
      profileName: "orders.review.summary-window",
      signal,
      consumeRows: ({ numbers, rows }) => {
        const allowedRows = rows.filter((row) => {
          if (row?._summaryCard) return true;
          if (!visibleToReviewer(row, visible)) return false;
          const issueDescription = text(row?.issue_description ?? valueFor(row, ["issue_description", "Issue Description"]));
          if (/^created from proposal:/i.test(issueDescription)) return false;
          const archived = /archive|archived/.test(norm(row?.status ?? valueFor(row, ["status", "Status"])));
          if (cleanTab === "archive") return archived;
          if (archived) return false;
          if (["approved", "rejected", "not-started"].includes(cleanTab)) {
            return approvalKey(row?.sv_approval ?? valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"])) === cleanTab;
          }
          return true;
        });

        const groups = groupRows(allowedRows, localSearchFallback);
        let processedCandidates = 0;
        let matchedGroups = 0;

        for (const orderNumber of numbers) {
          processedCandidates += 1;
          nextCursor = orderNumber;
          const items = groups.get(orderNumber) || [];
          if (!items.length) continue;
          if (cleanType && cleanType !== "all" && orderTypeKey(items[0]?.orderType || "") !== cleanType) continue;
          if (needle && !groupSearchText(items).includes(needle)) continue;
          outputGroups.push({ orderNumber, items });
          matchedGroups += 1;
          if (outputGroups.length >= safeLimit) break;
        }

        return {
          processedCandidates,
          matchedGroups,
          done: outputGroups.length >= safeLimit,
        };
      },
    });

    // Keep the same group-safe semantics used by Operations Orders. Reaching
    // the end of the database does not mean all candidate groups in this scan
    // have already been consumed by the current page.
    hasMore = candidates.hasMore || windowResult.processedCandidates < candidates.numbers.length;
    if (outputGroups.length >= safeLimit || !hasMore) break;
  }

  const pageGroups = outputGroups.slice(0, safeLimit);
  return {
    items: pageGroups.flatMap((group) => group.items),
    pageInfo: {
      limit: safeLimit,
      serverFiltered: true,
      query: text(query),
      summaryFormat: "compact-v2",
      groupCount: pageGroups.length,
      hasMore: !!hasMore,
      nextCursor: hasMore && pageCursor(nextCursor) !== null ? pageCursor(nextCursor) : null,
    },
  };
}

export async function loadOrdersReviewInitialPage({ account, limit = PAGE_LIMIT } = {}) {
  return await measurePerformance("page-data", "orders.review.initial", async () =>
    await loadOrdersReviewPage({ account, tab: "all", type: "all", query: "", cursor: null, limit }),
  );
}

export const __ordersReviewDataTest = {
  approvalKey,
  splitArray,
  splitIds,
  serializeReviewSummary,
  visibleToReviewer,
  groupSearchText,
};
export async function loadOrdersReviewDetails({ account, orderIds = [] } = {}) {
  if (!isSupabaseConfigured()) return null;
  const rows = await loadRawOrderRowsByIds(orderIds);
  const visible = await reviewerVisibility(account || {});
  if (!visible.ids.length && !visible.names.length) {
    const error = new Error("No reviewer schools are assigned to this account.");
    error.status = 403;
    throw error;
  }

  const allowed = rows.filter((row) => {
    if (!visibleToReviewer(row, visible)) return false;
    const issueDescription = text(valueFor(row, ["issue_description", "Issue Description"]));
    return !/^created from proposal:/i.test(issueDescription);
  });
  const allowedIds = new Set(allowed.map((row) => text(valueFor(row, ["id", "ID"]))).filter(Boolean));
  const requestedIds = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(text).filter(Boolean))];
  if (requestedIds.some((id) => !allowedIds.has(id))) {
    const error = new Error("One or more order components are not available for this reviewer.");
    error.status = 403;
    throw error;
  }

  return await enrichOrderDetailGrouping(allowed.map(serializeReviewOrderDetail));
}



function roundOrderQty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 1e6) / 1e6;
}

function statusColor(status) {
  const value = norm(status);
  if (/archive/.test(value)) return "purple";
  if (/(arrived|delivered|received)/.test(value)) return "green";
  if (/shipped/.test(value)) return "blue";
  if (/rejected/.test(value)) return "red";
  if (/progress/.test(value)) return "yellow";
  if (/supervision/.test(value)) return "orange";
  return "default";
}

function directMutationError(message, status, code = "DIRECT_REVIEW_MUTATION_FAILED") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function allowedReviewRow(account, id) {
  if (!isSupabaseConfigured()) return null;
  const cleanId = text(id);
  if (!/^\d+$/.test(cleanId)) return null;

  const row = await selectById(tableName(), cleanId);
  if (!row) throw directMutationError("Order not found", 404);

  const visible = await reviewerVisibility(account || {});
  if (!visible.ids.length && !visible.names.length) {
    throw directMutationError("Not allowed", 403);
  }
  if (!visibleToReviewer(row, visible)) {
    throw directMutationError("Not allowed", 403);
  }

  const issueDescription = text(valueFor(row, ["issue_description", "Issue Description"]));
  if (/^created from proposal:/i.test(issueDescription)) {
    throw directMutationError("Not allowed", 403);
  }
  return row;
}

async function upstashDelete(keys = []) {
  const clean = [...new Set((Array.isArray(keys) ? keys : []).map((key) => text(key)).filter(Boolean))];
  if (!clean.length) return false;
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const tokenValue = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !tokenValue) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["DEL", ...clean]),
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function invalidateLegacyReviewCaches(account = {}) {
  const username = text(account?.username || account?.name);
  const usernameKey = encodeURIComponent(username || "-");
  const keys = [];
  for (const version of ["v2", "v3", "v4"]) {
    for (const tab of ["all", "not-started", "approved", "rejected", "archive"]) {
      keys.push(`cache:api:sv-orders:${usernameKey}:${tab}:${version}`);
    }
  }
  keys.push(`cache:api:sv-orders-summary:${usernameKey}:v1`);
  keys.push(`cache:api:sv-orders-home-summary:${usernameKey}:v1`);
  keys.push(
    "cache:api:orders:requested:v7",
    "cache:api:orders:requested:supabase:v1",
    "cache:api:orders:requested:supabase:v2:approved",
    "cache:api:orders:requested:supabase:v2:all-system",
    "cache:api:orders:requested:supabase:v4:approved",
    "cache:api:orders:requested:supabase:v4:all-system",
    "cache:api:orders:requested:supabase:v5:approved",
    "cache:api:orders:requested:supabase:v5:all-system",
    "cache:api:orders:requested-summary:supabase:v1:approved",
    "cache:api:orders:requested-summary:supabase:v1:all-system",
    "cache:api:orders:maintenance:supabase:v1",
    "cache:api:orders:maintenance-summary:supabase:v1",
    "cache:api:orders:current:supabase:v1",
    "cache:api:orders:current:supabase:v1:all",
    "cache:api:orders:current-summary:supabase:v1:all",
  );
  await upstashDelete(keys).catch(() => false);
}

export async function updateOrdersReviewApproval({ account, id, decision, rejectedReason = "" } = {}) {
  const cleanId = text(id);
  const raw = norm(decision);
  const normalizedDecision = raw === "approved" ? "Approved" : raw === "rejected" ? "Rejected" : raw === "not started" ? "Not Started" : "";
  if (!cleanId || !normalizedDecision) throw directMutationError("Invalid id or decision", 400);

  const reason = text(rejectedReason);
  if (normalizedDecision === "Rejected" && !reason) {
    throw directMutationError("Rejected reason is required", 400);
  }

  const row = await allowedReviewRow(account, cleanId);
  if (!row) return null;

  const nextStatus = normalizedDecision === "Approved" || normalizedDecision === "Rejected" ? "In progress" : null;
  const patch = {
    sv_approval: normalizedDecision,
    rejected_reason: normalizedDecision === "Rejected" ? reason : null,
  };
  if (nextStatus) patch.status = nextStatus;

  await updateById(tableName(), cleanId, patch);
  await invalidateLegacyReviewCaches(account).catch(() => {});
  const currentStatus = text(valueFor(row, ["status", "Status"]));
  const status = nextStatus || currentStatus || "";
  return {
    ok: true,
    id: cleanId,
    decision: normalizedDecision,
    status,
    statusColor: statusColor(status),
    source: "supabase-direct",
  };
}

export async function updateOrdersReviewQuantity({ account, id, value } = {}) {
  const cleanId = text(id);
  const numericValue = Number(value);
  if (!cleanId) throw directMutationError("Missing id", 400);
  if (!Number.isFinite(numericValue)) throw directMutationError("Invalid quantity", 400);

  const row = await allowedReviewRow(account, cleanId);
  if (!row) return null;

  const requestedRaw = num(valueFor(row, ["quantity_requested", "Quantity Requested", "requested_quantity", "Requested Quantity"]));
  const progressRaw = num(valueFor(row, ["quantity_progress", "Quantity Progress", "quantity", "Quantity", "qty", "Qty"]));
  const requested = roundOrderQty(requestedRaw !== null ? requestedRaw : (progressRaw !== null ? progressRaw : 0));
  const orderTypeName = text(valueFor(row, ["order_type", "Order Type"]));
  const isWithdrawalQuantity = orderTypeKey(orderTypeName) === orderTypeKey("Withdraw Products")
    || Number(requested) < 0
    || Number(progressRaw) < 0;
  const signedValue = isWithdrawalQuantity ? -Math.abs(numericValue) : numericValue;
  const newVal = roundOrderQty(signedValue);
  const editedVal = Number.isFinite(requested) && roundOrderQty(newVal) === roundOrderQty(requested) ? null : newVal;

  const receivedRaw = num(valueFor(row, [
    "quantity_received_by_operations",
    "Quantity Received by operations",
    "Quantity Received by Operations",
    "received_quantity",
    "quantity_received",
  ]));
  const received = Number.isFinite(Number(receivedRaw)) ? Number(receivedRaw) : 0;
  const nextRemaining = roundOrderQty(newVal - received);

  await updateById(tableName(), cleanId, {
    quantity_edited_by_supervisor: editedVal,
    quantity_remaining: nextRemaining,
  });
  await invalidateLegacyReviewCaches(account).catch(() => {});

  return {
    ok: true,
    value: newVal,
    remaining: nextRemaining,
    cleared: editedVal === null,
    source: "supabase-direct",
  };
}


function reviewAccessToken(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasOrdersReviewAdminAccess(account = {}) {
  const name = reviewAccessToken(account?.name || account?.username);
  const position = reviewAccessToken(account?.position);
  if (name === "admin" || position.includes("admin")) return true;

  const wanted = new Set(["ordersreview", "svorders", "supervisionorders"]);
  const pages = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  return pages.some((row) => {
    if (row?.isEnabled === false) return false;
    if (String(row?.accessLevel || row?.access_level || "").trim().toLowerCase() !== "admin") return false;
    const candidates = [
      row?.pageName,
      row?.pageKey,
      row?.routePath,
      ...(Array.isArray(row?.aliases) ? row.aliases : []),
    ].map(reviewAccessToken).filter(Boolean);
    return candidates.some((candidate) => wanted.has(candidate));
  });
}

async function directAdminPasswordResult(account = {}, password = "") {
  const pwd = text(password);
  if (!pwd) throw directMutationError("adminPassword required", 400);
  // Match Express semantics: page-level Admin still needs to submit a non-empty
  // value, but the shared password itself is bypassed for that access level.
  if (hasOrdersReviewAdminAccess(account)) return true;
  if (!isSupabaseConfigured()) return null;

  let candidates = [];
  const attempts = [
    { select: "*", name: "ilike.admin", limit: "10" },
    { select: "*", position: "ilike.*admin*", limit: "20" },
  ];
  let hadSuccessfulLookup = false;
  for (const params of attempts) {
    try {
      const rows = await select(teamMembersTable(), params);
      hadSuccessfulLookup = true;
      if (Array.isArray(rows) && rows.length) candidates.push(...rows);
    } catch {
      // Older/custom schemas can reject one of these filter names. Keep trying,
      // then fall back to Legacy instead of treating an infrastructure mismatch
      // as an invalid password.
    }
    if (candidates.length) break;
  }

  if (!candidates.length) {
    try {
      const rows = await selectAll(teamMembersTable(), { limit: 1000 });
      hadSuccessfulLookup = true;
      candidates = Array.isArray(rows) ? rows : [];
    } catch {
      return null;
    }
  }
  if (!hadSuccessfulLookup) return null;

  const adminRow = candidates.find((row) => reviewAccessToken(valueFor(row, ["name", "Name"])) === "admin")
    || candidates.find((row) => reviewAccessToken(valueFor(row, ["position", "Position"])).includes("admin"))
    || candidates.find((row) => reviewAccessToken(valueFor(row, ["name", "Name"])).includes("admin"));
  if (!adminRow) return null; // Legacy may still have the Admin user in Notion.

  const stored = text(valueFor(adminRow, ["password", "Password"]));
  if (!stored) return null;
  return stored === pwd;
}

function cleanReviewActionIds(orderIds = []) {
  return [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .map((id) => text(id))
    .filter(Boolean))]
    .slice(0, 500);
}

async function allowedReviewRows(account = {}, ids = []) {
  const clean = cleanReviewActionIds(ids);
  if (!clean.length) throw directMutationError("orderIds required", 400);
  if (!clean.every((id) => /^\d+$/.test(id))) return null;
  if (!isSupabaseConfigured()) return null;

  const visible = await reviewerVisibility(account || {});
  if (!visible.ids.length && !visible.names.length) throw directMutationError("Not allowed", 403);

  const rows = [];
  for (let index = 0; index < clean.length; index += 200) {
    const batch = clean.slice(index, index + 200);
    const chunk = await select(tableName(), {
      select: "*",
      id: `in.(${batch.join(",")})`,
      limit: String(Math.max(batch.length, 1)),
    });
    if (Array.isArray(chunk)) rows.push(...chunk);
  }

  const byId = new Map(rows.map((row) => [text(valueFor(row, ["id", "ID"])), row]));
  const ordered = clean.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length !== clean.length) throw directMutationError("Order not found", 404);
  if (ordered.some((row) => !visibleToReviewer(row, visible))) throw directMutationError("Not allowed", 403);
  return ordered;
}

function normalizeProtectedApproval(value) {
  const key = norm(value).replace(/[_\s-]+/g, " ");
  if (key === "approved") return "Approved";
  if (key === "rejected") return "Rejected";
  return "Not Started";
}

function restoreStatusForApproval(value) {
  const approval = normalizeProtectedApproval(value);
  return approval === "Approved" || approval === "Rejected" ? "In progress" : "Under Supervision";
}

export async function performOrdersReviewProtectedAction({
  account,
  action,
  orderIds = [],
  adminPassword = "",
  approvals = null,
  approvalStatus = "",
} = {}) {
  const cleanAction = text(action).toLowerCase().replace(/[_\s]+/g, "-");
  if (!["archive", "unarchive", "verify-edit", "update-approval"].includes(cleanAction)) {
    throw directMutationError("Unsupported protected action", 400);
  }

  const cleanIds = cleanReviewActionIds(orderIds);
  if (!cleanIds.length) throw directMutationError("orderIds required", 400);
  if (!cleanIds.every((id) => /^\d+$/.test(id))) return null;

  const passwordOk = await directAdminPasswordResult(account || {}, adminPassword);
  if (passwordOk === null) return null;
  if (!passwordOk) throw directMutationError("Invalid admin password", 401);

  const rows = await allowedReviewRows(account || {}, cleanIds);
  if (!rows) return null;

  if (cleanAction === "verify-edit") {
    return { ok: true, action: cleanAction, source: "supabase-direct" };
  }

  if (cleanAction === "archive") {
    await updateByIds(tableName(), cleanIds, { status: "Archive" });
    await invalidateLegacyReviewCaches(account).catch(() => {});
    return { ok: true, action: cleanAction, status: "Archive", source: "supabase-direct" };
  }

  if (cleanAction === "unarchive") {
    const grouped = new Map();
    for (const row of rows) {
      const id = text(valueFor(row, ["id", "ID"]));
      const status = restoreStatusForApproval(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"]));
      if (!grouped.has(status)) grouped.set(status, []);
      grouped.get(status).push(id);
    }
    for (const [status, ids] of grouped.entries()) {
      await updateByIds(tableName(), ids, { status });
    }
    await invalidateLegacyReviewCaches(account).catch(() => {});
    return { ok: true, action: cleanAction, source: "supabase-direct" };
  }

  const approvalsInput = approvals && typeof approvals === "object" && !Array.isArray(approvals) ? approvals : null;
  const fallbackApproval = normalizeProtectedApproval(approvalStatus);
  const idsByApproval = new Map();
  for (const id of cleanIds) {
    const supplied = approvalsInput && Object.prototype.hasOwnProperty.call(approvalsInput, id)
      ? approvalsInput[id]
      : fallbackApproval;
    const normalized = normalizeProtectedApproval(supplied);
    if (!idsByApproval.has(normalized)) idsByApproval.set(normalized, []);
    idsByApproval.get(normalized).push(id);
  }
  for (const [approval, ids] of idsByApproval.entries()) {
    await updateByIds(tableName(), ids, { sv_approval: approval });
  }
  await invalidateLegacyReviewCaches(account).catch(() => {});
  return {
    ok: true,
    action: "update-approval",
    source: "supabase-direct",
    items: cleanIds.map((id) => ({ id, approval: normalizeProtectedApproval(approvalsInput?.[id] ?? fallbackApproval) })),
  };
}
