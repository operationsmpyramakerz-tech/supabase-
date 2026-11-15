import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
import {filterWarehouseReceivingRows,warehouseExportValue,WAREHOUSE_COLUMNS} from '../lib/preparing-warehouse-view.mjs';
import {filterBoxDistributionRows} from '../lib/preparing-box-visibility.mjs';
import {PREPARING_EDIT_TAB_LABELS,preparingRowMatchesTab,preparingTabKey,preparingTabKnown} from '../lib/preparing-tab-permissions.mjs';
import {ACTIVE_PILOT_FEATURE_KEYS,FEATURE_DEFINITIONS} from '../lib/feature-permissions-registry.js';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

const demoRows=()=>warehouseReceivingBalances(
 warehouseTotals([
  {id:'tested-only',product_name:'3D Printer',required_qty:8},
  {id:'part-return',product_name:'Motor',required_qty:8},
  {id:'complete',product_name:'Wire',required_qty:8},
  {id:'not-tested',product_name:'Relay',required_qty:8},
 ],[
  {item_id:'part-return',accepted_delta:2},
  {item_id:'complete',accepted_delta:4},
 ],[]),[
  {item_id:'tested-only',tested:3},
  {item_id:'part-return',tested:5},
  {item_id:'complete',tested:4},
 ],[{itemId:'tested-only',received:3},{itemId:'part-return',received:5},{itemId:'not-tested',received:2}]);

test('Warehouse Return first tab lists Production Received, while Ready to Return and Returned use their own ledgers',()=>{
 const rows=demoRows();
 assert.deepEqual(filterWarehouseReceivingRows(rows,'all').map(r=>r.id),['tested-only','part-return','not-tested']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'available').map(r=>r.id),['tested-only','part-return']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'received').map(r=>r.id),['part-return','complete']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'short'),[]);
 assert.equal(rows.find(r=>r.id==='part-return').readyToReturn,3);
 assert.equal(rows.find(r=>r.id==='not-tested').readyToReturn,0);
 assert.equal(rows.find(r=>r.id==='part-return').accepted,2);
});

test('Warehouse Return quantity cannot exceed tested, and protects previous allocations',()=>{
 assert.equal(warehouseReceiptLimit(2,'5',5,0),3);
 assert.equal(warehouseReceiptLimit(2,'0',5,0),-2);
 assert.throws(()=>warehouseReceiptLimit(2,'6',5,0),/tested.*ready to return/i);
 assert.throws(()=>warehouseReceiptLimit(2,'1',5,2),/allocated to schools/i);
 assert.throws(()=>warehouseReceiptLimit(0,'1',0,0),/tested.*ready to return/i);
 assert.throws(()=>warehouseReceiptLimit(0,'-1',4,0),/non-negative/i);
 const sql=read('sql/2026-10-29-preparing-production-receiving-v247.sql');
 assert.match(sql,/prep_prod_warehouse_guard_v247/);
 assert.match(sql,/before_qty\+NEW\.accepted_delta<handed_qty/);
 const guard=read('sql/2026-11-10-preparing-tested-only-v384.sql');
 assert.match(guard,/received_before\+NEW\.accepted_delta>tested_total/);
});

test('Operations Receiving still uses Warehouse Returned as its input, while the existing ledger IDs remain stable',()=>{
 const production=read('lib/preparing-production.js');
 const sql=read('sql/2026-10-29-preparing-production-receiving-v247.sql');
 assert.match(sql,/p_new_total>warehouse_qty/);
 assert.match(production,/erp_preparing_production_handoff_v247/);
 assert.match(read('components/preparing/ProjectProductionReceiving.jsx'),/Warehouse Returned/);
 assert.match(read('components/preparing/PreparingClient.jsx'),/title:"Warehouse Return"/);
 assert.match(read('lib/preparing-warehouse.js'),/erp_preparing_warehouse_receive_v241/);
 assert.match(read('lib/preparing-project-progress.mjs'),/receiptLines/);
});

