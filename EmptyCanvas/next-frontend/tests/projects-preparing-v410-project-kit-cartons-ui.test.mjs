import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availableSchoolKits,validSchoolCartonSelection,schoolCartonContents} from '../lib/preparing-school-cartons.mjs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('components/preparing/SchoolKitCartons.jsx');
const legacy=read('components/preparing/ProjectKitCartons.jsx');
const css=read('public/css/projects-preparing.css');
const page=read('app/projects-preparing/page.jsx');

test('Stage 6 uses the actual SchoolKitCartons route (not the legacy component)',()=>{
  const parent=read('components/preparing/PreparingClient.jsx');
  assert.match(parent,/import ProjectKitCartons from "\.\/SchoolKitCartons"/);
  assert.match(ui,/ProjectKitCartonsLegacy/);
  assert.match(ui,/Legacy Cartons/);
  assert.match(ui,/setShowLegacy\(true\)/);
  assert.match(legacy,/scope=cartons/);
});
test('Stage 6 has the shared progress and sign-off layout',()=>{
  assert.match(ui,/pr-intake-summary/);
  assert.match(ui,/Project Progress/);
  assert.match(ui,/pr-intake-progress-track/);
  assert.match(ui,/pr-intake-signoff/);
  assert.match(ui,/\{closurePanel\}/);
  assert.match(ui,/readyKitLines/);
  assert.match(ui,/linkedKitIds\.has/);
  assert.match(ui,/legacyReadyIds/);
});
test('Stage 6 has matching status tabs and one custom search-clear icon',()=>{
  assert.match(ui,/StageFilterTabs/);
  assert.match(ui,/Available Kits/);
  assert.match(ui,/Packed Cartons/);
  assert.match(ui,/pr-intake-tabs-toolbar/);
  assert.match(ui,/pr-intake-search-control/);
  assert.match(ui,/pr-intake-search-clear/);
  assert.match(css,/pr-intake-search-expand input::-webkit-search-cancel-button/);
  assert.equal((ui.match(/className="pr-intake-search-clear"/g)||[]).length,1);
});
test('Individual school scope and Kit selection remains intact',()=>{
  assert.match(ui,/chooseSchool\(id\)/);
  assert.match(ui,/availableSchoolKits\(schoolId,allKits,links\)/);
  assert.match(ui,/validSchoolCartonSelection\(schoolId,selectedIds,allKits,links\)/);
  assert.match(ui,/toggleGroup\(kits\)/);
  assert.match(ui,/selected\.map\(k=>k\.id\)/);
  assert.match(ui,/action:"pack_school_carton",scope:"cartons",editTab,projectId,schoolId/);
  const kits=[
    {id:'a',school_id:'one',status:'ready',generated_kit_label:true},
    {id:'b',school_id:'two',status:'ready',generated_kit_label:true},
    {id:'c',school_id:'one',status:'draft',generated_kit_label:true},
  ];
  assert.deepEqual(availableSchoolKits('one',kits,[]).map(k=>k.id),['a']);
  assert.equal(validSchoolCartonSelection('one',['a','b'],kits,[]),false);
});
test('Packing remains an atomic, immutable carton operation',()=>{
  const api=read('app/api/projects-preparing/project-cartons/route.js');
  const service=read('lib/preparing-project-cartons.js');
  assert.match(api,/requirePreparingTabWrite/);
  assert.match(service,/erp_preparing_pack_school_carton_v397/);
  assert.match(ui,/async function packCarton\(/);
  assert.match(ui,/setSelectedIds\(\[\]\);setTab\("cartons"\)/);
});
test('Kit grouping and finished carton inspection follow the new Kit folder design',()=>{
  assert.match(ui,/cartonKitAppearance/);
  assert.match(ui,/pr-pt-kit-group pr-pt-kit--/);
  assert.match(ui,/pr-carton-v410-kit-row/);
  assert.match(ui,/pr-carton-v410-carton-body/);
  assert.match(ui,/schoolCartonContents\(c\.id,links,allKits\)/);
  assert.match(ui,/kitContents\(kit\)/);
  assert.match(ui,/Kit content is verified and locked/);
});
test('Carton QR label download and edit-tab guards survive the visual migration',()=>{
  assert.match(ui,/kind=carton&id=/);
  assert.match(ui,/rel="noopener noreferrer"/);
  assert.match(ui,/editTabs\.all!==false/);
  assert.match(ui,/editTabs\.draft!==false/);
  assert.match(ui,/disabled=\{!editTab\|\|!selected\.length\|\|busy\}/);
});
test('Styles are scoped to Stage 6, responsive, and cache-busted',()=>{
  assert.match(css,/\.pr-carton-v410/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/html\[data-theme="dark"\].*pr-carton-v410/);
  assert.match(page,/v410-project-kit-cartons-stage/);
  assert.doesNotMatch(read('components/preparing/ProjectBoxDistribution.jsx'),/pr-carton-v410/);
});
