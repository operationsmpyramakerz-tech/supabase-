import "server-only";
import { select, selectById, rpc } from "./supabase-rest";

const TABLES = {
  project: "erp_preparing_projects", school: "erp_preparing_schools",
  carton: "erp_preparing_project_cartons", line: "erp_preparing_project_carton_lines",
  allocation: "erp_preparing_project_allocations", component: "erp_preparing_components",
};
const idPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const text = value => String(value ?? "").trim();
function fail(message, status=400) { const e = new Error(message); e.status=status; throw e; }
function id(value) { const result=text(value); if (!idPattern.test(result)) fail("Invalid record ID."); return result; }
function actor(account) { const member=text(account?.id || account?.memberId || account?.teamMemberId); if (!member) fail("Signed-in member required.",401); return member; }
function sized(value,label,max) { const result=text(value); if(result.length>max) fail(`${label} exceeds ${max} characters.`); return result; }
function quantity(value,allowZero=false) {
  if(!Number.isSafeInteger(value) || value<(allowZero?0:1) || value>1000000) fail("Quantity must be a whole number from 1 to 1,000,000.");
  return value;
}
function requireService() {
  if(!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY))
    fail("Project cartons require a server-side Supabase service key.",503);
}
async function paged(table, filter, label, max=8000, order="created_at.asc") {
  const rows=[];
  for(let offset=0; offset<=max; offset+=400) {
    const batch=await select(table,{select:"*",...filter,order,offset:String(offset),limit:"400"}, {profileName:`preparing.pool.${label}`});
    if(!Array.isArray(batch)) fail(`Unable to load ${label}.`,502);
    rows.push(...batch);
    if(rows.length>max) fail(`Too many ${label}; no partial data was returned.`,409);
    if(batch.length<400) return rows;
  }
  fail(`Too many ${label}; no partial data was returned.`,409);
}
export function kitOptions(components=[]) {
  const options=new Set();
  for(const c of components) {
    if(!Array.isArray(c.source_kits) || !c.source_kits.length) { options.add("General"); continue; }
    for(const item of c.source_kits) if(item && typeof item.kitName==="string" && item.kitName.trim()) options.add(item.kitName.trim());
  }
  return [...options].sort((a,b)=>a.localeCompare(b));
}
export function matchingComponent(line,carton,component) {
  return line?.product_id===component?.product_id &&
    text(line?.product_name).toLowerCase()===text(component?.product_name).toLowerCase() &&
    (carton?.kit_name==="General" && !component?.source_kits?.length ||
      (Array.isArray(component?.source_kits) && component.source_kits.some(x=>x?.kitName===carton?.kit_name)));
}
export function poolAvailability(line,allocations=[]) {
  return Math.max(0,Number(line?.packed_qty||0)-allocations.filter(a=>a.carton_line_id===line.id && a.status==="active")
    .reduce((sum,a)=>sum+Number(a.allocated_qty||0),0));
}
export async function projectCartonWorkspace(projectId) {
  requireService(); const project=id(projectId);
  if(!await selectById(TABLES.project,project)) fail("Project not found.",404);
  const schools=await paged(TABLES.school,{project_id:`eq.${project}`},"schools",400);
  const [cartons,lines,allocations,audit]=await Promise.all([
    paged(TABLES.carton,{project_id:`eq.${project}`},"cartons",1000),
    paged(TABLES.line,{project_id:`eq.${project}`},"carton lines",12000,"carton_id.asc,id.asc"),
    paged(TABLES.allocation,{project_id:`eq.${project}`},"allocations",15000),
    paged("erp_preparing_project_carton_audit",{project_id:`eq.${project}`},"box audit",20000,"changed_at.desc"),
  ]);
  let components=[];
  for(let start=0;start<schools.length;start+=30) {
    const ids=schools.slice(start,start+30).map(x=>x.id);
    components.push(...await paged(TABLES.component,{school_id:`in.(${ids.join(",")})`},"school BOM",12000,"school_id.asc,item_order.asc"));
  }
  return { projectId:project,schools,cartons,lines,allocations,components,audit,kits:kitOptions(components) };
}
export async function createProjectCarton(body,account) {
  requireService();const project=id(body.projectId), cartonLabel=sized(body.cartonLabel,"Carton label",100),kitName=sized(body.kitName,"Kit name",160);
  if(cartonLabel.length<2 || !kitName) fail("Provide a Kit type and carton label.");
  return rpc("erp_preparing_create_project_carton",{p_project_id:project,p_carton_label:cartonLabel,p_kit_name:kitName,
    p_notes:sized(body.notes,"Notes",1000),p_member_id:actor(account)},{profileName:"preparing.pool.create"});
}
export async function setProjectCartonLine(body,account) {
  requireService();return rpc("erp_preparing_set_project_carton_line",{
    p_project_id:id(body.projectId),p_carton_id:id(body.cartonId),p_source_component_id:id(body.sourceComponentId),
    p_quantity:quantity(body.quantity,true),p_expected_updated_at:version(body.expectedUpdatedAt),p_member_id:actor(account),
  },{profileName:"preparing.pool.line"});
}
function version(value) { const s=text(value);if(!s || !Number.isFinite(Date.parse(s))) fail("Refresh before changing this carton.",409);return s; }
export async function sealProjectCarton(body,account) {
  requireService();return rpc("erp_preparing_seal_project_carton",{p_project_id:id(body.projectId),p_carton_id:id(body.cartonId),
    p_expected_updated_at:version(body.expectedUpdatedAt),p_member_id:actor(account)},{profileName:"preparing.pool.seal"});
}
export async function allocateProjectCarton(body,account) {
  requireService();return rpc("erp_preparing_allocate_project_carton",{p_project_id:id(body.projectId),
    p_carton_line_id:id(body.cartonLineId),p_school_id:id(body.schoolId),p_component_id:id(body.componentId),
    p_quantity:quantity(body.quantity),p_member_id:actor(account)},{profileName:"preparing.pool.allocate"});
}
export async function reverseProjectAllocation(body,account) {
  requireService();return rpc("erp_preparing_reverse_project_allocation",{
    p_project_id:id(body.projectId),p_allocation_id:id(body.allocationId),p_member_id:actor(account),
  },{profileName:"preparing.pool.reverse"});
}
export async function cancelProjectCarton(body,account) {
  requireService();return rpc("erp_preparing_cancel_project_carton",{p_project_id:id(body.projectId),
    p_carton_id:id(body.cartonId),p_member_id:actor(account)},{profileName:"preparing.pool.cancel"});
}
