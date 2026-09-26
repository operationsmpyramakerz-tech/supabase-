import { NextResponse } from "next/server";

import {
  directTaskManagementContext,
  getTaskManagementTicket,
  taskManagementDataError,
} from "../../../../lib/task-management-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request) {
  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "").trim().toLowerCase();
  const id = String(url.searchParams.get("id") || "").trim();
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";
  if (!id) return json({ ok: false, error: "Missing project ID." }, 400);

  try {
    const context = await directTaskManagementContext(view);
    if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management access denied." }, context?.status || 503);
    const ticket = await getTaskManagementTicket(id, context, { force });
    if (!ticket) return json({ ok: false, error: "Ticket not found." }, 404);
    return json({ ok: true, ticket, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: taskManagementDataError(error) }, Number(error?.status) || 500);
  }
}
