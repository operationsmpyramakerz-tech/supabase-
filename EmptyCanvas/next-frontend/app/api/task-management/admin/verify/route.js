import { NextResponse } from "next/server";

import { directTaskManagementContext } from "../../../../../lib/task-management-data";
import { taskManagementMutationError, verifyTaskManagementAdminPassword } from "../../../../../lib/task-management-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const view = String(body?.view || "").trim().toLowerCase();
  const context = await directTaskManagementContext(view);
  if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management access denied." }, context?.status || 503);
  try {
    await verifyTaskManagementAdminPassword(context, body?.adminPassword || body?.password || "");
    return json({ ok: true, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: taskManagementMutationError(error, "Failed to verify admin password.") }, Number(error?.status) || 500);
  }
}
