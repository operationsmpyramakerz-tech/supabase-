import "server-only";

import {
  deleteById,
  insert,
  isSupabaseConfigured,
  selectAll,
  selectById,
  updateById,
} from "./supabase-rest";

const MAINTENANCE_CHECKLIST_SENTINEL = "__MAINTENANCE_CHECKLIST__";

function text(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function tableName() {
  return text(process.env.SUPABASE_ORDER_DOWNLOAD_INSTRUCTIONS_TABLE) || "order_download_instructions";
}

function directChecklistError(message, status = 500) {
  const error = new Error(message || "Maintenance checklist action failed.");
  error.code = "DIRECT_MAINTENANCE_CHECKLIST_FAILED";
  error.status = Number(status) || 500;
  return error;
}

function isChecklistRow(row = {}) {
  return text(row?.title) === MAINTENANCE_CHECKLIST_SENTINEL;
}

function serializeChecklistRow(row = {}) {
  return {
    id: text(row?.id),
    text: text(row?.english_text ?? row?.englishText),
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

export async function listMaintenanceChecklistItems() {
  if (!isSupabaseConfigured()) return null;
  const rows = await selectAll(tableName(), {
    limit: 500,
    order: "updated_at.desc",
    select: "id,title,english_text,arabic_text,created_by,created_at,updated_at",
  });
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isChecklistRow(row)) continue;
    const item = serializeChecklistRow(row);
    if (!item.id || !item.text) continue;
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function createMaintenanceChecklistItem({ account = {}, value = "" } = {}) {
  if (!isSupabaseConfigured()) return null;
  const clean = text(value).slice(0, 800);
  if (!clean) throw directChecklistError("Checklist text is required.", 400);

  const current = await listMaintenanceChecklistItems();
  if (current === null) return null;
  const existing = current.find((item) => item.text.toLowerCase() === clean.toLowerCase());
  if (existing) return { item: existing, existing: true };

  const row = await insert(tableName(), {
    title: MAINTENANCE_CHECKLIST_SENTINEL,
    english_text: clean,
    arabic_text: "",
    created_by: text(account?.username || account?.name) || null,
  });
  return { item: serializeChecklistRow(row || {}) };
}

export async function updateMaintenanceChecklistItem({ id = "", value = "" } = {}) {
  if (!isSupabaseConfigured()) return null;
  const cleanId = text(id);
  const clean = text(value).slice(0, 800);
  if (!cleanId) throw directChecklistError("Checklist item id is required.", 400);
  if (!clean) throw directChecklistError("Checklist text is required.", 400);

  const existingRow = await selectById(tableName(), cleanId);
  if (!existingRow || !isChecklistRow(existingRow)) {
    throw directChecklistError("Checklist item was not found.", 404);
  }

  const current = await listMaintenanceChecklistItems();
  if (current === null) return null;
  const duplicate = current.find((item) => item.id !== cleanId && item.text.toLowerCase() === clean.toLowerCase());
  if (duplicate) throw directChecklistError("A checklist item with the same text already exists.", 409);

  const row = await updateById(tableName(), cleanId, {
    title: MAINTENANCE_CHECKLIST_SENTINEL,
    english_text: clean,
    arabic_text: "",
  });
  if (!row) throw directChecklistError("Checklist item was not found.", 404);
  return {
    item: {
      ...serializeChecklistRow(row),
      createdAt: row?.created_at || existingRow?.created_at || null,
    },
  };
}

export async function deleteMaintenanceChecklistItem({ id = "" } = {}) {
  if (!isSupabaseConfigured()) return null;
  const cleanId = text(id);
  if (!cleanId) throw directChecklistError("Checklist item id is required.", 400);

  const existingRow = await selectById(tableName(), cleanId);
  if (!existingRow || !isChecklistRow(existingRow)) {
    throw directChecklistError("Checklist item was not found.", 404);
  }
  await deleteById(tableName(), cleanId);
  return { ok: true, id: cleanId };
}
