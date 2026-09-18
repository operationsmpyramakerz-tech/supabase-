import "server-only";

import { getDirectSessionAccountGate } from "./direct-session-account";
import { select, selectById } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";

const LIST_CACHE_TTL_MS = 1_500;
const DETAIL_CACHE_TTL_MS = 1_000;
const listCache = new Map();
const detailCache = new Map();
const inflight = new Map();

const VIEW_CONFIG = Object.freeze({
  all: { pageName: "All Tasks", slug: "all-tasks" },
  my: { pageName: "My Tasks", slug: "my-tasks" },
  delegated: { pageName: "Delegated Tasks", slug: "delegated-tasks" },
});

const TICKET_SUMMARY_SELECT = [
  "id",
  "title",
  "priority",
  "due_date",
  "status",
  "created_at",
  "updated_at",
  "created_by_id",
  "created_by_name",
  "is_archived",
  "archived_at",
  "archived_by_id",
  "archived_by_name",
  "archived_from_view",
].join(",");

const SECTION_SUMMARY_SELECT = [
  "id",
  "ticket_id",
  "department",
  "delivery_date",
  "sort_order",
  "execution_group",
  "status",
  "rejection_reason",
].join(",");

function text(value, max = 0) {
  let out = "";
  if (value === null || typeof value === "undefined") out = "";
  else if (Array.isArray(value)) out = value.map((item) => text(item)).find(Boolean) || "";
  else if (typeof value === "object") out = text(value.name || value.value || value.label || value.title || value.email || value.url);
  else out = String(value).replace(/\u00a0/g, " ").trim();
  return max > 0 ? out.slice(0, max) : out;
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function dateValue(value) {
  const raw = text(value, 24).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeStatus(value, fallback = "not_started") {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    notstarted: "not_started",
    not_started: "not_started",
    new: "not_started",
    inprogress: "in_progress",
    in_progress: "in_progress",
    working: "in_progress",
    rejected: "rejected",
    reject: "rejected",
    completed: "completed",
    complete: "completed",
    done: "completed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };
  return aliases[raw] || fallback;
}

function statusLabel(value) {
  return ({
    not_started: "Not started",
    in_progress: "In progress",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
  })[normalizeStatus(value)] || "Not started";
}

function priority(value) {
  const raw = text(value, 30).toLowerCase();
  if (["urgent", "high", "normal", "low"].includes(raw)) return raw.charAt(0).toUpperCase() + raw.slice(1);
  return "Normal";
}

function ticketsTable() {
  return text(process.env.SUPABASE_DEPARTMENT_TICKETS_TABLE) || "department_tickets";
}
function sectionsTable() {
  return text(process.env.SUPABASE_DEPARTMENT_TICKET_SECTIONS_TABLE) || "department_ticket_sections";
}
function edgesTable() {
  return text(process.env.SUPABASE_DEPARTMENT_TICKET_EDGES_TABLE) || "department_ticket_section_edges";
}
function assignmentsTable() {
  return text(process.env.SUPABASE_DEPARTMENT_TICKET_ASSIGNMENTS_TABLE) || "department_ticket_section_assignments";
}

function ticketId(row = {}) {
  return text(valueFor(row, ["id", "ID"]));
}

function ticketCode(row = {}) {
  const existing = text(valueFor(row, ["ticket_code", "ticketCode", "code", "Code"]), 80);
  if (existing) return existing;
  const id = ticketId(row);
  const numeric = Number(id);
  return Number.isFinite(numeric) ? `TKT-${String(Math.max(0, numeric)).padStart(5, "0")}` : (id ? `TKT-${id}` : "TKT");
}

function attachment(value = {}) {
  if (!value || typeof value !== "object") return null;
  const url = text(value.url || value.attachmentUrl || value.attachment_url, 4000);
  const protectedStorage = /^\/api\/storage\/file\/[A-Za-z0-9._~-]+(?:[?&].*)?$/i.test(url);
  if (!url || (!/^https?:\/\//i.test(url) && !protectedStorage)) return null;
  return {
    name: text(value.name || value.filename || value.attachmentName || value.attachment_name, 500) || "Attachment",
    url,
    type: text(value.type || value.mime || value.attachmentType || value.attachment_type, 180),
    size: Math.max(0, Math.min(100 * 1024 * 1024, Number(value.size || value.attachmentSize || value.attachment_size) || 0)),
  };
}

function attachments(value, legacyValue = null) {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = []; }
  }
  if (source && !Array.isArray(source) && Array.isArray(source.files)) source = source.files;
  else if (source && !Array.isArray(source) && typeof source === "object" && (source.url || source.attachmentUrl || source.attachment_url)) source = [source];
  const list = (Array.isArray(source) ? source : []).map((item) => attachment(item)).filter(Boolean);
  const legacy = attachment(legacyValue);
  if (legacy && !list.some((item) => item.url === legacy.url)) list.unshift(legacy);
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 20);
}

function decodeWorkFiles(row = {}) {
  const rawUrl = valueFor(row, ["work_file_url", "workFileUrl"]);
  if (typeof rawUrl === "string" && rawUrl.startsWith("__TM_WORK_FILES_JSON__:")) {
    try { return attachments(JSON.parse(rawUrl.slice("__TM_WORK_FILES_JSON__:".length))); } catch {}
  }
  const legacy = attachment({
    name: valueFor(row, ["work_file_name", "workFileName"]),
    url: rawUrl,
    type: valueFor(row, ["work_file_type", "workFileType"]),
    size: valueFor(row, ["work_file_size", "workFileSize"]),
  });
  return legacy ? [legacy] : [];
}

function serializeSection(row = {}, { summary = false } = {}) {
  const status = normalizeStatus(valueFor(row, ["status", "Status"]));
  const base = {
    id: ticketId(row),
    ticketId: text(valueFor(row, ["ticket_id", "ticketId"])),
    department: text(valueFor(row, ["department", "Department"]), 120),
    deliveryDate: dateValue(valueFor(row, ["delivery_date", "deliveryDate"])),
    sortOrder: Number(valueFor(row, ["sort_order", "sortOrder"]) || 0),
    executionGroup: Math.max(1, Number(valueFor(row, ["execution_group", "executionGroup", "stage", "stage_number"]) || valueFor(row, ["sort_order", "sortOrder"]) || 1)),
    status,
    statusLabel: statusLabel(status),
    rejectionReason: text(valueFor(row, ["rejection_reason", "rejectionReason"]), 4000),
  };
  if (summary) return base;

  const legacyAttachment = attachment({
    name: valueFor(row, ["attachment_name", "attachmentName"]),
    url: valueFor(row, ["attachment_url", "attachmentUrl"]),
    type: valueFor(row, ["attachment_type", "attachmentType"]),
    size: valueFor(row, ["attachment_size", "attachmentSize"]),
  });
  const files = attachments(valueFor(row, ["attachments", "attachment_files", "attachmentFiles"]), legacyAttachment);
  const workFiles = decodeWorkFiles(row);
  return {
    ...base,
    request: text(valueFor(row, ["request_text", "request", "Request", "title", "Title"]), 4000),
    details: text(valueFor(row, ["details", "description", "Description"]), 8000),
    attachments: files,
    attachment: files[0] || null,
    canvasX: Number(valueFor(row, ["canvas_x", "canvasX", "node_x", "nodeX"]) || 0),
    canvasY: Number(valueFor(row, ["canvas_y", "canvasY", "node_y", "nodeY"]) || 0),
    completionNote: text(valueFor(row, ["completion_note", "completionNote", "work_note", "workNote"]), 8000),
    workReport: text(valueFor(row, ["work_report", "workReport", "completion_note", "completionNote"]), 12000),
    workLink: text(valueFor(row, ["work_link", "workLink"]), 4000),
    workFiles,
    workFile: workFiles[0] || null,
    startedAt: valueFor(row, ["started_at", "startedAt"]) || null,
    completedAt: valueFor(row, ["completed_at", "completedAt"]) || null,
    completedByName: text(valueFor(row, ["completed_by_name", "completedByName"]), 180),
    updatedAt: valueFor(row, ["updated_at", "updatedAt"]) || null,
  };
}

function serializeEdge(row = {}) {
  return {
    id: ticketId(row),
    ticketId: text(valueFor(row, ["ticket_id", "ticketId"])),
    from: text(valueFor(row, ["from_section_id", "fromSectionId", "from"])),
    to: text(valueFor(row, ["to_section_id", "toSectionId", "to"])),
  };
}

function statusFromSections(sections = []) {
  const statuses = sections.map((section) => normalizeStatus(section?.status)).filter(Boolean);
  if (!statuses.length) return "not_started";
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => ["in_progress", "completed", "cancelled"].includes(status))) return "in_progress";
  return "not_started";
}

