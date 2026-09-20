import "server-only";
import { performance } from "node:perf_hooks";
import { deleteById, getSupabaseConfig, insert, isSupabaseConfigured, select, selectAll, updateById, updateByIds, uploadStorageObject } from "./supabase-rest";
import { enrichOrderDetailGrouping, loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";
import { getProductsCatalog } from "./products-service";
import { listTeamMembersLite } from "./team-members-service";
import { invalidateStocktakingReadCaches } from "./stocktaking-data";
import { consumeOrderSummaryWindows, loadOrderRowsByNumbers, scanOrderNumberCandidates } from "./order-pagination";
import { applyOrderSearchPlan, canUseOrderSearchText, createOrderSearchPlan, noteOrderSearchTextError } from "./order-search-hotpath";
import { canUseOrderCandidateRpc, loadOrderCandidateNumbersRpc, noteOrderCandidateRpcError } from "./order-candidate-rpc";
import { canUseOrderCardSummaryRpc, canUseOrderSummaryRpc, loadOrderCardSummariesRpc, loadOrderSummaryRowsRpc, noteOrderCardSummaryRpcError, noteOrderSummaryRpcError } from "./order-summary-rpc";
import { measurePerformance, recordPerformanceSample } from "./performance-profiler";

const PAGE_LIMIT = 36;
const PAGE_MAX = 80;
const SUMMARY_BASE_SELECT = [
  "id",
  "reason",
  "order_number",
  "order_type",
  "notion_created_time",
  "unit_price",
  "quantity_requested",
  "quantity_progress",
  "quantity_edited_by_supervisor",
  "quantity_received_by_operations",
  "quantity_remaining",
  "status",
  // Kept only for the maintenance effective-status calculation.
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "operations_approval",
  "rejected_reason",
  "team_member_id",
  "team_member_name",
  "sv_approval",
];
const SUMMARY_SEARCH_SELECT = [
  ...SUMMARY_BASE_SELECT,
  "product_name",
  "issue_description",
  "receipt_number",
  "person_received_by_operations",
].join(",");
const SUMMARY_SELECT = SUMMARY_BASE_SELECT.join(",");

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

function dateValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function roundQty(value, decimals = 6) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** decimals;
  return Math.round(parsed * factor) / factor;
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

function orderTypeColor(orderType) {
  const value = norm(orderType);
  if (/maintenance/.test(value)) return "purple";
  if (/withdraw/.test(value)) return "red";
  if (/request/.test(value)) return "green";
  return "default";
}

function statusIndex(value) {
  const status = norm(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(status)) return 2;
  return 1;
}

export function serializeOperationsSummaryRow(row = {}) {
  const id = text(row.id ?? row.ID);
  const orderNumber = num(row.order_number ?? row["Order - ID"] ?? row["Order ID"]);
  const quantityProgress = num(row.quantity_progress ?? row["Quantity Progress"] ?? row.quantity ?? row.Quantity ?? row.qty ?? row.Qty);
  const quantityRequested = num(row.quantity_requested ?? row["Quantity Requested"] ?? row.requested_quantity ?? row["Requested Quantity"]);
  const quantityEditedBySupervisor = num(row.quantity_edited_by_supervisor ?? row["Quantity Edited by supervisor"] ?? row["Quantity Edited by Supervisor"] ?? row.quantity_edited ?? row.edited_quantity);
  const originalBase = roundQty(quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0));
  const base = roundQty(quantityEditedBySupervisor !== null ? quantityEditedBySupervisor : originalBase);
  const receivedRaw = num(row.quantity_received_by_operations ?? row["Quantity Received by operations"] ?? row["Quantity Received by Operations"] ?? row.received_quantity ?? row.quantity_received);
  const remainingRaw = num(row.quantity_remaining ?? row["Quantity Remaining"] ?? row.remaining_quantity);
  const rawStatus = text(row.status ?? row.Status) || "Pending";
  const orderType = text(row.order_type ?? row["Order Type"]) || null;
  const svApproval = text(row.sv_approval ?? row["S.V Approval"] ?? row["SV Approval"]) || null;
  const status = effectiveOperationsStatus(row, rawStatus, orderType, svApproval);
  const statusKey = norm(status);
  const isFinalReceivedStatus = /(arrived|delivered|received)/.test(statusKey);
  const hasBaseQty = Math.abs(Number(base) || 0) > 1e-9;
  const receivedIsZero = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const remainingIsZero = remainingRaw !== null && Math.abs(Number(remainingRaw) || 0) < 1e-9;
  const remainingEqualsBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(base))) < 1e-9;
  const remainingEqualsOriginalBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(originalBase))) < 1e-9;
  const supervisorEditActive = quantityEditedBySupervisor !== null && Math.abs(roundQty(Number(quantityEditedBySupervisor) - Number(originalBase))) > 1e-9;
  const noMeaningfulReceivedYet = receivedRaw === null || Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const zeroZeroPlaceholder = hasBaseQty && receivedIsZero && remainingIsZero && !isFinalReceivedStatus;
  const zeroReceivedWithBaseRemaining = hasBaseQty && receivedIsZero && remainingEqualsBase;
  const supervisorEditedBeforeOps = supervisorEditActive && noMeaningfulReceivedYet && remainingEqualsOriginalBase;

  let quantityReceived = receivedRaw;
  let quantityRemaining;
  let quantityReceivedEdited = false;
  if (zeroZeroPlaceholder || zeroReceivedWithBaseRemaining || supervisorEditedBeforeOps) {
    quantityReceived = null;
    quantityRemaining = base;
  } else if (remainingRaw !== null) {
    quantityRemaining = roundQty(remainingRaw);
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  } else {
    const receivedForRemaining = receivedRaw === null ? 0 : Number(receivedRaw) || 0;
    quantityRemaining = roundQty((Number(base) || 0) - receivedForRemaining);
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  }

  const createdByName = text(row.team_member_name ?? row["Teams Members"] ?? row.teams_members ?? row.Supervisor ?? row.supervisor);
  const createdById = text(row.team_member_id ?? row["Team Member ID"]) || createdByName;
  const operationsByName = text(row.person_received_by_operations ?? row["Person Received by Operations"] ?? row["Received by operations"]);
  const issueDescription = text(row.issue_description ?? row["Issue Description"]);
  const rawReason = text(row.reason ?? row.Reason) || "No Reason";
  const reason = /^created\s+from\s+proposal\s*:/i.test(issueDescription) ? "Generated from Proposal" : rawReason;
  const createdTime = dateValue(row.notion_created_time ?? row.created_time ?? row.created_at ?? row["Created time"]) || new Date().toISOString();

  return {
    id,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdPrefix: Number.isFinite(orderNumber) ? "ORD" : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason,
    productName: text(row.product_name ?? row["Product Name"] ?? row.product ?? row.Product) || "Unknown Product",
    unitPrice: num(row.unit_price ?? row["Unit price"] ?? row["Unity Price"] ?? row.Price),
    quantityRequested: quantityRequested !== null ? quantityRequested : base,
    quantityProgress: quantityEditedBySupervisor,
    quantityEditedBySupervisor,
    quantityReceived,
    quantityRemaining,
    quantityReceivedEdited,
    quantity: base,
    status,
    statusColor: statusColor(status),
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    issueDescription: issueDescription || null,
    actualIssueDescription: text(row.actual_issue_description ?? row["Actual Issue Description"]) || null,
    repairAction: text(row.repair_action ?? row["Repair Action"]) || null,
    resolutionMethod: text(row.resolution_method ?? row["Resolution Method"]) || null,
    operationsByName,
    operationsApproval: text(row.operations_approval ?? row["Operations Approval"] ?? row.operation_approval ?? row["Operation Approval"]) || null,
    rejectedReason: text(row.rejected_reason ?? row["Rejected Reason"] ?? row["Reject Reason"] ?? row.rejection_reason ?? row["Rejection Reason"]) || null,
    receiptNumber: text(row.receipt_number ?? row["Receipt Number"] ?? row["Store Receipt Number"]) || null,
    createdTime,
    createdById,
    createdByName,
    svApproval,
    summaryOnly: true,
    source: "supabase",
  };
}


/**
 * Fast-path serializer used by the paged order lists. The list only needs a
 * compact workflow/quantity shape; detail-only fields are loaded lazily when
 * the user opens an order. Keeping this separate from the broader Home/detail
 * summary serializer avoids allocating and then discarding many properties for
 * every component row in a page.
 */
