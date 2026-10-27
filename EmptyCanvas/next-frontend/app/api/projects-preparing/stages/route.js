import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { updatePreparingStage } from "../../../../lib/preparing-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PATCH(request) {
  const gate = featureGate(await getDirectAccountGate(["Projects Preparing"]), "preparing.stage_update");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  try {
    const body = await request.json();
    const stage = await updatePreparingStage(body?.schoolId, body, gate.account);
    return NextResponse.json({ ok: true, stage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[projects-preparing:stages]", error?.details || error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to save stage." }, { status: Number(error?.status) || 500 });
  }
}
