import "server-only";

import { supabaseRequest } from "./supabase-rest";

const SCHEMA_TTL_MS = 5 * 60_000;
let schemaCache = null;
let schemaCacheAt = 0;
let schemaInflight = null;

function text(value) {
  return String(value ?? "").trim();
}

function cleanTableName(value) {
  const table = text(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(table) ? table : "";
}

function envTable(names, fallback) {
  for (const name of names) {
    const value = cleanTableName(process.env[name]);
    if (value) return value;
  }
  return cleanTableName(fallback);
}

function serializeCatalogItem(item = {}) {
  return {
    key: text(item.key),
    pageName: text(item.pageName),
    tableName: cleanTableName(item.tableName),
    moduleName: text(item.moduleName),
    icon: text(item.icon) || "database",
    description: text(item.description),
    sensitive: Boolean(item.sensitive),
  };
}

export function backupCatalog() {
  const raw = [
    { key: "orders", pageName: "Orders", tableName: envTable(["SUPABASE_ORDERS_TABLE"], "orders"), moduleName: "Orders", icon: "shopping-cart", description: "Current, operations, review, maintenance, and created order records." },
    { key: "stocktaking", pageName: "Stocktaking", tableName: envTable(["SUPABASE_STOCKTAKING_TABLE"], "stocktaking"), moduleName: "Inventory", icon: "archive", description: "Inventory and stocktaking records." },
    { key: "products", pageName: "Products", tableName: envTable(["SUPABASE_PRODUCTS_TABLE"], "products"), moduleName: "Inventory", icon: "package", description: "Products and components records." },
    { key: "product-tags", pageName: "Product Tags", tableName: envTable(["SUPABASE_PRODUCT_TAGS_TABLE", "SUPABASE_PRODUCTS_TAGS_TABLE"], "product_tags"), moduleName: "Inventory", icon: "tag", description: "Product tags and grouping data." },
    { key: "events", pageName: "Events", tableName: envTable(["SUPABASE_EVENTS_TABLE"], "events"), moduleName: "Events", icon: "calendar", description: "Event execution requests, project requirements, marketing materials, and venue details." },
    { key: "event-components", pageName: "Event Components", tableName: envTable(["SUPABASE_EVENT_COMPONENTS_TABLE"], "event_components"), moduleName: "Events", icon: "box", description: "Independent catalog of event projects, marketing materials, venue equipment, and other event components." },
    { key: "event-types", pageName: "Event Types", tableName: envTable(["SUPABASE_EVENT_TYPES_TABLE"], "event_type_catalog"), moduleName: "Events", icon: "tag", description: "Reusable custom event types created from the Events request form." },
    { key: "event-component-categories", pageName: "Event Component Categories", tableName: envTable(["SUPABASE_EVENT_COMPONENT_CATEGORIES_TABLE"], "event_component_category_catalog"), moduleName: "Events", icon: "layers", description: "Reusable custom categories created from the Event Components form." },
    { key: "event-governorate-transport-rates", pageName: "Governorate Transport Rates", tableName: envTable(["SUPABASE_EVENTS_GOVERNORATE_RATES_TABLE"], "event_governorate_transport_rates"), moduleName: "Events", icon: "map-pin", description: "Approximate round-trip transport cost settings for every governorate or area used in event estimates.", sensitive: true },
    { key: "expenses", pageName: "Expenses", tableName: envTable(["SUPABASE_EXPENSES_TABLE"], "expenses"), moduleName: "Finance", icon: "dollar-sign", description: "Cash in, cash out, and expense transactions." },
    { key: "b2b-schools", pageName: "B2B Schools", tableName: envTable(["SUPABASE_B2B_SCHOOLS_TABLE"], "b2b_schools"), moduleName: "B2B", icon: "folder", description: "B2B school folders and school data." },
    { key: "b2c-databases", pageName: "B2C Data Tables", tableName: envTable(["SUPABASE_B2C_DATABASES_TABLE"], "b2c_databases"), moduleName: "B2C", icon: "database", description: "Independent B2C database table definitions." },
    { key: "b2c-customer-fields", pageName: "B2C Customer Fields", tableName: envTable(["SUPABASE_B2C_CUSTOMER_FIELDS_TABLE"], "b2c_customer_fields"), moduleName: "B2C", icon: "columns", description: "Per-table property definitions and Notion-style field settings." },
    { key: "b2c-customers", pageName: "B2C Records", tableName: envTable(["SUPABASE_B2C_CUSTOMERS_TABLE"], "b2c_customers"), moduleName: "B2C", icon: "users", description: "B2C records stored in the selected data table." },
    { key: "b2c-forms", pageName: "B2C Forms", tableName: envTable(["SUPABASE_B2C_FORMS_TABLE"], "b2c_forms"), moduleName: "B2C", icon: "clipboard", description: "Forms linked to B2C data tables." },
    { key: "b2c-form-fields", pageName: "B2C Form Builder Fields", tableName: envTable(["SUPABASE_B2C_FORM_FIELDS_TABLE"], "b2c_form_fields"), moduleName: "B2C", icon: "sliders", description: "Per-form order, required rules, and conditional visibility settings." },
    { key: "proposals", pageName: "Proposals", tableName: envTable(["SUPABASE_PRODUCT_PROPOSALS_TABLE"], "product_proposals"), moduleName: "Proposals", icon: "file-text", description: "Saved proposal folders." },
    { key: "proposal-items", pageName: "Proposal Items", tableName: envTable(["SUPABASE_PRODUCT_PROPOSAL_ITEMS_TABLE"], "product_proposal_items"), moduleName: "Proposals", icon: "list", description: "Components saved inside proposals." },
    { key: "kits", pageName: "Kits", tableName: envTable(["SUPABASE_PRODUCT_KITS_TABLE"], "product_kits"), moduleName: "Proposals", icon: "briefcase", description: "Saved kit folders." },
    { key: "kit-items", pageName: "Kit Items", tableName: envTable(["SUPABASE_PRODUCT_KIT_ITEMS_TABLE"], "product_kit_items"), moduleName: "Proposals", icon: "layers", description: "Components saved inside kits." },
    { key: "department-tickets", pageName: "Department Tickets", tableName: envTable(["SUPABASE_DEPARTMENT_TICKETS_TABLE"], "department_tickets"), moduleName: "Task Management", icon: "git-branch", description: "Cross-department workflow tickets and their overall request details." },
    { key: "department-ticket-sections", pageName: "Department Ticket Sections", tableName: envTable(["SUPABASE_DEPARTMENT_TICKET_SECTIONS_TABLE"], "department_ticket_sections"), moduleName: "Task Management", icon: "git-pull-request", description: "Department workflow blocks attached to each ticket." },
    { key: "department-ticket-section-edges", pageName: "Department Ticket Workflow Arrows", tableName: envTable(["SUPABASE_DEPARTMENT_TICKET_EDGES_TABLE"], "department_ticket_section_edges"), moduleName: "Task Management", icon: "git-merge", description: "Workflow arrow connections and block prerequisites for department tickets." },
    { key: "kpi-standards", pageName: "KPI Standards", tableName: "kpi_standards", moduleName: "KPIs", icon: "target", description: "KPI standard headers." },
    { key: "kpi-sections", pageName: "KPI Sections", tableName: "kpi_standard_sections", moduleName: "KPIs", icon: "columns", description: "KPI standard sections." },
    { key: "kpi-items", pageName: "KPI Items", tableName: "kpi_standard_items", moduleName: "KPIs", icon: "list", description: "KPI standard subsections/items." },
    { key: "kpi-reviews", pageName: "KPI Reviews", tableName: "kpi_employee_reviews", moduleName: "KPIs", icon: "trending-up", description: "Employee monthly KPI reviews." },
    { key: "kpi-scores", pageName: "KPI Scores", tableName: "kpi_employee_scores", moduleName: "KPIs", icon: "bar-chart-2", description: "Employee KPI score rows." },
    { key: "team-members", pageName: "Team Members", tableName: envTable(["SUPABASE_TEAM_MEMBERS_TABLE"], "team_members"), moduleName: "Users Center", icon: "users", description: "User profiles, access data, and account information.", sensitive: true },
    { key: "team-departments", pageName: "Team Departments", tableName: envTable(["SUPABASE_TEAM_MEMBER_DEPARTMENTS_TABLE"], "team_member_departments"), moduleName: "Users Center", icon: "folder", description: "Department folders." },
    { key: "team-sv-schools", pageName: "Team S.V Schools", tableName: envTable(["SUPABASE_TEAM_MEMBER_SV_SCHOOLS_TABLE"], "team_member_sv_schools"), moduleName: "Users Center", icon: "award", description: "Supervisor school visibility assignments." },
    { key: "page-access", pageName: "Page Access", tableName: "team_member_page_access", moduleName: "Users Center", icon: "shield", description: "Per-user page access permissions.", sensitive: true },
    { key: "signup-requests", pageName: "Sign up Requests", tableName: envTable(["SUPABASE_SIGNUP_REQUESTS_TABLE"], "team_member_signup_requests"), moduleName: "Users Center", icon: "user-plus", description: "Pending, approved, and rejected account requests." },
    { key: "history", pageName: "History", tableName: envTable(["SUPABASE_HISTORY_TABLE"], "operation_history"), moduleName: "System", icon: "clock", description: "System audit/history records.", sensitive: true },
  ];

  const seen = new Set();
  return raw
    .map(serializeCatalogItem)
    .filter((item) => item.key && item.tableName)
    .filter((item) => {
      const unique = `${item.key}:${item.tableName}`;
      if (seen.has(unique)) return false;
      seen.add(unique);
      return true;
    });
}

export function findBackupTable(key) {
  const clean = text(key);
  return backupCatalog().find((item) => item.key === clean) || null;
}

function normalizeColumnInfo(name, raw = {}) {
  const columnName = text(name);
  if (!columnName) return null;
  const type = text(raw?.type || raw?.format || raw?.["x-postgrest-type"] || raw?.["x-pg-type"]).toLowerCase();
  const format = text(raw?.format).toLowerCase();
  return { name: columnName, type, format, raw: raw || {} };
}

function extractSchemaColumns(openApi, tableName) {
  if (!openApi || typeof openApi !== "object") return [];
  const table = text(tableName).toLowerCase();
  if (!table) return [];
  const schemas = {
    ...(openApi.definitions && typeof openApi.definitions === "object" ? openApi.definitions : {}),
    ...(openApi.components?.schemas && typeof openApi.components.schemas === "object" ? openApi.components.schemas : {}),
  };
  const match = Object.entries(schemas).find(([key]) => String(key).toLowerCase() === table)
    || Object.entries(schemas).find(([key]) => String(key).toLowerCase() === `public.${table}`)
    || Object.entries(schemas).find(([key]) => String(key).toLowerCase().replace(/^public[._]/, "") === table);
  const props = match?.[1]?.properties;
  if (!props || typeof props !== "object") return [];
  return Object.entries(props).map(([name, raw]) => normalizeColumnInfo(name, raw)).filter(Boolean);
}

async function openApiSchema() {
  const now = Date.now();
  if (schemaCache && now - schemaCacheAt < SCHEMA_TTL_MS) return schemaCache;
  if (schemaInflight) return await schemaInflight;

  const pending = supabaseRequest("/", { timeoutMs: 8_000, attempts: 1 })
    .then((value) => (value && typeof value === "object" ? value : null))
    .catch(() => null);
  schemaInflight = pending;
  try {
    schemaCache = await pending;
    schemaCacheAt = Date.now();
    return schemaCache;
  } finally {
    if (schemaInflight === pending) schemaInflight = null;
  }
}

function inferredColumnType(rows = [], name = "") {
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = row?.[name];
    if (value === null || typeof value === "undefined") continue;
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "json";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    return "text";
  }
  return "";
}

