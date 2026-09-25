import "server-only";
import { performance } from "node:perf_hooks";

import { deleteByIds, isSupabaseConfigured, select, updateById, updateByIds } from "./supabase-rest";
import { loadRawOrderRowsByIds, serializeOperationsOrderDetail } from "./order-details-data";
import { consumeOrderSummaryWindows, loadOrderRowsByNumbers, scanOrderNumberCandidates } from "./order-pagination";
import { applyOrderSearchPlan, canUseOrderSearchText, createOrderSearchPlan, noteOrderSearchTextError } from "./order-search-hotpath";
import { canUseOrderCandidateRpc, loadOrderCandidateNumbersRpc, noteOrderCandidateRpcError } from "./order-candidate-rpc";
import { measurePerformance, recordPerformanceSample } from "./performance-profiler";
import { getProductsCatalog } from "./products-service";
import { invalidateLegacyOperationsCaches, markOperationsArrived } from "./operations-orders-data";
import { directPageMutationAccess, verifyPageAdminPasswordDirect } from "./order-action-auth";
import { listMaintenanceChecklistItems } from "./maintenance-checklist-data";

const PAGE_LIMIT = 36;
const PAGE_MAX = 80;
const SUMMARY_BASE_SELECT = [
  "id",
  "reason",
  "order_number",
  "order_type",
  "notion_created_time",
  "status",
  "serial_number",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "spare_parts_replaced",
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
  if (item?.maintenanceLogged === true) return true;
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
    item?._summarySearchText,
  ]).map((value) => norm(value)).join(" ");
}

const SEARCH_COLUMNS = [
  "reason",
  "team_member_name",
  "person_received_by_operations",
  "product_name",
  "issue_description",
  "serial_number",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "spare_parts_replaced",
  "receipt_number",
];

function searchLogic(query = "") {
  return createOrderSearchPlan(query, SEARCH_COLUMNS);
}

function candidateFilters(query = "", searchMode = "fast") {
  const params = { order_type: "ilike.*Request Maintenance*" };
  const logicGroups = [];
  applyOrderSearchPlan({ params, logicGroups, plan: searchLogic(query), mode: searchMode });
  if (logicGroups.length) params.or = `(${logicGroups[0].join(",")})`;
  return params;
}

function serializeMaintenanceSummaryRow(row = {}, { includeSearchText = false } = {}) {
  const id = text(row.id ?? row.ID);
  const orderNumber = num(row.order_number ?? row["Order - ID"] ?? row["Order ID"]);
  const createdByName = text(row.team_member_name ?? row["Teams Members"] ?? row.teams_members);
  const createdById = text(row.team_member_id ?? row["Team Member ID"]) || createdByName;
  const maintenanceLogged = [
    row.serial_number,
    row.actual_issue_description,
    row.repair_action,
    row.resolution_method,
    row.spare_parts_replaced,
  ].some((value) => Boolean(text(value)));
  const item = {
    id,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(row.reason ?? row.Reason) || "No Reason",
    status: text(row.status ?? row.Status) || "Pending",
    orderType: text(row.order_type ?? row["Order Type"]) || "Request Maintenance",
    createdTime: dateValue(row.notion_created_time ?? row.created_time ?? row.created_at ?? row["Created time"]) || new Date().toISOString(),
    createdById,
    createdByName,
    maintenanceLogged,
    summaryOnly: true,
    source: "supabase",
  };
  if (includeSearchText) {
    item._summarySearchText = [
      row.reason,
      row.team_member_name,
      row.person_received_by_operations,
      row.product_name,
      row.issue_description,
      row.serial_number,
      row.actual_issue_description,
      row.repair_action,
      row.resolution_method,
      row.spare_parts_replaced,
      row.receipt_number,
    ].map(text).filter(Boolean).join(" ");
  }
  return item;
}

