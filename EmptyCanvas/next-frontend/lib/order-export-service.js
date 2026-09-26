import "server-only";

import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import deliveryReceiptPdfModule from "./deliveryReceiptPdf";
import maintenanceReceiptPdfModule from "./maintenanceReceiptPdf";
import { getProductsCatalog } from "./products-service";
import { loadOperationsOrderDetails } from "./operations-orders-data";

const { pipeDeliveryReceiptPDF } = deliveryReceiptPdfModule;
const { pipeMaintenanceReceiptPDF } = maintenanceReceiptPdfModule;

const ORDER_EXPORT_COLUMN_DEFS = [
  { key: "idCode", label: "ID Code", width: 14 },
  { key: "component", label: "Component", width: 36 },
  { key: "qty", label: "Quantity", width: 12 },
  { key: "receivedQty", label: "Received Qty", width: 14 },
  { key: "remainingQty", label: "Remaining Qty", width: 14 },
  { key: "deliveredQty", label: "Delivered Qty", width: 14 },
  { key: "reason", label: "Reason", width: 24 },
  { key: "issue", label: "Issue", width: 34 },
  { key: "link", label: "Component link", width: 54 },
  { key: "unit", label: "Unit cost", width: 14 },
  { key: "total", label: "Total cost", width: 14 },
];

const ORDER_EXPORT_SIGNATURE_OPTIONS = [
  "Storekeeper",
  "Operations",
  "Delivered to",
  "Received From",
];

function text(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function normKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function orderTypeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function roundQty(value, decimals = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function safeExportName(value = "order") {
  return String(value || "order")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function computeOrderIdRange(items = []) {
  const nums = (items || []).map((item) => Number(item?.orderIdNumber)).filter(Number.isFinite);
  if (nums.length) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max ? `ORD-${min}` : `ORD-${min} : ORD-${max}`;
  }
  const ids = (items || []).map((item) => text(item?.orderId)).filter(Boolean);
  if (!ids.length) return "Order";
  if (ids.length === 1) return ids[0];
  return `${ids[0]} : ${ids[ids.length - 1]}`;
}

function receiptPresentation(orderType) {
  const isWithdraw = orderTypeKey(orderType) === orderTypeKey("Withdraw Products");
  return {
    isWithdraw,
    documentTitle: isWithdraw ? "Withdrawal Receipt" : "Delivery Receipt",
    filePrefix: isWithdraw ? "withdrawal_receipt" : "delivery_receipt",
    recipientLabelLeft: isWithdraw ? "Received from" : "Delivered to",
    thirdSignatureLabel: isWithdraw ? "Store keeper" : null,
    signatureLabels: isWithdraw
      ? ["Received from", "Operations", "Store keeper"]
      : ["Store keeper", "Operations", "Delivered to"],
  };
}

function normalizeRepeatedComponentMode(value, fallback = "merge") {
  const raw = text(value).toLowerCase().replace(/[\s_]+/g, "-");
  if (["separate", "split", "keep-separate", "individual"].includes(raw)) return "separate";
  if (["merge", "merged", "combine", "combined", "group"].includes(raw)) return "merge";
  return String(fallback || "").toLowerCase() === "separate" ? "separate" : "merge";
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
  for (let index = 0; remaining > 0 && ranked.length; index = (index + 1) % ranked.length) {
    ranked[index].quantity += 1;
    remaining -= 1;
  }
  return scaled
    .filter((source) => Number(source.quantity || 0) > 0)
    .map(({ _fraction, _index, ...source }) => source);
}

function preferredCombinedSource(item = {}) {
  const sources = Array.isArray(item?.sourceBreakdown) ? item.sourceBreakdown.filter(Boolean) : [];
  if (!sources.length) return null;
  const genericFolder = sources.find((source) => normKey(source?.kitFolderName || source?.folderName) === normKey("Generic Kits"));
  if (genericFolder) return genericFolder;
  return sources.find((source) => /\bgeneric\b/i.test(text(source?.kitTag || source?.kitName))) || null;
}

function placeCombinedRows(rows = [], items = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const source = preferredCombinedSource((Array.isArray(items) ? items : [])[index] || {});
    if (!source) return row;
    return {
      ...row,
      kitTag: text(source?.kitTag || source?.kitName) || row?.kitTag || "Unassigned kit",
      kitFolderName: text(source?.kitFolderName || source?.folderName) || row?.kitFolderName || "Unfiled Kits",
      _sourceKitId: text(source?.kitId) || null,
    };
  });
}

