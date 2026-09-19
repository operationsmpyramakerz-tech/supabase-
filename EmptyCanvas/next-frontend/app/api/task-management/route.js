import { NextResponse } from "next/server";
import {
  directTaskManagementContext,
  listTaskManagementTickets,
  taskManagementDataError,
} from "../../../lib/task-management-data";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { measurePerformance } from "../../../lib/performance-profiler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

async function GETImpl(request) {
  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "").trim().toLowerCase();
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";

  try {
    const context = await directTaskManagementContext(view);
    if (context?.ok) {
      const tickets = await listTaskManagementTickets(context, { force });
      return json({ ok: true, tickets, source: "supabase-next" });
    }
    if (context && !context.ok) return json({ ok: false, error: context.error || "Task Management is not available." }, { status: context.status || 403 });
  } catch (error) {
    console.warn("[task-management] direct list failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/task-management?view=${encodeURIComponent(view)}`, { timeoutMs: 35_000, fresh: force });
  if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
  return json({ ok: false, tickets: [], error: legacy.error || legacy.data?.error || taskManagementDataError(new Error("Task Management list is unavailable.")) }, { status: legacy.status || 502 });
}

export async function GET(request) {
  return await measurePerformance("route", "task-management.list", async () => await GETImpl(request), { method: "GET" });
}
