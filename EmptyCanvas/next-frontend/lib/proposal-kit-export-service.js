import "server-only";

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import pdfPageNumbersModule from "./pdfPageNumbers";
import pdfHeaderModule from "./pdfHeader";
import pdfArabicSupportModule from "./pdfArabicSupport";
import { getProductsList } from "./products-service";
import {
  getKit,
  getProposal,
  listKitFolders,
  listKitMembership,
  listKits,
} from "./proposal-kit-service";

const { attachPageNumbers } = pdfPageNumbersModule;
const { drawStocktakingHeader } = pdfHeaderModule;
const { enableArabicPdf, ensurePdfArabicSupport } = pdfArabicSupportModule;

const EXPORT_COLUMNS = [
  { key: "idCode", aliases: ["id", "id-code", "id_code", "code"], label: "ID Code", pdfWidth: 70, excelWidth: 16, align: "left" },
  { key: "name", aliases: ["component", "product", "product-name", "product_name", "component-name", "component_name"], label: "Component", pdfWidth: 215, excelWidth: 34, align: "left" },
  { key: "quantity", aliases: ["qty", "qnty"], label: "Qty", pdfWidth: 60, excelWidth: 12, align: "right" },
  { key: "unitPrice", aliases: ["unit", "unit-cost", "unit_cost", "unit-price", "unit_price", "unity-price", "unity_price", "price"], label: "Unit cost", pdfWidth: 78, excelWidth: 15, align: "right" },
  { key: "totalPrice", aliases: ["total", "total-cost", "total_cost", "total-price", "total_price"], label: "Total cost", pdfWidth: 86, excelWidth: 15, align: "right" },
];

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  headerBg: "#F9FAFB",
  tableHeadBg: "#F3F4F6",
  rowAlt: "#FAFAFA",
  dark: "#050B18",
  link: "#1D4ED8",
};