export function serializeOperationsCompactSummaryRow(row = {}, { includeSearchText = false, includeCreatedById = true } = {}) {
  // Modern direct reads always expose the snake_case projection below. If a
  // customized legacy table returns only old alias columns, preserve the old
  // compatibility serializer instead of dropping the row.
  if (!Object.prototype.hasOwnProperty.call(row || {}, "order_number")) {
    const legacy = serializeOperationsSummaryRow(row);
    const item = compactOperationsSummaryItem(legacy);
    if (!includeCreatedById) delete item.createdById;
    if (includeSearchText) item._summarySearchText = groupSearchText([legacy]);
    return item;
  }
  const id = text(row.id);
  const orderNumber = num(row.order_number);
  const quantityProgress = num(row.quantity_progress);
  const quantityRequested = num(row.quantity_requested);
  const quantityEditedBySupervisor = num(row.quantity_edited_by_supervisor);
  const originalBase = roundQty(quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0));
  const base = roundQty(quantityEditedBySupervisor !== null ? quantityEditedBySupervisor : originalBase);
  const receivedRaw = num(row.quantity_received_by_operations);
  const remainingRaw = num(row.quantity_remaining);
  const rawStatus = text(row.status) || "Pending";
  const orderType = text(row.order_type) || null;
  const svApproval = text(row.sv_approval) || null;
  const status = effectiveOperationsStatus(row, rawStatus, orderType, svApproval);
  const statusKey = norm(status);
  const isFinalReceivedStatus = /(arrived|delivered|received)/.test(statusKey);
  const hasBaseQty = Math.abs(Number(base) || 0) > 1e-9;
  const receivedIsZero = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const remainingIsZero = remainingRaw !== null && Math.abs(Number(remainingRaw) || 0) < 1e-9;
  const remainingEqualsBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(base))) < 1e-9;
  const remainingEqualsOriginalBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(originalBase))) < 1e-9;
  const supervisorEditActive = quantityEditedBySupervisor !== null && Math.abs(roundQty(Number(quantityEditedBySupervisor) - Number(originalBase))) > 1e-9;
  const noMeaningfulReceivedYet = receivedRaw === null || Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const zeroZeroPlaceholder = hasBaseQty && receivedIsZero && remainingIsZero && !isFinalReceivedStatus;
  const zeroReceivedWithBaseRemaining = hasBaseQty && receivedIsZero && remainingEqualsBase;
  const supervisorEditedBeforeOps = supervisorEditActive && noMeaningfulReceivedYet && remainingEqualsOriginalBase;

  let quantityReceived = receivedRaw;
  let quantityRemaining;
  let quantityReceivedEdited = false;
  if (zeroZeroPlaceholder || zeroReceivedWithBaseRemaining || supervisorEditedBeforeOps) {
    quantityReceived = null;
    quantityRemaining = base;
  } else if (remainingRaw !== null) {
    quantityRemaining = roundQty(remainingRaw);
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  } else {
    const receivedForRemaining = receivedRaw === null ? 0 : Number(receivedRaw) || 0;
    quantityRemaining = roundQty((Number(base) || 0) - receivedForRemaining);
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  }

  const createdByName = text(row.team_member_name);
  const createdById = text(row.team_member_id) || createdByName;
  const issueDescription = text(row.issue_description);
  const rawReason = text(row.reason) || "No Reason";
  const reason = /^created\s+from\s+proposal\s*:/i.test(issueDescription) ? "Generated from Proposal" : rawReason;
  const createdTime = dateValue(row.notion_created_time) || new Date().toISOString();
  const item = {
    id,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason,
    unitPrice: num(row.unit_price),
    quantityRequested: quantityRequested !== null ? quantityRequested : base,
    quantityEditedBySupervisor,
    quantityReceived,
    quantityRemaining,
    quantityReceivedEdited,
    quantity: base,
    status,
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    operationsApproval: text(row.operations_approval) || null,
    rejectedReason: text(row.rejected_reason) || null,
    createdTime,
    createdByName,
    svApproval,
    summaryOnly: true,
    source: "supabase",
  };

  if (includeCreatedById) item.createdById = createdById || null;
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

function effectiveOperationsStatus(row = {}, rawStatus = "", orderType = "", svApproval = "") {
  const status = text(rawStatus) || "Pending";
  if (orderTypeKey(orderType) !== "requestmaintenance") return status;
  if (statusIndex(status) !== 2 || approvalKey(svApproval) !== "approved") return status;

  // A saved maintenance log means the technical visit was completed and the
  // Operations workflow is in Shipping, even for older rows whose DB status
  // was left as "In progress" by the previous client.
  const hasMaintenanceLog = [
    row?.serial_number,
    row?.actual_issue_description,
    row?.repair_action,
    row?.resolution_method,
    row?.spare_parts_replaced,
  ].some((value) => Boolean(text(value)));
  return hasMaintenanceLog ? "Shipped" : status;
}

function approvalKey(value) {
  const state = norm(value).replace(/[_.-]+/g, " ");
  if (state.includes("reject")) return "rejected";
  if (state.includes("approv")) return "approved";
  return "not-started";
}

function decision(item = {}) {
  const operations = approvalKey(item.operationsApproval ?? item.operations_approval);
  const supervisor = approvalKey(item.svApproval ?? item.sv_approval ?? item.approval);
  if (operations === "rejected" || supervisor === "rejected" || text(item.rejectedReason ?? item.rejected_reason)) return "rejected";
  if (operations === "approved" || supervisor === "approved" || statusIndex(item.status) === 2) return "approved";
  return "not-started";
}

function groupMeta(items = []) {
  const summary = items.find((item) => item?._summaryCard);
  if (summary) {
    return {
      stage: Number(summary._groupStage) || statusIndex(summary.status),
      hasRemaining: Boolean(summary._groupHasRemaining),
      hasReceived: Boolean(summary._groupHasReceived),
      maintenance: orderTypeKey(summary.orderType) === "requestmaintenance",
    };
  }
  const stage = Math.max(1, ...items.map((item) => statusIndex(item?.status)));
  const hasRemaining = items.some((item) => Math.abs(Number(item?.quantityRemaining ?? item?.quantity_remaining ?? 0) || 0) > 1e-9);
  const hasReceived = items.some((item) => Math.abs(Number(item?.quantityReceived ?? item?.quantity_received_by_operations ?? 0) || 0) > 1e-9);
  const rawType = text(items?.[0]?.orderType ?? items?.[0]?.order_type);
  const maintenance = orderTypeKey(rawType) === "requestmaintenance";
  return { stage, hasRemaining, hasReceived, maintenance };
}

function groupMatchesTab(items = [], tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
  const summary = items.find((item) => item?._summaryCard);
  if (summary && summary._summaryTab === cleanTab) return true;
  if (cleanTab === "approved" || cleanTab === "rejected") {
    return items.some((item) => statusIndex(item?.status) === 2 && decision(item) === cleanTab);
  }
  const meta = groupMeta(items);
  if (cleanTab === "all") return meta.stage < 5;
  if (cleanTab === "archive") return meta.stage >= 5;
  if (cleanTab === "delivered") return meta.stage === 4;
  if (cleanTab === "remaining") return meta.stage === 3 && !meta.maintenance && meta.hasRemaining;
  if (cleanTab === "received") return meta.stage === 3 && (meta.maintenance || meta.hasReceived);
  return true;
}

function rowsForTab(items = [], tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
  if (items.some((item) => item?._summaryCard)) return items;
  if (cleanTab === "approved" || cleanTab === "rejected") {
    return items.filter((item) => statusIndex(item?.status) === 2 && decision(item) === cleanTab);
  }
  return items;
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
    item?.actualIssueDescription,
    item?.repairAction,
    item?.resolutionMethod,
    item?.operationsByName,
    item?.receiptNumber,
    item?.rejectedReason,
    item?._summarySearchText,
  ]).map((value) => norm(value)).join(" ");
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

function statusLogic(tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
  if (cleanTab === "archive") return ["status.ilike.*archive*"];
  if (cleanTab === "delivered") return ["status.ilike.*arrived*", "status.ilike.*delivered*", "status.ilike.*received*"];
  if (cleanTab === "remaining") {
    return ["status.ilike.*shipped*", "status.ilike.*shipping*", "status.ilike.*prepared*", "status.ilike.*delivering*"];
  }
  // Maintenance logs created by the older client can legitimately be stored as
  // "In progress" while they are already in the Shipping step. Keep this
  // candidate query broad and let the exact normalized status decide below.
  if (cleanTab === "received") return null;
  if (cleanTab === "approved" || cleanTab === "rejected") return ["status.ilike.*progress*", "status.ilike.*approved*"];
  return null;
}

function logicalParams({ query = "", tab = "all", type = "all", searchMode = "fast" } = {}) {
  const params = {};
  const logicGroups = [];
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
        profileName: `orders.operations${suffix}.candidates-rpc`,
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
    queryProfileName: `orders.operations${suffix}.candidates`,
    scanProfileName: `orders.operations${suffix}.candidate-scan`,
    signal,
  });
}

function stageStatus(stage) {
  const value = Number(stage) || 1;
  if (value >= 5) return "Archive";
  if (value === 4) return "Delivered";
  if (value === 3) return "Shipped";
  if (value === 2) return "In progress";
  return "Pending";
}

function operationsCardSummaryItem(row = {}, tab = "all") {
  const orderIds = Array.isArray(row?.orderIds) ? row.orderIds.map(text).filter(Boolean) : [];
  const orderNumber = Number(row?.orderNumber);
  const cleanTab = String(tab || "all").trim().toLowerCase();
  const hasApproved = Boolean(row?.hasApproved);
  const hasRejected = Boolean(row?.hasRejected);
  return {
    id: orderIds[0] || `summary-${Number.isFinite(orderNumber) ? orderNumber : "order"}`,
    orderIds,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(row?.reason) || "No Reason",
    unitPrice: 0,
    quantityRequested: 1,
    quantityEditedBySupervisor: null,
    quantityReceived: row?.hasReceived ? 1 : 0,
    quantityRemaining: row?.hasRemaining ? 1 : 0,
    quantityReceivedEdited: Boolean(row?.hasReceived),
    quantity: 1,
    status: stageStatus(row?.stage),
    orderType: text(row?.orderType) || null,
    orderTypeColor: orderTypeColor(row?.orderType),
    operationsApproval: cleanTab === "rejected" ? "Rejected" : cleanTab === "approved" ? "Approved" : (hasRejected && !hasApproved ? "Rejected" : hasApproved && !hasRejected ? "Approved" : null),
    rejectedReason: null,
    createdTime: dateValue(row?.createdTime) || new Date().toISOString(),
    createdById: text(row?.teamMemberId) || text(row?.teamMemberName) || null,
    createdByName: text(row?.teamMemberName) || null,
    svApproval: cleanTab === "rejected" ? "Rejected" : cleanTab === "approved" ? "Approved" : null,
    summaryOnly: true,
    source: "supabase",
    _summaryCard: true,
    _summaryTab: cleanTab,
    _groupStage: Number(row?.stage) || 1,
    _groupHasRemaining: Boolean(row?.hasRemaining),
    _groupHasReceived: Boolean(row?.hasReceived),
    _groupHasApproved: hasApproved,
    _groupHasRejected: hasRejected,
  };
}

