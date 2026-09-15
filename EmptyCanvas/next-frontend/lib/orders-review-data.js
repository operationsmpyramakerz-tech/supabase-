import "server-only";
import { isSupabaseConfigured, select, selectAll } from "./supabase-rest";
import { enrichOrderDetailGrouping, loadRawOrderRowsByIds, serializeReviewOrderDetail } from "./order-details-data";

const PAGE_LIMIT = 36;
const PAGE_MAX = 80;
const REVIEW_SUMMARY_SELECT = [
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
  "status",
  "issue_description",
  "sv_approval",
  "rejected_reason",
  "operations_approval",
  "team_member_id",
  "team_member_name",
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
  return text(valueFor(row, ["team_member_id", "team_members_id", "created_by_id", "owner_id"]));
}

function ownerName(row = {}) {
  return text(valueFor(row, ["team_member_name", "teams_members", "Teams Members", "created_by_name", "created_by", "Created By"]));
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

async function findCurrentMember(username) {
  const cleanName = text(username).replace(/[,*%()]/g, " ").replace(/\s+/g, " ");
  if (!cleanName) return null;
  try {
    const rows = await select(teamMembersTable(), {
      select: "*",
      name: `ilike.${cleanName}`,
      limit: "5",
    });
    const exact = (Array.isArray(rows) ? rows : []).find((row) => norm(valueFor(row, ["name", "Name", "full_name", "Full Name"])) === norm(cleanName));
    if (exact) return exact;
  } catch {}

  const rows = await selectAll(teamMembersTable(), { limit: 5000 });
  return rows.find((row) => norm(valueFor(row, ["name", "Name", "full_name", "Full Name"])) === norm(cleanName)) || null;
}

async function memberIdentityRows() {
  try {
    return await selectAll(teamMembersTable(), { limit: 5000, select: "id,name" });
  } catch {
    return await selectAll(teamMembersTable(), { limit: 5000 });
  }
}

async function reviewerVisibility(account = {}) {
  const username = text(account?.username || account?.name);
  if (!username) return { ids: [], names: [] };
  const current = await findCurrentMember(username);
  if (!current) return { ids: [], names: [] };

  const currentId = text(valueFor(current, ["id", "ID"]));
  let ids = [];
  let names = [];

  if (currentId) {
    try {
      const rows = await select("team_member_sv_schools", {
        select: "visible_team_member_id,visible_team_member_name",
        team_member_id: `eq.${currentId}`,
        limit: "5000",
      });
      if (Array.isArray(rows) && rows.length) {
        ids = rows.map((row) => text(row.visible_team_member_id)).filter(Boolean);
        names = rows.map((row) => text(row.visible_team_member_name)).filter(Boolean);
      }
    } catch {
      // Optional normalized junction table. Older schemas keep the same values
      // on the current team-member row and are handled below.
    }
  }

  if (!ids.length) ids = splitIds(valueFor(current, ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"]));
  if (!names.length) names = splitArray(valueFor(current, ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"]));

  if (names.length) {
    const members = await memberIdentityRows().catch(() => []);
    const byName = new Map((Array.isArray(members) ? members : []).map((row) => [norm(valueFor(row, ["name", "Name", "full_name", "Full Name"])), row]));
    for (const name of names) {
      const row = byName.get(norm(name));
      const id = row ? text(valueFor(row, ["id", "ID"])) : "";
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return {
    ids: [...new Set(ids.map(text).filter(Boolean))],
    names: [...new Set(names.map(text).filter(Boolean))],
  };
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

function visibilityLogic(visible) {
  const clauses = [];
  for (const id of visible?.ids || []) {
    const clean = String(id || "").replace(/[^0-9A-Za-z_-]/g, "");
    if (clean) clauses.push(`team_member_id.eq.${clean}`);
  }
  for (const name of visible?.names || []) {
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

function logicalParams({ visible, query = "", tab = "all", type = "all" } = {}) {
  const params = {};
  const logicGroups = [];
  const visibleClauses = visibilityLogic(visible);
  if (visibleClauses?.length) logicGroups.push(visibleClauses);

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
  const directNumber = String(base.order_number || "").startsWith("eq.") ? Number(String(base.order_number).slice(3)) : null;

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

  return { numbers: unique.slice(0, wanted), hasMore: unique.length > wanted || !exhausted };
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
      const rows = await select(tableName(), { ...baseParams, select: REVIEW_SUMMARY_SELECT });
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
    const item = serializeReviewSummary(row);
    const orderNumber = Number(item.orderIdNumber);
    if (!Number.isFinite(orderNumber)) continue;
    if (!groups.has(orderNumber)) groups.set(orderNumber, []);
    groups.get(orderNumber).push(item);
  }
  return groups;
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
  ]).map((value) => norm(value)).join(" ");
}

export async function loadOrdersReviewPage({
  account = null,
  tab = "all",
  type = "all",
  query = "",
  cursor = null,
  limit = PAGE_LIMIT,
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
    const filters = logicalParams({ visible, query, tab: cleanTab, type });
    let candidates;
    try {
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 2, 60),
        filters,
      });
    } catch {
      // Keep order-number paging even if a customized/older schema rejects one
      // of the direct DB filter columns. Exact visibility and tab filtering is
      // still applied below before anything is returned to the reviewer.
      candidates = await candidateNumbers({
        cursor: nextCursor,
        scanGroups: Math.max(safeLimit * 3, 80),
        filters: {},
      });
    }

    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const rows = await rowsByNumbers(candidates.numbers);
    const allowedRows = rows.filter((row) => {
      if (!visibleToReviewer(row, visible)) return false;
      const issueDescription = text(valueFor(row, ["issue_description", "Issue Description"]));
      if (/^created from proposal:/i.test(issueDescription)) return false;
      const archived = /archive|archived/.test(norm(valueFor(row, ["status", "Status"])));
      if (cleanTab === "archive") return archived;
      if (archived) return false;
      if (["approved", "rejected", "not-started"].includes(cleanTab)) {
        return approvalKey(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"])) === cleanTab;
      }
      return true;
    });

    const groups = groupRows(allowedRows);
    const cleanType = orderTypeKey(type);
    const directSearch = searchLogic(query);
    const needle = Number.isFinite(directSearch?.orderNumber) ? "" : norm(query);
    let processedCandidates = 0;

    for (const orderNumber of candidates.numbers) {
      processedCandidates += 1;
      nextCursor = orderNumber;
      const items = groups.get(orderNumber) || [];
      if (!items.length) continue;
      if (cleanType && cleanType !== "all" && orderTypeKey(items[0]?.orderType || "") !== cleanType) continue;
      if (needle && !groupSearchText(items).includes(needle)) continue;
      outputGroups.push({ orderNumber, items });
      if (outputGroups.length >= safeLimit) break;
    }

    // Keep the same group-safe semantics used by Operations Orders. Reaching
    // the end of the database does not mean all candidate groups in this scan
    // have already been consumed by the current page.
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

export async function loadOrdersReviewInitialPage({ account, limit = PAGE_LIMIT } = {}) {
  return await loadOrdersReviewPage({ account, tab: "all", type: "all", query: "", cursor: null, limit });
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