function serializeTicket(row = {}, sectionRows = [], edgeRows = [], { summary = false } = {}) {
  const id = ticketId(row);
  const sections = sectionRows.map((item) => serializeSection(item, { summary })).sort((a, b) => (a.executionGroup - b.executionGroup) || (a.sortOrder - b.sortOrder) || Number(a.id) - Number(b.id));
  const calculatedStatus = statusFromSections(sections);
  const completedCount = sections.filter((section) => section.status === "completed").length;
  const base = {
    id,
    ticketCode: ticketCode(row),
    title: text(valueFor(row, ["title", "Title", "name", "Name"]), 500) || "Untitled ticket",
    priority: priority(valueFor(row, ["priority", "Priority"])),
    dueDate: dateValue(valueFor(row, ["due_date", "dueDate", "deadline", "Deadline"])),
    status: calculatedStatus,
    statusLabel: statusLabel(calculatedStatus),
    createdAt: valueFor(row, ["created_at", "createdAt"]) || null,
    updatedAt: valueFor(row, ["updated_at", "updatedAt"]) || null,
    createdById: text(valueFor(row, ["created_by_id", "createdById"]), 120),
    createdByName: text(valueFor(row, ["created_by_name", "createdByName"]), 180) || "—",
    isArchived: bool(valueFor(row, ["is_archived", "isArchived"])),
    archivedAt: valueFor(row, ["archived_at", "archivedAt"]) || null,
    archivedById: text(valueFor(row, ["archived_by_id", "archivedById"]), 120),
    archivedByName: text(valueFor(row, ["archived_by_name", "archivedByName"]), 180),
    archivedFromView: text(valueFor(row, ["archived_from_view", "archivedFromView"]), 30),
    sections,
    sectionsCount: sections.length,
    completedCount,
    progress: sections.length ? Math.round((completedCount / sections.length) * 100) : 0,
  };
  if (summary) return base;
  return {
    ...base,
    description: text(valueFor(row, ["description", "details", "Description"]), 8000),
    edges: edgeRows.map(serializeEdge).filter((edge) => edge.from && edge.to),
  };
}

