import "server-only";

import { getSupabaseConfig, select } from "./supabase-rest";
import { getProductsCatalog } from "./products-service";
import { listKitFolders, listKitMembership, listKits } from "./proposal-kit-service";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function norm(value) { return text(value).toLowerCase(); }
function normKey(value) { return canonical(value); }

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

function approvalLabel(value) {
  const raw = text(value);
  const key = norm(raw).replace(/[_.-]+/g, " ");
  if (!key || key === "notstarted" || key === "not started") return "Not Started";
  if (key.includes("approv")) return "Approved";
  if (key.includes("reject")) return "Rejected";
  return raw || "Not Started";
}

function approvalColor(value) {
  const key = norm(approvalLabel(value));
  if (key === "approved") return "green";
  if (key === "rejected") return "red";
  return "yellow";
}

function uniqueStrings(value, { splitComma = false } = {}) {
  const out = [];
  const seen = new Set();
  const add = (entry) => {
    if (entry === null || typeof entry === "undefined") return;
    const raw = String(entry || "").trim();
    if (!raw) return;
    if (splitComma && raw.includes(",")) {
      raw.split(",").forEach(add);
      return;
    }
    const key = normKey(raw) || raw;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  if (Array.isArray(value)) value.forEach(add);
  else add(value);
  return out;
}

function sourceKits(value) {
  let raw = value;
  if (!Array.isArray(raw) && !(raw && typeof raw === "object")) {
    const candidate = String(value || "").trim();
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

function scaleSourceBreakdown(sourceRows = [], targetQuantity = 0) {
  const sources = (Array.isArray(sourceRows) ? sourceRows : [])
    .map((source, index) => ({
      ...source,
      quantity: Math.max(0, Number(source?.quantity) || 0),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.quantity > 0);
  const target = Math.max(0, Math.round(Math.abs(Number(targetQuantity) || 0)));
  if (!sources.length || target <= 0) return [];
  const currentTotal = sources.reduce((sum, source) => sum + Number(source.quantity || 0), 0);
  if (Math.round(currentTotal) === target) return sources.map((source) => ({ ...source, quantity: Math.round(source.quantity) }));
  if (sources.length === 1) return [{ ...sources[0], quantity: target }];

  const scaled = sources.map((source, index) => {
    const raw = (Number(source.quantity || 0) * target) / Math.max(1, currentTotal);
    const base = Math.floor(raw);
    return { ...source, quantity: base, _fraction: raw - base, _index: index };
  });
  let remaining = target - scaled.reduce((sum, source) => sum + Number(source.quantity || 0), 0);
  const ranked = scaled.slice().sort((a, b) => (b._fraction - a._fraction) || (a._index - b._index));
  for (let i = 0; remaining > 0 && ranked.length; i = (i + 1) % ranked.length) {
    ranked[i].quantity += 1;
    remaining -= 1;
  }
  return scaled
    .filter((source) => Number(source.quantity || 0) > 0)
    .map(({ _fraction, _index, ...source }) => source);
}

function storagePublicUrl(value, bucketOverride = "") {
  const raw = String(value || "").trim();
  if (!raw || /^null$/i.test(raw)) return "";
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  const cfg = getSupabaseConfig();
  const base = String(cfg?.url || "").trim().replace(/\/+$/, "");
  const bucket = String(bucketOverride || cfg?.storageBucket || "").trim().replace(/^\/+|\/+$/g, "");
  if (!base || !bucket) return "";
  let pathValue = raw;
  try {
    const maybeUrl = new URL(raw, base);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const signMarker = `/storage/v1/object/sign/${bucket}/`;
    if (maybeUrl.pathname.includes(publicMarker)) pathValue = maybeUrl.pathname.split(publicMarker)[1] || "";
    else if (maybeUrl.pathname.includes(signMarker)) pathValue = maybeUrl.pathname.split(signMarker)[1] || "";
  } catch {}
  pathValue = String(pathValue || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^object\/public\//i, "")
    .replace(/^storage\/v1\/object\/public\//i, "")
    .split("?")[0];
  if (pathValue.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) pathValue = pathValue.slice(bucket.length + 1);
  if (!pathValue || /^https?:/i.test(pathValue)) return "";
  const encodedPath = pathValue.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  return encodedPath ? `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}` : "";
}

function fileName(value, fallback = "Receipt photo") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    const last = decodeURIComponent(String(parsed.pathname || "").split("/").filter(Boolean).pop() || "").trim();
    return last || fallback;
  } catch {}
  return String(raw.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() || fallback).trim() || fallback;
}

function receiptEntries(rawValue, fallbackPrefix = "Receipt photo") {
  const out = [];
  const seen = new Set();
  const add = (entry, index = 0) => {
    if (entry === null || typeof entry === "undefined") return;
    if (typeof entry === "string") {
      const raw = String(entry || "").trim();
      if (!raw || /^null$/i.test(raw)) return;
      const url = storagePublicUrl(raw);
      const name = fileName(raw, `${fallbackPrefix} ${index + 1}`);
      const key = `${url || raw}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, url: url || (/^(https?:|data:image\/)/i.test(raw) ? raw : ""), raw });
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item, itemIndex) => add(item, itemIndex));
      return;
    }
    if (typeof entry === "object") {
      const rawUrl = text(entry.url || entry.href || entry.publicUrl || entry.public_url || entry.signedUrl || entry.signedURL || entry.downloadUrl || entry.downloadURL || entry.file?.url || entry.external?.url || entry.path || entry.fullPath || entry.full_path || entry.storagePath || entry.storage_path || entry.key || entry.Key);
      const bucket = text(entry.bucket || entry.bucketName || entry.bucket_name);
      const url = storagePublicUrl(rawUrl, bucket);
      const name = text(entry.name || entry.filename || entry.fileName || entry.originalName || entry.original_name) || fileName(rawUrl, `${fallbackPrefix} ${index + 1}`);
      if (!name && !url && !rawUrl) return;
      const key = `${url || rawUrl || "no-url"}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name: name || `${fallbackPrefix} ${index + 1}`, url: url || (/^(https?:|data:image\/)/i.test(rawUrl) ? rawUrl : ""), raw: rawUrl });
    }
  };
  if (Array.isArray(rawValue)) rawValue.forEach((entry, index) => add(entry, index));
  else if (rawValue && typeof rawValue === "object") add(rawValue, 0);
  else {
    const raw = String(rawValue || "").trim();
    if (!raw || /^null$/i.test(raw)) return out;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach((entry, index) => add(entry, index));
      else add(parsed, 0);
      if (out.length) return out;
    } catch {}
    const urls = raw.match(/https?:\/\/[^\s,"'<>]+/gi) || [];
    if (urls.length) urls.forEach((url, index) => add({ name: `${fallbackPrefix} ${index + 1}`, url }, index));
    else raw.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean).forEach((part, index) => add(part, index));
  }
  return out;
}

function sparePartEntries(value) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const id = text(entry?.id ?? entry?.productId ?? entry?.sparePartId ?? entry?.value);
    let name = text(entry?.name ?? entry?.label ?? entry?.component ?? entry?.sparePartName);
    let qty = Number(entry?.qty ?? entry?.quantity ?? entry?.count ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.max(1, Math.round(qty));
    const qtyMatch = name.match(/(?:\s*[x×]\s*|\s*\(\s*qty\s*:?\s*)(\d+(?:\.\d+)?)\s*\)?\s*$/i);
    if (qtyMatch) {
      const parsed = Number(qtyMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) qty = Math.max(1, Math.round(parsed));
      name = name.slice(0, qtyMatch.index).trim();
    }
    if (!name && !id) return;
    const key = `${id || normKey(name)}|${qty}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ id, name: name || id, qty, displayId: "", unitPrice: 0, url: null });
  };
  if (Array.isArray(value)) value.forEach(add);
  else if (value && typeof value === "object") {
    if (Array.isArray(value.replaced)) value.replaced.forEach(add);
    else if (Array.isArray(value.items)) value.items.forEach(add);
    else add(value);
  } else {
    const raw = String(value || "").trim();
    if (!raw) return entries;
    try { return sparePartEntries(JSON.parse(raw)); } catch {}
    raw.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean).forEach((name) => add({ name }));
  }
  return entries;
}

function maintenanceLogMeta(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    const raw = parsed.trim();
    if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && (Array.isArray(parsed.needed) || Array.isArray(parsed.replaced) || Array.isArray(parsed.checklist))) {
    return {
      neededEntries: sparePartEntries(Array.isArray(parsed.needed) ? parsed.needed : []),
      replacedEntries: sparePartEntries(Array.isArray(parsed.replaced) ? parsed.replaced : []),
      checklist: uniqueStrings(Array.isArray(parsed.checklist) ? parsed.checklist : [], { splitComma: false }),
    };
  }
  return { neededEntries: [], replacedEntries: sparePartEntries(value), checklist: [] };
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function cleanIds(orderIds = []) {
  return [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => id && /^[A-Za-z0-9_-]+$/.test(id)))]
    .slice(0, 500);
}

function inFilter(ids = []) {
  return `in.(${ids.join(",")})`;
}

export async function loadRawOrderRowsByIds(orderIds = []) {
  const ids = cleanIds(orderIds);
  if (!ids.length) return [];
  const rows = await select(ordersTable(), {
    select: "*",
    id: inFilter(ids),
    order: "notion_created_time.desc,id.desc",
    limit: String(Math.max(500, ids.length)),
  });
  const safeRows = Array.isArray(rows) ? rows : [];
  const found = new Set(safeRows.map((row) => text(valueFor(row, ["id", "ID"]))).filter(Boolean));
  if (ids.some((id) => !found.has(id))) {
    const error = new Error("One or more order components could not be found.");
    error.status = 404;
    throw error;
  }
  return safeRows;
}

function effectiveOperationsMaintenanceStatus(row = {}, rawStatus = "", orderType = "", svApproval = "") {
  const status = text(rawStatus) || "Pending";
  const typeKey = norm(orderType).replace(/[^a-z0-9]/g, "");
  const approval = norm(svApproval);
  const stageTwo = /(in progress|inprogress|progress|approved)/.test(norm(status).replace(/[_-]+/g, " "));
  if (typeKey !== "requestmaintenance" || !stageTwo || !approval.includes("approv")) return status;
  const hasMaintenanceLog = [
    valueFor(row, ["serial_number", "Serial Number"]),
    valueFor(row, ["actual_issue_description", "Actual Issue Description"]),
    valueFor(row, ["repair_action", "Repair Action"]),
    valueFor(row, ["resolution_method", "Resolution Method"]),
    valueFor(row, ["spare_parts_replaced", "Spare parts replaced"]),
  ].some((value) => Boolean(text(value)));
  return hasMaintenanceLog ? "Shipped" : status;
}

export function serializeOperationsOrderDetail(row = {}) {
  const id = text(valueFor(row, ["id", "ID"]));
  const orderNumber = num(valueFor(row, ["order_number", "Order - ID", "Order ID", "order id"]));
  const quantityProgressRaw = num(valueFor(row, ["quantity_progress", "Quantity Progress", "quantity", "Quantity", "qty", "Qty"]));
  const quantityRequested = num(valueFor(row, ["quantity_requested", "Quantity Requested", "requested_quantity", "Requested Quantity"]));
  const quantityEditedBySupervisor = num(valueFor(row, ["quantity_edited_by_supervisor", "Quantity Edited by supervisor", "Quantity Edited by Supervisor", "quantity_edited", "edited_quantity"]));
  const originalBase = roundQty(quantityRequested !== null ? quantityRequested : (quantityProgressRaw !== null ? quantityProgressRaw : 0));
  const base = roundQty(quantityEditedBySupervisor !== null ? quantityEditedBySupervisor : originalBase);
  const receivedRaw = num(valueFor(row, ["quantity_received_by_operations", "Quantity Received by operations", "Quantity Received by Operations", "received_quantity", "quantity_received"]));
  const remainingRaw = num(valueFor(row, ["quantity_remaining", "Quantity Remaining", "remaining_quantity"]));
  const rawStatus = text(valueFor(row, ["status", "Status"])) || "Pending";
  const orderType = text(valueFor(row, ["order_type", "Order Type"])) || null;
  const svApproval = text(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"])) || null;
  const status = effectiveOperationsMaintenanceStatus(row, rawStatus, orderType, svApproval);
  const finalReceived = /(arrived|delivered|received)/.test(norm(status));
  const hasBase = Math.abs(Number(base) || 0) > 1e-9;
  const receivedZero = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const remainingZero = remainingRaw !== null && Math.abs(Number(remainingRaw) || 0) < 1e-9;
  const remainingEqualsBase = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(base))) < 1e-9;
  const remainingEqualsOriginal = remainingRaw !== null && Math.abs(roundQty(Number(remainingRaw) - Number(originalBase))) < 1e-9;
  const supervisorEditActive = quantityEditedBySupervisor !== null && Math.abs(roundQty(Number(quantityEditedBySupervisor) - Number(originalBase))) > 1e-9;
  const noReceived = receivedRaw === null || Math.abs(Number(receivedRaw) || 0) < 1e-9;
  const placeholder = (hasBase && receivedZero && remainingZero && !finalReceived)
    || (hasBase && receivedZero && remainingEqualsBase)
    || (supervisorEditActive && noReceived && remainingEqualsOriginal);
  let quantityReceived = receivedRaw;
  let quantityRemaining;
  let quantityReceivedEdited = false;
  if (placeholder) {
    quantityReceived = null;
    quantityRemaining = base;
  } else if (remainingRaw !== null) {
    quantityRemaining = roundQty(remainingRaw);
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  } else {
    quantityRemaining = roundQty((Number(base) || 0) - (receivedRaw === null ? 0 : Number(receivedRaw) || 0));
    quantityReceivedEdited = receivedRaw !== null && Math.abs(Number(receivedRaw) || 0) > 1e-9;
  }

  const createdByName = text(valueFor(row, ["team_member_name", "Teams Members", "teams_members", "created_by_name", "created_by", "Created By", "Supervisor", "supervisor"]));
  const createdById = text(valueFor(row, ["team_member_id", "team_members_id", "created_by_id", "owner_id"])) || createdByName;
  const operationsByName = text(valueFor(row, ["person_received_by_operations", "Person Received by Operations", "Received by operations"]));
  const rawMaintenanceMeta = valueFor(row, ["spare_parts_replaced", "Spare parts replaced"]);
  const maintenanceMeta = maintenanceLogMeta(rawMaintenanceMeta);
  const spareEntries = maintenanceMeta.replacedEntries;
  const spareParts = uniqueStrings(spareEntries.map((entry) => entry.name), { splitComma: true });
  const sparePartsNeeded = uniqueStrings(maintenanceMeta.neededEntries.map((entry) => entry.name), { splitComma: true });
  const orderReceipts = receiptEntries(valueFor(row, ["order_receipt", "Order Receipt", "delivery_receipt", "Delivery Receipt", "receipt_photos", "Receipt Photos"]), "Receipt photo");
  const maintenanceReceipts = receiptEntries(valueFor(row, ["maintenance_receipt", "Maintenance Receipt"]) || valueFor(row, ["order_receipt", "Order Receipt", "delivery_receipt", "Delivery Receipt", "receipt_photos", "Receipt Photos"]), "Receipt photo");
  const sourceProposalId = text(valueFor(row, ["source_proposal_id", "Source Proposal ID", "proposal_id", "Proposal ID"])) || null;
  const sourceProposalName = text(valueFor(row, ["source_proposal_name", "Source Proposal Name", "proposal_name", "Proposal Name"])) || null;
  const sources = sourceKits(valueFor(row, ["source_kits", "Source Kits", "proposal_source_kits", "Proposal Source Kits"]));
  const issueDescription = text(valueFor(row, ["issue_description", "Issue Description"]));
  const proposalGenerated = Boolean(sourceProposalId || sourceProposalName || sources.length || /^created\s+from\s+proposal\s*:/i.test(issueDescription));
  const reason = proposalGenerated ? "Generated from Proposal" : (text(valueFor(row, ["reason", "Reason"])) || "No Reason");

  return {
    id,
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdPrefix: Number.isFinite(orderNumber) ? "ORD" : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    reason,
    productName: text(valueFor(row, ["product_name", "Product Name", "product", "Product"])) || "Unknown Product",
    productPageId: text(valueFor(row, ["product_url", "product", "Product"])) || null,
    productUrl: text(valueFor(row, ["product_url", "Product URL"])) || null,
    productImage: null,
    unitPrice: num(valueFor(row, ["unit_price", "Unit price", "Unity Price", "Price"])),
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
    serialNumber: text(valueFor(row, ["serial_number", "Serial Number"])) || null,
    actualIssueDescription: text(valueFor(row, ["actual_issue_description", "Actual Issue Description"])) || null,
    repairAction: text(valueFor(row, ["repair_action", "Repair Action"])) || null,
    resolutionMethod: text(valueFor(row, ["resolution_method", "Resolution Method"])) || null,
    resolutionMethodColor: null,
    sparePartsReplacedIds: spareEntries.map((entry) => entry.id).filter(Boolean),
    sparePartsReplacedId: spareEntries.find((entry) => entry.id)?.id || null,
    sparePartsReplacedNames: spareParts,
    sparePartsReplacedName: spareParts.join(", ") || null,
    sparePartsReplacedEntries: spareEntries,
    sparePartsNeededNames: sparePartsNeeded,
    sparePartsNeededName: sparePartsNeeded.join(", ") || null,
    sparePartsNeededEntries: maintenanceMeta.neededEntries,
    maintenanceChecklist: maintenanceMeta.checklist,
    orderReceiptEntries: orderReceipts,
    orderReceiptNames: orderReceipts.map((entry) => entry.name).filter(Boolean),
    orderReceiptUrls: orderReceipts.map((entry) => entry.url).filter(Boolean),
    orderReceiptName: orderReceipts[0]?.name || null,
    orderReceiptUrl: orderReceipts[0]?.url || null,
    maintenanceReceiptEntries: maintenanceReceipts,
    maintenanceReceiptNames: maintenanceReceipts.map((entry) => entry.name).filter(Boolean),
    maintenanceReceiptUrls: maintenanceReceipts.map((entry) => entry.url).filter(Boolean),
    maintenanceReceiptName: maintenanceReceipts[0]?.name || null,
    maintenanceReceiptUrl: maintenanceReceipts[0]?.url || null,
    operationsByIds: [],
    operationsByNames: operationsByName ? [operationsByName] : [],
    operationsById: "",
    operationsByName,
    operationsApproval: text(valueFor(row, ["operations_approval", "Operations Approval", "operation_approval", "Operation Approval"])) || null,
    rejectedReason: text(valueFor(row, ["rejected_reason", "Rejected Reason", "Reject Reason", "rejection_reason", "Rejection Reason"])) || null,
    receiptNumber: text(valueFor(row, ["receipt_number", "Receipt Number", "Store Receipt Number"])) || null,
    createdTime: dateValue(valueFor(row, ["notion_created_time", "created_time", "created_at", "Created time"])) || new Date().toISOString(),
    createdById,
    createdByName,
    assignedToIds: [],
    assignedToNames: text(valueFor(row, ["supervisor", "Supervisor"])) ? [text(valueFor(row, ["supervisor", "Supervisor"]))] : [],
    assignedToId: "",
    assignedToName: text(valueFor(row, ["supervisor", "Supervisor"])) || "",
    svApproval,
    productTag: text(valueFor(row, ["product_tag", "Product Tag", "component_tag", "Component Tag", "tag", "Tag"])) || null,
    customizeId: text(valueFor(row, ["customize_id", "Customize ID", "custom_id", "Custom ID"])) || null,
    kitTag: text(valueFor(row, ["kit_tag", "Kit Tag", "kit_name", "Kit Name", "source_kit", "Source Kit"])) || null,
    kitFolderName: text(valueFor(row, ["kit_folder", "Kit Folder", "kit_folder_name", "Kit Folder Name"])) || null,
    sourceProposalId,
    sourceProposalName,
    sourceKits: sources,
    source: "supabase",
  };
}

export function serializeReviewOrderDetail(row = {}) {
  const id = text(valueFor(row, ["id", "ID"]));
  const orderNumber = num(valueFor(row, ["order_number", "Order - ID", "Order ID", "order id"]));
  const quantityProgress = num(valueFor(row, ["quantity_progress", "Quantity Progress"]));
  const quantityRequested = num(valueFor(row, ["quantity_requested", "Quantity Requested", "quantity", "Quantity"]));
  const quantity = quantityRequested !== null ? quantityRequested : (quantityProgress !== null ? quantityProgress : 0);
  const quantityEdited = num(valueFor(row, ["quantity_edited_by_supervisor", "Quantity Edited by supervisor", "quantity_edited", "edited_quantity"]));
  const approval = approvalLabel(valueFor(row, ["sv_approval", "S.V Approval", "SV Approval"]));
  const orderType = text(valueFor(row, ["order_type", "Order Type"])) || null;
  const createdByName = text(valueFor(row, ["team_member_name", "teams_members", "Teams Members", "created_by_name", "created_by", "Created By"]));
  const createdById = text(valueFor(row, ["team_member_id", "team_members_id", "created_by_id", "owner_id"]));
  const sources = sourceKits(valueFor(row, ["source_kits", "Source Kits", "proposal_source_kits", "Proposal Source Kits"]));
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
    productUrl: text(valueFor(row, ["product_url", "Product URL"])) || null,
    productImage: null,
    unitPrice: num(valueFor(row, ["unit_price", "Unit price", "Unity Price", "Price"])),
    quantity,
    quantityRequested: quantityRequested !== null ? quantityRequested : quantity,
    quantityEdited,
    status: text(valueFor(row, ["status", "Status"])) || "",
    approval,
    approvalColor: approvalColor(approval),
    rejectedReason: text(valueFor(row, ["rejected_reason", "Rejected Reason", "Reject Reason", "rejection_reason", "Rejection Reason"])) || null,
    operationsApproval: text(valueFor(row, ["operations_approval", "Operations Approval", "operation_approval", "Operation Approval"])) || null,
    orderType,
    orderTypeColor: orderTypeColor(orderType),
    createdTime: dateValue(valueFor(row, ["notion_created_time", "created_time", "created_at", "Created time"])) || new Date().toISOString(),
    productTag: text(valueFor(row, ["product_tag", "Product Tag", "component_tag", "Component Tag", "tag", "Tag"])) || null,
    kitTag: text(valueFor(row, ["kit_tag", "Kit Tag", "kit_name", "Kit Name", "source_kit", "Source Kit"])) || null,
    kitFolderName: text(valueFor(row, ["kit_folder", "Kit Folder", "kit_folder_name", "Kit Folder Name"])) || null,
    sourceProposalId: text(valueFor(row, ["source_proposal_id", "Source Proposal ID", "proposal_id", "Proposal ID"])) || null,
    sourceProposalName: text(valueFor(row, ["source_proposal_name", "Source Proposal Name", "proposal_name", "Proposal Name"])) || null,
    sourceKits: sources,
    source: "supabase",
  };
}

function needsLegacyProposalLookup(item = {}) {
  const generated = item?.sourceProposalId || item?.sourceProposalName || /^created\s+from\s+proposal\s*:/i.test(text(item?.issueDescription));
  return Boolean(generated && !(Array.isArray(item?.sourceKits) && item.sourceKits.length));
}

export async function enrichOrderDetailGrouping(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return rows;
  if (rows.some(needsLegacyProposalLookup)) {
    const error = new Error("Legacy proposal source lookup is required for this order.");
    error.code = "DIRECT_ORDER_DETAILS_REQUIRES_LEGACY";
    throw error;
  }

  let catalog = { products: [] };
  let memberships = [];
  let kits = [];
  let folders = [];
  try {
    [catalog, memberships, kits, folders] = await Promise.all([
      getProductsCatalog().catch(() => ({ products: [] })),
      listKitMembership().catch(() => []),
      listKits({}).catch(() => []),
      listKitFolders({}).catch(() => []),
    ]);
  } catch {}

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const productByName = new Map();
  const productByUrl = new Map();
  for (const product of products) {
    const nameKey = normKey(product?.name);
    const urlKey = text(product?.url).toLowerCase();
    if (nameKey && !productByName.has(nameKey)) productByName.set(nameKey, product);
    if (urlKey && !productByUrl.has(urlKey)) productByUrl.set(urlKey, product);
  }

  const folderNameById = new Map((Array.isArray(folders) ? folders : []).map((folder) => [text(folder?.id), text(folder?.name) || "Unfiled Kits"]));
  const kitById = new Map((Array.isArray(kits) ? kits : []).map((kit) => [text(kit?.id), kit]));
  const membershipsByProduct = new Map();
  for (const entry of Array.isArray(memberships) ? memberships : []) {
    const productId = text(entry?.productId);
    if (!productId) continue;
    const list = (Array.isArray(entry?.kits) ? entry.kits : []).map((kitEntry) => {
      const kitId = text(kitEntry?.id);
      const kit = kitById.get(kitId) || {};
      return {
        kitId,
        kitName: text(kitEntry?.name) || text(kit?.name) || "Unassigned kit",
        folderId: text(kit?.folderId) || null,
        folderName: folderNameById.get(text(kit?.folderId)) || "Unfiled Kits",
      };
    });
    membershipsByProduct.set(productId, list);
  }

  return rows.map((item) => {
    const product = productByName.get(normKey(item?.productName)) || productByUrl.get(text(item?.productUrl).toLowerCase()) || null;
    const productId = text(item?.productId || product?.id) || null;
    const productTags = Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [];
    const productTag = text(item?.productTag) || productTags[0] || "Uncategorized";
    const itemMemberships = productId ? (membershipsByProduct.get(productId) || []) : [];
    const primaryMembership = itemMemberships[0] || null;
    const kitTag = text(item?.kitTag) || primaryMembership?.kitName || "Unassigned kit";
    const kitFolderName = text(item?.kitFolderName) || primaryMembership?.folderName || "Unfiled Kits";

    let sources = Array.isArray(item?.sourceKits) ? item.sourceKits : [];
    const targetQuantity = Math.abs(Number(item?.quantityProgress ?? item?.quantityEditedBySupervisor ?? item?.quantityRequested ?? item?.quantity ?? 0))
      || sources.reduce((sum, source) => sum + Number(source?.quantity || 0), 0);
    const storedKitTag = text(item?.kitTag);
    const proposalTotal = sources.reduce((sum, source) => sum + Number(source?.quantity || 0), 0);
    if (storedKitTag && sources.length > 1 && Math.round(targetQuantity) !== Math.round(proposalTotal)) {
      const matching = sources.filter((source) => normKey(source?.kitName) === normKey(storedKitTag));
      const exact = matching.filter((source) => Math.round(Number(source?.quantity) || 0) === Math.round(targetQuantity));
      if (exact.length === 1) sources = exact;
      else if (matching.length === 1 && targetQuantity <= Number(matching[0]?.quantity || 0)) sources = matching;
    }
    sources = scaleSourceBreakdown(sources, targetQuantity);
    const sourceBreakdown = sources.map((source) => {
      const kitId = text(source?.kitId);
      const membership = itemMemberships.find((entry) => text(entry?.kitId) === kitId);
      return {
        kitId: kitId || null,
        kitTag: text(source?.kitName) || "Direct components",
        kitFolderName: text(membership?.folderName) || (kitId ? "Unfiled Kits" : "Untracked / Direct"),
        quantity: Math.max(0, Number(source?.quantity) || 0),
        order: Number.isFinite(Number(source?.order)) ? Number(source.order) : 0,
      };
    });

    return {
      ...item,
      productId,
      productUrl: text(item?.productUrl) || text(product?.url) || null,
      productTags: productTags.length ? productTags : [productTag],
      productTag,
      kitMemberships: itemMemberships,
      kitTags: itemMemberships.map((entry) => entry.kitName).filter(Boolean),
      kitTag,
      kitFolderName,
      sourceKits: sources,
      sourceBreakdown,
    };
  });
}

export const __orderDetailsDataTest = {
  cleanIds,
  sourceKits,
  scaleSourceBreakdown,
  serializeOperationsOrderDetail,
  serializeReviewOrderDetail,
};
