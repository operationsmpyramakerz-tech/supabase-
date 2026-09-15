import "server-only";
import { isSupabaseConfigured, select } from "./supabase-rest";
import { enrichOrderDetailGrouping, loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";

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
  "actual_issue_description",
  "repair_action",
  "resolution_method",
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

function serializeSummary(row = {}) {
  const id = text(row.id ?? row.ID);
  const orderNumber = num(row.order_number ?? row["Order - ID"] ?? row["Order ID"]);
  const quantityProgress = num(row.quantity_progress ?? row["Quantity Progress"] ?? row.quantity ?? row.Quantity ?? row.qty ?? row.Qty);
  const quantityRequested = num(row.quantity_requested ?? row["Quantity Requested"] ?? row.requested_quantity ?? row["Requested Quantity"]);
  const quantityEditedBySupervisor = num(row.quantity_edited_by_supervisor ?? row["Quantity Edited by supervisor"] ?? row["Quantity Edited by Supervisor"] ?? row.quantity_edited ?? row.edited_quantity);
  const originalBase = roundQty(quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0));
  const base = roundQty(quantityEditedBySupervisor !== null ? quantityEditedBySupervisor : originalBase);
  const receivedRaw = num(row.quantity_received_by_operations ?? row["Quantity Received by operations"] ?? row["Quantity Received by Operations"] ?? row.received_quantity ?? row.quantity_received);
  const remainingRaw = num(row.quantity_remaining ?? row["Quantity Remaining"] ?? row.remaining_quantity);
  const status = text(row.status ?? row.Status) || "Pending";
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

  const orderType = text(row.order_type ?? row["Order Type"]) || null;
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
    svApproval: text(row.sv_approval ?? row["S.V Approval"] ?? row["SV Approval"]) || null,
    summaryOnly: true,
    source: "supabase",
  };
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
  const stage = Math.max(1, ...items.map((item) => statusIndex(item?.status)));
  const hasRemaining = items.some((item) => Math.abs(Number(item?.quantityRemaining ?? item?.quantity_remaining ?? 0) || 0) > 1e-9);
  const hasReceived = items.some((item) => Math.abs(Number(item?.quantityReceived ?? item?.quantity_received_by_operations ?? 0) || 0) > 1e-9);
  const rawType = text(items?.[0]?.orderType ?? items?.[0]?.order_type);
  const maintenance = orderTypeKey(rawType) === "requestmaintenance";
  return { stage, hasRemaining, hasReceived, maintenance };
}

function groupMatchesTab(items = [], tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
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
  ]).map((value) => norm(value)).join(" ");
}

function filterText(value) {
  return String(value ?? "").trim().replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
}

function searchLogic(query = "") {
  const clean = filterText(query);
  if (!clean) return null;
  const numeric = clean.match(/^(?:ord[-\s]*)?(\d+)$/i);
  if (numeric) return { orderNumber: Number(numeric[1]), clauses: null };
  return {
    orderNumber: null,
    clauses: [
      `reason.ilike.*${clean}*`,
      `team_member_name.ilike.*${clean}*`,
      `product_name.ilike.*${clean}*`,
      `issue_description.ilike.*${clean}*`,
      `actual_issue_description.ilike.*${clean}*`,
      `repair_action.ilike.*${clean}*`,
      `resolution_method.ilike.*${clean}*`,
      `person_received_by_operations.ilike.*${clean}*`,
      `receipt_number.ilike.*${clean}*`,
      `rejected_reason.ilike.*${clean}*`,
    ],
  };
}

function statusLogic(tab = "all") {
  const cleanTab = String(tab || "all").trim().toLowerCase();
  if (cleanTab === "archive") return ["status.ilike.*archive*"];
  if (cleanTab === "delivered") return ["status.ilike.*arrived*", "status.ilike.*delivered*", "status.ilike.*received*"];
  if (cleanTab === "remaining" || cleanTab === "received") {
    return ["status.ilike.*shipped*", "status.ilike.*shipping*", "status.ilike.*prepared*", "status.ilike.*delivering*"];
  }
  if (cleanTab === "approved" || cleanTab === "rejected") return ["status.ilike.*progress*", "status.ilike.*approved*"];
  return null;
}

function logicalParams({ query = "", tab = "all", type = "all" } = {}) {
  const params = {};
  const logicGroups = [];
  const search = searchLogic(query);
  if (Number.isFinite(search?.orderNumber)) params.order_number = `eq.${search.orderNumber}`;
  else if (search?.clauses?.length) logicGroups.push(search.clauses);

  const statusClauses = statusLogic(tab);
  if (statusClauses?.length) logicGroups.push(statusClauses);

  const typeLabel = orderTypeLabel(type);
  if (typeLabel) params.order_type = `ilike.*${typeLabel.replace(/[*%]/g, "")}*`;

  if (logicGroups.length === 1) params.or = `(${logicGroups[0].join(",")})`;
  else if (logicGroups.length > 1) params.and = `(${logicGroups.map((clauses) => `or(${clauses.join(",")})`).join(",")})`;
  return params;
}

