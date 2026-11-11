import { preparingStageGate, preparingStageReadable, preparingStagesGranular } from "../../../../lib/preparing-stage-access";
import { requirePreparingTabWrite } from "../../../../lib/preparing-tab-write-server";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { warehouseWorkspace,captureWarehouseBOM,receiveWarehouseComponents,allocateWarehouseComponents,allocateWarehouseBatch,attachProjectProposal,changeProjectBOM,initializeProjectKits,editProjectKitItem } from "../../../../lib/preparing-warehouse";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(payload,status=200)=>NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async key=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${key}`);
const errorReply=e=>{ console.error("[preparing:warehouse]",e?.details||e);return reply({ok:false,error:e?.message||"Project warehouse request failed."},Number(e?.status)||500); };
const readBody=async req=>{const body=await req.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body)){const e=new Error("Invalid JSON payload.");e.status=400;throw e;}return body;};
export async function GET(req) {
  const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);
  if(!preparingStageReadable(auth.account,"warehouse") && !(await gate("manage")).ok)
    return reply({ok:false,error:"Warehouse Return stage access is not allowed."},403);
  try{return reply({ok:true,...await warehouseWorkspace(new URL(req.url).searchParams.get("projectId"))});}catch(e){return errorReply(e);}
}
export async function POST(req) {
  let body;try{body=await readBody(req);}catch(e){return errorReply(e);}
  const permission=(body.action==="allocate"||body.action==="allocate_batch")?"warehouse_allocate":body.action==="capture"||body.action==="receive"?"warehouse_receive":body.action==="attach_proposal"||body.action==="edit_bom"||body.action==="init_kits"||body.action==="edit_kit"?"manage":null;
  if(!permission)return reply({ok:false,error:"Unknown warehouse action."},400);
  const viewGate=await gate("view");
  const auth=["allocate","allocate_batch","capture","receive"].includes(body.action)
    ? viewGate.ok && !preparingStagesGranular(viewGate.account)
      ? await gate(permission) : preparingStageGate(viewGate,"warehouse")
    : await gate(permission);
  if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);
  try{
    if(body.action==="receive"||body.action==="capture")await requirePreparingTabWrite(auth.account,"warehouse",body,{action:body.action});
    const methods={capture:captureWarehouseBOM,receive:receiveWarehouseComponents,allocate:allocateWarehouseComponents,allocate_batch:allocateWarehouseBatch,attach_proposal:attachProjectProposal,edit_bom:changeProjectBOM,init_kits:initializeProjectKits,edit_kit:editProjectKitItem};
    return reply({ok:true,result:await methods[body.action](body,auth.account)});
  }catch(e){return errorReply(e);}
}
