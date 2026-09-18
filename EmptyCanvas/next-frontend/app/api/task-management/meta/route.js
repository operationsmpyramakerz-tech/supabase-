import { NextResponse } from "next/server";
import {
  directTaskManagementContext,
  taskManagementMeta,
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

export async function GET(request) {
  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "").trim().toLowerCase();
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";

  try {
    const context = await directTaskManagementContext(view);
    if (context?.ok) return json({ ...(await taskManagementMeta(context, { force })), source: "supabase-next" });
    if (context && !context.ok) return json({ ok: false, error: context.error || "Task Management is not available." }, { status: context.status || 403 });
  } catch (error) {
    console.warn("[task-management] direct meta failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/task-management/meta?view=${encodeURIComponent(view)}`, { timeoutMs: 20_000, fresh: force });
  if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
  return json({ ok: false, error: legacy.error || legacy.data?.error || taskManagementDataError(new Error("Task Management options are unavailable.")) }, { status: legacy.status || 502 });
}
