import "server-only";
import {
  createSignedUploadUrl,
  deleteById,
  getSupabaseConfig,
  storagePublicUrl,
  insert,
  selectAll,
  selectById,
  updateById,
  updateByIds,
  uploadStorageObject,
} from "./supabase-rest";

const PRODUCT_READ_CACHE_TTL_MS = 30_000;
const PRODUCT_READ_CACHE_MAX_ENTRIES = 12;
const _productReadCache = new Map();
const _productReadInflight = new Map();
let productReadCacheGeneration = 0;
let productProjectionSupported = null;

// Product cards/pickers only use this compact projection. Full rows are still
// available through the mutation/detail paths when needed. Legacy/custom
// schemas automatically fall back to select=* once per warm process.
const PRODUCT_LIST_SELECT = "id,name,id_code,unit_price,unit,url,image_url,tags";

function productReadCacheGet(key) {
  const entry = _productReadCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    _productReadCache.delete(key);
    return null;
  }
  return entry.value;
}

function productReadCacheSet(key, value, ttlMs = PRODUCT_READ_CACHE_TTL_MS) {
  if (_productReadCache.size >= PRODUCT_READ_CACHE_MAX_ENTRIES && !_productReadCache.has(key)) {
    const firstKey = _productReadCache.keys().next().value;
    if (firstKey) _productReadCache.delete(firstKey);
  }
  _productReadCache.set(key, { value, expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || PRODUCT_READ_CACHE_TTL_MS) });
}

async function productCachedRead(key, loader, { fresh = false, ttlMs = PRODUCT_READ_CACHE_TTL_MS } = {}) {
  if (!fresh) {
    const cached = productReadCacheGet(key);
    if (cached !== null) return cached;
    if (_productReadInflight.has(key)) return await _productReadInflight.get(key);
  }

  const generation = productReadCacheGeneration;
  const pending = Promise.resolve().then(loader);
  if (!fresh) _productReadInflight.set(key, pending);
  try {
    const value = await pending;
    // A mutation may invalidate this cache while the Supabase read is still in
    // flight. Do not let that older read repopulate a stale product snapshot.
    if (generation === productReadCacheGeneration) productReadCacheSet(key, value, ttlMs);
    return value;
  } finally {
    if (!fresh && _productReadInflight.get(key) === pending) _productReadInflight.delete(key);
  }
}

function invalidateProductReadCaches(...keys) {
  productReadCacheGeneration += 1;
  const wanted = keys.flat().map((key) => String(key || "").trim()).filter(Boolean);
  if (!wanted.length) {
    _productReadCache.clear();
    _productReadInflight.clear();
    return;
  }
  for (const key of wanted) {
    const variants = key === "tags"
      ? ["tags:tolerant", "tags:strict"]
      : key === "units"
        ? ["units:tolerant", "units:strict"]
        : [key];
    for (const variant of variants) {
      _productReadCache.delete(variant);
      _productReadInflight.delete(variant);
    }
  }
  // The combined catalog depends on products, tags, and units.
  _productReadCache.delete("catalog");
  _productReadInflight.delete("catalog");
}

function text(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function numberOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key) && row[key] !== null && typeof row[key] !== "undefined") {
      return row[key];
    }
  }
  return null;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {}
  return raw.split(/[,;|]/).map(text).filter(Boolean);
}

