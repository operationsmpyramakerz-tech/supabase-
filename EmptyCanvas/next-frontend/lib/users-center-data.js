import "server-only";
import { select, selectAll, selectById } from "./supabase-rest";
import { measurePerformance } from "./performance-profiler";

const DIRECTORY_TTL_MS = 20_000;
const SIGNUP_TTL_MS = 10_000;
const PAGES_TTL_MS = 60_000;
const TEAM_SCHEMA_TTL_MS = 5 * 60_000;

let directoryCache = null;
let directoryInflight = null;
let appPagesCache = null;
let appPagesInflight = null;
const signupCache = new Map();
const signupInflight = new Map();
let teamSchemaCache = null;
let teamSchemaInflight = null;
let compactDirectoryProjectionSupported = null;
let compactTeamRowsCache = null;
let compactTeamRowsInflight = null;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (value.url) return String(value.url || "").trim();
    if (value.name) return String(value.name || "").trim();
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canon(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

function valueFor(row, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
  }
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(canon(key))) return value;
  }
  return null;
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

function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const clean = text(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function splitValues(value) {
  if (Array.isArray(value)) return unique(value.flatMap(splitValues));
  if (value && typeof value === "object") return unique([text(value)]);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return unique(parsed.flatMap(splitValues));
  } catch {}
  return unique(raw.split(/[\n,]+/).map((item) => item.trim()));
}

function extractUrl(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    return extractUrl(value.url || value.publicUrl || value.public_url || value.href || value.external?.url || value.file?.url || "");
  }
  const raw = text(value);
  if (!raw || /^null$/i.test(raw)) return "";
  try {
    const parsed = JSON.parse(raw);
    const found = extractUrl(parsed);
    if (found) return found;
  } catch {}
  const match = raw.match(/https?:\/\/[^\s,"'<>]+/i);
  return match ? match[0] : "";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function departmentsTable() {
  return text(process.env.SUPABASE_TEAM_MEMBER_DEPARTMENTS_TABLE) || "team_member_departments";
}

function svAccessTable() {
  return text(process.env.SUPABASE_TEAM_MEMBER_SV_SCHOOLS_TABLE) || "team_member_sv_schools";
}

function signupRequestsTable() {
  return text(process.env.SUPABASE_SIGNUP_REQUESTS_TABLE) || "team_member_signup_requests";
}

function departmentKey(value) {
  return canon(text(value) || "No Department") || "nodepartment";
}

function dateText(value) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  try {
    return parsed.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return parsed.toISOString();
  }
}

function exactColumnKey(row = {}, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return alias;
  }
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  for (const key of Object.keys(source)) {
    if (wanted.has(canon(key))) return key;
  }
  return "";
}

function selectIdentifier(value) {
  const key = text(value);
  if (!key) return "";
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  return `"${key.replace(/"/g, '""')}"`;
}

async function teamSchemaSample({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && teamSchemaCache?.expiresAt > now) return teamSchemaCache.value;
  if (!fresh && teamSchemaInflight) return await teamSchemaInflight;

  const pending = select(teamMembersTable(), {
    select: "*",
    limit: "1",
  }, { profileName: "users-center.member-schema-sample" }).then((rows) => Array.isArray(rows) ? rows[0] || null : null);

  if (!fresh) teamSchemaInflight = pending;
  try {
    const row = await pending;
    teamSchemaCache = { value: row, expiresAt: Date.now() + TEAM_SCHEMA_TTL_MS };
    return row;
  } finally {
    if (teamSchemaInflight === pending) teamSchemaInflight = null;
  }
}

function compactDirectorySelect(sample = {}) {
  const groups = [
    ["id", "ID"],
    ["name", "Name", "full_name", "username"],
    ["department", "Department"],
    ["position", "Position", "role"],
    ["phone", "Phone", "mobile"],
    ["email", "Email", "mail"],
    ["employee_code", "employeeCode", "Employee Code", "code"],
    ["profile_picture", "Profile picture", "Profile Picture", "Profile Photo", "Profile photo", "profile_picture_url", "profile_photo", "profile_photo_url", "photo", "photo_url", "avatar", "avatar_url", "image", "image_url", "picture", "picture_url"],
    ["school", "School", "school_name", "School Name", "stocktaking_column", "Stocktaking Column", "done_column", "Done Column"],
    ["allowed_pages", "Allowed Pages", "Pages", "pages", "access_pages"],
    ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"],
    ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"],
  ];
  const keys = unique(groups.map((aliases) => exactColumnKey(sample, aliases)).filter(Boolean));
  const idKey = exactColumnKey(sample, ["id", "ID"]);
  const nameKey = exactColumnKey(sample, ["name", "Name", "full_name", "username"]);
  if (!idKey || !nameKey) return "";
  return keys.map(selectIdentifier).filter(Boolean).join(",");
}

