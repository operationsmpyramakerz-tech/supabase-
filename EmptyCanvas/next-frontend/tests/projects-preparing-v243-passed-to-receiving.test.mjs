import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
import {warehouseGroups,WAREHOUSE_COLUMNS,warehouseExportValue} from '../lib/preparing-warehouse-view.mjs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Tested testing creates available-to-receive even when warehouse received is zero',()=>{
 const base=warehouseTotals([{id:'m1',product_name:'Acrylic Billboard',required_qty:2}],[],[]);
 const [row]=warehouseReceivingBalances(base,[{item_id:'m1',tested:2}]);
 assert.equal(row.tested,2);
 assert.equal(row.readyToReceive,2);
 assert.equal(row.accepted,0);
 assert.equal(row.available,0); // separate warehouse stock for school allocation
 assert.equal(warehouseReceiptLimit(0,'2',row.tested,row.allocated),2);
 assert.throws(()=>warehouseReceiptLimit(0,'3',row.tested,row.allocated),/Only 2 Tested/);
});

test('Partial receipt shrinks available to receive, but creates school allocation stock',()=>{
 const [row]=warehouseReceivingBalances(warehouseTotals([{id:'a'}],[{item_id:'a',accepted_delta:1,damaged_delta:0}],[]),[{item_id:'a',tested:2}]);
 assert.equal(row.readyToReceive,1);
 assert.equal(row.available,1);
 assert.equal(warehouseReceiptLimit(1,'2',row.tested,row.allocated),1);
 assert.throws(()=>warehouseReceiptLimit(1,'3',row.tested,row.allocated),/Only 1 Tested/);
});

test('School allocation does not spend testing tested availability; corrections may not undo allocated stock',()=>{
 const [row]=warehouseReceivingBalances(warehouseTotals([{id:'a'}],[{item_id:'a',accepted_delta:2,damaged_delta:0}],[{item_id:'a',delta_qty:1}]),[{item_id:'a',tested:4}]);
 assert.equal(row.readyToReceive,2);
 assert.equal(row.available,1);
 assert.throws(()=>warehouseReceiptLimit(2,'0',row.tested,row.allocated),/allocated/);
 assert.equal(warehouseReceiptLimit(2,'1',row.tested,row.allocated),-1);
});

test('UI & CSV/PDF export use Tested to calculate remaining receipt capacity and not kit duplicates',()=>{
 const [row]=warehouseReceivingBalances(warehouseTotals([{id:'a',product_name:'Motor',product_id:'p2',required_qty:2,source_kits:[{kitId:'G1',kitName:'G1',quantity:1},{kitId:'G2',kitName:'G2',quantity:1}]}],[{item_id:'a',accepted_delta:1,damaged_delta:0}],[]),[{item_id:'a',tested:3}]);
 const groups=warehouseGroups([row]);
 assert.equal(groups.length,2);
 assert.equal(groups[0].items[0].readyToReceive,2);
 assert.equal(warehouseExportValue(groups[1].items[0],'available'), '2');
 assert.equal(warehouseExportValue(groups[0].items[0],'tested'),'3');
 assert.ok(WAREHOUSE_COLUMNS.some(c=>c.key==='tested'));
 assert.match(WAREHOUSE_COLUMNS.find(c=>c.key==='available').label,/Receive/);
 const ui=read('components/preparing/ProjectWarehouseReceiving.jsx');
 assert.match(ui,/warehouseReceiptLimit\(row.accepted,draft\[row.id\],row.tested,row.allocated\)/);
 assert.match(ui,/Available to Receive/);
 assert.match(read('app/api/projects-preparing/warehouse/export/route.js'),/warehouseReceivingBalances/);
});

test('DB guard checks new positive receipts before insert with authoritative tested totals',()=>{
 const sql=read('sql/2026-11-10-preparing-tested-only-v384.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_warehouse_tested_limit_v384/);
 assert.match(sql,/received_before\+NEW\.accepted_delta>tested_total/);
 assert.match(sql,/sum\(tested_delta\)/);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.doesNotMatch(sql,/DELETE FROM|TRUNCATE|UPDATE public\.erp_preparing_warehouse_receipt_lines/i);
 assert.match(read('lib/preparing-warehouse.js'),/erp_preparing_warehouse_testing_balances_v384/);
});
