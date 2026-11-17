import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expenseOrderReference, verifyExpenseShare, expenseShareUrl, expenseScreenshotShareLink, expenseShotEntries, screenshotFingerprint, expenseStorageObject, groupSharedOrderRows, groupExplicitSharedOrderRows, loadSharedExpenseRows, expensePublicOrderHref, expenseOrderNumber } from '../lib/expense-public-share.mjs';
import { expenseOrderLinks, expenseReasonExportPayload } from '../lib/expense-export-order-links.mjs';
import { renderPublicExpenseOrders } from '../lib/expense-public-order-template.mjs';
import { parseStrictImageDataUrl } from '../lib/strict-upload-image.mjs';
const opt = {secret:'a-test-secret-which-is-longer-than-32-characters'};
const base = 'https://erp.test';
const png = 'data:image/png;base64,iVBORw0KGgo=';
const item = {id:'exp-1',cashOut:150,orders:[{label:'ORD-129'},{label:'ORD-130'}],ordersRaw:'a,b,c',screenshots:[{name:'shot1.png',url:png},{name:'shot2.jpg',url:'https://external.test/shot2.jpg'}]};
const rows = [{id:'a',order_number:129},{id:'b',order_number:129},{id:'c',order_number:130}];
const parse = href => new URL(href).searchParams;
const req = href => new Request(href);
const tokenFor = href => parse(href).get('token');
const orderUrl = expenseReasonExportPayload(item,base,opt).hyperlink;
const screenshotUrl = expenseScreenshotShareLink(item,0,base,opt);

