import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=name=>read(`components/preparing/${name}.jsx`);
const stages=['ProjectTesting','ProjectWarehouseReceiving','ProjectProductionReceiving','ProjectBoxDistribution','ProjectKitCartons'];

test('All five project stages use the same status tabs, not a filter popover',()=>{
 for(const stage of stages){const source=ui(stage);assert.match(source,/import StageFilterTabs from "\.\/StageFilterTabs"/);assert.match(source,/<StageFilterTabs/);assert.doesNotMatch(source,/<PreparingSelect iconOnly/);}
 const shared=ui('StageFilterTabs');
 for(const pattern of [/role="tablist"/,/role="tab"/,/aria-selected=/,/ArrowRight/,/ArrowLeft/,/onChange\(option\.value\)/])assert.match(shared,pattern);
});
test('Stage tab options retain the original filtering rules and display all first',()=>{
 const testing=ui('ProjectTesting'),warehouse=ui('ProjectWarehouseReceiving'),production=ui('ProjectProductionReceiving'),boxes=ui('ProjectBoxDistribution');
 for(const token of ['value:"all",label:"All Components"','value:"pending",label:"Remaining to Test"','value:"done",label:"Fully Tested"','testingReadyToTest(r)>0'])assert.ok(testing.includes(token));
 for(const token of ['value:"all",label:"Production Received"','value:"available",label:"Remaining to Return"','value:"received",label:"Returned"','filterWarehouseReceivingRows('])assert.ok(warehouse.includes(token));
 const warehouseFilter=read("lib/preparing-warehouse-view.mjs");assert.ok(warehouseFilter.includes("qty(row.productionIntakeReceived)>0"));assert.ok(warehouseFilter.includes("qty(row.tested)-qty(row.accepted)"));
 assert.match(production,/filterProductionReceivingRows\(/);assert.match(boxes,/filterBoxDistributionRows\(items,filter\)/);
 assert.match(production,/onReturnToBoxes=\{\(\)=>setTab\("boxes"\)\}/);
 for(const token of ['All Cartons','Draft','Ready','c.status!=="cancelled"','c.status===cartonFilter','visibleCartons.map'])assert.ok(ui('ProjectKitCartons').includes(token));
});
test('Warehouse allocation screen and new allocation controls are removed without removing existing stock safeguards',()=>{
 const source=ui('ProjectWarehouseReceiving');
 for(const old of ['School Allocation','allocateBatch','allocateItem','assignDraft','tab==="allocation"'])assert.ok(!source.includes(old),old);
 assert.match(source,/warehouseReceiptLimit\(row.accepted,draft\[row.id\],row.tested,row.allocated\)/);
 assert.match(source,/state\.allocations\|\|\[\]/);
 assert.match(source,/Return History/);
 assert.match(ui('ProjectKitCartons'),/function allocate\(/);
});
test('Changed JSX parses and shared style supports responsive tabs, dark theme and cache refresh',()=>{
 for(const name of [...stages,'StageFilterTabs'])assert.deepEqual(ts.createSourceFile(name+'.jsx',ui(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX).parseDiagnostics,[],name);
 const css=read('public/css/projects-preparing.css');assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(css,/\.pr-root \.pr-stage-filter-tabs>button\.is-active/);assert.match(css,/overflow-x:auto/);assert.match(css,/html\[data-theme="dark"\] \.pr-root \.pr-stage-filter-tabs/);assert.match(read('app/projects-preparing/page.jsx'),/v386-stage-tabs/);
});