async function rowsByNumbers(numbers = [], signal = null, includeLocalSearchFields = false, { tab = "all" } = {}) {
  if (!includeLocalSearchFields && canUseOrderCardSummaryRpc()) {
    try {
      const rows = await loadOrderCardSummariesRpc({
        numbers,
        context: "operations",
        tab,
        profileName: "orders.operations.card-summary-rpc",
        signal,
      });
      return rows.map((row) => operationsCardSummaryItem(row, tab));
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      noteOrderCardSummaryRpcError(error);
    }
  }

  if (canUseOrderSummaryRpc()) {
    try {
      return await loadOrderSummaryRowsRpc({
        numbers,
        profileName: "orders.operations.summary-rpc",
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
    selectExpr: includeLocalSearchFields ? SUMMARY_SEARCH_SELECT : SUMMARY_SELECT,
    queryProfileName: "orders.operations.summary",
    fallbackProfileName: "orders.operations.summary-fallback",
    loadProfileName: "orders.operations.summary-load",
    signal,
  });
}

function groupRows(rows = [], includeLocalSearchFields = false) {
  const startedAt = performance.now();
  const groups = new Map();
  for (const row of rows) {
    const item = row?._summaryCard ? row : serializeOperationsCompactSummaryRow(row, { includeSearchText: includeLocalSearchFields });
    const orderNumber = Number(item.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  recordPerformanceSample({
    category: "orders-summary",
    name: "orders.operations.summary-transform",
    durationMs: performance.now() - startedAt,
    meta: { rows: rows.length, groups: groups.size, localSearch: includeLocalSearchFields },
  });
  return groups;
}

function compactOperationsSummaryItem(item = {}) {
  return {
    id: item.id,
    orderId: item.orderId,
    orderIdNumber: item.orderIdNumber,
    reason: item.reason,
    unitPrice: item.unitPrice,
    quantityRequested: item.quantityRequested,
    quantityEditedBySupervisor: item.quantityEditedBySupervisor,
    quantityReceived: item.quantityReceived,
    quantityRemaining: item.quantityRemaining,
    quantityReceivedEdited: item.quantityReceivedEdited,
    quantity: item.quantity,
    status: item.status,
    orderType: item.orderType,
    orderTypeColor: item.orderTypeColor,
    operationsApproval: item.operationsApproval,
    rejectedReason: item.rejectedReason,
    createdTime: item.createdTime,
    createdById: item.createdById,
    createdByName: item.createdByName,
    svApproval: item.svApproval,
    summaryOnly: true,
    source: "supabase",
  };
}

export async function loadOperationsOrdersPage({
  tab = "all",
  type = "all",
  query = "",
  cursor = null,
  limit = PAGE_LIMIT,
  signal = null,
} = {}) {
  if (!isSupabaseConfigured()) return null;
  const safeLimit = pageLimit(limit);
  const outputGroups = [];
  let nextCursor = pageCursor(cursor);
  let hasMore = true;
  let loops = 0;

  while (outputGroups.length < safeLimit && hasMore && loops < 12) {
    loops += 1;
    const searchPlan = searchLogic(query);
    const hasTextSearch = Boolean(searchPlan?.clean && !Number.isFinite(searchPlan?.orderNumber));
    const fastSearch = hasTextSearch && canUseOrderSearchText();
    const filters = logicalParams({ query, tab, type, searchMode: fastSearch ? "fast" : "legacy" });
    let candidates;
    let localSearchFallback = false;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 60),
        filters,
        searchMode: hasTextSearch ? (fastSearch ? "fast" : "legacy") : "",
        rpcOptions: !searchPlan ? {
          context: "operations",
          orderType: orderTypeLabel(type),
          tab,
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
            filters: logicalParams({ query, tab, type, searchMode: "legacy" }),
            searchMode: "legacy",
            signal,
          });
        } catch (fallbackError) {
          if (signal?.aborted || fallbackError?.code === "REQUEST_ABORTED" || fallbackError?.name === "AbortError") throw fallbackError;
          candidates = null;
        }
      }
      if (!candidates) {
        // Older/custom schemas can reject one of the projected filter columns.
        // Keep the optimized order-number paging and apply the exact filters in
        // JavaScript rather than falling all the way back to a full-table scan.
        localSearchFallback = hasTextSearch;
        candidates = await candidateNumbers({
          cursor: nextCursor,
          scanGroups: Math.max(safeLimit * 2, 60),
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
      loadRows: (numbers, loadSignal) => rowsByNumbers(numbers, loadSignal, localSearchFallback, { tab }),
      profileName: "orders.operations.summary-window",
      signal,
      consumeRows: ({ numbers, rows }) => {
        const groups = groupRows(rows, localSearchFallback);
        let processedCandidates = 0;
        let matchedGroups = 0;

        for (const orderNumber of numbers) {
          processedCandidates += 1;
          nextCursor = orderNumber;
          const items = groups.get(orderNumber) || [];
          if (!items.length || !groupMatchesTab(items, tab)) continue;
          if (cleanType && cleanType !== "all" && orderTypeKey(items[0]?.orderType || "") !== cleanType) continue;
          if (needle && !groupSearchText(items).includes(needle)) continue;
          outputGroups.push({ orderNumber, items: rowsForTab(items, tab) });
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

    // There can still be unconsumed groups inside the current candidate window
    // even when Supabase itself has no rows beyond that window.
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

export async function loadOperationsOrdersInitialPage({ limit = PAGE_LIMIT } = {}) {
  return await measurePerformance("page-data", "orders.operations.initial", async () =>
    await loadOperationsOrdersPage({ tab: "all", type: "all", query: "", cursor: null, limit }),
  );
}
export async function loadOperationsOrderDetails(orderIds = []) {
  if (!isSupabaseConfigured()) return null;
  const rows = await loadRawOrderRowsByIds(orderIds);
  const serialized = rows.map(serializeOperationsOrderDetail);
  return await enrichOrderDetailGrouping(serialized);
}



function directOperationsMutationError(message, status = 500) {
  const error = new Error(message || "Operations Orders action failed.");
  error.code = "DIRECT_OPERATIONS_MUTATION_FAILED";
  error.status = Number(status) || 500;
  return error;
}

function operationsAccessToken(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function operationsTeamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function operationsValueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(operationsAccessToken).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(operationsAccessToken(key))) return value;
  }
  return null;
}

function hasOperationsAdminAccess(account = {}) {
  const name = operationsAccessToken(account?.name || account?.username);
  const position = operationsAccessToken(account?.position);
  if (name === "admin" || position.includes("admin")) return true;

  const wanted = new Set(["operationsorders", "requestedorders", "operationsrequestedorders", "schoolsrequestedorders"]);
  const pages = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  return pages.some((row) => {
    if (row?.isEnabled === false) return false;
    if (text(row?.accessLevel || row?.access_level).toLowerCase() !== "admin") return false;
    const candidates = [
      row?.pageName,
      row?.pageKey,
      row?.routePath,
      ...(Array.isArray(row?.aliases) ? row.aliases : []),
    ].map(operationsAccessToken).filter(Boolean);
    return candidates.some((candidate) => wanted.has(candidate));
  });
}

async function directOperationsAdminPasswordResult(account = {}, password = "") {
  const pwd = text(password);
  if (!pwd) throw directOperationsMutationError("adminPassword required", 400);
  if (hasOperationsAdminAccess(account)) return true;
  if (pwd === "__OPS_PAGE_ADMIN_BYPASS__") return false;
  if (!isSupabaseConfigured()) return null;

  let candidates = [];
  let hadSuccessfulLookup = false;
  const attempts = [
    { select: "*", name: "ilike.admin", limit: "10" },
    { select: "*", position: "ilike.*admin*", limit: "20" },
  ];
  for (const params of attempts) {
    try {
      const rows = await select(operationsTeamMembersTable(), params);
      hadSuccessfulLookup = true;
      if (Array.isArray(rows) && rows.length) candidates.push(...rows);
    } catch {
      // Custom/older schemas may reject a filter name. Keep trying and use the
      // Legacy verifier when the direct schema cannot prove compatibility.
    }
    if (candidates.length) break;
  }

  if (!candidates.length) {
    try {
      const rows = await selectAll(operationsTeamMembersTable(), { limit: 1000 });
      hadSuccessfulLookup = true;
      candidates = Array.isArray(rows) ? rows : [];
    } catch {
      return null;
    }
  }
  if (!hadSuccessfulLookup) return null;

  const adminRow = candidates.find((row) => operationsAccessToken(operationsValueFor(row, ["name", "Name"])) === "admin")
    || candidates.find((row) => operationsAccessToken(operationsValueFor(row, ["position", "Position"])).includes("admin"))
    || candidates.find((row) => operationsAccessToken(operationsValueFor(row, ["name", "Name"])).includes("admin"));
  if (!adminRow) return null;

  const stored = text(operationsValueFor(adminRow, ["password", "Password"]));
  if (!stored) return null;
  return stored === pwd;
}

function cleanOperationsActionIds(value = []) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.map((id) => text(id)).filter(Boolean))].slice(0, 1000);
}

async function loadOperationRowsByIds(ids = []) {
  const clean = cleanOperationsActionIds(ids);
  if (!clean.length) throw directOperationsMutationError("orderIds required", 400);
  if (!clean.every((id) => /^\d+$/.test(id))) return null;
  if (!isSupabaseConfigured()) return null;

  const rows = [];
  for (let index = 0; index < clean.length; index += 180) {
    const batch = clean.slice(index, index + 180);
    const chunk = await select(tableName(), {
      select: "*",
      id: `in.(${batch.join(",")})`,
      limit: String(Math.max(batch.length, 1)),
    });
    if (Array.isArray(chunk)) rows.push(...chunk);
  }

  const byId = new Map(rows.map((row) => [text(row?.id ?? row?.ID), row]));
  return { clean, byId, rows };
}

function splitReceiptNumbers(value) {
  const source = Array.isArray(value) ? value : [value];
  return source
    .flatMap((entry) => String(entry ?? "").replace(/\r\n/g, "\n").split(/[\n,]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeReceiptNumbers(existing, next) {
  const seen = new Set();
  const values = [];
  for (const entry of [...splitReceiptNumbers(existing), ...splitReceiptNumbers(next)]) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(entry);
  }
  return values.join("\n").trim();
}

function orderBaseQuantity(row = {}) {
  const requested = num(row.quantity_requested ?? row["Quantity Requested"] ?? row.requested_quantity ?? row["Requested Quantity"]);
  const progress = num(row.quantity_progress ?? row["Quantity Progress"] ?? row.quantity ?? row.Quantity ?? row.qty ?? row.Qty);
  const edited = num(row.quantity_edited_by_supervisor ?? row["Quantity Edited by supervisor"] ?? row["Quantity Edited by Supervisor"] ?? row.quantity_edited ?? row.edited_quantity);
  const original = roundQty(requested !== null ? requested : (progress !== null ? progress : 0));
  return roundQty(edited !== null ? edited : original);
}

function rawReceivedQuantity(row = {}) {
  return num(row.quantity_received_by_operations ?? row["Quantity Received by operations"] ?? row["Quantity Received by Operations"] ?? row.received_quantity ?? row.quantity_received);
}

function rawRemainingQuantity(row = {}) {
  return num(row.quantity_remaining ?? row["Quantity Remaining"] ?? row.remaining_quantity);
}

function effectiveReceivedForMutation(row = {}) {
  const base = orderBaseQuantity(row);
  const receivedRaw = rawReceivedQuantity(row);
  const remainingRaw = rawRemainingQuantity(row);
  const status = norm(row.status ?? row.Status);
  const finalStatus = /(arrived|delivered|received)/.test(status);
  const hasBase = Math.abs(base) > 1e-9;
  const receivedZero = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const remainingZero = remainingRaw !== null && Math.abs(Number(remainingRaw) || 0) < 1e-9;
  const remainingEqualsBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - base)) < 1e-9;

  // Imported empty Notion number cells can appear as 0/0 in Supabase. Match
  // the Legacy serializer and treat those as "not received yet" until final.
  if (hasBase && receivedZero && ((remainingZero && !finalStatus) || remainingEqualsBase)) return null;
  return receivedRaw;
}

function clampQuantityToBase(base, value) {
  const baseQty = roundQty(base);
  const nextQty = roundQty(value);
  if (baseQty >= 0) return Math.min(Math.max(nextQty, 0), baseQty);
  return Math.max(Math.min(nextQty, 0), baseQty);
}

async function mapWithConcurrency(items = [], concurrency = 12, mapper = async (item) => item) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.max(1, Math.min(list.length, Number(concurrency) || 1));
  const results = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  };
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function upstashDeleteOperationsKeys(keys = []) {
  const url = text(process.env.UPSTASH_REDIS_REST_URL);
  const tokenValue = text(process.env.UPSTASH_REDIS_REST_TOKEN);
  const clean = [...new Set((keys || []).map(text).filter(Boolean))];
  if (!url || !tokenValue || !clean.length) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(url.replace(/\/+$/, ""), {
      method: "POST",
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

async function invalidateLegacyOperationsCaches(account = {}) {
  const username = text(account?.username || account?.name);
  const userKey = username ? norm(username).replace(/[^a-z0-9]+/g, "") : "";
  const keys = [
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
  ];
  if (userKey) {
    keys.push(
      `cache:api:orders:current:supabase:v1:${userKey}`,
      `cache:api:orders:current-summary:supabase:v1:${userKey}`,
      `cache:api:orders:current-home-summary:supabase:v1:${userKey}`,
    );
  }
  await upstashDeleteOperationsKeys(keys).catch(() => false);
}

export async function updateOperationsApproval({ account, ids = [], decision = "", rejectedReason = "" } = {}) {
  const raw = norm(decision);
  const normalizedDecision = raw === "approved" ? "Approved" : raw === "rejected" ? "Rejected" : raw === "not started" || raw === "not-started" ? "Not Started" : "";
  const reason = text(rejectedReason);
  if (!normalizedDecision) throw directOperationsMutationError("Invalid ids or decision", 400);
  if (normalizedDecision === "Rejected" && !reason) throw directOperationsMutationError("Rejected reason is required", 400);

  const loaded = await loadOperationRowsByIds(ids);
  if (!loaded) return null;
  const existingIds = loaded.clean.filter((id) => loaded.byId.has(id));
  const failed = loaded.clean.filter((id) => !loaded.byId.has(id)).map((id) => ({ id, error: "Order not found" }));
  const patch = {
    operations_approval: normalizedDecision,
    rejected_reason: normalizedDecision === "Rejected" ? reason : null,
  };

  for (let index = 0; index < existingIds.length; index += 180) {
    const batch = existingIds.slice(index, index + 180);
    try {
      await updateByIds(tableName(), batch, patch);
    } catch (error) {
      for (const id of batch) {
        try { await updateById(tableName(), id, patch); }
        catch (rowError) { failed.push({ id, error: rowError?.message || String(rowError) }); }
      }
    }
  }

  const failedIds = new Set(failed.map((item) => text(item?.id)));
  const updated = existingIds
    .filter((id) => !failedIds.has(id))
    .map((id) => ({ id, decision: normalizedDecision, rejectedReason: normalizedDecision === "Rejected" ? reason : null }));
  await invalidateLegacyOperationsCaches(account).catch(() => {});
  return {
    ok: failed.length === 0,
    decision: normalizedDecision,
    rejectedReason: normalizedDecision === "Rejected" ? reason : null,
    updated,
    failed,
    source: "supabase-direct",
  };
}

export async function markOperationsShipped({
  account,
  orderIds = [],
  receiptNumber = null,
  quantities = null,
  issueDescription = "",
  perItemIssues = [],
} = {}) {
  const loaded = await loadOperationRowsByIds(orderIds);
  if (!loaded) return null;
  if (loaded.clean.some((id) => !loaded.byId.has(id))) {
    throw directOperationsMutationError("Order not found", 404);
  }

  const quantityMap = quantities && typeof quantities === "object" && !Array.isArray(quantities) ? quantities : null;
  const globalIssue = text(issueDescription);
  const issues = new Map(
    (Array.isArray(perItemIssues) ? perItemIssues : [])
      .map((entry) => [text(entry?.orderId), text(entry?.issueDescription)])
      .filter(([id]) => id),
  );
  const incomingReceipt = mergeReceiptNumbers("", receiptNumber);
  const operationsByName = text(account?.username || account?.name);

  const updatedRows = await mapWithConcurrency(loaded.clean, 16, async (id) => {
    const row = loaded.byId.get(id) || {};
    const patch = {
      status: "Shipped",
      person_received_by_operations: operationsByName || null,
    };
    const mergedReceipt = incomingReceipt ? mergeReceiptNumbers(row.receipt_number ?? row["Receipt Number"] ?? row["Store Receipt Number"], incomingReceipt) : "";
    if (mergedReceipt) patch.receipt_number = mergedReceipt;

    const rowIssue = issues.has(id) ? issues.get(id) : globalIssue;
    if (rowIssue) patch.issue_description = rowIssue;

    const base = orderBaseQuantity(row);
    const hasExplicit = quantityMap && Object.prototype.hasOwnProperty.call(quantityMap, id);
    const explicit = hasExplicit ? Number(quantityMap[id]) : null;
    if (hasExplicit && Number.isFinite(explicit)) {
      const received = clampQuantityToBase(base, explicit);
      patch.quantity_received_by_operations = received;
      patch.quantity_remaining = roundQty(base - received);
    } else {
      const currentReceived = effectiveReceivedForMutation(row);
      const currentRemaining = rawRemainingQuantity(row);
      const hasMeaningfulReceived = currentReceived !== null && Math.abs(Number(currentReceived) || 0) > 1e-9;
      if (!hasMeaningfulReceived) {
        patch.quantity_received_by_operations = roundQty(base);
        patch.quantity_remaining = 0;
      } else if (currentRemaining === null || Math.abs(Number(currentRemaining) || 0) > 1e-9) {
        patch.quantity_received_by_operations = roundQty(Number(currentReceived) || 0);
        patch.quantity_remaining = roundQty(base - (Number(currentReceived) || 0));
      }
    }
    return await updateById(tableName(), id, patch);
  });

  await invalidateLegacyOperationsCaches(account).catch(() => {});
  const returnedReceipt = updatedRows
    .map((row) => text(row?.receipt_number ?? row?.["Receipt Number"] ?? row?.["Store Receipt Number"]))
    .find(Boolean) || incomingReceipt || null;

  return {
    success: true,
    status: "Shipped",
    statusColor: "blue",
    operationsByName,
    issueDescription: globalIssue || null,
    perItemIssues: Array.from(issues.entries()).map(([orderId, issue]) => ({ orderId, issueDescription: issue })),
    receiptNumber: returnedReceipt,
    source: "supabase-direct",
  };
}

function operationsProductKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function operationsProductMaps(products = []) {
  const byId = new Map();
  const byName = new Map();
  const byUrl = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const id = text(product?.id);
    const nameKey = operationsProductKey(product?.name);
    const urlKey = text(product?.url).toLowerCase();
    if (id) byId.set(id, product);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
    if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, product);
  }
  return { byId, byName, byUrl };
}

function resolveOperationsEditProduct(row = {}, maps = {}) {
  const directId = text(operationsValueFor(row, ["product_id", "productId", "product_page_id", "productPageId"]));
  if (directId && maps.byId?.has(directId)) return maps.byId.get(directId);
  const url = text(operationsValueFor(row, ["product_url", "Product URL", "url", "URL"])).toLowerCase();
  if (url && maps.byUrl?.has(url)) return maps.byUrl.get(url);
  const nameKey = operationsProductKey(operationsValueFor(row, ["product_name", "Product Name", "product", "Product"]));
  if (nameKey && maps.byName?.has(nameKey)) return maps.byName.get(nameKey);
  return null;
}

function addOperationsStatusOption(list, value) {
  const clean = text(value);
  if (!clean) return;
  if (!list.some((item) => norm(item) === norm(clean))) list.push(clean);
}

export async function performOperationsProtectedAction({
  account,
  action,
  orderIds = [],
  adminPassword = "",
} = {}) {
  const cleanAction = text(action).toLowerCase().replace(/[_\s]+/g, "-");
  if (!["archive", "unarchive", "edit-init"].includes(cleanAction)) {
    throw directOperationsMutationError("Unsupported protected action", 400);
  }

  const loaded = await loadOperationRowsByIds(orderIds);
  if (!loaded) return null;
  if (loaded.clean.some((id) => !loaded.byId.has(id))) {
    throw directOperationsMutationError("Orders not found", 404);
  }

  if (cleanAction !== "unarchive") {
    const passwordOk = await directOperationsAdminPasswordResult(account || {}, adminPassword);
    if (passwordOk === null) return null;
    if (!passwordOk) throw directOperationsMutationError("Invalid admin password", 401);
  }

  if (cleanAction === "archive") {
    await updateByIds(tableName(), loaded.clean, { status: "Archive" });
    await invalidateLegacyOperationsCaches(account).catch(() => {});
    return { success: true, status: "Archive", statusColor: "purple", source: "supabase-direct" };
  }

  if (cleanAction === "unarchive") {
    await updateByIds(tableName(), loaded.clean, { status: "In progress" });
    await invalidateLegacyOperationsCaches(account).catch(() => {});
    return { success: true, status: "In progress", statusColor: "yellow", source: "supabase-direct" };
  }

  const catalog = await getProductsCatalog();
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const maps = operationsProductMaps(products);
  const items = loaded.clean.map((id) => {
    const row = loaded.byId.get(id) || {};
    const serialized = serializeOperationsOrderDetail(row);
    const product = resolveOperationsEditProduct(row, maps);
    const status = text(serialized?.status) || "In Progress";
    const delivered = /(arrived|delivered|received)/i.test(status);
    const requestedQty = Number(serialized?.quantityRequested ?? serialized?.quantity ?? 0) || 0;
    const receivedQty = Number(serialized?.quantityReceived ?? 0) || 0;
    const remainingQty = Number(serialized?.quantityRemaining ?? (requestedQty - receivedQty)) || 0;
    return {
      ...serialized,
      productId: text(product?.id || operationsValueFor(row, ["product_id", "productId", "product_page_id", "productPageId"])) || null,
      productIdCode: text(product?.displayId) || null,
      effectiveIdCode: text(serialized?.customizeId || product?.displayId) || null,
      requestedQty,
      receivedQty,
      remainingQty,
      deliveredQty: delivered ? receivedQty : 0,
      unitPrice: Number.isFinite(Number(serialized?.unitPrice)) ? Number(serialized.unitPrice) : null,
    };
  });

  const statusOptions = [];
  addOperationsStatusOption(statusOptions, "In Progress");
  addOperationsStatusOption(statusOptions, "Shipped");
  addOperationsStatusOption(statusOptions, "Arrived");
  loaded.clean.forEach((id) => addOperationsStatusOption(statusOptions, loaded.byId.get(id)?.status ?? loaded.byId.get(id)?.Status));

  return {
    ok: true,
    source: "supabase-direct",
    count: items.length,
    items,
    products,
    statusOptions,
  };
}
function directOperationsCommittedError(message, status = 500, cause = null) {
  const error = directOperationsMutationError(message || "Operations order edit failed.", status);
  error.noFallback = true;
  if (cause) error.cause = cause;
  return error;
}

function opsEditMissingColumn(error) {
  const message = String(error?.message || error?.details?.message || error?.details || error?.hint || "");
  return (message.match(/Could not find the ['"]([^'"]+)['"] column/i) || [])[1]
    || (message.match(/column ['"]([^'"]+)['"]/i) || [])[1]
    || "";
}

function opsEditCleanInsertRow(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!key || typeof value === "undefined") continue;
    out[key] = typeof value === "number" && !Number.isFinite(value) ? null : value;
  }
  return out;
}

