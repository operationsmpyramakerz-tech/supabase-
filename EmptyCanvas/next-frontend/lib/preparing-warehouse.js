import "server-only";
import { randomUUID } from "node:crypto";
import { select, selectById, rpc } from "./supabase-rest";
import { getProposal } from "./proposal-kit-service";
import { getProduct } from "./products-service";
import { assembleSchoolProposalItems, assembleProjectProposalItems } from "./preparing-warehouse-math.mjs";

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
  const [schools,items,demands,receipts,receiptLines,allocations,kitGroups,testingBalances]=await Promise.all([
    paged("erp_preparing_schools",{project_id:`eq.${project}`},"schools",500),
    paged("erp_preparing_warehouse_items",{project_id:`eq.${project}`},"BOM",5000),
    paged("erp_preparing_warehouse_demands",{project_id:`eq.${project}`},"requirements",20000),
    paged("erp_preparing_warehouse_receipts",{project_id:`eq.${project}`},"vouchers",5000,"created_at.desc"),
    paged("erp_preparing_warehouse_receipt_lines",{project_id:`eq.${project}`},"receipt lines",20000,"id.asc"),
    paged("erp_preparing_warehouse_allocations",{project_id:`eq.${project}`},"school assignments",20000,"created_at.desc"),
    paged("erp_preparing_project_kit_groups",{project_id:`eq.${project}`},"Kit groups",200,"sort_order.asc"),
    rpc("erp_preparing_warehouse_testing_balances_v384",{p_project_id:project},{profileName:"preparing.warehouse.tested"}),
  ]);
  const bomAudit=await paged("erp_preparing_warehouse_bom_audit",{project_id:`eq.${project}`},"BOM audit",5000,"changed_at.desc");
  return {projectId:project,schools,items,demands,receipts,receiptLines,allocations,kitGroups,testingBalances,bomAudit};
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
  const lines=rows.map(row=>({itemId:id(row.itemId),accepted:delta(row.accepted,kind==="adjustment"),damaged:0}));
  // No damaged stock enters this workflow. Explicitly reject old clients that still send damage.
  if(rows.some(row=>row.damaged!==undefined&&Number(row.damaged)!==0))fail("Warehouse Receiving accepts passed/usable components only; damaged quantities are not supported.");
  if(lines.some(row=>!row.accepted) || new Set(lines.map(row=>row.itemId)).size!==lines.length) fail("Duplicate or empty receipt lines.");
  const name=str(account?.name||account?.username,"ERP account name",160,true);
  const reference=str(body.reference,"warehouse voucher reference",160)||`WH-${randomUUID()}`;
  return rpc("erp_preparing_warehouse_receive_v241",{p_project_id:project,p_kind:kind,
    p_reference:reference,p_notes:str(body.notes,"notes",1000),
    p_lines:lines,p_member_id:actor(account),p_actor_name:name},{profileName:"preparing.warehouse.receive"});
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

// Source Proposal for an EXISTING, empty project. Never replace a project with stock or school demand.
async function sourceProposalItems(proposalId) {
  const sourceId=str(proposalId,"source Proposal",200,true);
  const proposal=await getProposal(sourceId);
  if(!proposal?.items?.length) fail("The selected Proposal has no components.",409);
  return {id:sourceId,name:str(proposal.proposal?.name,"Proposal name",160,true),items:assembleProjectProposalItems(proposal.items)};
}
export async function attachProjectProposal(body,account) {
  serviceOnly();const project=await rootProject(body?.projectId);
  const proposal=await sourceProposalItems(body?.proposalId);
  return rpc("erp_preparing_attach_project_proposal",{
    p_project_id:project,p_source_proposal_id:proposal.id,p_source_proposal_name:proposal.name,
    p_items:proposal.items,p_member_id:actor(account),
  },{profileName:"preparing.warehouse.attach-source"});
}
export async function changeProjectBOM(body,account) {
  serviceOnly();const project=await rootProject(body?.projectId);
  const action=text(body?.operation);
  if(!["add","update","delete"].includes(action)) fail("Invalid component action.");
  const quantity=body?.requiredQty;
  if(action!=="delete" && (!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000000))
    fail("Project required quantity must be a whole number between 0 and 1,000,000,000.");
  const code=action==="delete"?"":str(body?.productId,"component code",500);
  const name=action==="delete"?"":str(body?.productName,"component name",500,true);
  const version=action==="add"?null:text(body?.expectedUpdatedAt);
  if(action!=="add" && (!version || !Number.isFinite(Date.parse(version)))) fail("Refresh this component before changing it.",409);
  return rpc("erp_preparing_edit_project_bom",{
    p_project_id:project,p_action:action,p_item_id:action==="add"?null:id(body?.itemId),
    p_product_id:code,p_product_name:name,p_required_qty:action==="delete"?null:quantity,
    p_expected_updated_at:version,p_member_id:actor(account),
  },{profileName:`preparing.warehouse.bom-${action}`});
}

// One-time Kit attribution for projects already created with a source Proposal under v229.
export async function initializeProjectKits(body,account) {
  serviceOnly();const project=await rootProject(body?.projectId);
  const record=await selectById("erp_preparing_projects",project);
  if(!record?.source_proposal_id) fail("This project has no source Proposal.",409);
  const proposal=await sourceProposalItems(record.source_proposal_id);
  return rpc("erp_preparing_initialize_project_kits",{
    p_project_id:project,p_items:proposal.items,p_member_id:actor(account),
  },{profileName:"preparing.warehouse.initialize-kits"});
}
export async function editProjectKitItem(body,account) {
  serviceOnly();const project=await rootProject(body?.projectId);
  const action=text(body?.operation);
  if(!["add","update","delete"].includes(action))fail("Invalid Kit edit action.");
  const quantity=action==="delete"?null:body?.quantity;
  if(action!=="delete"&&(!Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000000))
    fail("Enter a positive whole-number Kit quantity.");
  const kitId=str(body?.kitId,"Kit id",160);
  const kitName=str(body?.kitName,"Kit name",160,true);
  const itemId=body?.itemId?id(body.itemId):null;
  if(action!=="add"&&!itemId)fail("Component id is required.");
  const version=text(body?.expectedUpdatedAt);
  if(action!=="add"&&(!version||!Number.isFinite(Date.parse(version))))fail("Refresh this Kit component before editing.",409);
  // New components must come from Products. Resolve the authoritative
  // catalog record on the server so a client cannot spoof the name / ID Code.
  const catalogId=action==="add"?str(body?.productCatalogId,"catalog product",160,true):"";
  const catalogProduct=action==="add"?await getProduct(catalogId):null;
  if(action==="add"&&!catalogProduct)fail("The selected Product is no longer available. Search again.",409);
  if(action==="add"&&!catalogProduct.displayId)fail("This Product has no ID Code. Add it in Products first.",409);
  const productId=action==="add"?str(catalogProduct.displayId,"component code",500):"";
  const productName=action==="add"?str(catalogProduct.name,"component name",500,true):"";
  return rpc("erp_preparing_edit_project_kit_item",{
    p_project_id:project,p_action:action,p_item_id:itemId,
    p_product_id:productId,p_product_name:productName,p_quantity:quantity,
    p_kit_id:kitId,p_kit_name:kitName,
    p_expected_updated_at:action==="add"?null:version,p_member_id:actor(account),
  },{profileName:`preparing.warehouse.kit-${action}`});
}
