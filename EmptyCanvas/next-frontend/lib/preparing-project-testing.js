import "server-only";
import { select, selectById, rpc } from "./supabase-rest";
import { testingRemaining } from "./preparing-project-testing-grouping.mjs";
import { randomUUID } from "node:crypto";
const idPattern=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function checkProjectId(value){const id=String(value||"").trim();if(!idPattern.test(id))fail("Invalid project ID.");return id;}
function serviceOnly(){if(!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY))fail("Server-side Supabase key is required.",503);}
async function projectId(value){serviceOnly();const id=checkProjectId(value);const project=await selectById("erp_preparing_projects",id);if(!project||project.deleted_at)fail("Project not found.",404);return id;}
export async function projectTestingOverview(value){
 const id=await projectId(value);
 const [overview, master, kitGroups, intake]=await Promise.all([
  rpc("erp_preparing_project_testing_overview",{p_project_id:id},{profileName:"preparing.testing.read"}),
  select("erp_preparing_warehouse_items",{select:"id,source_kits",project_id:`eq.${id}`,limit:"2000"},{profileName:"preparing.testing.kits"}),
  select("erp_preparing_project_kit_groups",{select:"kit_key,kit_name,sort_order",project_id:`eq.${id}`,order:"sort_order.asc",limit:"200"},{profileName:"preparing.testing.groups"}),
  rpc("erp_preparing_intake_snapshot_v388",{p_project_id:id},{profileName:"preparing.intake.read"}),
 ]);
 const received=new Map((intake.balances||[]).map(row=>[row.itemId,Number(row.received)||0]));
 const sources=new Map((master||[]).map(row=>[row.id,Array.isArray(row.source_kits)?row.source_kits:[]]));
 return {...overview,kitGroups:kitGroups||[],items:(overview.items||[]).map(row=>({
  ...row,productionIntakeReceived:received.get(row.id)||0,sourceKits:sources.get(row.id)||[],remaining:testingRemaining(row)
 }))};
}
export async function recordProjectTesting(body,account){
 const id=await projectId(body?.projectId);
 const actor=String(account?.id||account?.memberId||account?.teamMemberId||"").trim();
 if(!actor)fail("A verified user is required.",401);
 const actorName=String(account?.name||account?.username||"").trim();
 if(!actorName || actorName.length>160)fail("Your account display name is unavailable. Update your ERP profile before saving test results.",409);
 const reference=String(body?.reference||"").trim() || `QC-${randomUUID()}`,notes=String(body?.notes||"").trim();
 if(reference.length<2||reference.length>160||notes.length>1000)fail("Enter a test record reference (2-160 characters) and optional notes.");
 const raw=body?.lines;
 if(!Array.isArray(raw)||!raw.length||raw.length>200)fail("Select 1-200 component rows.");
 const seen=new Set();
 const lines=raw.map(row=>{
  const itemId=checkProjectId(row?.itemId);
  if(seen.has(itemId))fail("Duplicate component in test batch.");seen.add(itemId);
  const delta=row?.testedDelta, expected=row?.expectedTested;
  if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(expected)||!delta||Math.abs(delta)>1000000||expected<0||!Number.isSafeInteger(expected+delta)||expected+delta<0)fail("Invalid tested quantity.");
  return {itemId,testedDelta:delta,expectedTested:expected};
 });
 return rpc("erp_preparing_project_testing_record_v384",{p_project_id:id,p_reference:reference,p_notes:notes,p_lines:lines,p_member_id:actor,p_actor_name:actorName},{profileName:"preparing.testing.save"});
}

// Separate stage ledger: reuse the BOM and kit projection, not the testing quantities.
export async function productionIntakeOverview(value){
 const id=await projectId(value);
 const [base,snapshot]=await Promise.all([projectTestingOverview(id),rpc("erp_preparing_intake_snapshot_v388",{p_project_id:id},{profileName:"preparing.intake.read"})]);
 const balances=new Map((snapshot.balances||[]).map(row=>[row.itemId,row]));
 return {kitGroups:base.kitGroups,history:snapshot.history||[],items:base.items.map(row=>{const b=balances.get(row.id);const tested=Number(b?.received)||0;return {id:row.id,name:row.name,code:row.code,required:row.required,sourceKits:row.sourceKits,tested,accepted:Number(row.tested)||0,testedBy:b?.people||[],remaining:Math.max(0,Number(row.required)-tested)};})};
}
export async function recordProductionIntake(body,account){
 const id=await projectId(body?.projectId);
 const actor=String(account?.id||account?.memberId||account?.teamMemberId||"").trim(),name=String(account?.name||account?.username||"").trim();
 if(!actor||!name||name.length>160)fail("Verified ERP user required.",401);
 const lines=body?.lines;
 if(!Array.isArray(lines)||!lines.length||lines.length>200)fail("Select 1-200 component rows.");
 const seen=new Set();
 for(const row of lines){const key=checkProjectId(row?.itemId);if(seen.has(key))fail("Duplicate component.");seen.add(key);if(!Number.isSafeInteger(row.testedDelta)||!Number.isSafeInteger(row.expectedTested)||!row.testedDelta||Math.abs(row.testedDelta)>1000000||row.expectedTested<0||!Number.isSafeInteger(row.expectedTested+row.testedDelta)||row.expectedTested+row.testedDelta<0)fail("Invalid received quantity.");}
 return rpc("erp_preparing_intake_record_v388",{p_project_id:id,p_lines:lines,p_member_id:actor,p_actor_name:name},{profileName:"preparing.intake.save"});
}