async function opsEditUpdateOrderSafe(id, row = {}, requiredColumns = []) {
  let payload = { ...(row || {}) };
  const required = new Set((requiredColumns || []).filter(Boolean));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await updateById(tableName(), id, payload);
    } catch (error) {
      const missing = opsEditMissingColumn(error);
      if (!missing || !Object.prototype.hasOwnProperty.call(payload, missing)) throw error;
      if (required.has(missing)) throw directOperationsMutationError(`Missing required Orders column: ${missing}. Run the Customize ID SQL migration first.`, 400);
      delete payload[missing];
    }
  }
  throw new Error("Failed to update the Operations order after removing unsupported optional columns.");
}

async function opsEditInsertOrderSafe(row = {}, requiredColumns = []) {
  let payload = opsEditCleanInsertRow(row);
  const required = new Set((requiredColumns || []).filter(Boolean));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await insert(tableName(), payload);
    } catch (error) {
      const missing = opsEditMissingColumn(error);
      if (!missing || !Object.prototype.hasOwnProperty.call(payload, missing)) throw error;
      if (required.has(missing)) throw directOperationsMutationError(`Missing required Orders column: ${missing}. Run the Customize ID SQL migration first.`, 400);
      delete payload[missing];
    }
  }
  throw new Error("Failed to create the split Operations order row after removing unsupported optional columns.");
}

