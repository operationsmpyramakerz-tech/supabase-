import "server-only";

import {
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

function directInstructionError(message, status = 500) {
  const error = new Error(message || "Saved instructions action failed.");
  error.code = "DIRECT_ORDER_DOWNLOAD_INSTRUCTIONS_FAILED";
  error.status = Number(status) || 500;
  return error;
}

function isChecklistRow(row = {}) {
  return text(row?.title) === MAINTENANCE_CHECKLIST_SENTINEL;
}

function serializeInstructionRow(row = {}) {
  return {
    id: text(row?.id),
    title: text(row?.title),
    englishText: text(row?.english_text ?? row?.englishText),
    arabicText: text(row?.arabic_text ?? row?.arabicText),
    createdBy: text(row?.created_by ?? row?.createdBy),
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

function instructionPayload(body = {}) {
  const title = text(body?.title).slice(0, 120);
  const englishText = text(body?.englishText ?? body?.english_text).slice(0, 2000);
  const arabicText = text(body?.arabicText ?? body?.arabic_text).slice(0, 2000);
  if (!title) throw directInstructionError("Instruction title is required.", 400);
  if (!englishText && !arabicText) {
    throw directInstructionError("Add English or Arabic instructions before saving.", 400);
  }
  return {
    title,
    english_text: englishText,
    arabic_text: arabicText,
  };
}

export async function listOrderDownloadInstructions() {
  if (!isSupabaseConfigured()) return null;
  const rows = await selectAll(tableName(), {
    limit: 500,
    order: "updated_at.desc",
    select: "id,title,english_text,arabic_text,created_by,created_at,updated_at",
  });
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !isChecklistRow(row))
    .map(serializeInstructionRow)
    .filter((item) => item.id && item.title && (item.englishText || item.arabicText));
}

export async function createOrderDownloadInstruction({ account = {}, body = {} } = {}) {
  if (!isSupabaseConfigured()) return null;
  const payload = instructionPayload(body);
  payload.created_by = text(account?.username || account?.name) || null;
  const row = await insert(tableName(), payload);
  const item = serializeInstructionRow(row || {});
  if (!item.id) throw directInstructionError("Instructions were saved but no record was returned.", 500);
  return { item };
}

export async function updateOrderDownloadInstruction({ id = "", body = {} } = {}) {
  if (!isSupabaseConfigured()) return null;
  const cleanId = text(id);
  if (!cleanId) throw directInstructionError("Instruction id is required.", 400);

  const existing = await selectById(tableName(), cleanId);
  if (!existing || isChecklistRow(existing)) {
    throw directInstructionError("Saved instructions were not found.", 404);
  }

  const row = await updateById(tableName(), cleanId, instructionPayload(body));
  if (!row) throw directInstructionError("Saved instructions were not found.", 404);
  return { item: serializeInstructionRow(row) };
}