function extractUrl(value) {
  if (value === null || typeof value === "undefined") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof value === "object") {
    return extractUrl(value.url || value.publicUrl || value.public_url || value.href || value.external?.url || value.file?.url || null);
  }

  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;

  try {
    const parsed = JSON.parse(raw);
    const parsedUrl = extractUrl(parsed);
    if (parsedUrl) return parsedUrl;
  } catch {}

  if (/^(https?:|data:image\/|blob:)/i.test(raw)) return raw;
  const match = raw.match(/https?:\/\/[^\s,"'<>]+/i);
  return match ? match[0] : null;
}

function cleanUrl(value) {
  const extracted = extractUrl(value);
  if (extracted) return extracted;
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;
  if (raw.startsWith("/")) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

const LEGACY_PRODUCTS_STORAGE_HOSTS = new Set([
  "pysup2.opik.net",
]);

function normalizeProductsStorageUrl(value) {
  const raw = text(value).replace(/&amp;/g, "&");
  if (!raw) return null;

  const { url: supabaseUrl } = getSupabaseConfig();
  const base = text(supabaseUrl).replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(raw)) return raw;

  try {
    const source = new URL(raw);
    const target = new URL(base);
    const isPublicStorageObject = /^\/storage\/v1\/object\/public\//i.test(source.pathname);

    // Most historical product images were uploaded while Supabase was exposed
    // through pysup2.opik.net. The database still contains that old absolute
    // origin, while the live Supabase host is supplied by SUPABASE_URL. Reuse
    // the exact bucket/object path on the current origin so those files do not
    // depend on a retired DNS name.
    if (isPublicStorageObject && LEGACY_PRODUCTS_STORAGE_HOSTS.has(source.hostname.toLowerCase())) {
      source.protocol = target.protocol;
      source.host = target.host;
      return source.toString();
    }
  } catch {}

  return raw;
}

function cleanImageUrl(value) {
  const { url: supabaseUrl } = getSupabaseConfig();
  const base = text(supabaseUrl).replace(/\/+$/, "");
  const bucket = text(getProductsStorageBucket()).replace(/^\/+|\/+$/g, "");

  const extracted = extractUrl(value);
  if (extracted) return normalizeProductsStorageUrl(extracted);

  let raw = text(value);
  if (!raw || /^null$/i.test(raw)) return null;

  // Some migrated rows store only a Supabase Storage object path instead of
  // the complete public URL. Resolve those paths against the configured bucket
  // instead of turning them into an invalid https://products/... URL.
  raw = raw.replace(/^\/+/, "");
  if (/^storage\/v1\/object\/public\//i.test(raw)) {
    return base ? `${base}/${raw}` : null;
  }
  if (/^object\/public\//i.test(raw)) {
    return base ? `${base}/storage/v1/${raw}` : null;
  }
  if (bucket && raw.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) {
    raw = raw.slice(bucket.length + 1);
  }
  if (/^(products\/images|products|images)\//i.test(raw) && bucket) {
    return storagePublicUrl(raw, bucket) || null;
  }

  return normalizeProductsStorageUrl(cleanUrl(value));
}



function pushUniqueUrl(target, value) {
  const clean = cleanImageUrl(value);
  if (!clean) return;
  if (!target.some((item) => item === clean)) target.push(clean);
}

function collectImageLikeUrls(value, target, depth = 0) {
  if (depth > 5 || value === null || typeof value === "undefined") return;
  if (Array.isArray(value)) {
    for (const item of value) collectImageLikeUrls(item, target, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const preferredKeys = [
      "url", "publicUrl", "public_url", "src", "source", "href",
      "image", "imageUrl", "image_url", "photo", "photoUrl", "photo_url",
      "picture", "thumbnail", "cover", "coverUrl", "cover_url",
      "external", "file", "files", "attachments",
    ];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectImageLikeUrls(value[key], target, depth + 1);
    }
    return;
  }

  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed !== raw) {
      collectImageLikeUrls(parsed, target, depth + 1);
      if (target.length) return;
    }
  } catch {}

  // Dedicated image fields can contain an absolute URL, a data URL, or just a
  // Supabase Storage object path. cleanImageUrl resolves all three forms.
  pushUniqueUrl(target, raw);
}

function productRowImageCandidates(row = {}) {
  const urls = [];
  const exactAliases = [
    "image_url", "Image URL", "image", "Image", "product_image", "Product Image",
    "product_photo", "Product Photo", "photo", "Photo", "picture", "Picture",
    "thumbnail", "Thumbnail", "thumbnail_url", "Thumbnail URL",
    "cover", "Cover", "cover_url", "Cover URL", "cover_image", "Cover Image",
    "cover_image_url", "Cover Image URL", "icon", "Icon", "attachments", "Attachments",
    "files", "Files",
  ];

  for (const alias of exactAliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) {
      collectImageLikeUrls(row[alias], urls);
    }
  }

  // Custom/migrated schemas sometimes kept the original Notion file property
  // under a different name. Inspect only columns whose names clearly describe
  // image/file media so normal product links are never mistaken for images.
  for (const [key, value] of Object.entries(row || {})) {
    const normalized = norm(key).replace(/[^a-z0-9]+/g, "");
    if (!/(image|photo|picture|thumbnail|cover|attachment|file)/.test(normalized)) continue;
    collectImageLikeUrls(value, urls);
  }

  return urls;
}

