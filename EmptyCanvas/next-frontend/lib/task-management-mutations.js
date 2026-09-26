import "server-only";

import {
  deleteById,
  deleteByIds,
  insert,
  select,
  selectById,
  updateById,
  updateByIds,
} from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";
import {
  loadRawTaskManagementTicket,
  normalizeTaskManagementStatus,
  taskManagementArchiveView,
  taskManagementArchivedByMember,
  taskManagementCanManageDepartment,
  taskManagementCurrentMember,
  taskManagementSameMember,
  taskManagementStatusLabel,
  taskManagementTicketBelongsToView,
} from "./task-management-data";
import { verifyPageAdminPasswordDirect } from "./order-action-auth";

const PAGE_BY_VIEW = Object.freeze({ all: "All Tasks", my: "My Tasks", delegated: "Delegated Tasks" });

function text(value, max = 0) {
  const out = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return max > 0 ? out.slice(0, max) : out;
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameText(left, right) {
  return canonical(left) === canonical(right);
}

function dateValue(value) {
  const raw = text(value, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function priority(value) {
  const raw = text(value, 30).toLowerCase();
  if (["urgent", "high", "normal", "low"].includes(raw)) return raw.charAt(0).toUpperCase() + raw.slice(1);
  return "Normal";
}

function idFor(row = {}) {
  return text(row?.id ?? row?.ID);
}

function ticketIdForSection(row = {}) {
  return text(row?.ticket_id ?? row?.ticketId);
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
function assignmentEdgesTable() {
  return text(process.env.SUPABASE_DEPARTMENT_TICKET_ASSIGNMENT_EDGES_TABLE) || "department_ticket_section_assignment_edges";
}

function errorWithStatus(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
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
  const list = (Array.isArray(source) ? source : []).map(attachment).filter(Boolean);
  const legacy = attachment(legacyValue);
  if (legacy && !list.some((item) => item.url === legacy.url)) list.unshift(legacy);
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 20);
}

function attachmentColumns(value) {
  const files = attachments(value);
  const first = files[0] || null;
  return {
    attachments: files,
    attachment_name: first?.name || null,
    attachment_url: first?.url || null,
    attachment_type: first?.type || null,
    attachment_size: first?.size || null,
  };
}

function decodeWorkFiles(row = {}) {
  const rawUrl = row?.work_file_url ?? row?.workFileUrl;
  if (typeof rawUrl === "string" && rawUrl.startsWith("__TM_WORK_FILES_JSON__:")) {
    try { return attachments(JSON.parse(rawUrl.slice("__TM_WORK_FILES_JSON__:".length))); } catch {}
  }
  const legacy = attachment({
    name: row?.work_file_name ?? row?.workFileName,
    url: rawUrl,
    type: row?.work_file_type ?? row?.workFileType,
    size: row?.work_file_size ?? row?.workFileSize,
  });
  return legacy ? [legacy] : [];
}

function workFileColumns(value) {
  const files = attachments(value).slice(0, 20);
  const first = files[0] || null;
  return {
    work_file_name: files.length > 1 ? `${files.length} work files` : (first?.name || null),
    work_file_url: files.length > 1 ? `__TM_WORK_FILES_JSON__:${JSON.stringify(files)}` : (first?.url || null),
    work_file_type: first?.type || null,
    work_file_size: first?.size || null,
  };
}

function canvasNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(10000, Math.round(number)));
}

function buildWorkflowPlan(rawSections = [], rawEdges) {
  const sourceSections = (Array.isArray(rawSections) ? rawSections : []).slice(0, 40);
  const hasGraphDefinition = Array.isArray(rawEdges);
  const prepared = sourceSections.map((item, index) => ({
    clientId: text(item?.clientId || item?.client_id || item?.id || `section-${index + 1}`, 120) || `section-${index + 1}`,
    department: text(item?.department, 120),
    request: text(item?.request || item?.requestText || item?.title, 4000),
    details: text(item?.details || item?.description, 8000),
    deliveryDate: dateValue(item?.deliveryDate || item?.delivery_date),
    attachments: attachments(item?.attachments || item?.attachment_files, item?.attachment || {
      name: item?.attachmentName || item?.attachment_name,
      url: item?.attachmentUrl || item?.attachment_url,
      type: item?.attachmentType || item?.attachment_type,
      size: item?.attachmentSize || item?.attachment_size,
    }),
    sortOrder: index + 1,
    canvasX: canvasNumber(item?.canvasX ?? item?.canvas_x ?? item?.nodeX ?? item?.node_x, 0),
    canvasY: canvasNumber(item?.canvasY ?? item?.canvas_y ?? item?.nodeY ?? item?.node_y, 0),
    executionGroup: Math.max(1, Math.min(40, Number(item?.executionGroup ?? item?.execution_group ?? item?.stage ?? index + 1) || index + 1)),
  }));
  prepared.forEach((section) => { section.attachment = section.attachments[0] || null; });

  const ids = new Set();
  for (const section of prepared) {
    if (ids.has(section.clientId)) throw errorWithStatus("Workflow blocks must have unique IDs.");
    ids.add(section.clientId);
  }

  if (!hasGraphDefinition) {
    const distinctGroups = [...new Set(prepared.map((section) => section.executionGroup))].sort((a, b) => a - b);
    const groupMap = new Map(distinctGroups.map((group, index) => [group, index + 1]));
    return { sections: prepared.map((section) => ({ ...section, executionGroup: groupMap.get(section.executionGroup) || 1 })), edges: [] };
  }

  const edgeMap = new Map();
  for (const item of rawEdges.slice(0, 120)) {
    const from = text(item?.from ?? item?.fromClientId ?? item?.from_section_id, 120);
    const to = text(item?.to ?? item?.toClientId ?? item?.to_section_id, 120);
    if (!from || !to) throw errorWithStatus("Every workflow arrow needs a source and destination block.");
    if (!ids.has(from) || !ids.has(to)) throw errorWithStatus("A workflow arrow references an unknown block.");
    if (from === to) throw errorWithStatus("A workflow arrow cannot point to the same block.");
    edgeMap.set(`${from}::${to}`, { from, to });
  }

  const edges = [...edgeMap.values()];
  const outgoing = new Map(prepared.map((section) => [section.clientId, []]));
  const incomingCount = new Map(prepared.map((section) => [section.clientId, 0]));
  edges.forEach((edge) => {
    outgoing.get(edge.from).push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  });
  const rank = new Map(prepared.map((section) => [section.clientId, 1]));
  const queue = prepared.filter((section) => incomingCount.get(section.clientId) === 0).map((section) => section.clientId);
  let processed = 0;
  while (queue.length) {
    const current = queue.shift();
    processed += 1;
    for (const next of outgoing.get(current) || []) {
      rank.set(next, Math.max(rank.get(next) || 1, (rank.get(current) || 1) + 1));
      incomingCount.set(next, (incomingCount.get(next) || 0) - 1);
      if (incomingCount.get(next) === 0) queue.push(next);
    }
  }
  if (processed !== prepared.length) throw errorWithStatus("The workflow contains a circular arrow. Remove the loop and try again.");
  return { sections: prepared.map((section) => ({ ...section, executionGroup: rank.get(section.clientId) || 1 })), edges };
}

function sectionPrerequisites(ticket = {}, section = {}) {
  const sectionId = text(section?.id);
  const predecessors = (Array.isArray(ticket?.edges) ? ticket.edges : [])
    .filter((edge) => text(edge?.to ?? edge?.toSectionId ?? edge?.to_section_id) === sectionId)
    .map((edge) => text(edge?.from ?? edge?.fromSectionId ?? edge?.from_section_id))
    .filter(Boolean);
  if (predecessors.length) {
    const byId = new Map((ticket.sections || []).map((item) => [text(item.id), item]));
    return predecessors.map((id) => byId.get(id)).filter(Boolean);
  }
  const currentGroup = Math.max(1, Number(section?.executionGroup || section?.sortOrder || 1));
  return (ticket.sections || []).filter((item) => Math.max(1, Number(item?.executionGroup || item?.sortOrder || 1)) < currentGroup);
}

async function membersForDepartment(department) {
  const wanted = text(department, 120);
  if (!wanted) return [];
  const members = await listTeamMembersLite();
  return (members || [])
    .filter((member) => member?.id && member?.name && sameText(member.department, wanted))
    .map((member) => ({ id: text(member.id), name: text(member.name, 180), department: text(member.department, 120), position: text(member.position, 180) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function serializeAssignment(row = {}) {
  const legacyAttachment = attachment({
    name: row?.attachment_name ?? row?.attachmentName,
    url: row?.attachment_url ?? row?.attachmentUrl,
    type: row?.attachment_type ?? row?.attachmentType,
    size: row?.attachment_size ?? row?.attachmentSize,
  });
  const files = attachments(row?.attachments ?? row?.attachment_files ?? row?.attachmentFiles, legacyAttachment);
  const workFiles = decodeWorkFiles(row);
  return {
    id: idFor(row),
    sectionId: text(row?.section_id ?? row?.sectionId),
    assigneeId: text(row?.assignee_id ?? row?.assigneeId, 120),
    assigneeName: text(row?.assignee_name ?? row?.assigneeName, 180),
    task: text(row?.task_text ?? row?.task ?? row?.request_text ?? row?.request, 4000),
    details: text(row?.details ?? row?.description, 8000),
    deliveryDate: dateValue(row?.delivery_date ?? row?.deliveryDate),
    attachments: files,
    attachment: files[0] || null,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 0),
    executionGroup: Math.max(1, Number(row?.execution_group ?? row?.executionGroup ?? row?.sort_order ?? row?.sortOrder ?? 1)),
    canvasX: Number(row?.canvas_x ?? row?.canvasX ?? 0),
    canvasY: Number(row?.canvas_y ?? row?.canvasY ?? 0),
    status: normalizeTaskManagementStatus(row?.status ?? row?.Status),
    workReport: text(row?.work_report ?? row?.workReport, 12000),
    rejectionReason: text(row?.rejection_reason ?? row?.rejectionReason, 4000),
    workLink: text(row?.work_link ?? row?.workLink, 4000),
    workFiles,
    workFile: workFiles[0] || null,
    createdAt: row?.created_at ?? row?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function serializeAssignmentEdge(row = {}) {
  return {
    id: idFor(row),
    sectionId: text(row?.section_id ?? row?.sectionId),
    from: text(row?.from_assignment_id ?? row?.fromAssignmentId ?? row?.from),
    to: text(row?.to_assignment_id ?? row?.toAssignmentId ?? row?.to),
  };
}

async function loadPeopleWorkflow(sectionId) {
  const cleanId = text(sectionId);
  if (!cleanId) return { assignments: [], edges: [] };
  try {
    const [assignmentRows, edgeRows] = await Promise.all([
      select(assignmentsTable(), { select: "*", section_id: `eq.${cleanId}`, limit: "1000", order: "sort_order.asc,id.asc" }),
      select(assignmentEdgesTable(), { select: "*", section_id: `eq.${cleanId}`, limit: "3000", order: "id.asc" }),
    ]);
    return {
      assignments: (Array.isArray(assignmentRows) ? assignmentRows : []).map(serializeAssignment),
      edges: (Array.isArray(edgeRows) ? edgeRows : []).map(serializeAssignmentEdge).filter((edge) => edge.from && edge.to),
    };
  } catch (error) {
    const detail = text(error?.message);
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(detail)) {
      throw errorWithStatus("The My Tasks team-workflow tables are not installed. Run the supplied My Tasks SQL migration, then refresh this page.", 503);
    }
    throw error;
  }
}

function buildPeopleWorkflowPlan(rawAssignments = [], rawEdges) {
  const source = (Array.isArray(rawAssignments) ? rawAssignments : []).slice(0, 60);
  const byClientId = new Map();
  const genericSections = source.map((item, index) => {
    const clientId = text(item?.clientId || item?.client_id || item?.id || `assignment-${index + 1}`, 120) || `assignment-${index + 1}`;
    byClientId.set(clientId, {
      assigneeId: text(item?.assigneeId || item?.assignee_id, 120),
      assigneeName: text(item?.assigneeName || item?.assignee_name, 180),
    });
    return {
      clientId,
      department: text(item?.assigneeName || item?.assignee_name, 180),
      request: text(item?.task || item?.taskText || item?.task_text || item?.request, 4000),
      details: text(item?.details || item?.description, 8000),
      deliveryDate: dateValue(item?.deliveryDate || item?.delivery_date),
      attachments: item?.attachments || null,
      attachment: item?.attachment || null,
      canvasX: item?.canvasX ?? item?.canvas_x,
      canvasY: item?.canvasY ?? item?.canvas_y,
      executionGroup: item?.executionGroup ?? item?.execution_group ?? index + 1,
    };
  });
  const generic = buildWorkflowPlan(genericSections, rawEdges);
  return {
    assignments: generic.sections.map((item) => {
      const owner = byClientId.get(item.clientId) || {};
      return { ...item, assigneeId: owner.assigneeId || "", assigneeName: owner.assigneeName || item.department || "", task: item.request };
    }),
    edges: generic.edges,
  };
}

function assertOwnDepartmentSection(ticket, section, currentUser) {
  if (!ticket || !section) throw errorWithStatus("Workflow section not found.", 404);
  if (!sameText(section.department || "", currentUser?.department || "")) throw errorWithStatus("This task belongs to another department.", 403);
}

function sameAssignmentMember(assignment = {}, currentUser = {}) {
  const assigneeId = text(assignment?.assigneeId || assignment?.assignee_id, 120);
  const currentId = text(currentUser?.id, 120);
  if (assigneeId && currentId) return assigneeId === currentId;
  return !!(text(assignment?.assigneeName || assignment?.assignee_name, 180) && sameText(assignment?.assigneeName || assignment?.assignee_name, currentUser?.name || ""));
}

function canEditAssignmentWork(context, assignment = {}, currentUser = {}) {
  if (context?.isPageAdmin || context?.accessLevel === "admin") return true;
  return context?.accessLevel === "view" && sameAssignmentMember(assignment, currentUser);
}

function assignmentForViewer(assignment = {}, currentUser = {}, revealAll = false, published = false) {
  const own = sameAssignmentMember(assignment, currentUser);
  if (revealAll || own || published) return { ...assignment };
  return { ...assignment, workReport: "", rejectionReason: "", workLink: "", workFile: null };
}

function workflowForViewer(workflow = {}, currentUser = {}, options = {}) {
  const revealAll = options === true || !!options?.revealAll;
  const published = !!options?.published;
  return {
    assignments: (workflow.assignments || []).map((assignment) => assignmentForViewer(assignment, currentUser, revealAll, published)),
    edges: Array.isArray(workflow.edges) ? workflow.edges : [],
  };
}

function buildTeamDraftReport(workflow = {}, existingReport = "") {
  const startMarker = "--- Team member submissions (auto-synced) ---";
  const endMarker = "--- End team member submissions ---";
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const manual = String(existingReport || "").replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "g"), "").trim();
  const submissions = (workflow.assignments || []).filter((assignment) => assignment?.workReport || assignment?.workLink || assignment?.workFile?.url || assignment?.rejectionReason);
  const generated = submissions.map((assignment) => {
    const lines = [`${assignment.assigneeName || "Team member"} — ${taskManagementStatusLabel(assignment.status)}`];
    if (assignment.workReport) lines.push(assignment.workReport);
    if (assignment.rejectionReason) lines.push(`Rejected reason: ${assignment.rejectionReason}`);
    if (assignment.workLink) lines.push(`Work link: ${assignment.workLink}`);
    if (assignment.workFile?.url) lines.push(`Work file: ${assignment.workFile.name || "Open work file"} — ${assignment.workFile.url}`);
    return lines.join("\n");
  }).join("\n\n");
  return [manual, generated ? `${startMarker}\n${generated}\n${endMarker}` : ""].filter(Boolean).join("\n\n");
}

function latestTeamWorkAsset(workflow = {}, field = "") {
  const sorted = (workflow.assignments || []).slice().sort((a, b) => String(b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.updatedAt || a?.createdAt || "")));
  return sorted.find((assignment) => field === "file" ? assignment?.workFile?.url : assignment?.workLink) || null;
}

function assignmentPrerequisites(workflow = {}, assignment = {}) {
  const assignmentId = text(assignment?.id);
  const predecessorIds = (workflow.edges || []).filter((edge) => text(edge?.to) === assignmentId).map((edge) => text(edge?.from)).filter(Boolean);
  if (!predecessorIds.length) return [];
  const byId = new Map((workflow.assignments || []).map((item) => [text(item.id), item]));
  return predecessorIds.map((id) => byId.get(id)).filter(Boolean);
}

function canUpdateSectionInView(context, ticket = {}, section = {}, currentMember = {}) {
  if (context?.isPageAdmin) return true;
  const isCreator = taskManagementSameMember(ticket, currentMember);
  const isDepartment = sameText(section?.department || "", currentMember?.department || "");
  if (context?.view === "delegated") return isCreator;
  if (context?.view === "my") return isDepartment;
  if (context?.view === "all") return isCreator || isDepartment;
  return false;
}

async function authorizeAdmin(context, password = "") {
  if (context?.isPageAdmin) return true;
  const pages = [PAGE_BY_VIEW[context?.view], "Task Management"].filter(Boolean);
  const verified = await verifyPageAdminPasswordDirect(context?.account || {}, password, pages);
  if (verified === null) throw errorWithStatus("The direct Admin password context is unavailable.", 503);
  if (!verified) throw errorWithStatus("Invalid admin password.", 401);
  return true;
}

async function syncTicketStatus(ticketId) {
  const ticket = await loadRawTaskManagementTicket(ticketId);
  if (!ticket) return null;
  await updateById(ticketsTable(), ticket.id, { status: ticket.status, updated_at: new Date().toISOString() });
  return await loadRawTaskManagementTicket(ticketId);
}

function validateProjectPayload(payload = {}) {
  const title = text(payload?.title, 500);
  const description = text(payload?.description, 8000);
  const rawPriority = text(payload?.priority, 30);
  const normalizedPriority = priority(rawPriority);
  const dueDate = dateValue(payload?.dueDate);
  const plan = buildWorkflowPlan(payload?.sections, payload?.edges);
  if (!title) throw errorWithStatus("Project title is required.");
  if (!["urgent", "high", "normal", "low"].includes(rawPriority.toLowerCase())) throw errorWithStatus("Project priority is required.");
  if (!dueDate) throw errorWithStatus("Project target date is required.");
  if (!plan.sections.length) throw errorWithStatus("Add at least one workflow block.");
  if (plan.sections.some((section) => !section.department || !section.request || !section.deliveryDate)) throw errorWithStatus("Each workflow block requires a department, requested action, and delivery date.");
  if (plan.sections.some((section) => section.deliveryDate > dueDate)) throw errorWithStatus("A workflow block delivery date cannot be after the project target date.");
  return { title, description, priority: normalizedPriority, dueDate, ...plan };
}

export async function createTaskManagementTicket(context, payload = {}) {
  if (context?.view !== "delegated") throw errorWithStatus("Projects can be created from Delegated Tasks only.", 403);
  const project = validateProjectPayload(payload);
  const currentUser = taskManagementCurrentMember(context);
  const created = await insert(ticketsTable(), {
    title: project.title,
    description: project.description || null,
    priority: project.priority,
    due_date: project.dueDate,
    status: "not_started",
    created_by_id: currentUser.id || null,
    created_by_name: currentUser.name || null,
  });
  const ticketId = idFor(created);
  if (!ticketId) throw errorWithStatus("Project was created without an ID.", 500);

  try {
    const createdSectionIds = new Map();
    for (const section of project.sections) {
      const createdSection = await insert(sectionsTable(), {
        ticket_id: ticketId,
        department: section.department,
        request_text: section.request,
        details: section.details || null,
        delivery_date: section.deliveryDate || null,
        sort_order: section.sortOrder,
        execution_group: section.executionGroup,
        canvas_x: section.canvasX || null,
        canvas_y: section.canvasY || null,
        status: "not_started",
        ...attachmentColumns(section.attachments || section.attachment),
      });
      const createdId = idFor(createdSection);
      if (!createdId) throw errorWithStatus("Workflow block was created without an ID.", 500);
      createdSectionIds.set(section.clientId, createdId);
    }
    for (const edge of project.edges) {
      const fromSectionId = createdSectionIds.get(edge.from);
      const toSectionId = createdSectionIds.get(edge.to);
      if (!fromSectionId || !toSectionId) throw errorWithStatus("Workflow arrow could not be linked to its blocks.", 500);
      await insert(edgesTable(), { ticket_id: ticketId, from_section_id: fromSectionId, to_section_id: toSectionId });
    }
  } catch (error) {
    await deleteById(ticketsTable(), ticketId).catch(() => null);
    throw error;
  }
  return await loadRawTaskManagementTicket(ticketId);
}

export async function updateTaskManagementTicket(context, ticketId, payload = {}) {
  const cleanId = text(ticketId);
  if (!cleanId) throw errorWithStatus("Missing project ID.");
  const existingTicket = await loadRawTaskManagementTicket(cleanId);
  if (!existingTicket) throw errorWithStatus("Project not found.", 404);
  const currentUser = taskManagementCurrentMember(context);
  if (!taskManagementTicketBelongsToView(existingTicket, currentUser, context.view)) throw errorWithStatus("This project is not available in the selected Task Management view.", 403);
  await authorizeAdmin(context, payload?.adminPassword);
  const project = validateProjectPayload(payload);
  const now = new Date().toISOString();
  await updateById(ticketsTable(), cleanId, {
    title: project.title,
    description: project.description || null,
    priority: project.priority,
    due_date: project.dueDate,
    updated_at: now,
  });

  const existingSectionsById = new Map((existingTicket.sections || []).map((section) => [text(section.id), section]));
  const resolvedSectionIds = new Map();
  const retainedSectionIds = new Set();
  for (const section of project.sections) {
    const sectionPayload = {
      ticket_id: cleanId,
      department: section.department,
      request_text: section.request,
      details: section.details || null,
      delivery_date: section.deliveryDate,
      sort_order: section.sortOrder,
      execution_group: section.executionGroup,
      canvas_x: section.canvasX || null,
      canvas_y: section.canvasY || null,
      ...attachmentColumns(section.attachments || section.attachment),
      updated_at: now,
    };
    const existingSection = existingSectionsById.get(text(section.clientId));
    if (existingSection) {
      await updateById(sectionsTable(), existingSection.id, sectionPayload);
      resolvedSectionIds.set(section.clientId, text(existingSection.id));
      retainedSectionIds.add(text(existingSection.id));
    } else {
      const createdSection = await insert(sectionsTable(), { ...sectionPayload, status: "not_started", created_at: now });
      const createdId = idFor(createdSection);
      if (!createdId) throw errorWithStatus("Workflow block was created without an ID.", 500);
      resolvedSectionIds.set(section.clientId, createdId);
      retainedSectionIds.add(createdId);
    }
  }

  const oldEdgeIds = (existingTicket.edges || []).map((edge) => text(edge.id)).filter(Boolean);
  if (oldEdgeIds.length) await deleteByIds(edgesTable(), oldEdgeIds);
  const removedSectionIds = (existingTicket.sections || []).map((section) => text(section.id)).filter((id) => id && !retainedSectionIds.has(id));
  if (removedSectionIds.length) await deleteByIds(sectionsTable(), removedSectionIds);
  for (const edge of project.edges) {
    const fromSectionId = resolvedSectionIds.get(edge.from);
    const toSectionId = resolvedSectionIds.get(edge.to);
    if (!fromSectionId || !toSectionId) throw errorWithStatus("Workflow arrow could not be linked to its blocks.", 500);
    await insert(edgesTable(), { ticket_id: cleanId, from_section_id: fromSectionId, to_section_id: toSectionId });
  }
  return await syncTicketStatus(cleanId) || await loadRawTaskManagementTicket(cleanId);
}

export async function markTaskManagementDelivered(context, ticketId) {
  if (context?.view !== "delegated") throw errorWithStatus("Projects can be marked as delivered from Delegated Tasks only.", 403);
  const cleanId = text(ticketId);
  const ticket = await loadRawTaskManagementTicket(cleanId);
  if (!ticket) throw errorWithStatus("Project not found.", 404);
  const currentUser = taskManagementCurrentMember(context);
  if (!taskManagementSameMember(ticket, currentUser) && !context.isPageAdmin) throw errorWithStatus("Only the project creator or an admin can mark it as delivered.", 403);
  if (ticket.isArchived) throw errorWithStatus("Unarchive this project before marking it as delivered.", 409);

  const now = new Date().toISOString();
  const sectionIds = (ticket.sections || []).map((section) => text(section.id)).filter(Boolean);
  if (sectionIds.length) {
    await updateByIds(sectionsTable(), sectionIds, {
      status: "completed",
      completed_at: now,
      completed_by_id: currentUser.id || null,
      completed_by_name: currentUser.name || null,
      updated_at: now,
    });
    const assignmentGroups = await Promise.all(sectionIds.map((sectionId) => select(assignmentsTable(), { select: "id,section_id,status", section_id: `eq.${sectionId}`, limit: "1000", order: "id.asc" })));
    const assignmentIds = assignmentGroups.flat().map(idFor).filter(Boolean);
    if (assignmentIds.length) await updateByIds(assignmentsTable(), assignmentIds, { status: "completed", updated_at: now });
  }
  await updateById(ticketsTable(), cleanId, { status: "completed", updated_at: now });
  return await loadRawTaskManagementTicket(cleanId);
}

export async function archiveTaskManagementTicket(context, ticketId, { archived = true, adminPassword = "" } = {}) {
  const cleanId = text(ticketId);
  const ticket = await loadRawTaskManagementTicket(cleanId);
  if (!ticket) throw errorWithStatus("Project not found.", 404);
  const currentUser = taskManagementCurrentMember(context);
  if (!taskManagementTicketBelongsToView(ticket, currentUser, context.view)) throw errorWithStatus("This project is not available in the selected Task Management view.", 403);
  await authorizeAdmin(context, adminPassword);
  const shouldArchive = archived !== false;
  const now = new Date().toISOString();
  try {
    await updateById(ticketsTable(), cleanId, {
      is_archived: shouldArchive,
      archived_at: shouldArchive ? now : null,
      archived_by_id: shouldArchive ? (currentUser.id || null) : null,
      archived_by_name: shouldArchive ? (currentUser.name || null) : null,
      archived_from_view: shouldArchive ? context.view : null,
      updated_at: now,
    });
  } catch (error) {
    if (/is_archived|archived_at|archived_by_|archived_from_view/i.test(text(error?.message))) {
      throw errorWithStatus("The per-user project archive fields are not installed. Run the supplied Task Management personal-archive SQL migration, then refresh the page.", 503);
    }
    throw error;
  }
  return await loadRawTaskManagementTicket(cleanId);
}

export async function deleteTaskManagementTicket(context, ticketId, { adminPassword = "" } = {}) {
  const cleanId = text(ticketId);
  if (!cleanId) throw errorWithStatus("Missing project ID.");
  const ticket = await loadRawTaskManagementTicket(cleanId);
  if (!ticket) throw errorWithStatus("Project not found.", 404);
  const currentUser = taskManagementCurrentMember(context);
  const isAvailable = ticket.isArchived
    ? ((taskManagementArchivedByMember(ticket, currentUser) && taskManagementArchiveView(ticket) === context.view) || context.isPageAdmin)
    : taskManagementTicketBelongsToView(ticket, currentUser, context.view);
  if (!isAvailable) throw errorWithStatus("This project is not available in the selected Task Management view.", 403);
  await authorizeAdmin(context, adminPassword);
  await deleteById(ticketsTable(), cleanId);
  return { deletedId: cleanId };
}

async function sectionContext(context, sectionId, { requireMy = false } = {}) {
  if (requireMy && context?.view !== "my") throw errorWithStatus("Team assignment workflows are available from My Tasks only.", 403);
  const cleanId = text(sectionId);
  const sectionRow = await selectById(sectionsTable(), cleanId);
  if (!sectionRow) throw errorWithStatus("Workflow section not found.", 404);
  const ticket = await loadRawTaskManagementTicket(ticketIdForSection(sectionRow));
  if (!ticket) throw errorWithStatus("Project not found.", 404);
  const currentUser = taskManagementCurrentMember(context);
  const section = (ticket.sections || []).find((item) => text(item.id) === cleanId);
  if (!taskManagementTicketBelongsToView(ticket, currentUser, context.view)) {
    throw errorWithStatus(context.view === "my" ? "This project is not assigned to your department." : "This ticket is not available in the selected Task Management view.", 403);
  }
  if (requireMy) assertOwnDepartmentSection(ticket, section, currentUser);
  return { sectionId: cleanId, sectionRow, ticket, currentUser, section };
}

export async function getTaskManagementPeopleWorkflow(context, sectionId) {
  const state = await sectionContext(context, sectionId, { requireMy: true });
  const [members, workflow] = await Promise.all([membersForDepartment(state.section.department), loadPeopleWorkflow(state.sectionId)]);
  const visible = workflowForViewer(workflow, state.currentUser, {
    revealAll: taskManagementCanManageDepartment(context),
    published: normalizeTaskManagementStatus(state.section?.status) === "completed",
  });
  return { section: state.section, members, assignments: visible.assignments, edges: visible.edges, accessLevel: context.accessLevel || "view" };
}

export async function saveTaskManagementPeopleWorkflow(context, sectionId, payload = {}) {
  const state = await sectionContext(context, sectionId, { requireMy: true });
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Edit or Admin access is required to assign tasks to team members.", 403);
  const members = await membersForDepartment(state.section.department);
  const membersById = new Map(members.map((member) => [text(member.id), member]));
  const plan = buildPeopleWorkflowPlan(payload?.assignments, payload?.edges);
  if (!plan.assignments.length) throw errorWithStatus("Add at least one person task.");
  if (plan.assignments.some((assignment) => !assignment.assigneeId || !assignment.task || !assignment.deliveryDate)) throw errorWithStatus("Every person task requires a team member, assigned task, and delivery date.");
  if (plan.assignments.some((assignment) => !membersById.has(text(assignment.assigneeId)))) throw errorWithStatus("Every selected person must belong to your department.");
  const departmentDeliveryDate = text(state.section?.deliveryDate);
  if (departmentDeliveryDate && plan.assignments.some((assignment) => text(assignment.deliveryDate) > departmentDeliveryDate)) throw errorWithStatus("A personal task delivery date cannot be after its department task delivery date.");

  const existing = await loadPeopleWorkflow(state.sectionId);
  const existingById = new Map((existing.assignments || []).map((assignment) => [text(assignment.id), assignment]));
  const retainedIds = new Set();
  const resolvedIds = new Map();
  const now = new Date().toISOString();
  for (const assignment of plan.assignments) {
    const member = membersById.get(text(assignment.assigneeId));
    const row = {
      section_id: state.sectionId,
      assignee_id: text(member.id),
      assignee_name: member.name,
      task_text: assignment.task,
      details: assignment.details || null,
      delivery_date: assignment.deliveryDate,
      sort_order: assignment.sortOrder,
      execution_group: assignment.executionGroup,
      canvas_x: assignment.canvasX || null,
      canvas_y: assignment.canvasY || null,
      ...attachmentColumns(assignment.attachments || assignment.attachment),
      updated_at: now,
    };
    const previous = existingById.get(text(assignment.clientId));
    if (previous) {
      await updateById(assignmentsTable(), previous.id, row);
      retainedIds.add(text(previous.id));
      resolvedIds.set(text(assignment.clientId), text(previous.id));
    } else {
      const created = await insert(assignmentsTable(), { ...row, status: "not_started", created_at: now });
      const createdId = idFor(created);
      if (!createdId) throw errorWithStatus("Person task was created without an ID.", 500);
      retainedIds.add(createdId);
      resolvedIds.set(text(assignment.clientId), createdId);
    }
  }

  const oldEdgeIds = (existing.edges || []).map((edge) => text(edge.id)).filter(Boolean);
  if (oldEdgeIds.length) await deleteByIds(assignmentEdgesTable(), oldEdgeIds);
  const removedIds = (existing.assignments || []).map((assignment) => text(assignment.id)).filter((id) => id && !retainedIds.has(id));
  if (removedIds.length) await deleteByIds(assignmentsTable(), removedIds);
  for (const edge of plan.edges) {
    const fromId = resolvedIds.get(text(edge.from));
    const toId = resolvedIds.get(text(edge.to));
    if (!fromId || !toId) throw errorWithStatus("A team workflow arrow could not be linked to its person tasks.", 500);
    await insert(assignmentEdgesTable(), { section_id: state.sectionId, from_assignment_id: fromId, to_assignment_id: toId, created_at: now });
  }

  let sectionStatus = normalizeTaskManagementStatus(state.section?.status);
  if (plan.assignments.length && sectionStatus === "not_started") {
    sectionStatus = "in_progress";
    await updateById(sectionsTable(), state.sectionId, { status: sectionStatus, updated_at: now });
    await syncTicketStatus(state.ticket.id);
  }
  const saved = await loadPeopleWorkflow(state.sectionId);
  const visible = workflowForViewer(saved, state.currentUser, { revealAll: taskManagementCanManageDepartment(context), published: sectionStatus === "completed" });
  return { members, sectionStatus, assignments: visible.assignments, edges: visible.edges };
}

export async function deleteTaskManagementPeopleWorkflow(context, sectionId) {
  const state = await sectionContext(context, sectionId, { requireMy: true });
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Edit or Admin access is required to delete team tasks.", 403);
  const existing = await loadPeopleWorkflow(state.sectionId);
  const edgeIds = (existing.edges || []).map((edge) => text(edge.id)).filter(Boolean);
  const assignmentIds = (existing.assignments || []).map((assignment) => text(assignment.id)).filter(Boolean);
  if (edgeIds.length) await deleteByIds(assignmentEdgesTable(), edgeIds);
  if (assignmentIds.length) await deleteByIds(assignmentsTable(), assignmentIds);
  return { sectionId: state.sectionId, assignments: [], edges: [] };
}

export async function archiveTaskManagementPeopleWorkflow(context, sectionId, archived = false) {
  const state = await sectionContext(context, sectionId, { requireMy: true });
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Edit or Admin access is required to archive team tasks.", 403);
  const existing = await loadPeopleWorkflow(state.sectionId);
  const now = new Date().toISOString();
  for (const assignment of existing.assignments || []) {
    await updateById(assignmentsTable(), assignment.id, archived
      ? { status: "cancelled", updated_at: now }
      : { status: "not_started", rejection_reason: null, updated_at: now });
  }
  const saved = await loadPeopleWorkflow(state.sectionId);
  return { sectionId: state.sectionId, archived: !!archived, assignments: saved.assignments, edges: saved.edges };
}

async function assignmentContext(context, assignmentId) {
  if (context?.view !== "my") throw errorWithStatus("Team-member tasks can be managed from My Tasks only.", 403);
  const cleanId = text(assignmentId);
  const assignmentRow = await selectById(assignmentsTable(), cleanId);
  if (!assignmentRow) throw errorWithStatus("Team-member task not found.", 404);
  const assignment = serializeAssignment(assignmentRow);
  const state = await sectionContext(context, assignment.sectionId, { requireMy: true });
  return { ...state, assignmentId: cleanId, assignment, assignmentRow };
}

export async function archiveTaskManagementAssignment(context, assignmentId, archived = false) {
  const state = await assignmentContext(context, assignmentId);
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Edit or Admin access is required to archive team tasks.", 403);
  const now = new Date().toISOString();
  await updateById(assignmentsTable(), state.assignmentId, archived
    ? { status: "cancelled", updated_at: now }
    : { status: "not_started", rejection_reason: null, updated_at: now });
  const updatedRow = await selectById(assignmentsTable(), state.assignmentId);
  return { archived: !!archived, assignment: serializeAssignment(updatedRow) };
}

export async function deleteTaskManagementAssignment(context, assignmentId) {
  const state = await assignmentContext(context, assignmentId);
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Edit or Admin access is required to delete team tasks.", 403);
  const workflow = await loadPeopleWorkflow(state.assignment.sectionId);
  const connectedEdgeIds = (workflow.edges || [])
    .filter((edge) => text(edge.from) === state.assignmentId || text(edge.to) === state.assignmentId)
    .map((edge) => text(edge.id)).filter(Boolean);
  if (connectedEdgeIds.length) await deleteByIds(assignmentEdgesTable(), connectedEdgeIds);
  await deleteByIds(assignmentsTable(), [state.assignmentId]);
  return { assignmentId: state.assignmentId, sectionId: state.assignment.sectionId };
}

export async function updateTaskManagementAssignmentWork(context, assignmentId, payload = {}) {
  const state = await assignmentContext(context, assignmentId);
  if (!canEditAssignmentWork(context, state.assignment, state.currentUser)) throw errorWithStatus("You can update only the team-member task assigned to you.", 403);
  const requestedStatus = normalizeTaskManagementStatus(payload?.status, "");
  if (!["not_started", "in_progress", "rejected", "completed"].includes(requestedStatus)) throw errorWithStatus("A valid task status is required.");
  const rejectionReason = text(payload?.rejectionReason, 4000);
  if (requestedStatus === "rejected" && !rejectionReason) throw errorWithStatus("Rejected reason is required when the task status is Rejected.");

  const workflowBefore = await loadPeopleWorkflow(state.assignment.sectionId);
  const liveAssignment = (workflowBefore.assignments || []).find((item) => text(item.id) === state.assignmentId) || state.assignment;
  const blockedBy = assignmentPrerequisites(workflowBefore, liveAssignment).find((item) => normalizeTaskManagementStatus(item?.status) !== "completed");
  if (blockedBy && ["in_progress", "completed"].includes(requestedStatus)) throw errorWithStatus("Complete the connected prerequisite team task first.", 409);

  const workReport = text(payload?.workReport, 12000);
  const workLink = text(payload?.workLink, 4000);
  if (workLink && !/^https?:\/\//i.test(workLink)) throw errorWithStatus("Work link must start with http:// or https://.");
  const workFiles = attachments(payload?.workFiles || payload?.workFile || []);
  await updateById(assignmentsTable(), state.assignmentId, {
    status: requestedStatus,
    work_report: workReport || null,
    rejection_reason: requestedStatus === "rejected" ? rejectionReason : null,
    work_link: workLink || null,
    ...workFileColumns(workFiles),
    updated_at: new Date().toISOString(),
  });

  const saved = await loadPeopleWorkflow(state.assignment.sectionId);
  const teamDraftReport = buildTeamDraftReport(saved, state.section.workReport || state.section.completionNote || "");
  const latestLinkOwner = latestTeamWorkAsset(saved, "link");
  const latestFileOwner = latestTeamWorkAsset(saved, "file");
  await updateById(sectionsTable(), state.assignment.sectionId, {
    work_report: teamDraftReport || null,
    completion_note: teamDraftReport || null,
    work_link: latestLinkOwner?.workLink || state.section.workLink || null,
    work_file_name: latestFileOwner?.workFile?.name || state.section.workFile?.name || null,
    work_file_url: latestFileOwner?.workFile?.url || state.section.workFile?.url || null,
    work_file_type: latestFileOwner?.workFile?.type || state.section.workFile?.type || null,
    work_file_size: latestFileOwner?.workFile?.size || state.section.workFile?.size || null,
    updated_at: new Date().toISOString(),
  });
  const visible = workflowForViewer(saved, state.currentUser, { revealAll: taskManagementCanManageDepartment(context), published: normalizeTaskManagementStatus(state.section?.status) === "completed" });
  const updatedAssignment = (visible.assignments || []).find((item) => text(item.id) === state.assignmentId) || null;
  return { sectionId: state.assignment.sectionId, assignment: updatedAssignment, assignments: visible.assignments, edges: visible.edges };
}

export async function updateTaskManagementSectionWork(context, sectionId, payload = {}) {
  if (context?.view !== "my") throw errorWithStatus("Section work can be updated from My Tasks only.", 403);
  const state = await sectionContext(context, sectionId, { requireMy: true });
  if (!taskManagementCanManageDepartment(context)) throw errorWithStatus("Department work can be updated only by users with Edit or Admin access.", 403);
  const requestedStatus = normalizeTaskManagementStatus(payload?.status, "");
  if (!["not_started", "in_progress", "rejected", "completed"].includes(requestedStatus)) throw errorWithStatus("A valid task status is required.");
  const rejectionReason = text(payload?.rejectionReason, 4000);
  if (requestedStatus === "rejected" && !rejectionReason) throw errorWithStatus("Rejected reason is required when the task status is Rejected.");
  const blocked = sectionPrerequisites(state.ticket, state.section).find((item) => normalizeTaskManagementStatus(item.status) !== "completed");
  if (blocked && ["in_progress", "completed"].includes(requestedStatus)) throw errorWithStatus("Complete the connected prerequisite block first before starting this section.", 409);
  const workReport = text(payload?.workReport, 12000);
  const workLink = text(payload?.workLink, 4000);
  if (workLink && !/^https?:\/\//i.test(workLink)) throw errorWithStatus("Work link must start with http:// or https://.");
  const workFiles = attachments(payload?.workFiles || payload?.workFile || []);
  const now = new Date().toISOString();
  const patch = {
    status: requestedStatus,
    work_report: workReport || null,
    completion_note: workReport || null,
    rejection_reason: requestedStatus === "rejected" ? rejectionReason : null,
    work_link: workLink || null,
    ...workFileColumns(workFiles),
    updated_at: now,
  };
  if (requestedStatus === "in_progress" && !state.section?.startedAt) patch.started_at = now;
  if (requestedStatus === "completed") {
    patch.completed_at = now;
    patch.completed_by_id = state.currentUser.id || null;
    patch.completed_by_name = state.currentUser.name || null;
  } else {
    patch.completed_at = null;
    patch.completed_by_id = null;
    patch.completed_by_name = null;
  }
  await updateById(sectionsTable(), state.sectionId, patch);

  const assignmentRows = await select(assignmentsTable(), { select: "id,status", section_id: `eq.${state.sectionId}`, limit: "1000", order: "id.asc" });
  const activeIds = (Array.isArray(assignmentRows) ? assignmentRows : [])
    .filter((row) => normalizeTaskManagementStatus(row?.status) !== "cancelled")
    .map(idFor).filter(Boolean);
  if (activeIds.length) await updateByIds(assignmentsTable(), activeIds, { status: requestedStatus, rejection_reason: requestedStatus === "rejected" ? rejectionReason : null, updated_at: now });
  const updatedTicket = await syncTicketStatus(state.ticket.id) || await loadRawTaskManagementTicket(state.ticket.id);
  const updatedSection = (updatedTicket?.sections || []).find((item) => text(item.id) === state.sectionId) || null;
  return { ticket: updatedTicket, section: updatedSection };
}

export async function updateTaskManagementSection(context, sectionId, payload = {}) {
  const state = await sectionContext(context, sectionId);
  if (!canUpdateSectionInView(context, state.ticket, state.section, state.currentUser)) throw errorWithStatus("You can update only the workflow work assigned to you in this view.", 403);
  const requestedStatus = Object.prototype.hasOwnProperty.call(payload || {}, "status") ? normalizeTaskManagementStatus(payload.status, "") : "";
  if (!["not_started", "in_progress", "rejected", "completed"].includes(requestedStatus)) throw errorWithStatus("A valid section status is required.");
  const blocked = sectionPrerequisites(state.ticket, state.section).find((item) => normalizeTaskManagementStatus(item.status) !== "completed");
  if (blocked && ["in_progress", "completed"].includes(requestedStatus)) throw errorWithStatus("Complete the connected prerequisite block first before starting this section.", 409);
  const completionNote = Object.prototype.hasOwnProperty.call(payload || {}, "completionNote") ? text(payload.completionNote, 8000) : undefined;
  const now = new Date().toISOString();
  const patch = { status: requestedStatus, updated_at: now };
  if (typeof completionNote !== "undefined") patch.completion_note = completionNote || null;
  if (requestedStatus === "in_progress" && !state.section?.startedAt) patch.started_at = now;
  if (requestedStatus === "completed") {
    patch.completed_at = now;
    patch.completed_by_id = state.currentUser.id || null;
    patch.completed_by_name = state.currentUser.name || null;
  } else {
    patch.completed_at = null;
    patch.completed_by_id = null;
    patch.completed_by_name = null;
  }
  await updateById(sectionsTable(), state.sectionId, patch);
  return await syncTicketStatus(state.ticket.id) || await loadRawTaskManagementTicket(state.ticket.id);
}

export async function verifyTaskManagementAdminPassword(context, password = "") {
  if (context?.isPageAdmin) return true;
  const clean = text(password);
  if (!clean) throw errorWithStatus("Admin password is required.", 400);
  return await authorizeAdmin(context, clean);
}

export function taskManagementMutationError(error, fallback = "Task Management action failed.") {
  const detail = text(error?.message);
  if (/delivery_date.*schema cache|Could not find the .*delivery_date/i.test(detail)) return "The workflow block delivery-date column is not installed. Run the supplied delivery-date SQL migration, then refresh this page.";
  if (/(attachments|attachment_(name|url|type|size)).*schema cache|Could not find the .*(attachments|attachment_)/i.test(detail)) return "Task Management multi-attachment columns are not installed. Run the supplied multi-attachments SQL migration, then refresh this page.";
  if (/(work_file_|work_report|rejection_reason|work_link).*schema cache|Could not find the .*(work_file_|work_report|rejection_reason|work_link)/i.test(detail)) return "The My Tasks work fields are not installed. Run the supplied My Tasks SQL migration, then refresh this page.";
  if (/relation .* does not exist|Could not find the table|schema cache/i.test(detail)) return "Task Management workflow tables are not installed. Run the supplied Supabase SQL migration, then refresh this page.";
  return detail || fallback;
}
