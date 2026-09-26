import "server-only";

import { backupCatalog, backupCanEdit, findBackupTable } from "./backup-data";
import { verifyPageAdminPasswordDirect } from "./order-action-auth";
import { deleteStorageObjects, getSupabaseConfig, supabaseRequest } from "./supabase-rest";

function text(value) {
  return String(value ?? "").trim();
}

function cleanTableName(value) {
  const table = text(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(table) ? table : "";
}

function errorWithStatus(message, status = 400) {
  const error = new Error(message || "Backup request failed.");
  error.status = status;
  return error;
}

function columnTypeToken(column = {}) {
  return String(column?.type || column?.format || column?.raw?.format || "").toLowerCase();
}

let schemaCache = null;
let schemaCacheAt = 0;

function normalizeColumnInfo(name, raw = {}) {
  const columnName = text(name);
  if (!columnName) return null;
  const type = text(raw?.type || raw?.format || raw?.["x-postgrest-type"] || raw?.["x-pg-type"]).toLowerCase();
  const format = text(raw?.format).toLowerCase();
  return { name: columnName, type, format, raw: raw || {} };
}

function extractSchemaColumns(openApi, tableName = "") {
  const table = text(tableName);
  if (!openApi || typeof openApi !== "object" || !table) return [];
  const schemas = {
    ...(openApi.definitions && typeof openApi.definitions === "object" ? openApi.definitions : {}),
    ...(openApi.components?.schemas && typeof openApi.components.schemas === "object" ? openApi.components.schemas : {}),
  };
  const entries = Object.entries(schemas);
  const lower = table.toLowerCase();
  const match = entries.find(([key]) => String(key).toLowerCase() === lower)
    || entries.find(([key]) => String(key).toLowerCase() === `public.${lower}`)
    || entries.find(([key]) => String(key).toLowerCase().replace(/^public[._]/, "") === lower);
  const props = match?.[1]?.properties && typeof match[1].properties === "object" ? match[1].properties : null;
  if (!props) return [];
  return Object.entries(props).map(([name, raw]) => normalizeColumnInfo(name, raw)).filter(Boolean);
}

async function openApiSchema() {
  const now = Date.now();
  if (schemaCache && now - schemaCacheAt < 5 * 60_000) return schemaCache;
  try {
    const data = await supabaseRequest("/", { timeoutMs: 12_000, profileName: "backup.schema" });
    schemaCache = data && typeof data === "object" ? data : null;
    schemaCacheAt = now;
    return schemaCache;
  } catch (error) {
    console.warn("[backup] unable to read Supabase OpenAPI schema:", error?.details || error?.message || error);
    schemaCache = null;
    schemaCacheAt = now;
    return null;
  }
}

async function tableColumns(tableName) {
  const table = cleanTableName(tableName);
  if (!table) throw errorWithStatus("Invalid table name.");

  const schema = await openApiSchema();
  const schemaColumns = extractSchemaColumns(schema, table);
  if (schemaColumns.length) return { columns: schemaColumns, source: "schema" };

  const query = new URLSearchParams({ select: "*", limit: "1" });
  const sample = await supabaseRequest(`/${encodeURIComponent(table)}?${query.toString()}`, { profileName: "backup.schema-sample" });
  const firstRow = Array.isArray(sample) ? sample[0] || null : null;
  const sampleColumns = Object.keys(firstRow || {}).map((name) => normalizeColumnInfo(name, {})).filter(Boolean);
  if (sampleColumns.length) return { columns: sampleColumns, source: "sample" };
  return { columns: [], source: "probe" };
}

function browserCoerceValue(value, column = {}) {
  if (value === null || typeof value === "undefined") return value ?? null;
  if (typeof value !== "string") return value;
  const raw = value;
  const trimmed = raw.trim();
  const type = columnTypeToken(column);

  if (/json|object|array/.test(type)) {
    if (!trimmed) return null;
    try { return JSON.parse(raw); } catch { throw errorWithStatus(`Column "${column?.name || "value"}" must contain valid JSON.`); }
  }
  if (/boolean|bool/.test(type)) {
    if (!trimmed) return null;
    if (/^(true|t|yes|y|1)$/i.test(trimmed)) return true;
    if (/^(false|f|no|n|0)$/i.test(trimmed)) return false;
    throw errorWithStatus(`Column "${column?.name || "value"}" must be true or false.`);
  }
  if (/integer|int2|int4|int8|bigint|smallint/.test(type)) {
    if (!trimmed) return null;
    if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
    throw errorWithStatus(`Column "${column?.name || "value"}" must be an integer.`);
  }
  if (/number|numeric|decimal|real|double|float/.test(type)) {
    if (!trimmed) return null;
    const number = Number(trimmed);
    if (Number.isFinite(number)) return number;
    throw errorWithStatus(`Column "${column?.name || "value"}" must be a number.`);
  }
  return raw;
}

function browserValueForFilter(value) {
  if (value === null) return "is.null";
  if (typeof value === "undefined" || (typeof value === "object" && value !== null)) return "";
  return `eq.${String(value)}`;
}

function hasUsableId(row = {}) {
  return Boolean(
    row && typeof row === "object"
    && Object.prototype.hasOwnProperty.call(row, "id")
    && row.id !== null
    && typeof row.id !== "undefined"
    && String(row.id).trim() !== "",
  );
}

function browserIdentityFilters(row = {}) {
  if (!row || typeof row !== "object") return [];
  if (hasUsableId(row)) return [["id", browserValueForFilter(row.id)]];

  const keys = Object.keys(row).filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(key || "")));
  const preferred = [];
  const add = (key) => {
    if (!key || preferred.includes(key)) return;
    const value = row[key];
    if (typeof value === "object" && value !== null) return;
    const filter = browserValueForFilter(value);
    if (!filter) return;
    preferred.push(key);
  };
  for (const key of keys) if (/^(uuid|notion_id|page_id|record_id|key|slug|email)$/i.test(key) || /_id$/i.test(key)) add(key);
  for (const key of keys) if (/^(created_at|created|timestamp|date|name|title)$/i.test(key)) add(key);
  for (const key of keys) add(key);
  return preferred.slice(0, 16).map((key) => [key, browserValueForFilter(row[key])]).filter((entry) => entry[1]);
}