async function candidateNumbers({ cursor = null, scanGroups = 90, filters = {} } = {}) {
  const wanted = Math.max(20, Math.min(240, Number(scanGroups) || 90));
  const unique = [];
  const seen = new Set();
  let offset = 0;
  let exhausted = false;
  const rowChunk = 1000;
  const base = { ...(filters || {}) };
  const directNumber = String(base.order_number || "").startsWith("eq.")
    ? Number(String(base.order_number).slice(3))
    : null;

  while (unique.length < wanted + 1 && !exhausted && offset < 12000) {
    const params = {
      select: "order_number",
      order: "order_number.desc",
      limit: String(rowChunk),
      offset: String(offset),
      ...base,
    };
    if (!Number.isFinite(directNumber)) {
      const parsedCursor = pageCursor(cursor);
      if (parsedCursor !== null) params.order_number = `lt.${parsedCursor}`;
      else if (!params.order_number) params.order_number = "not.is.null";
    }
    const rows = await select(tableName(), params);
    const chunk = Array.isArray(rows) ? rows : [];
    for (const row of chunk) {
      const orderNumber = num(row?.order_number);
      if (!Number.isFinite(orderNumber) || seen.has(orderNumber)) continue;
      seen.add(orderNumber);
      unique.push(orderNumber);
      if (unique.length >= wanted + 1) break;
    }
    if (chunk.length < rowChunk || Number.isFinite(directNumber)) exhausted = true;
    else offset += chunk.length;
  }

  return {
    numbers: unique.slice(0, wanted),
    hasMore: unique.length > wanted || !exhausted,
  };
}

async function rowsByNumbers(numbers = []) {
  const clean = [...new Set(numbers.map(Number).filter(Number.isFinite))];
  if (!clean.length) return [];
  const out = [];
  for (let index = 0; index < clean.length; index += 24) {
    const batch = clean.slice(index, index + 24);
    const baseParams = {
      order_number: `in.(${batch.join(",")})`,
      order: "order_number.desc,notion_created_time.desc,id.desc",
      limit: "5000",
    };
    try {
      const rows = await select(tableName(), { ...baseParams, select: SUMMARY_SELECT });
      if (Array.isArray(rows)) out.push(...rows);
    } catch {
      const rows = await select(tableName(), { ...baseParams, select: "*" });
      if (Array.isArray(rows)) out.push(...rows);
    }
  }
  return out;
}

function groupRows(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const item = serializeSummary(row);
    const orderNumber = Number(item.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  return groups;
}

export async function loadOperationsOrdersPage({
  tab = "all",
  type = "all",
  query = "",
  cursor = null,
  limit = PAGE_LIMIT,
} = {}) {
  if (!isSupabaseConfigured()) return null;
  const safeLimit = pageLimit(limit);
  const outputGroups = [];
  let nextCursor = pageCursor(cursor);
  let hasMore = true;
  let loops = 0;

  while (outputGroups.length < safeLimit && hasMore && loops < 12) {
    loops += 1;
    const filters = logicalParams({ query, tab, type });
    let candidates;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 60),
        filters,
      });
    } catch {
      // Older/custom schemas can reject one of the projected filter columns.
      // Keep the optimized order-number paging and apply the exact filters in
      // JavaScript rather than falling all the way back to a full-table scan.
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 60),
        filters: {},
      });
    }
    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const rows = await rowsByNumbers(candidates.numbers);
    const groups = groupRows(rows);
    const cleanType = orderTypeKey(type);
    const directSearch = searchLogic(query);
    const needle = Number.isFinite(directSearch?.orderNumber) ? "" : norm(query);
    let processedCandidates = 0;

    for (const orderNumber of candidates.numbers) {
      processedCandidates += 1;
      nextCursor = orderNumber;
      const items = groups.get(orderNumber) || [];
      if (!items.length || !groupMatchesTab(items, tab)) continue;
      if (cleanType && cleanType !== "all" && orderTypeKey(items[0]?.orderType || "") !== cleanType) continue;
      if (needle && !groupSearchText(items).includes(needle)) continue;
      outputGroups.push({ orderNumber, items: rowsForTab(items, tab) });
      if (outputGroups.length >= safeLimit) break;
    }

    // There can still be unconsumed groups inside the current candidate window
    // even when Supabase itself has no rows beyond that window.
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

export async function loadOperationsOrdersInitialPage({ limit = PAGE_LIMIT } = {}) {
  return await loadOperationsOrdersPage({ tab: "all", type: "all", query: "", cursor: null, limit });
}
export async function loadOperationsOrderDetails(orderIds = []) {
  if (!isSupabaseConfigured()) return null;
  const rows = await loadRawOrderRowsByIds(orderIds);
  const serialized = rows.map(serializeOperationsOrderDetail);
  return await enrichOrderDetailGrouping(serialized);
}

