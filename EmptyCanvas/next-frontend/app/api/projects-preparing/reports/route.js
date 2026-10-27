import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { preparingProjectReport } from "../../../../lib/preparing-report-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate(["Projects Preparing"]), "preparing.view");
  if (!gate.ok) return response({ ok: false, error: gate.error || "Access denied." }, gate.status || 403);
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(projectId))
    return response({ ok: false, error: "Select a valid project." }, 400);
  try { return response({ ok: true, report: await preparingProjectReport(projectId) }); }
  catch (error) {
    console.error("[preparing-reports]", error?.details || error);
    return response({ ok: false, error: error?.message || "Unable to prepare project report." }, error?.status >= 400 && error?.status < 600 ? error.status : 500);
  }
}