function text(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function naturalCompare(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function positiveQuantity(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.max(1, Math.round(Number(fallback) || 1));
  return Math.max(1, Math.round(parsed));
}

function safeFileName(value = "Proposal") {
  const cleaned = text(value || "Proposal")
    .replace(/[^a-z0-9\-_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || "Proposal";
}

function moneyText(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `£${parsed.toFixed(2)}` : "-";
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstProductTag(product = {}) {
  const tags = Array.isArray(product?.tags)
    ? product.tags
    : text(product?.tags).split(/[,;|]/).map(text).filter(Boolean);
  return tags.find(Boolean) || "Uncategorized";
}

function normalizeUrlForPdf(value) {
  const url = text(value);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("www.")) return `https://${url}`;
  return null;
}

function columnKey(value) {
  const raw = text(value).toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw) return "";
  for (const col of EXPORT_COLUMNS) {
    if (raw === col.key.toLowerCase().replace(/[\s_]+/g, "-")) return col.key;
    if ((col.aliases || []).some((alias) => raw === String(alias).toLowerCase().replace(/[\s_]+/g, "-"))) return col.key;
  }
  return "";
}

function selectedColumns(value) {
  const rawList = Array.isArray(value) ? value : text(value).split(",");
  const seen = new Set();
  const selected = [];
  for (const raw of rawList) {
    const key = columnKey(raw);
    if (!key || seen.has(key)) continue;
    const def = EXPORT_COLUMNS.find((item) => item.key === key);
    if (def) {
      selected.push(def);
      seen.add(key);
    }
  }
  return selected.length ? selected : EXPORT_COLUMNS.slice();
}

function groupMode(value) {
  const raw = text(value).toLowerCase().replace(/[\s_]+/g, "-");
  return ["kit-tag", "kits-tag", "kit"].includes(raw) ? "kit-tag" : "component-tag";
}

function repeatedMode(value, fallback = "separate") {
  const raw = text(value).toLowerCase().replace(/[\s_]+/g, "-");
  if (["merge", "merged", "combine", "combined", "group"].includes(raw)) return "merge";
  if (["separate", "split", "keep-separate", "individual"].includes(raw)) return "separate";
  return fallback === "merge" ? "merge" : "separate";
}

function combineLogic(value) {
  const raw = text(value).toLowerCase().replace(/[\s_-]+/g, "-");
  if (["max", "max-logic"].includes(raw)) return "max";
  if (["min", "min-logic"].includes(raw)) return "min";
  if (["separate", "separate-logic"].includes(raw)) return "separate";
  return "add";
}

function combineLogicLabel(value) {
  const logic = combineLogic(value);
  if (logic === "max") return "Max logic";
  if (logic === "min") return "Min logic";
  if (logic === "separate") return "Separate logic";
  return "Add logic";
}

function idsList(value) {
  const values = Array.isArray(value) ? value : text(value).split(",");
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const id = text(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sourceKits(value) {
  let raw = value;
  if (!Array.isArray(raw) && typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }
  return (Array.isArray(raw) ? raw : [])
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name) || "Unassigned kit",
      quantity: positiveQuantity(source?.quantity || source?.qty, 1),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function sourceKitsForTotal(value, total) {
  const target = positiveQuantity(total, 1);
  const sources = sourceKits(value);
  if (!sources.length) {
    return [{ kitId: "", kitName: "Direct / legacy components", quantity: target, order: 0 }];
  }

  const currentTotal = sources.reduce((sum, source) => sum + positiveQuantity(source?.quantity, 1), 0);
  if (currentTotal === target) return sources;
  if (sources.length === 1) return [{ ...sources[0], quantity: target }];

  const scaled = sources.map((source, index) => {
    const raw = (positiveQuantity(source?.quantity, 1) * target) / Math.max(1, currentTotal);
    const base = Math.floor(raw);
    return { ...source, quantity: base, _fraction: raw - base, _index: index };
  });
  let assigned = scaled.reduce((sum, source) => sum + Number(source.quantity || 0), 0);
  let remaining = target - assigned;
  const byFraction = scaled.slice().sort((a, b) => (b._fraction - a._fraction) || (a._index - b._index));
  for (let i = 0; remaining > 0 && byFraction.length; i = (i + 1) % byFraction.length) {
    byFraction[i].quantity += 1;
    remaining -= 1;
  }
  return scaled
    .filter((source) => Number(source.quantity || 0) > 0)
    .map(({ _fraction, _index, ...source }) => source);
}

function primarySourceKit(value) {
  const sources = sourceKits(value);
  if (!sources.length) return null;
  return sources.slice().sort((a, b) => (Number(b.quantity || 0) - Number(a.quantity || 0)) || (Number(a.order || 0) - Number(b.order || 0)))[0] || null;
}

function mergeSourceKits(existing, incoming) {
  const map = new Map();
  for (const source of [...sourceKits(existing), ...sourceKits(incoming)]) {
    const key = source.kitId || `name:${norm(source.kitName)}`;
    if (!map.has(key)) map.set(key, { ...source, quantity: 0 });
    map.get(key).quantity += Number(source.quantity) || 0;
  }
  return [...map.values()].sort((a, b) => (a.order - b.order) || naturalCompare(a.kitName, b.kitName));
}

async function productMap() {
  const products = await getProductsList({ fresh: false });
  return new Map((products || []).map((product) => [text(product?.id), product]).filter(([id]) => id));
}

async function membershipHierarchy(account) {
  const [kits, folders, memberships] = await Promise.all([
    listKits(account || {}, { fresh: false }).catch(() => []),
    listKitFolders(account || {}, { fresh: false }).catch(() => []),
    listKitMembership({ fresh: false }).catch(() => []),
  ]);
  const folderNames = new Map((folders || []).map((folder) => [text(folder?.id), text(folder?.name) || "Untitled folder"]));
  const kitMeta = new Map((kits || []).map((kit) => {
    const folderId = text(kit?.folderId);
    return [text(kit?.id), {
      id: text(kit?.id),
      name: text(kit?.name) || "Untitled kit",
      folderId,
      folderName: folderId ? (folderNames.get(folderId) || "Unfiled Kits") : "Unfiled Kits",
    }];
  }).filter(([id]) => id));
  const byProduct = new Map();
  for (const membership of memberships || []) {
    const pid = text(membership?.productId);
    if (!pid) continue;
    const rows = (membership?.kits || [])
      .map((kit) => kitMeta.get(text(kit?.id)) || { id: text(kit?.id), name: text(kit?.name) || "Untitled kit", folderId: "", folderName: "Unfiled Kits" })
      .filter((kit) => kit.id || kit.name);
    byProduct.set(pid, rows.sort((a, b) => naturalCompare(a.folderName, b.folderName) || naturalCompare(a.name, b.name)));
  }
  return { byProduct, kitMeta };
}

function rowFromItem(item, product, { kitScope = null } = {}) {
  const quantity = positiveQuantity(item?.quantity, 1);
  const unitPrice = Number(product?.unitPrice);
  const cleanUnitPrice = Number.isFinite(unitPrice) ? unitPrice : null;
  const pid = text(item?.productId || product?.id);
  const row = {
    productId: pid,
    idCode: text(product?.displayId || product?.idCode || product?.id_code),
    name: text(product?.name || item?.productName || item?.product_name) || "Untitled Product",
    url: text(product?.url || item?.url || item?.productUrl || item?.product_url),
    tag: firstProductTag(product),
    quantity,
    sourceKits: kitScope
      ? [{ kitId: text(kitScope.id), kitName: text(kitScope.name) || "Kit", quantity, order: 0 }]
      : sourceKits(item?.sourceKits || item?.source_kits),
    unitPrice: cleanUnitPrice,
    totalPrice: cleanUnitPrice === null ? null : cleanUnitPrice * quantity,
  };
  return row;
}

function splitRowsBySourceKit(rows = []) {
  const out = [];
  for (const row of rows || []) {
    const total = Number(row?.quantity) || 0;
    const sources = sourceKitsForTotal(row?.sourceKits, Math.abs(total) || 1);
    if (!sources.length || total === 0) {
      out.push(row);
      continue;
    }
    const sign = total < 0 ? -1 : 1;
    const unit = Number(row?.unitPrice);
    const hasUnit = Number.isFinite(unit);
    sources.forEach((source, index) => {
      const quantity = sign * positiveQuantity(source?.quantity, 1);
      out.push({
        ...row,
        quantity,
        totalPrice: hasUnit ? unit * quantity : row?.totalPrice,
        sourceKits: [source],
        _sourceKey: `${source.kitId || `name:${norm(source.kitName)}`}:${index}`,
      });
    });
  }
  return out;
}

function membershipForSource(membership, row, source) {
  const memberships = membership?.byProduct?.get(text(row?.productId)) || [];
  const sourceKitId = text(source?.kitId);
  const sourceKitName = text(source?.kitName);
  const exact = memberships.find((entry) => sourceKitId && text(entry?.id || entry?.kitId) === sourceKitId)
    || memberships.find((entry) => !sourceKitId && sourceKitName && norm(entry?.name || entry?.kitName) === norm(sourceKitName));
  if (exact) return exact;
  return {
    id: sourceKitId,
    name: sourceKitName || (sourceKitId ? "Untitled kit" : "Direct / legacy components"),
    folderId: "",
    folderName: sourceKitId ? "Unfiled Kits" : "Untracked / Direct",
  };
}

function groupedRows(rows, mode, membership, repeat = "separate") {
  const repeatMode = repeatedMode(repeat);
  if (mode !== "kit-tag") {
    const working = repeatMode === "separate" ? splitRowsBySourceKit(rows) : (Array.isArray(rows) ? rows : []);
    const groups = new Map();
    for (const row of working) {
      const tag = text(row?.tag) || "Uncategorized";
      const key = norm(tag);
      if (!groups.has(key)) groups.set(key, { tag, rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()]
      .map((group) => ({ ...group, rows: group.rows.slice().sort((a, b) => naturalCompare(a.name, b.name)) }))
      .sort((a, b) => naturalCompare(a.tag, b.tag));
  }

  const folders = new Map();
  const add = (row, meta = {}) => {
    const folderId = text(meta?.folderId);
    const folderName = text(meta?.folderName) || "Unfiled Kits";
    const folderKey = `${folderId || "unfiled"}:${norm(folderName)}`;
    if (!folders.has(folderKey)) folders.set(folderKey, { folderId, folderName, kits: new Map() });
    const folder = folders.get(folderKey);
    const kitId = text(meta?.id || meta?.kitId);
    const kitName = text(meta?.name || meta?.kitName) || "Unassigned kit";
    const kitKey = `${kitId || "unassigned"}:${norm(kitName)}`;
    if (!folder.kits.has(kitKey)) folder.kits.set(kitKey, { kitId, kitName, rows: [] });
    const kit = folder.kits.get(kitKey);
    const rowKey = norm(row?.productId || row?.idCode || row?.name);
    if (!kit.rows.some((existing) => norm(existing?.productId || existing?.idCode || existing?.name) === rowKey)) kit.rows.push(row);
  };

  for (const row of rows || []) {
    const sources = sourceKitsForTotal(row?.sourceKits, Math.abs(Number(row?.quantity) || 0) || 1);
    if (repeatMode === "merge") {
      const primary = primarySourceKit(sources) || sources[0];
      add(row, membershipForSource(membership, row, primary));
      continue;
    }
    sources.forEach((source, sourceIndex) => {
      const sourceQuantity = positiveQuantity(source?.quantity, 1);
      const rawUnitPrice = row?.unitPrice;
      const unitPrice = Number(rawUnitPrice);
      const hasUnitPrice = rawUnitPrice !== null && rawUnitPrice !== undefined && rawUnitPrice !== "" && Number.isFinite(unitPrice);
      const sourceRow = {
        ...row,
        quantity: sourceQuantity,
        totalPrice: hasUnitPrice ? unitPrice * sourceQuantity : row?.totalPrice,
        sourceKits: [source],
        _sourceKey: `${text(source?.kitId) || `name:${norm(source?.kitName)}`}:${sourceIndex}`,
      };
      add(sourceRow, membershipForSource(membership, row, source));
    });
  }

  return [...folders.values()]
    .map((folder) => ({
      folderId: folder.folderId,
      folderName: folder.folderName,
      kits: [...folder.kits.values()]
        .map((kit) => ({ ...kit, rows: kit.rows.slice().sort((a, b) => naturalCompare(a.name, b.name)) }))
        .sort((a, b) => naturalCompare(a.kitName, b.kitName)),
    }))
    .sort((a, b) => {
      if (a.folderId && !b.folderId) return -1;
      if (!a.folderId && b.folderId) return 1;
      return naturalCompare(a.folderName, b.folderName);
    });
}

function combinedGroupedRows(rows = [], mode = "component-tag", membership = null, sources = [], logic = "add", repeat = "separate") {
  const repeatMode = repeatedMode(repeat);
  if (repeatMode === "merge") return groupedRows(rows, mode, membership, "merge");
  if (mode !== "kit-tag") return groupedRows(rows, mode, membership, "separate");

  const cleanLogic = combineLogic(logic);
  const cleanSources = (Array.isArray(sources) ? sources : []).map((source, index) => ({
    id: text(source?.id),
    name: text(source?.name) || "Proposal",
    index,
  }));
  const folders = new Map();
  const add = (row, meta = {}) => {
    const folderId = text(meta?.folderId);
    const folderName = text(meta?.folderName) || "Unfiled Kits";
    const folderKey = `${folderId || "unfiled"}:${norm(folderName)}`;
    if (!folders.has(folderKey)) folders.set(folderKey, { folderId, folderName, kits: new Map() });
    const folder = folders.get(folderKey);
    const kitId = text(meta?.id || meta?.kitId);
    const kitName = text(meta?.name || meta?.kitName) || "Unassigned kit";
    const kitKey = `${kitId || "unassigned"}:${norm(kitName)}`;
    if (!folder.kits.has(kitKey)) folder.kits.set(kitKey, { kitId, kitName, rows: [] });
    folder.kits.get(kitKey).rows.push(row);
  };
  const combinedQtyFor = (sourceQuantities = {}) => combinedQuantity(cleanSources.map((source) => Number(sourceQuantities?.[source.id]) || 0), cleanLogic);

  for (const row of rows || []) {
    const perProposal = new Map();
    for (const source of cleanSources) {
      const totalForProposal = Number(row?.sourceQuantities?.[source.id]) || 0;
      if (totalForProposal <= 0) continue;
      perProposal.set(source.id, sourceKitsForTotal(row?.sourceKitQuantities?.[source.id] || [], totalForProposal));
    }

    if (cleanLogic === "max" || cleanLogic === "min") {
      const candidates = cleanSources
        .map((source) => ({ source, quantity: Number(row?.sourceQuantities?.[source.id]) || 0 }))
        .filter((entry) => entry.quantity > 0)
        .sort((a, b) => cleanLogic === "max"
          ? (b.quantity - a.quantity) || (a.source.index - b.source.index)
          : (a.quantity - b.quantity) || (a.source.index - b.source.index));
      const winner = candidates[0]?.source;
      const winnerSources = winner ? (perProposal.get(winner.id) || []) : [];
      for (const kitSource of winnerSources) {
        const sourceQuantity = Number(kitSource?.quantity) || 0;
        if (sourceQuantity <= 0) continue;
        const sourceQuantities = Object.fromEntries(cleanSources.map((source) => [source.id, source.id === winner.id ? sourceQuantity : 0]));
        add({
          ...row,
          quantity: sourceQuantity,
          sourceQuantities,
          sourceKits: [kitSource],
          totalPrice: Number.isFinite(Number(row?.unitPrice)) ? Number(row.unitPrice) * sourceQuantity : row?.totalPrice,
        }, membershipForSource(membership, row, kitSource));
      }
      continue;
    }

    const allTrackedLists = [...perProposal.values()];
    const hasIntentionalMultiKitSplit = allTrackedLists.some((list) => list.length > 1);
    if (!hasIntentionalMultiKitSplit) {
      const candidates = new Map();
      for (const source of cleanSources) {
        const tracked = perProposal.get(source.id) || [];
        const kitSource = tracked[0];
        if (!kitSource) continue;
        const key = text(kitSource.kitId) || `name:${norm(kitSource.kitName)}`;
        if (!candidates.has(key)) candidates.set(key, { kitSource, proposalCount: 0, quantity: 0, firstSourceIndex: source.index });
        const candidate = candidates.get(key);
        candidate.proposalCount += 1;
        candidate.quantity += Number(row?.sourceQuantities?.[source.id]) || Number(kitSource.quantity) || 0;
        candidate.firstSourceIndex = Math.min(candidate.firstSourceIndex, source.index);
      }
      const canonical = [...candidates.values()].sort((a, b) =>
        (b.proposalCount - a.proposalCount)
        || (b.quantity - a.quantity)
        || (a.firstSourceIndex - b.firstSourceIndex)
        || (Number(a.kitSource?.order || 0) - Number(b.kitSource?.order || 0))
      )[0]?.kitSource;
      if (canonical) {
        const sourceQuantities = Object.fromEntries(cleanSources.map((source) => [source.id, Number(row?.sourceQuantities?.[source.id]) || 0]));
        const quantity = combinedQtyFor(sourceQuantities);
        add({
          ...row,
          quantity,
          sourceQuantities,
          sourceKits: [{ ...canonical, quantity }],
          totalPrice: Number.isFinite(Number(row?.unitPrice)) ? Number(row.unitPrice) * quantity : row?.totalPrice,
        }, membershipForSource(membership, row, canonical));
        continue;
      }
    }

    const kitRows = new Map();
    for (const source of cleanSources) {
      const tracked = perProposal.get(source.id) || [];
      for (const kitSource of tracked) {
        const kitKey = text(kitSource.kitId) || `name:${norm(kitSource.kitName)}`;
        if (!kitRows.has(kitKey)) {
          kitRows.set(kitKey, { kitSource, sourceQuantities: Object.fromEntries(cleanSources.map((entry) => [entry.id, 0])) });
        }
        kitRows.get(kitKey).sourceQuantities[source.id] += Number(kitSource.quantity) || 0;
      }
    }
    for (const entry of kitRows.values()) {
      const quantity = combinedQtyFor(entry.sourceQuantities);
      if (quantity <= 0) continue;
      add({
        ...row,
        quantity,
        sourceQuantities: entry.sourceQuantities,
        sourceKits: [{ ...entry.kitSource, quantity }],
        totalPrice: Number.isFinite(Number(row?.unitPrice)) ? Number(row.unitPrice) * quantity : row?.totalPrice,
      }, membershipForSource(membership, row, entry.kitSource));
    }
  }

  return [...folders.values()]
    .map((folder) => ({
      folderId: folder.folderId,
      folderName: folder.folderName,
      kits: [...folder.kits.values()]
        .map((kit) => ({ ...kit, rows: kit.rows.slice().sort((a, b) => naturalCompare(a.name, b.name)) }))
        .sort((a, b) => naturalCompare(a.kitName, b.kitName)),
    }))
    .sort((a, b) => {
      if (a.folderId && !b.folderId) return -1;
      if (!a.folderId && b.folderId) return 1;
      return naturalCompare(a.folderName, b.folderName);
    });
}

function totalsFor(rows = []) {
  return (rows || []).reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += Number(row?.quantity) || 0;
    if (Number.isFinite(Number(row?.totalPrice))) acc.total += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, total: 0 });
}

async function singleContext({ account, scope, id, groupBy, repeatedComponents }) {
  const cleanScope = scope === "kit" ? "kit" : "proposal";
  const [products, detail] = await Promise.all([
    productMap(),
    cleanScope === "kit" ? getKit(id, account || {}) : getProposal(id, account || {}),
  ]);
  const parent = cleanScope === "kit" ? detail?.kit : detail?.proposal;
  if (!parent) {
    const error = new Error(cleanScope === "kit" ? "Kit not found." : "Proposal not found.");
    error.status = 404;
    throw error;
  }
  const rows = (detail?.items || []).map((item) => rowFromItem(item, products.get(text(item?.productId)) || {}, { kitScope: cleanScope === "kit" ? parent : null }));
  const mode = groupMode(groupBy);
  const membership = mode === "kit-tag" ? await membershipHierarchy(account) : null;
  return {
    scope: cleanScope,
    name: text(parent?.name) || (cleanScope === "kit" ? "Kit" : "Proposal"),
    rows,
    groupedRows: groupedRows(rows, mode, membership, repeatedComponents),
    totals: totalsFor(rows),
    groupMode: mode,
  };
}

function combinedQuantity(values, logic) {
  const quantities = values.map((value) => Number(value) || 0);
  const present = quantities.filter((value) => value > 0);
  if (logic === "max") return present.length ? Math.max(...present) : 0;
  if (logic === "min") return present.length ? Math.min(...present) : 0;
  return quantities.reduce((sum, value) => sum + value, 0);
}

async function combinedContext({ account, proposalIds, logic, groupBy, repeatedComponents }) {
  const ids = idsList(proposalIds);
  if (ids.length < 2) {
    const error = new Error("Please select at least two proposals to combine.");
    error.status = 400;
    throw error;
  }
  const [products, details] = await Promise.all([
    productMap(),
    Promise.all(ids.map((id) => getProposal(id, account || {}))),
  ]);
  const sources = details.map((detail) => ({ id: text(detail?.proposal?.id), name: text(detail?.proposal?.name) || "Proposal" }));
  const rowsMap = new Map();
  for (const detail of details) {
    const sourceId = text(detail?.proposal?.id);
    for (const item of detail?.items || []) {
      const product = products.get(text(item?.productId)) || {};
      const base = rowFromItem(item, product);
      const key = base.productId ? `id:${base.productId}` : `name:${norm(base.name)}`;
      if (!rowsMap.has(key)) rowsMap.set(key, { ...base, quantity: 0, totalPrice: base.unitPrice === null ? null : 0, sourceQuantities: {}, sourceKitQuantities: {} });
      const row = rowsMap.get(key);
      const quantity = Number(base.quantity) || 0;
      const previous = Number(row.sourceQuantities[sourceId]) || 0;
      row.sourceQuantities[sourceId] = previous + quantity;
      row.sourceKitQuantities[sourceId] = mergeSourceKits(row.sourceKitQuantities[sourceId] || [], sourceKitsForTotal(base.sourceKits, quantity));
      if (row.unitPrice === null && base.unitPrice !== null) row.unitPrice = base.unitPrice;
    }
  }

  const cleanLogic = combineLogic(logic);
  const rows = [...rowsMap.values()].map((row) => {
    const sourceQuantities = Object.fromEntries(sources.map((source) => [source.id, Number(row.sourceQuantities[source.id]) || 0]));
    const quantity = combinedQuantity(sources.map((source) => sourceQuantities[source.id]), cleanLogic);
    let effectiveKits = [];
    if (["max", "min"].includes(cleanLogic)) {
      const candidates = sources
        .map((source, index) => ({ source, index, quantity: Number(sourceQuantities[source.id]) || 0 }))
        .filter((entry) => entry.quantity > 0)
        .sort((a, b) => cleanLogic === "max" ? (b.quantity - a.quantity) || (a.index - b.index) : (a.quantity - b.quantity) || (a.index - b.index));
      const winnerId = candidates[0]?.source?.id;
      effectiveKits = winnerId ? sourceKitsForTotal(row.sourceKitQuantities[winnerId], quantity || 1) : [];
    } else {
      const trackedLists = sources
        .map((source, index) => ({ source, index, kits: sourceKits(row.sourceKitQuantities[source.id] || []) }))
        .filter((entry) => Number(sourceQuantities[entry.source.id]) > 0);
      const hasIntentionalMultiKitSplit = trackedLists.some((entry) => entry.kits.length > 1);
      if (!hasIntentionalMultiKitSplit && trackedLists.length) {
        const candidates = new Map();
        for (const entry of trackedLists) {
          const kit = entry.kits[0];
          if (!kit) continue;
          const key = text(kit.kitId) || `name:${norm(kit.kitName)}`;
          if (!candidates.has(key)) candidates.set(key, { kit, count: 0, quantity: 0, firstIndex: entry.index });
          const candidate = candidates.get(key);
          candidate.count += 1;
          candidate.quantity += Number(sourceQuantities[entry.source.id]) || 0;
          candidate.firstIndex = Math.min(candidate.firstIndex, entry.index);
        }
        const canonical = [...candidates.values()].sort((a, b) =>
          (b.count - a.count)
          || (b.quantity - a.quantity)
          || (a.firstIndex - b.firstIndex)
          || (Number(a.kit?.order || 0) - Number(b.kit?.order || 0))
        )[0]?.kit;
        if (canonical) effectiveKits = [{ ...canonical, quantity }];
      } else {
        for (const source of sources) {
          effectiveKits = mergeSourceKits(effectiveKits, row.sourceKitQuantities[source.id] || []);
        }
      }
    }
    return {
      ...row,
      quantity,
      totalPrice: Number.isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) * quantity : null,
      sourceQuantities,
      sourceKits: effectiveKits,
    };
  }).sort((a, b) => naturalCompare(a.name, b.name));

  const mode = groupMode(groupBy);
  const membership = mode === "kit-tag" ? await membershipHierarchy(account) : null;
  return {
    scope: "combined",
    sources,
    logic: cleanLogic,
    rows,
    groupedRows: combinedGroupedRows(rows, mode, membership, sources, cleanLogic, repeatedComponents),
    totals: totalsFor(rows),
    groupMode: mode,
  };
}

function pdfColumnsForContent(columns, contentW) {
  const out = columns.map((col) => ({ key: col.key, label: col.label, width: col.pdfWidth, align: col.align || "left" }));
  const naturalW = out.reduce((sum, col) => sum + Number(col.width || 0), 0) || contentW;
  if (naturalW > contentW) {
    const scale = contentW / naturalW;
    out.forEach((col) => { col.width = Math.max(col.key === "name" ? 88 : 42, Math.floor(Number(col.width || 60) * scale)); });
  } else if (naturalW < contentW) {
    const extra = contentW - naturalW;
    const nameCol = out.find((col) => col.key === "name");
    if (nameCol) nameCol.width += extra;
    else out.forEach((col) => { col.width += extra / Math.max(1, out.length); });
  }
  return out;
}

function combinedPdfColumns(columns, contentW, sources, logic, includeTotalQty) {
  const out = [];
  let insertedTotal = false;
  const insertTotal = () => {
    if (!includeTotalQty || insertedTotal) return;
    out.push({ key: "totalQty", label: "Total Qty", width: 62, align: "right" });
    insertedTotal = true;
  };
  for (const col of columns) {
    if (logic === "separate" && col.key === "quantity") {
      for (const source of sources) out.push({ key: `sourceQty:${source.id}`, label: `${source.name} Qty`, width: 58, align: "right", sourceId: source.id });
      insertTotal();
    } else {
      if (["unitPrice", "totalPrice"].includes(col.key)) insertTotal();
      out.push({ key: col.key, label: col.label, width: col.pdfWidth, align: col.align || "left" });
      if (col.key === "quantity") insertTotal();
    }
  }
  insertTotal();
  const naturalW = out.reduce((sum, col) => sum + Number(col.width || 0), 0) || contentW;
  if (naturalW !== contentW) {
    const scale = contentW / naturalW;
    out.forEach((col) => { col.width = Math.max(col.key === "name" ? 82 : 34, Number(col.width || 58) * scale); });
  }
  return out;
}

function cellValue(row, key, { formattedMoney = false } = {}) {
  if (key === "idCode") return row?.idCode || "";
  if (key === "name") return row?.name || "-";
  if (key === "quantity") return Number(row?.quantity || 0) || 0;
  if (key === "unitPrice") return formattedMoney ? moneyText(row?.unitPrice) : (Number.isFinite(Number(row?.unitPrice)) ? Number(row.unitPrice) : null);
  if (key === "totalPrice") return formattedMoney ? moneyText(row?.totalPrice) : (Number.isFinite(Number(row?.totalPrice)) ? Number(row.totalPrice) : null);
  if (key === "totalQty") return Number(row?.quantity || 0) || 0;
  if (key.startsWith("sourceQty:")) return Number(row?.sourceQuantities?.[key.slice("sourceQty:".length)] || 0) || 0;
  return "";
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });
}

function drawStats(doc, { left, contentW, bottom, totals }) {
  const ensure = (height) => { if (doc.y + height > bottom) doc.addPage(); };
  ensure(58);
  const gap = 10;
  const width = (contentW - gap * 2) / 3;
  const y = doc.y;
  const draw = (index, label, value) => {
    const x = left + index * (width + gap);
    doc.roundedRect(x, y, width, 46, 12).fillColor(COLORS.dark).fill();
    doc.fillColor("#CBD5E1").font("Helvetica-Bold").fontSize(8).text(label, x + 12, y + 10, { width: width - 24 });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(13).text(String(value || "0"), x + 12, y + 25, { width: width - 24 });
  };
  draw(0, "TOTAL ITEMS", `${totals.items} item${totals.items === 1 ? "" : "s"}`);
  draw(1, "TOTAL QUANTITY", totals.quantity);
  draw(2, "TOTAL COST", moneyText(totals.total));
  doc.y = y + 62;
}

function drawGroupedTable(doc, { grouped, mode, columns, left, contentW, bottom }) {
  const tableW = columns.reduce((sum, col) => sum + Number(col.width || 0), 0);
  const cellPad = 7;
  const headerH = 22;
  const ensureSpace = (height, repeatHeader = false) => {
    if (doc.y + height <= bottom) return;
    doc.addPage();
    drawStocktakingHeader(doc, { title: "Components", variant: "compact", colors: COLORS });
    if (repeatHeader) drawTableHeader();
  };
  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(left, y, tableW, headerH).fillColor(COLORS.tableHeadBg).fill();
    doc.rect(left, y, tableW, headerH).lineWidth(0.8).strokeColor(COLORS.border).stroke();
    let x = left;
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.3);
    for (const col of columns) {
      doc.text(col.label, x + cellPad, y + 7, { width: col.width - cellPad * 2, align: col.align });
      x += col.width;
      if (x < left + tableW) doc.moveTo(x, y).lineTo(x, y + headerH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    }
    doc.y = y + headerH;
  };
  const drawBand = (label, count, dark = false) => {
    const height = dark ? 27 : 24;
    ensureSpace(height + headerH + 2, true);
    const y = doc.y;
    const bg = dark ? "#07101F" : "#FFF7ED";
    const border = dark ? "#1F2937" : "#FED7AA";
    const fg = dark ? "#FFFFFF" : "#9A3412";
    doc.rect(left, y, tableW, height).fillColor(bg).fill();
    doc.rect(left, y, tableW, height).lineWidth(0.5).strokeColor(border).stroke();
    doc.fillColor(fg).font("Helvetica-Bold").fontSize(dark ? 10 : 9.3).text(label, left + cellPad, y + 7, { width: tableW - 125 });
    doc.fillColor(dark ? "#CBD5E1" : COLORS.muted).font("Helvetica-Bold").fontSize(8).text(String(count), left + tableW - 105, y + 8, { width: 98, align: "right" });
    doc.y = y + height;
  };
  let visualIndex = 0;
  const drawRow = (row) => {
    doc.font("Helvetica").fontSize(8.4);
    const values = columns.map((col) => cellValue(row, col.key, { formattedMoney: ["unitPrice", "totalPrice"].includes(col.key) }));
    const heights = columns.map((col, index) => doc.heightOfString(String(values[index] ?? ""), { width: col.width - cellPad * 2, align: col.align }));
    const rowH = Math.max(22, ...heights) + 8;
    ensureSpace(rowH + 2, true);
    const y = doc.y;
    if (visualIndex % 2 === 0) doc.rect(left, y, tableW, rowH).fillColor(COLORS.rowAlt).fill();
    doc.rect(left, y, tableW, rowH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    let x = left;
    columns.forEach((col, index) => {
      const opts = { width: col.width - cellPad * 2, align: col.align };
      if (col.key === "name") {
        const link = normalizeUrlForPdf(row?.url);
        if (link) { opts.link = link; opts.underline = true; doc.fillColor(COLORS.link); }
        else doc.fillColor(COLORS.text);
      } else doc.fillColor(COLORS.text);
      doc.font("Helvetica").fontSize(8.4).text(String(values[index] ?? ""), x + cellPad, y + 6, opts);
      x += col.width;
      if (x < left + tableW) doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    });
    doc.y = y + rowH;
    visualIndex += 1;
  };

  drawTableHeader();
  if (mode === "kit-tag") {
    for (const folder of grouped || []) {
      drawBand(text(folder?.folderName) || "Unfiled Kits", `${folder?.kits?.length || 0} kit${folder?.kits?.length === 1 ? "" : "s"}`, true);
      for (const kit of folder?.kits || []) {
        drawBand(text(kit?.kitName) || "Unassigned kit", `${kit?.rows?.length || 0} item${kit?.rows?.length === 1 ? "" : "s"}`, false);
        (kit?.rows || []).forEach(drawRow);
      }
    }
  } else {
    for (const group of grouped || []) {
      drawBand(text(group?.tag) || "Uncategorized", `${group?.rows?.length || 0} item${group?.rows?.length === 1 ? "" : "s"}`, false);
      (group?.rows || []).forEach(drawRow);
    }
  }
}

async function renderSinglePdf(context, columns) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  attachPageNumbers(doc);
  const bufferPromise = collectPdfBuffer(doc);
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const label = context.scope === "kit" ? "Kit" : "Proposal";
  const generatedAt = new Date();

  drawStocktakingHeader(doc, { title: label, colors: COLORS });
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(14).text(`${label} Summary`, left, doc.y);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(context.scope === "kit" ? "Saved components and quantities for this kit." : "Saved components and quantities for this proposal.", left, doc.y + 4, { width: contentW });
  doc.moveDown(1.1);
  const boxY = doc.y;
  const gap = 12;
  const width = (contentW - gap) / 2;
  const drawInfo = (x, title, value) => {
    doc.roundedRect(x, boxY, width, 34, 8).fillAndStroke(COLORS.headerBg, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(title, x + 10, boxY + 6);
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(String(value || "-"), x + 10, boxY + 19, { width: width - 20 });
  };
  drawInfo(left, "Name", context.name);
  drawInfo(left + width + gap, "Date", formatDateTime(generatedAt));
  doc.y = boxY + 52;

  if (!context.rows.length) doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11).text("No components yet.", left, doc.y);
  else drawGroupedTable(doc, { grouped: context.groupedRows, mode: context.groupMode, columns: pdfColumnsForContent(columns, contentW), left, contentW, bottom });
  doc.moveDown(1.2);
  drawStats(doc, { left, contentW, bottom, totals: context.totals });
  doc.end();
  return await bufferPromise;
}

async function renderCombinedPdf(context, columns, includeTotalQty) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  attachPageNumbers(doc);
  const bufferPromise = collectPdfBuffer(doc);
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const sourceText = context.sources.map((source) => source.name).join(", ");

  drawStocktakingHeader(doc, { title: "Combined Proposals", colors: COLORS });
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(14).text("Combined Proposal Summary", left, doc.y);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`Sources: ${sourceText || "selected proposals"}. Logic: ${combineLogicLabel(context.logic)}.`, left, doc.y + 4, { width: contentW });
  doc.moveDown(1.1);
  const boxY = doc.y;
  doc.roundedRect(left, boxY, contentW, 44, 8).fillAndStroke(COLORS.headerBg, COLORS.border);
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text("Selected proposals", left + 10, boxY + 7);
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(sourceText || "-", left + 10, boxY + 21, { width: contentW - 20 });
  doc.y = boxY + 62;

  if (!context.rows.length) doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11).text("No components found.", left, doc.y);
  else drawGroupedTable(doc, {
    grouped: context.groupedRows,
    mode: context.groupMode,
    columns: combinedPdfColumns(columns, contentW, context.sources, context.logic, includeTotalQty),
    left,
    contentW,
    bottom,
  });
  doc.moveDown(1.2);
  drawStats(doc, { left, contentW, bottom, totals: context.totals });
  doc.end();
  return await bufferPromise;
}

