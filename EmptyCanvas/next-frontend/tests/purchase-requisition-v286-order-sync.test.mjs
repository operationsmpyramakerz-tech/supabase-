import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizePrForm, prInitialForm, prSyncSavedWithLiveOrder } from '../lib/purchase-requisition-data.mjs';

const source = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const order = (id, name, quantity, code, number=125) => ({
  id: String(id), orderIdNumber: number, productName: name, quantityRequested: quantity,
  productIdCode: code, createdByName: 'Operations',
});

function initial(rows) { return prInitialForm(rows, { username: 'Operations' }); }

test('changing a saved order product updates the linked PR product, code and quantity while preserving PR-only fields', () => {
  const previous=initial([order(42,'Cardboard – Acrylic (2.5mm)',4,'A500218')]);
  const saved=normalizePrForm({
    ...previous, prNumber:'PR-77', department:'Operations', costCenter:'Djibouti', notes:'Print quality matters',
    requiredDate:'2026-11-04', signaturess:'ignored',
    signatures:{requester:{name:'School'},manager:{name:'Approved Manager'}},
    items:[{...previous.items[0], model:'32.5 x 25 cm', warranty:'6 months'}],
  });
  const current=initial([order(42,'Cardboard – MDF Wood (2.5mm)',9,'A500276')]);
  const merged=prSyncSavedWithLiveOrder(saved,current);
  assert.equal(merged.items.length,1);
  assert.equal(merged.items[0].description,'Cardboard – MDF Wood (2.5mm)');
  assert.equal(merged.items[0].code,'A500276');
  assert.equal(merged.items[0].quantity,'9');
  assert.equal(merged.items[0].sourceRowId,'42');
  assert.equal(merged.items[0].model,''); // product changed: do not retain old product specifications
  assert.equal(merged.items[0].warranty,'');
  assert.equal(merged.notes,'Print quality matters');
  assert.equal(merged.prNumber,'PR-77');
  assert.equal(merged.department,'Operations');
  assert.equal(merged.signatures.manager.name,'Approved Manager');
});

test('saved PR overrides remain until corresponding Operations Order fields change',()=>{
  const previous=initial([order(42,'Motor',4,'A1')]);
  const saved={...previous,items:[{...previous.items[0],quantity:'8',description:'Motor / special request',model:'9V'}]};
  const unchanged=prSyncSavedWithLiveOrder(saved,initial([order(42,'Motor',4,'A1')]));
  assert.equal(unchanged.items[0].quantity,'8');
  assert.equal(unchanged.items[0].description,'Motor / special request');
  assert.equal(unchanged.items[0].model,'9V');
  const changed=prSyncSavedWithLiveOrder(unchanged,initial([order(42,'Motor',6,'A1')]));
  assert.equal(changed.items[0].quantity,'6');
  assert.equal(changed.items[0].description,'Motor / special request');
  assert.equal(changed.items[0].model,'9V');
});

test('order row identity tracks renamed and reordered duplicate products',()=>{
  const old=initial([order(7,'Book Grade 1',5,'A500235'),order(8,'Book Grade 2',3,'A500235')]);
  const saved={...old,items:old.items.map((row,index)=>({...row,model:'print run '+(index+1)}))};
  const current=initial([order(8,'Book Grade 2 Revised',4,'A500235'),order(7,'Book Grade 1',5,'A500235')]);
  const result=prSyncSavedWithLiveOrder(saved,current);
  assert.deepEqual(result.items.map(row=>row.sourceRowId),['8','7']);
  assert.deepEqual(result.items.map(row=>row.quantity),['4','5']);
  assert.deepEqual(result.items.map(row=>row.description),['Book Grade 2 Revised','Book Grade 1']);
  assert.equal(result.items[0].model,'print run 2');
  assert.equal(result.items[1].model,'print run 1');
});

test('order row additions and deletions synchronize, while manually added PR items survive',()=>{
  const old=initial([order(7,'Motor',5,'A1'),order(8,'LED',2,'A2')]);
  const manual={code:'',description:'Express shipping',unit:'خدمة',quantity:'1',model:'',warranty:'',expiry:'',url:'',manual:true,sourceRowId:''};
  const saved={...old,notes:'Keep notes',items:[...old.items,manual]};
  const updated=initial([order(7,'Motor',6,'A1'),order(10,'Battery',3,'A3')]);
  const result=prSyncSavedWithLiveOrder(saved,updated);
  assert.deepEqual(result.items.map(row=>row.description),['Motor','Battery','Express shipping']);
  assert.deepEqual(result.items.map(row=>row.quantity),['6','3','1']);
  assert.equal(result.items[2].manual,true);
  assert.equal(result.notes,'Keep notes');
});

test('legacy PR without source row metadata picks up changed rows and obtains stable IDs',()=>{
  const legacy=normalizePrForm({notes:'Original notes',items:[
    {description:'Duko tape',quantity:'2',code:'A500129',model:'special'},
    {description:'Old acrylic board',quantity:'4',code:'A500218'},
  ]});
  const updated=initial([order(51,'Duko tape',3,'A500129'),order(52,'New acrylic board',7,'A500276')]);
  const result=prSyncSavedWithLiveOrder(legacy,updated);
  assert.deepEqual(result.items.map(item=>item.sourceRowId),['51','52']);
  assert.deepEqual(result.items.map(item=>item.description),['Duko tape','New acrylic board']);
  assert.deepEqual(result.items.map(item=>item.quantity),['3','7']);
  assert.equal(result.items[0].model,'special');
  assert.equal(result.notes,'Original notes');
});

test('supervisor quantity changes are used instead of stale base quantity',()=>{
 const item=initial([{...order(4,'Motor',5,'A100005'),quantityEditedBySupervisor:12}]).items[0];
 assert.equal(item.quantity,'12');
});

test('server fetches fresh order rows before both saving and exporting a PR',()=>{
 const page=source('../app/operations-orders/purchase-requisition/page.jsx');
 const save=source('../app/api/orders/purchase-requisition/save/route.js');
 const exportRoute=source('../app/api/orders/purchase-requisition/route.js');
 const helper=source('../lib/purchase-requisition-live.js');
 const client=source('../components/orders/PurchaseRequisitionClient.jsx');
 assert.match(page,/prSyncSavedWithLiveOrder\(savedForm, form\)/);
 assert.match(save,/const refreshedForm = await prRefreshItemsFromOrder\(ids, body\.form, gate\.account\)/);
 assert.ok(save.indexOf('assertOrderIdsInScope')<save.indexOf('prRefreshItemsFromOrder(ids'));
 assert.match(exportRoute,/await prRefreshItemsFromOrder\(ids,body\.form\|\|\{\},gate\.account\)/);
 assert.ok(exportRoute.indexOf('assertOrderIdsInScope')<exportRoute.indexOf('prRefreshItemsFromOrder(ids'));
 assert.match(helper,/loadOperationsOrderDetails\(orderIds, \{ productsSink: productsSnapshot \}\)/);
 assert.match(helper,/prSyncSavedWithLiveOrder\(saved, live\)/);
 assert.match(client,/manual:true,sourceRowId:''/);
 assert.match(client,/if\(data\.form\)setFormState\(data\.form\)/);
});
