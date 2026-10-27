import "server-only";

import { rpc } from "./supabase-rest";
import { directTaskManagementContext, getTaskManagementTicket } from "./task-management-data";
import { getTaskManagementPeopleWorkflow } from "./task-management-mutations";
import { taskLinkIsVisible } from "./storage-task-record-policy.mjs";

const MAX_LINKS = 50;
function deny(message, status = 403) {
  const error = new Error(message);
  error.code = "STORAGE_RECORD_ACCESS_DENIED";
  error.status = status;
  throw error;
}

/**
 * Opt-in: verify live database association AND actual Task Management record
 * visibility. The signed file reference alone never establishes record access.
 * A task URL can be shared with a colleague who is allowed to see its project.
 */
export async function assertTaskStorageRecordAccess(reference) {
  if (!reference || reference.length > 6000) deny("Invalid attachment reference.", 400);
  let links;
  try {
    links = await rpc("erp_storage_task_file_links", { p_reference: reference }, { profileName: "storage.record-task-links" });
  } catch (error) {
    console.warn("Task attachment record verification unavailable:", error?.message);
    deny("Task attachment authorization is temporarily unavailable.", 503);
  }
  if (!Array.isArray(links) || links.length >= MAX_LINKS) deny("Task attachment record verification is incomplete.", 503);
  if (!links.length) deny("This attachment is not linked to an available task.");

  const contexts = [];
  for (const view of ["all", "my", "delegated"]) {
    const context = await directTaskManagementContext(view);
    if (context?.ok) contexts.push(context);
  }
  if (!contexts.length) deny("Task Management access denied.");

  for (const link of links) {
    const ticketId = String(link.ticket_id || "");
    const sectionId = String(link.section_id || "");
    if (!ticketId || !sectionId) continue;
    for (const context of contexts) {
      let ticket;
      try {
        // Force current authorization, including active Own/Team/All scope.
        ticket = await getTaskManagementTicket(ticketId, context, { force: true });
      } catch (error) {
        if (Number(error?.status) === 403 || Number(error?.status) === 404) continue;
        deny("Task attachment authorization is temporarily unavailable.", 503);
      }
      if (!ticket) continue;
      let workflow = null;
      if (String(link.file_kind || "").startsWith("assignment_")) {
        if (context.view !== "my") continue;
        try {
          workflow = await getTaskManagementPeopleWorkflow(context, sectionId);
        } catch (error) {
          if (Number(error?.status) === 403 || Number(error?.status) === 404) continue;
          deny("Task assignment file authorization is temporarily unavailable.", 503);
        }
      }
      if (taskLinkIsVisible(link, ticket, reference, workflow)) return;
    }
  }
  deny("This attachment is outside your permitted task records.");
}
