import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { isCustomCartItem, validateProductAddition } from '../lib/product-addition-request-payload.mjs';
const read = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const server = read('lib/shopping-cart-order-service.js');
const client = read('components/orders/ShoppingCartClient.jsx');
const transfer = read('components/orders/CurrentOrdersClient.jsx');
function part(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return src.slice(i,j).replace(/^export /gm,'');}
const text=v=>String(v??'').trim();
const directError=(message,status)=>Object.assign(new Error(message),{status});
function serverContext(catalog, rows, pendingRequests = []){
 const writes=[]; const requests=[]; const deleted=[];
 const ctx={text,directError, crypto, Date, EDIT_TOKEN_TTL_MS:86400000, valueFor:(row,keys)=>keys.map(key=>row[key]).find(v=>v!==undefined)??null,
  numberOrNull:v=>v==null?null:Number(v),canonicalOrderType:text, orderTypeKey:v=>text(v).toLowerCase().replace(/[^a-z0-9]/g,''),
  cleanIds:ids=>[...new Set(ids)],isSupabaseConfigured:()=>true,orderActionAllowed:()=>true,
  verifyOwnedRows:async()=>rows,getProductsList:async()=>catalog,accountMemberId:()=> '12',accountUsername:()=> 'Lab',signPayload:p=>p,
  isCustomCartItem,validateProductAddition,findProductAdditionRequestsForOrderRows:async ids=>new Map(pendingRequests.filter(row=>ids.includes(row.order_row_id)).map(row=>[row.order_row_id,row])),
  ensureProductAdditionRequestsTable:async()=>{}, createProductAdditionRequests:async(items,created,actor,orderNumber)=>requests.push({items,created,actor,orderNumber}),
  cancelProductAdditionRequestsForOrderRows:async()=>{}, deleteByIds:async(_t,ids)=>deleted.push(...ids),
  verifySignedPayload:()=>({ids:rows.map(r=>text(r.id)),orderNumber:149,orderType:'Request Products'}),
  requireOrderRequestMetadata:()=>({priorityLevel:'Normal',requestedDeliveryDate:'2026-11-24'}),orderTable:()=> 'orders',
  updateById:async(_t,id,patch)=>{writes.push({id,patch});return {id,...patch};},insert:async(_t,patch)=>{writes.push({id:'new',patch});return {id:'new',...patch};},invalidateLegacyOperationsCaches:async()=>{},
 };
 vm.runInNewContext(part(server,'function productNameKey(','async function nextOrderNumber(')+part(server,'function rowResponse(','async function verifyOwnedRows(')+part(server,'export async function initializeCurrentOrderEditDirect(','async function createNewOrderDirect(')+part(server,'async function updateExistingOrderDirect(','export async function submitShoppingCartOrderDirect('),ctx);
 return {ctx,writes,requests,deleted};
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

const customDetails={name:'New adapter',idCode:'AD-1',unitPrice:125.5,quantity:2,unit:'Piece',tag:'Electronics',url:'https://example.com/new',imageUrl:'https://example.com/new.webp'};
const customId='new:123e4567-e89b-42d3-a456-426614174000';
const customItem={id:customId,customProduct:customDetails,quantity:2,reason:'Curriculum'};
test('edit submit keeps all 19 original rows and adds the new pending request to the SAME order and owner',async()=>{
 const rows=rowsFor(catalog).map(row=>({...row,team_member_id:'99',team_member_name:'QIS',status:'Approved',sv_approval:'Approved'}));
 const {ctx,writes,requests}=serverContext(catalog,rows);
 const result=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const response=await ctx.updateExistingOrderDirect({account:{teamMemberId:'12',username:'Editor'},products:[...result.products,customItem],removedOrderRowIds:[],editToken:'signed'});
 assert.equal(response.orderNumber,149);assert.equal(response.orderItems.length,20);assert.equal(writes.length,20);
 const added=writes.find(w=>w.id==='new').patch;
 assert.equal(added.order_number,149);assert.equal(added.team_member_id,'99');assert.equal(added.team_member_name,'QIS');assert.equal(added.product_id,null);assert.equal(added.product_name,customDetails.name);assert.equal(added.product_tag,'Electronics');assert.equal(added.quantity_requested,2);assert.equal(added.unit_price,125.5);
 assert.equal(added.status,'Under Supervision');assert.equal(added.sv_approval,null);assert.equal(requests.length,1);assert.equal(requests[0].created[0].id,'new');assert.equal(requests[0].items[0].customProduct.imageUrl,customDetails.imageUrl);assert.equal(requests[0].orderNumber,149);
 assert.equal(writes.filter(w=>w.id!=='new').length,19);assert.equal(writes.filter(w=>w.id!=='new').every(w=>w.patch.status==='Approved'),true);
 assert.equal(writes.filter(w=>w.id!=='new').every(w=>!('quantity_received_by_operations' in w.patch) && !('quantity_progress' in w.patch) && !('quantity_remaining' in w.patch)),true);
});
test('duplicate, forged row replacement, wrong order type and missing original row fail before writes',async()=>{
 const rows=rowsFor(catalog);const {ctx,writes}=serverContext(catalog,rows);
 const {products}=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const submit=(items,orderType='Request Products',removedOrderRowIds=[])=>ctx.updateExistingOrderDirect({products:items,orderType,removedOrderRowIds,editToken:'signed'});
 await assert.rejects(submit([...products,customItem,customItem]),{status:400});
 await assert.rejects(submit([...products.slice(1),{...customItem,orderRowId:rows[0].id}]),{status:409});
 await assert.rejects(submit([...products,customItem],'Withdraw Products'),{status:409});
 await assert.rejects(submit([...products.slice(1),customItem]),{status:409});
 assert.equal(writes.length,0);
});
test('missing catalog review migration or failed request creation does not modify existing rows',async()=>{
 const rows=rowsFor(catalog);const {ctx,writes,deleted}=serverContext(catalog,rows);
 const {products}=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const submit=()=>ctx.updateExistingOrderDirect({products:[...products,customItem],removedOrderRowIds:[],editToken:'signed'});
 ctx.ensureProductAdditionRequestsTable=async()=>{throw directError('migration missing',503);};
 await assert.rejects(submit(),{status:503});assert.equal(writes.length,0);
 ctx.ensureProductAdditionRequestsTable=async()=>{};
 ctx.createProductAdditionRequests=async()=>{throw directError('request insert failed',500);};
 await assert.rejects(submit(),{status:500});assert.equal(writes.length,1);assert.equal(writes[0].id,'new');assert.deepEqual(deleted,['new']);
});
test('reopening pending catalog rows preserves identity, name, qty and catalog request even on shared catalog URL',async()=>{
 const rows=rowsFor(catalog);rows.push({id:'999',order_number:149,order_type:'Request Products',product_name:catalog[0].name,product_id:null,product_url:catalog[0].url,quantity_requested:2,reason:'Curriculum',status:'Under Supervision'});
 const request={id:customId.slice(4),order_row_id:'999',status:'pending',name:customDetails.name,id_code:customDetails.idCode,unit_price:customDetails.unitPrice,unit:customDetails.unit,tag:customDetails.tag,url:customDetails.url,image_url:customDetails.imageUrl};
 const {ctx,writes,requests}=serverContext(catalog,rows,[request]);
 const {products,count}=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 assert.equal(count,20);const pending=products[19];assert.equal(pending.id,customId);assert.equal(pending.customProduct.name,customDetails.name);assert.equal(pending.quantity,2);
 const submit=(items,removedOrderRowIds=[])=>ctx.updateExistingOrderDirect({products:items,removedOrderRowIds,editToken:'signed'});
 await assert.rejects(submit(products.slice(0,19),['999']),{status:409});
 await assert.rejects(submit([...products.slice(0,19),{...pending,quantity:3}]),{status:409});
 assert.equal(writes.length,0);
 await submit(products);assert.equal(requests.length,0);
 const patch=writes.find(w=>w.id==='999').patch;assert.equal('product_id' in patch,false);assert.equal('quantity_requested' in patch,false);assert.equal('status' in patch,false);
});
test('Add New renders in both empty and populated edit cart; image uploads require edit grants rather than new submit',()=>{
 assert.equal((client.match(/\{canAddNewComponent \? \(/g)||[]).length,2);
 assert.match(client,/const canAddNewComponent =[^;]*permissions\.edit_submit === true && !!activeEditTransfer/);
 assert.match(client,/if \(!canAddNewComponent \|\| additionEditor\?\.item\?\.orderRowId\)/);
 assert.match(client,/uploadEndpoint=\{`\/next\/api\/orders\/shopping-cart\/request-image\$\{editMode \? "\?edit=1" : ""\}`\}/);
 const route=read('app/api/orders/shopping-cart/request-image/route.js');
 assert.match(route,/editMode \? "orders\.shopping\.edit_submit" : "orders\.shopping\.submit"/);
 assert.match(route,/if \(editMode\) gate = orderActionGate\(gate, "orders\.my\.edit"\)/);
 assert.match(route,/shoppingSourceAllowed\(gate.account, "components"\)/);
});

test('image upload endpoint enforces both edit permissions independently of the new-order permission',async()=>{
 const route=read('app/api/orders/shopping-cart/request-image/route.js');
 let grants=new Set(),components=true,uploads=0;
 const ctx={URL,NextResponse:{json:(body, options={})=>({body,status:options.status||200})},getLegacyAccountGate:async()=>({ok:true,account:{}}),
  orderActionGate:(gate,key)=>!gate.ok?gate:grants.has(key)?gate:{...gate,ok:false,status:403,error:key},shoppingSourceAllowed:()=>components,
  createProductImageUploadTicket:async()=>{uploads++;return {publicUrl:'https://test.example/item.webp'};}};
 vm.runInNewContext(part(route,'export async function POST(', '\n}')+'\n}',ctx);
 const req=edit=>({url:`https://erp.example/next/api/orders/shopping-cart/request-image${edit?'?edit=1':''}`,json:async()=>({filename:'x.webp',mime:'image/webp',size:100})});
 grants=new Set(['orders.shopping.edit_submit','orders.my.edit']);
 assert.equal((await ctx.POST(req(true))).status,200);assert.equal((await ctx.POST(req(false))).status,403);
 grants.delete('orders.my.edit');assert.equal((await ctx.POST(req(true))).status,403);
 grants=new Set(['orders.shopping.submit']);assert.equal((await ctx.POST(req(true))).status,403);assert.equal((await ctx.POST(req(false))).status,200);
 components=false;assert.equal((await ctx.POST(req(false))).status,403);assert.equal(uploads,2);
});

test('A real signed edit token still saves after 31 minutes and after 23 hours; it expires after 24 hours', async()=>{
 const rows=rowsFor(catalog);const {ctx,writes}=serverContext(catalog,rows);
 let now=Date.parse('2026-11-18T08:00:00Z');
 ctx.Date=class extends Date {static now(){return now;}};
 ctx.sessionSigningSecret=()=> 'test-only-edit-signature-secret';ctx.Buffer=Buffer;
 ctx.accountMemberId=a=>a.teamMemberId;
 vm.runInNewContext(part(server,'function signingSecret()','// Names (including Arabic)'),ctx);
 const account={teamMemberId:'12'};
 const initial=await ctx.initializeCurrentOrderEditDirect({account,orderIds:rows.map(r=>r.id)});
 const token=initial.editToken;const start=now;
 const products=Array.from(initial.products,p=>({...p}));products[0].quantity=5;
 const submit=(actor=account, t=token)=>ctx.updateExistingOrderDirect({account:actor,products,removedOrderRowIds:[],editToken:t});
 now=start+31*60*1000;
 assert.equal((await submit()).success,true);
 now=start+23*60*60*1000;
 assert.equal((await submit()).success,true);
 const before=writes.length;
 await assert.rejects(submit({teamMemberId:'13'}),{status:403});
 await assert.rejects(submit(account,token.slice(0,-1)+'!'),{status:400});
 now=start+24*60*60*1000+1;
 await assert.rejects(submit(),{status:400});assert.equal(writes.length,before);
 // A legacy short-lived token must not acquire a new long validity window.
 const legacy=ctx.signPayload({scope:'edit-order',uid:'12',ids:rows.map(r=>r.id),exp:start+30*60*1000});
 await assert.rejects(submit(account,legacy),{status:400});
 const undo=ctx.signPayload({scope:'undo-order',uid:'12',exp:now+30000});
 assert.equal(ctx.verifySignedPayload(undo,'undo-order',account).scope,'undo-order');
 now+=30001;assert.throws(()=>ctx.verifySignedPayload(undo,'undo-order',account),{status:409});
});

test('Signed edit baseline detects changes to quantity, reason, status, received quantity and ownership before any mutation',async()=>{
 const rows=rowsFor(catalog);const {ctx,writes}=serverContext(catalog,rows);
 const initial=await ctx.initializeCurrentOrderEditDirect({orderIds:rows.map(r=>r.id)});
 const baseline=initial.editToken;assert.match(baseline.snapshot,/^[0-9a-f]{64}$/);
 ctx.verifySignedPayload=()=>baseline;
 const submit=()=>ctx.updateExistingOrderDirect({products:initial.products,removedOrderRowIds:[],editToken:'signed'});
 for (const patch of [{quantity_requested:999},{reason:'Other reason'},{status:'Delivered'},{quantity_received_by_operations:2},{team_member_id:'99'}]) {
  const original=rows[0];rows[0]={...original,...patch};
  await assert.rejects(submit(),{status:409});assert.equal(writes.length,0);rows[0]=original;
 }
 // Ignore JSON field ordering, not changes to real values.
 const shuffled=Array.from(rows).reverse().map(row=>Object.fromEntries(Object.entries(row).reverse()));
 assert.equal(ctx.orderEditSnapshot(shuffled),baseline.snapshot);
 // A database change after initial validation but during catalog lookup is also rejected.
 ctx.getProductsList=async()=>{rows[0]={...rows[0],reason:'Concurrent update'};return catalog;};
 await assert.rejects(submit(),{status:409});assert.equal(writes.length,0);
});

test('Edit draft survives a reload after 30 minutes, including explicit removal, new component and metadata',()=>{
 const c=clientContext(); const db=new Map();const storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
 let now=Date.parse('2026-11-18T08:00:00Z');
 Object.assign(c,{Date:class extends Date{static now(){return now;}},number:(v,f=0)=>Number(v)||f,key:v=>text(v).toLowerCase().replace(/[^a-z0-9]/g,''),storageAreas:()=>[storage],parseJson:v=>v?JSON.parse(v):null,safePriority:text,safeDeliveryDate:text,CART_DRAFT_TTL_MS:7*86400000,EDIT_TRANSFER_TTL_MS:7*86400000});
 vm.runInNewContext(part(client,'function freshTransfer(','function readEditTransfer(')+part(client,'function readEditTransfer(','function clearEditTransfer(')+part(client,'function storageKeyPart(','function clearCartDraft('),c);
 const options={draftScope:'12',type:'Request Products',editMode:true,editKey:'current-42'};
 const transfer={editToken:'signed-token',products:[{id:'1',orderRowId:'101',quantity:1},{id:'2',orderRowId:'102',quantity:2}],ts:now};
 storage.setItem('shopping_cart:edit_payload:v2:current-42',JSON.stringify(transfer));
 const products=[{id:'1',orderRowId:'101',quantity:12},{id:'3',quantity:3}];
 assert.equal(c.writeCartDraft({...options,products,removedOrderRowIds:['102'],editToken:transfer.editToken,reason:'Updated reason',priorityLevel:'Urgent',requestedDeliveryDate:'2026-11-24'}),true);
 now+=31*60000;
 const saved=c.restoreEditDraft(c.readEditTransfer(options.editKey),c.readCartDraft(options));
 assert.equal(saved.products[0].quantity,12);assert.equal(saved.products[1].id,'3');assert.equal(saved.reason,'Updated reason');assert.equal(saved.priorityLevel,'Urgent');assert.equal(saved.requestedDeliveryDate,'2026-11-24');assert.deepEqual(Array.from(saved.removedOrderRowIds),['102']);
 assert.equal(c.readCartDraft({...options,draftScope:'13'}),null);
 assert.equal(c.readCartDraft({...options,editKey:'different'}),null);
 assert.equal(c.restoreEditDraft(transfer,{...saved,editToken:'different'}),null);
 assert.throws(()=>c.restoreEditDraft(transfer,{...saved,removedOrderRowIds:[]}),/incomplete/);
 assert.throws(()=>c.restoreEditDraft(transfer,{...saved,removedOrderRowIds:['102','102']}),/incomplete/);
 assert.equal(c.writeCartDraft({...options,products:[],removedOrderRowIds:['101','102'],editToken:transfer.editToken}),true);
 assert.equal(c.restoreEditDraft(transfer,c.readCartDraft(options)).products.length,0);
});

test('Completing or cancelling one edit does not erase another tab’s transfer',()=>{
 const db=new Map([
  ['shopping_cart:edit_payload:v2:current-a',JSON.stringify({editToken:'a'})],
  ['shopping_cart:edit_payload:v2:current-b',JSON.stringify({editToken:'b'})],
  ['shopping_cart:edit_pending:v2',JSON.stringify({key:'current-b'})],
  ['shopping_cart:edit_target_type:v1','Request Products'],
  ['shopping_cart:edit_fallback:v1:default',JSON.stringify({editToken:'b'})],
  ['shopping_cart:edit_fallback:v1:other',JSON.stringify({editToken:'a'})],
 ]);
 const storage={getItem:k=>db.get(k)||null,removeItem:k=>db.delete(k),get length(){return db.size;},key:i=>Array.from(db.keys())[i]};
 const c={text,storageAreas:()=>[storage],parseJson:v=>v?JSON.parse(v):null};
 vm.runInNewContext(part(client,'function clearEditTransfer(','function storageKeyPart('),c);
 c.clearEditTransfer();assert.equal(db.size,6);
 c.clearEditTransfer('current-a');assert.equal(db.has('shopping_cart:edit_payload:v2:current-a'),false);assert.equal(db.has('shopping_cart:edit_fallback:v1:other'),false);assert.equal(db.has('shopping_cart:edit_payload:v2:current-b'),true);assert.equal(db.has('shopping_cart:edit_pending:v2'),true);
 c.clearEditTransfer('current-b');assert.equal(db.size,0);
});
