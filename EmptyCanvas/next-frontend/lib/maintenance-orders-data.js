import "server-only";

import { isSupabaseConfigured, select } from "./supabase-rest";
import { loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";

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

function isMaintenanceOrder(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function statusIndex(value) {
  const status = norm(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received|done|complete)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(status)) return 2;
  return 1;
}

function hasMaintenanceLog(item = {}) {
  return Boolean(
    text(item?.serialNumber) ||
    text(item?.resolutionMethod) ||
    text(item?.actualIssueDescription) ||
    text(item?.repairAction) ||
    (Array.isArray(item?.sparePartsReplacedEntries) && item.sparePartsReplacedEntries.length) ||
    (Array.isArray(item?.sparePartsNeededEntries) && item.sparePartsNeededEntries.length) ||
    (Array.isArray(item?.maintenanceChecklist) && item.maintenanceChecklist.length)
  );
}

function maintenanceState(items = []) {
  const stage = Math.max(1, ...items.map((item) => statusIndex(item?.status)));
  const logged = items.some(hasMaintenanceLog);
  if (stage >= 5) return "archive";
  if (stage >= 4) return "done";
  if (logged) return "in-progress";
  return "not-started";
}

function groupMatchesTab(items = [], tab = "all") {
  const state = maintenanceState(items);
  if (state === "archive") return false;
  const clean = String(tab || "all").trim().toLowerCase();
  return clean === "all" || clean === state;
}

function groupSearchText(items = []) {
  return items.flatMap((item) => [
    item?.orderId,
    item?.orderIdNumber,
    item?.reason,
    item?.createdByName,
    item?.operationsByName,
    item?.productName,
    item?.issueDescription,
    item?.serialNumber,
    item?.actualIssueDescription,
    item?.repairAction,
    item?.resolutionMethod,
    item?.receiptNumber,
    item?.sparePartsReplacedName,
    ...(Array.isArray(item?.sparePartsReplacedNames) ? item.sparePartsReplacedNames : []),
    item?.sparePartsNeededName,
    ...(Array.isArray(item?.sparePartsNeededNames) ? item.sparePartsNeededNames : []),
    ...(Array.isArray(item?.maintenanceChecklist) ? item.maintenanceChecklist : []),
  ]).map((value) => norm(value)).join(" ");
}

function searchLogic(query = "") {
  const clean = safeFilterText(query);
  if (!clean) return null;
  const numeric = clean.match(/^(?:ord[-\s]*)?(\d+)$/i);
  if (numeric) return { orderNumber: Number(numeric[1]), clauses: null };
  return {
    orderNumber: null,
    clauses: [
      `reason.ilike.*${clean}*`,
      `team_member_name.ilike.*${clean}*`,
      `person_received_by_operations.ilike.*${clean}*`,
      `product_name.ilike.*${clean}*`,
      `issue_description.ilike.*${clean}*`,
      `serial_number.ilike.*${clean}*`,
      `actual_issue_description.ilike.*${clean}*`,
      `repair_action.ilike.*${clean}*`,
      `resolution_method.ilike.*${clean}*`,
      `spare_parts_replaced.ilike.*${clean}*`,
      `receipt_number.ilike.*${clean}*`,
    ],
  };
}

function candidateFilters(query = "") {
  const params = { order_type: "ilike.*Request Maintenance*" };
  const search = searchLogic(query);
  if (Number.isFinite(search?.orderNumber)) params.order_number = `eq.${search.orderNumber}`;
  else if (search?.clauses?.length) params.or = `(${search.clauses.join(",")})`;
  return params;
}

function serializeMaintenanceSummaryRow(row = {}) {
  return {
    ...serializeOperationsOrderDetail(row),
    summaryOnly: true,
    source: "supabase",
  };
}

async function candidateNumbers({ cursor = null, scanGroups = 108, filters = {} } = {}) {
  const wanted = Math.max(24, Math.min(300, Number(scanGroups) || 108));
  const unique = [];
  const seen = new Set();
  let offset = 0;
  let exhausted = false;
  const rowChunk = 1000;
  const base = { ...(filters || {}) };
  const directNumber = String(base.order_number || "").startsWith("eq.")
    ? Number(String(base.order_number).slice(3))
    : null;

  while (unique.length < wanted + 1 && !exhausted && offset < 20000) {
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

  for (let index = 0; index < clean.length; index += 24) {
    const batch = clean.slice(index, index + 24);
    let offset = 0;
    let useProjection = true;

    while (offset < 50000) {
      const baseParams = {
        order_number: `in.(${batch.join(",")})`,
        order_type: "ilike.*Request Maintenance*",
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
    const item = serializeMaintenanceSummaryRow(row);
    if (!isMaintenanceOrder(item?.orderType)) continue;
    const orderNumber = Number(item?.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  return groups;
}

export async function loadMaintenanceOrdersPage({
  tab = "all",
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

  while (outputGroups.length < safeLimit && hasMore && loops < 20) {
    loops += 1;
    let candidates;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 3, 108),
        filters: candidateFilters(query),
      });
    } catch {
      // Older/custom schemas may reject one of the searchable maintenance
      // columns. Keep direct pagination and apply the search after loading the
      // summary rows instead of dropping back to the entire Legacy bootstrap.
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 3, 108),
        filters: { order_type: "ilike.*Request Maintenance*" },
      });
    }

    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const rows = await rowsByNumbers(candidates.numbers);
    const groups = groupRows(rows);
    const directSearch = searchLogic(query);
    const needle = Number.isFinite(directSearch?.orderNumber) ? "" : norm(query);
    let processedCandidates = 0;

    for (const orderNumber of candidates.numbers) {
      processedCandidates += 1;
      nextCursor = orderNumber;
      const items = groups.get(orderNumber) || [];
      if (!items.length || !groupMatchesTab(items, tab)) continue;
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

export async function loadMaintenanceOrdersInitialPage({ limit = PAGE_LIMIT } = {}) {
  return await loadMaintenanceOrdersPage({ tab: "all", query: "", cursor: null, limit });
}

export async function loadMaintenanceOrderDetails({ orderIds = [] } = {}) {
  if (!isSupabaseConfigured()) return null;
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .slice(0, 500);
  if (!ids.length) return [];

  const rows = await loadRawOrderRowsByIds(ids);
  const maintenanceRows = (Array.isArray(rows) ? rows : []).filter((row) => {
    const item = serializeOperationsOrderDetail(row);
    return isMaintenanceOrder(item?.orderType);
  });

  const visibleIds = new Set(maintenanceRows.map((row) => text(row?.id)).filter(Boolean));
  if (ids.some((id) => !visibleIds.has(id))) {
    const error = new Error("One or more maintenance order components are not available.");
    error.status = 404;
    throw error;
  }

  return maintenanceRows.map(serializeOperationsOrderDetail);
}