function currentMember(context = {}) {
  const account = context.account || {};
  return {
    id: text(context.memberId || account.id || account.userId || account.supabaseId),
    name: text(account.name || account.username, 180) || "User",
    department: text(account.department, 120),
    position: text(account.position, 180),
  };
}

function sameText(left, right) {
  return canonical(left) === canonical(right);
}

function sameMember(ticket = {}, member = {}) {
  const currentId = text(member.id, 120);
  const creatorId = text(ticket.createdById, 120);
  if (currentId && creatorId) return currentId === creatorId;
  return !!(text(member.name) && text(ticket.createdByName) && sameText(member.name, ticket.createdByName));
}

function archivedByMember(ticket = {}, member = {}) {
  const archivedId = text(ticket.archivedById, 120);
  const currentId = text(member.id, 120);
  if (archivedId && currentId) return archivedId === currentId;
  return !!(text(ticket.archivedByName) && text(member.name) && sameText(ticket.archivedByName, member.name));
}

function archiveView(ticket = {}) {
  const view = text(ticket.archivedFromView, 30).toLowerCase();
  return ["all", "my", "delegated"].includes(view) ? view : "delegated";
}

function belongsToView(ticket = {}, member = {}, view = "") {
  if (ticket.isArchived) return archivedByMember(ticket, member) && archiveView(ticket) === view;
  if (view === "all") return true;
  if (view === "delegated") return sameMember(ticket, member);
  if (view === "my") {
    const department = text(member.department, 120);
    return !!(department && ticket.sections.some((section) => sameText(section.department, department)));
  }
  return false;
}

