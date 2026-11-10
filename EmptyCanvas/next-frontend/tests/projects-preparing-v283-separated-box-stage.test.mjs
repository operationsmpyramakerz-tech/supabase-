import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
import {PREPARING_STEP_PERMISSIONS} from '../lib/preparing-step-access.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const main=read('components/preparing/PreparingClient.jsx');
const production=read('components/preparing/ProjectProductionReceiving.jsx');

test('Box Distribution is an independent fourth step; cartons move to fifth',()=>{
 const cards=main.split('const projectStepCards = [')[1].split('];')[0];
 assert.match(cards,/key:"production"[\s\S]*title:"Production Receiving"/);
 assert.match(cards,/key:"boxes"[\s\S]*title:"Box Distribution"[\s\S]*subtitle:"04 · Packing"/);
 assert.match(cards,/key:"cartons"[\s\S]*title:"Project Kit Cartons"[\s\S]*subtitle:"05 · Carton preparation"/);
 assert.equal((cards.match(/key:"(?:testing|warehouse|production|boxes|cartons)"/g)||[]).length,5);
 assert.match(main,/showBoxDistribution &&/);
 assert.match(main,/view="boxes"/);
 assert.match(main,/aria-label="Box Distribution"/);
 assert.match(main,/aria-label="Production Receiving"/);
 assert.equal(PREPARING_STEP_PERMISSIONS.boxes,'preparing.stage.boxes');
});
test('production and boxes are isolated to their own modal tabs and preserve existing actions',()=>{
 assert.match(production,/view="receiving"/);
 assert.match(production,/boxView\?"boxes":"receiving"/);
 assert.match(production,/boxView \? <div className="pr-pt-navigation pr-production-tabs pr-box-navigation"/);
 assert.match(production,/Box Distribution<\/button>/);
 assert.match(production,/aria-label="Box History"/);
 assert.match(production,/pr-production-navigation/);
 assert.match(production,/Receiving History \(\$\{data\.handoffs\.length\} changes\)/);
 assert.match(production,/isBoxTab&&<ProjectBoxDistribution/);
 assert.match(production,/scope:isBoxTab\?"boxes":"receiving"/);
 assert.match(production,/action:"handoff"/);
 assert.match(read('components/preparing/ProjectBoxDistribution.jsx'),/action:"pack"/);
});
test('Box Distribution packing and ready Kit Cartons are separately represented in percent',()=>{
 const base={testing:{items:[{required:10,tested:10}]},warehouse:{receiptLines:[{accepted_delta:10}]},production:{items:[{productionReceived:10,packedQty:6}],cartons:[{id:'a',status:'draft'},{id:'b',status:'ready'},{id:'c',status:'cancelled'}],cartonLines:[{carton_id:'a',packed_qty:4},{carton_id:'b',packed_qty:2},{carton_id:'c',packed_qty:20}]}};
 const first=calculateProjectPreparationProgress(base);
 assert.deepEqual(first.stages,[100,100,100,60,20]);
 assert.equal(first.overall,76);
 const sealed=calculateProjectPreparationProgress({...base,production:{...base.production,cartons:[{id:'a',status:'ready'},{id:'b',status:'ready'},{id:'c',status:'cancelled'}]}});
 assert.deepEqual(sealed.stages,[100,100,100,60,60]);
 assert.equal(sealed.overall,84);
});
test('both changed React components parse as JSX',()=>{
 for(const file of ['components/preparing/PreparingClient.jsx','components/preparing/ProjectProductionReceiving.jsx']) {
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(source.parseDiagnostics,[],file);
 }
});
