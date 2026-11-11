// v399 — All quantities are school totals, never per-box amounts.
// Pure helpers shared by the UI and regression tests; the SQL RPC repeats
// every check under the project row lock before committing any movement.
const qty = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0 ? Number(n) : 0;
export function schoolKitRequested(component, kitName) {
  if (!component) return 0;
  const sources = Array.isArray(component.source_kits) ? component.source_kits : [];
  if (kitName === 'General') return sources.length ? 0 : qty(component.planned_qty);
  return sources.reduce((sum, part) => sum + (part?.kitName === kitName ? qty(part.quantity) : 0), 0);
}
export function schoolKitPackingPreview({requested,boxes,packed=0,total}) {
  const demand = Number(requested), count = Number(boxes), before = Number(packed), wanted = Number(total);
  if (!Number.isSafeInteger(count) || count < 1) return {ok:false,error:'Generate Kit labels for this school and group first.'};
  if (!Number.isSafeInteger(demand) || demand < 1) return {ok:false,error:'Invalid school Proposal quantity.'};
  if (demand % count !== 0) return {ok:false,error:`School requested ${demand} for ${count} boxes. Identical boxes require a whole number per box. Review the number of labels or the school Proposal.`};
  if (total === "" || total === null || total === undefined || !Number.isSafeInteger(wanted) || wanted < 0) return {ok:false,error:'Enter a non-negative whole number.'};
  if (wanted > demand) return {ok:false,error:`School requested ${demand}; you cannot pack ${wanted}.`};
  if (wanted % count !== 0) return {ok:false,error:`${wanted} cannot be split equally across ${count} boxes without fractions.`};
  if (!Number.isSafeInteger(before) || before < 0) return {ok:false,error:'Invalid current packed quantity.'};
  return {ok:true,perBox:wanted/count,requiredPerBox:demand/count,delta:wanted-before,remaining:demand-wanted};
}
export function schoolKitPackingSchools(row,kitName,schools=[],components=[],boxes=[],lines=[]) {
  const norm = v=>String(v??'').trim().toLowerCase();
  return schools.flatMap(school=>{
    const source = components.filter(c=>c.school_id===school.id&&norm(c.product_id)===norm(row.product_id)&&norm(c.product_name)===norm(row.product_name)&&schoolKitRequested(c,kitName)>0);
    if (!source.length) return [];
    const kitBoxes = boxes.filter(box=>box.generated_kit_label&&box.school_id===school.id&&box.kit_name===kitName&&box.status!=='cancelled');
    const ids = new Set(kitBoxes.map(box=>box.id));
    const packed = lines.filter(l=>ids.has(l.carton_id)&&norm(l.product_id)===norm(row.product_id)&&norm(l.product_name)===norm(row.product_name)).reduce((n,l)=>n+qty(l.packed_qty),0);
    const group=components.filter(c=>c.school_id===school.id&&(
      kitName==='General' ? !Array.isArray(c.source_kits)||!c.source_kits.length :
       Array.isArray(c.source_kits)&&c.source_kits.some(k=>k?.kitName===kitName)));
    const keys=new Set();let groupIssue='';
    for(const c of group){
      const key=`${norm(c.product_id)}::${norm(c.product_name)}`;
      if(keys.has(key)){groupIssue='Duplicate components in this school Kit group';break;}
      keys.add(key);
      const required=schoolKitRequested(c,kitName);
      if(kitBoxes.length && (required<kitBoxes.length||required%kitBoxes.length!==0)){
        groupIssue=`${c.product_name}: ${required} requested for ${kitBoxes.length} boxes cannot be divided into identical whole-number Kits`;
        break;
      }
    }
    return [{schoolId:school.id,schoolName:school.beneficiary_name||school.name||school.school_name||'School',sources:source.length,required:source.reduce((n,c)=>n+schoolKitRequested(c,kitName),0),boxes:kitBoxes.length,packed,locked:kitBoxes.some(b=>b.status!=='draft'),groupIssue}];
  });
}
