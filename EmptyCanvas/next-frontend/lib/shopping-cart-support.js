import "server-only";

import { selectAll } from "./supabase-rest";
import { getProductsList } from "./products-service";

export const CREATE_ORDER_TYPES = Object.freeze([
  "Request Products",
  "Withdraw Products",
  "Request Maintenance",
]);

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function schoolsTable() {
  return text(process.env.SUPABASE_B2B_SCHOOLS_TABLE) || "b2b_schools";
}

export async function listCreateOrderSchools() {
  let rows;
  try {
    rows = await selectAll(schoolsTable(), {
      select: "id,school_name",
      limit: 5000,
      order: "school_name.asc,id.asc",
      profileName: "shopping-cart.schools",
    });
  } catch {
    rows = await selectAll(schoolsTable(), {
      limit: 5000,
      profileName: "shopping-cart.schools-fallback",
    });
  }

  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: text(valueFor(row, ["id", "ID"])),
      name: text(valueFor(row, ["school_name", "School name", "name", "Name", "school", "School"])),
    }))
    .filter((school) => school.id && school.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCreateOrderComponents({ fresh = false } = {}) {
  return await getProductsList({ fresh });
}

export function createOrderTypesPayload() {
  return {
    options: [...CREATE_ORDER_TYPES],
    source: {
      database: "supabase",
      table: text(process.env.SUPABASE_ORDERS_TABLE) || "orders",
      property: "order_type",
      type: "text",
    },
  };
}
