import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { preparingClosing,saveClosingCheck,finalizePreparingSchool,reopenPreparingSchool } from "../../../../lib/preparing-service";

export const dynamic="force-dynamic";
export const revalidate=0;
const send=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const access=async permission=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${permission}`);
const denied=gate=>send({ok:false,error:gate.error||"Access denied."},gate.status||403);
const failed=error=>{console.error("[preparing:closing]",error?.details||error);return send({ok:false,error:error?.message||"Final Closing request failed."},Number(error?.status)||500);};
async function payload(request){const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body)){const error=new Error("Invalid JSON payload.");error.status=400;throw error;}return body;}
export async function GET(request){
  const gate=await access("view");if(!gate.ok)return denied(gate);
  try{return send({ok:true,...await preparingClosing(new URL(request.url).searchParams.get("schoolId"))});}catch(error){return failed(error);}
}
export async function PATCH(request){
  // Page Access is checked for every request; only the dedicated close grant may issue approval/reopening.
  const body=await payload(request).catch(error=>({__invalid:error}));if(body.__invalid)return failed(body.__invalid);
  const feature=body.action==="check"?"stage_update":body.action==="finalize"||body.action==="reopen"?"close":null;
  if(!feature)return send({ok:false,error:"Unknown action."},400);
  const gate=await access(feature);if(!gate.ok)return denied(gate);
  try{
    const fn={check:saveClosingCheck,finalize:finalizePreparingSchool,reopen:reopenPreparingSchool}[body.action];
    return send({ok:true,result:await fn(body,gate.account)});
  }catch(error){return failed(error);}
}
