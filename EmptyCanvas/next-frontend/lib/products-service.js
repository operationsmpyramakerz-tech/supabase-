import "server-only";
import {
  createSignedUploadUrl,
  deleteById,
  getSupabaseConfig,
  insert,
  selectAll,
  updateById,
  updateByIds,
  uploadStorageObject,
} from "./supabase-rest";

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

function cleanUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function serializeProduct(row = {}) {
  return {
    id: text(pick(row, ["id", "ID"])),
    name: text(pick(row, ["name", "Name", "product_name", "Product Name", "product", "Product"])) || "Untitled Product",
    displayId: text(pick(row, ["id_code", "ID Code", "id code", "code", "Code"])) || null,
    unitPrice: numberOrNull(pick(row, ["unit_price", "Unity Price", "Unit price", "Unit Price", "price", "Price"])),
    unit: text(pick(row, ["unit", "unit_name", "measurement_unit", "Unit", "Unit Name"])) || null,
    url: cleanUrl(pick(row, ["url", "URL", "product_url", "Product URL", "link", "Link", "website", "Website"])),
    imageUrl: cleanUrl(pick(row, ["image_url", "Image URL", "image", "Image", "photo", "Photo", "picture", "Picture", "thumbnail", "Thumbnail"])),
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

async function productRows() {
  const { productsTable } = getSupabaseConfig();
  return await selectAll(productsTable, { limit: 5000, order: "name.asc,id.asc" });
}

export async function getProductsCatalog() {
  const config = getSupabaseConfig();
  const [rows, tagRows, unitRows] = await Promise.all([
    productRows(),
    selectAll(config.productTagsTable, { limit: 1000, order: "name.asc" }).catch(() => []),
    selectAll(config.productUnitsTable, { limit: 1000, order: "name.asc" }).catch(() => []),
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
    headers: { "Content-Type": cleanMime },
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
  for (const row of await productRows()) {
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
  return serializeProduct(updated || { ...patch, id });
}

export async function deleteProduct(productId) {
  const id = text(productId);
  if (!id) {
    const error = new Error("Missing product ID.");
    error.status = 400;
    throw error;
  }
  return await deleteById(getSupabaseConfig().productsTable, id);
}

export async function listProductUnits() {
  const config = getSupabaseConfig();
  const rows = await selectAll(config.productUnitsTable, { limit: 1000, order: "name.asc" }).catch((error) => {
    if (missingTable(error)) {
      const tableError = new Error("Product units table is not created yet. Please run products_units_migration.sql in Supabase first.");
      tableError.status = 400;
      throw tableError;
    }
    throw error;
  });
  const fromTable = rows.map((row) => text(pick(row, ["name", "unit", "Name", "Unit"]))).filter(Boolean);
  const fromProducts = (await productRows()).map(serializeProduct).map((product) => product.unit).filter(Boolean);
  return mergeUnique([...fromTable, ...fromProducts]);
}

export async function createProductUnit(name) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Unit name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listProductUnits();
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
  return { name: text(pick(created || row, ["name", "unit", "Name", "Unit"])) || clean, alreadyExists: false };
}

export async function listProductTags() {
  const config = getSupabaseConfig();
  const rows = await selectAll(config.productTagsTable, { limit: 1000, order: "name.asc" }).catch((error) => {
    if (missingTable(error)) return [];
    throw error;
  });
  const tableTags = rows.map((row) => text(pick(row, ["name", "tag", "Name", "Tag"]))).filter(Boolean);
  const productTags = (await productRows()).map(serializeProduct).map(firstTag).filter(Boolean);
  return mergeUnique([...tableTags, ...productTags]);
}

export async function createProductTag(name) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Tag name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listProductTags();
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

  const products = (await productRows()).map(serializeProduct);
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

  const products = (await productRows()).map(serializeProduct);
  const matches = products.filter((product) => norm(firstTag(product)) === norm(tag));
  for (let i = 0; i < matches.length; i += 120) {
    await updateByIds(
      getSupabaseConfig().productsTable,
      matches.slice(i, i + 120).map((product) => product.id),
      { tags: "Uncategorized", updated_at: new Date().toISOString() },
    );
  }

  const rows = await selectAll(getSupabaseConfig().productTagsTable, { limit: 1000, order: "name.asc" }).catch(() => []);
  for (const row of rows) {
    const rowName = text(pick(row, ["name", "tag", "tags", "Name", "Tag"]));
    const rowId = pick(row, ["id", "ID"]);
    if (rowId && norm(rowName) === norm(tag)) await deleteById(getSupabaseConfig().productTagsTable, rowId);
  }

  return { deletedTag: tag, movedCount: matches.length };
}