export async function getProductImageSources(productId) {
  const id = text(productId);
  if (!id) return null;
  const { productsTable } = getSupabaseConfig();
  const row = await selectById(productsTable, id, { profileName: "products.image-source" });
  if (!row) return null;
  const product = serializeProduct(row);
  return {
    id,
    name: product.name,
    pageUrl: product.url || cleanUrl(pick(row, ["url", "URL", "product_url", "Product URL", "link", "Link", "website", "Website"])),
    imageUrls: productRowImageCandidates(row),
  };
}
function serializeProduct(row = {}) {
  return {
    id: text(pick(row, ["id", "ID"])),
    name: text(pick(row, ["name", "Name", "product_name", "Product Name", "product", "Product"])) || "Untitled Product",
    displayId: text(pick(row, ["id_code", "ID Code", "id code", "code", "Code"])) || null,
    unitPrice: numberOrNull(pick(row, ["unit_price", "Unity Price", "Unit price", "Unit Price", "price", "Price"])),
    unit: text(pick(row, ["unit", "unit_name", "measurement_unit", "Unit", "Unit Name"])) || null,
    url: cleanUrl(pick(row, ["url", "URL", "product_url", "Product URL", "link", "Link", "website", "Website"])),
    imageUrl: cleanImageUrl(pick(row, ["image_url", "Image URL", "image", "Image", "photo", "Photo", "picture", "Picture", "thumbnail", "Thumbnail"])),
    tags: parseTags(pick(row, ["tags", "Tags", "tag", "Tag"])),
    source: "supabase",
  };
}

