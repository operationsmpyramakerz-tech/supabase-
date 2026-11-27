import { NextResponse, after } from "next/server";
import { dispatchQueuedNotifications } from "../../../../lib/notification-event-worker";

import { directTaskManagementContext } from "../../../../lib/task-management-data";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { assertTaskActionScope } from "../../../../lib/task-data-scope";
import {
  archiveTaskManagementAssignment,
  archiveTaskManagementPeopleWorkflow,
  archiveTaskManagementTicket,
  createTaskManagementTicket,
  deleteTaskManagementAssignment,
  deleteTaskManagementPeopleWorkflow,
  deleteTaskManagementTicket,
  getTaskManagementPeopleWorkflow,
  markTaskManagementDelivered,
  saveTaskManagementPeopleWorkflow,
  taskManagementMutationError,
  updateTaskManagementAssignmentWork,
  updateDirectTaskWork,
  updateTaskManagementSection,
  updateTaskManagementSectionWork,
  updateTaskManagementTicket,
} from "../../../../lib/task-management-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
export const runtime = "nodejs";

function text(value) { return String(value ?? "").trim(); }
function deliverTaskEvents() {
  after(() => dispatchQueuedNotifications({ limit: 6 }).catch((error) =>
    console.warn("[notifications] Task delivery deferred:", error?.message)));
}
function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Keep action mapping next to the endpoint; unknown actions are never granted.
const ACTION_PERMISSION = Object.freeze({
  "ticket-create": "tasks.project_create",
  "ticket-update": "tasks.project_edit",
  "ticket-task-work": "tasks.assignment_work",
  "ticket-archive": "tasks.project_archive",
  "ticket-delete": "tasks.project_delete",
  "ticket-mark-delivered": "tasks.mark_delivered",
  "people-workflow-save": "tasks.workflow_save",
  "people-workflow-delete": "tasks.workflow_delete",
  "people-workflow-archive": "tasks.workflow_archive",
  "assignment-archive": "tasks.assignment_archive",
  "assignment-delete": "tasks.assignment_delete",
  "assignment-work": "tasks.assignment_work",
  "section-work": "tasks.section_work",
  "section-update": "tasks.section_edit",
});

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action).toLowerCase();
  const view = text(body?.view).toLowerCase();
  const context = await directTaskManagementContext(view);
  if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management access denied." }, context?.status || 503);
  const required = ACTION_PERMISSION[action];
  if (required) {
    const authorized = featureGate(context, required);
    if (!authorized.ok) return json({ ok: false, error: authorized.error }, authorized.status || 403);
  }

  try {
    if (required || action === "people-workflow-get") {
      // Validate the actual database owner/assignee before any mutation.
      await assertTaskActionScope(context, required || "tasks.view", action, body);
    }
    if (action === "ticket-create") {
      const ticket = await createTaskManagementTicket(context, body);
      return json({ ok: true, ticket, source: "supabase-next" }, 201);
    }
    if (action === "ticket-update") {
      const ticket = await updateTaskManagementTicket(context, body?.ticketId || body?.id, body);
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    if (action === "ticket-task-work") {
      const ticket = await updateDirectTaskWork(context, body?.ticketId || body?.id, body);
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    if (action === "ticket-archive") {
      const ticket = await archiveTaskManagementTicket(context, body?.ticketId || body?.id, { archived: body?.archived !== false, adminPassword: body?.adminPassword });
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    if (action === "ticket-delete") {
      const result = await deleteTaskManagementTicket(context, body?.ticketId || body?.id, { adminPassword: body?.adminPassword });
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "ticket-mark-delivered") {
      const ticket = await markTaskManagementDelivered(context, body?.ticketId || body?.id);
      deliverTaskEvents();
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    if (action === "people-workflow-get") {
      const result = await getTaskManagementPeopleWorkflow(context, body?.sectionId || body?.id);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "people-workflow-save") {
      const result = await saveTaskManagementPeopleWorkflow(context, body?.sectionId || body?.id, body);
      deliverTaskEvents();
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "people-workflow-delete") {
      const result = await deleteTaskManagementPeopleWorkflow(context, body?.sectionId || body?.id);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "people-workflow-archive") {
      const result = await archiveTaskManagementPeopleWorkflow(context, body?.sectionId || body?.id, !!body?.archived);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "assignment-archive") {
      const result = await archiveTaskManagementAssignment(context, body?.assignmentId || body?.id, !!body?.archived);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "assignment-delete") {
      const result = await deleteTaskManagementAssignment(context, body?.assignmentId || body?.id);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "assignment-work") {
      const result = await updateTaskManagementAssignmentWork(context, body?.assignmentId || body?.id, body);
      deliverTaskEvents();
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "section-work") {
      const result = await updateTaskManagementSectionWork(context, body?.sectionId || body?.id, body);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "section-update") {
      const ticket = await updateTaskManagementSection(context, body?.sectionId || body?.id, body);
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    return json({ ok: false, error: "Unknown Task Management action." }, 400);
  } catch (error) {
    console.error("POST /next/api/task-management/mutations-direct error:", error?.details || error);
    return json({ ok: false, error: taskManagementMutationError(error) }, Number(error?.status) || 500);
  }
}
