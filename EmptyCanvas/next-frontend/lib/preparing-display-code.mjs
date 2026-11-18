// Presentation-only catalog lookup. Never replace the persisted product_id/item ID:
// legacy project rows can contain a Products primary key instead of its ID Code.
const text=value=>String(value??"").trim();
const key=value=>text(value).toLowerCase();
export function preparingDisplayCodeResolver(products=[]){
 const byId=new Map(),byCode=new Map(),byName=new Map();
 const add=(map,k,p)=>{if(!k)return;const bucket=map.get(k)||[];bucket.push(p);map.set(k,bucket);};
 for(const p of products||[]){if(!p?.name)continue;add(byId,key(p.id),p);add(byCode,key(p.displayId),p);add(byName,key(p.name),p);}
 return (stored,name)=>{
  const id=key(stored),n=key(name);
  const matching=list=>(list||[]).filter(p=>key(p.name)===n);
  // IDs have priority, but require the name too because historical codes may be reused.
  for(const candidates of [matching(byId.get(id)),matching(byCode.get(id))]){
   if(candidates.length===1)return text(candidates[0].displayId)||text(stored);
   if(candidates.length>1)return text(stored);
  }
  // Legacy rows can have a stale numeric code; only a unique exact name is safe.
  const names=byName.get(n)||[];
  return names.length===1?text(names[0].displayId)||text(stored):text(stored);
 };
}
export const preparingDisplayCode=row=>text(row?.displayCode)||text(row?.product_id??row?.code);
export const withPreparingDisplayCodes=(rows,resolve)=>(rows||[]).map(row=>({...row,displayCode:resolve(row.product_id??row.code,row.product_name??row.name)}));
