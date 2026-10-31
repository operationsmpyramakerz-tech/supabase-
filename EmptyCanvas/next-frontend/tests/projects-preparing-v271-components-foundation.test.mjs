import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
const ts=createRequire(import.meta.url)('typescript');
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const css=read('public/css/projects-preparing.css');

test('Project Components is above Schools as a clickable, independent Master BOM, without stage gauge',()=>{
  assert.match(ui,/className="pr-project-left-column"[\s\S]*className="pr-project-components-card"[\s\S]*className="pr-project-schools-panel"/);
  assert.match(ui,/className="pr-project-components-card" onClick=\{\(\)=>setShowProjectBOM\(true\)\}/);
  assert.match(ui,/Master BOM · \{project\.source_proposal_name/);
  assert.match(ui,/StepAccessAvatars access=\{stepAccess\?\.components\}/);
  const cards=ui.split('const projectStepCards = [')[1].split('];')[0];
  assert.doesNotMatch(cards,/key:"components"/);
  assert.equal((cards.match(/key:"(?:testing|warehouse|production|cartons)"/g)||[]).length,4);
});
test('top overview and step timeline show four-stage logic without component progress',()=>{
  assert.match(ui,/pr-summary-card--overview/);
  assert.match(ui,/Project Overview/);
  assert.doesNotMatch(ui,/PROJECT PROGRESS/);
  assert.match(ui,/<span className="pr-section-count">4 stages<\/span>/);
  assert.match(ui,/These four stages determine the overall project completion/);
  assert.match(ui,/projectStepPercents\?\.\[index\]/);
  assert.match(ui,/pr-step-kpi-stage-icon/);
  assert.match(ui,/pr-step-kpi-track/);
});
test('progress math excludes Master BOM even when source proposal changes',()=>{
  const inputs={testing:{items:[{required:10,passed:4}]},warehouse:{receiptLines:[{accepted_delta:3}]},production:{items:[{productionReceived:2,packedQty:1}]}};
  const a=calculateProjectPreparationProgress({...inputs,sourceProposalId:null});
  const b=calculateProjectPreparationProgress({...inputs,sourceProposalId:'proposal-id'});
  assert.deepEqual(a,b);
  assert.deepEqual(a.stages,[40,30,20,10]);
  assert.equal(a.overall,25);
  assert.equal(a.completed,0);
});
test('responsive layout, permissioned avatars and component-card semantics remain sound',()=>{
  assert.match(css,/\.pr-project-left-column/);
  assert.match(css,/\.pr-project-components-card:focus-visible/);
  assert.match(css,/@media\(max-width:590px\)/);
  assert.match(ui,/StepAccessAvatars access=\{stepAccess\?\.\[step.key\]\}/);
  assert.match(ui,/pr-project-report-link/);
  assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=274/);
  const file=ts.createSourceFile('PreparingClient.jsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(file.parseDiagnostics,[]);
});