function mergeUnique(values) {
  const map = new Map();
  for (const value of values || []) {
    const clean = text(value);
    const key = norm(clean);
    if (clean && !map.has(key)) map.set(key, clean);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function firstTag(product) {
  return (Array.isArray(product?.tags) ? product.tags : []).map(text).find(Boolean) || "Uncategorized";
}

function missingTable(error) {
  return /PGRST205|42P01|could not find the table|relation .* does not exist|schema cache/i.test(
    [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint, error?.details?.code]
      .filter(Boolean)
      .join(" "),
  );
}

async function productRows({ fresh = false } = {}) {
  const { productsTable } = getSupabaseConfig();
  return await productCachedRead(
    "products",
    async () => {
      if (productProjectionSupported !== false) {
        try {
          const rows = await selectAll(productsTable, {
            limit: 5000,
            order: "name.asc,id.asc",
            select: PRODUCT_LIST_SELECT,
            profileName: "products.catalog-compact",
          });
          productProjectionSupported = true;
          return rows;
        } catch {
          productProjectionSupported = false;
        }
      }
      return await selectAll(productsTable, {
        limit: 5000,
        order: "name.asc,id.asc",
        profileName: "products.catalog-fallback",
      });
    },
    { fresh },
  );
}

async function productTagRows({ fresh = false, tolerant = true } = {}) {
  const { productTagsTable } = getSupabaseConfig();
  return await productCachedRead(
    tolerant ? "tags:tolerant" : "tags:strict",
    async () => {
      try {
        return await selectAll(productTagsTable, { limit: 1000, order: "name.asc" });
      } catch (error) {
        if (tolerant || missingTable(error)) return [];
        throw error;
      }
    },
    { fresh },
  );
}

async function productUnitRows({ fresh = false, tolerant = true } = {}) {
  const { productUnitsTable } = getSupabaseConfig();
  return await productCachedRead(
    tolerant ? "units:tolerant" : "units:strict",
    async () => {
      try {
        return await selectAll(productUnitsTable, { limit: 1000, order: "name.asc" });
      } catch (error) {
        if (tolerant) return [];
        throw error;
      }
    },
    { fresh },
  );
}

export async function getProductsList({ fresh = false } = {}) {
  if (fresh) invalidateProductReadCaches("products");
  const rows = await productRows({ fresh });
  return (Array.isArray(rows) ? rows : [])
    .map(serializeProduct)
    .filter((product) => product.id && product.name);
}

export async function getProductsCatalog({ fresh = false } = {}) {
  if (fresh) invalidateProductReadCaches();
  return await productCachedRead("catalog", async () => {
    const [rows, tagRows, unitRows] = await Promise.all([
      productRows({ fresh }),
      productTagRows({ fresh, tolerant: true }),
      productUnitRows({ fresh, tolerant: true }),
    ]);

  const products = rows.map(serializeProduct).filter((product) => product.id && product.name);
  const tagsFromProducts = products.flatMap((product) => product.tags || []);
  const tagsFromTable = tagRows.map((row) => text(pick(row, ["name", "tag", "Name", "Tag"]))).filter(Boolean);
  const unitsFromProducts = products.map((product) => text(product.unit)).filter(Boolean);
  const unitsFromTable = unitRows.map((row) => text(pick(row, ["name", "unit", "Name", "Unit"]))).filter(Boolean);

    return {
      ok: true,
      source: "supabase-next",
      products,
      tagsCatalog: mergeUnique([...tagsFromProducts, ...tagsFromTable]),
      unitsCatalog: mergeUnique([...unitsFromProducts, ...unitsFromTable]),
    };
  }, { fresh });
}

function normalizeProductPayload(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);

  const setText = (target, keys) => {
    for (const key of keys) {
      if (!has(key)) continue;
      out[target] = text(body[key]) || null;
      return;
    }
  };
  const setNum = (target, keys) => {
    for (const key of keys) {
      if (!has(key)) continue;
      out[target] = numberOrNull(body[key]);
      return;
    }
  };

  setText("name", ["name", "productName", "product_name"]);
  setText("id_code", ["idCode", "id_code", "code"]);
  setText("tags", ["tags", "tag"]);
  setNum("unit_price", ["unitPrice", "unit_price", "price"]);
  setText("unit", ["unit", "unitName", "unit_name", "measurementUnit", "measurement_unit"]);

  if (has("url") || has("productUrl") || has("product_url") || has("link")) {
    out.url = cleanUrl(body.url ?? body.productUrl ?? body.product_url ?? body.link);
  }
  if (has("imageUrl") || has("image_url")) {
    out.image_url = cleanUrl(body.imageUrl ?? body.image_url);
  }

  if (!partial && !text(out.name)) {
    const error = new Error("Product name is required.");
    error.status = 400;
    throw error;
  }
  if (Object.prototype.hasOwnProperty.call(out, "name") && !text(out.name)) {
    const error = new Error("Product name is required.");
    error.status = 400;
    throw error;
  }

  out.updated_at = new Date().toISOString();
  return out;
}

export function getProductsStorageBucket() {
  return text(
    process.env.SUPABASE_PRODUCTS_STORAGE_BUCKET ||
    process.env.SUPABASE_PRODUCTS_BUCKET ||
    process.env.SUPABASE_STORAGE_BUCKET ||
    process.env.SUPABASE_BUCKET ||
    "Data"
  ) || "Data";
}

function storageObjectName(originalName = "product-image") {
  const safe = text(originalName)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product-image";
  return `products/images/${Date.now()}-${Math.random().toString(16).slice(2)}-${safe}`;
}

async function uploadProductImage(dataUrl, originalName) {
  const match = text(dataUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    const error = new Error("Invalid product image.");
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 10 * 1024 * 1024) {
    const error = new Error("Product image must not exceed 10 MB.");
    error.status = 400;
    throw error;
  }

  const uploaded = await uploadStorageObject(storageObjectName(originalName), buffer, {
    contentType: match[1],
    bucketName: getProductsStorageBucket(),
    upsert: false,
  });
  if (!uploaded?.publicUrl) {
    const error = new Error("Supabase Storage did not return a public product image URL.");
    error.status = 500;
    throw error;
  }
  return uploaded.publicUrl;
}

export async function createProductImageUploadTicket({ filename, mime, size } = {}) {
  const cleanMime = text(mime || "application/octet-stream").toLowerCase();
  const fileSize = Math.max(0, Number(size) || 0);
  if (!/^image\/(png|jpe?g|webp)$/i.test(cleanMime)) {
    const error = new Error("Choose a PNG, JPG, or WEBP image.");
    error.status = 400;
    throw error;
  }
  if (!fileSize) {
    const error = new Error("The selected image is empty.");
    error.status = 400;
    throw error;
  }
  if (fileSize > 10 * 1024 * 1024) {
    const error = new Error("Product image must not exceed 10 MB.");
    error.status = 413;
    throw error;
  }

  const ticket = await createSignedUploadUrl(storageObjectName(filename || "product-image.webp"), {
    bucketName: getProductsStorageBucket(),
  });
  if (!ticket?.signedUrl || !ticket?.publicUrl) {
    const error = new Error("Supabase Storage did not return a valid product image upload URL.");
    error.status = 502;
    throw error;
  }

  return {
    method: "PUT",
    signedUrl: ticket.signedUrl,
    publicUrl: ticket.publicUrl,
    // Match Supabase storage-js uploadToSignedUrl behavior. The browser sets
    // the multipart Content-Type (including the boundary) automatically.
    headers: { "x-upsert": "false" },
    cacheControl: "3600",
    bucket: ticket.bucket,
    path: ticket.path,
  };
}

async function prepareProductBody(body = {}) {
  const prepared = { ...(body || {}) };
  const imageData = text(prepared.imageData || prepared.image_data);
  const removeImage = prepared.removeImage === true || norm(prepared.removeImage) === "true";

  delete prepared.imageData;
  delete prepared.image_data;
  delete prepared.imageName;
  delete prepared.imageType;
  delete prepared.removeImage;

  if (imageData) prepared.imageUrl = await uploadProductImage(imageData, body.imageName || "product-image");
  else if (removeImage) prepared.imageUrl = null;

  return prepared;
}

function primaryKeyDuplicate(error) {
  const raw = [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint, error?.details?.code]
    .filter(Boolean)
    .join(" ");
  return /23505|products_pkey|duplicate key value/i.test(raw);
}

async function nextNumericProductId() {
  let maxId = 0;
  let found = false;
  for (const row of await productRows({ fresh: true })) {
    const value = Number(pick(row, ["id", "ID"]));
    if (!Number.isSafeInteger(value) || value < 0) continue;
    found = true;
    maxId = Math.max(maxId, value);
  }
  return found ? maxId + 1 : 1;
}

export async function createProduct(body = {}) {
  const config = getSupabaseConfig();
  const prepared = await prepareProductBody(body);
  const row = normalizeProductPayload(prepared, { partial: false });
  let created = null;

  try {
    created = await insert(config.productsTable, row);
  } catch (error) {
    if (!primaryKeyDuplicate(error)) throw error;
    const nextId = await nextNumericProductId();
    let lastError = error;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        created = await insert(config.productsTable, { ...row, id: nextId + attempt });
        lastError = null;
        break;
      } catch (retryError) {
        lastError = retryError;
        if (!primaryKeyDuplicate(retryError)) throw retryError;
      }
    }
    if (lastError) throw lastError;
  }

  invalidateProductReadCaches("products");
  return serializeProduct(created || row);
}

