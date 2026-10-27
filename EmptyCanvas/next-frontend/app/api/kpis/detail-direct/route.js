import { NextResponse } from "next/server";

import { directKpisContext } from "../../../../lib/kpis-data";
import { getKpiReviewDetailAuthorized, kpiMutationError } from "../../../../lib/kpis-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request) {
  const context = await directKpisContext().catch(() => null);
  if (!context?.ok) return json({ ok: false, error: context?.error || "KPI access denied." }, context?.status || 503);
  try {
    const url = new URL(request.url);
    const result = await getKpiReviewDetailAuthorized(context, url.searchParams.get("id"), url.searchParams.get("adminPassword") || "");
    return json({ ...result, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: kpiMutationError(error, "Failed to load KPI review.") }, Number(error?.status) || 500);
  }
}