function splitRowsBySources(rows = [], items = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeItems = Array.isArray(items) ? items : [];
  const out = [];
  for (let index = 0; index < safeRows.length; index += 1) {
    const row = safeRows[index] || {};
    const item = safeItems[index] || {};
    const qty = Number(row?.qty) || 0;
    const sourceBreakdown = Array.isArray(item?.sourceBreakdown) ? item.sourceBreakdown : [];
    const sources = scaleSourceBreakdown(sourceBreakdown, Math.abs(qty));
    if (!sources.length || qty === 0) {
      out.push(row);
      continue;
    }

    const sourceKey = (source = {}) => [
      text(source?.kitId),
      normKey(source?.kitTag || source?.kitName),
      normKey(source?.kitFolderName || source?.folderName),
    ].join("|");
    const metricMap = (value) => {
      const numeric = Number(value) || 0;
      if (Math.abs(numeric) <= 1e-9) return new Map();
      const metricSources = scaleSourceBreakdown(sourceBreakdown, Math.abs(numeric));
      const sign = numeric < 0 ? -1 : 1;
      return new Map(metricSources.map((source) => [sourceKey(source), sign * Math.max(0, Number(source?.quantity) || 0)]));
    };
    const receivedBySource = metricMap(row?.receivedQty);
    const remainingBySource = metricMap(row?.remainingQty);
    const deliveredBySource = metricMap(row?.deliveredQty);
    const sign = qty < 0 ? -1 : 1;

    for (const source of sources) {
      const sourceQty = sign * Math.max(0, Number(source?.quantity) || 0);
      if (!sourceQty) continue;
      const key = sourceKey(source);
      out.push({
        ...row,
        qty: sourceQty,
        receivedQty: receivedBySource.get(key) || 0,
        remainingQty: remainingBySource.get(key) || 0,
        deliveredQty: deliveredBySource.get(key) || 0,
        total: sourceQty * (Number(row?.unit) || 0),
        kitTag: text(source?.kitTag || source?.kitName) || row?.kitTag || "Unassigned kit",
        kitFolderName: text(source?.kitFolderName || source?.folderName) || row?.kitFolderName || "Unfiled Kits",
        _sourceKitId: text(source?.kitId) || null,
      });
    }
  }
  return out;
}

async function buildProductMaps() {
  const catalog = await getProductsCatalog().catch(() => ({ products: [] }));
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const byName = new Map();
  const byId = new Map();
  for (const product of products) {
    const nameKey = normKey(product?.name);
    const id = text(product?.id);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
    if (id && !byId.has(id)) byId.set(id, product);
  }
  return { products, byName, byId };
}

async function buildOrderExportPayload(orderIds = [], account = {}, { repeatedComponentMode = "merge" } = {}) {
  const items = await loadOperationsOrderDetails(orderIds);
  if (!Array.isArray(items) || !items.length) {
    const error = new Error("Orders not found");
    error.status = 404;
    throw error;
  }

  const productMaps = await buildProductMaps();
  const createdTimes = items
    .map((item) => new Date(item?.createdTime || Date.now()))
    .filter((date) => !Number.isNaN(date.getTime()));
  const createdAt = createdTimes.length
    ? new Date(Math.min(...createdTimes.map((date) => date.getTime())))
    : new Date();

  const first = items[0] || {};
  const orderIdRange = computeOrderIdRange(items);
  const teamMember = text(first?.createdByName || first?.assignedToName);
  const operationsBy = text(first?.operationsByName || account?.username || account?.name);
  const receiptView = receiptPresentation(first?.orderType || "Request Products");

  const rows = [];
  let grandQty = 0;
  let grandTotal = 0;
  for (const item of items) {
    const product = productMaps.byName.get(normKey(item?.productName)) || null;
    const qtyCandidate = item?.quantityReceived !== null && typeof item?.quantityReceived !== "undefined"
      ? item.quantityReceived
      : (item?.quantityProgress !== null && typeof item?.quantityProgress !== "undefined" ? item.quantityProgress : item?.quantity);
    const qty = Number.isFinite(Number(qtyCandidate)) ? Number(qtyCandidate) : 0;
    const baseCandidate = item?.quantity !== null && typeof item?.quantity !== "undefined"
      ? item.quantity
      : (item?.quantityRequested !== null && typeof item?.quantityRequested !== "undefined" ? item.quantityRequested : qty);
    const baseQty = Number.isFinite(Number(baseCandidate)) ? Number(baseCandidate) : 0;
    const receivedQty = item?.quantityReceived !== null && typeof item?.quantityReceived !== "undefined" && Number.isFinite(Number(item.quantityReceived))
      ? Number(item.quantityReceived)
      : 0;
    const remainingQty = item?.quantityRemaining !== null && typeof item?.quantityRemaining !== "undefined" && Number.isFinite(Number(item.quantityRemaining))
      ? Number(item.quantityRemaining)
      : roundQty(baseQty - receivedQty);
    const finalDeliveryStage = /(arrived|delivered|received|archive)/i.test(text(item?.status));
    const deliveredQty = finalDeliveryStage ? (Math.abs(receivedQty) > 1e-9 ? receivedQty : baseQty) : 0;
    const unitCandidate = item?.unitPrice !== null && typeof item?.unitPrice !== "undefined" ? item.unitPrice : product?.unitPrice;
    const unit = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : 0;
    const total = qty * unit;
    grandQty += qty;
    grandTotal += total;
    rows.push({
      idCode: text(item?.customizeId || product?.displayId),
      component: text(item?.productName || product?.name) || "Unknown Product",
      qty,
      receivedQty,
      remainingQty,
      deliveredQty,
      reason: text(item?.reason) || "No Reason",
      issue: text(item?.actualIssueDescription || item?.issueDescription || item?.reason) || "No Issue",
      issueDescription: item?.issueDescription || null,
      actualIssueDescription: item?.actualIssueDescription || null,
      repairAction: item?.repairAction || null,
      resolutionMethod: item?.resolutionMethod || null,
      sparePartsReplacedIds: Array.isArray(item?.sparePartsReplacedIds) ? item.sparePartsReplacedIds : [],
      sparePartsReplacedNames: Array.isArray(item?.sparePartsReplacedNames) ? item.sparePartsReplacedNames : [],
      sparePartsReplacedName: item?.sparePartsReplacedName || null,
      link: text(item?.productUrl || product?.url),
      productTag: text(item?.productTag || item?.productTags?.[0]) || "Uncategorized",
      kitTag: text(item?.kitTag) || "Unassigned kit",
      kitFolderName: text(item?.kitFolderName) || "Unfiled Kits",
      unit,
      total,
    });
  }

  const mode = normalizeRepeatedComponentMode(repeatedComponentMode, "merge");
  const exportRows = mode === "separate" ? splitRowsBySources(rows, items) : placeCombinedRows(rows, items);
  const reasonCounts = new Map();
  for (const row of exportRows) {
    const key = text(row?.reason) || "No Reason";
    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
  }
  const groupReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "No Reason";

  return {
    items,
    rows: exportRows,
    grandQty,
    grandTotal,
    repeatedComponentMode: mode,
    createdAt,
    orderIdRange,
    teamMember,
    operationsBy,
    groupReason,
    receiptView,
    first,
    productMaps,
  };
}

