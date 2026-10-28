import "server-only";
import { select, selectById, rpc } from "./supabase-rest";
import { getProposal } from "./proposal-kit-service";
import { assembleSchoolProposalItems } from "./preparing-warehouse-math.mjs";

const text = v => String(v ?? "").trim();
const validId = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function fail(message,status=400) { const error=new Error(message); error.status=status; throw error; }
function id(value) { const s=text(value); if (!validId.test(s)) fail("Invalid record ID."); return s; }
function actor(account) { const a=text(account?.id || account?.memberId || account?.teamMemberId); if(!a) fail("Verified member required.",401); return a; }
function serviceOnly() { if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)) fail("Warehouse receiving requires a server-side Supabase service key.",503); }
function str(value,label,max,required=false) { const s=text(value); if(s.length>max || (required && s.length<2)) fail(`Invalid ${label}.`); return s; }
function delta(value,allowNegative=false) { if (!Number.isSafeInteger(value)||Math.abs(value)>1000000||(!allowNegative && value<0)) fail("Quantities must be whole numbers (maximum 1,000,000 per line)."); return value; }
async function paged(table,filters,label,max=6000,order="created_at.asc") {
  const rows=[];
  for(let offset=0;offset<=max;offset+=400) {
    const page=await select(table,{select:"*",...filters,order,offset:String(offset),limit:"400"},{profileName:`preparing.warehouse.${label}`});
    if(!Array.isArray(page)) fail(`Unable to read ${label}.`,502);
    rows.push(...page);
    if(rows.length>max) fail(`Too many ${label}; cannot return an incomplete result.`,409);
    if(page.length<400) return rows;
  }
  fail(`Too many ${label}; cannot return an incomplete result.`,409);
}
const rootProject=async projectId=>{ const key=id(projectId); if(!await selectById("erp_preparing_projects",key)) fail("Project not found.",404); return key; };
export async function warehouseWorkspace(projectId) {
  serviceOnly(); const project=await rootProject(projectId);
  const [schools,items,demands,receipts,receiptLines,allocations]=await Promise.all([
    paged("erp_preparing_schools",{project_id:`eq.${project}`},"schools",500),
    paged("erp_preparing_warehouse_items",{project_id:`eq.${project}`},"BOM",5000),
    paged("erp_preparing_warehouse_demands",{project_id:`eq.${project}`},"requirements",20000),
    paged("erp_preparing_warehouse_receipts",{project_id:`eq.${project}`},"vouchers",5000,"created_at.desc"),
    paged("erp_preparing_warehouse_receipt_lines",{project_id:`eq.${project}`},"receipt lines",20000,"id.asc"),
    paged("erp_preparing_warehouse_allocations",{project_id:`eq.${project}`},"school assignments",20000,"created_at.desc"),
  ]);
  return {projectId:project,schools,items,demands,receipts,receiptLines,allocations};
}
export async function captureWarehouseBOM(body,account) {
  serviceOnly(); const project=await rootProject(body?.projectId);
  // Fetch the original source Proposals (not school receiving / delivery counts).
  const state=await warehouseWorkspace(project);
  const captured=new Set(state.demands.map(row=>row.school_id));
  const pending=state.schools.filter(row=>!captured.has(row.id));
  if(!pending.length) fail("All current schools are already in the project BOM.",409);
  if(pending.length>100) fail("Capture at most 100 schools at a time.",409);
  const cache=new Map(); const schools=[];
  for(const school of pending) {
    if(!cache.has(school.proposal_id)) {
      const proposal=await getProposal(school.proposal_id);
      if(!proposal?.items?.length) fail(`Proposal for ${school.beneficiary_name} has no components.`,409);
      cache.set(school.proposal_id,assembleSchoolProposalItems(proposal.items));
    }
    schools.push({schoolId:school.id,proposalId:school.proposal_id,items:cache.get(school.proposal_id)});
  }
  return rpc("erp_preparing_warehouse_capture",{p_project_id:project,p_schools:schools,p_member_id:actor(account)},{profileName:"preparing.warehouse.capture"});
}
export async function receiveWarehouseComponents(body,account) {
  serviceOnly(); const project=await rootProject(body?.projectId);
  const kind=body?.kind;
  if(kind!=="receipt" && kind!=="adjustment") fail("Invalid voucher type.");
  const rows=Array.isArray(body?.lines)?body.lines:[];
  if(!rows.length||rows.length>200) fail("Select 1-200 component lines.");
  const lines=rows.map(row=>({itemId:id(row.itemId),accepted:delta(row.accepted,kind==="adjustment"),damaged:delta(row.damaged,kind==="adjustment")}));
  if(lines.some(row=>!row.accepted&&!row.damaged) || new Set(lines.map(row=>row.itemId)).size!==lines.length) fail("Duplicate or empty receipt lines.");
  return rpc("erp_preparing_warehouse_receive",{p_project_id:project,p_kind:kind,
    p_reference:str(body.reference,"warehouse voucher reference",160,true),p_notes:str(body.notes,"notes",1000),
    p_lines:lines,p_member_id:actor(account)},{profileName:"preparing.warehouse.receive"});
}
export async function allocateWarehouseComponents(body,account) {
  serviceOnly(); const project=await rootProject(body?.projectId);
  const number=delta(body?.delta,true);
  if(!number) fail("Allocation quantity cannot be zero.");
  return rpc("erp_preparing_warehouse_allocate",{p_project_id:project,p_school_id:id(body.schoolId),
    p_item_id:id(body.itemId),p_delta:number,p_reference:str(body.reference,"assignment reference",160,true),
    p_notes:str(body.notes,"notes",1000),p_member_id:actor(account)},{profileName:"preparing.warehouse.allocate"});
}

export async function allocateWarehouseBatch(body,account) {
  serviceOnly();const project=await rootProject(body?.projectId);
  const rows=Array.isArray(body?.lines)?body.lines:[];
  if(!rows.length||rows.length>200) fail("Select 1-200 allocation lines.");
  const lines=rows.map(row=>({itemId:id(row.itemId),delta:delta(row.delta,true)}));
  if(lines.some(row=>!row.delta)||new Set(lines.map(row=>row.itemId)).size!==lines.length)
    fail("Duplicate or empty allocation lines.");
  return rpc("erp_preparing_warehouse_allocate_batch",{p_project_id:project,p_school_id:id(body.schoolId),
    p_reference:str(body.reference,"assignment reference",160,true),p_notes:str(body.notes,"notes",1000),
    p_lines:lines,p_member_id:actor(account)},{profileName:"preparing.warehouse.allocate-batch"});
}