export async function updateProduct(productId, body = {}) {
  const id = text(productId);
  if (!id) {
    const error = new Error("Missing product ID.");
    error.status = 400;
    throw error;
  }
  const prepared = await prepareProductBody(body);
  const patch = normalizeProductPayload(prepared, { partial: true });
  const updated = await updateById(getSupabaseConfig().productsTable, id, patch);
  invalidateProductReadCaches("products");
  return serializeProduct(updated || { ...patch, id });
}

export async function deleteProduct(productId) {
  const id = text(productId);
  if (!id) {
    const error = new Error("Missing product ID.");
    error.status = 400;
    throw error;
  }
  const deleted = await deleteById(getSupabaseConfig().productsTable, id);
  invalidateProductReadCaches("products");
  return deleted;
}

export async function listProductUnits({ fresh = false } = {}) {
  if (fresh) invalidateProductReadCaches("units", "products");
  let rows;
  try {
    rows = await productUnitRows({ fresh, tolerant: false });
  } catch (error) {
    if (missingTable(error)) {
      const tableError = new Error("Product units table is not created yet. Please run products_units_migration.sql in Supabase first.");
      tableError.status = 400;
      throw tableError;
    }
    throw error;
  }
  const fromTable = rows.map((row) => text(pick(row, ["name", "unit", "Name", "Unit"]))).filter(Boolean);
  const fromProducts = (await productRows({ fresh })).map(serializeProduct).map((product) => product.unit).filter(Boolean);
  return mergeUnique([...fromTable, ...fromProducts]);
}

