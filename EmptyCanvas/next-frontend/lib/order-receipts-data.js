import "server-only";
import { getSupabaseConfig, select, selectById, storagePublicUrl } from "./supabase-rest";

const RECEIPT_CACHE_TTL_MS = 20_000;
const receiptCache = new Map();
const receiptInflight = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
  }
  const wanted = new Set((aliases || []).map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function normalizeIds(rawIds) {
  return [...new Set(text(rawIds).split(",").map((value) => text(value)).filter(Boolean))];
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

const LEGACY_ORDER_ID_COLUMNS = ["notion_page_id", "notion_id", "page_id", "legacy_id"];
const unavailableLegacyIdColumns = new Set();

function expensesTable() {
  return text(process.env.SUPABASE_EXPENSES_TABLE) || "expenses";
}

function legacyReferenceCandidates(value) {
  const raw = text(value);
  if (!raw) return [];
  const compact = raw.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) return [];
  const hyphenated = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return [...new Set([raw, compact, hyphenated].map((item) => text(item)).filter(Boolean))];
}

function splitStoredList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {}
  return raw.split(/[\n,]+/).map((item) => text(item)).filter(Boolean);
}

function orderNumbersFromText(value) {
  const out = [];
  const seen = new Set();
  const source = Array.isArray(value) ? value.join(" ") : text(value);
  for (const match of source.matchAll(/(?:ORD|ORDER)[-:\s]?(\d+)/gi)) {
    const number = text(match?.[1]);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push(number);
  }
  return out;
}

function missingColumnError(error) {
  const detail = [error?.message, error?.details?.message, error?.details?.hint, error?.details?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return detail.includes("column") && (detail.includes("does not exist") || detail.includes("could not find"));
}

async function rowsForLegacyReference(reference) {
  const candidates = legacyReferenceCandidates(reference);
  if (!candidates.length) return [];

  // Some early Supabase imports preserved the Notion page id as the physical
  // primary key. Try that first, but tolerate bigint/id schemas that reject a UUID.
  for (const candidate of candidates) {
    try {
      const row = await selectById(ordersTable(), candidate);
      if (row) return [row];
    } catch {}
  }

  // Later imports used a numeric primary key and retained the old page id in a
  // compatibility column. Probe the common historical column names lazily so
  // deployments with a leaner schema do not need a migration just for receipts.
  for (const column of LEGACY_ORDER_ID_COLUMNS) {
    if (unavailableLegacyIdColumns.has(column)) continue;
    let columnUnavailable = false;
    for (const candidate of candidates) {
      try {
        const rows = await select(ordersTable(), { select: "*", [column]: `eq.${candidate}`, limit: "5000" });
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (error) {
        if (missingColumnError(error)) {
          unavailableLegacyIdColumns.add(column);
          columnUnavailable = true;
          break;
        }
      }
    }
    if (columnUnavailable) continue;
  }

  // Old Expenses rows can still contain Notion relation ids even after Orders
  // moved to numeric Supabase ids. Use the matching expense label (ORD-123) as
  // a bridge back to the Supabase order group instead of calling Notion/Express.
  const expenseMatches = [];
  const seenExpenseIds = new Set();
  for (const candidate of candidates) {
    try {
      const rows = await select(expensesTable(), {
        select: "id,orders_names,orders_raw",
        orders_raw: `ilike.*${candidate}*`,
        limit: "50",
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = text(row?.id) || JSON.stringify(row);
        if (seenExpenseIds.has(key)) continue;
        seenExpenseIds.add(key);
        expenseMatches.push(row);
      }
    } catch {
      // Expenses compatibility lookup is best-effort. The direct Orders lookup
      // above remains the canonical path.
    }
  }

  const targetSet = new Set(candidates.map((item) => item.replace(/-/g, "").toLowerCase()));
  const orderNumbers = new Set();
  for (const row of expenseMatches) {
    const rawRefs = splitStoredList(row?.orders_raw);
    const names = splitStoredList(row?.orders_names);
    const matchedIndexes = [];
    rawRefs.forEach((entry, index) => {
      const normalized = text(entry).replace(/-/g, "").toLowerCase();
      if (normalized && targetSet.has(normalized)) matchedIndexes.push(index);
    });
    const scopedNames = matchedIndexes.map((index) => names[index]).filter(Boolean);
    const extracted = orderNumbersFromText(scopedNames.length ? scopedNames : names);
    extracted.forEach((value) => orderNumbers.add(value));
  }

  const resolved = [];
  const seenRows = new Set();
  for (const orderNumber of orderNumbers) {
    try {
      const rows = await select(ordersTable(), { select: "*", order_number: `eq.${orderNumber}`, limit: "5000" });
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = text(row?.id) || JSON.stringify(row);
        if (seenRows.has(key)) continue;
        seenRows.add(key);
        resolved.push(row);
      }
    } catch {}
  }
  return resolved;
}

function publicUrlFromStoredValue(value, bucketOverride = "") {
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return "";
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;

  const { url, storageBucket } = getSupabaseConfig();
  const bucket = text(bucketOverride || storageBucket);
  let pathValue = raw;
  try {
    const maybeUrl = new URL(raw, url || "https://placeholder.invalid");
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const signMarker = `/storage/v1/object/sign/${bucket}/`;
    if (bucket && maybeUrl.pathname.includes(publicMarker)) pathValue = maybeUrl.pathname.split(publicMarker)[1] || "";
    else if (bucket && maybeUrl.pathname.includes(signMarker)) pathValue = maybeUrl.pathname.split(signMarker)[1] || "";
  } catch {}

  pathValue = text(pathValue)
    .replace(/^\/+/, "")
    .replace(/^object\/public\//i, "")
    .replace(/^storage\/v1\/object\/public\//i, "")
    .split("?")[0];
  if (bucket && pathValue.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) pathValue = pathValue.slice(bucket.length + 1);
  if (!pathValue || /^https?:/i.test(pathValue)) return "";
  return storagePublicUrl(pathValue, bucket || null) || "";
}

function fileNameFromValue(value, fallback = "Order receipt") {
  const raw = text(value);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, "https://placeholder.invalid");
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return last || fallback;
  } catch {}
  return text(raw.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop()) || fallback;
}

function normalizeEntries(rawValue, fallbackPrefix = "Order receipt") {
  const out = [];
  const seen = new Set();
  const add = (entry, index = 0) => {
    if (entry === null || typeof entry === "undefined") return;
    if (Array.isArray(entry)) {
      entry.forEach((item, itemIndex) => add(item, itemIndex));
      return;
    }
    if (typeof entry === "object") {
      const rawUrl = text(entry.url || entry.href || entry.publicUrl || entry.public_url || entry.signedUrl || entry.signedURL || entry.downloadUrl || entry.downloadURL || entry.file?.url || entry.external?.url || entry.path || entry.fullPath || entry.full_path || entry.storagePath || entry.storage_path || entry.key || entry.Key);
      const bucket = text(entry.bucket || entry.bucketName || entry.bucket_name);
      const url = publicUrlFromStoredValue(rawUrl, bucket);
      const name = text(entry.name || entry.filename || entry.fileName || entry.originalName || entry.original_name)
        || fileNameFromValue(rawUrl, `${fallbackPrefix} ${index + 1}`);
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ name, url });
      return;
    }
    const raw = text(entry);
    if (!raw || /^null$/i.test(raw)) return;
    const url = publicUrlFromStoredValue(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ name: fileNameFromValue(raw, `${fallbackPrefix} ${index + 1}`), url });
  };

  if (Array.isArray(rawValue) || (rawValue && typeof rawValue === "object")) {
    add(rawValue, 0);
    return out;
  }
  const raw = text(rawValue);
  if (!raw || /^null$/i.test(raw)) return out;
  try {
    add(JSON.parse(raw), 0);
    if (out.length) return out;
  } catch {}
  const urls = raw.match(/https?:\/\/[^\s,"'<>]+/gi) || [];
  if (urls.length) {
    urls.forEach((url, index) => add(url, index));
    return out;
  }
  raw.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean).forEach((part, index) => add(part, index));
  return out;
}

