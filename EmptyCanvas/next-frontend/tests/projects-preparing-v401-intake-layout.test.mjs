import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const file=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('v401 Production Receiving stays a standalone stage and JSX parses',()=>{
 const src=file('components/preparing/ProjectProductionIntake.jsx');
 assert.equal(ts.createSourceFile('ProjectProductionIntake.jsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX).parseDiagnostics.length,0);
 assert.match(src,/pr-intake-v401/);assert.match(src,/TestingIcon name="engineer"/);
 assert.match(src,/pr-intake-progress-track/);assert.match(src,/totals\.tested/);
 assert.match(src,/pr-intake-signoff/);assert.match(src,/StageFilterTabs/);
 assert.doesNotMatch(src,/className="pr-wh-stats pr-pt-stat-grid pr-pt-coverage-grid"/);
});

test('compact kit components use real photos, contributors and safe image dialog',()=>{
 const src=file('components/preparing/ProjectProductionIntake.jsx');
 assert.match(src,/ComponentThumbnail row=\{r\}/);
 assert.match(src,/pr-intake-thumb/);
 assert.match(src,/EditorAvatars people=\{r\.testedBy\|\|\[\]\}/);
 assert.match(src,/\{people\.length-3\}/);
 assert.match(src,/pr-intake-lightbox/);
 assert.match(src,/event\.key==="Escape"/);
 assert.match(src,/aria-label=\{`Edit \$\{r\.name\}`\}/);
 assert.doesNotMatch(src,/Received By<\/span>/);
 assert.doesNotMatch(src,/<small>\{group\.items\.length\} components<\/small>/);
 assert.match(src,/await request\("\/intake","POST",\{projectId,editTab:filter,lines\}\)/);
});

test('intake photo enrichment is presentation only and remains permission-gated',()=>{
 const src=file('lib/preparing-project-testing.js');
 const route=file('app/api/projects-preparing/intake/route.js');
 assert.equal(ts.createSourceFile('preparing-project-testing.js',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
 assert.match(src,/getProductsList\(\)\.catch\(\(\)=>\[\]\)/);
 assert.match(src,/getTeamMemberPublicProfile\(person\.id\)\.catch\(\(\)=>null\)/);
 assert.match(src,/imageUrls,testedBy:uniquePeople/);
 assert.match(route,/preparingStageReadGate/);
 assert.match(route,/requirePreparingTabWrite/);
});

test('stage-specific colors, black active filter, and lightbox CSS are scoped',()=>{
 const styles=file('public/css/projects-preparing.css');
 assert.match(styles,/\.pr-intake-v401 \.pr-stage-filter-tabs>button\.is-active/);
 assert.match(styles,/\.pr-intake-v401 \.pr-pt-kit-group/);
 assert.match(styles,/\.pr-intake-v401 \.pr-intake-component-main/);
 assert.match(styles,/\.pr-intake-lightbox/);
 assert.match(styles,/\.pr-intake-v401 \.pr-pt-download-button/);
});
