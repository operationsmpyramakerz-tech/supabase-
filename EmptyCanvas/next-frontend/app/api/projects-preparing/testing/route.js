import { preparingStageGate, preparingStageReadGate } from "../../../../lib/preparing-stage-access";
import { requirePreparingTabWrite } from "../../../../lib/preparing-tab-write-server";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { projectTestingOverview,recordProjectTesting } from "../../../../lib/preparing-project-testing";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(payload,status=200)=>NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async key=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${key}`);
function fail(e){console.error("[preparing:testing]",e?.details||e);return reply({ok:false,error:e?.message||"Project testing request failed."},Number(e?.status)||500);}
export async function GET(request){const auth=preparingStageReadGate(await gate("view"),"testing");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);
 try{return reply({ok:true,...await projectTestingOverview(new URL(request.url).searchParams.get("projectId"))});}catch(e){return fail(e);}}
export async function POST(request){const auth=preparingStageGate(await gate("view"),"testing");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);
 try{const body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))return reply({ok:false,error:"Invalid JSON."},400);
  await requirePreparingTabWrite(auth.account,"testing",body);
  return reply({ok:true,result:await recordProjectTesting(body,auth.account)});
 }catch(e){return fail(e);}}
