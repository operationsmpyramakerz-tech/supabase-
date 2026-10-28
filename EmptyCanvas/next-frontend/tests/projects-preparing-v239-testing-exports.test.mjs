import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingRemaining,testingGroups,TESTING_EXPORT_COLUMNS,testingExportValue} from '../lib/preparing-project-testing-grouping.mjs';
const ts=createRequire(import.meta.url)('typescript');
const src=n=>readFileSync(new URL(`../${n}`,import.meta.url),'utf8');

test('remaining equals testing received minus passed, failed stays in remaining',()=>{
 assert.equal(testingRemaining({required:100,received:40,passed:31,failed:9}),9);
 assert.equal(testingRemaining({required:100,received:40,passed:40,failed:0}),0);
 assert.equal(testingRemaining({required:100,received:0,passed:0,failed:0}),0);
});
test('kit groups preserve Proposal tag order and split per-Kit requirement without double-counting stock',()=>{
 const items=[{id:'a',name:'motor',required:30,received:9,passed:7,sourceKits:[{kitId:'g2',kitName:'G2',quantity:2},{kitId:'g3',kitName:'G3',quantity:1}]},{id:'b',name:'cable',required:12,sourceKits:[]}];
 const groups=testingGroups(items,[{kit_key:'id:g3',kit_name:'G3',sort_order:0},{kit_key:'id:g2',kit_name:'G2',sort_order:1}]);
 assert.deepEqual(groups.map(g=>g.name),['G3','G2','Unassigned Components']);
 assert.equal(groups[0].items[0].required,10);
 assert.equal(groups[1].items[0].required,20);
 assert.equal(groups[0].items[0].received,9);
 assert.equal(groups[2].items[0].required,12);
});
test('blank physical export keeps component and required, never auto-fills test results, tester or signature',()=>{
 const row={name:'Buzzer',code:'=command',required:12,received:7,passed:5,failed:2,testedBy:[{name:'Abdullah'}]};
 assert.equal(testingExportValue(row,'name',true),'Buzzer');
 assert.equal(testingExportValue(row,'required',true),'12');
 for(const key of ['received','passed','failed','remaining','testedBy','signature'])assert.equal(testingExportValue(row,key,true),'');
 assert.equal(testingExportValue(row,'remaining',false),'2');
 assert.equal(testingExportValue(row,'testedBy',false),'Abdullah');
 assert.deepEqual(new Set(TESTING_EXPORT_COLUMNS.map(c=>c.key)).size,9);
});
test('PDF uses view feature-gate and trusted server overview, no client-supplied rows',()=>{
 const route=src('app/api/projects-preparing/testing/export/route.js');
 assert.match(route,/featureGate\(await getDirectAccountGate\(\["Projects Preparing"\]\),"preparing.view"\)/);
 assert.match(route,/projectTestingOverview\(body.projectId\)/);
 assert.match(route,/testingExportValue\(row,col.key,body.blank\)/);
 assert.match(route,/Content-Disposition/);
 assert.doesNotMatch(route,/body\.items|body\.rows/);
 for(const f of ['app/api/projects-preparing/testing/export/route.js','lib/preparing-project-testing.js','components/preparing/ProjectTesting.jsx']){
  const p=ts.createSourceFile(f,src(f),ts.ScriptTarget.Latest,true,f.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(p.parseDiagnostics,[],f);
 }
});
test('Testing export modal supports selected columns, Kit group selection, printable PDF and CSV',()=>{
 const ui=src('components/preparing/ProjectTesting.jsx');
 assert.match(ui,/aria-label="Export components testing"/);
 assert.match(ui,/PDF · Blank sheet/);
 assert.match(ui,/CSV · Values/);
 assert.match(ui,/exportColumns/);
 assert.match(ui,/groupKeys:exportGroups/);
 assert.match(ui,/testingGroups\(shown,data.kitGroups\)/);
 assert.match(src('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=241/);
});