async function candidateNumbers({ cursor = null, scanGroups = 108, filters = {}, searchMode = "", rpcOptions = null, signal = null } = {}) {
  const suffix = searchMode ? `.search-${searchMode}` : "";
  if (rpcOptions && canUseOrderCandidateRpc()) {
    try {
      return await loadOrderCandidateNumbersRpc({
        ...rpcOptions,
        cursor,
        wanted: scanGroups,
        profileName: `orders.maintenance${suffix}.candidates-rpc`,
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
    minWanted: 24,
    maxWanted: 300,
    rowChunk: 1000,
    maxScannedRows: 20000,
    filters,
    queryProfileName: `orders.maintenance${suffix}.candidates`,
    scanProfileName: `orders.maintenance${suffix}.candidate-scan`,
    signal,
  });
}

async function rowsByNumbers(numbers = [], signal = null, includeLocalSearchFields = false) {
  return await loadOrderRowsByNumbers({
    table: tableName(),
    numbers,
    selectExpr: includeLocalSearchFields ? SUMMARY_SEARCH_SELECT : SUMMARY_SELECT,
    extraParams: { order_type: "ilike.*Request Maintenance*" },
    queryProfileName: "orders.maintenance.summary",
    fallbackProfileName: "orders.maintenance.summary-fallback",
    loadProfileName: "orders.maintenance.summary-load",
    signal,
  });
}

function groupRows(rows = [], includeLocalSearchFields = false) {
  const startedAt = performance.now();
  const groups = new Map();
  for (const row of rows) {
    if (!isMaintenanceOrder(row?.order_type ?? row?.["Order Type"])) continue;
    const item = serializeMaintenanceSummaryRow(row, { includeSearchText: includeLocalSearchFields });
    const orderNumber = Number(item?.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  recordPerformanceSample({
    category: "orders-summary",
    name: "orders.maintenance.summary-transform",
    durationMs: performance.now() - startedAt,
    meta: { rows: rows.length, groups: groups.size, localSearch: includeLocalSearchFields },
  });
  return groups;
}

export async function loadMaintenanceOrdersPage({
  tab = "all",
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

  while (outputGroups.length < safeLimit && hasMore && loops < 20) {
    loops += 1;
    const searchPlan = searchLogic(query);
    const hasTextSearch = Boolean(searchPlan?.clean && !Number.isFinite(searchPlan?.orderNumber));
    const fastSearch = hasTextSearch && canUseOrderSearchText();
    let candidates;
    let localSearchFallback = false;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 3, 108),
        filters: candidateFilters(query, fastSearch ? "fast" : "legacy"),
        searchMode: hasTextSearch ? (fastSearch ? "fast" : "legacy") : "",
        rpcOptions: !searchPlan ? { context: "maintenance" } : null,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      if (fastSearch && noteOrderSearchTextError(error)) {
        try {
          candidates = await candidateNumbers({
            cursor: nextCursor,
            scanGroups: Math.max(safeLimit * 3, 108),
            filters: candidateFilters(query, "legacy"),
            searchMode: "legacy",
            signal,
          });
        } catch (fallbackError) {
          if (signal?.aborted || fallbackError?.code === "REQUEST_ABORTED" || fallbackError?.name === "AbortError") throw fallbackError;
          candidates = null;
        }
      }
      if (!candidates) {
        // Older/custom schemas may reject one of the searchable maintenance
        // columns. Keep direct pagination and apply the search after loading the
        // summary rows instead of dropping back to the entire Legacy bootstrap.
        localSearchFallback = hasTextSearch;
        candidates = await candidateNumbers({
          cursor: nextCursor,
          scanGroups: Math.max(safeLimit * 3, 108),
          filters: { order_type: "ilike.*Request Maintenance*" },
          searchMode: hasTextSearch ? "local" : "",
          signal,
        });
      }
    }

    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const directSearch = searchLogic(query);
    const needle = localSearchFallback && !Number.isFinite(directSearch?.orderNumber) ? norm(directSearch?.clean || query) : "";
    const windowResult = await consumeOrderSummaryWindows({
      numbers: candidates.numbers,
      remainingGroups: safeLimit - outputGroups.length,
      loadRows: (numbers, loadSignal) => rowsByNumbers(numbers, loadSignal, localSearchFallback),
      profileName: "orders.maintenance.summary-window",
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

export async function loadMaintenanceOrdersInitialPage({ limit = PAGE_LIMIT } = {}) {
  return await measurePerformance("page-data", "orders.maintenance.initial", async () =>
    await loadMaintenanceOrdersPage({ tab: "all", query: "", cursor: null, limit }),
  );
}

async function enrichMaintenanceDetailProducts(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return rows;

  let products = [];
  try {
    const catalog = await getProductsCatalog();
    products = Array.isArray(catalog?.products) ? catalog.products : [];
  } catch {}
  if (!products.length) return rows;

  const byId = new Map();
  const byName = new Map();
  const byUrl = new Map();
  for (const product of products) {
    const id = text(product?.id);
    const nameKey = norm(product?.name);
    const urlKey = norm(product?.url);
    if (id && !byId.has(id)) byId.set(id, product);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
    if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, product);
  }

  const findProduct = ({ id, name, url } = {}) => {
    const cleanId = text(id);
    if (cleanId && byId.has(cleanId)) return byId.get(cleanId);
    const cleanUrl = norm(url);
    if (cleanUrl && byUrl.has(cleanUrl)) return byUrl.get(cleanUrl);
    const cleanName = norm(name);
    return cleanName ? (byName.get(cleanName) || null) : null;
  };

  const enrichSpareEntries = (entries = []) => (Array.isArray(entries) ? entries : []).map((entry) => {
    const product = findProduct({ id: entry?.id, name: entry?.name, url: entry?.url });
    const qty = Math.max(1, Math.round(Number(entry?.qty) || 1));
    const storedUnitPrice = Number(entry?.unitPrice ?? entry?.unit);
    const catalogUnitPrice = Number(product?.unitPrice);
    const unitPrice = Number.isFinite(storedUnitPrice) && storedUnitPrice > 0
      ? storedUnitPrice
      : (Number.isFinite(catalogUnitPrice) && catalogUnitPrice > 0 ? catalogUnitPrice : 0);
    return {
      ...entry,
      id: text(entry?.id) || text(product?.id),
      name: text(entry?.name) || text(product?.name) || "Spare part",
      qty,
      displayId: text(entry?.displayId ?? entry?.idCode) || text(product?.displayId),
      idCode: text(entry?.idCode ?? entry?.displayId) || text(product?.displayId),
      unitPrice,
      unit: unitPrice,
      total: unitPrice * qty,
      url: /^https?:\/\//i.test(text(entry?.url)) ? text(entry?.url) : (text(product?.url) || null),
    };
  });

  return rows.map((item) => {
    const product = findProduct({ id: item?.productId, name: item?.productName, url: item?.productUrl });
    const needed = enrichSpareEntries(item?.sparePartsNeededEntries);
    const replaced = enrichSpareEntries(item?.sparePartsReplacedEntries);
    return {
      ...item,
      productId: text(item?.productId) || text(product?.id) || null,
      productUrl: /^https?:\/\//i.test(text(item?.productUrl)) ? text(item?.productUrl) : (text(product?.url) || null),
      idCode: text(item?.idCode ?? item?.displayId) || text(product?.displayId) || null,
      displayId: text(item?.displayId ?? item?.idCode) || text(product?.displayId) || null,
      sparePartsNeededEntries: needed,
      sparePartsNeededNames: needed.map((entry) => entry.name).filter(Boolean),
      sparePartsNeededName: needed.map((entry) => entry.name).filter(Boolean).join(", ") || null,
      sparePartsReplacedEntries: replaced,
      sparePartsReplacedIds: replaced.map((entry) => entry.id).filter(Boolean),
      sparePartsReplacedId: replaced.find((entry) => entry.id)?.id || null,
      sparePartsReplacedNames: replaced.map((entry) => entry.name).filter(Boolean),
      sparePartsReplacedName: replaced.map((entry) => entry.name).filter(Boolean).join(", ") || null,
    };
  });
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

  return await enrichMaintenanceDetailProducts(maintenanceRows.map(serializeOperationsOrderDetail));
}

function directMaintenanceMutationError(message, status = 500) {
  const error = new Error(message || "Maintenance Orders action failed.");
  error.code = "DIRECT_MAINTENANCE_ORDERS_MUTATION_FAILED";
  error.status = Number(status) || 500;
  return error;
}

function cleanMaintenanceActionIds(value = []) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.map((id) => text(id)).filter(Boolean))].slice(0, 500);
}

const DEFAULT_MAINTENANCE_RESOLUTION_METHODS = [
  { name: "In-facility", color: "green" },
  { name: "Not Applicable", color: "purple" },
  { name: "On-site", color: "brown" },
  { name: "Remote", color: "yellow" },
];

function uniqueMaintenanceStrings(value, { splitComma = false } = {}) {
  const out = [];
  const seen = new Set();
  const add = (entry) => {
    if (entry === null || typeof entry === "undefined") return;
    const raw = text(entry);
    if (!raw) return;
    if (splitComma && raw.includes(",")) {
      raw.split(",").forEach(add);
      return;
    }
    const key = norm(raw);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  if (Array.isArray(value)) value.forEach(add);
  else add(value);
  return out;
}

function maintenanceSparePlaceholder(value) {
  const key = norm(value).replace(/[^a-z0-9]/g, "");
  return !key || key === "selectcomponent" || key === "selectsparepart" || key === "nosparepartselected";
}

function normalizeMaintenanceSpareEntries(value, lookups = {}) {
  const out = [];
  const seen = new Set();
  const byId = lookups?.byId || new Map();
  const byName = lookups?.byName || new Map();

  const add = (entry = {}) => {
    const rawId = text(entry?.id ?? entry?.productId ?? entry?.sparePartId ?? entry?.value);
    let rawName = text(entry?.name ?? entry?.label ?? entry?.component ?? entry?.sparePartName);
    let qty = Number(entry?.qty ?? entry?.quantity ?? entry?.count ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.max(1, Math.round(qty));

    const fromId = rawId ? byId.get(rawId) : null;
    if (!rawName && fromId?.name) rawName = text(fromId.name);
    const qtyMatch = rawName.match(/(?:\s*[x×]\s*|\s*\(\s*qty\s*:?\s*)(\d+(?:\.\d+)?)\s*\)?\s*$/i);
    if (qtyMatch) {
      const parsedQty = Number(qtyMatch[1]);
      if (Number.isFinite(parsedQty) && parsedQty > 0) qty = Math.max(1, Math.round(parsedQty));
      rawName = rawName.slice(0, qtyMatch.index).trim();
    }
    if (!rawId && maintenanceSparePlaceholder(rawName)) return;

    const fromName = rawName ? byName.get(norm(rawName)) : null;
    const product = fromId || fromName || null;
    const name = text(product?.name || rawName);
    if (!name || (!rawId && maintenanceSparePlaceholder(name))) return;
    const id = text(product?.id || rawId);
    const key = `${id || norm(name)}|${qty}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id,
      name,
      qty,
      displayId: text(product?.displayId || product?.idCode),
      unitPrice: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : 0,
      url: product?.url || null,
    });
  };

  if (Array.isArray(value)) value.forEach(add);
  else if (value && typeof value === "object") {
    if (Array.isArray(value.replaced)) value.replaced.forEach(add);
    else if (Array.isArray(value.items)) value.items.forEach(add);
    else add(value);
  } else {
    const raw = text(value);
    if (raw) {
      try { return normalizeMaintenanceSpareEntries(JSON.parse(raw), lookups); } catch {}
      raw.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean).forEach((name) => add({ name }));
    }
  }
  return out;
}

function maintenanceLogMetaText({ neededEntries = [], replacedEntries = [], checklist = [], loggedAt = null } = {}) {
  const cleanEntries = (entries) => (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      id: text(entry?.id),
      name: text(entry?.name),
      qty: Number.isFinite(Number(entry?.qty)) ? Math.max(1, Math.round(Number(entry.qty))) : 1,
    }))
    .filter((entry) => entry.id || entry.name);
  const cleanChecklist = uniqueMaintenanceStrings(Array.isArray(checklist) ? checklist : [], { splitComma: false })
    .map((item) => text(item).slice(0, 800))
    .filter(Boolean);
  return JSON.stringify({
    v: 3,
    needed: cleanEntries(neededEntries),
    replaced: cleanEntries(replacedEntries),
    checklist: cleanChecklist,
    loggedAt: text(loggedAt) || null,
  });
}

function missingWritableColumn(error) {
  const raw = [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint]
    .filter(Boolean)
    .join(" ");
  return (raw.match(/Could not find the ['\"]([^'\"]+)['\"] column/i) || [])[1]
    || (raw.match(/column ['\"]([^'\"]+)['\"]/i) || [])[1]
    || "";
}

async function updateMaintenanceRowSafe(id, sourcePatch = {}, requiredColumns = []) {
  let patch = { ...(sourcePatch || {}) };
  const required = new Set((requiredColumns || []).map((value) => norm(value)).filter(Boolean));
  const removed = new Set();
  for (let attempt = 0; attempt <= Object.keys(patch).length; attempt += 1) {
    try {
      return await updateById(tableName(), id, patch);
    } catch (error) {
      const missing = missingWritableColumn(error);
      const key = Object.keys(patch).find((name) => norm(name) === norm(missing));
      if (!missing || !key || required.has(norm(key)) || removed.has(norm(key))) throw error;
      delete patch[key];
      removed.add(norm(key));
    }
  }
  return await updateById(tableName(), id, patch);
}

function maintenanceWorkflowAccess(account = {}) {
  return directPageMutationAccess(account, ["Maintenance Orders", "Operations Orders", "Requested Orders"]);
}

export async function loadMaintenanceFormOptionsDirect() {
  if (!isSupabaseConfigured()) return null;
  const [catalog, checklistItems, existingResolutionRows] = await Promise.all([
    getProductsCatalog().catch(() => null),
    listMaintenanceChecklistItems().catch(() => []),
    select(tableName(), {
      select: "resolution_method",
      resolution_method: "not.is.null",
      limit: "1000",
    }).catch(() => []),
  ]);
  if (!catalog || !Array.isArray(catalog?.products)) return null;

  const spareParts = catalog.products
    .map((product) => ({
      id: text(product?.id),
      name: text(product?.name),
      displayId: text(product?.displayId),
      unitPrice: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : 0,
      url: product?.url || null,
      tags: Array.isArray(product?.tags) ? product.tags : [],
    }))
    .filter((product) => product.id && product.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

  const colors = new Map(DEFAULT_MAINTENANCE_RESOLUTION_METHODS.map((item) => [norm(item.name), item.color]));
  const resolutionMethods = [];
  const seen = new Set();
  const addResolution = (name, color = null) => {
    const clean = text(name);
    const key = norm(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    resolutionMethods.push({ name: clean, color: color || colors.get(key) || null });
  };
  DEFAULT_MAINTENANCE_RESOLUTION_METHODS.forEach((item) => addResolution(item.name, item.color));
  (Array.isArray(existingResolutionRows) ? existingResolutionRows : []).forEach((row) => addResolution(row?.resolution_method));

  return {
    resolutionMethods,
    spareParts,
    checklistItems: Array.isArray(checklistItems) ? checklistItems : [],
    source: "supabase-next",
  };
}

export async function logMaintenanceDirect({
  account = {},
  orderIds = [],
  resolutionMethod = "",
  serialNumber = "",
  actualIssueDescription = "",
  repairAction = "",
  sparePartId = null,
  sparePartIds = [],
  sparePartNames = [],
  perItemLogs = [],
  moveToArrived = false,
  moveToShipping = false,
  replaceExisting = false,
} = {}) {
  const access = maintenanceWorkflowAccess(account);
  if (access === null) return null;
  if (!access) throw directMaintenanceMutationError("Edit access is required for this action.", 403);

  const ids = cleanMaintenanceActionIds(orderIds);
  if (!ids.length) throw directMaintenanceMutationError("orderIds required", 400);
  if (!ids.every((id) => /^\d+$/.test(id)) || !isSupabaseConfigured()) return null;

  let rows;
  try {
    rows = await loadRawOrderRowsByIds(ids);
  } catch (error) {
    if (Number(error?.status) === 404) throw directMaintenanceMutationError("Orders not found.", 404);
    throw error;
  }
  if (!Array.isArray(rows) || rows.length !== ids.length) throw directMaintenanceMutationError("Orders not found.", 404);
  const serializedBefore = rows.map(serializeOperationsOrderDetail);
  if (serializedBefore.some((item) => !isMaintenanceOrder(item?.orderType))) {
    throw directMaintenanceMutationError("Only Request Maintenance orders can be logged here.", 400);
  }

  const catalog = await getProductsCatalog();
  if (!catalog || !Array.isArray(catalog?.products)) return null;
  const byId = new Map(catalog.products.map((item) => [text(item?.id), item]).filter(([id]) => id));
  const byName = new Map(catalog.products.map((item) => [norm(item?.name), item]).filter(([name]) => name));
  const lookups = { byId, byName };
  const maintenanceLoggedAt = new Date().toISOString();
  const logById = new Map();

  const normalizeLog = (entry = {}) => {
    const serialNumberText = text(entry?.serialNumber || serialNumber);
    const resolutionMethodText = text(entry?.resolutionMethod || resolutionMethod);
    const actualIssueDescriptionText = String(entry?.actualIssueDescription || actualIssueDescription || "").replace(/\r\n/g, "\n").trim();
    const repairActionText = String(entry?.repairAction || repairAction || "").replace(/\r\n/g, "\n").trim();
    const rawSparePartTokens = uniqueMaintenanceStrings(
      Array.isArray(entry?.sparePartIds) && entry.sparePartIds.length
        ? entry.sparePartIds
        : Array.isArray(sparePartIds) && sparePartIds.length
          ? sparePartIds
          : (entry?.sparePartId ?? sparePartId),
    ).filter((value) => !maintenanceSparePlaceholder(value));
    const requestedSparePartNames = uniqueMaintenanceStrings([
      ...rawSparePartTokens.filter((value) => !/^\d+$/.test(text(value))),
      ...(Array.isArray(entry?.sparePartNames) ? entry.sparePartNames : []),
      ...(Array.isArray(sparePartNames) ? sparePartNames : [sparePartNames]),
    ], { splitComma: true }).filter((value) => !maintenanceSparePlaceholder(value));
    const rawReplacedEntries = Array.isArray(entry?.sparePartsReplaced)
      ? entry.sparePartsReplaced
      : Array.isArray(entry?.spareParts)
        ? entry.spareParts
        : Array.isArray(entry?.sparePartEntries)
          ? entry.sparePartEntries
          : [];
    const rawNeededEntries = Array.isArray(entry?.sparePartsNeeded)
      ? entry.sparePartsNeeded
      : Array.isArray(entry?.neededSpareParts)
        ? entry.neededSpareParts
        : [];
    const checklist = uniqueMaintenanceStrings(Array.isArray(entry?.checklist) ? entry.checklist : [], { splitComma: false })
      .map((item) => text(item).slice(0, 800))
      .filter(Boolean);
    return {
      serialNumberText,
      resolutionMethodText,
      actualIssueDescriptionText,
      repairActionText,
      rawSparePartTokens,
      requestedSparePartNames,
      rawReplacedEntries,
      rawNeededEntries,
      checklist,
    };
  };

  for (const entry of Array.isArray(perItemLogs) ? perItemLogs : []) {
    const orderId = text(entry?.orderId ?? entry?.id);
    if (orderId) logById.set(orderId, normalizeLog(entry));
  }
  const fallbackLog = normalizeLog({});
  const responseById = new Map();
  const updatedRows = [];
  let hasAnyDetails = false;
  let mutationStarted = false;

  const buildPatch = (entryLog) => {
    const log = entryLog || fallbackLog;
    const tokenEntries = (log.rawSparePartTokens || []).map((value) => ({ id: text(value) }));
    const nameEntries = (log.requestedSparePartNames || []).map((name) => ({ name }));
    const replaced = normalizeMaintenanceSpareEntries([
      ...(Array.isArray(log.rawReplacedEntries) ? log.rawReplacedEntries : []),
      ...tokenEntries,
      ...nameEntries,
    ], lookups);
    const needed = normalizeMaintenanceSpareEntries(Array.isArray(log.rawNeededEntries) ? log.rawNeededEntries : [], lookups);
    const replacedNames = uniqueMaintenanceStrings(replaced.map((entry) => entry.name), { splitComma: true });
    const replacedIds = uniqueMaintenanceStrings(replaced.map((entry) => entry.id).filter(Boolean));
    const neededNames = uniqueMaintenanceStrings(needed.map((entry) => entry.name), { splitComma: true });
    const hasContent = Boolean(
      log.serialNumberText || log.resolutionMethodText || log.actualIssueDescriptionText || log.repairActionText
      || needed.length || replaced.length || log.checklist.length
    );
    const metaText = maintenanceLogMetaText({
      neededEntries: needed,
      replacedEntries: replaced,
      checklist: log.checklist,
      loggedAt: hasContent ? maintenanceLoggedAt : null,
    });
    const patch = { updated_at: maintenanceLoggedAt };
    if (replaceExisting) {
      patch.serial_number = log.serialNumberText || null;
      patch.resolution_method = log.resolutionMethodText || null;
      patch.actual_issue_description = log.actualIssueDescriptionText || null;
      patch.repair_action = log.repairActionText || null;
      patch.spare_parts_replaced = hasContent ? metaText : null;
    } else {
      if (log.serialNumberText) patch.serial_number = log.serialNumberText;
      if (log.resolutionMethodText) patch.resolution_method = log.resolutionMethodText;
      if (log.actualIssueDescriptionText) patch.actual_issue_description = log.actualIssueDescriptionText;
      if (log.repairActionText) patch.repair_action = log.repairActionText;
      if (hasContent) patch.spare_parts_replaced = metaText;
    }
    if (moveToShipping) patch.status = "Shipped";
    else if (moveToArrived) patch.status = "Arrived";
    return {
      patch,
      response: {
        serialNumber: log.serialNumberText || null,
        resolutionMethod: log.resolutionMethodText || null,
        actualIssueDescription: log.actualIssueDescriptionText || null,
        repairAction: log.repairActionText || null,
        sparePartsReplacedIds: replacedIds,
        sparePartsReplacedId: replacedIds[0] || null,
        sparePartsReplacedNames: replacedNames,
        sparePartsReplacedName: replacedNames.join(", ") || null,
        sparePartsReplacedEntries: replaced,
        sparePartsNeededNames: neededNames,
        sparePartsNeededName: neededNames.join(", ") || null,
        sparePartsNeededEntries: needed,
        maintenanceChecklist: log.checklist,
      },
    };
  };

  try {
    for (const id of ids) {
      const built = buildPatch(logById.get(id) || fallbackLog);
      const detailKeys = ["serial_number", "resolution_method", "actual_issue_description", "repair_action", "spare_parts_replaced"];
      const hasDetailsForRow = replaceExisting || detailKeys.some((key) => text(built.patch?.[key]));
      hasAnyDetails = hasAnyDetails || hasDetailsForRow;
      if (!hasDetailsForRow && !moveToArrived && !moveToShipping) continue;
      const requiredColumns = built.patch?.serial_number ? ["serial_number"] : [];
      const updated = await updateMaintenanceRowSafe(id, built.patch, requiredColumns);
      mutationStarted = true;
      updatedRows.push(updated || { ...(rows.find((row) => text(row?.id) === id) || {}), ...built.patch });
      responseById.set(id, built.response);
    }
    if (!hasAnyDetails && !moveToArrived && !moveToShipping && !replaceExisting) {
      throw directMaintenanceMutationError("No maintenance details were provided.", 400);
    }
    await invalidateLegacyOperationsCaches(account).catch(() => {});
    const items = await enrichMaintenanceDetailProducts(updatedRows.map((row) => {
      const item = serializeOperationsOrderDetail(row || {});
      return { ...item, ...(responseById.get(text(item?.id)) || {}) };
    }));
    return {
      success: true,
      source: "supabase-direct",
      status: moveToShipping ? "Shipped" : moveToArrived ? "Arrived" : null,
      statusColor: moveToShipping ? "blue" : moveToArrived ? "green" : null,
      items,
    };
  } catch (error) {
    if (error?.code === "DIRECT_MAINTENANCE_ORDERS_MUTATION_FAILED") throw error;
    if (mutationStarted) throw directMaintenanceMutationError(error?.message || "Maintenance log was partially saved and requires review.", Number(error?.status) || 500);
    throw error;
  }
}

export async function markMaintenanceArrivedDirect({
  account = {},
  orderIds = [],
  orderReceiptDataUrls = [],
  orderReceiptFilenames = [],
  receiptNumbers = [],
} = {}) {
  const access = maintenanceWorkflowAccess(account);
  if (access === null) return null;
  if (!access) throw directMaintenanceMutationError("Edit access is required for this action.", 403);
  const ids = cleanMaintenanceActionIds(orderIds);
  if (!ids.length) throw directMaintenanceMutationError("orderIds required", 400);
  if (!ids.every((id) => /^\d+$/.test(id)) || !isSupabaseConfigured()) return null;

  let rows;
  try { rows = await loadRawOrderRowsByIds(ids); }
  catch (error) {
    if (Number(error?.status) === 404) throw directMaintenanceMutationError("Orders not found.", 404);
    throw error;
  }
  if (rows.map(serializeOperationsOrderDetail).some((item) => !isMaintenanceOrder(item?.orderType))) {
    throw directMaintenanceMutationError("Only Request Maintenance orders can be marked delivered here.", 400);
  }

  try {
    return await markOperationsArrived({
      account,
      orderIds: ids,
      orderReceiptDataUrls,
      orderReceiptFilenames,
      receiptNumbers,
    });
  } catch (error) {
    if (error?.code === "DIRECT_OPERATIONS_MUTATION_FAILED") {
      throw directMaintenanceMutationError(error?.message || "Failed to mark maintenance order as delivered.", Number(error?.status) || 500);
    }
    throw error;
  }
}

export async function performMaintenanceOrdersProtectedAction({
  account = {},
  action = "",
  orderIds = [],
  adminPassword = "",
} = {}) {
  const cleanAction = text(action).toLowerCase().replace(/[_\s]+/g, "-");
  if (!["archive", "delete", "edit-init"].includes(cleanAction)) {
    throw directMaintenanceMutationError("Unsupported Maintenance Orders action.", 400);
  }

  const mutationAccess = directPageMutationAccess(account, "Maintenance Orders");
  if (mutationAccess === null) return null;
  if (!mutationAccess) throw directMaintenanceMutationError("Edit access is required for this action.", 403);

  const ids = cleanMaintenanceActionIds(orderIds);
  if (!ids.length) throw directMaintenanceMutationError("orderIds required", 400);
  if (!ids.every((id) => /^\d+$/.test(id)) || !isSupabaseConfigured()) return null;

  const pwd = text(adminPassword);
  if (!pwd) throw directMaintenanceMutationError("adminPassword required", 400);
  const passwordOk = await verifyPageAdminPasswordDirect(account, pwd, "Maintenance Orders");
  if (passwordOk === null) return null;
  if (!passwordOk) throw directMaintenanceMutationError("Invalid admin password", 401);

  let rows;
  try {
    rows = await loadRawOrderRowsByIds(ids);
  } catch (error) {
    if (Number(error?.status) === 404) throw directMaintenanceMutationError("Orders not found.", 404);
    throw error;
  }
  if (!Array.isArray(rows) || rows.length !== ids.length) throw directMaintenanceMutationError("Orders not found.", 404);

  const serialized = rows.map(serializeOperationsOrderDetail);
  if (serialized.some((item) => !isMaintenanceOrder(item?.orderType))) {
    const verb = cleanAction === "archive" ? "archived" : cleanAction === "delete" ? "deleted" : "edited";
    throw directMaintenanceMutationError(`Only Request Maintenance orders can be ${verb} here.`, 400);
  }

  if (cleanAction === "edit-init") {
    const items = await enrichMaintenanceDetailProducts(serialized);
    return {
      ok: true,
      count: items.length,
      items,
      source: "supabase-direct",
    };
  }

  if (cleanAction === "archive") {
    await updateByIds(tableName(), ids, { status: "Archive" });
    await invalidateLegacyOperationsCaches(account).catch(() => {});
    return {
      success: true,
      status: "Archive",
      statusColor: "purple",
      source: "supabase-direct",
    };
  }

  const deleted = await deleteByIds(tableName(), ids);
  await invalidateLegacyOperationsCaches(account).catch(() => {});
  return {
    success: true,
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    source: "supabase-direct",
  };
}