export async function createProductUnit(name) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Unit name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listProductUnits({ fresh: true });
  const match = existing.find((unit) => norm(unit) === norm(clean));
  if (match) return { name: match, alreadyExists: true };

  const row = { name: clean, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const created = await insert(getSupabaseConfig().productUnitsTable, row).catch((error) => {
    if (missingTable(error)) {
      const tableError = new Error("Product units table is not created yet. Please run products_units_migration.sql in Supabase first.");
      tableError.status = 400;
      throw tableError;
    }
    throw error;
  });
  invalidateProductReadCaches("units");
  return { name: text(pick(created || row, ["name", "unit", "Name", "Unit"])) || clean, alreadyExists: false };
}

export async function listProductTags({ fresh = false } = {}) {
  if (fresh) invalidateProductReadCaches("tags", "products");
  const rows = await productTagRows({ fresh, tolerant: false });
  const tableTags = rows.map((row) => text(pick(row, ["name", "tag", "Name", "Tag"]))).filter(Boolean);
  const productTags = (await productRows({ fresh })).map(serializeProduct).map(firstTag).filter(Boolean);
  return mergeUnique([...tableTags, ...productTags]);
}

export async function createProductTag(name) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Tag name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listProductTags({ fresh: true });
  const match = existing.find((tag) => norm(tag) === norm(clean));
  if (match) return { name: match, alreadyExists: true };

  const row = { name: clean, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const created = await insert(getSupabaseConfig().productTagsTable, row).catch((error) => {
    if (missingTable(error)) {
      const tableError = new Error("Product tags table is not created yet. Please run products_tags_catalog_migration.sql in Supabase first.");
      tableError.status = 400;
      throw tableError;
    }
    throw error;
  });
  invalidateProductReadCaches("tags");
  return { name: text(pick(created || row, ["name", "tag", "Name", "Tag"])) || clean, alreadyExists: false };
}

export async function renameProductTag(oldTag, newTag) {
  const fromTag = text(oldTag);
  const toTag = text(newTag);
  if (!fromTag) {
    const error = new Error("Current tag is required.");
    error.status = 400;
    throw error;
  }
  if (!toTag) {
    const error = new Error("New tag is required.");
    error.status = 400;
    throw error;
  }
  if (norm(fromTag) === norm(toTag)) {
    const error = new Error("Please enter a different tag name.");
    error.status = 400;
    throw error;
  }

  const products = (await productRows({ fresh: true })).map(serializeProduct);
  const matches = products.filter((product) => norm(firstTag(product)) === norm(fromTag));
  if (!matches.length) {
    const error = new Error("No products were found under this tag.");
    error.status = 404;
    throw error;
  }

  const updatedRows = [];
  for (let i = 0; i < matches.length; i += 120) {
    const batch = await updateByIds(
      getSupabaseConfig().productsTable,
      matches.slice(i, i + 120).map((product) => product.id),
      { tags: toTag, updated_at: new Date().toISOString() },
    );
    updatedRows.push(...batch);
  }

  invalidateProductReadCaches("products", "tags");
  return {
    oldTag: fromTag,
    newTag: toTag,
    updatedCount: matches.length,
    products: updatedRows.map(serializeProduct).filter((product) => product.id),
  };
}

export async function deleteProductTag(tagName) {
  const tag = text(tagName);
  if (!tag) {
    const error = new Error("Tag name is required.");
    error.status = 400;
    throw error;
  }
  if (norm(tag) === norm("Uncategorized")) {
    const error = new Error("Uncategorized cannot be deleted.");
    error.status = 400;
    throw error;
  }

  const products = (await productRows({ fresh: true })).map(serializeProduct);
  const matches = products.filter((product) => norm(firstTag(product)) === norm(tag));
  for (let i = 0; i < matches.length; i += 120) {
    await updateByIds(
      getSupabaseConfig().productsTable,
      matches.slice(i, i + 120).map((product) => product.id),
      { tags: "Uncategorized", updated_at: new Date().toISOString() },
    );
  }

  const rows = await productTagRows({ fresh: true, tolerant: true });
  for (const row of rows) {
    const rowName = text(pick(row, ["name", "tag", "tags", "Name", "Tag"]));
    const rowId = pick(row, ["id", "ID"]);
    if (rowId && norm(rowName) === norm(tag)) await deleteById(getSupabaseConfig().productTagsTable, rowId);
  }

  invalidateProductReadCaches("products", "tags");
  return { deletedTag: tag, movedCount: matches.length };
}
