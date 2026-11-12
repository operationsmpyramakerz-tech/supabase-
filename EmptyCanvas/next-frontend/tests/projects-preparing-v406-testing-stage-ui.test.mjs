import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingChange,testingCoverage,testingCoverageTotals,testingReadyToTest} from '../lib/preparing-project-testing-math.mjs';
import {preparingRowMatchesTab} from '../lib/preparing-tab-permissions.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const file=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=file('components/preparing/ProjectTesting.jsx');
const intake=file('components/preparing/ProjectProductionIntake.jsx');
const server=file('lib/preparing-project-testing.js');
const route=file('app/api/projects-preparing/testing/route.js');
const css=file('public/css/projects-preparing.css');

test('Stage 2 renders with the approved Production Receiving layout without touching Stage 1',()=>{
 for(const src of [ui,intake])for(const className of ['pr-intake-v401','pr-intake-heading','pr-intake-summary','pr-intake-progress','pr-intake-signoff','pr-intake-tabs-toolbar','pr-intake-tabs-actions','pr-intake-component-main','pr-intake-search-control'])assert.ok(src.includes(className),className);
 assert.match(ui,/Components Testing<\/h3>/);
 assert.match(ui,/TestingIcon name="flask" size=\{48\}/);
 assert.match(ui,/pr-intake-progress-track[^\n]+role="progressbar"/);
 assert.match(ui,/totals\.tested\/totals\.required/);
 assert.match(ui,/pr-intake-signoff">\{closurePanel\}/);
 assert.doesNotMatch(ui,/aria-label="Testing summary"|pr-pt-stat-grid/);
 assert.match(intake,/>Production Receiving<\/h3>/);
 assert.match(css,/\.pr-root \.pr-intake-v401 \.pr-intake-tabs-toolbar/);
});

test('testing filters, search, history and exports retain original testing routes',()=>{
 assert.match(ui,/value:"all",label:"All Components"/);
 assert.match(ui,/value:"pending",label:"Remaining to Test"/);
 assert.match(ui,/value:"done",label:"Fully Tested"/);
 assert.match(ui,/filter==="pending"\?testingReadyToTest\(r\)>0/);
 assert.match(ui,/testingReadyToTest\(r\)/);
 assert.match(ui,/canTest && editTabs\[filter\] !== false/);
 assert.match(ui,/await request\("\/testing","POST",\{projectId,editTab:filter,lines\}\)/);
 assert.match(ui,/request\(`\/testing\?projectId=/);
 assert.match(ui,/projects-preparing\/testing\/export/);
 assert.match(ui,/Testing Activity/);
 assert.match(ui,/project-testing-\$\{blank\?/);
 assert.match(ui,/\bSearch testing components\b/);
 assert.match(ui,/pr-testing-component-search/);
 assert.match(ui,/onClick=\{closeSearch\}/);
 assert.match(css,/\.pr-intake-search-expand input::-webkit-search-cancel-button/);
});

test('testing inline edit, photo preview and editor avatars match first stage',()=>{
 assert.match(ui,/ComponentThumbnail row=\{r\} onOpen=\{showPreview\}/);
 assert.match(ui,/EditorAvatars people=\{r\.testedBy\|\|\[\]\}/);
 assert.match(ui,/pr-intake-image-overlay/);
 assert.match(ui,/createPortal\(/);
 assert.match(ui,/max=\{r\.productionIntakeReceived\}/);
 assert.match(ui,/aria-label=\{`Tested quantity \$\{r\.name\}`\}/);
 assert.match(ui,/pr-intake-cell--received/);
 assert.match(ui,/pr-intake-action--cancel/);
 assert.match(ui,/pr-intake-action--save/);
 assert.match(ui,/save\(\[r\.id\]\)/);
 assert.match(ui,/rowError\[r\.id\]/);
});

test('testing media enrichment is GET-only, preserves actual quantities and retains permission guards',()=>{
 assert.match(route,/preparingStageReadGate/);
 assert.match(route,/preparingStageGate/);
 assert.match(route,/requirePreparingTabWrite/);
 assert.match(route,/projectTestingPresentationOverview/);
 assert.match(route,/recordProjectTesting\(body,auth\.account\)/);
 assert.match(server,/export async function projectTestingPresentationOverview\(value\)/);
 assert.match(server,/getProductsList\(\)\.catch\(\(\)=>\[\]\)/);
 assert.match(server,/getTeamMemberPublicProfile\(person\.id\)\.catch\(\(\)=>null\)/);
 assert.match(server,/return \{\.\.\.row,imageUrls,testedBy:uniquePeople\}/);
 assert.match(server,/export async function productionIntakeOverview\(value\)/);
 assert.match(server,/export async function recordProjectTesting\(body,account\)/);
});

test('testing math remains bounded by production intake and flags fully tested correctly',()=>{
 const row={id:'test',required:12,tested:3,productionIntakeReceived:7,accepted:1};
 assert.equal(testingReadyToTest(row),4);
 assert.equal(testingCoverage(row).remaining,9);
 assert.equal(testingCoverageTotals([row]).required,12);
 assert.deepEqual(testingChange(row,{tested:'5'}),{itemId:'test',testedDelta:2,expectedTested:3});
 assert.throws(()=>testingChange(row,{tested:'8'}),/Production Received/);
 assert.equal(preparingRowMatchesTab('testing','pending',row),true);
 assert.equal(preparingRowMatchesTab('testing','done',row),false);
 assert.equal(preparingRowMatchesTab('testing','done',{...row,tested:12,productionIntakeReceived:12}),true);
});

test('modified JSX, API and CSS parse',()=>{
 for(const name of ['components/preparing/ProjectTesting.jsx','lib/preparing-project-testing.js','app/api/projects-preparing/testing/route.js']){
  const ast=ts.createSourceFile(name,file(name),ts.ScriptTarget.Latest,true,name.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics,[],name);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
});