async function loadCompactTeamRows({ fresh = false } = {}) {
  if (fresh) compactTeamRowsCache = null;
  const now = Date.now();
  if (!fresh && compactTeamRowsCache?.expiresAt > now) return compactTeamRowsCache.value;
  if (!fresh && compactTeamRowsInflight) return await compactTeamRowsInflight;

  const pending = (async () => {
    const sample = await teamSchemaSample({ fresh: false }).catch(() => null);
    const selectExpr = sample ? compactDirectorySelect(sample) : "";
    let rows = null;

    if (selectExpr && compactDirectoryProjectionSupported !== false) {
      try {
        rows = await selectAll(teamMembersTable(), {
          limit: 5000,
          select: selectExpr,
          profileName: "users-center.members-compact",
        });
        compactDirectoryProjectionSupported = true;
      } catch {
        compactDirectoryProjectionSupported = false;
      }
    }

    if (!Array.isArray(rows)) {
      rows = await selectAll(teamMembersTable(), {
        limit: 5000,
        profileName: "users-center.members-full-fallback",
      });
    }

    return { rows: Array.isArray(rows) ? rows : [], schemaSample: sample };
  })();

  if (!fresh) compactTeamRowsInflight = pending;
  try {
    const value = await pending;
    compactTeamRowsCache = { value, expiresAt: Date.now() + DIRECTORY_TTL_MS };
    return value;
  } finally {
    if (compactTeamRowsInflight === pending) compactTeamRowsInflight = null;
  }
}

const FIELD_ORDER = [
  "Profile picture",
  "Employee Code",
  "Name",
  "Password",
  "Phone",
  "Email",
  "Department",
  "Position",
  "Files & media",
  "S.V Schools",
  "Allowed Pages",
  "School",
];

function allKeys(rows = []) {
  const set = new Set();
  for (const row of rows) Object.keys(row || {}).forEach((key) => set.add(key));
  return Array.from(set);
}

function nonEditableColumn(key) {
  return [
    "id",
    "createdat",
    "updatedat",
    "importedat",
    "lasteditedtime",
    "createdtime",
    "isactive",
    "svschoolsraw",
    "svschoolsnotionurls",
    "svschoolmemberids",
    "svschoolmembernames",
    "svschoolsunmatched",
  ].includes(canon(key));
}