test('Unused Not Packed and warehouse shortage tabs are absent in UI, filters, grants and server validation',()=>{
 assert.deepEqual(Object.keys(PREPARING_EDIT_TAB_LABELS.boxes),['all','available','packed']);
 assert.deepEqual(Object.keys(PREPARING_EDIT_TAB_LABELS.warehouse),['all','available','received']);
 assert.equal(preparingTabKnown('boxes','not-packed'),false);
 assert.equal(preparingTabKnown('warehouse','short'),false);
 assert.equal(preparingRowMatchesTab('boxes','not-packed',{productionReceived:4,packedQty:0}),false);
 assert.equal(preparingRowMatchesTab('warehouse','short',{required_qty:8,tested:2,accepted:0}),false);
 assert.equal(preparingRowMatchesTab('warehouse','all',{tested:0,accepted:0}),false);
 assert.equal(preparingRowMatchesTab('warehouse','all',{tested:2,accepted:0}),false);
 assert.equal(preparingRowMatchesTab('warehouse','all',{productionIntakeReceived:2,tested:0}),true);
 assert.equal(preparingRowMatchesTab('warehouse','available',{tested:2,accepted:1}),true);
 assert.equal(preparingRowMatchesTab('warehouse','available',{tested:2,accepted:2}),false);
 assert.equal(preparingRowMatchesTab('warehouse','received',{tested:2,accepted:1}),true);
 const boxes=read('components/preparing/ProjectBoxDistribution.jsx');
 const warehouse=read('components/preparing/ProjectWarehouseReceiving.jsx');
 assert.doesNotMatch(boxes,/value:"not-packed"/);
 assert.doesNotMatch(warehouse,/value:"short"/);
 assert.deepEqual(filterBoxDistributionRows([{id:'a',productionReceived:3,packedQty:0,unpacked:3},{id:'b',productionReceived:3,packedQty:3,unpacked:0}],'available').map(r=>r.id),['a']);
 assert.deepEqual(filterBoxDistributionRows([{id:'a',productionReceived:3,packedQty:0,unpacked:3}],'not-packed'),[]);
 for(const key of ['preparing.tab.boxes.not_packed','preparing.tab.warehouse.short']){
  assert.ok(!ACTIVE_PILOT_FEATURE_KEYS.includes(key),key);
  assert.ok(!FEATURE_DEFINITIONS.some(r=>r.key===key),key);
 }
 for(const stage of ['warehouse','boxes']) for(const tab of Object.keys(PREPARING_EDIT_TAB_LABELS[stage])){
  const key=preparingTabKey(stage,tab);
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key));
  assert.ok(FEATURE_DEFINITIONS.some(r=>r.key===key));
 }
});

test('Warehouse Return report displays tested, returned and ready-to-return quantities',()=>{
 const row=demoRows().find(r=>r.id==='part-return');
 const r={...row,name:row.product_name,required:row.required_qty,receivedBy:[{name:'Warehouse officer'}]};
 assert.equal(warehouseExportValue(r,'tested'), '5');
 assert.equal(warehouseExportValue(r,'accepted'), '2');
 assert.equal(warehouseExportValue(r,'available'), '3');
 assert.equal(warehouseExportValue(r,'receivedBy'), 'Warehouse officer');
 assert.equal(warehouseExportValue(r,'accepted',true), '');
 assert.equal(warehouseExportValue(r,'tested',true), '5');
 assert.deepEqual(WAREHOUSE_COLUMNS.map(c=>c.label),['Component','Code','Project Required','Tested','Returned','Ready to Return','Recorded By','Signature']);
 const pdf=read('app/api/projects-preparing/warehouse/export/route.js');
 assert.match(pdf,/PROJECT WAREHOUSE RETURN/);
 assert.match(pdf,/Warehouse Return/);
 assert.match(pdf,/Number\(row\.tested\)>0/);
});

test('All modified JS and JSX files parse without syntax errors',()=>{
 for(const p of [
  'components/preparing/PreparingClient.jsx',
  'components/preparing/ProjectWarehouseReceiving.jsx',
  'components/preparing/ProjectBoxDistribution.jsx',
  'components/preparing/ProjectProductionReceiving.jsx',
  'components/preparing/ProjectTesting.jsx',
  'app/api/projects-preparing/warehouse/export/route.js',
  'app/api/projects-preparing/production/export/route.js',
  'lib/preparing-tab-permissions.mjs',
  'lib/preparing-warehouse-view.mjs',
  'lib/preparing-warehouse-math.mjs',
  'lib/preparing-warehouse.js',
  'lib/preparing-box-visibility.mjs',
  'lib/feature-permissions-registry.js',
 ]){
  const jsx=p.endsWith('.jsx');
  const parsed=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,jsx?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(parsed.parseDiagnostics.map(diag=>diag.messageText),[],p);
 }
});
