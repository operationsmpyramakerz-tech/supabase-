// Pure view-model for one school-specific physical Kit.
// Source quantities are a frozen packing target; only actual carton lines are packed.
const natural=n=>Number.isSafeInteger(Number(n)) && Number(n)>=0 ? Number(n) : 0;
const key=(productId,productName)=>`${String(productId??'').trim().toLowerCase()}\u0000${String(productName??'').trim().toLowerCase()}`;
export function schoolKitPackingProgress(kitBoxId,targets=[],lines=[]){
 const wanted=targets.filter(t=>t.kit_box_id===kitBoxId);
 const actual=lines.filter(l=>l.carton_id===kitBoxId);
 const byKey=new Map(actual.map(l=>[key(l.product_id,l.product_name),natural(l.packed_qty)]));
 const targetKeys=new Set(wanted.map(t=>key(t.product_id,t.product_name)));
 const required=wanted.reduce((n,t)=>n+natural(t.expected_qty),0);
 const packed=actual.reduce((n,l)=>n+natural(l.packed_qty),0);
 const remaining=wanted.reduce((n,t)=>n+Math.max(0,natural(t.expected_qty)-(byKey.get(key(t.product_id,t.product_name))||0)),0);
 const unexpected=actual.filter(l=>!targetKeys.has(key(l.product_id,l.product_name)));
 const overpacked=wanted.some(t=>(byKey.get(key(t.product_id,t.product_name))||0)>natural(t.expected_qty));
 return {required,packed,remaining,planned:wanted.length>0,unexpected,overpacked,
  complete:wanted.length>0&&remaining===0&&!overpacked&&unexpected.length===0};
}
