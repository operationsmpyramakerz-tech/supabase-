import "server-only";
import { isSupabaseConfigured, select } from "./supabase-rest";

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
  if (/(in progress|inprogress|progress)/.test(status)) return 2;
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

async function candidateNumbers({ cursor = null, scanGroups = 90 } = {}) {
  const wanted = Math.max(20, Math.min(240, Number(scanGroups) || 90));
  const unique = [];
  const seen = new Set();
  let offset = 0;
  let exhausted = false;
  const rowChunk = 1000;

  while (unique.length < wanted + 1 && !exhausted && offset < 12000) {
    const params = {
      select: "order_number",
      order: "order_number.desc",
      limit: String(rowChunk),
      offset: String(offset),
      order_number: cursor === null || cursor === undefined || String(cursor).trim() === "" ? "not.is.null" : `lt.${Number(cursor)}`,
    };
    const rows = await select(tableName(), params);
    const chunk = Array.isArray(rows) ? rows : [];
    for (const row of chunk) {
      const orderNumber = num(row?.order_number);
      if (!Number.isFinite(orderNumber) || seen.has(orderNumber)) continue;
      seen.add(orderNumber);
      unique.push(orderNumber);
      if (unique.length >= wanted + 1) break;
    }
    if (chunk.length < rowChunk) exhausted = true;
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
  const baseParams = {
    order_number: `in.(${clean.join(",")})`,
    order: "order_number.desc,notion_created_time.desc,id.desc",
    limit: String(Math.max(1000, clean.length * 200)),
  };
  try {
    const rows = await select(tableName(), { ...baseParams, select: SUMMARY_SELECT });
    return Array.isArray(rows) ? rows : [];
  } catch {
    const rows = await select(tableName(), { ...baseParams, select: "*" });
    return Array.isArray(rows) ? rows : [];
  }
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

export async function loadOperationsOrdersInitialPage({ limit = PAGE_LIMIT } = {}) {
  if (!isSupabaseConfigured()) return null;
  const safeLimit = pageLimit(limit);
  const outputGroups = [];
  let nextCursor = null;
  let hasMore = true;
  let loops = 0;

  while (outputGroups.length < safeLimit && hasMore && loops < 12) {
    loops += 1;
    const candidates = await candidateNumbers({ cursor: nextCursor, scanGroups: Math.max(safeLimit * 2, 60) });
    if (!candidates.numbers.length) {
      hasMore = false;
      break;
    }

    const rows = await rowsByNumbers(candidates.numbers);
    const groups = groupRows(rows);
    let processedCandidates = 0;
    for (const orderNumber of candidates.numbers) {
      processedCandidates += 1;
      nextCursor = orderNumber;
      const items = groups.get(orderNumber) || [];
      if (!items.length) continue;
      const stage = Math.max(1, ...items.map((item) => statusIndex(item?.status)));
      if (stage >= 5) continue;
      outputGroups.push({ orderNumber, items });
      if (outputGroups.length >= safeLimit) break;
    }
    // `candidateNumbers.hasMore` only tells us whether there are groups beyond
    // the scanned candidate window. If this page filled up before consuming
    // the whole current window, those lower order numbers are also "more".
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
      nextCursor: hasMore && Number.isFinite(Number(nextCursor)) ? Number(nextCursor) : null,
    },
  };
}
