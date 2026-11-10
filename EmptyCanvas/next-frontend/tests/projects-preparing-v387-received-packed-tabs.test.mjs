import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterWarehouseReceivingRows} from '../lib/preparing-warehouse-view.mjs';
import {filterProductionReceivingRows} from '../lib/preparing-production-math.mjs';
import {filterBoxDistributionRows} from '../lib/preparing-box-visibility.mjs';
const rows=[
 {id:'none',required_qty:10,accepted:0,readyToReceive:10,productionReceived:0,availableToProduction:0,packedQty:0,unpacked:0},
 {id:'partial',required_qty:10,accepted:6,readyToReceive:4,productionReceived:4,availableToProduction:2,packedQty:2,unpacked:2},
 {id:'full',required_qty:10,accepted:10,readyToReceive:0,productionReceived:10,availableToProduction:0,packedQty:10,unpacked:0},
 {id:'unpacked',required_qty:10,accepted:10,readyToReceive:0,productionReceived:10,availableToProduction:0,packedQty:0,unpacked:10},
 {id:'warehouse-only',required_qty:10,accepted:10,readyToReceive:0,productionReceived:0,availableToProduction:10,packedQty:0,unpacked:0},
];
const ids=items=>items.map(x=>x.id);
test('Warehouse Received includes partial and full net receipts; other views unchanged',()=>{
 assert.deepEqual(ids(filterWarehouseReceivingRows(rows,'received')),['partial','full','unpacked','warehouse-only']);
 assert.deepEqual(ids(filterWarehouseReceivingRows(rows,'short')),['none','partial']);
 assert.deepEqual(ids(filterWarehouseReceivingRows(rows,'available')),['none','partial']);
 assert.equal(filterWarehouseReceivingRows(rows,'all'),rows);
});
test('Production Received is independent of Warehouse receipt and includes partial handovers',()=>{
 assert.deepEqual(ids(filterProductionReceivingRows(rows,'received')),['partial','full','unpacked']);
 assert.deepEqual(ids(filterProductionReceivingRows(rows,'available')),['partial','warehouse-only']);
 assert.deepEqual(ids(filterProductionReceivingRows(rows,'not-received')),['none','warehouse-only']);
});
test('Packed includes partial and full quantities, excluding zero stock and unboxed rows',()=>{
 assert.deepEqual(ids(filterBoxDistributionRows(rows,'packed')),['partial','full']);
 assert.deepEqual(ids(filterBoxDistributionRows(rows,'available')),['partial','unpacked']);
 assert.deepEqual(ids(filterBoxDistributionRows(rows,'not-packed')),['unpacked']);
 for(const filter of [filterWarehouseReceivingRows,filterProductionReceivingRows,filterBoxDistributionRows])assert.deepEqual(filter(undefined,'received'),[]);
 assert.deepEqual(filterBoxDistributionRows([{packedQty:0,productionReceived:3,unpacked:3}],'packed'),[]);
});
test('Each stage exposes its new tab using the shared filter tab control',()=>{
 const read=name=>readFileSync(new URL(`../components/preparing/${name}.jsx`,import.meta.url),'utf8');
 for(const stage of ['ProjectWarehouseReceiving','ProjectProductionReceiving']){
  assert.match(read(stage),/value:"received",label:"Received"/);
  assert.match(read(stage),/<StageFilterTabs/);
 }
 assert.match(read('ProjectBoxDistribution'),/value:"packed",label:"Packed"/);
 assert.match(read('StageFilterTabs'),/\["done","ready","received","packed"\]/);
});
