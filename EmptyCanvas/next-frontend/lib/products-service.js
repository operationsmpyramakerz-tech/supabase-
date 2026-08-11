import "server-only";
import { getSupabaseConfig, selectAll } from "./supabase-rest";

function text(value) {
  return String(value ?? "").trim();
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

function serializeProduct(row = {}) {
  return {
    id: text(pick(row, ["id", "ID"])),
    name: text(pick(row, ["name", "Name", "product_name", "Product Name", "product", "Product"])) || "Untitled Product",
    displayId: text(pick(row, ["id_code", "ID Code", "id code", "code", "Code"])),
    unitPrice: numberOrNull(pick(row, ["unit_price", "Unity Price", "Unit price", "Unit Price", "price", "Price"])),
    unit: text(pick(row, ["unit", "unit_name", "measurement_unit", "Unit", "Unit Name"])),
    url: text(pick(row, ["url", "URL", "product_url", "Product URL"])),
    imageUrl: text(pick(row, ["image_url", "image", "Image URL", "Image", "photo_url", "Photo URL"])),
    tags: parseTags(pick(row, ["tags", "Tags", "tag", "Tag"])),
    source: "supabase",
  };
}

function mergeUnique(values) {
  const map = new Map();
  for (const value of values || []) {
    const clean = text(value);
    const key = clean.toLowerCase();
    if (clean && !map.has(key)) map.set(key, clean);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

export async function getProductsCatalog() {
  const config = getSupabaseConfig();
  const [productRows, tagRows, unitRows] = await Promise.all([
    selectAll(config.productsTable, { limit: 5000, order: "name.asc,id.asc" }),
    selectAll(config.productTagsTable, { limit: 1000, order: "name.asc" }).catch(() => []),
    selectAll(config.productUnitsTable, { limit: 1000, order: "name.asc" }).catch(() => []),
  ]);

  const products = productRows.map(serializeProduct).filter((product) => product.id && product.name);
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