test('capability signature binds expense identity, resource type, selector and fingerprint',()=>{
  const token = tokenFor(orderUrl);
  assert.equal(verifyExpenseShare(item.id,'order','all',token,opt),expenseOrderReference(item).fingerprint);
  assert.equal(verifyExpenseShare('exp-2','order','all',token,opt),'');
  assert.equal(verifyExpenseShare(item.id,'order','129',token,opt),'');
  assert.equal(verifyExpenseShare(item.id,'screenshot','0',token,opt),'');
  assert.equal(verifyExpenseShare(item.id,'order','all',token.slice(0,-1)+'!',opt),'');
  assert.equal(verifyExpenseShare(item.id,'order','all',token,{secret:'b-test-secret-which-is-longer-than-32-characters'}),'');
});
test('receipt number and free text never become order shares; invalid and oversized relations fail closed',()=>{
  assert.equal(expenseOrderReference({...item,orders:[{label:'25',orderId:'ORD-25'}]}),null);
  assert.equal(expenseOrderReference({...item,cashOut:0}),null);
  assert.equal(expenseOrderReference({...item,ordersRaw:'a);drop'}),null);
  assert.equal(expenseOrderReference({...item,ordersRaw:'ORD-129'}),null);
  assert.equal(expenseOrderReference({...item,ordersRaw:Array.from({length:201},(_,i)=>`row-${i}`).join(',')}),null);
});
test('order groups require all referenced rows, exact group identity, and never accept extra data',()=>{
  const ref = expenseOrderReference(item);
  assert.deepEqual(groupSharedOrderRows(ref,rows,'129'),[rows.slice(0,2)]);
  assert.deepEqual(groupSharedOrderRows(ref,rows,'all'),[rows.slice(0,2),rows.slice(2)]);
  assert.equal(groupSharedOrderRows(ref,rows.slice(0,2),'all'),null);
  assert.equal(groupSharedOrderRows(ref,[...rows,{id:'d',order_number:129}],'all'),null);
  assert.equal(groupSharedOrderRows(ref,[...rows.slice(0,2),{id:'c',order_number:999}],'all'),null);
  assert.equal(groupSharedOrderRows(ref,rows,'999'),null);
});
test('storage signing is limited to expense upload objects in the configured bucket and origin',()=>{
  const config = {url:'https://storage.test',storageBucket:'operations-files'};
  const prefix = config.url+'/storage/v1/object/public/operations-files/';
  assert.deepEqual(expenseStorageObject(prefix+'receipt-1794912345678-0-abcd-shot.jpg',config),{bucket:'operations-files',key:'receipt-1794912345678-0-abcd-shot.jpg'});
  assert.ok(expenseStorageObject(prefix+'cashin-1794912345678-abcd-shot.png',config));
  assert.ok(expenseStorageObject(prefix+'expense-edit-abc-def-1794912345678-0-aaa.jpg',config));
  assert.equal(expenseStorageObject(prefix+'private-staff-file.jpg',config),null);
  assert.equal(expenseStorageObject(prefix+'receipt-1794912345678-0-abcd%2fshot.jpg',config),null);
  assert.equal(expenseStorageObject(prefix.replace('operations-files','other')+'receipt-1794912345678-0-abcd-shot.jpg',config),null);
  assert.equal(expenseStorageObject(prefix.replace('storage.test','evil.test')+'receipt-1794912345678-0-abcd-shot.jpg',config),null);
});
test('public order HTML shows read-only details, escapes all database values and excludes raw private fields',()=>{
  const html = renderPublicExpenseOrders([[{orderId:'ORD-129',productName:'<script>alert(1)</script>',quantity:2,unitPrice:5,reason:'<img src=x onerror=alert(1)>',status:'Approved',priorityLevel:'Urgent',createdTime:'2026-11-16',requestedDeliveryDate:'2026-11-17',productTag:'Materials',privateField:'SUPER-SECRET',createdById:'PRIVATE-ID'}]]);
  assert.match(html,/ORD-129/); assert.match(html,/Qty: 2/); assert.match(html,/EGP 10\.00/);
  assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/<script|<img src=x|SUPER-SECRET|PRIVATE-ID|<form/);
});
// Run the real route handler with controlled server dependencies; no live DB.
function routeHarness(record = item, orderRows = rows, overrides = {}) {
  const source = readFileSync(new URL('../app/share/expenses/[kind]/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export (const|async function)/g,'$1');
  let lookups = 0, orderLookups = 0;
  const scope = { Response, URL, Buffer, AbortSignal, fetch:async()=>{throw Error('Unexpected network')}, expenseForPublicShare:async()=>{lookups++; return record}, loadRawOrderRowsByIds:async()=>{orderLookups++;return orderRows}, serializeOperationsOrderDetail:r=>({orderId:`ORD-${r.order_number}`,productName:`Part ${r.id}`,quantity:1,status:'Pending'}),createSignedDownloadUrl:async()=>{throw Error('Unexpected sign')},getSupabaseConfig:()=>({url:'https://storage.test',storageBucket:'operations-files'}), expenseOrderReference, expenseShotEntries, screenshotFingerprint, expenseStorageObject, groupSharedOrderRows, groupExplicitSharedOrderRows, loadSharedExpenseRows, process: {env:{}}, verifyExpenseShare:(id,k,t,tok)=>verifyExpenseShare(id,k,t,tok,opt),renderPublicExpenseOrders,parseStrictImageDataUrl,...overrides};
  const GET = vm.runInNewContext(source+'\nGET;',scope);
  return {get:(href,kind)=>GET(req(href),{params:Promise.resolve({kind})}), counts:()=>[lookups,orderLookups]};
}
test('anonymous valid Reason link opens both orders; individual column shows only its order',async()=>{
  const h = routeHarness(); const res = await h.get(orderUrl,'order');
  assert.equal(res.status,200); assert.match(res.headers.get('content-type'),/text\/html/); assert.match(res.headers.get('cache-control'),/no-store/); assert.match(res.headers.get('x-robots-tag'),/noindex/);
  const html = await res.text(); assert.match(html,/ORD-129/); assert.match(html,/ORD-130/);
  const single = await h.get(expenseOrderLinks(item,base,opt)[0].hyperlink,'order'); const singleHtml = await single.text(); assert.match(singleHtml,/ORD-129/); assert.doesNotMatch(singleHtml,/ORD-130/);
});
test('unsigned or tampered public request cannot trigger DB reads',async()=>{
  const h=routeHarness(); const bad=new URL(orderUrl); bad.searchParams.set('expenseId','exp-2');
  assert.equal((await h.get(bad.href,'order')).status,404);
  assert.equal((await h.get(base+'/next/share/expenses/order?expenseId=exp-1&target=all','order')).status,404);
  assert.deepEqual(h.counts(),[0,0]);
});
test('removed or changed expense order relation and missing component revoke the order link',async()=>{
  assert.equal((await routeHarness(null).get(orderUrl,'order')).status,404);
  assert.equal((await routeHarness({...item,ordersRaw:'a,b'}).get(orderUrl,'order')).status,404);
  assert.equal((await routeHarness(item,rows.slice(0,2)).get(orderUrl,'order')).status,404);
});
test('anonymous receipt opens exact image; missing/replaced receipt and changed index cannot fall back',async()=>{
  const h=routeHarness(); const res=await h.get(screenshotUrl,'screenshot');
  assert.equal(res.status,200); assert.equal(res.headers.get('content-type'),'image/png'); assert.deepEqual(Buffer.from(await res.arrayBuffer()),Buffer.from('89504e470d0a1a0a','hex'));
  const bad=new URL(screenshotUrl); bad.searchParams.set('target','1'); assert.equal((await h.get(bad.href,'screenshot')).status,404);
  assert.equal((await routeHarness({...item,screenshots:[item.screenshots[1]]}).get(screenshotUrl,'screenshot')).status,404);
  const ext=await h.get(expenseScreenshotShareLink(item,1,base,opt),'screenshot'); assert.equal(ext.status,302); assert.equal(ext.headers.get('location'),'https://external.test/shot2.jpg');
});
test('private storage receipt is fetched server-side and returned as an image without exposing the signed URL',async()=>{
  const stored={...item,screenshots:[{name:'s.png',url:'https://storage.test/storage/v1/object/public/operations-files/receipt-1794912345678-0-abc.png'}]};
  let signed=false;
  const h=routeHarness(stored,rows,{createSignedDownloadUrl:async(key,opts)=>{assert.equal(key,'receipt-1794912345678-0-abc.png');assert.equal(opts.bucketName,'operations-files'); signed=true;return {signedUrl:'https://storage.test/storage/v1/object/sign/operations-files/s.png?token=private'}},fetch:async(url,opts)=>{assert.equal(url.origin,'https://storage.test');assert.equal(opts.redirect,'error');return new Response(Buffer.from('89504e470d0a1a0a','hex'),{headers:{'content-type':'image/png'}})}});
  const response=await h.get(expenseScreenshotShareLink(stored,0,base,opt),'screenshot');
  assert.equal(response.status,200); assert.equal(signed,true); assert.equal(response.headers.get('location'),null); assert.equal(response.headers.get('content-type'),'image/png');
});


test('ORD-129 maintenance legacy label generates working links in Excel and the expense ticket', async()=>{
  const legacy={...item, reason:'ORD-129 - Request Maintenance', orders:[{label:'ORD-129 - Request Maintenance',orderId:'ORD-129'}], ordersRaw:'["a", "b"]'};
  const reason=expenseReasonExportPayload(legacy,base,opt);
  assert.equal(reason.text,'ORD-129 - Request Maintenance');
  assert.ok(reason.hyperlink);
  assert.ok(reason.links[0].hyperlink);
  const ui=expensePublicOrderHref(legacy,'129',opt);
  assert.equal(base+ui,reason.links[0].hyperlink);
  const h=routeHarness(legacy,rows.slice(0,2));
  for (const url of [reason.hyperlink,base+ui]) {
    const res=await h.get(url,'order'); assert.equal(res.status,200);
    const html=await res.text(); assert.match(html,/ORD-129/); assert.doesNotMatch(html,/ORD-130/);
  }
});
test('stored explicit group keys work without component IDs, but mismatched keys and bare reason do not', async()=>{
  const legacy={...item, orders:[{label:'ORD-129 - Request Maintenance'}], ordersRaw:'ord:129'};
  const ref=expenseOrderReference(legacy);
  assert.equal(ref.mode,'group');
  let queries=0;
  const h=routeHarness(legacy,[],{select:async(table,params)=>{queries++;assert.equal(table,'orders');assert.equal(params.order_number,'in.(129)');return rows.slice(0,2)}});
  assert.equal((await h.get(expenseReasonExportPayload(legacy,base,opt).hyperlink,'order')).status,200);
  assert.equal(queries,1);
  assert.equal(expenseOrderReference({...legacy,ordersRaw:'ord:130'}),null);
  assert.equal(expenseOrderReference({...legacy,ordersRaw:''}),null);
  assert.equal(expenseOrderReference({...legacy,orders:[{label:'Other reason'}],reason:'ORD-129'}),null);
  assert.equal(expenseOrderReference({...legacy,orders:[{label:'129',orderId:'ORD-129'}]}),null);
  assert.equal(expenseOrderReference({...legacy,ordersRaw:'ord:129,a'}),null);
  assert.equal(groupExplicitSharedOrderRows(ref,rows,'all'),null);
});
test('legacy UUID lookup requires an exact row alias; missing or conflicting references fail closed',async()=>{
  const uuid='123456781234123412341234567890ab';
  const legacy={...item,orders:[{label:'ORD-129 - Request Maintenance'}],ordersRaw:uuid};
  const r=expenseOrderReference(legacy);
  const expected={id:'new-id',order_number:129,notion_page_id:'12345678-1234-1234-1234-1234567890ab'};
  const options={loadByIds:async()=>{throw Error('missing')},loadByNumbers:async()=>{throw Error('unexpected group read')},loadByLegacyId:async id=>{assert.equal(id,uuid);return [expected]}};
  assert.equal(groupSharedOrderRows(r,await loadSharedExpenseRows(r,options),'129')[0][0].id,uuid);
  assert.deepEqual(await loadSharedExpenseRows(r,{...options,loadByLegacyId:async()=>[{id:'different',order_number:129}]}),[]);
  assert.deepEqual(await loadSharedExpenseRows(r,{...options,loadByLegacyId:async()=>[expected,{...expected,id:'conflict'}]}),[]);
});


test('server serialization attaches the signed path to stored legacy order labels; both expense screens use it',()=>{
  const source=readFileSync(new URL('../lib/expenses-data.js',import.meta.url),'utf8');
  const helpers=source.slice(source.indexOf('function text('),source.indexOf('function screenshotPublicUrl('));
  const code=source.slice(source.indexOf('function expenseOrders('),source.indexOf('function memberIdentity('));
  const serialize=vm.runInNewContext(helpers+code+'\nserializeExpense;',{
    parseScreenshots:()=>[],expenseOrderNumber,expensePublicOrderHref:(item,n)=>expensePublicOrderHref(item,n,opt),Date,
  });
  const record=serialize({id:'legacy-129',cash_out:137,orders_names:'ORD-129 - Request Maintenance',orders_raw:'["a"]',reason:'ORD-129 - Request Maintenance'});
  assert.match(record.orders[0].publicDetailsHref,/^\/next\/share\/expenses\/order\?/);
  assert.equal(record.orders[0].publicDetailsHref,expensePublicOrderHref(record,'129',opt));
  const manual=serialize({id:'manual-1',cash_out:20,reason:'ORD-129',orders_names:'Other reason'});
  assert.ok(!manual.orders[0].publicDetailsHref);
  for (const file of ['ExpensesClient.jsx','ExpensesUsersDialogs.jsx']) {
    const jsx=readFileSync(new URL('../components/expenses/'+file,import.meta.url),'utf8');
    const action=jsx.slice(jsx.indexOf(file==='ExpensesClient.jsx'?'function ExpenseOrderActions(':'function UserExpenseOrderActions('));
    assert.match(action,/const href = text\(order\?\.publicDetailsHref\);/);
    assert.doesNotMatch(action,/modernTrackingHref\(order\)/);
  }
});
