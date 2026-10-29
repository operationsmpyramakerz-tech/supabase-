import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { projectCartonWorkspace,createProjectCarton,setProjectCartonLine,sealProjectCarton,
  allocateProjectCarton,reverseProjectAllocation,cancelProjectCarton,renameProjectCarton } from "../../../../lib/preparing-project-cartons";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(payload,status=200)=>NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async permission=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${permission}`);
const failed=e=>{console.error("[preparing:project-cartons]",e?.details||e);return reply({ok:false,error:e?.message||"Project carton request failed."},Number(e?.status)||500);};
async function bodyOf(req){const v=await req.json().catch(()=>null);if(!v || typeof v!=="object"||Array.isArray(v)){const e=new Error("Invalid JSON payload.");e.status=400;throw e;}return v;}
export async function GET(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);
  try{return reply({ok:true,...await projectCartonWorkspace(new URL(req.url).searchParams.get("projectId"))});}catch(e){return failed(e);}}
export async function POST(req){const auth=await gate("stage_update");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);
  try{const b=await bodyOf(req);if(b.action!=="create")return reply({ok:false,error:"Unknown action"},400);return reply({ok:true,result:await createProjectCarton(b,auth.account)},201);}catch(e){return failed(e);}}
export async function PATCH(req){const auth=await gate("stage_update");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);
  try{const b=await bodyOf(req);const methods={set_line:setProjectCartonLine,seal:sealProjectCarton,
    allocate:allocateProjectCarton,reverse:reverseProjectAllocation,cancel:cancelProjectCarton,rename:renameProjectCarton};
    if(!methods[b.action])return reply({ok:false,error:"Unknown action"},400);
    return reply({ok:true,result:await methods[b.action](b,auth.account)});
  }catch(e){return failed(e);}}
