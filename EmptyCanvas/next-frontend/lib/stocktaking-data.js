import "server-only";
import { selectAll } from "./supabase-rest";

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
    .replace(/[’'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
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
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}

function movementColor(name) {
  const token = canonical(name);
  if (token === "requestproducts" || token === "requestproduct") return "green";
  if (["withdrawproducts", "withdrawproduct", "withdrawalproducts", "withdrawalproduct"].includes(token)) return "red";
  return "default";
}

function allKeys(rows = []) {
  const seen = new Set();
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) seen.add(key);
  }
  return [...seen];
}

function findQuantityColumn(rows = [], schoolName = "") {
  const keys = allKeys(rows);
  if (!keys.length) return "";
  const byCanonical = new Map(keys.map((key) => [canonical(key), key]));
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

  for (const candidate of candidates) {
    const exact = keys.find((key) => key === candidate);
    if (exact) return exact;
    const hit = byCanonical.get(canonical(candidate));
    if (hit) return hit;
  }
  return "";
}

function serializeRow(row = {}, quantityColumn = "") {
  const name = text(valueFor(row, ["name", "Name", "component", "Component", "product_name", "Product Name"])) || "Untitled";
  const productName = text(valueFor(row, ["product_name", "Product Name", "product", "Product"])) || name;
  const url =
    urlValue(valueFor(row, ["url", "URL"])) ||
    urlValue(valueFor(row, ["product_url", "Product URL"])) ||
    urlValue(valueFor(row, ["item_url", "Item URL"]));
  const tagName = text(valueFor(row, ["tag", "Tag", "tags", "Tags"])) || "Untagged";

  return {
    id: text(valueFor(row, ["id", "ID", "notion_id", "Notion ID"])),
    name,
    productName,
    url,
    quantity: number(quantityColumn ? row?.[quantityColumn] : 0),
    oneKitQuantity: number(valueFor(row, ["one_kit_quantity", "One Kit Quantity", "one kit quantity"])),
    idCode: text(valueFor(row, ["id_code", "ID Code", "id code", "code", "Code"])) || null,
    receiptNumber: text(valueFor(row, ["receipt_number", "Receipt Number", "store_receipt_number", "Store Receipt Number", "receipt", "Receipt", "order_receipt", "Order Receipt"])),
    unitPrice: number(valueFor(row, ["unity_price", "unit_price", "Unity Price", "Unit Price", "one_piece_price"])),
    userName: text(valueFor(row, ["user_name", "username", "User Name", "Username", "created_by", "Created By", "requested_by", "Requested By", "owner_name", "Owner Name", "employee", "Employee"])) || "Unknown user",
    tag: { name: tagName, color: movementColor(tagName) },
    quantityColumn: quantityColumn || null,
    source: "supabase",
  };
}

function accountMatchesMember(account = {}, row = {}) {
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  const rowId = text(valueFor(row, ["id", "ID"]));
  if (accountId && rowId && accountId === rowId) return true;

  const accountNames = [account.username, account.name].map(canonical).filter(Boolean);
  const rowNames = [
    valueFor(row, ["Username", "username"]),
    valueFor(row, ["Name", "name"]),
  ].map(canonical).filter(Boolean);
  if (accountNames.some((name) => rowNames.includes(name))) return true;

  const accountEmail = canonical(account.email);
  const rowEmail = canonical(valueFor(row, ["Email", "email"]));
  return !!accountEmail && !!rowEmail && accountEmail === rowEmail;
}

function stocktakingTable() {
  return text(process.env.SUPABASE_STOCKTAKING_TABLE) || "stocktaking";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

export async function stocktakingForAccount(account = {}) {
  const [memberRows, stockRows] = await Promise.all([
    selectAll(teamMembersTable(), { limit: 5000, order: "name.asc,id.asc" }),
    selectAll(stocktakingTable(), { limit: 5000, order: "name.asc,id.asc" }),
  ]);

  const member = (memberRows || []).find((row) => accountMatchesMember(account, row)) || null;
  const schoolName = text(valueFor(member || {}, ["School", "school"]));
  if (!schoolName) {
    const error = new Error("Could not determine school name for the current user.");
    error.status = 404;
    throw error;
  }

  const quantityColumn = findQuantityColumn(stockRows, schoolName);
  if (!quantityColumn) {
    const error = new Error(`Could not determine the Stocktaking quantity column for ${schoolName}.`);
    error.status = 404;
    throw error;
  }

  return (stockRows || [])
    .map((row) => serializeRow(row, quantityColumn))
    .filter((item) => Number(item.quantity) !== 0);
}
