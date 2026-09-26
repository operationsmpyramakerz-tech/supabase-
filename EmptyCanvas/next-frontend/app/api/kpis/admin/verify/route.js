import { NextResponse } from "next/server";

import { directKpisContext } from "../../../../../lib/kpis-data";
import { kpiMutationError, verifyKpisAdminPassword } from "../../../../../lib/kpis-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const context = await directKpisContext().catch(() => null);
  if (!context?.ok) return json({ ok: false, error: context?.error || "KPI access denied." }, context?.status || 503);
  try {
    const body = await request.json().catch(() => ({}));
    await verifyKpisAdminPassword(context, body?.password || body?.adminPassword || "");
    return json({ ok: true, bypassedByPageAdmin: context.accessLevel === "admin", source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: kpiMutationError(error, "Failed to verify admin password.") }, Number(error?.status) || 500);
  }
}
