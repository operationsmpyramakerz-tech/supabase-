// Pure client view-model for immutable outer school cartons (v397).
export function availableSchoolKits(schoolId,readyKits=[],memberships=[]){
  if(!schoolId)return [];
  const used=new Set(memberships.map(row=>row.kit_box_id));
  return readyKits.filter(kit=>kit.generated_kit_label&&kit.status==='ready'&&kit.school_id===schoolId&&!used.has(kit.id));
}
export function validSchoolCartonSelection(schoolId,chosenIds,readyKits=[],memberships=[]){
  if(!schoolId||!Array.isArray(chosenIds)||chosenIds.length<1||chosenIds.length>80)return false;
  if(new Set(chosenIds).size!==chosenIds.length)return false;
  const allowed=new Set(availableSchoolKits(schoolId,readyKits,memberships).map(row=>row.id));
  return chosenIds.every(id=>allowed.has(id));
}
export function schoolCartonContents(cartonId,memberships=[],kits=[]){
  const ids=new Set(memberships.filter(item=>item.carton_id===cartonId).map(item=>item.kit_box_id));
  return kits.filter(item=>ids.has(item.id));
}
