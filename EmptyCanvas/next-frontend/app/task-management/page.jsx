import { redirect } from "next/navigation";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export default async function TaskManagementIndexPage() {
  const response = await fetchLegacyJson("/api/account", { timeoutMs: 9000 });
  if (response.status === 401 || response.status === 403) redirect("/login?next=/next/task-management");
  if (!response.ok || !response.data) redirect("/home");

  const allowed = new Set((Array.isArray(response.data.allowedPages) ? response.data.allowedPages : []).map(normalize));
  const broad = allowed.has("task management") || allowed.has("taskmanagement") || allowed.has("department tickets");
  if (broad || allowed.has("all tasks")) redirect("/task-management/all-tasks");
  if (allowed.has("my tasks")) redirect("/task-management/my-tasks");
  if (allowed.has("delegated tasks")) redirect("/task-management/delegated-tasks");
  redirect("/home");
}