function requireBackupAdmin(context = {}, message = "Database Admin access is required to edit table rows.") {
  if (backupCanEdit(context.account || {})) return true;
  throw errorWithStatus(message, 403);
}

async function requireBackupPassword(context = {}, password = "") {
  const clean = text(password);
  if (!clean) throw errorWithStatus("Admin password is required.", 400);
  const verified = await verifyPageAdminPasswordDirect(context.account || {}, clean, ["Backup"]);
  if (verified === null) throw errorWithStatus("The direct Admin password context is unavailable.", 503);
  if (!verified) throw errorWithStatus("Invalid admin password.", 401);
  return true;
}

export async function createBackupRow(context = {}, key = "", values = {}) {
  requireBackupAdmin(context, "Database Admin access is required to add table rows.");
  const item = findBackupTable(key);
  if (!item) throw errorWithStatus("Backup table was not found.", 404);
  if (!values || typeof values !== "object" || Array.isArray(values)) throw errorWithStatus("New row values are required.");

  const schema = await tableColumns(item.tableName);
  const byName = new Map((schema.columns || []).map((column) => [String(column?.name || "").toLowerCase(), column]));
  const cleanValues = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const field = text(rawKey);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) continue;
    if (byName.size && !byName.has(field.toLowerCase())) continue;
    if (typeof rawValue === "string" && rawValue.trim() === "") continue;
    cleanValues[field] = browserCoerceValue(rawValue, byName.get(field.toLowerCase()) || { name: field });
  }
  if (!Object.keys(cleanValues).length) throw errorWithStatus("Enter at least one value for the new row.");

  const table = cleanTableName(item.tableName);
  const created = await supabaseRequest(`/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: cleanValues,
    profileName: "backup.row-create",
  });
  const row = Array.isArray(created) ? created[0] || cleanValues : created || cleanValues;
  return { ok: true, row };
}

export async function updateBackupRow(context = {}, key = "", originalRow = null, changes = null) {
  requireBackupAdmin(context);
  const item = findBackupTable(key);
  if (!item) throw errorWithStatus("Backup table was not found.", 404);
  if (!originalRow || typeof originalRow !== "object" || Array.isArray(originalRow)) throw errorWithStatus("The original row is required.");
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw errorWithStatus("Row changes are required.");

  const schema = await tableColumns(item.tableName);
  const byName = new Map((schema.columns || []).map((column) => [String(column?.name || "").toLowerCase(), column]));
  const cleanChanges = {};
  for (const [rawKey, rawValue] of Object.entries(changes)) {
    const field = text(rawKey);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) continue;
    if (byName.size && !byName.has(field.toLowerCase())) continue;
    cleanChanges[field] = browserCoerceValue(rawValue, byName.get(field.toLowerCase()) || { name: field });
  }
  if (!Object.keys(cleanChanges).length) throw errorWithStatus("There are no valid changes to save.");

  const filters = browserIdentityFilters(originalRow);
  if (!filters.length) throw errorWithStatus("This row does not have a safe identifier, so it cannot be edited from Database.", 409);
  const table = cleanTableName(item.tableName);
  const verifyParams = new URLSearchParams({ select: "*", limit: "2" });
  for (const [field, filter] of filters) verifyParams.append(field, filter);
  const matches = await supabaseRequest(`/${encodeURIComponent(table)}?${verifyParams.toString()}`, { profileName: "backup.row-verify" });
  if (!Array.isArray(matches) || matches.length !== 1) {
    throw errorWithStatus(matches?.length > 1
      ? "More than one row matches this record. Editing was stopped for safety."
      : "The row changed or no longer exists. Refresh the table and try again.", 409);
  }

  const updateParams = new URLSearchParams();
  for (const [field, filter] of filters) updateParams.append(field, filter);
  const updated = await supabaseRequest(`/${encodeURIComponent(table)}?${updateParams.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: cleanChanges,
    profileName: "backup.row-update",
  });
  const row = Array.isArray(updated) ? updated[0] || { ...originalRow, ...cleanChanges } : { ...originalRow, ...cleanChanges };
  return { ok: true, row };
}

