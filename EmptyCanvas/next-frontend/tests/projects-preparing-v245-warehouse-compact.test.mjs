import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
const require=createRequire(import.meta.url), ts=require('typescript');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('components/preparing/ProjectWarehouseReceiving.jsx');
const css=read('public/css/projects-preparing.css');

test('Warehouse component summary shows just Available to Receive, Received and Received By',()=>{
 const block=ui.split('<div className="pr-wr-metrics">')[1]?.split('{rowError[row.id]')[0];
 assert.ok(block);
 assert.match(block,/>Available to Receive</);
 assert.match(block,/>Received</);
 assert.match(block,/>Received By</);
 assert.doesNotMatch(block,/>Passed Testing</);
 assert.doesNotMatch(block,/>Allocated</);
 assert.equal((block.match(/className="pr-wr-stat/g)||[]).length,3);
 assert.match(ui, /\["Project Required",totals.required,"required","◆"\]/);
 assert.match(ui, /\["Received",totals.accepted,"received","↓"\]/);
 assert.match(ui, /\["Available to Receive",totals.readyToReceive,"available","inbox"\]/);
});

test('Edit toggles the same Received value into an input and requires warehouse receiving permission',()=>{
 assert.match(ui, /setDraft\(prev=>\(\{\.\.\.prev,\[row\.id\]:String\(row\.accepted\)\}\)\)/);
 assert.match(ui, /active\?<StageQuantityInput step="1" min="0"/);
 assert.match(ui, /aria-label=\{`Received \$\{row.product_name\}`\}/);
 assert.match(ui, /disabled=\{busy\} title=\{!canReceive/);
 assert.match(ui, /Enable Warehouse Receiving permission in Users Center/);
 assert.match(ui, /if\(!canReceive\)/);
 assert.match(ui, /enableReceipt\(row\);\}\}>Edit/);
 assert.match(ui, /onClick=\{\(\)=>saveReceipt\(row\)\}>Save/);
 assert.equal(warehouseReceiptLimit(0,'2',2,0),2);
 assert.throws(()=>warehouseReceiptLimit(0,'3',2,0),/Passed/);
 assert.throws(()=>warehouseReceiptLimit(2,'0',2,1),/allocated/);
});

test('Warehouse compact CSS is responsive and the newer stylesheet is used',()=>{
 assert.match(css,/grid-template-columns:minmax\(125px,1fr\) minmax\(125px,1fr\) minmax\(150px,1\.25fr\) auto/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=\d+/);
 const parsed=ts.createSourceFile('ProjectWarehouseReceiving.jsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
});
