import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
const ts=createRequire(import.meta.url)('typescript');
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const css=read('public/css/projects-preparing.css');

test('Components and Schools have separate functional tabs; Master BOM remains independent of the five progress steps',()=>{
  const overview = ui.split('{projectTab === "overview" &&')[1].split('{projectTab === "components" &&')[0];
  const schools = ui.split('{projectTab === "schools" &&')[1].split('{projectTab === "reports" &&')[0];
  assert.ok(overview && schools);
  assert.doesNotMatch(overview,/pr-project-schools-panel/);
  assert.match(schools,/className="pr-project-schools-panel pr-project-schools-panel--tab"/);
  assert.match(ui,/projectTab === "components"/);
  assert.match(ui,/<ProjectMasterComponents key=\{projectId\}[^>]* inline/);
  assert.doesNotMatch(ui,/setShowProjectBOM/);
  assert.match(ui,/onChanged=\{\(\)=>\{setProjectStageRevision/);
  const cards=ui.split('const projectStepCards = [')[1].split('];')[0];
  assert.doesNotMatch(cards,/key:"components"/);
  assert.equal((cards.match(/key:"(?:testing|warehouse|production|boxes|cartons)"/g)||[]).length,5);
});
test('top overview and step timeline show five-stage logic without component progress',()=>{
  assert.match(ui,/pr-summary-card--overview/);
  assert.match(ui,/Project Overview/);
  assert.doesNotMatch(ui,/PROJECT PROGRESS/);
  const stageTab=ui.split('{projectTab === "stages" &&')[1].split('{projectTab === "components" &&')[0];
  assert.match(stageTab,/<h2>Project Steps<\/h2>/);
  assert.doesNotMatch(stageTab,/5 stages|These five stages determine the overall project completion/);
  assert.match(stageTab,/projectStepCards\.map/);
  assert.match(ui,/projectStepPercents\?\.\[index\]/);
  assert.match(ui,/pr-step-kpi-stage-icon/);
  assert.match(ui,/pr-step-kpi-track/);
});
test('progress math excludes Master BOM even when source proposal changes',()=>{
  const inputs={testing:{items:[{required:10,passed:4}]},warehouse:{receiptLines:[{accepted_delta:3}]},production:{items:[{productionReceived:2,packedQty:1}]}};
  const a=calculateProjectPreparationProgress({...inputs,sourceProposalId:null});
  const b=calculateProjectPreparationProgress({...inputs,sourceProposalId:'proposal-id'});
  assert.deepEqual(a,b);
  assert.deepEqual(a.stages,[40,30,20,10,0]);
  assert.equal(a.overall,20);
  assert.equal(a.completed,0);
});
test('responsive layout, permissioned avatars and embedded component semantics remain sound',()=>{
  assert.match(css,/\.pr-project-left-column/);
  assert.match(css,/\.pr-project-tab-pane--components \.pr-pbom--inline/);
  assert.match(css,/@media\(max-width:590px\)/);
  assert.match(ui,/StepAccessAvatars access=\{stepAccess\?\.\[step.key\]\}/);
  assert.match(ui,/<ProjectDashboard key=\{projectId\}[^>]* inline/);
  assert.doesNotMatch(ui,/pr-project-report-card/);
  assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=274/);
  const file=ts.createSourceFile('PreparingClient.jsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(file.parseDiagnostics,[]);
});