function csvCell(value) {
  if (value === null || typeof value === "undefined") return "";
  let output = "";
  if (typeof value === "object") {
    try { output = JSON.stringify(value); } catch { output = String(value); }
  } else output = String(value);
  if (/^[=+\-@]/.test(output)) output = `'${output}`;
  if (/[",\n\r]/.test(output)) return `"${output.replace(/"/g, '""')}"`;
  return output;
}

function rowsToCsv(rows = [], preferredColumns = []) {
  const columns = [];
  const seen = new Set();
  for (const key of preferredColumns || []) {
    const clean = text(key);
    if (clean && !seen.has(clean)) { seen.add(clean); columns.push(clean); }
  }
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) { seen.add(key); columns.push(key); }
    }
  }
  if (!columns.length) return "";
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((key) => csvCell(row?.[key])).join(","))].join("\n");
}

async function preferredColumns(tableName) {
  try {
    const schema = await tableColumns(tableName);
    return (schema.columns || []).map((column) => text(column?.name)).filter(Boolean);
  } catch { return []; }
}

function isMissingTableError(error) {
  const message = String(error?.message || error?.details?.message || error?.details || error || "");
  return /Could not find the table|relation .* does not exist|table .* does not exist|PGRST205|42P01/i.test(message);
}

async function selectAllRows(tableName) {
  const table = cleanTableName(tableName);
  if (!table) throw errorWithStatus("Invalid table name.");
  const pageSize = 1000;
  const maxRows = 50000;
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const query = new URLSearchParams({ select: "*", limit: String(pageSize), offset: String(offset) });
    const chunk = await supabaseRequest(`/${encodeURIComponent(table)}?${query.toString()}`, { timeoutMs: 30_000, profileName: "backup.export-read" });
    const list = Array.isArray(chunk) ? chunk : [];
    rows.push(...list);
    if (list.length < pageSize) break;
  }
  return rows;
}

function safeZipName(value = "", fallback = "file") {
  const clean = text(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function dosDateTime(input = new Date()) {
  const dateValue = input instanceof Date ? input : new Date(input);
  const year = Math.max(1980, dateValue.getFullYear());
  return {
    time: ((dateValue.getHours() & 0x1f) << 11) | ((dateValue.getMinutes() & 0x3f) << 5) | (Math.floor(dateValue.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((dateValue.getMonth() + 1) & 0x0f) << 5) | (dateValue.getDate() & 0x1f),
  };
}

function crc32(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ""));
  if (!crc32.table) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let current = i;
      for (let j = 0; j < 8; j += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
      table[i] = current >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  for (const file of files || []) {
    const name = String(file?.name || "").replace(/^\/+/, "") || "file.txt";
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(file?.data) ? file.data : Buffer.from(String(file?.data ?? ""), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end], offset + centralSize + end.length);
}

export async function exportBackupTable(key = "") {
  const item = findBackupTable(key);
  if (!item) throw errorWithStatus("Backup table was not found.", 404);
  const rows = await selectAllRows(item.tableName);
  const csv = rowsToCsv(rows, await preferredColumns(item.tableName));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return { data: Buffer.from(`\uFEFF${csv}`, "utf8"), filename: `${item.tableName}-${stamp}.csv`, contentType: "text/csv; charset=utf-8" };
}

export async function exportAllBackupTables() {
  const files = [];
  const errors = [];
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  for (const item of backupCatalog()) {
    try {
      const rows = await selectAllRows(item.tableName);
      const csv = rowsToCsv(rows, await preferredColumns(item.tableName));
      const moduleName = safeZipName(item.moduleName || "system", "system");
      const tableName = safeZipName(item.tableName || item.key, item.key || "table");
      files.push({ name: `${moduleName}/${tableName}.csv`, data: Buffer.from(`\uFEFF${csv}`, "utf8") });
    } catch (error) {
      errors.push(`${item.tableName || item.key}: ${error?.message || "Failed to export table."}`);
      if (!isMissingTableError(error)) console.warn("[backup] export-all table failed:", item.tableName, error?.details || error);
    }
  }
  if (errors.length) files.push({ name: "_export-errors.txt", data: Buffer.from(errors.join("\n"), "utf8") });
  if (!files.length) files.push({ name: "README.txt", data: Buffer.from("No database tables were available to export.", "utf8") });
  return { data: buildZip(files), filename: `database-export-${stamp}.zip`, contentType: "application/zip" };
}

function parseCsv(csvText = "") {
  const input = String(csvText || "").replace(/^\uFEFF/, "");
  if (!input.trim()) throw errorWithStatus("CSV file is empty.");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { pushCell(); continue; }
    if (ch === "\n") { pushCell(); pushRow(); continue; }
    if (ch === "\r") { if (input[i + 1] === "\n") i += 1; pushCell(); pushRow(); continue; }
    cell += ch;
  }
  if (inQuotes) throw errorWithStatus("CSV file has an unclosed quoted value.");
  pushCell(); pushRow();
  while (rows.length && rows[rows.length - 1].every((value) => !text(value))) rows.pop();
  if (!rows.length) throw errorWithStatus("CSV file is empty.");
  const headers = rows[0].map((value) => text(String(value || "").replace(/^\uFEFF/, "")));
  if (!headers.length || headers.every((value) => !value)) throw errorWithStatus("CSV header row is missing.");
  const seen = new Set();
  for (const header of headers) {
    if (!header) throw errorWithStatus("CSV contains an empty column header.");
    const key = header.toLowerCase();
    if (seen.has(key)) throw errorWithStatus(`CSV contains duplicate column header: ${header}`);
    seen.add(key);
  }
  const records = [];
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index] || [];
    if (current.every((value) => !text(value))) continue;
    if (current.length > headers.length && current.slice(headers.length).some((value) => text(value))) throw errorWithStatus(`CSV row ${index + 1} has more values than the header row.`);
    const record = {};
    headers.forEach((header, columnIndex) => { record[header] = current[columnIndex] ?? ""; });
    records.push(record);
  }
  if (!records.length) throw errorWithStatus("CSV file has headers but no data rows to import.");
  return { headers, records };
}

async function probeCsvColumns(tableName, headers = []) {
  const table = cleanTableName(tableName);
  const safeHeaders = headers.map((header) => text(header));
  if (!table || !safeHeaders.length) throw errorWithStatus("CSV header row is missing.");
  if (safeHeaders.some((header) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(header))) throw errorWithStatus("CSV headers must be valid Supabase column names.");
  const query = new URLSearchParams({ select: safeHeaders.join(","), limit: "0" });
  await supabaseRequest(`/${encodeURIComponent(table)}?${query.toString()}`, { profileName: "backup.import-probe" });
}

function validateCsvMatchesTable(headers = [], columnInfo = [], tableName = "") {
  const csvHeaders = headers.map((header) => text(header)).filter(Boolean);
  const tableColumnNames = columnInfo.map((column) => text(column?.name)).filter(Boolean);
  if (!tableColumnNames.length) return;
  const csvSet = new Set(csvHeaders.map((header) => header.toLowerCase()));
  const tableSet = new Set(tableColumnNames.map((column) => column.toLowerCase()));
  const missing = tableColumnNames.filter((column) => !csvSet.has(column.toLowerCase()));
  const extra = csvHeaders.filter((header) => !tableSet.has(header.toLowerCase()));
  if (!missing.length && !extra.length) return;
  const parts = [];
  if (missing.length) parts.push(`missing column(s): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""}`);
  if (extra.length) parts.push(`extra column(s): ${extra.slice(0, 8).join(", ")}${extra.length > 8 ? ", ..." : ""}`);
  throw errorWithStatus(`CSV does not match the actual "${tableName}" table: ${parts.join("; ")}.`);
}

function unprotectCsvFormulaValue(value = "") {
  const raw = String(value ?? "");
  return /^'[=+\-@]/.test(raw) ? raw.slice(1) : raw;
}

function coerceCsvValue(value, column = {}) {
  const raw = unprotectCsvFormulaValue(value);
  const trimmed = raw.trim();
  const type = columnTypeToken(column);
  if (trimmed === "") return null;
  if (/json|object|array/.test(type)) { try { return JSON.parse(raw); } catch { return raw; } }
  if (/boolean|bool/.test(type)) {
    if (/^(true|t|yes|y|1)$/i.test(trimmed)) return true;
    if (/^(false|f|no|n|0)$/i.test(trimmed)) return false;
    return raw;
  }
  if (/integer|int2|int4|int8|bigint|smallint/.test(type)) return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : raw;
  if (/number|numeric|decimal|real|double|float/.test(type)) { const number = Number(trimmed); return Number.isFinite(number) ? number : raw; }
  return raw;
}

function recordsToPayload(records = [], headers = [], columnInfo = []) {
  const byName = new Map(columnInfo.map((column) => [text(column?.name).toLowerCase(), column]));
  return records.map((record) => {
    const output = {};
    for (const header of headers) {
      const cleanHeader = text(header);
      if (!cleanHeader) continue;
      const value = coerceCsvValue(record?.[header], byName.get(cleanHeader.toLowerCase()) || { name: cleanHeader });
      if (/^id$/i.test(cleanHeader) && (value === null || !text(value))) continue;
      output[cleanHeader] = value;
    }
    return output;
  });
}

function cloneRowsWithoutColumn(rows = [], column = "") {
  const clean = text(column);
  if (!clean) return rows;
  return rows.map((row) => {
    const next = { ...(row || {}) };
    for (const key of Object.keys(next)) if (String(key).toLowerCase() === clean.toLowerCase()) delete next[key];
    return next;
  });
}

function unsupportedInsertColumn(error) {
  const message = String(error?.message || error?.details?.message || error?.details || error || "");
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] of relation/i,
    /column ['"]([^'"]+)['"] does not exist/i,
    /cannot insert a non-DEFAULT value into column ['"]([^'"]+)['"]/i,
    /cannot insert into column ['"]([^'"]+)['"]/i,
    /column ['"]([^'"]+)['"] is generated/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const column = text(match?.[1]);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) return column;
  }
  return "";
}

function upsertNotAvailable(error) {
  const message = String(error?.message || error?.details?.message || error?.details || error || "");
  return /no unique or exclusion constraint|ON CONFLICT|on_conflict|42P10/i.test(message);
}

async function writeRowsChunk(table, chunk = [], { upsertBy = "" } = {}) {
  let rows = Array.isArray(chunk) ? chunk : [];
  let conflictColumn = text(upsertBy);
  const removedColumns = new Set();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query = conflictColumn ? `?on_conflict=${encodeURIComponent(conflictColumn)}` : "";
    const prefer = conflictColumn ? "resolution=merge-duplicates,return=minimal" : "return=minimal";
    try {
      await supabaseRequest(`/${encodeURIComponent(table)}${query}`, { method: "POST", headers: { Prefer: prefer }, body: rows, timeoutMs: 30_000, profileName: "backup.import-write" });
      return;
    } catch (error) {
      if (conflictColumn && upsertNotAvailable(error)) { conflictColumn = ""; continue; }
      const unsupported = unsupportedInsertColumn(error);
      if (unsupported && !removedColumns.has(unsupported)) {
        removedColumns.add(unsupported);
        rows = cloneRowsWithoutColumn(rows, unsupported);
        if (conflictColumn && unsupported.toLowerCase() === conflictColumn.toLowerCase()) conflictColumn = "";
        continue;
      }
      const next = errorWithStatus(`Failed to import into ${table}: ${error?.message || "Failed to import CSV data."}`, error?.status || 500);
      next.details = error?.details || error;
      throw next;
    }
  }
  throw errorWithStatus(`Failed to import into ${table}: too many unsupported column retries.`, 500);
}

async function insertRows(tableName, rows = []) {
  const table = cleanTableName(tableName);
  if (!table) throw errorWithStatus("Invalid table name.");
  const list = Array.isArray(rows) ? rows : [];
  for (let index = 0; index < list.length; index += 500) {
    const chunk = list.slice(index, index + 500).filter((row) => row && typeof row === "object" && Object.keys(row).length);
    if (!chunk.length) continue;
    const withId = chunk.filter(hasUsableId);
    const withoutId = chunk.filter((row) => !hasUsableId(row));
    if (withId.length) await writeRowsChunk(table, withId, { upsertBy: "id" });
    if (withoutId.length) await writeRowsChunk(table, withoutId);
  }
  return list.length;
}

export async function importBackupCsv(context = {}, key = "", csvText = "", password = "") {
  await requireBackupPassword(context, password);
  const item = findBackupTable(key);
  if (!item) throw errorWithStatus(`Backup table key "${text(key)}" was not found in the configured Database catalog.`, 404);
  const parsed = parseCsv(csvText);
  const schema = await tableColumns(item.tableName);
  if (schema.columns.length) validateCsvMatchesTable(parsed.headers, schema.columns, item.tableName);
  else await probeCsvColumns(item.tableName, parsed.headers);
  const payload = recordsToPayload(parsed.records, parsed.headers, schema.columns);
  const importedRows = await insertRows(item.tableName, payload);
  return { ok: true, tableName: item.tableName, importedRows, schemaValidated: schema.source !== "probe", schemaSource: schema.source };
}

async function readBackupImportObject(objectPath = "") {
  const cleanPath = text(objectPath).replace(/^\/+/, "");
  if (!cleanPath.startsWith("backup-imports/")) throw errorWithStatus("Invalid backup import upload reference.", 400);
  const { url, key, storageBucket } = getSupabaseConfig();
  const bucket = text(storageBucket);
  if (!url || !key || !bucket) throw errorWithStatus("Supabase Storage is not configured.", 500);
  const encodedPath = cleanPath.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: "GET",
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw errorWithStatus(raw || `Failed to read uploaded CSV (${response.status}).`, response.status || 502);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw errorWithStatus("CSV file is empty.", 400);
  if (bytes.length > 25 * 1024 * 1024) throw errorWithStatus("CSV file is too large. Maximum size is 25 MB.", 413);
  return bytes.toString("utf8");
}

export async function importBackupCsvUpload(context = {}, key = "", objectPath = "", password = "") {
  await requireBackupPassword(context, password);
  const cleanPath = text(objectPath).replace(/^\/+/, "");
  try {
    const csvText = await readBackupImportObject(cleanPath);
    // Password has already been verified above; use the same import logic with a
    // minimal Admin-shaped context to avoid a second storage read or auth bridge.
    const item = findBackupTable(key);
    if (!item) throw errorWithStatus(`Backup table key "${text(key)}" was not found in the configured Database catalog.`, 404);
    const parsed = parseCsv(csvText);
    const schema = await tableColumns(item.tableName);
    if (schema.columns.length) validateCsvMatchesTable(parsed.headers, schema.columns, item.tableName);
    else await probeCsvColumns(item.tableName, parsed.headers);
    const payload = recordsToPayload(parsed.records, parsed.headers, schema.columns);
    const importedRows = await insertRows(item.tableName, payload);
    return { ok: true, tableName: item.tableName, importedRows, schemaValidated: schema.source !== "probe", schemaSource: schema.source };
  } finally {
    if (cleanPath.startsWith("backup-imports/")) {
      await deleteStorageObjects([cleanPath]).catch(() => null);
    }
  }
}

async function deleteAllRows(tableName) {
  const table = cleanTableName(tableName);
  if (!table) throw errorWithStatus("Invalid table name.");
  try {
    await supabaseRequest(`/${encodeURIComponent(table)}?id=not.is.null`, { method: "DELETE", headers: { Prefer: "return=minimal" }, profileName: "backup.delete-all-rows" });
    return;
  } catch (firstError) {
    const message = String(firstError?.message || firstError?.details?.message || firstError?.details || "");
    if (!/column|schema cache|does not exist|PGRST204|42703/i.test(message)) throw firstError;
  }
  const query = new URLSearchParams({ select: "*", limit: "1" });
  const sample = await supabaseRequest(`/${encodeURIComponent(table)}?${query.toString()}`, { profileName: "backup.delete-sample" });
  const firstRow = Array.isArray(sample) ? sample[0] || null : null;
  const fallbackColumn = Object.keys(firstRow || {}).find((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key));
  if (!fallbackColumn) return;
  await supabaseRequest(`/${encodeURIComponent(table)}?${encodeURIComponent(fallbackColumn)}=not.is.null`, { method: "DELETE", headers: { Prefer: "return=minimal" }, profileName: "backup.delete-fallback" });
}

export async function deleteBackupTableData(context = {}, key = "", password = "") {
  await requireBackupPassword(context, password);
  const item = findBackupTable(key);
  if (!item) throw errorWithStatus("Backup table was not found.", 404);
  await deleteAllRows(item.tableName);
  return { ok: true };
}

export async function deleteAllBackupData(context = {}, password = "") {
  await requireBackupPassword(context, password);
  const deletedTables = [];
  const skippedTables = [];
  for (const item of [...backupCatalog()].reverse()) {
    try {
      await deleteAllRows(item.tableName);
      deletedTables.push(item.tableName);
    } catch (error) {
      if (isMissingTableError(error)) { skippedTables.push(item.tableName); continue; }
      error.message = `Failed to delete data from ${item.tableName}: ${error.message || "Unknown error"}`;
      throw error;
    }
  }
  return { ok: true, deletedTables, skippedTables };
}
