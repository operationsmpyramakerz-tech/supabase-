// No Supabase or Next.js dependencies: shared exact reference matching.
export function referenceFromTaskUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 6000) return "";
  try {
    const url = new URL(raw, "https://erp.invalid");
    if (url.origin !== "https://erp.invalid") return "";
    if (url.pathname === "/next/api/storage/file-direct") {
      return String(url.searchParams.get("reference") || "");
    }
    const legacy = url.pathname.match(/^\/api\/storage\/file\/([A-Za-z0-9._~-]+)$/i);
    return legacy?.[1] || "";
  } catch { return ""; }
}

export function hasTaskFileReference(files, reference) {
  const items = Array.isArray(files) ? files : [];
  return !!reference && items.some(item => referenceFromTaskUrl(item?.url) === reference);
}

export function taskLinkIsVisible(link, ticket, reference, workflow = null) {
  if (!ticket || String(link?.ticket_id || "") !== String(ticket?.id || "")) return false;
  const kind = String(link.file_kind || "");
  if (kind === "direct_task_attachment") return ticket.kind === "task" && !link.section_id && !link.assignment_id && hasTaskFileReference(ticket.directAttachments, reference);
  const section = (ticket.sections || []).find(item => String(item.id) === String(link.section_id));
  if (!section) return false;
  if (kind === "section_attachment") return hasTaskFileReference(section.attachments, reference);
  if (kind === "section_work") return hasTaskFileReference(section.workFiles, reference);
  const assignment = (workflow?.assignments || []).find(item => String(item.id) === String(link.assignment_id));
  if (!assignment || String(assignment.sectionId) !== String(section.id)) return false;
  if (kind === "assignment_attachment") return hasTaskFileReference(assignment.attachments, reference);
  if (kind === "assignment_work") return hasTaskFileReference(assignment.workFiles, reference);
  return false;
}
