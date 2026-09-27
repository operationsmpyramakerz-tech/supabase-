import "server-only";

import B2CFormulaEngine from "./b2c-formula-engine";
import { getDirectAccountGate } from "./products-auth";
import { deleteById, insert, select, selectById, supabaseRequest, updateById } from "./supabase-rest";

const LIST_CACHE_TTL_MS = 3_000;
const DETAIL_CACHE_TTL_MS = 1_500;
const REFERENCE_CACHE_TTL_MS = 5_000;

const cache = new Map();
const inflight = new Map();

const FIELD_TYPES = new Set([
  "text", "number", "select", "multi_select", "date", "files",
  "checkbox", "url", "email", "phone", "formula", "place",
]);
const SELECT_TYPES = new Set(["select", "multi_select"]);

function text(value, max = 0) {
  const output = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return max > 0 ? output.slice(0, max) : output;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function number(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  const raw = text(value);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function fieldType(value, fallback = "text") {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    photo: "files",
    photos: "files",
    file: "files",
    media: "files",
    photos_files: "files",
    photos_and_files: "files",
    multi: "multi_select",
    multiselect: "multi_select",
    "multi-select": "multi_select",
    tel: "phone",
    telephone: "phone",
    files_media: "files",
    "files_&_media": "files",
    location: "place",
  };
  const resolved = aliases[raw] || raw;
  return FIELD_TYPES.has(resolved) ? resolved : fallback;
}

function fieldKey(value, fallback = "field") {
  const base = text(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || fallback;
}

function options(raw, type = "text") {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const list = Array.isArray(source.options) ? source.options : String(source.options || "").split(",");
  return {
    options: SELECT_TYPES.has(type) ? [...new Set(list.map((item) => text(item, 100)).filter(Boolean))].slice(0, 100) : [],
    relationDatabaseId: text(source.relationDatabaseId || source.relation_database_id, 60) || null,
    formula: text(source.formula, 2000) || null,
    buttonLabel: text(source.buttonLabel || source.button_label, 80) || "Run",
  };
}

function rowId(row = {}) {
  return text(row.id ?? row.ID);
}

function serializeDatabase(row = {}) {
  return {
    id: rowId(row),
    key: text(row.database_key ?? row.databaseKey ?? row.key, 100),
    name: text(row.name ?? row.database_name ?? row.databaseName, 120) || "Untitled Table",
    description: text(row.description, 500),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function serializeField(row = {}) {
  const type = fieldType(row.field_type ?? row.fieldType ?? row.type);
  return {
    id: rowId(row),
    databaseId: text(row.database_id ?? row.databaseId, 60),
    key: fieldKey(row.field_key ?? row.fieldKey ?? row.key, `field_${rowId(row) || "new"}`),
    label: text(row.label ?? row.name ?? row.field_name ?? row.fieldName, 120) || "Untitled field",
    type,
    required: bool(row.is_required ?? row.required ?? row.isRequired, false),
    sortOrder: number(row.sort_order ?? row.sortOrder, 1, 1, 9999),
    options: options(parseJson(row.field_options ?? row.fieldOptions ?? row.options, {}), type),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function serializeRecord(row = {}) {
  const recordNumber = number(row.record_number ?? row.recordNumber ?? row.sequence_number, 0, 0, Number.MAX_SAFE_INTEGER);
  const fallbackNumber = recordNumber || number(rowId(row), 0, 0, Number.MAX_SAFE_INTEGER);
  return {
    id: rowId(row),
    databaseId: text(row.database_id ?? row.databaseId, 60),
    recordNumber: recordNumber || null,
    customerCode: text(row.customer_code ?? row.customerCode ?? row.record_code ?? row.code, 80) || `REC-${String(fallbackNumber).padStart(5, "0")}`,
    values: parseJson(row.data ?? row.values ?? row.customer_data ?? row.customerData, {}),
    createdById: text(row.created_by_id ?? row.createdById, 120),
    createdByName: text(row.created_by_name ?? row.createdByName, 180) || "—",
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function serializeForm(row = {}) {
  return {
    id: rowId(row),
    databaseId: text(row.database_id ?? row.databaseId, 60),
    name: text(row.name ?? row.form_name ?? row.formName, 120) || "Untitled Form",
    description: text(row.description, 500),
    isDefault: bool(row.is_default ?? row.isDefault, false),
    isActive: bool(row.is_active ?? row.isActive, true),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function serializeFormField(row = {}, field = {}) {
  const override = row.is_required_override ?? row.required_override ?? row.isRequiredOverride;
  const condition = parseJson(row.visibility_condition ?? row.condition ?? row.visibilityCondition, {});
  return {
    ...field,
    fieldId: text(row.field_id ?? row.fieldId, 60) || field.id,
    sortOrder: number(row.sort_order ?? row.sortOrder, field.sortOrder || 1, 1, 9999),
    formRequired: typeof override === "boolean" ? override : field.required,
    formHidden: bool(condition?.hidden || condition?.isHidden || condition?.is_hidden, false),
    condition: {
      enabled: bool(condition?.enabled, false),
      fieldKey: text(condition?.fieldKey || condition?.field_key, 80),
      operator: text(condition?.operator, 40) || "equals",
      value: condition?.value ?? "",
    },
  };
}

function missingSchema(error) {
  const message = String(error?.message || error?.details?.message || error?.details || "");
  return /b2c_|schema cache|Could not find the table|relation .* does not exist|42P01|PGRST205|column .* does not exist/i.test(message);
}

export function b2cErrorMessage(error) {
  if (missingSchema(error)) return "B2C multi-database tables are not installed yet. Run the supplied B2C SQL migration, then refresh the page.";
  if (error?.code === "B2C_DEFAULT_FORM_REQUIRED") return "The linked B2C form needs to be initialized by the compatibility service.";
  return error?.message || "Failed to process B2C request.";
}

function databasesTable() {
  return text(process.env.SUPABASE_B2C_DATABASES_TABLE) || "b2c_databases";
}
function fieldsTable() {
  return text(process.env.SUPABASE_B2C_CUSTOMER_FIELDS_TABLE) || "b2c_customer_fields";
}
function customersTable() {
  return text(process.env.SUPABASE_B2C_CUSTOMERS_TABLE) || "b2c_customers";
}
function formsTable() {
  return text(process.env.SUPABASE_B2C_FORMS_TABLE) || "b2c_forms";
}
function formFieldsTable() {
  return text(process.env.SUPABASE_B2C_FORM_FIELDS_TABLE) || "b2c_form_fields";
}

async function cached(key, ttlMs, loader, { force = false } = {}) {
  const now = Date.now();
  const existing = cache.get(key);
  if (!force && existing?.expiresAt > now) return existing.value;
  if (!force && inflight.has(key)) return await inflight.get(key);

  const pending = Promise.resolve().then(loader);
  if (!force) inflight.set(key, pending);
  try {
    const value = await pending;
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } finally {
    if (!force && inflight.get(key) === pending) inflight.delete(key);
  }
}

async function loadDatabases({ force = false } = {}) {
  return await cached("b2c:databases:raw", REFERENCE_CACHE_TTL_MS, async () => {
    const rows = await select(databasesTable(), { select: "*", order: "created_at.asc,id.asc", limit: "5000" });
    return (Array.isArray(rows) ? rows : []).map(serializeDatabase);
  }, { force });
}

async function loadFields(databaseId, { force = false } = {}) {
  const id = text(databaseId, 60);
  return await cached(`b2c:fields:${id}`, REFERENCE_CACHE_TTL_MS, async () => {
    const rows = await select(fieldsTable(), {
      select: "*",
      database_id: `eq.${id}`,
      order: "sort_order.asc,id.asc",
      limit: "5000",
    });
    return (Array.isArray(rows) ? rows : []).map(serializeField).sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }, { force });
}

async function loadForms(databaseId = "", { force = false } = {}) {
  const id = text(databaseId, 60);
  return await cached(`b2c:forms:raw:${id || "all"}`, REFERENCE_CACHE_TTL_MS, async () => {
    const params = { select: "*", order: "is_default.desc,created_at.asc,id.asc", limit: "5000" };
    if (id) params.database_id = `eq.${id}`;
    const rows = await select(formsTable(), params);
    return (Array.isArray(rows) ? rows : []).map(serializeForm);
  }, { force });
}

async function loadRecords(databaseId, { force = false } = {}) {
  const id = text(databaseId, 60);
  return await cached(`b2c:records:${id}`, DETAIL_CACHE_TTL_MS, async () => {
    const rows = await select(customersTable(), {
      select: "*",
      database_id: `eq.${id}`,
      order: "created_at.desc,id.desc",
      limit: "10000",
    });
    return (Array.isArray(rows) ? rows : []).map(serializeRecord);
  }, { force });
}

async function loadFormBindings(formId, { force = false } = {}) {
  const id = text(formId, 60);
  return await cached(`b2c:form-bindings:${id}`, REFERENCE_CACHE_TTL_MS, async () => {
    const rows = await select(formFieldsTable(), {
      select: "*",
      form_id: `eq.${id}`,
      order: "sort_order.asc,id.asc",
      limit: "5000",
    });
    return Array.isArray(rows) ? rows : [];
  }, { force });
}

export function invalidateB2cCache() {
  cache.clear();
  inflight.clear();
}

async function ensureDefaultForm(database) {
  if (!database?.id) return null;
  const forms = await loadForms(database.id, { force: true });
  if (forms.length) return forms.find((form) => form.isDefault) || forms[0];
  const now = new Date().toISOString();
  const created = await insert(formsTable(), {
    database_id: database.id,
    name: `${database.name || "B2C Table"} Form`.slice(0, 120),
    description: database.description || `Entry form for ${database.name || "B2C Table"}`,
    is_default: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  invalidateB2cCache();
  return serializeForm(created || {});
}

async function ensureFormFields(formId, fields = []) {
  const id = text(formId, 60);
  if (!id) return;
  const rows = await select(formFieldsTable(), {
    select: "*",
    form_id: `eq.${id}`,
    order: "sort_order.asc,id.asc",
    limit: "5000",
  });
  const byFieldId = new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row?.field_id ?? row?.fieldId ?? ""), row]));
  let changed = false;
  const now = new Date().toISOString();
  for (const [index, field] of (Array.isArray(fields) ? fields : []).entries()) {
    if (!field?.id || byFieldId.has(String(field.id))) continue;
    await insert(formFieldsTable(), {
      form_id: id,
      field_id: field.id,
      sort_order: index + 1,
      is_required_override: null,
      visibility_condition: {},
      created_at: now,
      updated_at: now,
    });
    changed = true;
  }
  if (changed) invalidateB2cCache();
}

async function deleteWhere(table, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value === null || typeof value === "undefined" || value === "") continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return await supabaseRequest(`/${encodeURIComponent(table)}${queryString ? `?${queryString}` : ""}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
}

function actorFromContext(context = {}) {
  return {
    id: text(context?.memberId || context?.account?.teamMemberId || context?.account?.userSupabaseId || context?.account?.id, 120),
    name: text(context?.account?.name || context?.account?.username, 180) || "User",
  };
}

function nextKey(baseValue, usedKeys, fallback = "field", max = 60) {
  const base = fieldKey(baseValue, fallback).slice(0, max);
  if (!usedKeys.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
    if (!usedKeys.has(candidate)) return candidate;
  }
  return `${base.slice(0, Math.max(1, max - 10))}_${Date.now().toString(36)}`.slice(0, max);
}


function accessToken(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function b2cPageAliases(value) {
  const token = accessToken(value);
  const groups = {
    b2c: ["b2c", "businesstocustomer", "customerdatabase", "customerform", "b2cdatabase", "b2cform"],
    customerdatabase: ["customerdatabase", "b2c", "b2ccustomerdatabase", "b2cdatabase"],
    b2ccustomerdatabase: ["customerdatabase", "b2c", "b2ccustomerdatabase", "b2cdatabase"],
    b2cdatabase: ["customerdatabase", "b2c", "b2ccustomerdatabase", "b2cdatabase"],
    customerform: ["customerform", "b2c", "b2ccustomerform", "b2cform"],
    b2ccustomerform: ["customerform", "b2c", "b2ccustomerform", "b2cform"],
    b2cform: ["customerform", "b2c", "b2ccustomerform", "b2cform"],
  };
  return new Set([token, ...(groups[token] || [])].filter(Boolean));
}

function directB2cAccessLevel(account = {}, requiredPages = []) {
  const name = accessToken(account?.name || account?.username);
  const position = accessToken(account?.position);
  if (name === "admin" || position.includes("admin")) return "admin";

  const requested = (Array.isArray(requiredPages) ? requiredPages : [requiredPages]).map(text).filter(Boolean);
  const wanted = requested.map(b2cPageAliases);
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const rank = { view: 1, edit: 2, admin: 3 };
  let best = "";
  for (const row of rows) {
    if (row?.isEnabled === false || row?.is_enabled === false) continue;
    const candidates = [row?.pageName, row?.pageKey, row?.routePath, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
      .map(accessToken)
      .filter(Boolean);
    const matches = wanted.some((aliases) => candidates.some((candidate) => aliases.has(candidate)));
    if (!matches) continue;
    const raw = text(row?.accessLevel || row?.access_level).toLowerCase();
    const level = raw === "admin" ? "admin" : raw === "view" ? "view" : "edit";
    if (!best || rank[level] > rank[best]) best = level;
  }
  if (best) return best;

  const allowed = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  const legacyMatch = requested.some((required) => {
    const requiredAliases = b2cPageAliases(required);
    return allowed.some((candidate) => requiredAliases.has(accessToken(candidate)));
  });
  return legacyMatch ? "edit" : "";
}

function attachFormulaValues(record, fields = []) {
  const source = record && typeof record === "object" ? record : {};
  try {
    const calculated = B2CFormulaEngine?.calculateFormulaValues?.(fields, source.values || {});
    return {
      ...source,
      formulaValues: calculated?.values && typeof calculated.values === "object" ? calculated.values : {},
      formulaErrors: calculated?.errors && typeof calculated.errors === "object" ? calculated.errors : {},
    };
  } catch {
    return { ...source, formulaValues: {}, formulaErrors: {} };
  }
}

export async function directB2cContext(requiredPages = ["Customer Database", "Customer Form", "B2C"], { mutation = false } = {}) {
  const gate = await getDirectAccountGate(requiredPages);
  if (!gate) return null;
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status || 403,
      error: gate.error || "B2C access is not allowed for this account.",
      account: gate.account || null,
      memberId: gate.memberId || "",
      accessLevel: "",
      source: "next-account-gate",
    };
  }
  const accessLevel = directB2cAccessLevel(gate.account || {}, requiredPages) || "edit";
  if (mutation && accessLevel === "view") {
    return {
      ok: false,
      status: 403,
      error: "View-only access: you are not authorized to make changes on this page.",
      account: gate.account || null,
      memberId: gate.memberId || "",
      accessLevel,
      source: "next-account-gate",
    };
  }
  return {
    ok: true,
    status: 200,
    error: "",
    account: gate.account,
    memberId: gate.memberId || "",
    accessLevel,
    source: "next-account-gate",
  };
}

export async function b2cDatabasesPayload({ force = false } = {}) {
  return await cached("b2c:databases:payload", LIST_CACHE_TTL_MS, async () => {
    const [databases, fieldRows, recordRows, forms] = await Promise.all([
      loadDatabases({ force }),
      select(fieldsTable(), { select: "database_id", order: "database_id.asc", limit: "10000" }),
      select(customersTable(), { select: "database_id", order: "database_id.asc", limit: "10000" }),
      loadForms("", { force }),
    ]);

    const fieldCount = new Map();
    const recordCount = new Map();
    const firstForm = new Map();
    for (const row of Array.isArray(fieldRows) ? fieldRows : []) {
      const id = text(row?.database_id ?? row?.databaseId);
      if (id) fieldCount.set(id, (fieldCount.get(id) || 0) + 1);
    }
    for (const row of Array.isArray(recordRows) ? recordRows : []) {
      const id = text(row?.database_id ?? row?.databaseId);
      if (id) recordCount.set(id, (recordCount.get(id) || 0) + 1);
    }
    for (const form of forms) {
      const id = String(form.databaseId || "");
      if (!id) continue;
      if (!firstForm.has(id) || form.isDefault) firstForm.set(id, form.id);
    }

    return {
      ok: true,
      source: "direct-supabase",
      databases: databases.map((database) => ({
        ...database,
        fieldCount: fieldCount.get(String(database.id)) || 0,
        recordCount: recordCount.get(String(database.id)) || 0,
        defaultFormId: firstForm.get(String(database.id)) || null,
      })),
    };
  }, { force });
}

export async function b2cFormsPayload({ force = false } = {}) {
  return await cached("b2c:forms:payload", LIST_CACHE_TTL_MS, async () => {
    const [databases, forms, bindings] = await Promise.all([
      loadDatabases({ force }),
      loadForms("", { force }),
      select(formFieldsTable(), { select: "form_id", order: "form_id.asc", limit: "10000" }),
    ]);
    const databaseById = new Map(databases.map((database) => [String(database.id), database]));
    const fieldCount = new Map();
    for (const row of Array.isArray(bindings) ? bindings : []) {
      const id = text(row?.form_id ?? row?.formId);
      if (id) fieldCount.set(id, (fieldCount.get(id) || 0) + 1);
    }
    return {
      ok: true,
      source: "direct-supabase",
      databases,
      forms: forms.map((form) => ({
        ...form,
        databaseName: databaseById.get(String(form.databaseId))?.name || "B2C Table",
        fieldCount: fieldCount.get(String(form.id)) || 0,
      })),
    };
  }, { force });
}

export async function b2cFormDetail(formId, { force = false } = {}) {
  const id = text(formId, 60);
  if (!id) {
    const error = new Error("A B2C form id is required.");
    error.status = 400;
    throw error;
  }
  return await cached(`b2c:form-detail:${id}`, DETAIL_CACHE_TTL_MS, async () => {
    const raw = await selectById(formsTable(), id);
    if (!raw) return null;
    const form = serializeForm(raw);
    const [databaseRaw, fields] = await Promise.all([
      selectById(databasesTable(), form.databaseId),
      loadFields(form.databaseId, { force }),
    ]);
    if (!databaseRaw) return null;
    const database = serializeDatabase(databaseRaw);
    await ensureFormFields(form.id, fields);
    const bindingRows = await loadFormBindings(form.id, { force: true });
    const bindingByField = new Map((Array.isArray(bindingRows) ? bindingRows : []).map((row) => [String(row.field_id ?? row.fieldId ?? ""), row]));
    const formFields = fields
      .map((field, index) => serializeFormField(bindingByField.get(String(field.id)) || { field_id: field.id, sort_order: index + 1 }, field))
      .sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
      .filter((field) => !field.formHidden);
    return {
      ok: true,
      source: "direct-supabase",
      form: { ...form, database },
      fields: formFields,
    };
  }, { force });
}

export async function b2cTablePayload(databaseId, { force = false } = {}) {
  const id = text(databaseId, 60);
  if (!id) {
    const error = new Error("A B2C database id is required.");
    error.status = 400;
    throw error;
  }
  return await cached(`b2c:table:${id}`, DETAIL_CACHE_TTL_MS, async () => {
    const databaseRaw = await selectById(databasesTable(), id);
    if (!databaseRaw) return { ok: true, source: "direct-supabase", database: null, fields: [], records: [] };
    const database = serializeDatabase(databaseRaw);
    const [fields, rawRecords, forms] = await Promise.all([
      loadFields(id, { force }),
      loadRecords(id, { force }),
      loadForms(id, { force }),
    ]);
    const defaultForm = forms.find((form) => form.isDefault) || forms[0] || await ensureDefaultForm(database);
    return {
      ok: true,
      source: "direct-supabase",
      database: { ...database, defaultFormId: defaultForm.id },
      fields,
      records: rawRecords.map((record) => attachFormulaValues(record, fields)),
    };
  }, { force });
}

function b2cFailure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function fieldPatch(body = {}) {
  const label = text(body?.label, 120);
  const type = fieldType(body?.type, "");
  if (!label) throw b2cFailure("Property name is required.");
  if (!type) throw b2cFailure("Choose a valid property type.");
  const fieldOptions = options(body?.options, type);
  if (type === "formula" && fieldOptions.formula && B2CFormulaEngine?.expressionInfo) {
    const validation = B2CFormulaEngine.expressionInfo(fieldOptions.formula);
    if (!validation?.ok) throw b2cFailure(`Formula is invalid: ${validation?.error || "check the expression."}`);
  }
  return {
    label,
    field_type: type,
    field_options: fieldOptions,
    is_required: bool(body?.required, false),
    sort_order: number(body?.sortOrder, 1, 1, 9999),
    updated_at: new Date().toISOString(),
  };
}

function normalizeCondition(raw, fields = [], selfKey = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const enabled = bool(source.enabled, false);
  const validOperators = new Set(["equals", "not_equals", "contains", "has_value", "is_empty", "is_checked", "not_checked"]);
  const condition = {
    enabled,
    fieldKey: text(source.fieldKey || source.field_key, 80),
    operator: validOperators.has(text(source.operator, 40)) ? text(source.operator, 40) : "equals",
    value: typeof source.value === "string" || typeof source.value === "number" || typeof source.value === "boolean" ? source.value : "",
  };
  if (!enabled) return { enabled: false, fieldKey: "", operator: "equals", value: "" };
  if (!condition.fieldKey) throw b2cFailure("Choose the controlling field for each conditional property.");
  if (condition.fieldKey === selfKey) throw b2cFailure("A field cannot use itself as its visibility condition.");
  if (!fields.some((field) => field.key === condition.fieldKey)) throw b2cFailure("A form condition references a field that does not exist in this table.");
  return condition;
}

function conditionPass(condition, values = {}) {
  if (!condition?.enabled) return true;
  const value = values?.[condition.fieldKey];
  const list = Array.isArray(value) ? value : [];
  const source = String(value ?? "");
  const target = String(condition.value ?? "");
  if (condition.operator === "equals") return source === target;
  if (condition.operator === "not_equals") return source !== target;
  if (condition.operator === "contains") return list.includes(target) || source.includes(target);
  if (condition.operator === "has_value") return Array.isArray(value) ? value.length > 0 : !!text(value);
  if (condition.operator === "is_empty") return Array.isArray(value) ? value.length === 0 : !text(value);
  if (condition.operator === "is_checked") return value === true || source.toLowerCase() === "true";
  if (condition.operator === "not_checked") return !(value === true || source.toLowerCase() === "true");
  return true;
}

function normalizeProtectedFileUrl(value = "") {
  const raw = text(value, 3000);
  if (!raw) return "";
  const legacy = raw.match(/^\/api\/storage\/file\/([A-Za-z0-9._~-]+)(?:\?([^#]*))?$/i);
  if (legacy) {
    const query = new URLSearchParams(legacy[2] || "");
    query.set("reference", legacy[1]);
    return `/next/api/storage/file-direct?${query.toString()}`;
  }
  return raw;
}

function safeFileEntry(value) {
  if (!value || typeof value !== "object") return null;
  const url = normalizeProtectedFileUrl(value.url || value.href || value.publicUrl);
  const protectedStorage = /^\/next\/api\/storage\/file-direct\?reference=[A-Za-z0-9._%~-]+/i.test(url);
  if (!/^https:\/\//i.test(url) && !protectedStorage) return null;
  return {
    name: text(value.name || value.filename || "Attachment", 240) || "Attachment",
    url,
    type: text(value.type || value.mime || "", 120),
    size: Math.max(0, Math.min(100 * 1024 * 1024, Number(value.size) || 0)),
  };
}

function sanitizeValues(rawValues, fields = [], { partial = false, formMode = false } = {}) {
  const incoming = rawValues && typeof rawValues === "object" && !Array.isArray(rawValues) ? rawValues : {};
  const output = {};
  const missing = [];
  for (const field of fields) {
    const visible = !formMode || conditionPass(field.condition, { ...incoming, ...output });
    if (!visible || field.type === "formula") continue;
    const key = field.key;
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) {
      if (!partial && (formMode ? field.formRequired : field.required)) missing.push(field.label);
      continue;
    }
    const raw = incoming[key];
    const required = formMode ? field.formRequired : field.required;
    if (field.type === "number") {
      if (raw === "" || raw === null || typeof raw === "undefined") output[key] = null;
      else {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) throw b2cFailure(`${field.label} must be a valid number.`);
        output[key] = parsed;
      }
    } else if (field.type === "files") {
      const files = (Array.isArray(raw) ? raw : []).map(safeFileEntry).filter(Boolean).slice(0, 20);
      if (!partial && required && !files.length) missing.push(field.label);
      output[key] = files;
    } else if (field.type === "checkbox") {
      const checked = raw === true || String(raw).toLowerCase() === "true" || raw === 1 || raw === "1";
      if (!partial && required && !checked) missing.push(field.label);
      output[key] = checked;
    } else if (field.type === "multi_select") {
      const available = new Set(field.options?.options || []);
      const values = (Array.isArray(raw) ? raw : []).map((value) => text(value, 100)).filter(Boolean).filter((value) => !available.size || available.has(value)).slice(0, 100);
      if (!partial && required && !values.length) missing.push(field.label);
      output[key] = values;
    } else {
      const value = text(raw, field.type === "phone" ? 80 : 5000);
      if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw b2cFailure(`${field.label} must be a valid email.`);
      if (field.type === "url" && value && !/^https?:\/\//i.test(value)) throw b2cFailure(`${field.label} must start with http:// or https://.`);
      if (SELECT_TYPES.has(field.type) && value && (field.options?.options || []).length && !(field.options.options || []).includes(value)) throw b2cFailure(`${field.label} must use one of its configured options.`);
      if (!partial && required && !value) missing.push(field.label);
      output[key] = value;
    }
  }
  if (missing.length) throw b2cFailure(`Complete the required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  return output;
}

async function databaseById(databaseId) {
  const raw = await selectById(databasesTable(), text(databaseId, 60));
  return raw ? serializeDatabase(raw) : null;
}

async function formBundleForMutation(formId) {
  const raw = await selectById(formsTable(), text(formId, 60));
  if (!raw) return null;
  const form = serializeForm(raw);
  const database = await databaseById(form.databaseId);
  if (!database) return null;
  const fields = await loadFields(database.id, { force: true });
  await ensureFormFields(form.id, fields);
  const bindingRows = await loadFormBindings(form.id, { force: true });
  const bindingByField = new Map((Array.isArray(bindingRows) ? bindingRows : []).map((row) => [String(row.field_id ?? row.fieldId ?? ""), row]));
  const formFields = fields
    .map((field, index) => serializeFormField(bindingByField.get(String(field.id)) || { field_id: field.id, sort_order: index + 1 }, field))
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    .filter((field) => !field.formHidden);
  return { form, database, fields: formFields };
}

export async function createB2cDatabase(context, body = {}) {
  const name = text(body?.name, 120);
  const description = text(body?.description, 500);
  if (!name) throw b2cFailure("Table name is required.");
  const databases = await loadDatabases({ force: true });
  const usedKeys = new Set(databases.map((item) => item.key).filter(Boolean));
  const now = new Date().toISOString();
  const raw = await insert(databasesTable(), {
    database_key: nextKey(name, usedKeys, "b2c_table", 80),
    name,
    description: description || null,
    created_at: now,
    updated_at: now,
  });
  const database = serializeDatabase(raw || {});
  if (!database.id) throw b2cFailure("The B2C table could not be created.", 500);
  const defaultForm = await ensureDefaultForm(database);
  invalidateB2cCache();
  return { ...database, defaultFormId: defaultForm?.id || null };
}

export async function updateB2cDatabase(context, databaseId, body = {}) {
  const id = text(databaseId, 60);
  const existing = await databaseById(id);
  if (!existing) throw b2cFailure("B2C table was not found.", 404);
  const name = text(body?.name, 120) || existing.name;
  const description = text(body?.description, 500);
  const updated = await updateById(databasesTable(), id, { name, description: description || null, updated_at: new Date().toISOString() });
  invalidateB2cCache();
  return serializeDatabase(updated || { ...existing, name, description });
}

export async function copyB2cDatabase(context, databaseId) {
  const source = await databaseById(databaseId);
  if (!source) throw b2cFailure("B2C table was not found.", 404);
  const [sourceFields, sourceForms, databases] = await Promise.all([
    loadFields(source.id, { force: true }),
    loadForms(source.id, { force: true }),
    loadDatabases({ force: true }),
  ]);
  const now = new Date().toISOString();
  const copyName = `${source.name} Copy`.slice(0, 120);
  const usedKeys = new Set(databases.map((item) => item.key).filter(Boolean));
  const rawDatabase = await insert(databasesTable(), {
    database_key: nextKey(copyName, usedKeys, "b2c_table", 80),
    name: copyName,
    description: source.description || null,
    created_at: now,
    updated_at: now,
  });
  const database = serializeDatabase(rawDatabase || {});
  if (!database.id) throw b2cFailure("The copied B2C table could not be created.", 500);

  const fieldIdMap = new Map();
  for (const field of sourceFields) {
    const rawField = await insert(fieldsTable(), {
      database_id: database.id,
      field_key: field.key,
      label: field.label,
      field_type: field.type,
      field_options: options(field.options, field.type),
      is_required: field.required,
      sort_order: field.sortOrder,
      created_at: now,
      updated_at: now,
    });
    const copied = serializeField(rawField || {});
    if (!copied.id) throw b2cFailure("A copied B2C property could not be created.", 500);
    fieldIdMap.set(String(field.id), copied.id);
  }

  for (const sourceForm of sourceForms) {
    const rawForm = await insert(formsTable(), {
      database_id: database.id,
      name: sourceForm.name,
      description: sourceForm.description || null,
      is_default: sourceForm.isDefault,
      is_active: sourceForm.isActive,
      created_at: now,
      updated_at: now,
    });
    const copiedForm = serializeForm(rawForm || {});
    if (!copiedForm.id) throw b2cFailure("A copied B2C form could not be created.", 500);
    const bindings = await select(formFieldsTable(), { select: "*", form_id: `eq.${sourceForm.id}`, order: "sort_order.asc,id.asc", limit: "5000" });
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      const oldFieldId = String(binding?.field_id ?? binding?.fieldId ?? "");
      const copiedFieldId = fieldIdMap.get(oldFieldId);
      if (!copiedFieldId) continue;
      await insert(formFieldsTable(), {
        form_id: copiedForm.id,
        field_id: copiedFieldId,
        sort_order: number(binding?.sort_order ?? binding?.sortOrder, 1, 1, 9999),
        is_required_override: binding?.is_required_override ?? binding?.required_override ?? binding?.isRequiredOverride ?? null,
        visibility_condition: parseJson(binding?.visibility_condition ?? binding?.condition ?? binding?.visibilityCondition, {}),
        created_at: now,
        updated_at: now,
      });
    }
  }
  invalidateB2cCache();
  const defaultForm = await ensureDefaultForm(database);
  invalidateB2cCache();
  return { ...database, defaultFormId: defaultForm?.id || null };
}

export async function deleteB2cDatabase(context, databaseId) {
  const database = await databaseById(databaseId);
  if (!database) throw b2cFailure("B2C table was not found.", 404);
  const forms = await loadForms(database.id, { force: true });
  for (const form of forms) {
    await deleteWhere(formFieldsTable(), { form_id: `eq.${form.id}` });
    await deleteById(formsTable(), form.id);
  }
  await deleteWhere(customersTable(), { database_id: `eq.${database.id}` });
  await deleteWhere(fieldsTable(), { database_id: `eq.${database.id}` });
  await deleteById(databasesTable(), database.id);
  invalidateB2cCache();
  return { id: database.id };
}

export async function saveB2cFields(context, databaseId, body = {}) {
  const database = await databaseById(databaseId);
  if (!database) throw b2cFailure("B2C table was not found.", 404);
  const incoming = Array.isArray(body?.fields) ? body.fields.slice(0, 80) : [];
  const existing = await loadFields(database.id, { force: true });
  const existingById = new Map(existing.map((field) => [String(field.id), field]));
  const nextIds = new Set();
  const usedKeys = new Set(existing.map((field) => field.key).filter(Boolean));

  for (const [index, raw] of incoming.entries()) {
    const requestedId = text(raw?.id, 60);
    const current = existingById.get(requestedId);
    const patch = fieldPatch({ ...raw, sortOrder: index + 1 });
    if (current) {
      const row = await updateById(fieldsTable(), current.id, patch);
      nextIds.add(String(row?.id || current.id));
    } else {
      const key = nextKey(patch.label, usedKeys, "field", 60);
      usedKeys.add(key);
      const row = await insert(fieldsTable(), { database_id: database.id, field_key: key, ...patch, created_at: new Date().toISOString() });
      if (row?.id) nextIds.add(String(row.id));
    }
  }
  for (const field of existing) {
    if (!nextIds.has(String(field.id))) await deleteById(fieldsTable(), field.id);
  }
  invalidateB2cCache();
  const fields = await loadFields(database.id, { force: true });
  const forms = await loadForms(database.id, { force: true });
  for (const form of forms) await ensureFormFields(form.id, fields);
  invalidateB2cCache();
  return fields;
}

export async function createB2cForm(context, body = {}) {
  const database = await databaseById(body?.databaseId);
  if (!database) throw b2cFailure("Choose a valid B2C data table.");
  const name = text(body?.name, 120);
  if (!name) throw b2cFailure("Form name is required.");
  const now = new Date().toISOString();
  const row = await insert(formsTable(), {
    database_id: database.id,
    name,
    description: text(body?.description, 500) || null,
    is_default: false,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  const form = serializeForm(row || {});
  if (!form.id) throw b2cFailure("The B2C form could not be created.", 500);
  await ensureFormFields(form.id, await loadFields(database.id, { force: true }));
  invalidateB2cCache();
  return form;
}

export async function updateB2cForm(context, formId, body = {}) {
  const id = text(formId, 60);
  const existing = await selectById(formsTable(), id);
  if (!existing) throw b2cFailure("B2C form was not found.", 404);
  const current = serializeForm(existing);
  const patch = {
    name: text(body?.name, 120) || current.name,
    description: text(body?.description, 500) || null,
    updated_at: new Date().toISOString(),
  };
  const updated = await updateById(formsTable(), id, patch);
  invalidateB2cCache();
  return serializeForm(updated || { ...existing, ...patch });
}

export async function saveB2cFormBuilder(context, formId, body = {}) {
  const bundle = await formBundleForMutation(formId);
  if (!bundle) throw b2cFailure("B2C form was not found.", 404);
  const incoming = Array.isArray(body?.fields) ? body.fields.slice(0, 80) : [];
  const tableFields = await loadFields(bundle.database.id, { force: true });
  const fieldById = new Map(tableFields.map((field) => [String(field.id), field]));
  const existingRows = await select(formFieldsTable(), { select: "*", form_id: `eq.${bundle.form.id}`, order: "sort_order.asc,id.asc", limit: "5000" });
  const existingByFieldId = new Map((Array.isArray(existingRows) ? existingRows : []).map((row) => [String(row?.field_id ?? row?.fieldId ?? ""), row]));
  const received = new Set();
  const now = new Date().toISOString();

  for (const [index, item] of incoming.entries()) {
    const fieldId = text(item?.fieldId || item?.id, 60);
    const field = fieldById.get(fieldId);
    if (!field || received.has(fieldId)) throw b2cFailure("The form builder contains an invalid property.");
    received.add(fieldId);
    const condition = normalizeCondition(item?.condition, tableFields, field.key);
    const existing = existingByFieldId.get(fieldId);
    const patch = {
      sort_order: index + 1,
      is_required_override: bool(item?.formRequired, field.required),
      visibility_condition: { ...condition, hidden: false },
      updated_at: now,
    };
    if (existing) await updateById(formFieldsTable(), rowId(existing), patch);
    else await insert(formFieldsTable(), { form_id: bundle.form.id, field_id: field.id, ...patch, created_at: now });
  }

  for (const field of tableFields) {
    if (received.has(String(field.id))) continue;
    const existing = existingByFieldId.get(String(field.id));
    const existingCondition = existing ? parseJson(existing?.visibility_condition ?? existing?.condition ?? existing?.visibilityCondition, {}) : {};
    const patch = {
      sort_order: tableFields.length + 1000 + Number(field.sortOrder || 0),
      is_required_override: existing ? (existing?.is_required_override ?? existing?.required_override ?? existing?.isRequiredOverride ?? null) : null,
      visibility_condition: { ...existingCondition, hidden: true },
      updated_at: now,
    };
    if (existing) await updateById(formFieldsTable(), rowId(existing), patch);
    else await insert(formFieldsTable(), { form_id: bundle.form.id, field_id: field.id, ...patch, created_at: now });
  }
  invalidateB2cCache();
  return { id: bundle.form.id };
}

export async function submitB2cForm(context, formId, body = {}) {
  const bundle = await formBundleForMutation(formId);
  if (!bundle) throw b2cFailure("B2C form was not found.", 404);
  const values = sanitizeValues(body?.values, bundle.fields, { partial: false, formMode: true });
  const actor = actorFromContext(context);
  const now = new Date().toISOString();
  const row = await insert(customersTable(), {
    database_id: bundle.database.id,
    data: values,
    created_by_id: actor.id || null,
    created_by_name: actor.name || null,
    updated_by_id: actor.id || null,
    updated_by_name: actor.name || null,
    created_at: now,
    updated_at: now,
  });
  invalidateB2cCache();
  return serializeRecord(row || {});
}

export async function updateB2cRecord(context, recordId, body = {}) {
  const id = text(recordId, 60);
  const existing = await selectById(customersTable(), id);
  if (!existing) throw b2cFailure("B2C record was not found.", 404);
  const record = serializeRecord(existing);
  const databaseId = text(body?.databaseId, 60);
  if (databaseId && String(record.databaseId) !== String(databaseId)) throw b2cFailure("This record does not belong to the selected table.", 404);
  const fields = await loadFields(record.databaseId, { force: true });
  const incoming = sanitizeValues(body?.values, fields, { partial: true });
  const actor = actorFromContext(context);
  const values = { ...record.values, ...incoming };
  const updated = await updateById(customersTable(), id, {
    data: values,
    updated_by_id: actor.id || null,
    updated_by_name: actor.name || null,
    updated_at: new Date().toISOString(),
  });
  invalidateB2cCache();
  return serializeRecord(updated || { ...existing, data: values });
}

export async function deleteB2cRecord(context, recordId, body = {}) {
  const id = text(recordId, 60);
  const existing = await selectById(customersTable(), id);
  if (!existing) throw b2cFailure("B2C record was not found.", 404);
  const databaseId = text(body?.databaseId, 60);
  const actualDatabaseId = text(existing?.database_id ?? existing?.databaseId, 60);
  if (databaseId && actualDatabaseId !== databaseId) throw b2cFailure("This record does not belong to the selected table.", 404);
  await deleteById(customersTable(), id);
  invalidateB2cCache();
  return { id };
}

export async function b2cLegacyFieldsPayload({ force = false } = {}) {
  const databases = await loadDatabases({ force });
  const database = databases[0] || null;
  return { ok: true, source: "direct-supabase", fields: database ? await loadFields(database.id, { force }) : [] };
}


export async function loadDirectB2cDatabasePageData() {
  const context = await directB2cContext(["Customer Database", "B2C"]);
  if (!context) return null;
  if (!context.ok) return context;
  try {
    return {
      ok: true,
      status: 200,
      account: context.account,
      payload: await b2cDatabasesPayload(),
      warnings: [],
      source: "direct-supabase",
    };
  } catch (error) {
    return { ok: false, status: Number(error?.status) || 500, error: b2cErrorMessage(error), account: context.account, source: "direct-supabase" };
  }
}

export async function loadDirectB2cFormsPageData({ formId = "" } = {}) {
  const context = await directB2cContext(["Customer Database", "Customer Form", "B2C"]);
  if (!context) return null;
  if (!context.ok) return context;
  try {
    const cleanFormId = text(formId, 60);
    const [payload, selected] = await Promise.all([
      b2cFormsPayload(),
      cleanFormId ? b2cFormDetail(cleanFormId) : Promise.resolve(null),
    ]);
    return {
      ok: true,
      status: 200,
      account: context.account,
      payload,
      selected,
      warnings: [],
      source: "direct-supabase",
    };
  } catch (error) {
    return { ok: false, status: Number(error?.status) || 500, error: b2cErrorMessage(error), account: context.account, source: "direct-supabase" };
  }
}

export async function loadDirectB2cTablePageData(databaseId) {
  const context = await directB2cContext(["Customer Database", "B2C"]);
  if (!context) return null;
  if (!context.ok) return context;
  try {
    return {
      ok: true,
      status: 200,
      account: context.account,
      payload: await b2cTablePayload(databaseId),
      warnings: [],
      source: "direct-supabase",
    };
  } catch (error) {
    return { ok: false, status: Number(error?.status) || 500, error: b2cErrorMessage(error), account: context.account, source: "direct-supabase" };
  }
}
