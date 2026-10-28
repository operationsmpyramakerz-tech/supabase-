import "server-only";
import { selectById, rpc } from "./supabase-rest";
const idPattern=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function checkProjectId(value){const id=String(value||"").trim();if(!idPattern.test(id))fail("Invalid project ID.");return id;}
function serviceOnly(){if(!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY))fail("Server-side Supabase key is required.",503);}
async function projectId(value){serviceOnly();const id=checkProjectId(value);const project=await selectById("erp_preparing_projects",id);if(!project||project.deleted_at)fail("Project not found.",404);return id;}
export async function projectTestingOverview(value){const id=await projectId(value);return rpc("erp_preparing_project_testing_overview",{p_project_id:id},{profileName:"preparing.testing.read"});}
export async function recordProjectTesting(body,account){
 const id=await projectId(body?.projectId);
 const actor=String(account?.id||account?.memberId||account?.teamMemberId||"").trim();
 if(!actor)fail("A verified user is required.",401);
 const reference=String(body?.reference||"").trim(),notes=String(body?.notes||"").trim();
 if(reference.length<2||reference.length>160||notes.length>1000)fail("Enter a test record reference (2-160 characters) and optional notes.");
 const raw=body?.lines;
 if(!Array.isArray(raw)||!raw.length||raw.length>200)fail("Select 1-200 component rows.");
 const seen=new Set();
 const lines=raw.map(row=>{
  const itemId=checkProjectId(row?.itemId);
  if(seen.has(itemId))fail("Duplicate component in test batch.");seen.add(itemId);
  const values=[row?.passedDelta,row?.failedDelta,row?.expectedPassed,row?.expectedFailed];
  if(values.some(n=>!Number.isSafeInteger(n))||Math.abs(values[0])>1000000||Math.abs(values[1])>1000000||values[2]<0||values[3]<0||(!values[0]&&!values[1]))fail("Invalid test quantities.");
  return {itemId,passedDelta:values[0],failedDelta:values[1],expectedPassed:values[2],expectedFailed:values[3]};
 });
 return rpc("erp_preparing_project_testing_record",{p_project_id:id,p_reference:reference,p_notes:notes,p_lines:lines,p_member_id:actor},{profileName:"preparing.testing.save"});
}