function opsEditParseSourceKits(value) {
  let raw = value;
  if (!Array.isArray(raw) && !(raw && typeof raw === "object")) {
    const candidate = text(value);
    if (!candidate) return [];
    try { raw = JSON.parse(candidate); } catch { return []; }
  }
  return (Array.isArray(raw) ? raw : [])
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name),
      quantity: Math.max(0, Number(source?.quantity ?? source?.qty ?? 1) || 0),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function opsEditSplitQtyBySources(value, sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return [];
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-9) return list.map(() => 0);
  const sign = numeric < 0 ? -1 : 1;
  const targetAbs = Math.abs(numeric);
  const weights = list.map((source) => Math.max(0, Number(source?.quantity) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return list.map((_, index) => index === 0 ? roundQty(numeric) : 0);
  if (Math.abs(targetAbs - Math.round(targetAbs)) < 1e-9) {
    const target = Math.round(targetAbs);
    const parts = weights.map((weight, index) => {
      const raw = (weight * target) / total;
      const base = Math.floor(raw);
      return { index, value: base, fraction: raw - base };
    });
    let remaining = target - parts.reduce((sum, part) => sum + part.value, 0);
    const ranked = parts.slice().sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index));
    for (let index = 0; remaining > 0 && ranked.length; index = (index + 1) % ranked.length) {
      ranked[index].value += 1;
      remaining -= 1;
    }
    return parts.sort((a, b) => a.index - b.index).map((part) => sign * part.value);
  }
  const result = weights.map((weight) => roundQty(sign * targetAbs * weight / total));
  const difference = roundQty(numeric - result.reduce((sum, part) => sum + part, 0));
  if (Math.abs(difference) > 1e-9) result[result.length - 1] = roundQty(result[result.length - 1] + difference);
  return result;
}

function opsEditSplitOrderRow(row = {}) {
  const sources = opsEditParseSourceKits(operationsValueFor(row, ["source_kits", "Source Kits", "proposal_source_kits", "Proposal Source Kits"]));
  if (sources.length <= 1) return null;
  const serialized = serializeOperationsOrderDetail(row);
  const requested = Number(serialized?.quantityRequested ?? serialized?.quantity ?? 0) || 0;
  const base = Number(serialized?.quantity ?? requested) || 0;
  const received = Number(serialized?.quantityReceived ?? 0) || 0;
  const remaining = Number(serialized?.quantityRemaining ?? (base - received)) || 0;
  const editedRaw = serialized?.quantityEditedBySupervisor;
  const requestedParts = opsEditSplitQtyBySources(requested, sources);
  const baseParts = opsEditSplitQtyBySources(base, sources);
  const receivedParts = opsEditSplitQtyBySources(received, sources);
  const remainingParts = opsEditSplitQtyBySources(remaining, sources);
  const editedParts = editedRaw === null || typeof editedRaw === "undefined" ? sources.map(() => null) : opsEditSplitQtyBySources(Number(editedRaw) || 0, sources);
  return sources.map((source, index) => {
    const requestedQty = roundQty(requestedParts[index] ?? 0);
    const cleanSource = {
      kitId: text(source?.kitId),
      kitName: text(source?.kitName),
      quantity: Math.abs(requestedQty),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    };
    return {
      source: cleanSource,
      sourceIndex: index,
      row: {
        ...(row || {}),
        quantity_requested: requestedQty,
        quantity_progress: roundQty(baseParts[index] ?? requestedQty),
        quantity_edited_by_supervisor: editedParts[index],
        quantity_received_by_operations: roundQty(receivedParts[index] ?? 0),
        quantity_remaining: roundQty(remainingParts[index] ?? ((baseParts[index] ?? requestedQty) - (receivedParts[index] ?? 0))),
        kit_tag: cleanSource.kitName || null,
        source_kits: [cleanSource],
      },
    };
  });
}

function opsEditCloneOrderInsertRow(row = {}) {
  const clone = { ...(row || {}) };
  ["id", "ID", "notion_page_id", "notion_id", "page_id", "notionPageId"].forEach((key) => delete clone[key]);
  return opsEditCleanInsertRow(clone);
}

function opsEditProductFirstTag(product = {}) {
  return (Array.isArray(product?.tags) ? product.tags : []).map(text).find(Boolean) || null;
}

