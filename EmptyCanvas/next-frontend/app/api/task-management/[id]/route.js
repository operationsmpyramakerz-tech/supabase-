import { NextResponse } from "next/server";
import {
  directTaskManagementContext,
  getTaskManagementTicket,
  taskManagementDataError,
} from "../../../../lib/task-management-data";
import { fetchLegacyJson } from "../../../../lib/legacy-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request, { params }) {
  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "").trim().toLowerCase();
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";
  const resolved = await params;
  const id = String(resolved?.id || "").trim();
  if (!id) return json({ ok: false, error: "Missing project ID." }, { status: 400 });

  try {
    const context = await directTaskManagementContext(view);
    if (context?.ok) {
      const ticket = await getTaskManagementTicket(id, context, { force });
      if (!ticket) return json({ ok: false, error: "Ticket not found." }, { status: 404 });
      return json({ ok: true, ticket, source: "supabase-next" });
    }
    if (context && !context.ok) return json({ ok: false, error: context.error || "Task Management is not available." }, { status: context.status || 403 });
  } catch (error) {
    if (Number(error?.status) === 403) return json({ ok: false, error: error.message }, { status: 403 });
    console.warn("[task-management] direct detail failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/task-management/${encodeURIComponent(id)}?view=${encodeURIComponent(view)}`, { timeoutMs: 25_000, fresh: force });
  if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
  return json({ ok: false, error: legacy.error || legacy.data?.error || taskManagementDataError(new Error("Task Management detail is unavailable.")) }, { status: legacy.status || 502 });
}
