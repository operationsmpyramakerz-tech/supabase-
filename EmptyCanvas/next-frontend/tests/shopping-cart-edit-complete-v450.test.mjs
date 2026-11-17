import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const server = read('lib/shopping-cart-order-service.js');
const client = read('components/orders/ShoppingCartClient.jsx');
const transfer = read('components/orders/CurrentOrdersClient.jsx');
function part(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return src.slice(i,j).replace(/^export /gm,'');}
const text=v=>String(v??'').trim();
const directError=(message,status)=>Object.assign(new Error(message),{status});
function serverContext(catalog, rows){
 const writes=[];
 const ctx={text,directError, Date, EDIT_TOKEN_TTL_MS:1800000, valueFor:(row,keys)=>keys.map(key=>row[key]).find(v=>v!==undefined)??null,
  numberOrNull:v=>v==null?null:Number(v),canonicalOrderType:text, orderTypeKey:v=>text(v).toLowerCase().replace(/[^a-z0-9]/g,''),
  cleanIds:ids=>[...new Set(ids)],isSupabaseConfigured:()=>true,orderActionAllowed:()=>true,
  verifyOwnedRows:async()=>rows,getProductsList:async()=>catalog,accountMemberId:()=> '12',accountUsername:()=> 'Lab',signPayload:p=>p,
  verifySignedPayload:()=>({ids:rows.map(r=>text(r.id)),orderNumber:149,orderType:'Request Products'}),
  requireOrderRequestMetadata:()=>({priorityLevel:'Normal',requestedDeliveryDate:'2026-11-24'}),orderTable:()=> 'orders',
  updateById:async(_t,id,patch)=>{writes.push({id,patch});return {id,...patch};},insert:async(_t,patch)=>{writes.push({id:'new',patch});return {id:'new',...patch};},invalidateLegacyOperationsCaches:async()=>{},
 };
 vm.runInNewContext(part(server,'function productNameKey(','async function nextOrderNumber(')+part(server,'function rowResponse(','async function verifyOwnedRows(')+part(server,'export async function initializeCurrentOrderEditDirect(','async function createNewOrderDirect(')+part(server,'async function updateExistingOrderDirect(','export async function submitShoppingCartOrderDirect('),ctx);
 return {ctx,writes};
}
function clientContext(){const ctx={text,quantity:(v,f)=>Number(v)||f};vm.runInNewContext(part(client,'function normalizeDraftItem(','function orderTypeMeta('),ctx);return ctx;}
const catalog=Array.from({length:19},(_,i)=>({id:String(i+1),name:`Component ${i+1}`,url:`https://example.com/supplier/${i%7}`,unitPrice:10}));
function rowsFor(items){return items.map((p,i)=>({id:String(100+i),order_number:149,order_type:'Request Products',product_name:p.name,product_url:p.url,quantity_requested:i+1,reason:'Curriculum',status:'Under Supervision'}));}
test('19 legacy order rows sharing seven supplier links resolve by exact name, with no lost lines',async()=>{
 const rows=rowsFor(catalog);const {ctx}=serverContext(catalog,rows);
 const result=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 assert.equal(result.count,19);assert.equal(new Set(result.products.map(p=>p.id)).size,19);
 assert.deepEqual(Array.from(result.products,p=>p.id),catalog.map(p=>p.id));
 assert.equal(clientContext().normalizeDraft(result.products).length,19);
 assert.deepEqual(Array.from(result.products,p=>p.quantity),rows.map(r=>r.quantity_requested));
});
test('Repeated catalog product rows keep independent quantities and identities, including re-normalization',async()=>{
 const items=Array.from({length:19},(_,i)=>catalog[i%7]);const rows=rowsFor(items);const {ctx}=serverContext(catalog,rows);
 const result=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const c=clientContext();const normalized=c.normalizeDraft(c.normalizeDraft(result.products));
 assert.equal(normalized.length,19);assert.equal(new Set(normalized.map(c.draftItemKey)).size,19);
 assert.deepEqual(Array.from(normalized,p=>p.orderRowId),rows.map(r=>r.id));
 assert.deepEqual(Array.from(normalized,p=>p.quantity),rows.map(r=>r.quantity_requested));
 assert.equal(c.normalizeDraft([{id:'5',quantity:1},{id:'5',quantity:2}]).length,1);
});
test('Product ID is authoritative; Arabic names and ambiguous legacy matches are handled without guessing',()=>{
 const list=[{id:'1',name:'أداة أ',url:'same'},{id:'2',name:'أداة ب',url:'same'},{id:'3',name:'أداة ب',url:'other'}];
 const {ctx}=serverContext(list,[]);const maps=ctx.productMaps(list);
 assert.equal(ctx.resolveRowProduct({product_id:'3',product_name:'old'},maps).id,'3');
 assert.equal(ctx.resolveRowProduct({product_name:'أداة أ',product_url:'same'},maps).id,'1');
 assert.equal(ctx.resolveRowProduct({product_name:'أداة ب',product_url:'same'},maps).id,'2');
 assert.equal(ctx.resolveRowProduct({product_name:'أداة ب'},maps),null);
 assert.equal(ctx.resolveRowProduct({product_name:'unknown',product_url:'same'},maps),null);
});
test('A 7-of-19 submit or forged row ID is rejected before any database writes',async()=>{
 const rows=rowsFor(catalog);const {ctx,writes}=serverContext(catalog,rows);
 const result=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const submit=(products,removedOrderRowIds)=>ctx.updateExistingOrderDirect({products,removedOrderRowIds,editToken:'signed'});
 await assert.rejects(submit(result.products.slice(0,7),[]),{status:409});
 await assert.rejects(submit([...result.products,{...result.products[0]}],[]),{status:409});
 await assert.rejects(submit(result.products,['999']),{status:409});
 await assert.rejects(submit(result.products,undefined),{status:409});assert.equal(writes.length,0);
});
test('Saving 19 rows updates the exact row IDs; only explicit deletion archives a row',async()=>{
 const rows=rowsFor(Array.from({length:19},(_,i)=>catalog[i%7]));const {ctx,writes}=serverContext(catalog,rows);
 const result=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const products=Array.from(result.products,p=>({...p}));products[8].quantity=222;products[9].id='19';
 const removed=products.splice(2,1)[0];products.push({id:'8',quantity:5,reason:'Curriculum'});
 const response=await ctx.updateExistingOrderDirect({products,removedOrderRowIds:[removed.orderRowId],editToken:'signed'});
 assert.equal(response.success,true);assert.equal(writes.length,20);
 assert.equal(writes.find(w=>w.id===rows[8].id).patch.quantity_requested,222);
 assert.equal(writes.find(w=>w.id===rows[9].id).patch.product_id,'19');
 assert.equal(writes.filter(w=>w.patch.status==='Archive').length,1);
 assert.equal(writes.find(w=>w.patch.status==='Archive').id,removed.orderRowId);
 assert.equal(writes.filter(w=>w.id==='new').length,1);
});
test('Missing or mismatched transfer cannot silently load a different order',()=>{
 const storage={getItem:k=>k.endsWith(':correct')?JSON.stringify({ts:10,products:[{id:'1'}]}):null};
 const ctx={text,storageAreas:()=>[storage],parseJson:v=>v?JSON.parse(v):null,freshTransfer:p=>p?.ts===10};
 vm.runInNewContext(part(client,'function readEditTransfer(','function clearEditTransfer('),ctx);
 assert.equal(ctx.readEditTransfer('correct').products.length,1);assert.equal(ctx.readEditTransfer('wrong'),null);assert.equal(ctx.readEditTransfer(''),null);
 assert.match(transfer,/suppliedIds\.size !== products\.length/);assert.match(transfer,/if \(!editKey\) throw new Error/);
});
test('Row identity travels through quantity, picker, deletion and submit; X is scoped to edit mode',()=>{
 assert.match(client,/key=\{draftItemKey\(item\)\}/);assert.match(client,/orderRowId: previous\?\.orderRowId/);
 assert.match(client,/removedOrderRows\.current\.add\(item\.orderRowId\)/);assert.match(client,/removedOrderRowIds: \[\.\.\.removedOrderRows\.current\]/);
 assert.match(client,/onQuantityChange\(draftItemKey\(item\), next\)/);assert.match(client,/aria-label="Cancel edit"[\s\S]*?<CartSvgIcon name="x" size=\{22\}/);
 assert.match(read('public/css/shopping-cart.css'),/\.classic-cart-cancel-edit > svg \{[\s\S]*?stroke: currentColor !important/);
 assert.match(read('app/api/orders/shopping-cart/submit-direct/route.js'),/removedOrderRowIds: body\?\.removedOrderRowIds/);
 assert.match(server,/product_id: item\.customProduct \? null : item\.id/);
});
