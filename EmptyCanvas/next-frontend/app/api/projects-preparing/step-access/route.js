import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { listPreparingStepAccessUsers } from "../../../../lib/preparing-step-access-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const gate = featureGate(await getDirectAccountGate(["Projects Preparing"]), "preparing.view");
  if (!gate.ok) return reply({ ok: false, error: gate.error || "Access denied." }, gate.status || 403);
  try { return reply({ ok: true, stages: await listPreparingStepAccessUsers() }); }
  catch (error) {
    console.error("[projects-preparing:step-access]", error?.message || error);
    return reply({ ok: false, error: "Unable to verify users with access to project stages." }, 503);
  }
}
