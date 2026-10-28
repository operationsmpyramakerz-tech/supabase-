// Pure helpers shared by the server and local regression tests.
export const n = value => Number(value) || 0;
export function componentKey(productId, productName) {
  const id = String(productId ?? "").trim().toLowerCase();
  const name = String(productName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return id ? `id:${id}` : `name:${name}`;
}
export function warehouseTotals(items, receiptLines, allocations) {
  const summaries = new Map(items.map(item => [item.id, { ...item, accepted: 0, damaged: 0, allocated: 0, available: 0 }]));
  for (const row of receiptLines) { const item = summaries.get(row.item_id); if (item) { item.accepted += n(row.accepted_delta); item.damaged += n(row.damaged_delta); } }
  for (const row of allocations) { const item = summaries.get(row.item_id); if (item) item.allocated += n(row.delta_qty); }
  for (const item of summaries.values()) item.available = item.accepted - item.allocated;
  return [...summaries.values()];
}
export function demandsForSchool(demands, allocations, schoolId) {
  const assigned = new Map();
  for (const row of allocations) if (row.school_id === schoolId)
    assigned.set(row.item_id, (assigned.get(row.item_id) || 0) + n(row.delta_qty));
  return demands.filter(row => row.school_id === schoolId).map(row => ({...row, allocated: assigned.get(row.item_id) || 0}));
}
export function assembleSchoolProposalItems(proposalItems) {
  const rows = new Map();
  for (const p of proposalItems || []) {
    const name = String(p?.productName ?? "").trim();
    const productId = String(p?.productId ?? "").trim();
    const qty = Number(p?.quantity);
    if (!name || name.length > 500 || productId.length > 500 || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000000)
      throw new Error("Proposal has an invalid component name or quantity.");
    const key = componentKey(productId, name);
    if (key.length > 700) throw new Error("Proposal component code is too long.");
    const previous = rows.get(key);
    if (previous) {
      previous.qty += qty;
      if (previous.qty > 1000000) throw new Error("A school requires more than 1,000,000 of one component.");
    } else rows.set(key, {key, productId, name, qty});
  }
  if (!rows.size || rows.size > 1000) throw new Error("Proposal must contain 1-1000 valid component types.");
  return [...rows.values()];
}

// Preserve the per-Kit split without duplicating a component in the warehouse stock ledger.
// Every product remains ONE master BOM row, while sourceKits records its planned quantities.
export function assembleProjectProposalItems(proposalItems) {
  const aggregate=assembleSchoolProposalItems(proposalItems);
  const groupsByProduct=new Map();
  for(const original of proposalItems||[]) {
    const key=componentKey(original.productId,original.productName);
    if(!groupsByProduct.has(key))groupsByProduct.set(key,new Map());
    const groups=groupsByProduct.get(key),total=Number(original.quantity);
    const sources=Array.isArray(original?.sourceKits)?original.sourceKits:Array.isArray(original?.source_kits)?original.source_kits:[];
    let used=0;
    function add(kitId,kitName,quantity) {
      const sourceKey=kitId?`id:${kitId.toLowerCase()}`:`name:${kitName.toLowerCase()}`;
      const previous=groups.get(sourceKey);
      if(previous)previous.quantity+=quantity;
      else groups.set(sourceKey,{kitId,kitName,quantity,order:groups.size});
    }
    for(const source of sources) {
      const kitId=String(source?.kitId||source?.kit_id||"").trim();
      const kitName=String(source?.kitName||source?.kit_name||source?.name||"").trim();
      const quantity=Number(source?.quantity??source?.qty);
      if(!kitId&&!kitName)continue;
      if(!kitName||kitName.length>160||!Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000000)
        throw new Error(`Invalid Kit quantity in Proposal for ${original.productName}.`);
      used+=quantity;add(kitId,kitName,quantity);
    }
    if(used>total)throw new Error(`Kit quantities exceed total Proposal quantity for ${original.productName}.`);
    if(used<total)add("","Direct components",total-used);
  }
  return aggregate.map(row=>{
    const sourceKits=[...(groupsByProduct.get(row.key)?.values()||[])];
    if(sourceKits.reduce((sum,kit)=>sum+kit.quantity,0)!==row.qty)
      throw new Error(`Kit quantity mismatch for ${row.name}.`);
    return {...row,sourceKits};
  });
}

// Project BOM / Kit quantities represent ONE school's plan. The project
// requirement is a read-time calculation; receipts remain physical stock.
export function projectRequired(perSchoolQty, schoolCount) {
  const qty=Number(perSchoolQty), schools=Number(schoolCount);
  if (!Number.isSafeInteger(qty) || qty<0 || !Number.isSafeInteger(schools) || schools<0)
    throw new Error("Invalid project requirement input.");
  const total=qty*schools;
  if (!Number.isSafeInteger(total)) throw new Error("Project requirement exceeds safe integer range.");
  return total;
}
