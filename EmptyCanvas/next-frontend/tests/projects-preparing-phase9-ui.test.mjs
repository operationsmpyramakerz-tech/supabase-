import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const css=read('public/css/projects-preparing.css');

test('contextual back button returns to project rather than resetting the project selection',()=>{
 const f=ui.split('function backToParent() {')[1].split('\n  }')[0];
 assert.match(f,/if \(school\) \{ setSchoolId\(""\)/);
 assert.match(f,/setProjectId\(""\)/);
 const school=f.split('if (school)')[1].split('return;')[0];
 assert.doesNotMatch(school,/setProjectId/);
});
test('project tools are one set of controls; school tools keep original handlers',()=>{
 assert.equal((ui.match(/<div className="pr-project-tools"/g)||[]).length,0); // conditional grid has two classes
 assert.equal((ui.match(/className="pr-project-detail-overview"/g)||[]).length,1);
 assert.match(ui,/pr-project-step-timeline/);
 assert.equal((ui.match(/className="pr-tool-grid pr-school-tools"/g)||[]).length,1);
 assert.match(ui,/setShowProjectCartons\(true\)/);
 for (const name of ['setShowComponents','setShowDelivery','setShowTechnical','setShowReconciliation','setShowClosing']) assert.match(ui,new RegExp(`${name}\\(true\\)`));
 assert.doesNotMatch(ui,/pr-component-entry/);
 assert.doesNotMatch(ui,/pr-report-entry/);
});
test('workspace no longer repeats beneficiaries and removes intro descriptions',()=>{
 assert.doesNotMatch(ui,/One folder per complete deployment project/);
 assert.doesNotMatch(ui,/Select a beneficiary to view the preparing workflow/);
 assert.doesNotMatch(ui,/Source proposal:/);
 assert.match(ui,/\["Schools", projectSchools.length\]/);
 assert.match(ui,/pr-summary-card--project/);
 assert.match(ui,/pr-overview-intro/);
});
test('modern responsive controls retain focus, reduced motion, and mobile layout',()=>{
 assert.match(css,/\.pr-tool-grid/);
 assert.match(css,/\.pr-tool:focus-visible|\.pr-root button:focus-visible/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('modified TSX pages parse successfully',()=>{
 for(const f of ['PreparingClient','ProjectDashboard','PackingDelivery','ComponentsManifest','TechnicalFollowUp','FinalSchoolClosing','ReturnsReplacements','ProjectKitCartons']){
  const file=`components/preparing/${f}.jsx`;
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.equal(source.parseDiagnostics.length,0,`${f}: ${source.parseDiagnostics.map(d=>d.messageText).join('; ')}`);
 }
});