function builtInAdmin(account = {}) {
  return normalize(account.name || account.username) === "admin" || normalize(account.position).includes("admin");
}

function accessRowMatches(row = {}, tokens = []) {
  const wanted = new Set(tokens.map(normalize));
  const values = [row.pageName, row.pageKey, row.routePath, ...(Array.isArray(row.aliases) ? row.aliases : [])].map(normalize).filter(Boolean);
  return values.some((value) => wanted.has(value));
}

function accessLevel(value) {
  const raw = text(value).toLowerCase();
  if (raw === "admin") return "admin";
  if (raw === "edit") return "edit";
  return "view";
}

export function taskViewAccess(account = {}, view = "") {
  const config = VIEW_CONFIG[view];
  if (!config) return { accessLevel: "view", isPageAdmin: false };
  if (builtInAdmin(account)) return { accessLevel: "admin", isPageAdmin: true };
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const exactTokens = [config.pageName, config.slug, `/task-management/${config.slug}`, `task-management-${config.slug}`];
  const broadTokens = ["Task Management", "task-management", "department-tickets", "departmenttickets"];
  const exact = rows.find((row) => accessRowMatches(row, exactTokens));
  const broad = rows.find((row) => accessRowMatches(row, broadTokens));
  const chosen = exact || broad || null;
  const level = accessLevel(chosen?.accessLevel || chosen?.access_level);
  const isPageAdmin = [exact, broad].filter(Boolean).some((row) => accessLevel(row?.accessLevel || row?.access_level) === "admin");
  return { accessLevel: isPageAdmin ? "admin" : level, isPageAdmin };
}

function canManageDepartment(context = {}) {
  return context.view === "my" && (context.isPageAdmin || ["edit", "admin"].includes(context.accessLevel));
}

function sectionForViewer(section = {}, member = {}, view = "", manager = false) {
  const status = normalizeStatus(section.status);
  const published = status === "completed";
  const managerPreview = view === "my" && manager && sameText(section.department, member.department);
  if (published || managerPreview) return { ...section };
  return {
    ...section,
    completionNote: "",
    workReport: "",
    rejectionReason: status === "rejected" ? text(section.rejectionReason, 4000) : "",
    workLink: "",
    workFile: null,
    completedByName: "",
  };
}

function ticketForViewer(ticket = {}, member = {}, context = {}) {
  if (context.summary) return ticket;
  return { ...ticket, sections: ticket.sections.map((section) => sectionForViewer(section, member, context.view, canManageDepartment(context))) };
}

function assignmentMatchesMember(row = {}, member = {}) {
  const assigneeId = text(valueFor(row, ["assignee_id", "assigneeId"]));
  if (assigneeId && member.id) return assigneeId === member.id;
  return !!(text(valueFor(row, ["assignee_name", "assigneeName"])) && sameText(valueFor(row, ["assignee_name", "assigneeName"]), member.name));
}

async function assignmentsForMember(member = {}) {
  if (member.id) {
    const rows = await select(assignmentsTable(), {
      select: "id,section_id,assignee_id,assignee_name,status",
      assignee_id: `eq.${member.id}`,
      limit: "5000",
      order: "id.asc",
    });
    return Array.isArray(rows) ? rows : [];
  }
  const rows = await select(assignmentsTable(), { select: "id,section_id,assignee_id,assignee_name,status", limit: "5000", order: "id.asc" });
  return (Array.isArray(rows) ? rows : []).filter((row) => assignmentMatchesMember(row, member));
}

