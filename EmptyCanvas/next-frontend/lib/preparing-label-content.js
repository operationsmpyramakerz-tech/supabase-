import 'server-only';
import {select, selectById} from './supabase-rest';
import {labelIdentity} from './preparing-label-token.mjs';

const profileName='preparing.public-label';
function notFound(){const e=new Error('Label not found.');e.status=404;throw e;}
async function rows(table,filters,limit=300){
 const all=[];
 for(let offset=0;offset<=limit;offset+=200){
  const batch=await select(table,{select:'*',...filters,limit:'200',offset:String(offset)}, {profileName});
  if(!Array.isArray(batch))notFound();
  all.push(...batch);
  if(all.length>limit){const e=new Error('Label contains more data than this viewer supports.');e.status=413;throw e;}
  if(batch.length<200)return all;
 }
 return all;
}
const key=item=>`${String(item.product_id||'').toLowerCase()}\u0000${String(item.product_name||'').toLowerCase()}`;
function kitManifest(box,targets,lines){
 const lineMap=new Map(lines.map(row=>[key(row),row]));
 const used=new Set();
 const components=targets.map(target=>{
  used.add(key(target));
  const packed=Math.max(0,Number(lineMap.get(key(target))?.packed_qty)||0);
  return {name:target.product_name,quantity:packed,required:Number(target.expected_qty)||0};
 });
 // Legacy physical lines with no target are shown too, never silently discarded.
 for(const line of lines)if(!used.has(key(line)))components.push({name:line.product_name,quantity:Math.max(0,Number(line.packed_qty)||0),required:null});
 return {label:box.carton_label,kitGroup:box.kit_name,status:box.status==='ready'?'Packed':'Packing Pending',components:components.filter(c=>c.quantity>0),componentTypes:components.length};
}
async function schoolFor(box){
 const school=await selectById('erp_preparing_schools',box.school_id,{profileName});
 if(!school || school.project_id!==box.project_id)notFound();
 return school.beneficiary_name||school.name||'School';
}
// Returns ONLY physical content, the public identifier and the school name.
// No employee names, phone numbers, costing, activity history, or private project metadata.
export async function readPublicLabel(kind,id){
 if(!labelIdentity(kind,id))notFound();
 if(kind==='kit'){
  const box=await selectById('erp_preparing_project_cartons',id,{profileName});
  if(!box?.generated_kit_label || !box.school_id || box.status==='cancelled')notFound();
  const [targets,lines,schoolName]=await Promise.all([
   rows('erp_preparing_school_kit_targets',{kit_box_id:`eq.${id}`},500),
   rows('erp_preparing_project_carton_lines',{carton_id:`eq.${id}`},500),schoolFor(box),
  ]);
  return {kind:'kit',schoolName,...kitManifest(box,targets,lines)};
 }
 const carton=await selectById('erp_preparing_school_cartons',id,{profileName});
 if(!carton?.school_id || carton.status!=='ready')notFound();
 const [links,schoolName]=await Promise.all([
  rows('erp_preparing_school_carton_kits',{carton_id:`eq.${id}`},80),schoolFor(carton),
 ]);
 if(!links.length)notFound();
 // Fetch in a few bounded queries (rather than up to 240 requests for 80 Kits).
 // All membership, school, project and verified-state checks remain server-side.
 const ids=links.map(item=>item.kit_box_id);
 if(new Set(ids).size!==ids.length)notFound();
 const idFilter=`in.(${ids.join(',')})`;
 const [boxes,targets,lines]=await Promise.all([
  rows('erp_preparing_project_cartons',{id:idFilter},90),
  rows('erp_preparing_school_kit_targets',{kit_box_id:idFilter},16000),
  rows('erp_preparing_project_carton_lines',{carton_id:idFilter},16000),
 ]);
 const boxById=new Map(boxes.map(box=>[box.id,box]));
 const kits=[];
 for(const link of links){
  if(link.project_id!==carton.project_id)notFound();
  const box=boxById.get(link.kit_box_id);
  if(!box || box.school_id!==carton.school_id || box.project_id!==carton.project_id ||
    !box.generated_kit_label || box.status!=='ready')notFound();
  kits.push(kitManifest(box,targets.filter(t=>t.kit_box_id===box.id),lines.filter(l=>l.carton_id===box.id)));
 }
 return {kind:'carton',schoolName,label:carton.carton_label,status:'Packed',kits,kitCount:kits.length};
}