function opsEditBuildItemPatch(beforeRow, itemUpdate, productMap, sourceMeta = null) {
  if (!itemUpdate) return {};
  const patch = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(itemUpdate, key);
  const numberField = (key, label) => {
    if (!has(key)) return null;
    const value = Number(itemUpdate[key]);
    if (!Number.isFinite(value)) throw directOperationsMutationError(`${label} must be a valid number.`, 400);
    return roundQty(value);
  };

  if (has("productId")) {
    const productId = text(itemUpdate.productId);
    const product = productMap.get(productId) || null;
    if (!product?.id) throw directOperationsMutationError("The selected Product component was not found.", 400);
    patch.product_id = Number.isFinite(Number(product.id)) ? Number(product.id) : String(product.id);
    patch.product_name = text(product.name) || "Unknown Product";
    patch.product_url = product.url || null;
    patch.unit_price = Number.isFinite(Number(product.unitPrice)) ? Number(product.unitPrice) : null;
    patch.product_tag = opsEditProductFirstTag(product);
  }
  if (has("unitPrice")) patch.unit_price = itemUpdate.unitPrice === null || itemUpdate.unitPrice === "" ? null : numberField("unitPrice", "Unit cost");
  if (has("productTag")) patch.product_tag = text(itemUpdate.productTag) || null;
  if (has("customizeId")) patch.customize_id = text(itemUpdate.customizeId) || null;
  if (has("kitTag")) patch.kit_tag = text(itemUpdate.kitTag) || null;
  if (has("reason")) patch.reason = text(itemUpdate.reason) || null;
  if (has("issueDescription")) patch.issue_description = String(itemUpdate.issueDescription || "").replace(/\r\n/g, "\n").trim() || null;
  if (has("status")) {
    const status = text(itemUpdate.status);
    if (!status) throw directOperationsMutationError("Status is required.", 400);
    patch.status = status;
  }

  const serialized = serializeOperationsOrderDetail(beforeRow);
  const requestedQty = has("requestedQty") ? numberField("requestedQty", "Requested quantity") : roundQty(Number(serialized?.quantityRequested ?? serialized?.quantity ?? 0) || 0);
  let receivedQty = has("receivedQty") ? numberField("receivedQty", "Received quantity") : roundQty(Number(serialized?.quantityReceived ?? 0) || 0);
  let remainingQty = has("remainingQty") ? numberField("remainingQty", "Remaining quantity") : roundQty(Number(serialized?.quantityRemaining ?? (requestedQty - receivedQty)) || 0);
  const nextStatus = text(has("status") ? itemUpdate.status : serialized?.status);
  const finalStatus = /(arrived|delivered|received)/i.test(nextStatus);
  if (has("deliveredQty")) {
    const deliveredQty = numberField("deliveredQty", "Delivered quantity");
    if (finalStatus) {
      receivedQty = deliveredQty;
      remainingQty = roundQty(requestedQty - deliveredQty);
    } else if (Math.abs(deliveredQty) > 1e-9) {
      throw directOperationsMutationError("Delivered quantity can only be greater than zero when the status is Arrived/Delivered.", 400);
    }
  }
  if (has("requestedQty")) {
    patch.quantity_requested = requestedQty;
    patch.quantity_progress = requestedQty;
    patch.quantity_edited_by_supervisor = null;
  }
  if (has("receivedQty") || has("remainingQty") || has("requestedQty") || has("deliveredQty")) {
    patch.quantity_received_by_operations = receivedQty;
    patch.quantity_remaining = remainingQty;
  }

  if (sourceMeta) {
    const kitName = has("kitTag") ? text(itemUpdate.kitTag) : text(sourceMeta?.kitName || itemUpdate?.sourceKitName);
    patch.kit_tag = kitName || null;
    patch.source_kits = [{
      kitId: text(sourceMeta?.kitId || itemUpdate?.sourceKitId),
      kitName,
      quantity: Math.abs(requestedQty),
      order: Number.isFinite(Number(sourceMeta?.order)) ? Number(sourceMeta.order) : 0,
    }];
  }
  return patch;
}

function opsEditApplyQuantityMapPatch(beforeRow, rawQty) {
  const value = Number(rawQty);
  if (!Number.isFinite(value)) throw directOperationsMutationError("Quantity received must be a valid number.", 400);
  const serialized = serializeOperationsOrderDetail(beforeRow);
  const base = Number(serialized?.quantity) || 0;
  let nextQty = roundQty(value);
  if (base < 0 && nextQty > 0) nextQty = -Math.abs(nextQty);
  const clamped = clampQuantityToBase(base, nextQty);
  return { quantity_received_by_operations: clamped, quantity_remaining: roundQty(base - clamped) };
}

function opsStockCanonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N}]+/gu, "");
}

function opsStockColumnKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/%/g, " percent ").replace(/[’'"`]/g, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_");
}

function opsStockFindKey(keys = [], aliases = []) {
  const canonicalMap = new Map((keys || []).map((key) => [opsStockCanonical(key), key]));
  for (const alias of aliases || []) {
    const exact = (keys || []).find((key) => key === alias);
    if (exact) return exact;
    const hit = canonicalMap.get(opsStockCanonical(alias));
    if (hit) return hit;
  }
  return "";
}

function opsStockQuantityColumn(keys = [], schoolName = "") {
  const base = opsStockColumnKey(schoolName);
  const candidates = [schoolName, base, base && !base.endsWith("_done") ? `${base}_done` : "", base && base.endsWith("_done") ? base.replace(/_done$/, "") : "", base && !base.endsWith("_2nd_term") ? `${base}_2nd_term` : "", "total_quantity", "all_schools_stock", "all_done", "all_2nd_term", "quantity", "stock"].filter(Boolean);
  const direct = opsStockFindKey(keys, candidates);
  if (direct) return direct;
  if (!base) return "";
  return keys.find((key) => {
    const normalized = opsStockColumnKey(key);
    return normalized === base || normalized === `${base}_done` || normalized === `${base}_2nd_term` || (normalized.includes(base) && /(done|stock|quantity|2nd_term)/i.test(normalized));
  }) || "";
}

function opsStockTableName() {
  return text(process.env.SUPABASE_STOCKTAKING_TABLE) || "stocktaking";
}

async function opsSelectAllPaged(table, { order = "" } = {}) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const page = await select(table, { select: "*", limit: String(pageSize), offset: String(offset), ...(order ? { order } : {}) });
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length < pageSize) break;
  }
  return rows;
}

function opsOrderTypeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function opsSupportedStockOrderType(value) {
  const key = opsOrderTypeKey(value);
  return key === "requestproducts" || key === "withdrawproducts";
}

function opsFinalStatus(value) {
  return /(arrived|delivered|received)/i.test(text(value));
}

function opsReceiptPhotosJson(serialized = {}) {
  const entries = Array.isArray(serialized?.orderReceiptEntries) ? serialized.orderReceiptEntries : [];
  const clean = entries.map((entry, index) => ({
    name: text(entry?.name) || `Receipt photo ${index + 1}`,
    url: text(entry?.url || entry?.publicUrl || entry?.public_url || entry?.raw),
  })).filter((entry) => entry.url);
  return clean.length ? JSON.stringify(clean) : null;
}

function opsResolveOwnerMember(row = {}, members = []) {
  const rowId = text(operationsValueFor(row, ["team_member_id", "Team Member ID"]));
  const rowName = operationsAccessToken(operationsValueFor(row, ["team_member_name", "Teams Members", "Supervisor", "supervisor"]));
  return (members || []).find((member) => rowId && text(member?.id) === rowId)
    || (members || []).find((member) => rowName && operationsAccessToken(member?.name) === rowName)
    || null;
}

async function opsPrepareStockContext(plannedFinalRows = [], rowsBefore = [], products = []) {
  const relevantAfter = (plannedFinalRows || []).filter((row) => {
    const serialized = serializeOperationsOrderDetail(row || {});
    return opsFinalStatus(serialized?.status) && opsSupportedStockOrderType(serialized?.orderType);
  });
  const relevantBefore = (rowsBefore || []).filter((row) => {
    const serialized = serializeOperationsOrderDetail(row || {});
    return opsFinalStatus(serialized?.status) && opsSupportedStockOrderType(serialized?.orderType);
  });
  if (!relevantAfter.length && !relevantBefore.length) return { needed: false };

  const [stockRows, members] = await Promise.all([
    opsSelectAllPaged(opsStockTableName(), { order: "id.asc" }),
    listTeamMembersLite({ fresh: true }),
  ]);
  if (!stockRows.length) return null;
  const keys = [...new Set(stockRows.flatMap((row) => Object.keys(row || {})))];
  const sourceOrderColumn = opsStockFindKey(keys, ["source_order_id", "Source Order ID", "source_order", "Source Order", "order_row_id", "Order Row ID"]);
  if (!sourceOrderColumn) return null;

  const quantityColumnBySchool = new Map();
  for (const row of relevantAfter) {
    const member = opsResolveOwnerMember(row, members);
    const school = text(member?.stocktakingColumn);
    if (!school) return null;
    if (!quantityColumnBySchool.has(school)) {
      const quantityColumn = opsStockQuantityColumn(keys, school);
      if (!quantityColumn) return null;
      quantityColumnBySchool.set(school, quantityColumn);
    }
  }
  return { needed: true, stockRows, keys, members, sourceOrderColumn, quantityColumnBySchool, productMaps: operationsProductMaps(products) };
}

async function opsStockInsertSafe(row = {}, requiredColumns = []) {
  let payload = { ...(row || {}) };
  const required = new Set((requiredColumns || []).filter(Boolean));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try { return await insert(opsStockTableName(), payload); }
    catch (error) {
      const missing = opsEditMissingColumn(error);
      if (!missing || !Object.prototype.hasOwnProperty.call(payload, missing)) throw error;
      if (required.has(missing)) throw directOperationsCommittedError(`Missing required Stocktaking column: ${missing}.`, 400, error);
      delete payload[missing];
    }
  }
  throw directOperationsCommittedError("Failed to synchronize the Operations order with Stocktaking.", 500);
}

