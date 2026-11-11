import { preparingStageAllowed, preparingStageReadable } from "../../../../lib/preparing-stage-access";
import { requirePreparingTabWrite } from "../../../../lib/preparing-tab-write-server";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { projectCartonWorkspace,createProjectCarton,setProjectCartonLine,sealProjectCarton,
  allocateProjectCarton,reverseProjectAllocation,cancelProjectCarton,renameProjectCarton,generateSchoolKitLabels,
  initializeSchoolKitPlan,transferSchoolKitTarget,completeSchoolKit } from "../../../../lib/preparing-project-cartons";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(payload,status=200)=>NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});
const gate=async permission=>featureGate(await getDirectAccountGate(["Projects Preparing"]),`preparing.${permission}`);
const failed=e=>{console.error("[preparing:project-cartons]",e?.details||e);return reply({ok:false,error:e?.message||"Project carton request failed."},Number(e?.status)||500);};
async function bodyOf(req){const v=await req.json().catch(()=>null);if(!v || typeof v!=="object"||Array.isArray(v)){const e=new Error("Invalid JSON payload.");e.status=400;throw e;}return v;}
export async function GET(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);const params=new URL(req.url).searchParams;const scope=params.get("scope")==="boxes"?"boxes":"cartons";if(!preparingStageReadable(auth.account,scope))return reply({ok:false,error:`${scope} stage access is not allowed.`},403);
  try{const workspace=await projectCartonWorkspace(params.get("projectId"));
    if(scope==="cartons"){
      const legacy=new Set(workspace.cartons.filter(c=>!c.generated_kit_label).map(c=>c.id));
      return reply({ok:true,...workspace,kitTargets:[],cartons:workspace.cartons.filter(c=>legacy.has(c.id)),
        lines:workspace.lines.filter(l=>legacy.has(l.carton_id)),
        allocations:workspace.allocations.filter(a=>legacy.has(a.carton_id)),
        audit:workspace.audit.filter(a=>!a.carton_id||legacy.has(a.carton_id))});
    }
    return reply({ok:true,...workspace});}catch(e){return failed(e);}}
export async function POST(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);
  try{const b=await bodyOf(req);if(!["create","generate_school_kits","init_school_kit_plan","transfer_school_kit_target"].includes(b.action))return reply({ok:false,error:"Unknown action"},400);
    if(!preparingStageAllowed(auth.account,"boxes")&&!preparingStageAllowed(auth.account,"cartons"))return reply({ok:false,error:"Box Distribution or Cartons access required."},403);
    // A shared create endpoint may be used by either stage; enforce the
    // requesting stage separately so carton rights never open box-only views.
    const scope=b.scope==="boxes"?"boxes":"cartons";
    if(!preparingStageAllowed(auth.account,scope))return reply({ok:false,error:`${scope} stage access required.`},403);
    if((b.action==="generate_school_kits" && scope!=="boxes") || (["init_school_kit_plan","transfer_school_kit_target"].includes(b.action) && scope!=="boxes")) return reply({ok:false,error:"School Kit labels belong to Box Distribution."},403);
    if(b.action==="create" && scope==="boxes") return reply({ok:false,error:"Create school-specific boxes with Generate School Kit Labels."},400);
    await requirePreparingTabWrite(auth.account,scope,b,{action:b.action});
    return reply({ok:true,result:await ({generate_school_kits:generateSchoolKitLabels,
      init_school_kit_plan:initializeSchoolKitPlan,transfer_school_kit_target:transferSchoolKitTarget,
      create:createProjectCarton})[b.action](b,auth.account)},201);}catch(e){return failed(e);}}
export async function PATCH(req){const auth=await gate("view");if(!auth.ok)return reply({ok:false,error:auth.error||"Access denied"},auth.status||403);
  try{const b=await bodyOf(req);const methods={set_line:setProjectCartonLine,seal:sealProjectCarton,complete_school_kit:completeSchoolKit,
    allocate:allocateProjectCarton,reverse:reverseProjectAllocation,cancel:cancelProjectCarton,rename:renameProjectCarton};
    if(!methods[b.action])return reply({ok:false,error:"Unknown action"},400);
    const shared=b.action==="rename"||b.action==="cancel"||b.action==="complete_school_kit";
    if(!preparingStageAllowed(auth.account,"cartons")&&!(shared&&preparingStageAllowed(auth.account,"boxes")))return reply({ok:false,error:"Project Kit Cartons access required."},403);
    const scope=b.scope==="boxes"?"boxes":"cartons";
    if(!preparingStageAllowed(auth.account,scope))return reply({ok:false,error:`${scope} stage access required.`},403);
    if(scope==="boxes" && !shared)return reply({ok:false,error:"Only box label actions are available in Box Distribution."},403);
    if(b.action==="complete_school_kit" && scope!=="boxes")return reply({ok:false,error:"Physical school Kits are completed in Box Distribution."},403);
    await requirePreparingTabWrite(auth.account,scope,b,{action:b.action});
    if(scope==="cartons"){
      const workspace=await projectCartonWorkspace(b.projectId);
      const found=workspace.cartons.find(c=>c.id===b.cartonId) ||
        workspace.cartons.find(c=>c.id===workspace.lines.find(l=>l.id===b.cartonLineId)?.carton_id) ||
        workspace.cartons.find(c=>c.id===workspace.allocations.find(a=>a.id===b.allocationId)?.carton_id);
      if(found?.generated_kit_label)return reply({ok:false,error:"School Kit labels must be managed in Box Distribution."},403);
    }
    if(scope==="boxes" && b.action==="rename"){
      const workspace=await projectCartonWorkspace(b.projectId);
      if(workspace.cartons.some(c=>c.id===b.cartonId&&c.generated_kit_label))
        return reply({ok:false,error:"Generated Kit label codes cannot be renamed."},409);
    }
    return reply({ok:true,result:await methods[b.action](b,auth.account)});
  }catch(e){return failed(e);}}
