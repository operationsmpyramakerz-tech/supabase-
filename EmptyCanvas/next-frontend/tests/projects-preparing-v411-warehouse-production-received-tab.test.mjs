import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
import {filterWarehouseReceivingRows} from '../lib/preparing-warehouse-view.mjs';
import {preparingRowMatchesTab,PREPARING_EDIT_TAB_LABELS,preparingTabKey} from '../lib/preparing-tab-permissions.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript'),postcss=require('postcss');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const source=()=>warehouseReceivingBalances(warehouseTotals([
  {id:'received-untested',product_name:'A',required_qty:5},
  {id:'tested-but-not-intake',product_name:'B',required_qty:6},
  {id:'partly-returned',product_name:'C',required_qty:9},
  {id:'unreceived',product_name:'D',required_qty:3},
 ],[
  {item_id:'partly-returned',accepted_delta:2},
 ],[]),[
  {item_id:'tested-but-not-intake',tested:5},
  {item_id:'partly-returned',tested:4},
 ],[
  {itemId:'received-untested',received:3},
  {itemId:'partly-returned',received:7},
 ]);

test('Production Received includes only Stage 1 received quantities even before testing',()=>{
 const rows=source();
 assert.deepEqual(rows.map(x=>x.productionIntakeReceived),[3,0,7,0]);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'all').map(x=>x.id),['received-untested','partly-returned']);
 assert.equal(rows[0].tested,0);
 assert.equal(rows[0].readyToReceive,0);
 assert.equal(rows[2].readyToReturn,2);
 assert.equal(preparingRowMatchesTab('warehouse','all',rows[0]),true);
 assert.equal(preparingRowMatchesTab('warehouse','all',rows[1]),false);
 assert.equal(preparingRowMatchesTab('warehouse','all',rows[2]),true);
});

test('Remaining to Return and Returned do not change with the new first tab',()=>{
 const rows=source();
 assert.deepEqual(filterWarehouseReceivingRows(rows,'available').map(x=>x.id),['tested-but-not-intake','partly-returned']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'received').map(x=>x.id),['partly-returned']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'unknown'),[]);
 assert.deepEqual(filterWarehouseReceivingRows(null,'all'),[]);
 assert.throws(()=>warehouseReceiptLimit(0,'1',0),/tested/);
 assert.equal(warehouseReceiptLimit(2,'3',4),1);
});

test('Stage 3 reads the real Production Receiving snapshot, without SQL changes or trusting the client',()=>{
 const presenter=read('lib/preparing-warehouse-presentation.js');
 const writer=read('lib/preparing-tab-write-server.js');
 assert.match(presenter,/rpc\("erp_preparing_intake_snapshot_v388",\{p_project_id:snapshot\.projectId\}/);
 assert.match(presenter,/intakeBalances:intake\?\.balances\|\|\[\]/);
 assert.match(writer,/tab === 'all' && stage !== 'warehouse'/);
 assert.match(writer,/rpc\('erp_preparing_intake_snapshot_v388',\{p_project_id:state\.projectId\}/);
 assert.match(writer,/preparingRowMatchesTab\(stage, tab, byId\.get\(id\)\)/);
 assert.equal(preparingTabKey('warehouse','all'),'preparing.tab.warehouse.all');
 assert.equal(PREPARING_EDIT_TAB_LABELS.warehouse.all,'Production Received');
});

test('Stage 3 renders Production Received numbers and protects tested-only returns and exports',()=>{
 const ui=read('components/preparing/ProjectWarehouseReceiving.jsx');
 const exportRoute=read('app/api/projects-preparing/warehouse/export/route.js');
 assert.match(ui,/value:"all",label:"Production Received"/);
 assert.doesNotMatch(ui,/value:"all",label:"All Components"/);
 assert.match(ui,/state\.intakeBalances\|\|\[\]/);
 assert.match(ui,/pretty\(row\.productionIntakeReceived\)/);
 assert.match(ui,/Tested: \{pretty\(row\.tested\)\}/);
 assert.match(ui,/row\.tested>0\|\|row\.accepted>0/);
 assert.match(ui,/summaries\.filter\(row=>number\(row\.tested\)>0\|\|number\(row\.accepted\)>0\)/);
 assert.match(exportRoute,/Number\(row\.tested\)>0\|\|Number\(row\.accepted\)>0/);
});

test('Touched JS/JSX and stylesheet parse cleanly',()=>{
 for(const path of [
  'components/preparing/ProjectWarehouseReceiving.jsx',
  'lib/preparing-warehouse-presentation.js',
  'lib/preparing-warehouse-math.mjs',
  'lib/preparing-warehouse-view.mjs',
  'lib/preparing-tab-write-server.js',
  'lib/preparing-tab-permissions.mjs',
  'lib/feature-permissions-registry.js',
 ]){
  const isJSX=path.endsWith('.jsx');
  const result=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,isJSX?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(result.parseDiagnostics.map(d=>d.messageText),[],path);
 }
 assert.doesNotThrow(()=>postcss.parse(read('public/css/projects-preparing.css')));
});
