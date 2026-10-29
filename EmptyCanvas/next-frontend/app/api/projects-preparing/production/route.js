import {NextResponse} from "next/server";
import {getDirectAccountGate} from "../../../../lib/products-auth";
import {featureGate} from "../../../../lib/feature-permissions-server";
import {productionWorkspace,saveProductionHandoff,saveProductionBox} from "../../../../lib/preparing-production";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async feature=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${feature}`);
const handle=e=>{console.error("[preparing:production]",e?.message||e);return reply({ok:false,error:e?.message||"Production workflow failed."},e?.status||500);};
export async function GET(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);try{return reply({ok:true,...await productionWorkspace(new URL(req.url).searchParams.get("projectId"))});}catch(e){return handle(e);}}
export async function POST(req){const auth=await gate("stage_update");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied."},auth.status||403);try{const body=await req.json();if(body?.action==="handoff")return reply({ok:true,result:await saveProductionHandoff(body,auth.account)});if(body?.action==="pack")return reply({ok:true,result:await saveProductionBox(body,auth.account)});return reply({ok:false,error:"Unknown production action."},400);}catch(e){return handle(e);}}
