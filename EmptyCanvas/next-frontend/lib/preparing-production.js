import "server-only";
import {randomUUID} from "node:crypto";
import {select,selectById,rpc} from "./supabase-rest";
import {warehouseWorkspace} from "./preparing-warehouse";
import {productionBalance} from "./preparing-production-math.mjs";

const clean=v=>String(v??"").trim();
const UUID=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function fail(message,status=400){const err=new Error(message);err.status=status;throw err;}
function id(v){const s=clean(v);if(!UUID.test(s))fail("Invalid project or component ID.");return s;}
function identity(account){const member=clean(account?.id||account?.memberId||account?.teamMemberId);const name=clean(account?.name||account?.username);if(!member||!name||name.length>160)fail("Verified ERP production user required.",401);return {member,name};}
function requireService(){if(!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY))fail("Server-side database credentials required.",503);}
async function paged(table,project,label,max=20000,order="created_at.desc"){const out=[];for(let offset=0;offset<=max;offset+=400){const page=await select(table,{select:"*",project_id:`eq.${project}`,order,offset:String(offset),limit:"400"},{profileName:`preparing.production.${label}`});if(!Array.isArray(page))fail(`Unable to read ${label}.`,502);out.push(...page);if(out.length>max)fail(`Too many ${label}. Narrow the report.`,409);if(page.length<400)return out;}fail(`Too many ${label}.`,409);}
export async function productionWorkspace(projectId){
 requireService();const project=id(projectId);
 if(!await selectById("erp_preparing_projects",project))fail("Project not found.",404);
 const [warehouse,handoffs,cartonLines,cartons,schoolCartonKits]=await Promise.all([
  warehouseWorkspace(project),paged("erp_preparing_production_handoffs",project,"handoffs",20000),
  paged("erp_preparing_project_carton_lines",project,"carton-lines",20000,"id.asc"),
  paged("erp_preparing_project_cartons",project,"cartons",2000),
  paged("erp_preparing_school_carton_kits",project,"school-carton-kits",12000,"created_at.asc")]);
 const whReceived=new Map();for(const line of warehouse.receiptLines)whReceived.set(line.item_id,(whReceived.get(line.item_id)||0)+Number(line.accepted_delta||0));
 const received=new Map();for(const row of handoffs)received.set(row.item_id,(received.get(row.item_id)||0)+Number(row.qty_delta||0));
 const packed=new Map();const activeCartons=new Set(cartons.filter(c=>c.status!=="cancelled").map(c=>c.id));
 const mapKey=(id,name)=>`${String(id||"").toLowerCase()}\u0000${String(name||"").trim().toLowerCase()}`;
 for(const line of cartonLines){if(!activeCartons.has(line.carton_id))continue;const key=mapKey(line.product_id,line.product_name);packed.set(key,(packed.get(key)||0)+Number(line.packed_qty||0));}
 const items=warehouse.items.map(item=>{const warehouseReceived=whReceived.get(item.id)||0,productionReceived=received.get(item.id)||0,packedQty=packed.get(mapKey(item.product_id,item.product_name))||0;return {...item,...productionBalance(warehouseReceived,productionReceived,packedQty)};});
 return {projectId:project,schoolsCount:warehouse.schools.length,items,handoffs,kitGroups:warehouse.kitGroups,cartons,cartonLines,schoolCartonKits};
}
export async function saveProductionHandoff(body,account){
 requireService();const project=id(body?.projectId),item=id(body?.itemId);const {member,name}=identity(account);
 const target=body?.totalReceived,expected=body?.expectedReceived;
 if(!Number.isSafeInteger(target)||target<0||target>1000000000||!Number.isSafeInteger(expected)||expected<0||expected>1000000000)fail("Production Received must be a non-negative whole number.");
 if(Math.abs(target-expected)>1000000)fail("Change cannot exceed 1,000,000 units.");
 const reference=clean(body?.reference)||`PRD-${randomUUID()}`;
 if(reference.length>160||clean(body?.notes).length>1000)fail("Reference or notes too long.");
 return rpc("erp_preparing_production_handoff_v247",{p_project_id:project,p_item_id:item,p_new_total:target,p_expected_total:expected,p_reference:reference,p_notes:clean(body?.notes),p_member_id:member,p_actor_name:name},{profileName:"preparing.production.save"});
}

// Atomic box edit: original carton RPC + verified actor on its audit record.
export async function saveProductionBox(body,account){
 requireService();const project=id(body?.projectId),carton=id(body?.cartonId),source=id(body?.sourceComponentId),item=id(body?.itemId),{member,name}=identity(account);
 const quantity=body?.quantity,stamp=clean(body?.expectedUpdatedAt);
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000)fail("Packed must be a whole number from 0 to 1,000,000.");
 if(!stamp||!Number.isFinite(Date.parse(stamp)))fail("Refresh the box before editing its quantities.",409);
 // Generated school-specific labels must never consume another school's BOM items.
 const box=await selectById("erp_preparing_project_cartons",carton);
 if(!box || box.project_id!==project || box.status!=="draft")fail("Box is not a draft in this project.",409);
 if(box.generated_kit_label)fail("School Kit packing must be distributed equally via Pack by School.",403);
 return rpc("erp_preparing_production_pack_v249",{p_project_id:project,p_carton_id:carton,p_source_component_id:source,p_item_id:item,p_quantity:quantity,p_expected_updated_at:stamp,p_member_id:member,p_actor_name:name},{profileName:"preparing.production.pack"});
}

// v399: ONE SQL transaction for ALL selected schools. Do not loop HTTP writes:
// a partial success could leave different quantities in supposedly identical Kits.
export async function saveEqualSchoolKitPacking(body,account){
 requireService();const project=id(body?.projectId),item=id(body?.itemId),{member,name}=identity(account);
 const kitName=clean(body?.kitName);
 if(!kitName||kitName.length>160)fail("Choose a valid Kit group.");
 if(!Array.isArray(body?.schools)||!body.schools.length||body.schools.length>50)
  fail("Select between 1 and 50 schools.");
 const seen=new Set();const schools=body.schools.map(s=>{
  const schoolId=id(s?.schoolId);const totalQuantity=s?.totalQuantity;
  if(seen.has(schoolId))fail("The same school cannot be selected twice.");seen.add(schoolId);
  if(!Number.isSafeInteger(totalQuantity)||totalQuantity<0||totalQuantity>1000000)
   fail("Packed total for each school must be a whole number between 0 and 1,000,000.");
  return {schoolId,totalQuantity};
 });
 return rpc("erp_preparing_pack_school_boxes_auto_v413",{
  p_project_id:project,p_item_id:item,p_kit_name:kitName,
  p_school_packs:schools,p_member_id:member,p_actor_name:name,
 },{profileName:"preparing.production.equal-school-pack"});
}