function opsBuildStockRow(orderRow = {}, context = {}) {
  const serialized = serializeOperationsOrderDetail(orderRow || {});
  const orderType = text(serialized?.orderType);
  if (!opsSupportedStockOrderType(orderType)) return null;
  const member = opsResolveOwnerMember(orderRow, context.members || []);
  const school = text(member?.stocktakingColumn);
  const quantityColumn = context.quantityColumnBySchool?.get(school) || "";
  if (!school || !quantityColumn) throw directOperationsCommittedError("Could not determine the requester Stocktaking column.", 500);

  let quantity = 0;
  for (const candidate of [serialized?.quantityReceived, serialized?.quantityProgress, serialized?.quantityRequested, serialized?.quantity]) {
    const value = Number(candidate);
    if (Number.isFinite(value) && Math.abs(value) > 1e-9) { quantity = roundQty(value); break; }
  }
  if (Math.abs(quantity) < 1e-9) throw directOperationsCommittedError("No delivered quantity was found for Stocktaking sync.", 500);
  quantity = opsOrderTypeKey(orderType) === "withdrawproducts" ? -Math.abs(quantity) : Math.abs(quantity);

  const keys = context.keys || [];
  const product = resolveOperationsEditProduct(orderRow, context.productMaps || {}) || null;
  const productName = text(serialized?.productName) || text(product?.name) || "Untitled Product";
  const proposal = /^created\s+from\s+proposal\s*:/i.test(text(serialized?.issueDescription));
  const proposalKitTag = proposal ? (text(serialized?.kitTag) || "Direct components") : "";
  const componentTag = text(serialized?.productTag) || opsEditProductFirstTag(product) || "";
  const stockTag = proposalKitTag || (opsOrderTypeKey(orderType) === "withdrawproducts" ? "Withdrawal Components" : "Request Components");
  const rawOrderId = Number(operationsValueFor(orderRow, ["id", "ID"]));
  const rawOrderNumber = Number(serialized?.orderIdNumber ?? operationsValueFor(orderRow, ["order_number", "Order Number", "Order - ID", "Order ID"]));
  const sourceOrderColumn = context.sourceOrderColumn;
  const sourceOrderNumberColumn = opsStockFindKey(keys, ["source_order_number", "Source Order Number", "order_number", "Order Number"]) || "source_order_number";
  const productTagColumn = opsStockFindKey(keys, ["product_tag", "Product Tag", "component_tag", "Component Tag"]) || "product_tag";
  const kitTagColumn = opsStockFindKey(keys, ["kit_tag", "Kit Tag", "source_kit", "Source Kit", "kit_name", "Kit Name"]) || "kit_tag";
  const orderTypeColumn = opsStockFindKey(keys, ["order_type", "Order Type"]) || "order_type";
  const receiptPhotosColumn = opsStockFindKey(keys, ["receipt_photos", "Receipt Photos", "receipt_photo", "Receipt Photo", "receipt_images", "Receipt Images", "receipt_image", "Receipt Image"]) || "receipt_photos";
  const idCodeColumn = opsStockFindKey(keys, ["id_code", "ID Code", "id code", "code", "Code"]) || "id_code";
  const customizeIdColumn = opsStockFindKey(keys, ["customize_id", "Customize ID", "custom_id", "Custom ID"]) || "customize_id";
  const row = {};
  const setExisting = (aliases, value, fallback = "") => {
    if (value === null || typeof value === "undefined" || value === "") return "";
    const key = opsStockFindKey(keys, aliases) || (!keys.length ? fallback : "");
    if (!key) return "";
    row[key] = value;
    return key;
  };
  const nameKey = setExisting(["name", "Name", "component", "Component"], productName, "name");
  const productKey = setExisting(["product_name", "Product Name", "product", "Product", "products", "Products"], productName, nameKey ? "" : "product_name");
  if (!nameKey && !productKey && !keys.length) row.name = productName;
  setExisting(["product_url", "Product URL", "url", "URL", "item_url", "Item URL"], text(serialized?.productUrl || product?.url), "product_url");
  setExisting(["unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price"], Number.isFinite(Number(serialized?.unitPrice)) ? Number(serialized.unitPrice) : null, "unit_price");
  setExisting(["tag", "Tag", "tags", "Tags"], stockTag, "tag");
  if (componentTag) row[productTagColumn] = componentTag;
  if (proposalKitTag) row[kitTagColumn] = proposalKitTag;
  if (orderType) row[orderTypeColumn] = orderType;
  setExisting(["receipt_number", "Receipt Number", "store_receipt_number", "Store Receipt Number", "receipt", "Receipt"], text(serialized?.receiptNumber), "receipt_number");
  const receiptPhotos = opsReceiptPhotosJson(serialized);
  if (receiptPhotos) row[receiptPhotosColumn] = receiptPhotos;
  if (text(product?.displayId)) row[idCodeColumn] = text(product.displayId);
  if (text(serialized?.customizeId)) row[customizeIdColumn] = text(serialized.customizeId);
  if (Number.isFinite(rawOrderId)) row[sourceOrderColumn] = Math.trunc(rawOrderId);
  if (Number.isFinite(rawOrderNumber)) row[sourceOrderNumberColumn] = Math.trunc(rawOrderNumber);
  setExisting(["team_member_name", "Team Member", "requester", "Requester", "created_by", "Created By"], text(serialized?.createdByName), "team_member_name");
  setExisting(["school", "School", "stocktaking_column", "Stocktaking Column"], school, "school");
  setExisting(["created_at", "Created at", "created_time", "Created time", "notion_created_time"], new Date().toISOString(), "");
  row[quantityColumn] = quantity;
  return {
    row,
    required: [quantityColumn, Number.isFinite(rawOrderId) ? sourceOrderColumn : "", Number.isFinite(rawOrderNumber) ? sourceOrderNumberColumn : ""].filter(Boolean),
  };
}

async function opsSyncStocktakingAfterEdit(rowsBefore = [], rowsAfter = [], context = {}) {
  if (!context?.needed) return { synced: 0, skipped: 0 };
  const oldIds = new Set((rowsBefore || []).map((row) => text(operationsValueFor(row, ["id", "ID"]))).filter(Boolean));
  const stockRowsToDelete = (context.stockRows || []).filter((row) => oldIds.has(text(row?.[context.sourceOrderColumn])));
  await mapWithConcurrency(stockRowsToDelete, 10, async (row) => {
    const id = text(row?.id ?? row?.ID);
    if (id) await deleteById(opsStockTableName(), id);
  });

  let synced = 0;
  let skipped = 0;
  for (const row of rowsAfter || []) {
    const serialized = serializeOperationsOrderDetail(row || {});
    if (!opsFinalStatus(serialized?.status) || !opsSupportedStockOrderType(serialized?.orderType)) { skipped += 1; continue; }
    const prepared = opsBuildStockRow(row, context);
    if (!prepared) { skipped += 1; continue; }
    await opsStockInsertSafe(prepared.row, prepared.required);
    synced += 1;
  }
  invalidateStocktakingReadCaches();
  await upstashDeleteOperationsKeys(["cache:api:b2b:school-stock:supabase:v1"]).catch(() => false);
  return { synced, skipped };
}


function opsHasColumn(row = {}, aliases = []) {
  const wanted = new Set((aliases || []).map(operationsAccessToken).filter(Boolean));
  return Object.keys(row || {}).some((key) => wanted.has(operationsAccessToken(key)));
}

function opsReceiptUploadInput(dataUrls = [], filenames = []) {
  const urls = (Array.isArray(dataUrls) ? dataUrls : [dataUrls]).map(text).filter(Boolean);
  const names = (Array.isArray(filenames) ? filenames : [filenames]).map(text).filter(Boolean);
  if (!urls.length) throw directOperationsMutationError("Receipt photos are required.", 400);
  return urls.map((dataUrl, index) => {
    const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match || !/^image\//i.test(String(match?.[1] || ""))) throw directOperationsMutationError("Invalid receipt photo.", 400);
    let buffer;
    try { buffer = Buffer.from(match[2], "base64"); } catch { buffer = null; }
    if (!buffer || !buffer.length) throw directOperationsMutationError("Invalid receipt photo.", 400);
    if (buffer.length > 12 * 1024 * 1024) throw directOperationsMutationError("Each receipt photo must not exceed 12 MB.", 413);
    const fallbackName = `delivery-receipt-${index + 1}.jpg`;
    const rawName = text(names[index] || names[0] || fallbackName) || fallbackName;
    const cleanName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || fallbackName;
    const extMatch = cleanName.match(/\.([a-zA-Z0-9]+)$/);
    const safeExt = text(extMatch?.[1]).toLowerCase() || (/png/i.test(match[1]) ? "png" : /webp/i.test(match[1]) ? "webp" : "jpg");
    return { buffer, contentType: text(match[1]) || "image/jpeg", cleanName, safeExt };
  });
}

function opsReceiptStoragePath(file = {}, index = 0) {
  return `delivery-receipts/${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 10)}.${text(file?.safeExt) || "jpg"}`;
}