function columnsFromRows(rows = []) {
  const names = [];
  const seen = new Set();
  const sample = (Array.isArray(rows) ? rows : []).slice(0, 20);
  for (const row of sample) {
    for (const key of Object.keys(row || {})) {
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(key);
    }
  }
  return names.map((name) => normalizeColumnInfo(name, { type: inferredColumnType(sample, name) })).filter(Boolean);
}

async function tableColumns(tableName, rows = []) {
  // Populated tables already expose their columns in the first page. Prefer
  // that cheap path and only request the much larger PostgREST OpenAPI schema
  // for an empty table where there is no row shape to infer.
  const inferred = columnsFromRows(rows);
  if (inferred.length) return inferred;
  const schema = await openApiSchema();
  return extractSchemaColumns(schema, tableName);
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function builtInAdmin(account = {}) {
  return token(account.name || account.username) === "admin" || token(account.position).includes("admin");
}

function backupAccessLevel(account = {}) {
  if (builtInAdmin(account)) return "admin";
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  let best = "";
  const rank = { view: 1, edit: 2, admin: 3 };
  for (const row of rows) {
    if (row?.isEnabled === false) continue;
    const candidates = [row.pageName, row.pageKey, row.routePath, ...(Array.isArray(row.aliases) ? row.aliases : [])]
      .map(token)
      .filter(Boolean);
    if (!candidates.some((value) => ["backup", "backups", "database", "systemdatabase", "systembackup"].includes(value))) continue;
    const raw = text(row.accessLevel || row.access_level).toLowerCase();
    const level = raw === "admin" ? "admin" : raw === "view" ? "view" : "edit";
    if (!best || rank[level] > rank[best]) best = level;
  }
  if (best) return best;
  const allowed = Array.isArray(account?.allowedPages) ? account.allowedPages.map(token) : [];
  return allowed.some((value) => ["backup", "backups", "database", "systemdatabase", "systembackup"].includes(value)) ? "edit" : "";
}

export function backupCanEdit(account = {}) {
  return backupAccessLevel(account) === "admin";
}

export async function loadBackupTableRows(key, { limit = 50, offset = 0, account = null } = {}) {
  const item = findBackupTable(key);
  if (!item) {
    const error = new Error("Backup table was not found.");
    error.status = 404;
    throw error;
  }

  const safeLimit = Math.max(10, Math.min(200, Number.parseInt(limit, 10) || 50));
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const query = new URLSearchParams({ select: "*", limit: String(safeLimit + 1), offset: String(safeOffset) });
  const payload = await supabaseRequest(`/${encodeURIComponent(item.tableName)}?${query.toString()}`, { timeoutMs: 12_000 });
  const list = Array.isArray(payload) ? payload : [];
  const hasMore = list.length > safeLimit;
  const rows = hasMore ? list.slice(0, safeLimit) : list;
  const columns = await tableColumns(item.tableName, rows);
  const accessLevel = backupAccessLevel(account || {});

  return {
    ok: true,
    source: "supabase",
    table: item,
    columns,
    rows,
    offset: safeOffset,
    limit: safeLimit,
    hasMore,
    canEdit: accessLevel === "admin",
    accessLevel,
  };
}
