import { NextResponse } from "next/server";
import {
  directTaskManagementContext,
  listTaskManagementTickets,
  taskManagementDataError,
} from "../../../lib/task-management-data";
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
    if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management is not available." }, { status: context?.status || 503 });
    const tickets = await listTaskManagementTickets(context, { force });
    return json({ ok: true, tickets, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, tickets: [], error: taskManagementDataError(error) }, { status: Number(error?.status) || 500 });
  }
}

export async function GET(request) {
  return await measurePerformance("route", "task-management.list", async () => await GETImpl(request), { method: "GET" });
}