function labelForColumn(key) {
  const known = {
    id: "ID",
    createdat: "Created time",
    updatedat: "Updated time",
    department: "Department",
    name: "Name",
    phone: "Phone",
    school: "School",
    password: "Password",
    allowedpages: "Allowed Pages",
    svschools: "S.V Schools",
    position: "Position",
    profilepicture: "Profile picture",
    filesmedia: "Files & media",
    employeecode: "Employee Code",
    email: "Email",
  };
  if (known[canon(key)]) return known[canon(key)];
  return text(key).replace(/_/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function fieldType(label) {
  const key = canon(label);
  if (key === "name") return "title";
  if (key === "email") return "email";
  if (key === "phone") return "phone_number";
  if (key === "school") return "school_select";
  if (key === "allowedpages") return "ua_page_access_manager";
  if (key === "svschools") return "ua_sv_access_manager";
  if (key === "profilepicture") return "ua_profile_upload";
  if (key === "filesmedia") return "ua_file_links";
  if (key === "employeecode") return "text";
  if (key === "position") return "text";
  return "rich_text";
}

function orderedEditableFields(rows = [], context = {}) {
  const keys = allKeys(rows).filter((key) => !nonEditableColumn(key));
  const ordered = [];
  for (const preferred of FIELD_ORDER) {
    const found = keys.find((key) => canon(key) === canon(preferred));
    if (found && !ordered.includes(found)) ordered.push(found);
  }
  for (const key of keys) if (!ordered.includes(key)) ordered.push(key);
  if (!ordered.some((key) => canon(key) === "allowedpages")) {
    const passwordIndex = ordered.findIndex((key) => canon(key) === "password");
    ordered.splice(passwordIndex >= 0 ? passwordIndex + 1 : Math.min(ordered.length, 5), 0, "Allowed Pages");
  }

  const departments = Array.isArray(context.departments) ? context.departments : [];
  const optionRows = Array.isArray(context.optionRows) && context.optionRows.length ? context.optionRows : rows;
  const positions = unique(optionRows.map((row) => valueFor(row, ["Position", "position", "role"]))).sort((a, b) => a.localeCompare(b));
  const schools = unique(optionRows.map((row) => valueFor(row, ["School", "school", "school_name", "Stocktaking Column", "stocktaking_column", "Done Column", "done_column"]))).sort((a, b) => a.localeCompare(b));
  const memberNames = unique(optionRows.map((row) => valueFor(row, ["Name", "name", "full_name", "username"]))).sort((a, b) => a.localeCompare(b));
  const pages = Array.isArray(context.pages) ? context.pages : [];

  return ordered.map((sourceColumn) => {
    const name = labelForColumn(sourceColumn);
    const key = canon(name);
    const field = {
      name,
      type: fieldType(name),
      required: key === "name",
      sourceColumn,
    };
    if (key === "department") field.options = departments;
    if (key === "position") field.options = positions;
    if (key === "school") field.options = schools;
    if (key === "allowedpages") {
      field.options = unique(pages.flatMap((page) => pageAliases(page)));
      field.pageOptions = pages;
      field.allowCustom = false;
    }
    if (key === "svschools") {
      field.options = memberNames;
      field.allowCustom = false;
    }
    return field;
  });
}

function valueForLabel(row, label) {
  const key = canon(label);
  const aliases = [label];
  if (key === "name") aliases.push("Name", "name", "full_name", "username");
  if (key === "department") aliases.push("Department", "department");
  if (key === "phone") aliases.push("Phone", "phone", "mobile");
  if (key === "school") aliases.push("School", "school", "school_name", "School Name", "stocktaking_column", "Stocktaking Column", "done_column", "Done Column");
  if (key === "password") aliases.push("Password", "password", "passcode", "pin");
  if (key === "allowedpages") aliases.push("Allowed Pages", "allowed_pages", "Pages", "pages", "access_pages");
  if (key === "svschools") aliases.push("S.V Schools", "sv_schools", "SV Schools", "schools");
  if (key === "position") aliases.push("Position", "position", "role");
  if (key === "profilepicture") aliases.push("Profile picture", "Profile Picture", "Profile Photo", "Profile photo", "profile_picture", "profile_picture_url", "profile_photo", "profile_photo_url", "photo", "photo_url", "avatar", "avatar_url", "image", "image_url", "picture", "picture_url");
  if (key === "coverphoto") aliases.push("Cover photo", "Cover Photo", "Cover Image", "cover_photo", "cover_photo_url", "cover_image", "cover_image_url", "cover", "cover_url", "banner", "banner_url", "profile_cover", "profile_cover_url");
  if (key === "filesmedia") aliases.push("Files & media", "files_media", "files", "media");
  if (key === "employeecode") aliases.push("Employee Code", "employee_code", "code");
  if (key === "email") aliases.push("Email", "email", "mail");
  return valueFor(row, aliases);
}

function serializeMember(row = {}, editableFields = []) {
  const name = text(valueForLabel(row, "Name")) || "Unnamed";
  const department = text(valueForLabel(row, "Department")) || "No Department";
  const position = text(valueForLabel(row, "Position")) || "Team Member";
  const fields = editableFields.map((field) => {
    const raw = valueForLabel(row, field.name);
    const value = text(raw);
    const fileUrl = field.type === "files" ? extractUrl(raw) : "";
    return {
      label: field.name,
      type: field.type || "rich_text",
      value,
      files: fileUrl ? [{ name: field.name, url: fileUrl }] : [],
      relationIds: [],
      fileUrls: fileUrl ? [fileUrl] : [],
    };
  });

  return {
    id: text(valueFor(row, ["id", "ID"])),
    url: "",
    name,
    department,
    departmentKey: departmentKey(department),
    position,
    phone: text(valueForLabel(row, "Phone")),
    email: text(valueForLabel(row, "Email")),
    employeeCode: text(valueForLabel(row, "Employee Code")),
    photoUrl: extractUrl(valueForLabel(row, "Profile picture")),
    coverPhotoUrl: extractUrl(valueForLabel(row, "Cover photo")),
    createdTime: dateText(valueFor(row, ["created_at", "Created time", "created_time"])),
    lastEditedTime: dateText(valueFor(row, ["updated_at", "Updated time", "last_edited_time"])),
    fields,
    source: "supabase-next",
  };
}

function serializeMemberSummary(row = {}) {
  const name = text(valueForLabel(row, "Name")) || "Unnamed";
  const department = text(valueForLabel(row, "Department")) || "No Department";
  const legacySvIds = splitValues(valueFor(row, ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"]));
  const legacySvNames = splitValues(valueFor(row, ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"]));
  return {
    id: text(valueFor(row, ["id", "ID"])),
    url: "",
    name,
    department,
    departmentKey: departmentKey(department),
    position: text(valueForLabel(row, "Position")) || "Team Member",
    phone: text(valueForLabel(row, "Phone")),
    email: text(valueForLabel(row, "Email")),
    employeeCode: text(valueForLabel(row, "Employee Code")),
    photoUrl: extractUrl(valueForLabel(row, "Profile picture")),
    pageAccessSummary: { allowedPages: [], accessCount: 0, adminCount: 0 },
    svAccessSummary: { enabledCount: Math.max(legacySvIds.length, legacySvNames.length) },
    legacyAllowedPages: splitValues(valueForLabel(row, "Allowed Pages")),
    source: "supabase-next-compact",
  };
}

function pageAliases(page = {}) {
  const key = text(page.pageKey || page.page_key).toLowerCase();
  const name = text(page.pageName || page.page_name || page.name);
  const route = text(page.routePath || page.route_path);
  const out = [name, key, route];
  const mapped = {
    "current-orders": ["Current Orders"],
    "operations-orders": ["Requested Orders", "Operations Orders", "Schools Requested Orders"],
    "maintenance-orders": ["Maintenance Orders"],
    "shopping-cart": ["Create New Order", "Shopping Cart"],
    stocktaking: ["Stocktaking"],
    products: ["Products"],
    proposals: ["Proposals"],
    "product-proposals": ["Proposals"],
    kits: ["Kits"],
    "product-kits": ["Kits"],
    "orders-review": ["Orders Review"],
    expenses: ["Expenses"],
    "expenses-users": ["Expenses Users"],
    b2b: ["B2B"],
    "task-management": ["Task Management"],
    "task-management-all-tasks": ["All Tasks", "Task Management"],
    "all-tasks": ["All Tasks", "Task Management"],
    "task-management-my-tasks": ["My Tasks", "Task Management"],
    "my-tasks": ["My Tasks", "Task Management"],
    "task-management-delegated-tasks": ["Delegated Tasks", "Task Management"],
    "delegated-tasks": ["Delegated Tasks", "Task Management"],
    events: ["Events"],
    "event-calendar": ["Event Calendar", "Events"],
    "events-calendar": ["Event Calendar", "Events"],
    "event-requests": ["Event Requests", "Events"],
    "event-components": ["Event Components", "Events"],
    b2c: ["B2C"],
    "b2c-customer-database": ["Customer Database", "B2C"],
    "customer-database": ["Customer Database", "B2C"],
    "b2c-customer-form": ["Customer Form", "B2C"],
    "customer-form": ["Customer Form", "B2C"],
    kpis: ["KPIs"],
    history: ["History"],
    backup: ["Backup"],
    database: ["Backup"],
    "users-center": ["Users Center", "User Access & Data", "User Access", "Team Members"],
    "user-access-data": ["Users Center", "User Access & Data", "User Access", "Team Members"],
  };
  out.push(...(mapped[key] || []));
  if (["users center", "user access & data", "user access", "team members"].includes(name.toLowerCase())) {
    out.push("Users Center", "User Access & Data", "User Access", "Team Members");
  }
  return unique(out);
}

function serializeAppPage(row = {}) {
  const id = text(valueFor(row, ["id", "page_id", "ID"]));
  const pageKey = text(valueFor(row, ["page_key", "pageKey"]));
  let pageName = text(valueFor(row, ["page_name", "pageName", "name"]));
  const routePath = text(valueFor(row, ["route_path", "routePath"]));
  const moduleName = text(valueFor(row, ["module_name", "moduleName"])) || "General";
  const keyToken = pageKey.toLowerCase();
  const nameToken = pageName.toLowerCase();
  if (["user-access-data", "user-access", "users-center", "users-centre", "team-members"].includes(keyToken) || ["user access & data", "user access", "users center", "users centre", "team members"].includes(nameToken) || routePath.toLowerCase().replace(/\/+$/, "") === "/user-access") {
    pageName = "Users Center";
  }
  return {
    id,
    pageId: id,
    pageKey,
    pageName,
    routePath,
    routePattern: text(valueFor(row, ["route_pattern", "routePattern"])),
    moduleName,
    parentPageKey: text(valueFor(row, ["parent_page_key", "parentPageKey"])),
    sortOrder: Number(valueFor(row, ["sort_order", "sortOrder"]) || 100),
    isActive: bool(valueFor(row, ["is_active", "isActive"]), true),
    isAssignable: bool(valueFor(row, ["is_assignable", "isAssignable"]), true),
    visibleInSidebar: bool(valueFor(row, ["visible_in_sidebar", "visibleInSidebar"]), true),
  };
}

export async function usersCenterAppPages({ fresh = false, assignableOnly = true } = {}) {
  const now = Date.now();
  if (!fresh && appPagesCache?.expiresAt > now) {
    return assignableOnly ? appPagesCache.value.filter((page) => page.isAssignable && page.isActive) : appPagesCache.value;
  }
  if (!fresh && appPagesInflight) {
    const rows = await appPagesInflight;
    return assignableOnly ? rows.filter((page) => page.isAssignable && page.isActive) : rows;
  }

  const pending = (async () => {
    let rows;
    try {
      rows = await selectAll("app_pages", {
        limit: 1000,
        order: "sort_order.asc",
        select: "id,page_key,page_name,route_path,route_pattern,module_name,parent_page_key,sort_order,is_active,is_assignable,visible_in_sidebar",
        profileName: "users-center.app-pages-compact",
      });
    } catch {
      rows = await selectAll("app_pages", { limit: 1000, order: "sort_order.asc", profileName: "users-center.app-pages-fallback" });
    }
    return (rows || [])
      .map(serializeAppPage)
      .filter((page) => {
        if (!page.id || !page.pageKey || !page.pageName) return false;
        const key = page.pageKey.toLowerCase();
        const route = page.routePath.toLowerCase();
        const moduleName = page.moduleName.toLowerCase();
        return !key.startsWith("lms-") && key !== "lms" && !route.startsWith("/lms") && moduleName !== "lms";
      });
  })();
  appPagesInflight = pending;
  try {
    const pages = await pending;
    appPagesCache = { value: pages, expiresAt: Date.now() + PAGES_TTL_MS };
    return assignableOnly ? pages.filter((page) => page.isAssignable && page.isActive) : pages;
  } finally {
    if (appPagesInflight === pending) appPagesInflight = null;
  }
}

function normalizeAccessLevel(value) {
  const raw = text(value).toLowerCase();
  return raw === "admin" ? "admin" : raw === "view" ? "view" : "edit";
}

function joinAccessRows(pages = [], accessRows = [], { includeDisabled = false } = {}) {
  const byPageId = new Map(pages.map((page) => [text(page.pageId || page.id), page]).filter(([id]) => id));
  const accessByPageId = new Map();
  for (const row of accessRows) {
    const pageId = text(valueFor(row, ["page_id", "pageId"]));
    if (pageId) accessByPageId.set(pageId, row);
  }

  const result = [];
  if (includeDisabled) {
    for (const page of pages) {
      const access = accessByPageId.get(text(page.pageId)) || {};
      result.push({
        pageId: text(page.pageId),
        pageKey: text(page.pageKey),
        pageName: text(page.pageName) || "Page",
        moduleName: text(page.moduleName) || "General",
        routePath: text(page.routePath),
        sortOrder: Number(page.sortOrder || 100),
        accessLevel: normalizeAccessLevel(valueFor(access, ["access_level", "accessLevel"]) || "edit"),
        isEnabled: bool(valueFor(access, ["is_enabled", "isEnabled", "enabled"]), false),
      });
    }
    return result.sort((a, b) => (a.sortOrder - b.sortOrder) || a.pageName.localeCompare(b.pageName));
  }

  for (const access of accessRows) {
    if (!bool(valueFor(access, ["is_enabled", "isEnabled", "enabled"]), false)) continue;
    const pageId = text(valueFor(access, ["page_id", "pageId"]));
    const page = byPageId.get(pageId) || serializeAppPage(access);
    if (!pageId && !page.pageKey && !page.pageName) continue;
    result.push({
      pageId: pageId || text(page.pageId),
      pageKey: text(page.pageKey),
      pageName: text(page.pageName) || "Page",
      moduleName: text(page.moduleName) || "General",
      routePath: text(page.routePath),
      sortOrder: Number(page.sortOrder || 100),
      accessLevel: normalizeAccessLevel(valueFor(access, ["access_level", "accessLevel"]) || "edit"),
      isEnabled: true,
      aliases: pageAliases(page),
    });
  }
  return result.sort((a, b) => (a.sortOrder - b.sortOrder) || a.pageName.localeCompare(b.pageName));
}

function attachAccessSummary(member, pages = [], accessRows = []) {
  const enabled = joinAccessRows(pages, accessRows, { includeDisabled: false });
  const allowedPages = unique(enabled.flatMap((row) => row.aliases?.length ? row.aliases : [row.pageName]));
  if (!allowedPages.length) {
    allowedPages.push(...unique([
      ...(Array.isArray(member?.legacyAllowedPages) ? member.legacyAllowedPages : []),
      ...splitValues(valueForLabel(Object.fromEntries((member.fields || []).map((field) => [field.label, field.value])), "Allowed Pages")),
    ]));
  }
  member.pageAccessSummary = {
    allowedPages,
    accessCount: enabled.length || allowedPages.length,
    adminCount: enabled.filter((row) => row.accessLevel === "admin").length,
  };
  delete member.legacyAllowedPages;
  return member;
}

function departmentName(row = {}) {
  return text(valueFor(row, ["name", "department", "department_name", "Department", "Name"]));
}

function departmentPayload(name, extra = {}) {
  const clean = text(name) || "No Department";
  return {
    id: departmentKey(clean),
    name: clean,
    count: Number(extra.count || 0),
    members: Array.isArray(extra.members) ? extra.members : [],
    isCustomDepartment: !!extra.isCustomDepartment,
    departmentRecordId: text(extra.departmentRecordId),
  };
}

async function optionalSelectAll(table, options = []) {
  try {
    return await selectAll(table, options);
  } catch {
    return [];
  }
}

export async function usersCenterDirectory({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && directoryCache?.expiresAt > now) return directoryCache.value;
  if (!fresh && directoryInflight) return await directoryInflight;

  const load = async () => measurePerformance("users-center", "directory-load", async () => {
    const [teamBundle, departmentRows, pages, accessRows] = await Promise.all([
      loadCompactTeamRows({ fresh }),
      (async () => {
        try {
          return await selectAll(departmentsTable(), {
            limit: 1000,
            order: "name.asc",
            select: "id,name",
            profileName: "users-center.departments-compact",
          });
        } catch {
          return await optionalSelectAll(departmentsTable(), { limit: 1000, order: "name.asc", profileName: "users-center.departments-fallback" });
        }
      })(),
      usersCenterAppPages({ fresh, assignableOnly: false }).catch(() => []),
      (async () => {
        try {
          const rows = await select("team_member_page_access", {
            select: "team_member_id,page_id,access_level,is_enabled",
            limit: "5000",
          }, { profileName: "users-center.page-access-summary" });
          return Array.isArray(rows) ? rows : [];
        } catch {
          return await optionalSelectAll("team_member_page_access", { limit: 5000, profileName: "users-center.page-access-fallback" });
        }
      })(),
    ]);

    const teamRows = Array.isArray(teamBundle?.rows) ? teamBundle.rows : [];
    const schemaRows = teamBundle?.schemaSample ? [teamBundle.schemaSample] : teamRows.slice(0, 1);
    const knownDepartments = unique([
      ...departmentRows.map(departmentName),
      ...teamRows.map((row) => text(valueForLabel(row, "Department")) || "No Department"),
    ]).sort((a, b) => a.localeCompare(b));
    const editableFields = orderedEditableFields(schemaRows, {
      departments: knownDepartments,
      pages: pages.filter((page) => page.isActive && page.isAssignable),
      optionRows: teamRows,
    });

    const accessByMember = new Map();
    for (const access of accessRows) {
      const memberId = text(valueFor(access, ["team_member_id", "teamMemberId"]));
      if (!memberId) continue;
      if (!accessByMember.has(memberId)) accessByMember.set(memberId, []);
      accessByMember.get(memberId).push(access);
    }

    const members = teamRows.map((row) => {
      const member = serializeMemberSummary(row);
      return attachAccessSummary(member, pages, accessByMember.get(member.id) || []);
    }).filter((member) => member.id).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));

    const map = new Map();
    for (const row of departmentRows) {
      const name = departmentName(row);
      if (!name) continue;
      const payload = departmentPayload(name, {
        isCustomDepartment: true,
        departmentRecordId: valueFor(row, ["id", "ID"]),
      });
      if (!map.has(payload.id)) map.set(payload.id, payload);
    }
    for (const member of members) {
      const key = member.departmentKey || departmentKey(member.department);
      if (!map.has(key)) map.set(key, departmentPayload(member.department || "No Department"));
      const department = map.get(key);
      department.members.push(member);
      department.count += 1;
    }

    return {
      total: members.length,
      editableFields,
      departments: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)),
      source: "supabase-next",
      directoryFormat: "compact-v2",
    };
  }, { fresh });

  const pending = load();
  if (!fresh) directoryInflight = pending;
  try {
    const payload = await pending;
    directoryCache = { value: payload, expiresAt: Date.now() + DIRECTORY_TTL_MS };
    return payload;
  } finally {
    if (directoryInflight === pending) directoryInflight = null;
  }
}

function serializeSignupRequest(row = {}) {
  return {
    id: text(valueFor(row, ["id", "ID"])),
    username: text(valueFor(row, ["username", "name", "Name"])),
    employeeCode: text(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code"])),
    phone: text(valueFor(row, ["phone", "Phone"])),
    email: text(valueFor(row, ["email", "Email"])),
    status: text(valueFor(row, ["status"])) || "pending",
    department: text(valueFor(row, ["department", "Department"])),
    position: text(valueFor(row, ["position", "Position"])),
    reviewedBy: text(valueFor(row, ["reviewed_by", "reviewedBy"])),
    reviewedAt: text(valueFor(row, ["reviewed_at", "reviewedAt"])),
    createdAt: text(valueFor(row, ["created_at", "createdAt"])) || new Date().toISOString(),
  };
}

export async function usersCenterSignupRequests({ status = "pending", fresh = false } = {}) {
  const cleanStatus = text(status).toLowerCase() || "pending";
  const cacheKey = cleanStatus;
  const cached = signupCache.get(cacheKey);
  if (!fresh && cached?.expiresAt > Date.now()) return cached.value;
  if (!fresh && signupInflight.has(cacheKey)) return await signupInflight.get(cacheKey);

  const load = async () => {
    const base = { order: "created_at.desc", limit: "1000" };
    if (cleanStatus && cleanStatus !== "all") base.status = `eq.${cleanStatus}`;
    let rows;
    try {
      rows = await select(signupRequestsTable(), {
        ...base,
        select: "id,username,employee_code,phone,email,status,department,position,reviewed_by,reviewed_at,created_at",
      }, { profileName: "users-center.signup-requests-compact" });
    } catch {
      rows = await select(signupRequestsTable(), { ...base, select: "*" }, { profileName: "users-center.signup-requests-fallback" });
    }
    return { ok: true, requests: (Array.isArray(rows) ? rows : []).map(serializeSignupRequest), source: "supabase-next" };
  };

  const pending = load();
  if (!fresh) signupInflight.set(cacheKey, pending);
  try {
    const payload = await pending;
    signupCache.set(cacheKey, { value: payload, expiresAt: Date.now() + SIGNUP_TTL_MS });
    return payload;
  } finally {
    if (signupInflight.get(cacheKey) === pending) signupInflight.delete(cacheKey);
  }
}

export async function usersCenterPageAccess(memberId) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Missing team member ID.");
    error.status = 400;
    throw error;
  }
  const [pages, accessRows] = await Promise.all([
    usersCenterAppPages({ assignableOnly: true }),
    (async () => {
      try {
        const rows = await select("team_member_page_access", {
          select: "team_member_id,page_id,access_level,is_enabled",
          team_member_id: `eq.${id}`,
          limit: "1000",
        }, { profileName: "users-center.page-access-member" });
        return Array.isArray(rows) ? rows : [];
      } catch {
        const rows = await select("team_member_page_access", {
          select: "*",
          team_member_id: `eq.${id}`,
          limit: "1000",
        }, { profileName: "users-center.page-access-member-fallback" });
        return Array.isArray(rows) ? rows : [];
      }
    })(),
  ]);
  return { ok: true, memberId: id, pages: joinAccessRows(pages, accessRows, { includeDisabled: true }), source: "supabase-next" };
}

export async function usersCenterPages() {
  const pages = await usersCenterAppPages({ assignableOnly: true });
  return {
    ok: true,
    pages: pages.map((page) => ({
      pageId: page.pageId,
      pageKey: page.pageKey,
      pageName: page.pageName,
      moduleName: page.moduleName,
      routePath: page.routePath,
      sortOrder: page.sortOrder,
      isEnabled: false,
      accessLevel: "edit",
    })),
    source: "supabase-next",
  };
}

export async function usersCenterMemberDetails(memberId) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Missing team member ID.");
    error.status = 400;
    throw error;
  }

  const row = await measurePerformance("users-center", "member-detail", async () => {
    let direct = null;
    try {
      direct = await selectById(teamMembersTable(), id, { profileName: "users-center.member-detail-by-id" });
    } catch {}
    if (direct) return direct;

    const rows = await selectAll(teamMembersTable(), {
      limit: 5000,
      profileName: "users-center.member-detail-fallback",
    });
    return (rows || []).find((item) => text(valueFor(item, ["id", "ID"])) === id) || null;
  });

  if (!row) {
    const error = new Error("Team member was not found.");
    error.status = 404;
    throw error;
  }

  const [teamBundle, pages, departmentRows] = await Promise.all([
    loadCompactTeamRows().catch(() => ({ rows: [], schemaSample: null })),
    usersCenterAppPages({ assignableOnly: false }).catch(() => []),
    (async () => {
      try {
        return await selectAll(departmentsTable(), {
          limit: 1000,
          order: "name.asc",
          select: "id,name",
          profileName: "users-center.departments-for-detail",
        });
      } catch {
        return [];
      }
    })(),
  ]);

  const optionRows = Array.isArray(teamBundle?.rows) ? teamBundle.rows : [];
  const knownDepartments = unique([
    ...departmentRows.map(departmentName),
    ...optionRows.map((item) => text(valueForLabel(item, "Department")) || "No Department"),
    text(valueForLabel(row, "Department")) || "No Department",
  ]).sort((a, b) => a.localeCompare(b));
  const editableFields = orderedEditableFields([row], {
    departments: knownDepartments,
    pages: pages.filter((page) => page.isActive && page.isAssignable),
    optionRows,
  });

  return {
    ok: true,
    member: serializeMember(row, editableFields),
    editableFields,
    source: "supabase-next-detail",
  };
}