function excelBorder() {
  const color = { argb: "FF9CA3AF" };
  return {
    top: { style: "thin", color },
    left: { style: "thin", color },
    bottom: { style: "thin", color },
    right: { style: "thin", color },
  };
}

function excelColumnsFor(context, columns, includeTotalQty) {
  if (context.scope !== "combined") return columns.map((col) => ({ ...col, header: col.label, width: col.excelWidth || 16 }));
  const out = [];
  let insertedTotal = false;
  const insertTotal = () => {
    if (!includeTotalQty || insertedTotal) return;
    out.push({ key: "totalQty", header: "Total Qty", width: 14, align: "right" });
    insertedTotal = true;
  };
  for (const col of columns) {
    if (context.logic === "separate" && col.key === "quantity") {
      for (const source of context.sources) out.push({ key: `sourceQty:${source.id}`, header: `${source.name} Qty`, width: 14, align: "right" });
      insertTotal();
    } else {
      if (["unitPrice", "totalPrice"].includes(col.key)) insertTotal();
      out.push({ ...col, header: col.label, width: col.excelWidth || 16 });
      if (col.key === "quantity") insertTotal();
    }
  }
  insertTotal();
  return out;
}

function addMergedRow(worksheet, lastCol, label, { fill = "FFF3F4F6", color = "FF111827", height = 20 } = {}) {
  const row = worksheet.addRow([label]);
  if (lastCol > 1) worksheet.mergeCells(row.number, 1, row.number, lastCol);
  row.height = height;
  for (let c = 1; c <= lastCol; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { bold: true, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = excelBorder();
  }
  return row;
}

async function renderExcel(context, columns, includeTotalQty) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Hub";
  workbook.created = new Date();
  const label = context.scope === "kit" ? "Kit" : context.scope === "combined" ? "Combined Proposals" : "Proposal";
  const worksheet = workbook.addWorksheet(label.slice(0, 31));
  const includeKitColumn = context.groupMode === "kit-tag";
  const coreColumns = excelColumnsFor(context, columns, includeTotalQty);
  const cols = [
    ...(includeKitColumn ? [{ key: "__kitTag", header: "Kit", width: 18, kitTag: true }] : []),
    ...coreColumns,
  ];
  const lastCol = Math.max(1, cols.length);
  const visualLastCol = Math.max(2, lastCol);
  cols.forEach((col, index) => { worksheet.getColumn(index + 1).width = col.width || 16; });

  worksheet.mergeCells(1, 1, 1, visualLastCol);
  const title = worksheet.getCell(1, 1);
  title.value = context.scope === "combined" ? "Combined Proposals Report" : `${label} Report — ${context.name}`;
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  worksheet.getRow(1).height = 26;

  worksheet.mergeCells(2, 1, 2, visualLastCol);
  const meta = worksheet.getCell(2, 1);
  meta.value = context.scope === "combined"
    ? `Sources: ${context.sources.map((source) => source.name).join(", ")} • Logic: ${combineLogicLabel(context.logic)} • Generated: ${formatDateTime()}`
    : `Generated: ${formatDateTime()}`;
  meta.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  meta.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  worksheet.mergeCells("A3:B3");
  const summary = worksheet.getCell("A3");
  summary.value = "Summary";
  summary.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.alignment = { horizontal: "center", vertical: "middle" };
  summary.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  const summaryRows = [
    ["Total requested items", Number(context.totals.items || 0)],
    ["Total quantity", Number(context.totals.quantity || 0)],
    ["Total cost", Number(context.totals.total || 0)],
  ];
  summaryRows.forEach(([name, value], index) => {
    const rowIndex = 4 + index;
    const left = worksheet.getCell(rowIndex, 1);
    const right = worksheet.getCell(rowIndex, 2);
    left.value = name;
    left.font = { bold: true, color: { argb: "FF111827" } };
    left.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    left.alignment = { horizontal: "center", vertical: "middle" };
    right.value = value;
    right.font = { bold: true, color: { argb: index === 2 ? "FFC2410C" : "FF2563EB" } };
    right.alignment = { horizontal: "center", vertical: "middle" };
    left.border = excelBorder();
    right.border = excelBorder();
  });

  const headerIndex = 8;
  const header = worksheet.getRow(headerIndex);
  cols.forEach((col, index) => {
    const cell = header.getCell(index + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.border = excelBorder();
  });
  worksheet.autoFilter = { from: { row: headerIndex, column: 1 }, to: { row: headerIndex, column: lastCol } };

  const KIT_CELL_STYLES = [
    { fill: "FFD9EAF7", color: "FF1F4E79" },
    { fill: "FFE2F0D9", color: "FF375623" },
    { fill: "FFFFE5D0", color: "FF9A3412" },
    { fill: "FFEDE9FE", color: "FF5B21B6" },
    { fill: "FFFCE7F3", color: "FF9D174D" },
    { fill: "FFE0F2FE", color: "FF075985" },
    { fill: "FFFEF3C7", color: "FF92400E" },
    { fill: "FFDCFCE7", color: "FF166534" },
    { fill: "FFFEE2E2", color: "FF991B1B" },
    { fill: "FFE0E7FF", color: "FF3730A3" },
  ];
  let visualIndex = 0;
  const addRow = (item, kitName = "", kitStyle = null) => {
    const values = cols.map((col) => col.kitTag ? kitName : cellValue(item, col.key));
    const row = worksheet.addRow(values);
    cols.forEach((col, index) => {
      const cell = row.getCell(index + 1);
      cell.border = excelBorder();
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (col.kitTag) {
        const style = kitStyle || KIT_CELL_STYLES[0];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
        cell.font = { bold: true, color: { argb: style.color } };
      } else if (visualIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      if (["quantity", "unitPrice", "totalPrice", "totalQty"].includes(col.key) || String(col.key || "").startsWith("sourceQty:")) cell.numFmt = "#,##0.##;-#,##0.##;0";
      if (col.key === "totalPrice") cell.font = { bold: true, color: { argb: "FFC2410C" } };
      if (col.key === "name" && normalizeUrlForPdf(item?.url)) {
        cell.value = { text: String(cell.value || item?.name || "Component"), hyperlink: normalizeUrlForPdf(item.url) };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });
    visualIndex += 1;
  };

  if (!context.rows.length) worksheet.addRow(["No components yet."]);
  else if (context.groupMode === "kit-tag") {
    for (const folder of context.groupedRows || []) {
      addMergedRow(worksheet, lastCol, `${folder.folderName || "Unfiled Kits"} (${folder.kits?.length || 0} kit${folder.kits?.length === 1 ? "" : "s"})`, { fill: "FF07101F", color: "FFFFFFFF", height: 21 });
      (folder.kits || []).forEach((kit, kitIndex) => {
        const kitStyle = KIT_CELL_STYLES[kitIndex % KIT_CELL_STYLES.length];
        (kit.rows || []).forEach((row) => addRow(row, kit.kitName || "Unassigned kit", kitStyle));
      });
    }
  } else {
    for (const group of context.groupedRows || []) {
      addMergedRow(worksheet, lastCol, `${group.tag || "Uncategorized"} (${group.rows?.length || 0} item${group.rows?.length === 1 ? "" : "s"})`, { fill: "FFFFF7ED", color: "FF9A3412", height: 19 });
      (group.rows || []).forEach((row) => addRow(row));
    }
  }

  for (let c = 1; c <= lastCol; c += 1) {
    let maxLen = String(cols[c - 1]?.header || "").length;
    for (let r = 3; r <= worksheet.rowCount; r += 1) {
      const value = worksheet.getRow(r).getCell(c).value;
      const raw = value && typeof value === "object" && value.text ? value.text : String(value ?? "");
      if (raw) maxLen = Math.max(maxLen, raw.length);
    }
    worksheet.getColumn(c).width = Math.min(42, Math.max(11, maxLen + 2));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function renderProposalKitExport({
  account = {},
  scope = "proposal",
  id = "",
  proposalIds = "",
  kind = "pdf",
  columns = null,
  groupBy = "component-tag",
  repeatedComponents = "separate",
  logic = "add",
  totalQty = false,
} = {}) {
  const cleanKind = text(kind).toLowerCase() === "excel" ? "excel" : "pdf";
  const cleanScope = text(scope).toLowerCase();
  const cols = selectedColumns(columns);
  if (cleanScope !== "combined" && !text(id)) {
    const error = new Error(`${cleanScope === "kit" ? "Kit" : "Proposal"} ID is required.`);
    error.status = 400;
    throw error;
  }
  const context = cleanScope === "combined"
    ? await combinedContext({ account, proposalIds, logic, groupBy, repeatedComponents })
    : await singleContext({ account, scope: cleanScope === "kit" ? "kit" : "proposal", id: text(id), groupBy, repeatedComponents });

  const date = new Date().toISOString().slice(0, 10);
  if (cleanKind === "excel") {
    const buffer = await renderExcel(context, cols, Boolean(totalQty));
    const fileName = context.scope === "combined"
      ? `combined-proposals-${date}.xlsx`
      : `${safeFileName(context.name)}-${date}.xlsx`;
    return { buffer, fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  const buffer = context.scope === "combined"
    ? await renderCombinedPdf(context, cols, Boolean(totalQty))
    : await renderSinglePdf(context, cols);
  const fileName = context.scope === "combined"
    ? `combined-proposals-${date}.pdf`
    : `${safeFileName(context.name)}-${date}.pdf`;
  return { buffer, fileName, contentType: "application/pdf" };
}
