import "server-only";
import { select, selectById } from "./supabase-rest";
import { taskScopeFor, taskOwnerAllowed, taskAssigneeAllowed } from "./task-data-scope.mjs";

const clean = (value) => String(value ?? "").trim();
function denial(message, status = 403) { const error = new Error(message); error.status = status; throw error; }
function ownId(account = {}) { return clean(account.teamMemberId || account.userSupabaseId); }
function assignmentsTable() { return clean(process.env.SUPABASE_DEPARTMENT_TICKET_ASSIGNMENTS_TABLE) || "department_ticket_section_assignments"; }
function sectionsTable() { return clean(process.env.SUPABASE_DEPARTMENT_TICKET_SECTIONS_TABLE) || "department_ticket_sections"; }
function ticketsTable() { return clean(process.env.SUPABASE_DEPARTMENT_TICKETS_TABLE) || "department_tickets"; }

export async function resolveTaskScope(account = {}, key = "") {
  const scope = taskScopeFor(account, key);
  if (scope === null || scope === "all") return { scope, visibleIds: [] };
  if (scope === "none") denial("This task action is not permitted.");
  const self = ownId(account);
  if (!self) denial("Task member identity could not be verified.", 503);
  if (scope === "own") return { scope, visibleIds: [self] };
  let links;
  try {
    links = await select("erp_member_scope_team_links", {
      select: "visible_member_id", manager_member_id: `eq.${self}`, limit: "5000",
    }, { profileName: "tasks.scope-team-links" });
  } catch { denial("Task team relationships could not be verified.", 503); }
  if (!Array.isArray(links) || links.length >= 5000) denial("Task team relationships could not be verified.", 503);
  return { scope, visibleIds: [...new Set([self, ...links.map(row => clean(row.visible_member_id)).filter(Boolean)])] };
}

function verifiedMemberIds(ids) {
  if (!ids.every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id))) denial("Invalid task member identity.", 503);
  return ids;
}

// Only trusted assignee IDs in the actual assignment table establish task ownership.
export async function scopedTaskAssignments(resolved) {
  if (resolved?.scope === null || resolved?.scope === "all" || resolved?.scope === "none") return [];
  const ids = verifiedMemberIds(resolved.visibleIds || []);
  const allRows = [];
  for (let start = 0; start < ids.length; start += 40) {
    let rows;
    try {
      rows = await select(assignmentsTable(), {
        select: "id,section_id,assignee_id", assignee_id: `in.(${ids.slice(start, start + 40).join(",")})`, limit: "5000",
      }, { profileName: "tasks.scope-assignments" });
    } catch { denial("Task assignments could not be verified.", 503); }
    if (!Array.isArray(rows) || rows.length >= 5000) denial("Task assignments could not be verified.", 503);
    allRows.push(...rows);
  }
  return allRows;
}

export function taskTicketVisible(ticket, resolved, scopedAssignments = []) {
  if (resolved?.scope === null || resolved?.scope === "all") return true;
  if (resolved?.scope === "none") return false;
  if (taskOwnerAllowed(ticket, resolved.scope, resolved.visibleIds)) return true;
  if (ticket.kind === "task") return resolved.visibleIds.includes(clean(ticket.directAssigneeId));
  const sections = new Set((ticket?.sections || []).map(row => clean(row.id)).filter(Boolean));
  return scopedAssignments.some(row => sections.has(clean(row.section_id)) && resolved.visibleIds.includes(clean(row.assignee_id)));
}

export function scopedTaskTicket(ticket, assignments = []) {
  if (ticket.kind === "task") return { ...ticket, scopeAssigneeIds: [clean(ticket.directAssigneeId)].filter(Boolean) };
  const sections = new Set((ticket.sections || []).map(row => clean(row.id)));
  const scopeAssigneeIds = [...new Set(assignments.filter(row => sections.has(clean(row.section_id))).map(row => clean(row.assignee_id)).filter(Boolean))];
  return { ...ticket, scopeAssigneeIds };
}

// The view permission is the upper bound. No grants or scope marker = legacy.
export async function taskUiScopePolicy(account = {}) {
  const keys = ["view", "project_edit", "project_archive", "project_delete", "mark_delivered", "workflow_save", "workflow_delete", "workflow_archive", "assignment_archive", "assignment_delete", "assignment_work", "section_work", "section_edit"];
  const scopes = Object.fromEntries(keys.map(key => [key, taskScopeFor(account, `tasks.${key}`)]).filter(([, scope]) => scope !== null));
  if (!Object.keys(scopes).length) return null;
  const self = ownId(account);
  if (!self && Object.values(scopes).some(scope => scope === "own" || scope === "team")) denial("Task member identity could not be verified.", 503);
  const teamScope = Object.keys(scopes).find(key => scopes[key] === "team");
  const teamIds = teamScope ? (await resolveTaskScope(account, `tasks.${teamScope}`)).visibleIds : (self ? [self] : []);
  return { self, teamIds, scopes };
}

// Resolve the object being changed from Supabase, not from client-supplied
// ownership fields. The ID may refer to a ticket, workflow section, or assignee.
export async function assertTaskActionScope(context, permissionKey, action, payload = {}) {
  const resolved = await resolveTaskScope(context?.account, permissionKey);
  if (resolved.scope === null) return;
  const ticketAction = action.startsWith("ticket-");
  const assignmentAction = action.startsWith("assignment-");
  const sectionAction = !ticketAction && !assignmentAction;
  if (action === "ticket-create") return; // New project is always created for the authenticated member.
  const objectId = clean(ticketAction ? (payload.ticketId || payload.id)
    : assignmentAction ? (payload.assignmentId || payload.id) : (payload.sectionId || payload.id));
  if (!objectId) denial("Missing task ID.", 400);
  const assigneeRow = assignmentAction ? await selectById(assignmentsTable(), objectId) : null;
  if (assignmentAction && !assigneeRow) denial("Task assignment not found.", 404);
  const sectionId = assignmentAction ? clean(assigneeRow.section_id) : (sectionAction ? objectId : "");
  const sectionRow = sectionId ? await selectById(sectionsTable(), sectionId) : null;
  if (sectionId && !sectionRow) denial("Task section not found.", 404);
  const projectId = sectionRow ? clean(sectionRow.ticket_id) : objectId;
  const ticket = await selectById(ticketsTable(), projectId);
  if (!ticket) denial("Task project not found.", 404);
  if (action === "ticket-task-work") {
    const memberId = clean(context.memberId || ownId(context.account));
    if (ticket.ticket_kind !== "task" || !memberId || clean(ticket.direct_assignee_id) !== memberId || context.view !== "my") denial("Only the assigned person can update this task.");
    if (!taskAssigneeAllowed({ assignee_id: ticket.direct_assignee_id }, resolved.scope, resolved.visibleIds)) denial("Task is outside your permitted data scope.");
    return;
  }
  if (resolved.scope === "all") return;
  if (assignmentAction) {
    if (!taskAssigneeAllowed(assigneeRow, resolved.scope, resolved.visibleIds)) denial("Task assignment is outside your permitted data scope.");
    return;
  }
  if (sectionAction && ["section-update", "section-work", "people-workflow-get"].includes(action)) {
    if (taskOwnerAllowed(ticket, resolved.scope, resolved.visibleIds)) return;
    const rows = await scopedTaskAssignments(resolved);
    if (rows.some(row => clean(row.section_id) === sectionId)) return;
  }
  if (!taskOwnerAllowed(ticket, resolved.scope, resolved.visibleIds)) denial("Task project is outside your permitted data scope.");
}
