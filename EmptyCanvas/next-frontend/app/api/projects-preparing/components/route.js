import {enrichPreparingDisplayCodes} from "../../../../lib/preparing-display-code-server";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { preparingComponents, initializePreparingComponents, updatePreparingComponent } from "../../../../lib/preparing-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const respond = (data, status=200) => NextResponse.json(data, { status, headers:{"Cache-Control":"private, no-store"} });
const denied = gate => respond({ ok:false, error:gate.error || "Access denied" }, gate.status || 403);
const failure = error => { console.error("[preparing:components]", error?.details || error); return respond({ ok:false, error:error?.message || "Unable to load components." }, Number(error?.status) || 500); };
const access = async permission => featureGate(await getDirectAccountGate(["Projects Preparing"]), `preparing.${permission}`);
const getBody = async request => { const data = await request.json().catch(()=>null); if (!data || Array.isArray(data) || typeof data !== "object") { const error=new Error("Invalid JSON body"); error.status=400; throw error; } return data; };

export async function GET(request) {
  const gate = await access("view"); if (!gate.ok) return denied(gate);
  try { const schoolId=new URL(request.url).searchParams.get("schoolId"); return respond({ok:true,...await enrichPreparingDisplayCodes(await preparingComponents(schoolId))}); }
  catch(error) { return failure(error); }
}
export async function POST(request) {
  const gate=await access("stage_update"); if (!gate.ok) return denied(gate);
  try { const body=await getBody(request); if (body.action!=="initialize") return respond({ok:false,error:"Unknown action"},400);
    return respond({ok:true,result:await initializePreparingComponents(body.schoolId,gate.account)},201); }
  catch(error) {return failure(error);}
}
export async function PATCH(request) {
  const gate=await access("stage_update"); if (!gate.ok) return denied(gate);
  try { const body=await getBody(request); return respond({ok:true,result:await updatePreparingComponent(body.schoolId,body,gate.account)}); }
  catch(error) {return failure(error);}
}
