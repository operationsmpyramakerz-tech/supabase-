import "server-only";
import { isSupabaseConfigured, select, selectAll, updateById, updateByIds } from "./supabase-rest";
import { enrichOrderDetailGrouping, loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";
import { getProductsCatalog } from "./products-service";

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
  const rowChunk = 1000;

  // Supabase/PostgREST can enforce a server-side max-row cap (commonly 1000)
  // even when a larger `limit` is requested. Orders are component rows, so a
  // page of a few Order groups can easily exceed that cap. Always paginate the
  // rows inside each order-number batch until every component row is loaded.
  for (let index = 0; index < clean.length; index += 24) {
    const batch = clean.slice(index, index + 24);
    let offset = 0;
    let useProjection = true;

    while (offset < 50000) {
      const baseParams = {
        order_number: `in.(${batch.join(",")})`,
        order: "order_number.desc,notion_created_time.desc,id.desc",
        limit: String(rowChunk),
        offset: String(offset),
      };
      let rows;
      if (useProjection) {
        try {
          rows = await select(tableName(), { ...baseParams, select: SUMMARY_SELECT });
        } catch {
          useProjection = false;
          rows = await select(tableName(), { ...baseParams, select: "*" });
        }
      } else {
        rows = await select(tableName(), { ...baseParams, select: "*" });
      }

      const chunk = Array.isArray(rows) ? rows : [];
      out.push(...chunk);
      if (chunk.length < rowChunk) break;
      offset += chunk.length;
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

