import "server-only";

import B2CFormulaEngine from "./b2c-formula-engine";
import { getDirectSessionAccountGate } from "./direct-session-account";
import { select, selectById } from "./supabase-rest";

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

export async function directB2cContext(requiredPages = ["Customer Database", "Customer Form", "B2C"]) {
  const gate = await getDirectSessionAccountGate(requiredPages);
  if (!gate) return null;
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status || 403,
      error: gate.error || "B2C access is not allowed for this account.",
      account: gate.account || null,
      memberId: gate.memberId || "",
      source: "direct-session",
    };
  }
  return {
    ok: true,
    status: 200,
    error: "",
    account: gate.account,
    memberId: gate.memberId || "",
    source: "direct-session",
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
    const [databaseRaw, fields, bindingRows] = await Promise.all([
      selectById(databasesTable(), form.databaseId),
      loadFields(form.databaseId, { force }),
      loadFormBindings(form.id, { force }),
    ]);
    if (!databaseRaw) return null;
    const database = serializeDatabase(databaseRaw);
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
    const defaultForm = forms.find((form) => form.isDefault) || forms[0] || null;
    if (!defaultForm) {
      const error = new Error("This B2C table needs its default form initialized by the compatibility service.");
      error.code = "B2C_DEFAULT_FORM_REQUIRED";
      error.status = 409;
      throw error;
    }
    return {
      ok: true,
      source: "direct-supabase",
      database: { ...database, defaultFormId: defaultForm.id },
      fields,
      records: rawRecords.map((record) => attachFormulaValues(record, fields)),
    };
  }, { force });
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