function normalizeOrderExportColumns(columns, { tab = "" } = {}) {
  const defs = new Map(ORDER_EXPORT_COLUMN_DEFS.map((column) => [column.key, column]));
  const tabKey = text(tab).toLowerCase();
  const defaultKeys = (tabKey === "received" || tabKey === "delivered")
    ? ["idCode", "component", "qty"]
    : ["idCode", "component", "qty", "unit", "total"];
  const raw = Array.isArray(columns) ? columns : String(columns || "").split(",");
  let selected = raw.map((key) => text(key)).filter((key) => defs.has(key));
  if (!selected.length) selected = defaultKeys.slice();
  if (!selected.includes("component")) selected.unshift("component");
  return [...new Set(selected)];
}

function selectedColumnDefs(columns, opts = {}) {
  const defs = new Map(ORDER_EXPORT_COLUMN_DEFS.map((column) => [column.key, column]));
  return normalizeOrderExportColumns(columns, opts).map((key) => defs.get(key)).filter(Boolean);
}

function containsArabic(value) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(value || ""));
}

function splitLegacyInstructionText(value) {
  const raw = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return { englishText: "", arabicText: "" };
  const english = [];
  const arabic = [];
  const blocks = raw.split(/\n[ \t]*\n+/).map((part) => text(part)).filter(Boolean);
  for (const block of blocks.length ? blocks : [raw]) {
    (containsArabic(block) ? arabic : english).push(block);
  }
  return { englishText: english.join("\n\n"), arabicText: arabic.join("\n\n") };
}

function normalizeInstruction(instruction) {
  if (!instruction) return { title: "", englishText: "", arabicText: "", text: "" };
  if (typeof instruction === "string") {
    const legacy = splitLegacyInstructionText(String(instruction || "").slice(0, 4000));
    const hasBody = Boolean(legacy.englishText || legacy.arabicText);
    return {
      title: hasBody ? "Instructions" : "",
      englishText: legacy.englishText.slice(0, 2000),
      arabicText: legacy.arabicText.slice(0, 2000),
      text: [legacy.englishText, legacy.arabicText].filter(Boolean).join("\n\n").slice(0, 4000),
    };
  }
  const title = text(instruction?.title || "Instructions").slice(0, 120);
  const legacy = splitLegacyInstructionText(instruction?.text || instruction?.body || "");
  const englishText = text(instruction?.englishText || instruction?.english || legacy.englishText).slice(0, 2000);
  const arabicText = text(instruction?.arabicText || instruction?.arabic || legacy.arabicText).slice(0, 2000);
  const hasBody = Boolean(englishText || arabicText);
  return {
    title: hasBody ? (title || "Instructions") : "",
    englishText,
    arabicText,
    text: [englishText, arabicText].filter(Boolean).join("\n\n"),
  };
}

function normalizeSignatureLabels(value, fallback = []) {
  const canonical = new Map(ORDER_EXPORT_SIGNATURE_OPTIONS.map((label) => [label.toLowerCase().replace(/[^a-z]/g, ""), label]));
  if (Array.isArray(value)) {
    return [...new Set(value.map((label) => canonical.get(text(label).toLowerCase().replace(/[^a-z]/g, ""))).filter(Boolean))];
  }
  return [...new Set((Array.isArray(fallback) ? fallback : []).map((label) => canonical.get(text(label).toLowerCase().replace(/[^a-z]/g, ""))).filter(Boolean))];
}

function normalizeSortMode(value) {
  const key = text(value).toLowerCase();
  if (["kit-tag", "kits-tag", "kit", "kits"].includes(key)) return "kit-tag";
  if (["product-tag", "products-tag", "product", "products"].includes(key)) return "product-tag";
  return "";
}

function naturalCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function groupRows(rows = [], sortMode = "") {
  const mode = normalizeSortMode(sortMode);
  if (!mode) return [];
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const isKit = mode === "kit-tag";
    const tag = isKit ? (text(row?.kitTag) || "Unassigned kit") : (text(row?.productTag) || "Uncategorized");
    const folderName = isKit ? (text(row?.kitFolderName) || "Unfiled Kits") : "";
    const key = `${folderName.toLowerCase()}|${tag.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { tag, folderName, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, rows: group.rows.slice().sort((a, b) => naturalCompare(a?.component, b?.component)) }))
    .sort((a, b) => naturalCompare(a.folderName, b.folderName) || naturalCompare(a.tag, b.tag));
}

function cellValue(row = {}, key = "") {
  switch (key) {
    case "idCode": return row.idCode || "";
    case "component": return row.component || "";
    case "qty": return Number(row.qty) || 0;
    case "receivedQty": return Number(row.receivedQty) || 0;
    case "remainingQty": return Number(row.remainingQty) || 0;
    case "deliveredQty": return Number(row.deliveredQty) || 0;
    case "reason": return row.reason || "";
    case "issue": return row.issue || row.actualIssueDescription || row.issueDescription || row.reason || "";
    case "link": return row.link || row.url || row.componentLink || row.href || "";
    case "unit": return row.unit === null || typeof row.unit === "undefined" ? "" : Number(row.unit);
    case "total": return row.total === null || typeof row.total === "undefined" ? "" : Number(row.total);
    default: return "";
  }
}

function excelColumnName(index) {
  let number = Math.max(1, Number(index) || 1);
  let out = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    number = Math.floor((number - 1) / 26);
  }
  return out;
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once("end", finish);
    stream.once("finish", finish);
    stream.once("close", finish);
    stream.once("error", fail);
  });
}

async function renderPipedPdf(renderer, payload) {
  const stream = new PassThrough();
  const bufferPromise = collectStream(stream);
  await renderer(payload, stream);
  return await bufferPromise;
}

async function renderDeliveryPdf({ payload, tab, columns, instruction, sortMode, signatureLabels }) {
  const selectedExportColumns = normalizeOrderExportColumns(columns, { tab });
  const hideCosts = !selectedExportColumns.includes("unit") && !selectedExportColumns.includes("total");
  const exportInstruction = normalizeInstruction(instruction);
  const exportSortMode = normalizeSortMode(sortMode);
  const exportSignatureLabels = normalizeSignatureLabels(signatureLabels, payload.receiptView.signatureLabels);
  const buffer = await renderPipedPdf(pipeDeliveryReceiptPDF, {
    orderId: payload.orderIdRange,
    createdAt: payload.createdAt,
    teamMember: payload.teamMember,
    preparedBy: payload.groupReason,
    rows: payload.rows,
    groupMode: exportSortMode,
    grandQty: payload.grandQty,
    grandTotal: payload.grandTotal,
    metaLayout: "teamReasonFirst",
    showReasonTagBar: false,
    groupByReason: false,
    headerColorKey: payload.groupReason,
    showCosts: !hideCosts,
    exportColumns: selectedExportColumns,
    instructionTitle: exportInstruction.title,
    instructionEnglishText: exportInstruction.englishText,
    instructionArabicText: exportInstruction.arabicText,
    instructionText: exportInstruction.text,
    documentTitle: payload.receiptView.documentTitle,
    recipientLabelLeft: payload.receiptView.recipientLabelLeft,
    thirdSignatureLabel: payload.receiptView.thirdSignatureLabel,
    signatureLabels: exportSignatureLabels,
  });
  return {
    buffer,
    fileName: `${payload.receiptView.filePrefix}_${safeExportName(payload.orderIdRange)}.pdf`,
    contentType: "application/pdf",
  };
}

function uniqueStrings(value, { splitComma = false } = {}) {
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
    const key = normKey(raw) || raw;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  if (Array.isArray(value)) value.forEach(add);
  else add(value);
  return out;
}

function placeholderSparePartName(value) {
  return /^(?:none|no\s+spare\s+parts?|n\/?a|—|-)?$/i.test(text(value));
}

function resolveSparePartsForItem(item = {}, productMaps = {}) {
  const out = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const id = text(entry?.id || entry?.productId || entry?.sparePartId);
    let name = text(entry?.name || entry?.label || entry?.component || entry?.sparePartName);
    let qty = Number(entry?.qty ?? entry?.quantity ?? entry?.count ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.max(1, Math.round(qty));
    const product = (id && productMaps?.byId?.get?.(id)) || (name && productMaps?.byName?.get?.(normKey(name))) || null;
    if (!name) name = text(product?.name);
    if (!id && placeholderSparePartName(name)) return;
    const key = `${id || normKey(name)}|${qty}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      id: id || text(product?.id),
      idCode: text(entry?.displayId || entry?.idCode || product?.displayId),
      name: name || "Spare part",
      unit: Number.isFinite(Number(entry?.unitPrice ?? entry?.unit))
        ? Number(entry?.unitPrice ?? entry?.unit)
        : (Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : 0),
      qty,
      link: text(entry?.url || entry?.link || product?.url),
    });
  };

  const explicit = Array.isArray(item?.sparePartsReplacedEntries) ? item.sparePartsReplacedEntries : [];
  explicit.forEach(add);
  for (const id of uniqueStrings(item?.sparePartsReplacedIds || item?.sparePartsReplacedId || [])) add({ id });
  for (const name of uniqueStrings(item?.sparePartsReplacedNames?.length ? item.sparePartsReplacedNames : (item?.sparePartsReplacedName || []), { splitComma: true })) add({ name });
  return out;
}

function resolveSpareEntries(entries = [], productMaps = {}) {
  return resolveSparePartsForItem({ sparePartsReplacedEntries: Array.isArray(entries) ? entries : [] }, productMaps);
}

function normalizeMaintenanceSpareColumns(value) {
  const allowed = ["idCode", "component", "qty", "unitCost", "totalCost"];
  const requested = Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];
  const selected = requested.filter((key) => allowed.includes(key));
  return selected.length ? [...new Set(selected)] : allowed;
}

