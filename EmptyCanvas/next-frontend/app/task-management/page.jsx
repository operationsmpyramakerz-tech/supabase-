import { redirect } from "next/navigation";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function allowedTokens(values = []) {
  const out = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = normalize(value);
    if (!raw) continue;
    out.add(raw);
    if (raw.startsWith("/next/")) out.add(raw.slice(5));
    if (raw.startsWith("/")) out.add(raw.slice(1));
    else out.add(`/${raw}`);
  }
  return out;
}

export default async function TaskManagementIndexPage() {
  const gate = await getLegacyAccountGate([]);
  if (gate.status === 401 || gate.status === 403) redirect("/login?next=/next/task-management");
  if (!gate.ok || !gate.account) redirect("/home");

  const allowed = allowedTokens(gate.account.allowedPages);
  const broad = allowed.has("task management") || allowed.has("taskmanagement") || allowed.has("department tickets") || allowed.has("/task-management") || allowed.has("task-management");
  if (broad || allowed.has("all tasks") || allowed.has("/task-management/all-tasks") || allowed.has("task-management/all-tasks")) redirect("/next/task-management/all-tasks");
  if (allowed.has("my tasks") || allowed.has("/task-management/my-tasks") || allowed.has("task-management/my-tasks")) redirect("/next/task-management/my-tasks");
  if (allowed.has("delegated tasks") || allowed.has("/task-management/delegated-tasks") || allowed.has("task-management/delegated-tasks")) redirect("/next/task-management/delegated-tasks");
  redirect("/home");
}