export async function markOperationsArrived({
  account,
  orderIds = [],
  orderReceiptDataUrls = [],
  orderReceiptFilenames = [],
  receiptNumbers = [],
} = {}) {
  const loaded = await loadOperationRowsByIds(orderIds);
  if (!loaded) return null;
  if (loaded.clean.some((id) => !loaded.byId.has(id))) throw directOperationsMutationError("Orders not found", 404);

  const uploadInputs = opsReceiptUploadInput(orderReceiptDataUrls, orderReceiptFilenames);
  const receiptText = mergeReceiptNumbers("", receiptNumbers);
  const firstRow = loaded.rows[0] || {};
  if (!opsHasColumn(firstRow, ["status", "Status"])) return null;
  if (!opsHasColumn(firstRow, ["order_receipt", "Order Receipt", "delivery_receipt", "Delivery Receipt", "receipt_photos", "Receipt Photos"])) return null;
  if (receiptText && !opsHasColumn(firstRow, ["receipt_number", "Receipt Number", "Store Receipt Number"])) return null;

  const plannedRows = loaded.rows.map((row) => ({ ...row, status: "Arrived" }));
  const needsStocktaking = plannedRows.some((row) => {
    const serialized = serializeOperationsOrderDetail(row || {});
    return opsSupportedStockOrderType(serialized?.orderType);
  });
  let products = [];
  let stockContext = { needed: false };
  if (needsStocktaking) {
    const catalog = await getProductsCatalog({ fresh: true });
    products = Array.isArray(catalog?.products) ? catalog.products : [];
    stockContext = await opsPrepareStockContext(plannedRows, loaded.rows, products);
    if (!stockContext) return null;
  }

  const cfg = getSupabaseConfig();
  if (!text(cfg?.storageBucket)) return null;

  let mutationStarted = false;
  try {
    const receiptEntries = [];
    for (let index = 0; index < uploadInputs.length; index += 1) {
      const file = uploadInputs[index];
      const uploaded = await uploadStorageObject(opsReceiptStoragePath(file, index), file.buffer, {
        contentType: file.contentType,
        bucketName: cfg.storageBucket,
        upsert: false,
      });
      if (!uploaded?.publicUrl) throw new Error("Supabase Storage did not return a public receipt URL.");
      mutationStarted = true;
      receiptEntries.push({ name: file.cleanName, url: uploaded.publicUrl });
    }

    const receiptJson = JSON.stringify(receiptEntries);
    const updatedRows = await mapWithConcurrency(loaded.clean, 10, async (id) => {
      const before = loaded.byId.get(id) || {};
      const patch = { status: "Arrived", order_receipt: receiptJson };
      if (receiptText) patch.receipt_number = mergeReceiptNumbers(operationsValueFor(before, ["receipt_number", "Receipt Number", "Store Receipt Number"]), receiptText);
      const updated = await updateById(tableName(), id, patch);
      mutationStarted = true;
      return updated || { ...before, ...patch };
    });

    let stock = { synced: 0, skipped: 0 };
    if (stockContext?.needed) stock = await opsSyncStocktakingAfterEdit(loaded.rows, updatedRows, stockContext);

    await invalidateLegacyOperationsCaches(account || {});
    return {
      success: true,
      status: "Arrived",
      statusColor: "green",
      orderReceiptNames: receiptEntries.map((entry) => entry.name),
      orderReceiptName: receiptEntries[0]?.name || null,
      orderReceiptUrls: receiptEntries.map((entry) => entry.url),
      orderReceiptUrl: receiptEntries[0]?.url || null,
      maintenanceReceiptNames: receiptEntries.map((entry) => entry.name),
      maintenanceReceiptName: receiptEntries[0]?.name || null,
      maintenanceReceiptUrls: receiptEntries.map((entry) => entry.url),
      maintenanceReceiptUrl: receiptEntries[0]?.url || null,
      receiptNumber: receiptText || null,
      stocktakingSyncedCount: Number(stock?.synced || 0),
      stocktakingSkippedCount: Number(stock?.skipped || 0),
      source: "supabase-direct",
    };
  } catch (error) {
    if (error?.code === "DIRECT_OPERATIONS_MUTATION_FAILED" && error?.noFallback) throw error;
    if (mutationStarted) {
      throw directOperationsCommittedError(
        error?.message || "Delivery was partially saved and requires review.",
        Number(error?.status) || 500,
        error,
      );
    }
    throw error;
  }
}

export async function saveOperationsEditDetails({
  account,
  orderIds = [],
  adminPassword = "",
  itemUpdates = [],
  quantities = null,
  unsupportedReceiptEdit = false,
} = {}) {
  if (unsupportedReceiptEdit) return null;
  const loaded = await loadOperationRowsByIds(orderIds);
  if (!loaded) return null;
  if (loaded.clean.some((id) => !loaded.byId.has(id))) throw directOperationsMutationError("Orders not found", 404);

  const passwordOk = await directOperationsAdminPasswordResult(account || {}, adminPassword);
  if (passwordOk === null) return null;
  if (!passwordOk) throw directOperationsMutationError("Invalid admin password", 401);

  const updates = (Array.isArray(itemUpdates) ? itemUpdates : []).filter((entry) => entry && typeof entry === "object");
  const updatesById = new Map();
  for (const entry of updates) {
    const id = text(entry?.id || entry?.orderId || entry?.order_id);
    if (!id) continue;
    if (!updatesById.has(id)) updatesById.set(id, []);
    updatesById.get(id).push(entry);
  }
  if (!updatesById.size && !(quantities && typeof quantities === "object")) {
    throw directOperationsMutationError("No Operations order changes were provided.", 400);
  }

  const catalog = await getProductsCatalog({ fresh: true });
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const productMap = new Map(products.map((product) => [text(product?.id), product]).filter(([id]) => id));
  const quantityMap = quantities && typeof quantities === "object" && !Array.isArray(quantities) ? quantities : {};
  const plans = [];

  for (const id of loaded.clean) {
    const beforeRow = loaded.byId.get(id) || null;
    if (!beforeRow) continue;
    const updatesForId = updatesById.get(id) || [];
    const sourceSpecific = updatesForId.filter((entry) => entry?.sourceSpecific === true || Number(entry?.sourceCount || 0) > 1);
    const splitRows = sourceSpecific.length ? opsEditSplitOrderRow(beforeRow) : null;
    if (splitRows && splitRows.length > 1) {
      const byIndex = new Map();
      const bySourceId = new Map();
      const bySourceName = new Map();
      sourceSpecific.forEach((entry) => {
        const index = Number(entry?.sourceIndex);
        if (Number.isInteger(index) && index >= 0) byIndex.set(index, entry);
        const sourceId = text(entry?.sourceKitId);
        if (sourceId) bySourceId.set(sourceId, entry);
        const sourceName = operationsAccessToken(entry?.sourceKitName);
        if (sourceName) bySourceName.set(sourceName, entry);
      });
      const quantityOverride = Object.prototype.hasOwnProperty.call(quantityMap, id) ? Number(quantityMap[id]) : null;
      if (quantityOverride !== null && !Number.isFinite(quantityOverride)) throw directOperationsMutationError("Quantity received must be a valid number.", 400);
      const quantityParts = quantityOverride === null ? null : opsEditSplitQtyBySources(quantityOverride, splitRows.map((entry) => entry.source));
      const materialized = splitRows.map((entry, sourceIndex) => {
        const source = entry.source || {};
        const update = bySourceId.get(text(source?.kitId)) || byIndex.get(sourceIndex) || bySourceName.get(operationsAccessToken(source?.kitName)) || null;
        const patch = opsEditBuildItemPatch(entry.row, update, productMap, source);
        if (quantityParts) Object.assign(patch, opsEditApplyQuantityMapPatch(entry.row, quantityParts[sourceIndex] ?? 0));
        const finalRow = { ...entry.row, ...patch };
        return {
          finalRow,
          updatePatch: {
            quantity_requested: entry.row.quantity_requested,
            quantity_progress: entry.row.quantity_progress,
            quantity_edited_by_supervisor: entry.row.quantity_edited_by_supervisor,
            quantity_received_by_operations: entry.row.quantity_received_by_operations,
            quantity_remaining: entry.row.quantity_remaining,
            kit_tag: entry.row.kit_tag,
            source_kits: entry.row.source_kits,
            ...patch,
          },
        };
      });
      plans.push({ id, beforeRow, split: true, materialized });
      continue;
    }
    const update = updatesForId[updatesForId.length - 1] || null;
    const patch = opsEditBuildItemPatch(beforeRow, update, productMap);
    if (Object.prototype.hasOwnProperty.call(quantityMap, id)) Object.assign(patch, opsEditApplyQuantityMapPatch(beforeRow, quantityMap[id]));
    plans.push({ id, beforeRow, split: false, patch, finalRow: { ...beforeRow, ...patch } });
  }

  const plannedFinalRows = plans.flatMap((plan) => plan.split ? plan.materialized.map((entry) => entry.finalRow) : [plan.finalRow]);
  const stockContext = await opsPrepareStockContext(plannedFinalRows, loaded.rows, products);
  if (stockContext === null) return null;

  let mutationStarted = false;
  const updatedRows = [];
  try {
    for (const plan of plans) {
      if (plan.split) {
        const insertedRows = [];
        try {
          for (let index = 1; index < plan.materialized.length; index += 1) {
            mutationStarted = true;
            const insertRow = opsEditCloneOrderInsertRow(plan.materialized[index].finalRow);
            const inserted = await opsEditInsertOrderSafe(insertRow, Object.prototype.hasOwnProperty.call(insertRow, "customize_id") ? ["customize_id"] : []);
            insertedRows.push(inserted);
          }
          mutationStarted = true;
          const firstPatch = plan.materialized[0].updatePatch;
          const firstUpdated = await opsEditUpdateOrderSafe(plan.id, firstPatch, Object.prototype.hasOwnProperty.call(firstPatch, "customize_id") ? ["customize_id"] : []);
          updatedRows.push(firstUpdated, ...insertedRows);
        } catch (error) {
          for (const insertedRow of insertedRows) {
            const insertedId = text(insertedRow?.id ?? insertedRow?.ID);
            if (insertedId) await deleteById(tableName(), insertedId).catch(() => {});
          }
          throw error;
        }
        continue;
      }
      if (!Object.keys(plan.patch || {}).length) {
        updatedRows.push(plan.beforeRow);
        continue;
      }
      mutationStarted = true;
      updatedRows.push(await opsEditUpdateOrderSafe(plan.id, plan.patch, Object.prototype.hasOwnProperty.call(plan.patch, "customize_id") ? ["customize_id"] : []));
    }

    const stock = await opsSyncStocktakingAfterEdit(loaded.rows, updatedRows, stockContext || { needed: false });
    await invalidateLegacyOperationsCaches(account).catch(() => {});
    const responseIds = updatedRows.map((row) => text(row?.id ?? row?.ID)).filter(Boolean);
    const fresh = responseIds.length ? await loadOperationRowsByIds(responseIds).catch(() => null) : null;
    const responseRows = fresh?.rows?.length ? fresh.rows : updatedRows;
    return {
      success: true,
      items: responseRows.map((row) => serializeOperationsOrderDetail(row)),
      stocktakingSyncedCount: Number(stock?.synced || 0),
      stocktakingSkippedCount: Number(stock?.skipped || 0),
      source: "supabase-direct",
    };
  } catch (error) {
    if (error?.code === "DIRECT_OPERATIONS_MUTATION_FAILED" && error?.noFallback) throw error;
    if (mutationStarted) throw directOperationsCommittedError(error?.message || "Order details were partially updated and require review.", Number(error?.status) || 500, error);
    throw error;
  }
}

