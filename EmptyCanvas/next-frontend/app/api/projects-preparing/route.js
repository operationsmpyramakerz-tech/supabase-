import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { featureGate } from "../../../lib/feature-permissions-server";
import { preparingWorkspace, preparingCatalog, createPreparingProject, updatePreparingProject, addPreparingSchools } from "../../../lib/preparing-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const access = async permission => featureGate(await getDirectAccountGate(["Projects Preparing"]), `preparing.${permission}`);
const answer = (payload, status = 200) => NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
const denied = gate => answer({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);
const failed = error => { console.error("[projects-preparing]", error?.details || error); return answer({ ok: false, error: error?.message || "Preparing request failed." }, Number(error?.status) || 500); };
async function bodyFor(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) { const error = new Error("Invalid JSON payload."); error.status = 400; throw error; }
  return body;
}
export async function GET() {
  const gate = await access("view"); if (!gate.ok) return denied(gate);
  try {
    const [workspace, catalog] = await Promise.all([preparingWorkspace(), preparingCatalog()]);
    return answer({ ok: true, ...workspace, ...catalog });
  } catch (error) { return failed(error); }
}
export async function POST(request) {
  const body = await bodyFor(request).catch(error => ({ __invalid: error }));
  if (body.__invalid) return failed(body.__invalid);
  const action = body.action === "add_schools" ? "manage" : body.action === "create_project" ? "create" : null;
  if (!action) return answer({ ok: false, error: "Unknown action." }, 400);
  const gate = await access(action); if (!gate.ok) return denied(gate);
  try {
    const value = action === "create" ? await createPreparingProject(body, gate.account)
      : await addPreparingSchools(body.projectId, body, gate.account);
    return answer({ ok: true, result: value }, 201);
  } catch (error) { return failed(error); }
}
export async function PATCH(request) {
  const gate = await access("manage"); if (!gate.ok) return denied(gate);
  try { const body = await bodyFor(request); return answer({ ok: true, result: await updatePreparingProject(body.projectId, body) }); }
  catch (error) { return failed(error); }
}