async function renderMaintenancePdf({ payload, template = false, sparePartColumns, checklist }) {
  if (orderTypeKey(payload?.first?.orderType) !== orderTypeKey("Request Maintenance")) {
    const error = new Error("This export is only available for maintenance orders.");
    error.status = 400;
    throw error;
  }

  const selectedChecklist = uniqueStrings(Array.isArray(checklist) ? checklist : [], { splitComma: false })
    .map((item) => text(item).slice(0, 800))
    .filter(Boolean);
  const checklistProvided = Array.isArray(checklist);
  const maintenanceItems = Array.isArray(payload.items) ? payload.items : [];
  const explicitLogDates = maintenanceItems
    .map((item) => item?.maintenanceLoggedAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  const legacyUpdatedDates = maintenanceItems
    .filter((item) => Boolean(item?.serialNumber || item?.resolutionMethod || item?.actualIssueDescription || item?.repairAction || item?.sparePartsNeededEntries?.length || item?.sparePartsReplacedEntries?.length || item?.maintenanceChecklist?.length))
    .map((item) => item?.updatedTime)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  const reportDate = template
    ? new Date()
    : (explicitLogDates.length
      ? new Date(Math.max(...explicitLogDates.map((value) => value.getTime())))
      : (legacyUpdatedDates.length ? new Date(Math.max(...legacyUpdatedDates.map((value) => value.getTime()))) : new Date()));

  const componentLogs = maintenanceItems.map((item, index) => ({
    idCode: payload.rows?.[index]?.idCode || "",
    component: item?.productName || payload.rows?.[index]?.component || "Unknown Product",
    issueDescription: item?.issueDescription || item?.reason || "No Issue",
    serialNumber: template ? "" : (item?.serialNumber || "—"),
    actualIssueDescription: template ? "" : (item?.actualIssueDescription || "—"),
    repairAction: template ? "" : (item?.repairAction || "—"),
    resolutionMethod: template ? "" : (item?.resolutionMethod || "—"),
    sparePartsReplacedIds: template ? [] : (item?.sparePartsReplacedIds || []),
    sparePartsReplacedNames: template ? [] : (item?.sparePartsReplacedNames || []),
    sparePartsReplacedName: template ? "" : (item?.sparePartsReplacedName || ""),
    sparePartsNeeded: template ? [] : resolveSpareEntries(item?.sparePartsNeededEntries || [], payload.productMaps),
    spareParts: template ? [] : resolveSparePartsForItem(item, payload.productMaps),
    maintenanceChecklist: checklistProvided ? selectedChecklist : (template ? [] : (Array.isArray(item?.maintenanceChecklist) ? item.maintenanceChecklist : [])),
    link: item?.productUrl || payload.rows?.[index]?.link || "",
  }));

  const first = payload.first || {};
  const buffer = await renderPipedPdf(pipeMaintenanceReceiptPDF, {
    template,
    orderId: payload.orderIdRange,
    createdAt: payload.createdAt,
    reportDate,
    requestedBy: payload.teamMember,
    teamMember: payload.teamMember,
    operationsBy: payload.operationsBy,
    issueDescription: first?.issueDescription || "—",
    serialNumber: template ? "" : (first?.serialNumber || "—"),
    actualIssueDescription: template ? "" : (first?.actualIssueDescription || "—"),
    repairAction: template ? "" : (first?.repairAction || "—"),
    resolutionMethod: template ? "" : (first?.resolutionMethod || "—"),
    sparePartsReplacedList: template ? [] : (first?.sparePartsReplacedNames || []),
    sparePartColumns: normalizeMaintenanceSpareColumns(sparePartColumns),
    checklist: selectedChecklist,
    rows: payload.rows,
    componentLogs,
    maintenanceReceiptName: first?.maintenanceReceiptName || "",
    maintenanceReceiptUrl: first?.maintenanceReceiptUrl || "",
  });
  return {
    buffer,
    fileName: `${template ? "maintenance_template" : "maintenance_report"}_${safeExportName(payload.orderIdRange)}.pdf`,
    contentType: "application/pdf",
  };
}

async function renderProposalStyleExcel(payload, { selectedColumns = [], exportInstruction, exportSortMode = "product-tag" } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Hub";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Order");
  const includeKitColumn = exportSortMode === "kit-tag";
  const excelColumns = [
    ...(includeKitColumn ? [{ key: "__kitTag", label: "Kit", width: 16, kitTag: true }] : []),
    ...(Array.isArray(selectedColumns) ? selectedColumns : []).map((column) => ({ ...column, width: column.width || 16 })),
  ];
  const lastTableCol = Math.max(1, excelColumns.length);
  const visualLastCol = Math.max(2, lastTableCol);
  const borderColor = { argb: "FF9CA3AF" };
  const borderThin = {
    top: { style: "thin", color: borderColor }, left: { style: "thin", color: borderColor },
    bottom: { style: "thin", color: borderColor }, right: { style: "thin", color: borderColor },
  };
  const numberFmtInt = "#,##0;-#,##0;0";
  const numberFmtDec = "#,##0.##;-#,##0.##;0";
  const numFmtFor = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9 ? numberFmtInt : numberFmtDec;
  };
  excelColumns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width || 16; });

  sheet.mergeCells(1, 1, 1, visualLastCol);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Order Report — ${payload.orderIdRange || "Order"}`;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, visualLastCol);
  const metaCell = sheet.getCell(2, 1);
  const generatedAtLabel = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });
  metaCell.value = `Team member: ${payload.teamMember || "—"}  •  Reason: ${payload.groupReason || "—"}  •  Generated: ${generatedAtLabel}`;
  metaCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  metaCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 20;

  sheet.mergeCells("A3:B3");
  const summaryHead = sheet.getCell("A3");
  summaryHead.value = "Summary";
  summaryHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHead.alignment = { horizontal: "center", vertical: "middle" };
  summaryHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  summaryHead.border = borderThin;
  sheet.getCell("B3").border = borderThin;

  [["Total requested items", Number(payload.rows?.length || 0)], ["Total quantity", Number(payload.grandQty || 0)], ["Total cost", Number(payload.grandTotal || 0)]].forEach(([label, value], index) => {
    const rowIndex = 4 + index;
    const labelCell = sheet.getCell(rowIndex, 1);
    const valueCell = sheet.getCell(rowIndex, 2);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: "FF111827" } };
    labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    valueCell.value = value;
    valueCell.numFmt = index === 2 ? '"£"#,##0.00' : numFmtFor(value);
    valueCell.font = { bold: true, color: { argb: index === 2 ? "FFC2410C" : "FF2563EB" } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    labelCell.border = borderThin;
    valueCell.border = borderThin;
    sheet.getRow(rowIndex).height = 18;
  });
  sheet.addRow([]);

  const instruction = exportInstruction || { title: "", englishText: "", arabicText: "" };
  const instructionLastCol = excelColumnName(Math.max(2, visualLastCol));
  if (instruction.englishText || instruction.arabicText) {
    const heading = text(instruction.title) && text(instruction.title).toLowerCase() !== "instructions" ? text(instruction.title) : "Instructions";
    const headingRow = sheet.addRow([heading]);
    sheet.mergeCells(`A${headingRow.number}:${instructionLastCol}${headingRow.number}`);
    headingRow.height = 23;
    headingRow.getCell(1).font = { bold: true, color: { argb: "FFB42318" }, size: 11 };
    headingRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1F2" } };
    headingRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    headingRow.getCell(1).border = { top: { style: "thin", color: { argb: "FFF87171" } }, left: { style: "thin", color: { argb: "FFF87171" } }, bottom: { style: "thin", color: { argb: "FFF87171" } }, right: { style: "thin", color: { argb: "FFF87171" } } };
    const addInstructionRow = (value, isArabic = false) => {
      const body = text(value);
      if (!body) return;
      const row = sheet.addRow([body]);
      sheet.mergeCells(`A${row.number}:${instructionLastCol}${row.number}`);
      row.height = Math.min(160, Math.max(46, 30 + Math.ceil(body.length / 90) * 15));
      row.getCell(1).alignment = { horizontal: isArabic ? "right" : "left", readingOrder: isArabic ? "rtl" : "ltr", vertical: "top", wrapText: true };
      row.getCell(1).font = { color: { argb: "FF374151" } };
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      row.getCell(1).border = borderThin;
    };
    addInstructionRow(instruction.englishText, false);
    addInstructionRow(instruction.arabicText, true);
    sheet.addRow([]);
  }

  const headerRowIndex = sheet.rowCount + 1;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 20;
  excelColumns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label || column.header || column.key;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.border = borderThin;
  });

  const kitStyles = [
    { fill: "FFD9EAF7", color: "FF1F4E79" }, { fill: "FFE2F0D9", color: "FF375623" }, { fill: "FFFFE5D0", color: "FF9A3412" },
    { fill: "FFEDE9FE", color: "FF5B21B6" }, { fill: "FFFCE7F3", color: "FF9D174D" }, { fill: "FFE0F2FE", color: "FF075985" },
    { fill: "FFFEF3C7", color: "FF92400E" }, { fill: "FFDCFCE7", color: "FF166534" }, { fill: "FFFEE2E2", color: "FF991B1B" },
    { fill: "FFE0E7FF", color: "FF3730A3" },
  ];
  let visualIndex = 0;
  const addComponentRow = (item, kitName = "", kitStyle = null) => {
    const values = excelColumns.map((column) => column.kitTag ? text(kitName) : cellValue(item, column.key));
    const row = sheet.addRow(values);
    row.height = 18;
    excelColumns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (column.kitTag) {
        const style = kitStyle || kitStyles[0];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
        cell.font = { bold: true, color: { argb: style.color } };
      } else if (visualIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      }
      if (["qty", "receivedQty", "remainingQty", "deliveredQty"].includes(column.key)) cell.numFmt = numFmtFor(cell.value);
      if (column.key === "unit" || column.key === "total") cell.numFmt = '"£"#,##0.00';
      if (column.key === "total") cell.font = { bold: true, color: { argb: "FFC2410C" } };
      if (column.key === "component" && item?.link && /^https?:\/\//i.test(text(item.link))) {
        cell.value = { text: text(item.component || cell.value || "Component"), hyperlink: text(item.link) };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      } else if (column.key === "link" && item?.link && /^https?:\/\//i.test(text(item.link))) {
        cell.value = { text: text(item.link), hyperlink: text(item.link) };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });
    visualIndex += 1;
  };
  const addMergedHeaderRow = (label, { fill, color, height = 19 } = {}) => {
    const row = sheet.addRow([label]);
    if (lastTableCol > 1) sheet.mergeCells(row.number, 1, row.number, lastTableCol);
    row.height = height;
    for (let column = 1; column <= lastTableCol; column += 1) {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: color } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = borderThin;
    }
  };

  const groups = groupRows(payload.rows || [], exportSortMode);
  if (!payload.rows?.length) {
    const row = sheet.addRow(["No components found."]);
    row.font = { italic: true, color: { argb: "FF6B7280" } };
  } else if (exportSortMode === "kit-tag" && groups.length) {
    const folders = new Map();
    for (const group of groups) {
      const folderName = text(group?.folderName) || "Unfiled Kits";
      if (!folders.has(folderName)) folders.set(folderName, []);
      folders.get(folderName).push(group);
    }
    for (const [folderName, kitGroups] of folders.entries()) {
      addMergedHeaderRow(`${folderName} (${kitGroups.length} kit${kitGroups.length === 1 ? "" : "s"})`, { fill: "FF07101F", color: "FFFFFFFF", height: 21 });
      kitGroups.forEach((group, index) => {
        const style = kitStyles[index % kitStyles.length];
        (group.rows || []).forEach((item) => addComponentRow(item, group.tag || "Unassigned kit", style));
      });
    }
  } else if (groups.length) {
    for (const group of groups) {
      addMergedHeaderRow(`${group.tag || "Uncategorized"} (${group.rows?.length || 0} item${group.rows?.length === 1 ? "" : "s"})`, { fill: "FFFFF7ED", color: "FF9A3412" });
      (group.rows || []).forEach((item) => addComponentRow(item));
    }
  } else {
    (payload.rows || []).forEach((item) => addComponentRow(item));
  }

  for (let column = 1; column <= lastTableCol; column += 1) {
    let maxLen = String(excelColumns[column - 1]?.label || excelColumns[column - 1]?.key || "").length;
    for (let row = 3; row <= sheet.rowCount; row += 1) {
      const value = sheet.getRow(row).getCell(column).value;
      const valueText = value && typeof value === "object" && value.text ? value.text : String(value ?? "");
      if (valueText) maxLen = Math.max(maxLen, valueText.length);
    }
    sheet.getColumn(column).width = Math.min(42, Math.max(11, maxLen + 2));
  }
  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function renderMaintenanceExcel(payload, { selectedColumns = [], exportInstruction } = {}) {
  const columnCount = Math.max(1, selectedColumns.length);
  const lastCol = excelColumnName(columnCount);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Hub";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Order");
  const borderThin = {
    top: { style: "thin", color: { argb: "FF000000" } }, left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } }, right: { style: "thin", color: { argb: "FF000000" } },
  };
  const borderLight = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
  const instructionLastCol = excelColumnName(Math.max(4, columnCount));
  if (exportInstruction.englishText || exportInstruction.arabicText) {
    const headingRow = sheet.addRow(["Instructions"]);
    sheet.mergeCells(`A${headingRow.number}:${instructionLastCol}${headingRow.number}`);
    headingRow.height = 23;
    headingRow.getCell(1).font = { bold: true, color: { argb: "FF9A3412" }, size: 12 };
    headingRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
    headingRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    headingRow.getCell(1).border = borderThin;
    const title = text(exportInstruction.title);
    if (title && title.toLowerCase() !== "instructions") {
      const titleRow = sheet.addRow([title]);
      sheet.mergeCells(`A${titleRow.number}:${instructionLastCol}${titleRow.number}`);
      titleRow.height = 21;
      titleRow.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
      titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFCF7" } };
      titleRow.getCell(1).alignment = { vertical: "middle", horizontal: containsArabic(title) ? "right" : "left", readingOrder: containsArabic(title) ? "rtl" : "ltr", wrapText: true };
      titleRow.getCell(1).border = borderThin;
    }
    const addLanguage = (label, value, isArabic = false) => {
      const body = text(value);
      if (!body) return;
      const labelRow = sheet.addRow([label]);
      sheet.mergeCells(`A${labelRow.number}:${instructionLastCol}${labelRow.number}`);
      labelRow.height = 19;
      labelRow.getCell(1).font = { bold: true, color: { argb: isArabic ? "FF0F766E" : "FF475467" }, size: 9 };
      labelRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: isArabic ? "FFF0FDFA" : "FFF8FAFC" } };
      labelRow.getCell(1).alignment = { vertical: "middle", horizontal: isArabic ? "right" : "left", readingOrder: isArabic ? "rtl" : "ltr", wrapText: true };
      labelRow.getCell(1).border = borderThin;
      const bodyRow = sheet.addRow([body]);
      sheet.mergeCells(`A${bodyRow.number}:${instructionLastCol}${bodyRow.number}`);
      bodyRow.height = Math.min(160, Math.max(46, 30 + Math.ceil(body.length / 90) * 15));
      bodyRow.getCell(1).alignment = { vertical: "top", horizontal: isArabic ? "right" : "left", readingOrder: isArabic ? "rtl" : "ltr", wrapText: true };
      bodyRow.getCell(1).font = { color: { argb: "FF374151" } };
      bodyRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: isArabic ? "FFF7FFFD" : "FFFFFCF7" } };
      bodyRow.getCell(1).border = borderThin;
    };
    addLanguage("English", exportInstruction.englishText, false);
    addLanguage("العربية", exportInstruction.arabicText, true);
    sheet.addRow([]);
  }

  const metaStartRow = sheet.rowCount + 1;
  const formatDateTime = (date) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return String(date || "-");
      return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return String(date || "-"); }
  };
  sheet.addRow(["Order ID", payload.orderIdRange, "Date", formatDateTime(new Date())]);
  sheet.addRow(["Team member", payload.teamMember || "", "Prepared by (Operations)", payload.operationsBy || "—"]);
  for (let row = metaStartRow; row < metaStartRow + 2; row += 1) {
    const current = sheet.getRow(row);
    current.height = 20;
    for (let column = 1; column <= 4; column += 1) {
      const cell = current.getCell(column);
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      if (column === 1 || column === 3) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
      cell.font = { bold: true };
    }
  }
  sheet.addRow([]);

  const titleRow = sheet.addRow(["Maintenance spare parts replacement"]);
  sheet.mergeCells(`A${titleRow.number}:${lastCol}${titleRow.number}`);
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = titleRow.getCell(column);
    cell.border = borderThin;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    cell.font = { bold: true, color: { argb: "FF111827" } };
  }
  const header = sheet.addRow(selectedColumns.map((column) => column.label));
  header.font = { bold: true, color: { argb: "FF111827" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = borderThin;
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  let maintenanceGrandTotal = 0;
  const addItemRow = (item) => {
    const values = selectedColumns.map((column) => cellValue(item, column.key));
    const row = sheet.addRow(values);
    selectedColumns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      if (column.key === "link" && values[index]) {
        cell.value = { text: String(values[index]), hyperlink: String(values[index]) };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
      if (column.key === "qty") cell.numFmt = "0.######";
      if (column.key === "unit" || column.key === "total") cell.numFmt = '"£"#,##0.00';
    });
    row.eachCell((cell) => { cell.border = borderLight; cell.alignment = { vertical: "middle", wrapText: true }; });
  };
  const items = (payload.items || []).slice().sort((a, b) => text(a?.productName).localeCompare(text(b?.productName)));
  for (const item of items) {
    const spareParts = resolveSparePartsForItem(item, payload.productMaps);
    const itemIssue = item?.actualIssueDescription || item?.issueDescription || item?.reason || "No Issue";
    const rows = spareParts.length ? spareParts : [{ name: "No spare parts replaced", idCode: "", unit: 0, qty: 1, link: "" }];
    for (const part of rows) {
      const unit = Number.isFinite(Number(part?.unit)) ? Number(part.unit) : 0;
      const qty = Number.isFinite(Number(part?.qty)) ? Number(part.qty) : 1;
      const total = unit * qty;
      maintenanceGrandTotal += total;
      addItemRow({ idCode: part?.idCode || "", component: part?.name || item?.productName || "Spare part", qty, issue: itemIssue, link: part?.link || "", unit, total });
    }
  }
  if (selectedColumns.some((column) => column.key === "total")) {
    const values = new Array(columnCount).fill("");
    const totalIndex = selectedColumns.findIndex((column) => column.key === "total");
    const labelIndex = Math.max(0, Math.min(columnCount - 1, totalIndex > 0 ? totalIndex - 1 : 0));
    values[labelIndex] = "Spare parts total cost";
    values[totalIndex >= 0 ? totalIndex : columnCount - 1] = maintenanceGrandTotal;
    const row = sheet.addRow(values);
    row.font = { bold: true, color: { argb: "FF111827" } };
    row.eachCell((cell, index) => {
      cell.border = borderThin;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (index - 1 === totalIndex) cell.numFmt = '"£"#,##0.00';
    });
  }
  sheet.columns = selectedColumns.map((column) => ({ width: column.width || 16 }));
  sheet.views = [{ state: "frozen", ySplit: metaStartRow + 2 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function renderExcel({ payload, tab, columns, instruction, sortMode }) {
  const selectedColumns = selectedColumnDefs(columns, { tab });
  const exportInstruction = normalizeInstruction(instruction);
  const exportSortMode = normalizeSortMode(sortMode);
  const isMaintenance = orderTypeKey(payload?.first?.orderType) === orderTypeKey("Request Maintenance");
  const buffer = isMaintenance
    ? await renderMaintenanceExcel(payload, { selectedColumns, exportInstruction })
    : await renderProposalStyleExcel(payload, { selectedColumns, exportInstruction, exportSortMode });
  return {
    buffer,
    fileName: `${isMaintenance ? "maintenance_order" : "order"}_${safeExportName(payload.orderIdRange)}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export async function renderOrderExport({
  account = {},
  orderIds = [],
  kind = "pdf",
  tab = "",
  columns = null,
  instruction = null,
  sortMode = null,
  signatureLabels = null,
  repeatedComponentMode = "merge",
  template = false,
  sparePartColumns = null,
  checklist = null,
} = {}) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map((id) => text(id)).filter(Boolean))].slice(0, 500);
  if (!ids.length) {
    const error = new Error("orderIds required");
    error.status = 400;
    throw error;
  }
  if (!ids.every((id) => /^\d+$/.test(id))) {
    const error = new Error("Only migrated Supabase order IDs are supported by the Next export service.");
    error.status = 400;
    throw error;
  }
  const payload = await buildOrderExportPayload(ids, account, { repeatedComponentMode });
  const cleanKind = text(kind).toLowerCase();
  if (cleanKind === "maintenance-pdf") return await renderMaintenancePdf({ payload, template, sparePartColumns, checklist });
  if (cleanKind === "excel") return await renderExcel({ payload, tab, columns, instruction, sortMode });
  return await renderDeliveryPdf({ payload, tab, columns, instruction, sortMode, signatureLabels });
}

export const __orderExportServiceTest = {
  normalizeOrderExportColumns,
  normalizeInstruction,
  normalizeSignatureLabels,
  normalizeSortMode,
  normalizeRepeatedComponentMode,
  scaleSourceBreakdown,
  splitRowsBySources,
  placeCombinedRows,
};
