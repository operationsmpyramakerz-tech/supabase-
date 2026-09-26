import { NextResponse } from "next/server";

import { directKpisContext } from "../../../../lib/kpis-data";
import { createKpiReview, kpiMutationError, saveKpiStandard, updateKpiReviewScores } from "../../../../lib/kpis-mutations";

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
    const action = String(body?.action || "").trim().toLowerCase();
    let result;
    if (action === "save_standard") result = await saveKpiStandard(context, body);
    else if (action === "create_review") result = await createKpiReview(context, body);
    else if (action === "update_scores") result = await updateKpiReviewScores(context, body);
    else return json({ ok: false, error: "Unsupported KPI mutation action." }, 400);
    return json({ ...result, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: kpiMutationError(error) }, Number(error?.status) || 500);
  }
}
