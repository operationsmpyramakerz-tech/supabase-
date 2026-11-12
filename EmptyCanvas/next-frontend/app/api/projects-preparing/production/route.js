import { preparingStageGate, preparingStageReadable } from "../../../../lib/preparing-stage-access";
import { requirePreparingTabWrite } from "../../../../lib/preparing-tab-write-server";
import {NextResponse} from "next/server";
import {getDirectAccountGate} from "../../../../lib/products-auth";
import {featureGate} from "../../../../lib/feature-permissions-server";
import {saveProductionHandoff,saveProductionBox,saveEqualSchoolKitPacking} from "../../../../lib/preparing-production";
import {productionPresentationWorkspace} from "../../../../lib/preparing-production-presentation";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async feature=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${feature}`);
const handle=e=>{console.error("[preparing:production]",e?.message||e);return reply({ok:false,error:e?.message||"Production workflow failed."},e?.status||500);};
export async function GET(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);const params=new URL(req.url).searchParams;const stage=params.get("scope")==="boxes"?"boxes":"production";if(!preparingStageReadable(auth.account,stage))return reply({ok:false,error:`${stage} stage access is not allowed.`},403);try{const data=await productionPresentationWorkspace(params.get("projectId"),{includeReceivers:stage==="production"});
  // Both screens need aggregate balances, but their private history lists are
  // separate: do not return carton details to Receiving-only users, or actor
  // handoff history to Box Distribution-only users.
  const scoped=stage==="production"?{...data,cartons:[],cartonLines:[]}
    : {...data,handoffs:[]};
  return reply({ok:true,...scoped});}catch(e){return handle(e);}}
export async function POST(req){const basic=await gate("view");if(!basic.ok)return reply({ok:false,error:basic.error||"Access denied."},basic.status||403);try{const body=await req.json();const target=body?.action==="handoff"?"production":["pack","pack_schools"].includes(body?.action)?"boxes":null;const auth=target?preparingStageGate(basic,target):basic;if(target&&!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);if(target)await requirePreparingTabWrite(auth.account,target,body,{action:body.action});if(body?.action==="handoff")return reply({ok:true,result:await saveProductionHandoff(body,auth.account)});if(body?.action==="pack")return reply({ok:true,result:await saveProductionBox(body,auth.account)});if(body?.action==="pack_schools")return reply({ok:true,result:await saveEqualSchoolKitPacking(body,auth.account)});return reply({ok:false,error:"Unknown production action."},400);}catch(e){return handle(e);}}