function viewerProgress(ticket = {}, member = {}, context = {}, assignmentRows = []) {
  if (context.view !== "my") {
    return { viewerSectionsCount: ticket.sectionsCount, viewerCompletedCount: ticket.completedCount, viewerProgress: ticket.progress };
  }
  if (canManageDepartment(context)) {
    const relevant = ticket.sections.filter((section) => member.department && sameText(section.department, member.department));
    const completed = relevant.filter((section) => normalizeStatus(section.status) === "completed").length;
    return { viewerSectionsCount: relevant.length, viewerCompletedCount: completed, viewerProgress: relevant.length ? Math.round((completed / relevant.length) * 100) : 0 };
  }
  const sectionIds = new Set(ticket.sections.map((section) => text(section.id)).filter(Boolean));
  const seen = new Set();
  const relevant = assignmentRows.filter((row) => {
    const sectionId = text(valueFor(row, ["section_id", "sectionId"]));
    const id = text(valueFor(row, ["id", "ID"])) || `${sectionId}:${text(valueFor(row, ["assignee_id", "assigneeId", "assignee_name", "assigneeName"]))}`;
    if (!sectionIds.has(sectionId) || !id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const completed = relevant.filter((row) => normalizeStatus(valueFor(row, ["status", "Status"])) === "completed").length;
  return { viewerSectionsCount: relevant.length, viewerCompletedCount: completed, viewerProgress: relevant.length ? Math.round((completed / relevant.length) * 100) : 0 };
}


async function loadTicketRows() {
  const rows = await select(ticketsTable(), {
    select: TICKET_SUMMARY_SELECT,
    limit: "5000",
    order: "created_at.desc,id.desc",
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadSummaryTickets(context = {}) {
  const member = currentMember(context);
  const needsAssignments = context.view === "my" && !canManageDepartment(context);
  const [ticketRows, sectionRows, assignmentRows] = await Promise.all([
    loadTicketRows(),
    select(sectionsTable(), {
      select: SECTION_SUMMARY_SELECT,
      limit: "20000",
      order: "sort_order.asc,id.asc",
    }).then((rows) => Array.isArray(rows) ? rows : []),
    needsAssignments ? assignmentsForMember(member) : Promise.resolve([]),
  ]);

  const sectionsByTicket = new Map();
  for (const row of sectionRows) {
    const id = text(valueFor(row, ["ticket_id", "ticketId"]));
    if (!id) continue;
    if (!sectionsByTicket.has(id)) sectionsByTicket.set(id, []);
    sectionsByTicket.get(id).push(row);
  }

  let tickets = ticketRows.map((row) => serializeTicket(row, sectionsByTicket.get(ticketId(row)) || [], [], { summary: true }));
  tickets = tickets.filter((ticket) => belongsToView(ticket, member, context.view));

  if (needsAssignments) {
    const assignedSectionIds = new Set(assignmentRows.map((row) => text(valueFor(row, ["section_id", "sectionId"]))).filter(Boolean));
    tickets = tickets.filter((ticket) => ticket.sections.some((section) => assignedSectionIds.has(text(section.id))));
  }

  return tickets.map((ticket) => ({ ...ticket, ...viewerProgress(ticket, member, context, assignmentRows) }));
}

async function loadDetailTicket(id, context = {}) {
  const row = await selectById(ticketsTable(), id);
  if (!row) return null;
  const [sectionRows, edgeRows] = await Promise.all([
    select(sectionsTable(), { select: "*", ticket_id: `eq.${id}`, limit: "1000", order: "sort_order.asc,id.asc" }),
    select(edgesTable(), { select: "*", ticket_id: `eq.${id}`, limit: "3000", order: "id.asc" }),
  ]);
  const ticket = serializeTicket(row, Array.isArray(sectionRows) ? sectionRows : [], Array.isArray(edgeRows) ? edgeRows : [], { summary: false });
  const member = currentMember(context);
  if (!belongsToView(ticket, member, context.view)) {
    const error = new Error("This ticket is not available in the selected Task Management view.");
    error.status = 403;
    throw error;
  }
  const assignmentRows = context.view === "my" && !canManageDepartment(context) ? await assignmentsForMember(member) : [];
  return {
    ...ticketForViewer(ticket, member, context),
    ...viewerProgress(ticket, member, context, assignmentRows),
  };
}

function cacheKey(context = {}) {
  return [context.view, context.memberId || "", context.accessLevel || "view", context.isPageAdmin ? "admin" : "user"].join(":");
}

export async function listTaskManagementTickets(context = {}, { force = false } = {}) {
  const key = cacheKey(context);
  const now = Date.now();
  if (!force && listCache.get(key)?.expiresAt > now) return listCache.get(key).value;
  const inKey = `list:${key}`;
  if (!force && inflight.has(inKey)) return await inflight.get(inKey);
  const pending = loadSummaryTickets(context);
  if (!force) inflight.set(inKey, pending);
  try {
    const value = await pending;
    listCache.set(key, { value, expiresAt: Date.now() + LIST_CACHE_TTL_MS });
    return value;
  } finally {
    if (inflight.get(inKey) === pending) inflight.delete(inKey);
  }
}

export async function getTaskManagementTicket(id, context = {}, { force = false } = {}) {
  const key = `${cacheKey(context)}:${text(id)}`;
  const now = Date.now();
  if (!force && detailCache.get(key)?.expiresAt > now) return detailCache.get(key).value;
  const inKey = `detail:${key}`;
  if (!force && inflight.has(inKey)) return await inflight.get(inKey);
  const pending = loadDetailTicket(text(id), context);
  if (!force) inflight.set(inKey, pending);
  try {
    const value = await pending;
    detailCache.set(key, { value, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
    return value;
  } finally {
    if (inflight.get(inKey) === pending) inflight.delete(inKey);
  }
}

export async function taskManagementMeta(context = {}, { force = false } = {}) {
  const members = await listTeamMembersLite({ fresh: force });
  const departments = [...new Map(members.map((member) => [canonical(member.department), text(member.department)]).filter(([key, value]) => key && value)).values()].sort((a, b) => a.localeCompare(b));
  return {
    ok: true,
    view: context.view,
    currentUser: currentMember(context),
    departments,
    accessLevel: context.accessLevel || "view",
    isPageAdmin: !!context.isPageAdmin,
  };
}

export async function directTaskManagementContext(view) {
  const config = VIEW_CONFIG[view];
  if (!config) return { ok: false, status: 400, error: "A valid Task Management view is required." };
  const gate = await getDirectSessionAccountGate([config.pageName]);
  if (!gate) return null;
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.error, account: gate.account || null, source: "direct-session" };
  const access = taskViewAccess(gate.account, view);
  return {
    ok: true,
    status: 200,
    view,
    account: gate.account,
    memberId: gate.memberId || "",
    accessLevel: access.accessLevel,
    isPageAdmin: access.isPageAdmin,
    source: "direct-session",
  };
}

export async function loadDirectTaskManagementPageData({ view } = {}) {
  const context = await directTaskManagementContext(view);
  if (!context) return null;
  if (!context.ok) return context;
  try {
    const [tickets, meta] = await Promise.all([
      listTaskManagementTickets(context),
      taskManagementMeta(context),
    ]);
    return {
      ok: true,
      status: 200,
      account: context.account,
      tickets,
      meta,
      warnings: [],
      source: "supabase-next",
    };
  } catch {
    return null;
  }
}

export function taskManagementDataError(error) {
  const raw = text(error?.message);
  return /department_ticket|relation .* does not exist|Could not find the table|PGRST205|42P01|schema cache/i.test(raw)
    ? "Task Management workflow tables are not installed or are missing a required column. Run the latest Task Management Supabase migration, then refresh this page."
    : raw || "Task Management request failed.";
}

export const __taskManagementDataTest = {
  normalizeStatus,
  statusFromSections,
  serializeSection,
  serializeTicket,
  taskViewAccess,
  belongsToView,
};
