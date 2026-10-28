import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const css=read('public/css/projects-preparing.css');

test('project and school routes show unified progress cards not six separate stat cards',()=>{
  assert.match(ui,/pr-summary-card--project/);
  assert.match(ui,/pr-summary-card--school/);
  assert.doesNotMatch(ui,/className="pr-metrics"/);
  assert.doesNotMatch(ui,/className="pr-school-info"/);
  assert.match(ui,/projectCompletedStages/);
  assert.match(ui,/schoolPercent/);
  assert.match(ui,/progress\.delivered/);
  assert.match(ui,/progress\.closed/);
});
test('stage filters preserve all stages by default and distinguish execution from follow-up',()=>{
  assert.match(ui,/useState\("all"\)/);
  assert.match(ui,/visibleWorkflowStages = PREPARING_STAGES\.map/);
  assert.match(ui,/stage\.team === workflowFilter/);
  assert.match(ui,/stage\.team === "operations" \? "Operations execution" : "Technical coordination"/);
  assert.match(ui,/aria-pressed=\{workflowFilter === tab\.key\}/);
  assert.match(ui,/onClick=\{\(\) => openStage\(stage\)\}/);
});
test('all five school workspaces still launch their original functional sheet',()=>{
  for(const name of ['setShowComponents(true)','setShowDelivery(true)','setShowTechnical(true)','setShowReconciliation(true)','setShowClosing(true)']) assert.ok(ui.includes(name),name);
  assert.match(ui,/showProjectCartons &&/);
  assert.match(ui,/showDashboard &&/);
  assert.match(ui,/\bcanStage\b/);
  assert.match(ui,/\bcanClose\b/);
});
test('school folder styling matches proposals dimensions and works on narrow screens',()=>{
  assert.match(css,/\.pr-root--project \.pr-folder-card \{\s*width:154px; height:144px;/);
  assert.match(css,/border:5px solid #101217/);
  assert.match(css,/@media\(max-width:670px\)/);
  assert.match(css,/\.pr-root--school \.pr-stage-list/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('new JSX remains parseable and CSS route is refreshed',()=>{
  const source=ts.createSourceFile('PreparingClient.jsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(source.parseDiagnostics.map(d=>d.messageText),[]);
  assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=237/);
});
