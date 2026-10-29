import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const read = filename => readFileSync(new URL(`../${filename}`,import.meta.url),'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const css = read('public/css/projects-preparing.css');

test('project preparation uses five real operational quantity balances, not school stage counts',()=>{
 const progress = calculateProjectPreparationProgress({sourceProposalId:'proposal-id',
  testing:{items:[{required:10,passed:4}]}, warehouse:{items:[{required_qty:10}],receiptLines:[{accepted_delta:3}]},
  production:{items:[{productionReceived:2,packedQty:1}]}});
 assert.deepEqual(progress.stages,[100,40,30,20,10]);
 assert.equal(progress.overall,40);
 assert.equal(progress.completed,1);
 assert.equal(progress.required,10);
});
test('empty, partial and excessive balances are clamped safely',()=>{
 const empty=calculateProjectPreparationProgress({testing:{items:[]},warehouse:{items:[]},production:{items:[]}});
 assert.deepEqual(empty.stages,[0,0,0,0,0]);
 assert.equal(empty.overall,0);
 const full=calculateProjectPreparationProgress({sourceProposalId:'proposal-id', testing:{items:[{required:5,passed:8}]},
  warehouse:{items:[{required_qty:5}],receiptLines:[{accepted_delta:7}]},
  production:{items:[{productionReceived:7,packedQty:7}]}});
 assert.deepEqual(full.stages,[100,100,100,100,100]);
 assert.equal(full.completed,5);
});
test('dashboard renders exactly five project step routes and a separate reports action',()=>{
 assert.match(ui,/className="pr-project-split"/);
 assert.match(ui,/className="pr-project-step-timeline"/);
 assert.match(ui,/pr-dashboard-schools/);
 assert.match(ui,/className="pr-project-report-link"/);
 for (const name of ['Project Components','Project Testing','Warehouse Receiving','Production Receiving','Project Kit Cartons'])
  assert.match(ui,new RegExp(`title:"${name}"`));
 assert.match(ui,/calculateProjectPreparationProgress/);
 assert.match(ui,/projectStepCards.map/);
 assert.match(ui,/setShowProjectTesting\(true\)/);
 assert.match(ui,/setShowWarehouse\(true\)/);
 assert.match(ui,/setShowProduction\(true\)/);
 assert.doesNotMatch(ui,/title:"Project Dashboard", subtitle:/);
});
test('liquid gauges support live percentages, reduced motion, small screens and readable labels',()=>{
 assert.match(ui,/aria-label=\{`\$\{label\}: \$\{percent === null/);
 assert.match(css,/\.pr-liquid-gauge__water/);
 assert.match(css,/@keyframes pr-liquid-wave/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.pr-project-split \{grid-template-columns:1fr;/);
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=254/);
 const parsed=ts.createSourceFile('PreparingClient.jsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
});
