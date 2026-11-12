import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {productionReceiptDelta,productionBalance,filterProductionReceivingRows} from '../lib/preparing-production-math.mjs';
import {warehouseGroups} from '../lib/preparing-warehouse-view.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),postcss=require('postcss');
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const stage=source('components/preparing/ProjectProductionReceiving.jsx');
const stage3=source('components/preparing/ProjectWarehouseReceiving.jsx');
const stage1=source('components/preparing/ProjectProductionIntake.jsx');
const server=source('lib/preparing-production-presentation.js');
const route=source('app/api/projects-preparing/production/route.js');
const css=source('public/css/projects-preparing.css');

test('Stage 4 matches the Stage 1–3 layout while isolating Stage 5 Box Distribution',()=>{
 for(const token of ['pr-intake-v401','pr-intake-heading','pr-intake-summary','pr-intake-progress','pr-intake-signoff','pr-intake-tabs-toolbar','pr-intake-tabs-actions','pr-intake-component-main','pr-intake-search-control','pr-pt-kit-group']){
  for(const item of [stage,stage3,stage1])assert.ok(item.includes(token),token);
 }
 assert.match(stage,/if\(!boxView\)return <div className="[^"]*pr-production-v408/);
 assert.match(stage,/>Operations Receiving<\/h3>/);
 assert.match(stage,/pr-intake-signoff">\{closurePanel\}/);
 assert.match(stage,/totals\.production\/totals\.required/);
 assert.match(stage,/ProjectBoxDistribution/);
 assert.match(stage,/isBoxTab&&<ProjectBoxDistribution/);
 assert.match(css,/\.pr-production-v408 \.pr-pt-kit-list/);
 assert.match(css,/Scoped to Stage 4 so Stage 5 Box Distribution is unchanged/);
});

test('Stage 4 keeps its status filter IDs, default and per-tab access rules',()=>{
 for(const token of ['useState("available")','value:"all",label:"All Components"','value:"available",label:"Remaining to Receive"','value:"received",label:"Received"','value:"not-received",label:"Not Received"','canEditTab=allowed && editTabs[filter] !== false','editTab:filter'])assert.ok(stage.includes(token),token);
 assert.match(stage,/filterProductionReceivingRows\(/);
 assert.deepEqual(filterProductionReceivingRows([
  {id:'a',availableToProduction:3,productionReceived:0},
  {id:'b',availableToProduction:0,productionReceived:2},
  {id:'c',availableToProduction:0,productionReceived:0},
 ],'available').map(r=>r.id),['a']);
});

test('Inline Operations Received edits preserve warehouse and packed quantities',()=>{
 assert.match(stage,/productionReceiptDelta\(row\.productionReceived,value,row\.warehouseReceived,row\.packedQty\)/);
 assert.match(stage,/request\("\/production","POST",\{action:"handoff"/);
 assert.match(stage,/totalReceived:Number\(value\),expectedReceived:row\.productionReceived/);
 assert.match(stage,/min=\{row\.packedQty\}/);
 assert.match(stage,/pr-intake-action--save/);
 assert.match(stage,/pr-intake-action--cancel/);
 assert.match(stage,/pr-intake-edit-icon/);
 assert.equal(productionReceiptDelta(2,'5',6,1),3);
 assert.throws(()=>productionReceiptDelta(2,'7',6,1),/Warehouse Returned/);
 assert.throws(()=>productionReceiptDelta(4,'1',8,2),/packed/);
 assert.deepEqual(productionBalance(8,4,2),{warehouseReceived:8,productionReceived:4,packedQty:2,availableToProduction:4,unpacked:2});
});

test('Kit grouping preserves the product image field and multiple-source entries',()=>{
 const rows=[{id:'a',product_name:'Sensor',product_id:'123',required_qty:4,source_kits:[{kitId:'k1',kitName:'Electronics',quantity:1},{kitId:'k2',kitName:'Addons',quantity:1}],imageUrls:['https://example.org/photo.jpg'],editors:[{name:'Ops'}]}];
 const groups=warehouseGroups(rows,[]);
 assert.equal(groups.length,2);
 assert.equal(groups[0].items[0].imageUrls[0],rows[0].imageUrls[0]);
 assert.equal(groups[1].items[0].editors[0].name,'Ops');
});

test('Stage 4 uses one custom X with an expandable global-style Search',()=>{
 assert.match(stage,/id="pr-operations-component-search" type="search"/);
 assert.match(stage,/onClick=\{closeSearch\}/);
 assert.match(stage,/if\(event\.key==="Escape"\)\{event\.preventDefault\(\);closeSearch\(\);\}/);
 assert.match(css,/\.pr-intake-search-expand input::-webkit-search-cancel-button/);
 assert.match(stage,/ComponentThumbnail row=\{row\} onOpen=\{showPreview\}/);
 assert.match(stage,/EditorAvatars people=\{row\.editors\}/);
 assert.match(stage,/createPortal\(/);
 assert.match(stage,/pr-intake-image-overlay/);
});

test('GET enriches only Operations Receiving with media; Box GET remains private and unmodified',()=>{
 assert.match(route,/preparingStageReadable\(auth\.account,stage\)/);
 assert.match(route,/stage==="production"\?productionPresentationWorkspace\(params\.get\("projectId"\)\):productionWorkspace\(params\.get\("projectId"\)\)/);
 assert.match(route,/stage==="production"\?\{\.\.\.data,cartons:\[\],cartonLines:\[\]\}/);
 assert.match(route,/\{\.\.\.data,handoffs:\[\]\}/);
 assert.match(route,/requirePreparingTabWrite\(auth\.account,target,body/);
 assert.match(server,/export async function productionPresentationWorkspace\(projectId\)/);
 assert.match(server,/productionWorkspace\(projectId\)/);
 assert.match(server,/getProductsList\(\)\.catch/);
 assert.match(server,/getTeamMemberPublicProfile\(person\.received_by_id\)/);
 assert.match(server,/imageUrls:\[\.\.\.new Set/);
 assert.match(server,/received_by_photo_url/);
 assert.doesNotMatch(server,/saveProductionHandoff|saveProductionBox/);
});

test('Stage 4 History and export methods remain available in the new view',()=>{
 assert.match(stage,/tab==="receiving-history"&&<section/);
 assert.match(stage,/data\.handoffs\.map\(h=>/);
 assert.match(stage,/exportCsv\(false\)/);
 assert.match(stage,/exportCsv\(true\)/);
 assert.match(stage,/exportPdf\(false\)/);
 assert.match(stage,/exportPdf\(true\)/);
 assert.match(stage,/Saved successfully, but the updated balances could not be refreshed/);
 assert.match(source('app/projects-preparing/page.jsx'),/v408-operations-stage/);
});

test('All modified sources and the full stylesheet parse',()=>{
 for(const file of ['components/preparing/ProjectProductionReceiving.jsx','lib/preparing-production-presentation.js','app/api/projects-preparing/production/route.js','app/projects-preparing/page.jsx']){
  const ast=ts.createSourceFile(file,source(file),ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics.map(diag=>diag.messageText),[],file);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
});