export async function usersCenterSvAccess(memberId) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Missing team member ID.");
    error.status = 400;
    throw error;
  }
  const teamBundle = await loadCompactTeamRows();
  const rows = Array.isArray(teamBundle?.rows) ? teamBundle.rows : [];
  const target = rows.find((row) => text(valueFor(row, ["id", "ID"])) === id) || null;
  if (!target) {
    const error = new Error("Team member was not found.");
    error.status = 404;
    throw error;
  }

  let relationRows = [];
  try {
    relationRows = await select(svAccessTable(), {
      select: "team_member_id,visible_team_member_id,visible_team_member_name",
      team_member_id: `eq.${id}`,
      limit: "5000",
    }, { profileName: "users-center.sv-access-member" });
    if (!Array.isArray(relationRows)) relationRows = [];
  } catch {
    try {
      relationRows = await select(svAccessTable(), {
        select: "*",
        team_member_id: `eq.${id}`,
        limit: "5000",
      }, { profileName: "users-center.sv-access-member-fallback" });
      if (!Array.isArray(relationRows)) relationRows = [];
    } catch {
      relationRows = [];
    }
  }

  const enabledIds = new Set();
  const enabledNames = new Set();
  for (const row of relationRows) {
    const visibleId = text(valueFor(row, ["visible_team_member_id", "visibleTeamMemberId", "member_id", "id"]));
    const visibleName = text(valueFor(row, ["visible_team_member_name", "visibleTeamMemberName", "member_name", "name"]));
    if (visibleId) enabledIds.add(visibleId);
    if (visibleName) enabledNames.add(visibleName.toLowerCase());
  }
  for (const item of splitValues(valueFor(target, ["sv_school_member_ids", "sv_school_ids", "sv_member_ids"]))) enabledIds.add(item);
  for (const item of splitValues(valueFor(target, ["sv_school_member_names", "sv_schools", "S.V Schools", "SV Schools"]))) enabledNames.add(item.toLowerCase());

  const members = rows.map((row) => {
    const memberRowId = text(valueFor(row, ["id", "ID"]));
    const name = text(valueForLabel(row, "Name")) || "Unnamed";
    return {
      memberId: memberRowId,
      name,
      department: text(valueForLabel(row, "Department")) || "No Department",
      position: text(valueForLabel(row, "Position")) || "Team Member",
      email: text(valueForLabel(row, "Email")),
      photoUrl: extractUrl(valueForLabel(row, "Profile picture")),
      isEnabled: enabledIds.has(memberRowId) || enabledNames.has(name.toLowerCase()),
      isSelf: memberRowId === id,
    };
  }).filter((row) => row.memberId).sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || Number(b.isEnabled) - Number(a.isEnabled) || a.name.localeCompare(b.name));

  return {
    ok: true,
    memberId: id,
    memberName: text(valueForLabel(target, "Name")),
    members,
    summary: { enabledCount: members.filter((member) => member.isEnabled).length },
    source: "supabase-next",
  };
}

export function clearUsersCenterReadCaches() {
  directoryCache = null;
  directoryInflight = null;
  compactTeamRowsCache = null;
  compactTeamRowsInflight = null;
  signupCache.clear();
}
