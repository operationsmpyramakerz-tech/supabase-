import "server-only";
import { getProductsCatalog } from "./products-service";
import { listTeamMembersLite } from "./team-members-service";
import { getReviewerVisibility } from "./reviewer-visibility-service";
import {
  canUseStocktakingFolderSummaryRpc,
  invalidateStocktakingFolderSummaryRpcCache,
  loadStocktakingFolderSummariesRpc,
  noteStocktakingFolderSummaryRpcError,
} from "./stocktaking-folder-summary-rpc";
import { getSupabaseConfig, insert, rpc, selectAll, selectById, storagePublicUrl, updateById } from "./supabase-rest";
import { verifyPageAdminPasswordDirect } from "./order-action-auth";

const STOCK_ROWS_CACHE_TTL_MS = 20_000;
const STOCK_SCHEMA_CACHE_TTL_MS = 5 * 60_000;
const STOCK_PROJECTION_CACHE_TTL_MS = 20_000;
let stockRowsCache = null;
let stockRowsInflight = null;
let stockSchemaCache = null;
let stockSchemaInflight = null;
const stockProjectionCache = new Map();
const stockProjectionInflight = new Map();

export function invalidateStocktakingReadCaches() {
  stockRowsCache = null;
  stockRowsInflight = null;
  stockSchemaCache = null;
  stockSchemaInflight = null;
  stockProjectionCache.clear();
  stockProjectionInflight.clear();
  invalidateStocktakingFolderSummaryRpcCache();
}

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.url || value.external?.url || value.file?.url);
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value) {
  if (value === null || typeof value === "undefined" || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonical(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function stockColumnKey(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/%/g, " percent ")
    .replace(/[’'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function titleCase(value) {
  return text(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

function urlValue(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}

function movementColor(name) {
  const token = canonical(name);
  if (["requestproducts", "requestproduct", "requestcomponents", "requestcomponent"].includes(token)) return "green";
  if (["withdrawproducts", "withdrawproduct", "withdrawalproducts", "withdrawalproduct", "withdrawcomponents", "withdrawcomponent", "withdrawalcomponents", "withdrawalcomponent"].includes(token)) return "red";
  return "default";
}

function allKeys(rows = []) {
  const seen = new Set();
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) seen.add(key);
  }
  return [...seen];
}

function findKey(keys = [], aliases = []) {
  const byCanonical = new Map((keys || []).map((key) => [canonical(key), key]));
  for (const alias of aliases || []) {
    const exact = (keys || []).find((key) => key === alias);
    if (exact) return exact;
    const hit = byCanonical.get(canonical(alias));
    if (hit) return hit;
  }
  return "";
}

function findQuantityColumnFromKeys(keys = [], schoolName = "") {
  if (!keys.length) return "";
  const base = stockColumnKey(schoolName);
  const candidates = [
    schoolName,
    base,
    base && !base.endsWith("_done") ? `${base}_done` : "",
    base && base.endsWith("_done") ? base.replace(/_done$/, "") : "",
    base && !base.endsWith("_2nd_term") ? `${base}_2nd_term` : "",
    "total_quantity",
    "all_schools_stock",
    "all_done",
    "all_2nd_term",
    "quantity",
    "stock",
  ].filter(Boolean);

  const direct = findKey(keys, candidates);
  if (direct) return direct;
  if (base) {
    const fuzzy = keys.find((key) => {
      const normalized = stockColumnKey(key);
      return normalized === base || normalized === `${base}_done` || normalized === `${base}_2nd_term`
        || (normalized.includes(base) && /(done|stock|quantity|2nd_term)/i.test(normalized));
    });
    if (fuzzy) return fuzzy;
  }
  return "";
}

function findQuantityColumn(rows = [], schoolName = "") {
  return findQuantityColumnFromKeys(allKeys(rows), schoolName);
}

function isInventoryMetaColumn(key = "") {
  const raw = text(key).toLowerCase();
  const token = canonical(raw);
  if (!/(inventory|defected|defecated)/i.test(token)) return false;
  return /\d{4}[_-]\d{2}[_-]\d{2}/.test(raw) || /\d{8}$/.test(token);
}

function usefulStockFolderColumn(key = "") {
  const token = canonical(key);
  if (!token) return false;
  const blocked = new Set([
    "id", "createdat", "updatedat", "importedat", "createdtime", "lasteditedtime", "lasteditedby",
    "name", "product", "products", "productname", "producturl", "itemurl", "url", "tag", "tags",
    "componenttag", "producttag", "kittag", "sourcekit", "sourceorderid", "sourceordernumber",
    "orderid", "ordernumber", "ordertype", "teammemberid", "teammembername", "userid", "username",
    "createdby", "ownername", "employee", "school", "stocktakingcolumn",
    "idcode", "customizeid", "receiptnumber", "receiptphotos", "receiptphoto", "receiptimages", "receiptimage",
    "receipturls", "receipturl", "orderreceipt", "attachments", "files",
    "onekitquantity", "unityprice", "unitprice", "onepieceprice", "totalprice", "totalcost", "totalquantity",
    "allprice", "manualquantitytopurchase", "quantitytopurchase", "allschoolsneed", "allschoolsquantities",
    "allschoolsstock", "schoolkit", "schooltotalquantites", "schooltotalquantities",
  ]);
  if (blocked.has(token)) return false;
  if (/^(g|grade)\d/.test(token)) return false;
  if (/^(checkbox|button|a|b|c)$/.test(token)) return false;
  return true;
}

function ownerBase(value = "") {
  let key = stockColumnKey(value);
  let previous = "";
  while (key && key !== previous) {
    previous = key;
    key = key.replace(/_(?:2nd_term|second_term|done|stock|quantity)$/i, "");
  }
  return key;
}

function receiptPublicUrl(value, bucketOverride = "") {
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return "";
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  try {
    const { storageBucket } = getSupabaseConfig();
    const bucket = text(bucketOverride || storageBucket);
    let pathValue = raw.replace(/^\/+/, "").replace(/^object\/public\//i, "").replace(/^storage\/v1\/object\/public\//i, "").split("?")[0];
    if (bucket && pathValue.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) pathValue = pathValue.slice(bucket.length + 1);
    return storagePublicUrl(pathValue, bucket || null) || "";
  } catch {
    return "";
  }
}

function receiptName(value, fallback = "Receipt photo") {
  const raw = text(value);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, "https://placeholder.invalid");
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return last || fallback;
  } catch {}
  const last = raw.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop();
  return text(last) || fallback;
}

function normalizeReceiptEntries(rawValue, fallbackPrefix = "Receipt photo") {
  const out = [];
  const seen = new Set();
  const add = (entry, index = 0) => {
    if (entry === null || typeof entry === "undefined") return;
    if (Array.isArray(entry)) {
      entry.forEach((item, itemIndex) => add(item, itemIndex));
      return;
    }
    if (typeof entry === "object") {
      const rawUrl = text(entry.url || entry.href || entry.publicUrl || entry.public_url || entry.signedUrl || entry.signedURL || entry.file?.url || entry.external?.url || entry.path || entry.fullPath || entry.full_path || entry.storagePath || entry.storage_path || entry.key || entry.Key);
      const bucket = text(entry.bucket || entry.bucketName || entry.bucket_name);
      const url = receiptPublicUrl(rawUrl, bucket);
      const name = text(entry.name || entry.filename || entry.fileName || entry.originalName || entry.original_name) || receiptName(rawUrl, `${fallbackPrefix} ${index + 1}`);
      if (!url) return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push({ name, url });
      return;
    }
    const raw = text(entry);
    if (!raw || /^null$/i.test(raw)) return;
    const url = receiptPublicUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ name: receiptName(raw, `${fallbackPrefix} ${index + 1}`), url });
  };

  if (Array.isArray(rawValue) || (rawValue && typeof rawValue === "object")) {
    add(rawValue, 0);
    return out;
  }
  const raw = text(rawValue);
  if (!raw || /^null$/i.test(raw)) return out;
  try {
    const parsed = JSON.parse(raw);
    add(parsed, 0);
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

function serializeRow(row = {}, quantityColumn = "", { inventoryColumn = "", defectedColumn = "" } = {}) {
  const name = text(valueFor(row, ["name", "Name", "component", "Component", "product_name", "Product Name"])) || "Untitled";
  const productName = text(valueFor(row, ["product_name", "Product Name", "product", "Product"])) || name;
  const url =
    urlValue(valueFor(row, ["url", "URL"])) ||
    urlValue(valueFor(row, ["product_url", "Product URL"])) ||
    urlValue(valueFor(row, ["item_url", "Item URL"]));
  const tagName = text(valueFor(row, ["tag", "Tag", "tags", "Tags"])) || "Untagged";
  const componentTag = text(valueFor(row, ["component_tag", "Component Tag", "product_tag", "Product Tag"])) || null;
  const kitTag = text(valueFor(row, ["kit_tag", "Kit Tag", "source_kit", "Source Kit", "kit_name", "Kit Name"])) || null;
  const sourceOrderRowId = text(valueFor(row, ["source_order_id", "Source Order ID", "source_order", "Source Order", "order_row_id", "Order Row ID"])) || null;
  const rawOrderNumber = text(valueFor(row, ["source_order_number", "Source Order Number", "order_id", "Order ID", "order_number", "Order Number"]));
  const orderNumber = rawOrderNumber ? (/^\d+$/.test(rawOrderNumber) ? `ORD-${rawOrderNumber}` : rawOrderNumber) : null;
  const receiptPhotosRaw = valueFor(row, [
    "receipt_photos", "Receipt Photos", "receipt_photo", "Receipt Photo", "receipt_images", "Receipt Images",
    "receipt_image", "Receipt Image", "order_receipt", "Order Receipt", "attachments", "Attachments", "files", "Files",
  ]);
  const customizeId = text(valueFor(row, ["customize_id", "Customize ID", "custom_id", "Custom ID"])) || null;
  const originalIdCode = text(valueFor(row, ["id_code", "ID Code", "id code", "code", "Code"])) || null;

  return {
    id: text(valueFor(row, ["id", "ID", "notion_id", "Notion ID"])),
    name,
    productName,
    url,
    quantity: number(quantityColumn ? row?.[quantityColumn] : 0),
    oneKitQuantity: number(valueFor(row, ["one_kit_quantity", "One Kit Quantity", "one kit quantity"])),
    idCode: customizeId || originalIdCode,
    originalIdCode,
    customizeId,
    receiptNumber: text(valueFor(row, ["receipt_number", "Receipt Number", "store_receipt_number", "Store Receipt Number", "receipt", "Receipt", "order_receipt", "Order Receipt"])),
    receiptPhotos: normalizeReceiptEntries(receiptPhotosRaw, "Receipt photo"),
    unitPrice: number(valueFor(row, ["unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price"])),
    userName: text(valueFor(row, ["user_name", "username", "User Name", "Username", "created_by", "Created By", "requested_by", "Requested By", "owner_name", "Owner Name", "employee", "Employee"])) || "Unknown user",
    componentTag,
    kitTag,
    orderNumber,
    sourceOrderRowId,
    inventory: inventoryColumn ? nullableNumber(row?.[inventoryColumn]) : null,
    defected: defectedColumn ? nullableNumber(row?.[defectedColumn]) : null,
    inventoryColumn: inventoryColumn || null,
    defectedColumn: defectedColumn || null,
    tag: { name: tagName, color: movementColor(tagName) },
    quantityColumn: quantityColumn || null,
    source: "supabase-next",
  };
}

function accountMatchesMember(account = {}, row = {}) {
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  const rowId = text(valueFor(row, ["id", "ID"]));
  if (accountId && rowId && accountId === rowId) return true;
  const accountNames = [account.username, account.name].map(canonical).filter(Boolean);
  const rowNames = [valueFor(row, ["Username", "username"]), valueFor(row, ["Name", "name"])].map(canonical).filter(Boolean);
  if (accountNames.some((name) => rowNames.includes(name))) return true;
  const accountEmail = canonical(account.email);
  const rowEmail = canonical(valueFor(row, ["Email", "email"]));
  return !!accountEmail && !!rowEmail && accountEmail === rowEmail;
}

function stocktakingBuiltInAdmin(account = {}) {
  const name = canonical(account?.name || account?.username);
  const position = canonical(account?.position);
  return name === "admin" || position.includes("admin");
}

export function stocktakingAccessLevel(account = {}) {
  if (stocktakingBuiltInAdmin(account)) return "admin";

  const pageRows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const rank = { view: 1, edit: 2, admin: 3 };
  let best = "";
  for (const row of pageRows) {
    if (row?.isEnabled === false) continue;
    const candidates = [row?.pageName, row?.pageKey, row?.routePath, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
      .map(canonical)
      .filter(Boolean);
    if (!candidates.some((value) => value === "stocktaking" || value === "nextstocktaking" || value.endsWith("stocktaking"))) continue;
    const raw = text(row?.accessLevel || row?.access_level).toLowerCase();
    const level = raw === "admin" ? "admin" : raw === "view" ? "view" : "edit";
    if (!best || rank[level] > rank[best]) best = level;
  }
  if (best) return best;

  // Legacy account payloads only carry allowedPages. The legacy server treats
  // an enabled Stocktaking page without a granular access row as Edit.
  const allowed = Array.isArray(account?.allowedPages) ? account.allowedPages.map(canonical) : [];
  if (allowed.some((value) => value === "stocktaking" || value === "nextstocktaking" || value.endsWith("stocktaking"))) return "edit";
  return "view";
}

function stocktakingFolderMatches(folder = {}, ids = new Set(), names = new Set()) {
  const userId = text(folder?.userId);
  if (userId && ids.has(userId)) return true;
  const folderNames = [folder?.label, folder?.stocktakingLabel, folder?.key]
    .map((value) => ownerBase(value))
    .filter(Boolean);
  return folderNames.some((value) => names.has(value));
}

export async function filterStocktakingFoldersForAccount(folders = [], account = {}, { fresh = false } = {}) {
  const source = Array.isArray(folders) ? folders : [];
  const level = stocktakingAccessLevel(account);
  if (level === "admin") return source;

  const ownIds = new Set([text(account?.teamMemberId || account?.userSupabaseId || account?.id || account?.userId)].filter(Boolean));
  const ownNames = new Set([account?.name, account?.username].map(ownerBase).filter(Boolean));
  const allowedIds = new Set(ownIds);
  const allowedNames = new Set(ownNames);

  if (level === "edit") {
    const visibility = await getReviewerVisibility(account, { fresh }).catch(() => ({ ids: [], names: [], queryNames: [] }));
    for (const id of Array.isArray(visibility?.ids) ? visibility.ids : []) {
      const clean = text(id);
      if (clean) allowedIds.add(clean);
    }
    for (const name of [...(Array.isArray(visibility?.names) ? visibility.names : []), ...(Array.isArray(visibility?.queryNames) ? visibility.queryNames : [])]) {
      const clean = ownerBase(name);
      if (clean) allowedNames.add(clean);
    }
  }

  return source.filter((folder) => stocktakingFolderMatches(folder, allowedIds, allowedNames));
}

export async function canAccessStocktakingColumn(account = {}, column = "", { fresh = false } = {}) {
  const requested = text(column);
  if (!requested) return false;
  const folders = await listStocktakingFolders({ fresh, account });
  return folders.some((folder) => text(folder?.key) === requested);
}

function stocktakingTable() {
  return text(process.env.SUPABASE_STOCKTAKING_TABLE) || "stocktaking";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

async function loadStockRows({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && stockRowsCache && stockRowsCache.expiresAt > now) return stockRowsCache.value;
  if (!fresh && stockRowsInflight) return await stockRowsInflight;
  const pending = selectAll(stocktakingTable(), { limit: 5000, order: "name.asc,id.asc", profileName: "stocktaking.rows-full-fallback" });
  if (!fresh) stockRowsInflight = pending;
  try {
    const loaded = await pending;
    const rows = Array.isArray(loaded) ? loaded : [];
    stockRowsCache = { value: rows, expiresAt: Date.now() + STOCK_ROWS_CACHE_TTL_MS };
    return rows;
  } finally {
    if (!fresh) stockRowsInflight = null;
  }
}

const STOCK_DETAIL_METADATA_ALIASES = [
  "id", "ID", "notion_id", "Notion ID",
  "name", "Name", "component", "Component", "product_name", "Product Name", "product", "Product",
  "url", "URL", "product_url", "Product URL", "item_url", "Item URL",
  "tag", "Tag", "tags", "Tags",
  "component_tag", "Component Tag", "product_tag", "Product Tag",
  "kit_tag", "Kit Tag", "source_kit", "Source Kit", "kit_name", "Kit Name",
  "source_order_id", "Source Order ID", "source_order", "Source Order", "order_row_id", "Order Row ID",
  "source_order_number", "Source Order Number", "order_id", "Order ID", "order_number", "Order Number",
  "receipt_photos", "Receipt Photos", "receipt_photo", "Receipt Photo", "receipt_images", "Receipt Images",
  "receipt_image", "Receipt Image", "order_receipt", "Order Receipt", "attachments", "Attachments", "files", "Files",
  "customize_id", "Customize ID", "custom_id", "Custom ID", "id_code", "ID Code", "id code", "code", "Code",
  "one_kit_quantity", "One Kit Quantity", "one kit quantity",
  "receipt_number", "Receipt Number", "store_receipt_number", "Store Receipt Number", "receipt", "Receipt",
  "unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price",
  "user_name", "username", "User Name", "Username", "created_by", "Created By", "requested_by", "Requested By",
  "owner_name", "Owner Name", "employee", "Employee",
];
const STOCK_DETAIL_METADATA_KEYS = new Set(STOCK_DETAIL_METADATA_ALIASES.map(canonical));

function quoteStockSelectColumn(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function stockProjectionKey(keys = []) {
  return [...new Set((keys || []).map(text).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("\u001f");
}

async function loadStockSchemaKeys({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && stockRowsCache?.expiresAt > now && Array.isArray(stockRowsCache?.value) && stockRowsCache.value.length) {
    return allKeys(stockRowsCache.value);
  }
  if (!fresh && stockSchemaCache && stockSchemaCache.expiresAt > now) return stockSchemaCache.value;
  if (!fresh && stockSchemaInflight) return await stockSchemaInflight;

  const pending = selectAll(stocktakingTable(), { limit: 1, profileName: "stocktaking.schema-sample" });
  if (!fresh) stockSchemaInflight = pending;
  try {
    const sampleRows = await pending;
    const keys = allKeys(Array.isArray(sampleRows) ? sampleRows : []);
    stockSchemaCache = { value: keys, expiresAt: Date.now() + STOCK_SCHEMA_CACHE_TTL_MS };
    return keys;
  } finally {
    if (!fresh) stockSchemaInflight = null;
  }
}

async function loadStockProjection(keys = [], { fresh = false } = {}) {
  const uniqueKeys = [...new Set((keys || []).map(text).filter(Boolean))];
  if (!uniqueKeys.length) return [];
  const selectExpr = uniqueKeys.map(quoteStockSelectColumn).filter(Boolean).join(",");
  // Extremely wide customized schemas can exceed safe URL sizes. Falling back
  // to the compatibility full-row query is safer than risking a 414 response.
  if (!selectExpr || selectExpr.length > 7000) return null;

  const cacheKey = stockProjectionKey(uniqueKeys);
  const now = Date.now();
  const cached = stockProjectionCache.get(cacheKey);
  if (!fresh && cached?.expiresAt > now) return cached.value;
  if (!fresh && stockProjectionInflight.has(cacheKey)) return await stockProjectionInflight.get(cacheKey);

  const hasName = uniqueKeys.includes("name");
  const hasId = uniqueKeys.includes("id");
  const pending = selectAll(stocktakingTable(), {
    limit: 5000,
    select: selectExpr,
    order: hasName ? `name.asc${hasId ? ",id.asc" : ""}` : "",
    profileName: "stocktaking.rows-projection",
  });
  if (!fresh) stockProjectionInflight.set(cacheKey, pending);
  try {
    const loaded = await pending;
    const rows = Array.isArray(loaded) ? loaded : [];
    stockProjectionCache.set(cacheKey, { value: rows, expiresAt: Date.now() + STOCK_PROJECTION_CACHE_TTL_MS });
    if (stockProjectionCache.size > 40) {
      for (const [key, entry] of stockProjectionCache.entries()) {
        if (entry?.expiresAt <= Date.now()) stockProjectionCache.delete(key);
      }
      if (stockProjectionCache.size > 40) stockProjectionCache.delete(stockProjectionCache.keys().next().value);
    }
    return rows;
  } finally {
    if (!fresh) stockProjectionInflight.delete(cacheKey);
  }
}

function resolveRequestedColumnFromKeys(keys = [], requested = "") {
  const raw = text(requested);
  if (!raw) return "";
  const resolved = keys.find((key) => key === raw) || findKey(keys, [raw]);
  if (!resolved || !usefulStockFolderColumn(resolved) || isInventoryMetaColumn(resolved)) {
    const error = new Error("The selected Stocktaking column is not available.");
    error.status = 404;
    throw error;
  }
  return resolved;
}

function resolveSessionColumnFromKeys(keys = [], requested = "", kind = "") {
  const raw = text(requested);
  if (!raw) return "";
  const resolved = keys.find((key) => key === raw) || findKey(keys, [raw]);
  if (!resolved) {
    const error = new Error(`The selected ${kind || "inventory"} column is not available.`);
    error.status = 404;
    throw error;
  }
  const token = canonical(resolved);
  if (kind === "inventory" && !token.includes("inventory")) {
    const error = new Error("Invalid Inventory column.");
    error.status = 400;
    throw error;
  }
  if (kind === "defected" && !token.includes("defected") && !token.includes("defecated")) {
    const error = new Error("Invalid Defecated column.");
    error.status = 400;
    throw error;
  }
  return resolved;
}

function stockDetailProjectionKeys(schemaKeys = [], extraKeys = []) {
  return [...new Set([
    ...schemaKeys.filter((key) => STOCK_DETAIL_METADATA_KEYS.has(canonical(key))),
    ...(extraKeys || []).map(text).filter(Boolean),
  ])];
}

function resolveRequestedColumn(rows = [], requested = "") {
  return resolveRequestedColumnFromKeys(allKeys(rows), requested);
}

function resolveSessionColumn(rows = [], requested = "", kind = "") {
  return resolveSessionColumnFromKeys(allKeys(rows), requested, kind);
}

async function enrichComponentTags(items = []) {
  if (!(items || []).some((item) => !text(item?.componentTag))) return items;
  try {
    const catalog = await getProductsCatalog();
    const byName = new Map();
    const byUrl = new Map();
    for (const product of Array.isArray(catalog?.products) ? catalog.products : []) {
      const nameKey = canonical(product?.name);
      const urlKey = text(product?.url).toLowerCase();
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
      if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, product);
    }
    return (items || []).map((item) => {
      if (text(item?.componentTag)) return item;
      const product = byName.get(canonical(item?.productName || item?.name)) || byUrl.get(text(item?.url).toLowerCase()) || null;
      const firstProductTag = (Array.isArray(product?.tags) ? product.tags : []).map(text).find(Boolean);
      return { ...item, componentTag: firstProductTag || item?.tag?.name || "Untagged" };
    });
  } catch {
    return items;
  }
}

export async function listStocktakingFolders({ fresh = false, account = null } = {}) {
  const membersPromise = listTeamMembersLite({ fresh });
  const folderBlocked = new Set([
    "sourceorderid", "sourceordernumber", "orderid", "ordernumber", "teammemberid", "teammembername",
    "userid", "username", "createdby", "ownername", "employee", "school", "stocktakingcolumn",
  ]);
  const eligibleKey = (key) => usefulStockFolderColumn(key) && !folderBlocked.has(canonical(key)) && !isInventoryMetaColumn(key);

  const buildFolders = (summaries, members) => {
    const cleanSummaries = (Array.isArray(summaries) ? summaries : [])
      .map((entry) => ({
        key: text(entry?.key),
        itemsCount: Math.max(0, Math.trunc(number(entry?.itemsCount))),
        total: number(entry?.total),
      }))
      .filter((entry) => entry.key && eligibleKey(entry.key));
    const keys = cleanSummaries.map((entry) => entry.key);
    const memberByColumn = new Map();

    for (const member of Array.isArray(members) ? members : []) {
      const exactResolved = member?.stocktakingColumn ? findQuantityColumnFromKeys(keys, member.stocktakingColumn) : "";
      if (exactResolved && keys.includes(exactResolved) && !memberByColumn.has(exactResolved)) memberByColumn.set(exactResolved, member);
      const bases = new Set([ownerBase(member?.name), ownerBase(member?.stocktakingColumn)].filter(Boolean));
      if (!bases.size) continue;
      for (const key of keys) {
        if (memberByColumn.has(key)) continue;
        const keyBase = ownerBase(key);
        if (keyBase && bases.has(keyBase)) memberByColumn.set(key, member);
      }
    }

    return cleanSummaries.map((entry) => {
      const owner = memberByColumn.get(entry.key) || null;
      const fallback = titleCase(entry.key).replace(/\s+Stock$/i, "").trim() || titleCase(entry.key);
      return {
        key: entry.key,
        label: owner?.name || fallback,
        userId: owner?.id || null,
        stocktakingLabel: owner?.stocktakingColumn || titleCase(entry.key),
        itemsCount: entry.itemsCount,
        total: entry.total,
      };
    }).filter((item) => item.itemsCount > 0).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  };

  // Fast path: PostgreSQL returns one aggregate row per quantity column. This
  // avoids transferring the full, very wide Stocktaking matrix on every visit
  // to the folder landing page. The existing projection/full-row path remains
  // below as a compatibility fallback for customized schemas.
  if (canUseStocktakingFolderSummaryRpc()) {
    try {
      const [summaries, members] = await Promise.all([
        loadStocktakingFolderSummariesRpc({ fresh }),
        membersPromise,
      ]);
      const folders = buildFolders(summaries, members);
      return account ? await filterStocktakingFoldersForAccount(folders, account, { fresh }) : folders;
    } catch (error) {
      noteStocktakingFolderSummaryRpcError(error);
      console.warn("[stocktaking] folder summary RPC unavailable; using projection compatibility path:", error?.message || error);
    }
  }

  let rows = null;
  let keys = [];

  try {
    const schemaKeys = await loadStockSchemaKeys({ fresh });
    keys = schemaKeys.filter(eligibleKey);
    // The folder screen only needs the dynamic stock quantity columns to
    // calculate item counts/totals. Avoid downloading receipts, URLs, tags and
    // all other row metadata before a folder is opened.
    rows = await loadStockProjection(keys, { fresh });
  } catch (error) {
    console.warn("[stocktaking] lightweight folder projection unavailable; using full-row compatibility query:", error?.message || error);
  }

  if (!Array.isArray(rows)) {
    rows = await loadStockRows({ fresh });
    keys = allKeys(rows).filter(eligibleKey);
  }

  const summaries = keys.map((key) => {
    let itemsCount = 0;
    let total = 0;
    for (const row of rows) {
      if (typeof row?.[key] === "boolean") continue;
      const value = Number(row?.[key]);
      if (!Number.isFinite(value) || value === 0) continue;
      itemsCount += 1;
      total += value;
    }
    return { key, itemsCount, total };
  });
  const folders = buildFolders(summaries, await membersPromise);
  return account ? await filterStocktakingFoldersForAccount(folders, account, { fresh }) : folders;
}

export async function stocktakingForColumn(column, { inventoryColumn = "", defectedColumn = "", fresh = false } = {}) {
  let rows = null;
  let quantityColumn = "";
  let inventory = "";
  let defected = "";

  try {
    const schemaKeys = await loadStockSchemaKeys({ fresh });
    quantityColumn = resolveRequestedColumnFromKeys(schemaKeys, column);
    inventory = resolveSessionColumnFromKeys(schemaKeys, inventoryColumn, "inventory");
    defected = resolveSessionColumnFromKeys(schemaKeys, defectedColumn, "defected");
    const projectionKeys = stockDetailProjectionKeys(schemaKeys, [quantityColumn, inventory, defected]);
    // Once a folder is opened, fetch only that folder quantity plus the fields
    // actually rendered/edited by Stocktaking. Other schools' quantity columns
    // and historical inventory columns are intentionally excluded.
    rows = await loadStockProjection(projectionKeys, { fresh });
  } catch (error) {
    console.warn("[stocktaking] targeted folder projection unavailable; using full-row compatibility query:", error?.message || error);
  }

  if (!Array.isArray(rows)) {
    rows = await loadStockRows({ fresh });
    quantityColumn = resolveRequestedColumn(rows, column);
    inventory = resolveSessionColumn(rows, inventoryColumn, "inventory");
    defected = resolveSessionColumn(rows, defectedColumn, "defected");
  }

  const items = rows
    .map((row) => serializeRow(row, quantityColumn, { inventoryColumn: inventory, defectedColumn: defected }))
    .filter((item) => Number(item.quantity) !== 0)
    .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { numeric: true, sensitivity: "base" }) || String(a?.id || "").localeCompare(String(b?.id || "")));
  return await enrichComponentTags(items);
}

export async function listStocktakingProducts({ fresh = false } = {}) {
  const catalog = await getProductsCatalog({ fresh });
  return Array.isArray(catalog?.products) ? catalog.products : [];
}

export async function stocktakingForAccount(account = {}, { fresh = false } = {}) {
  // Direct-session accounts already carry the canonical Supabase Team Member id.
  // Use that indexed lookup first instead of downloading the whole Team Members
  // directory just to identify the current user's Stocktaking school/column.
  // Older/legacy account payloads keep the established directory + full-row
  // compatibility fallbacks below.
  const memberId = text(account.teamMemberId || account.userSupabaseId || account.id || account.userId);
  const [directMember, schemaKeys] = await Promise.all([
    memberId
      ? selectById(teamMembersTable(), memberId, { profileName: "stocktaking.member-by-id" }).catch(() => null)
      : Promise.resolve(null),
    loadStockSchemaKeys({ fresh }).catch(() => []),
  ]);

  let member = directMember && accountMatchesMember(account, directMember) ? directMember : null;
  if (!member) {
    const memberRowsLite = await listTeamMembersLite({ fresh });
    member = (memberRowsLite || []).find((row) => accountMatchesMember(account, row)) || null;
  }
  // Old/customized Team Members schemas may only be matchable by email or a
  // legacy username column omitted from the lightweight directory. Keep the
  // full-row lookup as a narrow compatibility fallback instead of paying for
  // it on every Stocktaking request.
  if (!member) {
    const memberRows = await selectAll(teamMembersTable(), {
      limit: 5000,
      order: "name.asc,id.asc",
      profileName: "stocktaking.member-directory-fallback",
    });
    member = (memberRows || []).find((row) => accountMatchesMember(account, row)) || null;
  }
  const schoolName = text(member?.stocktakingColumn) || text(valueFor(member || {}, ["School", "school", "Stocktaking Column", "stocktaking_column"]));
  if (!schoolName) {
    const error = new Error("Could not determine school name for the current user.");
    error.status = 404;
    throw error;
  }

  let stockRows = null;
  let quantityColumn = "";
  try {
    quantityColumn = findQuantityColumnFromKeys(schemaKeys, schoolName);
    if (!quantityColumn) throw new Error(`Could not determine the Stocktaking quantity column for ${schoolName}.`);
    stockRows = await loadStockProjection(stockDetailProjectionKeys(schemaKeys, [quantityColumn]), { fresh });
  } catch (error) {
    console.warn("[stocktaking] targeted account projection unavailable; using full-row compatibility query:", error?.message || error);
  }

  if (!Array.isArray(stockRows)) {
    stockRows = await loadStockRows({ fresh });
    quantityColumn = findQuantityColumn(stockRows, schoolName);
  }

  if (!quantityColumn) {
    const error = new Error(`Could not determine the Stocktaking quantity column for ${schoolName}.`);
    error.status = 404;
    throw error;
  }

  const items = (stockRows || [])
    .map((row) => serializeRow(row, quantityColumn))
    .filter((item) => Number(item.quantity) !== 0)
    .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { numeric: true, sensitivity: "base" }) || String(a?.id || "").localeCompare(String(b?.id || "")));
  return await enrichComponentTags(items);
}

function stocktakingMutationError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra || {});
  return error;
}

function accountIdentity(account = {}) {
  return {
    id: text(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id),
    names: [account?.name, account?.username].map(canonical).filter(Boolean),
  };
}

async function stocktakingOwnerForColumn(column = "", { fresh = false } = {}) {
  const requested = text(column);
  if (!requested) return { id: null, name: "Stock user", stocktakingLabel: "" };
  const members = await listTeamMembersLite({ fresh }).catch(() => []);
  const requestedBase = ownerBase(requested);
  const owner = (members || []).find((member) => {
    const memberColumn = text(member?.stocktakingColumn);
    const exact = memberColumn ? findQuantityColumnFromKeys([requested], memberColumn) : "";
    if (exact === requested) return true;
    const bases = [member?.name, memberColumn].map(ownerBase).filter(Boolean);
    return requestedBase && bases.includes(requestedBase);
  }) || null;
  const fallback = titleCase(requested).replace(/\s+Stock$/i, "").trim() || titleCase(requested);
  return {
    id: text(owner?.id) || null,
    name: text(owner?.name) || fallback || "Stock user",
    stocktakingLabel: text(owner?.stocktakingColumn) || titleCase(requested),
  };
}

export async function authorizeStocktakingEdit(account = {}, requestedColumn = "", adminPassword = "", { fresh = false } = {}) {
  const level = stocktakingAccessLevel(account);
  if (!["edit", "admin"].includes(level)) {
    throw stocktakingMutationError("Your Stocktaking access is view only.", 403);
  }

  const keys = await loadStockSchemaKeys({ fresh });
  const quantityColumn = resolveRequestedColumnFromKeys(keys, requestedColumn);
  const visible = level === "admin" ? true : await canAccessStocktakingColumn(account, quantityColumn, { fresh });
  if (!visible) {
    throw stocktakingMutationError("This Stocktaking folder is not available for your access level.", 403);
  }

  const owner = await stocktakingOwnerForColumn(quantityColumn, { fresh });
  const identity = accountIdentity(account);
  const sameOwner = Boolean(
    (owner?.id && identity.id && String(owner.id) === identity.id)
    || (owner?.name && identity.names.includes(canonical(owner.name)))
  );
  if (sameOwner || level === "admin") {
    return { ok: true, quantityColumn, owner, accessLevel: level };
  }

  const password = text(adminPassword);
  if (!password) {
    throw stocktakingMutationError(
      `Admin password is required to edit ${owner?.name || "this Stocktaking folder"}.`,
      401,
      { requiresPassword: true },
    );
  }
  const verified = await verifyPageAdminPasswordDirect(account, password, ["Stocktaking"]);
  if (verified === null) {
    throw stocktakingMutationError("The direct Admin password context is unavailable.", 503);
  }
  if (!verified) {
    throw stocktakingMutationError("Invalid Admin password.", 401, { requiresPassword: true });
  }
  return { ok: true, quantityColumn, owner, accessLevel: level };
}

function productUpdatePatch(targetRow = {}, product = {}) {
  const keys = Object.keys(targetRow || {});
  const patch = {};
  const set = (aliases, value) => {
    const key = findKey(keys, aliases);
    if (!key) return;
    patch[key] = value;
  };
  const productName = text(product?.name) || "Untitled Product";
  set(["name", "Name", "component", "Component"], productName);
  set(["product_name", "Product Name", "product", "Product", "products", "Products"], productName);
  set(["product_id", "Product ID", "products_id", "Products ID"], product?.id || null);
  set(["product_url", "Product URL", "url", "URL", "item_url", "Item URL"], product?.url || null);
  set(["id_code", "ID Code", "code", "Code"], product?.displayId || product?.idCode || null);
  set(["unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price"], Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null);
  return patch;
}

function missingStocktakingColumnName(error) {
  const raw = String(error?.message || error?.details?.message || error?.details?.details || error?.hint || error?.details || "");
  return (
    (raw.match(/Could not find the ['\"]([^'\"]+)['\"] column/i) || [])[1]
    || (raw.match(/['\"]([^'\"]+)['\"] column of ['\"][^'\"]+['\"]/i) || [])[1]
    || (raw.match(/column ['\"]([^'\"]+)['\"]/i) || [])[1]
    || ""
  );
}

async function insertStocktakingRowSafe(row = {}, requiredColumns = []) {
  const payload = Object.fromEntries(Object.entries(row || {}).filter(([, value]) => typeof value !== "undefined"));
  const required = new Set((requiredColumns || []).map(text).filter(Boolean));
  const maxAttempts = Math.max(12, Math.min(64, Object.keys(payload).length + 4));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await insert(stocktakingTable(), payload);
    } catch (error) {
      const missing = missingStocktakingColumnName(error);
      if (!missing || !Object.prototype.hasOwnProperty.call(payload, missing)) throw error;
      if (required.has(missing)) {
        throw stocktakingMutationError(`Missing required Stocktaking column: ${missing}.`, 400);
      }
      delete payload[missing];
    }
  }
  throw stocktakingMutationError("Failed to insert the Stocktaking row because the table schema is incompatible.", 500);
}

function normalizeMultiline(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

function validReceiptPhotos(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (let index = 0; index < source.length; index += 1) {
    const entry = source[index] || {};
    const url = text(entry?.url);
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { throw stocktakingMutationError("Receipt photo URL must be a valid http(s) URL.", 400); }
    if (!/^https?:$/i.test(parsed.protocol)) throw stocktakingMutationError("Receipt photo URL must be a valid http(s) URL.", 400);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ name: text(entry?.name) || `Receipt photo ${index + 1}`, url });
  }
  return out;
}

export async function addStocktakingRow(account = {}, payload = {}) {
  const column = text(payload?.column || payload?.stockColumn);
  const productId = text(payload?.productId || payload?.product_id);
  const quantity = Number(payload?.quantity);
  if (!column) throw stocktakingMutationError("Choose a Stocktaking folder first.", 400);
  if (!productId) throw stocktakingMutationError("Choose a component for the new row.", 400);
  if (!Number.isFinite(quantity)) throw stocktakingMutationError("Stock quantity must be a valid number.", 400);

  const auth = await authorizeStocktakingEdit(account, column, payload?.adminPassword || payload?.password, { fresh: true });
  const products = await listStocktakingProducts({ fresh: true });
  const product = (products || []).find((item) => text(item?.id) === productId);
  if (!product) throw stocktakingMutationError("The selected Product component was not found.", 404);

  const keys = await loadStockSchemaKeys({ fresh: true });
  const row = { [auth.quantityColumn]: quantity };
  const set = (aliases, value, fallbackKey = "") => {
    if (value === null || typeof value === "undefined" || value === "") return "";
    const key = findKey(keys, aliases) || (!keys.length ? fallbackKey : "");
    if (!key) return "";
    row[key] = value;
    return key;
  };

  const productName = text(product?.name) || "Untitled Product";
  const nameKey = set(["name", "Name", "component", "Component"], productName, "name");
  set(["product_name", "Product Name", "product", "Product", "products", "Products"], productName, nameKey ? "" : "product_name");
  set(["product_id", "Product ID", "products_id", "Products ID"], product.id, "product_id");
  set(["product_url", "Product URL", "url", "URL", "item_url", "Item URL"], product?.url || null, "product_url");
  set(["id_code", "ID Code", "code", "Code"], product?.displayId || product?.idCode || null, "id_code");
  set(["unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price"], Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null, "unit_price");

  const suggestedTag = (Array.isArray(product?.tags) ? product.tags : []).map(text).find(Boolean);
  set(["tag", "Tag", "tags", "Tags"], text(payload?.tag) || suggestedTag || "Manual", "tag");
  set(["header", "Header", "stock_header", "Stock Header", "main_header", "Main Header"], "Main stock", "header");

  const receiptNumber = normalizeMultiline(payload?.receiptNumber || payload?.receipt_number);
  if (receiptNumber) set(["receipt_number", "Receipt Number", "receipt_no", "Receipt No", "receipt", "Receipt"], receiptNumber, "receipt_number");
  const photos = validReceiptPhotos(payload?.receiptPhotos);
  if (photos.length) {
    set(
      ["receipt_photos", "Receipt Photos", "receipt_photo", "Receipt Photo", "receipt_images", "Receipt Images", "receipt_image", "Receipt Image", "order_receipt", "Order Receipt", "attachments", "Attachments", "files", "Files"],
      JSON.stringify(photos),
      "receipt_photos",
    );
  }
  set(["team_member_id", "Team Member ID", "user_id", "User ID"], auth?.owner?.id || null);
  set(["team_member_name", "Team Member Name", "user_name", "User Name", "username", "Username"], auth?.owner?.name || null);

  const created = await insertStocktakingRowSafe(row, [auth.quantityColumn]);
  invalidateStocktakingReadCaches();
  return { ok: true, source: "supabase-next", column: auth.quantityColumn, row: created || row };
}

export async function updateStocktakingRows(account = {}, payload = {}) {
  const column = text(payload?.column || payload?.stockColumn);
  const updates = Array.isArray(payload?.updates) ? payload.updates : [];
  if (!column) throw stocktakingMutationError("Choose a Stocktaking folder first.", 400);
  if (!updates.length) return { ok: true, source: "supabase-next", updatedCount: 0 };
  if (updates.length > 500) throw stocktakingMutationError("Too many Stocktaking rows were submitted at once.", 400);

  const auth = await authorizeStocktakingEdit(account, column, payload?.adminPassword || payload?.password, { fresh: true });
  const [rows, products] = await Promise.all([loadStockRows({ fresh: true }), listStocktakingProducts({ fresh: true })]);
  const rowById = new Map((rows || []).map((row) => [text(valueFor(row, ["id", "ID"])), row]).filter(([id]) => Boolean(id)));
  const productMap = new Map((products || []).map((product) => [text(product?.id), product]).filter(([id]) => Boolean(id)));
  const normalized = updates.map((update) => {
    const id = text(update?.id);
    const quantity = Number(update?.quantity);
    const productId = text(update?.productId || update?.product_id);
    const targetRow = rowById.get(id);
    if (!id || !targetRow) throw stocktakingMutationError("One of the Stocktaking rows no longer exists. Refresh and try again.", 404);
    if (!Number.isFinite(quantity)) throw stocktakingMutationError("Stock quantities must be valid numbers.", 400);
    if (productId && !productMap.has(productId)) throw stocktakingMutationError("The selected Product component was not found.", 404);
    return { id, quantity, productId, targetRow };
  });

  await Promise.all(normalized.map((update) => {
    const patch = { [auth.quantityColumn]: update.quantity };
    if (update.productId) Object.assign(patch, productUpdatePatch(update.targetRow, productMap.get(update.productId)));
    return updateById(stocktakingTable(), update.id, patch);
  }));
  invalidateStocktakingReadCaches();
  return { ok: true, source: "supabase-next", column: auth.quantityColumn, updatedCount: normalized.length };
}

function normalizeInventoryDate(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? "" : raw;
}

async function ensureInventoryColumn(label = "", knownKeys = []) {
  const desired = stockColumnKey(label);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(desired)) throw stocktakingMutationError("Invalid inventory column name.", 400);
  const existing = (knownKeys || []).find((key) => key === desired) || findKey(knownKeys, [label, desired]);
  if (existing) return existing;
  try {
    await rpc("add_stocktaking_school_column", { column_name: desired }, { profileName: "stocktaking.add-inventory-column" });
  } catch (error) {
    if (/function .*add_stocktaking_school_column|Could not find the function|PGRST202|schema cache/i.test(String(error?.message || ""))) {
      throw stocktakingMutationError("Supabase helper function is not installed. Run supabase_user_access_helpers.sql once, then try again.", 500);
    }
    throw error;
  }
  invalidateStocktakingReadCaches();
  return desired;
}

export async function startStocktakingInventory(account = {}, payload = {}) {
  const column = text(payload?.column || payload?.stockColumn);
  if (!column) throw stocktakingMutationError("Choose a Stocktaking folder first.", 400);
  const allowed = await canAccessStocktakingColumn(account, column, { fresh: true });
  if (!allowed && stocktakingAccessLevel(account) !== "admin") {
    throw stocktakingMutationError("This Stocktaking folder is not available for your access level.", 403);
  }
  const dateISO = normalizeInventoryDate(payload?.date || payload?.inventoryDate || payload?.dateISO);
  if (!dateISO) throw stocktakingMutationError("Choose a valid inventory date.", 400);
  const rawMode = text(payload?.mode || payload?.columns || "both").toLowerCase();
  const mode = rawMode === "inventory" ? "inventory" : (["defected", "defecated"].includes(rawMode) ? "defected" : "both");

  let keys = await loadStockSchemaKeys({ fresh: true });
  const quantityColumn = resolveRequestedColumnFromKeys(keys, column);
  const owner = await stocktakingOwnerForColumn(quantityColumn, { fresh: true });
  let inventoryColumn = "";
  let defectedColumn = "";
  if (mode === "inventory" || mode === "both") {
    inventoryColumn = await ensureInventoryColumn(`${owner.name} Inventory ${dateISO}`, keys);
    if (inventoryColumn && !keys.includes(inventoryColumn)) keys = [...keys, inventoryColumn];
  }
  if (mode === "defected" || mode === "both") {
    defectedColumn = await ensureInventoryColumn(`${owner.name} Defected ${dateISO}`, keys);
    if (defectedColumn && !keys.includes(defectedColumn)) keys = [...keys, defectedColumn];
  }
  return {
    ok: true,
    source: "supabase-next",
    mode,
    date: dateISO,
    user: owner,
    stockColumn: quantityColumn,
    inventoryColumn: inventoryColumn || null,
    defectedColumn: defectedColumn || null,
  };
}

export async function updateStocktakingInventoryValue(account = {}, payload = {}) {
  const stockId = text(payload?.stockId || payload?.id);
  const requestedColumn = text(payload?.column);
  const stockColumn = text(payload?.stockColumn);
  if (!stockId || !requestedColumn) throw stocktakingMutationError("Stock row and inventory column are required.", 400);
  if (!stockColumn) throw stocktakingMutationError("Stocktaking folder is required.", 400);
  const allowed = await canAccessStocktakingColumn(account, stockColumn, { fresh: false });
  if (!allowed && stocktakingAccessLevel(account) !== "admin") {
    throw stocktakingMutationError("This Stocktaking folder is not available for your access level.", 403);
  }
  const keys = await loadStockSchemaKeys({ fresh: true });
  const column = keys.find((key) => key === requestedColumn) || findKey(keys, [requestedColumn]);
  if (!column || !isInventoryMetaColumn(column)) throw stocktakingMutationError("The selected inventory column is invalid.", 400);
  const raw = payload?.value;
  const value = raw === null || typeof raw === "undefined" || raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw stocktakingMutationError("Inventory values must be zero or greater.", 400);
  }
  const updated = await updateById(stocktakingTable(), stockId, { [column]: value });
  invalidateStocktakingReadCaches();
  return { ok: true, source: "supabase-next", id: stockId, column, value, row: updated || null };
}

