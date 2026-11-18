import {enrichPreparingDisplayCodes} from "../../../../lib/preparing-display-code-server";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { preparingReconciliation,recordPreparingReturn,createPreparingReplacement,cancelPreparingReplacement } from "../../../../lib/preparing-reconciliation";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const access=async permission=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${permission}`);
const denied=gate=>reply({ok:false,error:gate.error||"Access denied"},gate.status||403);
const failed=error=>{console.error("[preparing:reconciliation]",error?.details||error);return reply({ok:false,error:error?.message||"Reconciliation request failed."},Number(error?.status)||500);};
async function payload(request){const value=await request.json().catch(()=>null);if(!value||typeof value!=="object"||Array.isArray(value))throw Object.assign(new Error("Invalid JSON payload."),{status:400});return value;}
export async function GET(request){const gate=await access("view");if(!gate.ok)return denied(gate);try{return reply({ok:true,...await enrichPreparingDisplayCodes(await preparingReconciliation(new URL(request.url).searchParams.get("schoolId")),["components"])});}catch(error){return failed(error);}}
export async function POST(request){const gate=await access("stage_update");if(!gate.ok)return denied(gate);try{const body=await payload(request);const handler={return:recordPreparingReturn,replacement:createPreparingReplacement}[body.action];if(!handler)return reply({ok:false,error:"Unknown action"},400);return reply({ok:true,result:await handler(body,gate.account)},201);}catch(error){return failed(error);}}
export async function PATCH(request){const gate=await access("stage_update");if(!gate.ok)return denied(gate);try{const body=await payload(request);if(body.action!=="cancel_replacement")return reply({ok:false,error:"Unknown action"},400);return reply({ok:true,result:await cancelPreparingReplacement(body,gate.account)});}catch(error){return failed(error);}}
