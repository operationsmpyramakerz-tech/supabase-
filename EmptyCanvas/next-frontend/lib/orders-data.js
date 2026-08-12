import "server-only";
import { selectAll } from "./supabase-rest";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.url || value.external?.url || value.file?.url);
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

function numberOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateTimeValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
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
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function statusColor(status) {
  const value = canonical(status);
  if (value.includes("archive")) return "purple";
  if (/(arrived|delivered|received)/.test(value)) return "green";
  if (value.includes("shipped")) return "blue";
  if (value.includes("rejected")) return "red";
  if (value.includes("progress")) return "yellow";
  if (value.includes("supervision")) return "orange";
  return "default";
}

function orderTypeColor(orderType) {
  const value = canonical(orderType);
  if (value.includes("maintenance")) return "purple";
  if (value.includes("withdraw")) return "red";
  if (value.includes("request")) return "green";
  return "default";
}

function roundQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 1000) / 1000;
}

function serializeOrder(row = {}) {
  const id = text(valueFor(row, ["id", "ID"]));
  const orderNumber = numberOrNull(valueFor(row, ["order_number", "Order - ID", "Order ID", "order id"]));
  const quantityProgress = numberOrNull(valueFor(row, ["quantity_progress", "Quantity Progress", "quantity", "Quantity", "qty", "Qty"]));
  const quantityRequested = numberOrNull(valueFor(row, ["quantity_requested", "Quantity Requested", "requested_quantity", "Requested Quantity"]));
  const quantityEdited = numberOrNull(valueFor(row, [
    "quantity_edited_by_supervisor",
    "Quantity Edited by supervisor",
    "Quantity Edited by Supervisor",
    "quantity_edited",
    "edited_quantity",
  ]));
  const originalQuantity = roundQuantity(quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0));
  const effectiveQuantity = roundQuantity(quantityEdited !== null ? quantityEdited : originalQuantity);
  const quantityReceivedRaw = numberOrNull(valueFor(row, [
    "quantity_received_by_operations",
    "Quantity Received by operations",
    "Quantity Received by Operations",
    "received_quantity",
    "quantity_received",
  ]));
  const quantityRemainingRaw = numberOrNull(valueFor(row, ["quantity_remaining", "Quantity Remaining", "remaining_quantity"]));
  const status = text(valueFor(row, ["status", "Status"])) || "Pending";
  const finalReceived = /(arrived|delivered|received)/.test(canonical(status));
  const receivedZero = quantityReceivedRaw !== null && Math.abs(quantityReceivedRaw) < 1e-9;
  const remainingZero = quantityRemainingRaw !== null && Math.abs(quantityRemainingRaw) < 1e-9;
  const zeroPlaceholder = Math.abs(effectiveQuantity) > 1e-9 && receivedZero && remainingZero && !finalReceived;
  const quantityReceived = zeroPlaceholder ? null : quantityReceivedRaw;
  const quantityRemaining = zeroPlaceholder
    ? effectiveQuantity
    : (quantityRemainingRaw !== null
      ? roundQuantity(quantityRemainingRaw)
      : roundQuantity(effectiveQuantity - (quantityReceivedRaw || 0)));

  const orderType = text(valueFor(row, ["order_type", "Order Type"])) || null;
  const createdByName = text(valueFor(row, [
    "team_member_name",
    "created_by_name",
    "created_by",
    "teams_members",
    "Teams Members",
    "Supervisor",
    "supervisor",
  ]));
  const createdById = text(valueFor(row, ["team_member_id", "created_by_id", "user_id", "employee_code"]));
  const operationsByName = text(valueFor(row, [
    "person_received_by_operations",
    "Person Received by Operations",
    "Received by operations",
  ]));
  const supervisor = text(valueFor(row, ["supervisor", "Supervisor"]));
  const spareParts = splitValues(valueFor(row, ["spare_parts_replaced", "Spare parts replaced"]));
  const productName = text(valueFor(row, ["product_name", "Product Name", "product", "Product"])) || "Unknown Product";
  const productUrl = text(valueFor(row, ["product_url", "Product URL"])) || null;
  const createdTime = dateTimeValue(valueFor(row, ["notion_created_time", "created_time", "created_at", "Created time"])) || new Date().toISOString();

  return {
    id,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdPrefix: Number.isFinite(orderNumber) ? "ORD" : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason: text(valueFor(row, ["reason", "Reason"])) || "No Reason",
    productName,
    productPageId: productUrl,
    productUrl,
    productImage: null,
    unitPrice: numberOrNull(valueFor(row, ["unit_price", "Unit price", "Unity Price", "Price"])),
    quantityRequested: quantityRequested !== null ? quantityRequested : effectiveQuantity,
    quantityProgress: quantityEdited,
    quantityEditedBySupervisor: quantityEdited,
    quantityReceived,
    quantityRemaining,
    quantityReceivedEdited: quantityReceived !== null && Math.abs(Number(quantityReceived) || 0) > 1e-9,
    quantity: effectiveQuantity,
    status,
    statusColor: statusColor(status),
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    issueDescription: text(valueFor(row, ["issue_description", "Issue Description"])) || null,
    actualIssueDescription: text(valueFor(row, ["actual_issue_description", "Actual Issue Description"])) || null,
    repairAction: text(valueFor(row, ["repair_action", "Repair Action"])) || null,
    resolutionMethod: text(valueFor(row, ["resolution_method", "Resolution Method"])) || null,
    resolutionMethodColor: null,
    sparePartsReplacedIds: [],
    sparePartsReplacedId: null,
    sparePartsReplacedNames: spareParts,
    sparePartsReplacedName: spareParts.join(", ") || null,
    sparePartsReplacedEntries: spareParts.map((name) => ({ name })),
    orderReceiptEntries: [],
    orderReceiptNames: [],
    orderReceiptUrls: [],
    orderReceiptName: null,
    orderReceiptUrl: null,
    maintenanceReceiptEntries: [],
    maintenanceReceiptNames: [],
    maintenanceReceiptUrls: [],
    maintenanceReceiptName: null,
    maintenanceReceiptUrl: null,
    operationsByIds: [],
    operationsByNames: operationsByName ? [operationsByName] : [],
    operationsById: "",
    operationsByName,
    operationsApproval: text(valueFor(row, ["operations_approval", "Operations Approval", "operation_approval", "Operation Approval"])) || null,
    rejectedReason: text(valueFor(row, ["rejected_reason", "Rejected Reason", "Reject Reason", "rejection_reason", "Rejection Reason"])) || null,
    receiptNumber: text(valueFor(row, ["receipt_number", "Receipt Number", "Store Receipt Number"])) || null,
    createdTime,
    createdById: createdById || createdByName,
    createdByName,
    assignedToIds: [],
    assignedToNames: supervisor ? [supervisor] : [],
    assignedToId: "",
    assignedToName: supervisor,
    svApproval: text(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"])) || null,
    source: "supabase",
  };
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

async function selectOrdersRows() {
  try {
    return await selectAll(ordersTable(), {
      limit: 5000,
      order: "notion_created_time.desc,id.desc",
    });
  } catch (error) {
    if (Number(error?.status) === 401 || Number(error?.status) === 403) throw error;
    return await selectAll(ordersTable(), { limit: 5000, order: "id.desc" });
  }
}

export async function currentOrdersForAccount(account = {}) {
  const rows = await selectOrdersRows();
  const username = canonical(account.username || account.name);
  const filtered = username
    ? rows.filter((row) => {
        const owner = canonical(valueFor(row, [
          "team_member_name",
          "teams_members",
          "Teams Members",
          "supervisor",
          "Supervisor",
        ]));
        return !owner || owner.includes(username) || username.includes(owner);
      })
    : rows;

  return filtered.map(serializeOrder);
}
