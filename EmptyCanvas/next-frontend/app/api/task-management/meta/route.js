import { NextResponse } from "next/server";
import {
  directTaskManagementContext,
  taskManagementMeta,
  taskManagementDataError,
} from "../../../../lib/task-management-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "").trim().toLowerCase();
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";

  try {
    const context = await directTaskManagementContext(view);
    if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management is not available." }, { status: context?.status || 503 });
    return json({ ...(await taskManagementMeta(context, { force })), source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: taskManagementDataError(error) }, { status: Number(error?.status) || 500 });
  }
}