function entryType(entry = {}) {
  const probe = `${text(entry?.name)} ${text(entry?.url)}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|\s|$)/i.test(probe) || /^data:image\//i.test(text(entry?.url))) return "image";
  if (/\.pdf(\?|#|\s|$)/i.test(probe)) return "pdf";
  return "file";
}

function hasReceiptValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return !!text(value) && !/^null$/i.test(text(value));
}

function orderReceiptRaw(row = {}) {
  const primary = valueFor(row, [
    "order_receipt", "Order Receipt", "delivery_receipt", "Delivery Receipt", "receipt_photos", "Receipt Photos",
  ]);
  if (hasReceiptValue(primary)) return primary;
  return valueFor(row, ["maintenance_receipt", "Maintenance Receipt"]);
}

async function rowsForReference(reference) {
  const raw = text(reference);
  if (/^\d+$/.test(raw)) {
    const row = await selectById(ordersTable(), raw);
    if (row) return [row];
    // A bare number can also be an order number after older row ids disappear.
    const byOrder = await select(ordersTable(), { select: "*", order_number: `eq.${raw}`, limit: "5000" });
    return Array.isArray(byOrder) ? byOrder : [];
  }
  const orderMatch = raw.match(/^ord(?::|-|\s)?(\d+)$/i) || raw.match(/^order(?::|-|\s)?(\d+)$/i);
  if (orderMatch?.[1]) {
    const rows = await select(ordersTable(), { select: "*", order_number: `eq.${orderMatch[1]}`, limit: "5000" });
    return Array.isArray(rows) ? rows : [];
  }

  const legacyRows = await rowsForLegacyReference(raw);
  if (legacyRows.length) return legacyRows;

  const error = new Error("Order receipt reference was not found in Supabase.");
  error.code = "ORDER_RECEIPT_REFERENCE_NOT_FOUND";
  error.status = legacyReferenceCandidates(raw).length ? 404 : 422;
  throw error;
}

async function loadDirect(rawIds) {
  const ids = normalizeIds(rawIds);
  if (!ids.length) {
    const error = new Error("Missing order ids");
    error.status = 400;
    throw error;
  }
  const items = [];
  const seen = new Set();
  for (const sourceId of ids) {
    const rows = await rowsForReference(sourceId);
    for (const row of rows) {
      const entries = normalizeEntries(orderReceiptRaw(row), "Order receipt");
      for (const entry of entries) {
        if (!entry?.url || seen.has(entry.url)) continue;
        seen.add(entry.url);
        items.push({ ...entry, sourceId, type: entryType(entry) });
      }
    }
  }
  return { ok: true, source: "supabase-next", items, ids, count: items.length };
}

export async function loadOrderReceiptViewerItems(rawIds, { fresh = false } = {}) {
  const ids = normalizeIds(rawIds);
  const key = ids.join(",");
  if (!key) return await loadDirect(rawIds);
  const cached = receiptCache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!fresh && receiptInflight.has(key)) return await receiptInflight.get(key);
  const pending = loadDirect(key);
  if (!fresh) receiptInflight.set(key, pending);
  try {
    const payload = await pending;
    receiptCache.set(key, { value: payload, expiresAt: Date.now() + RECEIPT_CACHE_TTL_MS });
    return payload;
  } finally {
    receiptInflight.delete(key);
  }
}
