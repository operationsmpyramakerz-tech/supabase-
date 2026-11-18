import "server-only";
import { select, selectById, rpc } from "./supabase-rest";

const uuid = value => { const text=String(value||"").trim();if(!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(text))throw Object.assign(new Error("Invalid identifier."),{status:400});return text; };
const clean=value=>String(value??"").trim();
function invalid(message,status=400){throw Object.assign(new Error(message),{status});}
function serviceOnly(){if(!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY))invalid("Server-side service key required.",503);}
function actor(account){const id=clean(account?.id||account?.memberId||account?.teamMemberId);if(!id)invalid("Verified member required.",401);return id;}
async function school(id){const row=await selectById("erp_preparing_schools",uuid(id));if(!row)invalid("School not found.",404);return row;}
function positive(value){if(!Number.isSafeInteger(value)||value<1||value>1000000)invalid("Quantity must be a whole number between 1 and 1,000,000.");return value;}
function field(value,name,min,max){const v=clean(value);if(v.length<min||v.length>max)invalid(`${name} must be ${min}–${max} characters.`);return v;}
function evidence(value){const v=field(value,"Evidence link",0,2048);if(v&&!/^https:\/\/[^\s]+$/i.test(v))invalid("Only HTTPS evidence links are accepted.");return v;}
function version(value){const v=clean(value);if(!v||!Number.isFinite(Date.parse(v)))invalid("Refresh the batch before cancellation.",409);return v;}
async function schoolRows(table,fields,id,order,maximum){
 const all=[];
 for(let offset=0;offset<=maximum;offset+=400){
  const page=await select(table,{select:fields,school_id:`eq.${id}`,order,offset:String(offset),limit:"400"},
    {profileName:`preparing.reconciliation.${table}`});
  if(!Array.isArray(page))invalid(`Unexpected ${table} response.`,502);
  all.push(...page);
  if(all.length>maximum)invalid(`Reconciliation ${table} exceeds record limit; nothing was omitted silently.`,409);
  if(page.length<400)return all;
 }
 invalid(`Reconciliation ${table} exceeds record limit.`,409);
}
export async function preparingReconciliation(schoolId){
 serviceOnly();const id=(await school(schoolId)).id;
 const [components,shipments,lines,returns,replacements,audit]=await Promise.all([
  schoolRows("erp_preparing_components","id,school_id,product_id,product_name,planned_qty",id,"item_order.asc",1000),
  schoolRows("erp_preparing_shipments","id,school_id,carton_label,status,receipt_reference,updated_at",id,"created_at.asc",2000),
  schoolRows("erp_preparing_shipment_lines","shipment_id,school_id,component_id,packed_qty,received_qty",id,"shipment_id.asc,component_id.asc",10000),
  schoolRows("erp_preparing_delivery_returns","*",id,"created_at.desc",2000),
  schoolRows("erp_preparing_replacement_batches","*",id,"created_at.desc",2000),
  select("erp_preparing_reconciliation_audit",{select:"id,action,details,changed_by_id,changed_at",school_id:`eq.${id}`,order:"changed_at.desc",limit:"100"}),
 ]);
 return {components,shipments,lines,returns,replacements,audit};
}
export async function recordPreparingReturn(body,account){
  serviceOnly();await school(body?.schoolId);
  return rpc("erp_preparing_record_school_return",{
    p_school_id:uuid(body.schoolId),p_shipment_id:uuid(body.shipmentId),p_component_id:uuid(body.componentId),
    p_quantity:positive(body.quantity),p_reference:field(body.reference,"Signed return reference",2,160),
    p_reason:field(body.reason,"Return reason",10,1500),p_evidence_url:evidence(body.evidenceUrl),p_member_id:actor(account),
  },{profileName:"preparing.school-return"});
}
export async function createPreparingReplacement(body,account){
  serviceOnly();await school(body?.schoolId);
  return rpc("erp_preparing_create_replacement_batch",{
    p_school_id:uuid(body.schoolId),p_component_id:uuid(body.componentId),
    p_quantity:positive(body.quantity),p_reference:field(body.reference,"Replacement approval reference",2,160),
    p_reason:field(body.reason,"Replacement reason",10,1500),p_member_id:actor(account),
  },{profileName:"preparing.replacement-create"});
}
export async function cancelPreparingReplacement(body,account){
  serviceOnly();await school(body?.schoolId);
  return rpc("erp_preparing_cancel_replacement_batch",{
    p_school_id:uuid(body.schoolId),p_shipment_id:uuid(body.shipmentId),
    p_expected_updated_at:version(body.expectedUpdatedAt),p_member_id:actor(account),
  },{profileName:"preparing.replacement-cancel"});
}
