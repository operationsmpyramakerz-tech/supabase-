import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { preparingTechnical, updateTechnicalCheckpoint, createTechnicalIssue, updateTechnicalIssue, recordTechnicalAcceptance } from "../../../../lib/preparing-service";

export const dynamic="force-dynamic";
export const revalidate=0;
const send=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const access=async feature=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${feature}`);
const denied=gate=>send({ok:false,error:gate.error||"Access denied."},gate.status||403);
const failed=error=>{console.error("[preparing:technical]",error?.details||error);return send({ok:false,error:error?.message||"Technical follow-up request failed."},Number(error?.status)||500);};
const bodyOf=async request=>{const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body)){const e=new Error("Invalid JSON payload.");e.status=400;throw e;}return body;};
export async function GET(request){
  const gate=await access("view");if(!gate.ok)return denied(gate);
  try{return send({ok:true,...await preparingTechnical(new URL(request.url).searchParams.get("schoolId"))});}catch(error){return failed(error);}
}
export async function POST(request){
  const gate=await access("stage_update");if(!gate.ok)return denied(gate);
  try{const body=await bodyOf(request);if(body.action!=="create_issue")return send({ok:false,error:"Unknown action."},400);
    return send({ok:true,result:await createTechnicalIssue(body,gate.account)},201);}catch(error){return failed(error);}
}
export async function PATCH(request){
  const gate=await access("stage_update");if(!gate.ok)return denied(gate);
  try{const body=await bodyOf(request);const actions={checkpoint:updateTechnicalCheckpoint,issue:updateTechnicalIssue,acceptance:recordTechnicalAcceptance};
    const handler=actions[body.action];if(!handler)return send({ok:false,error:"Unknown action."},400);
    return send({ok:true,result:await handler(body,gate.account)});}catch(error){return failed(error);}
}
