import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {warehouseReceivingBalances,warehouseTotals,warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
import {filterWarehouseReceivingRows,WAREHOUSE_COLUMNS} from '../lib/preparing-warehouse-view.mjs';
import {preparingRowMatchesTab} from '../lib/preparing-tab-permissions.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),postcss=require('postcss');
const file=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const stage=file('components/preparing/ProjectWarehouseReceiving.jsx');
const stage2=file('components/preparing/ProjectTesting.jsx');
const stage1=file('components/preparing/ProjectProductionIntake.jsx');
const server=file('lib/preparing-warehouse-presentation.js');
const route=file('app/api/projects-preparing/warehouse/route.js');
const css=file('public/css/projects-preparing.css');

test('Stage 3 uses the same header, progress, sign-off, tabs, component cards and toolbar as Stages 1/2',()=>{
 for(const src of [stage,stage2,stage1])for(const token of ['pr-intake-v401','pr-intake-heading','pr-intake-summary','pr-intake-progress','pr-intake-signoff','pr-intake-tabs-toolbar','pr-intake-tabs-actions','pr-intake-component-main','pr-intake-search-control','pr-pt-kit-group'])assert.ok(src.includes(token),token);
 assert.match(stage,/>Warehouse Return<\/h3>/);
 assert.match(stage,/totals\.accepted\/totals\.required/);
 assert.match(stage,/pr-intake-progress-track[^\n]*role="progressbar"/);
 assert.match(stage,/pr-intake-signoff">\{closurePanel\}/);
 assert.doesNotMatch(stage,/pr-pt-stat-grid|pr-wh-stats/);
 assert.match(css,/\.pr-warehouse-v407 \.pr-wh-list\.pr-wr-list \{max-height:none/);
});

test('Warehouse stage retains the original filter IDs and permissions, with updated labels',()=>{
 for(const choice of ['value:"all",label:"Production Received"','value:"available",label:"Remaining to Return"','value:"received",label:"Returned"'])assert.ok(stage.includes(choice),choice);
 assert.match(stage,/canReceive && editTabs\[filter\] !== false/);
 assert.match(stage,/editTab:action==="receive"\?filter:"all"/);
 assert.match(stage,/request\("\/warehouse","POST"/);
 assert.match(stage,/request\(`\/warehouse\?projectId=/);
 assert.match(stage,/warehouseReceiptLimit\(row\.accepted,draft\[row\.id\],row\.tested,row\.allocated\)/);
 assert.match(stage,/kind:acceptedDelta<0\?"adjustment":"receipt"/);
 assert.match(stage,/kind:"adjustment",lines:\[\{itemId:row\.id,accepted:-row\.accepted\}\]/);
 assert.match(stage,/Reverse returned balance \(audit retained\)/);
 assert.doesNotMatch(stage,/School Allocation/);
});

test('Warehouse component photos, user avatars, compact inline controls and full image preview are supported',()=>{
 assert.match(stage,/ComponentThumbnail row=\{\{\.\.\.row,name:row\.product_name\}\} onOpen=\{showPreview\}/);
 assert.match(stage,/EditorAvatars people=\{people\}/);
 assert.match(stage,/pr-intake-cell--received/);
 assert.match(stage,/pr-intake-action--cancel/);
 assert.match(stage,/pr-intake-action--save/);
 assert.match(stage,/saveReceipt\(row\)/);
 assert.match(stage,/pr-intake-image-overlay/);
 assert.match(stage,/createPortal\(/);
 assert.match(stage,/rowError\[row\.id\]/);
 assert.match(stage,/Return History/);
 assert.match(stage,/onCSV=\{exportCSV\} onPDF=\{exportPDF\}/);
});

test('Stage 3 has one custom X in the collapsible global-style search; does not use native clear button',()=>{
 assert.match(stage,/pr-intake-search-control\$\{searchOpen\?/);
 assert.match(stage,/id="pr-warehouse-component-search" type="search"/);
 assert.match(stage,/onClick=\{closeSearch\}/);
 assert.match(stage,/onKeyDown=\{event=>\{if\(event\.key==="Escape"\)/);
 assert.doesNotMatch(stage,/pr-pt-clear-search/);
 assert.match(css,/\.pr-intake-search-expand input::-webkit-search-cancel-button/);
});

test('Catalog images and public profile photos enrich GET only, without modifying warehouse write RPC',()=>{
 assert.match(route,/warehousePresentationWorkspace\(new URL\(req\.url\)\.searchParams\.get\("projectId"\)\)/);
 assert.match(route,/preparingStageReadable/);
 assert.match(route,/preparingStageGate/);
 assert.match(route,/requirePreparingTabWrite/);
 assert.match(route,/receiveWarehouseComponents/);
 assert.match(server,/export async function warehousePresentationWorkspace\(projectId\)/);
 assert.match(server,/warehouseWorkspace\(projectId\)/);
 assert.match(server,/getProductsList\(\)\.catch\(\(\)=>\[\]\)/);
 assert.match(server,/getTeamMemberPublicProfile\(person\.created_by_id\)\.catch\(\(\)=>null\)/);
 assert.match(server,/created_by_photo_url/);
 assert.match(server,/imageUrls:\[\.\.\.new Set/);
 const warehouse=file('lib/preparing-warehouse.js');
 assert.match(warehouse,/erp_preparing_warehouse_receive_v241/);
});

test('Warehouse Return first tab follows production intake, other tabs follow testing/return and protect allocations',()=>{
 const rows=warehouseReceivingBalances(warehouseTotals([
  {id:'a',required_qty:10,product_name:'A'},
  {id:'b',required_qty:10,product_name:'B'},
  {id:'c',required_qty:10,product_name:'C'},
 ],[{item_id:'a',accepted_delta:2},{item_id:'b',accepted_delta:4}],[{item_id:'b',delta_qty:1}]),[{item_id:'a',tested:4},{item_id:'b',tested:4}],[{itemId:'a',received:4},{itemId:'c',received:2}]);
 assert.equal(rows[0].readyToReceive,2);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'all').map(r=>r.id),['a','c']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'available').map(r=>r.id),['a']);
 assert.deepEqual(filterWarehouseReceivingRows(rows,'received').map(r=>r.id),['a','b']);
 assert.equal(preparingRowMatchesTab('warehouse','all',rows[2]),true);
 assert.equal(warehouseReceiptLimit(2,'4',4,0),2);
 assert.throws(()=>warehouseReceiptLimit(2,'5',4,0),/tested/);
 assert.throws(()=>warehouseReceiptLimit(4,'0',4,1),/allocated/);
 assert.ok(WAREHOUSE_COLUMNS.find(c=>c.key==='accepted'));
});

test('Warehouse component, presentation route and CSS parse cleanly',()=>{
 for(const path of ['components/preparing/ProjectWarehouseReceiving.jsx','lib/preparing-warehouse-presentation.js','app/api/projects-preparing/warehouse/route.js']){
  const ast=ts.createSourceFile(path,file(path),ts.ScriptTarget.Latest,true,path.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics.map(diag=>diag.messageText),[],path);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
});
