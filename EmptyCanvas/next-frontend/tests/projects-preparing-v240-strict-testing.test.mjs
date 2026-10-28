import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingChange} from '../lib/preparing-project-testing-math.mjs';
const ts=createRequire(import.meta.url)('typescript');
const src=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=src('components/preparing/ProjectTesting.jsx');
const svc=src('lib/preparing-project-testing.js');
const sql=src('sql/2026-10-29-preparing-testing-strict-quantities-v240.sql');
const initial={id:'x',received:0,passed:0,failed:0,accepted:0};
test('new testing results require Passed + Failed exactly equal Testing Received',()=>{
 const good=testingChange(initial,{received:'8',passed:'5',failed:'3'});
 assert.deepEqual([good.receivedDelta,good.passedDelta,good.failedDelta],[8,5,3]);
 assert.throws(()=>testingChange(initial,{received:'8',passed:'4',failed:'3'}),/Passed \+ Failed must equal Testing Received/);
 assert.throws(()=>testingChange(initial,{received:'8',passed:'6',failed:'3'}),/Passed \+ Failed must equal Testing Received/);
 assert.throws(()=>testingChange(initial,{received:'8',passed:'2.5',failed:'5.5'}),/whole numbers/);
});
test('old incomplete quantities can be reviewed and corrected without rewriting history',()=>{
 const old={id:'x',received:4,passed:2,failed:1,accepted:0};
 assert.throws(()=>testingChange(old,{received:'4',passed:'2',failed:'1'}),/Passed \+ Failed must equal/);
 const correction=testingChange(old,{received:'4',passed:'2',failed:'2'});
 assert.deepEqual([correction.receivedDelta,correction.passedDelta,correction.failedDelta],[0,0,1]);
});
test('testing page removes entire Testing Record panel and only saves inline item edits',()=>{
 for(const gone of ['Testing Record','Report reference (optional)','Save All Changes','Batch, test conditions, or retest details','Saved under your signed-in ERP account']) assert.equal(ui.includes(gone),false,gone);
 assert.match(ui,/onClick=\{\(\)=>save\(\[r\.id\]\)\}/);
 assert.match(ui,/await request\("\/testing","POST",\{projectId,lines\}\)/);
 assert.match(ui,/rowError\[r\.id\]/);
 assert.match(ui,/setEditing\(old=>Object\.fromEntries/);
});
test('API and SQL reject mismatched totals without changing previous stored records',()=>{
 assert.match(svc,/newPassed\+newFailed!==newReceived/);
 assert.match(sql,/new_passed\+new_failed<>new_received/);
 assert.match(sql,/Passed \+ Failed must equal Testing Received/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(sql,/TRUNCATE|DELETE FROM|DROP TABLE|UPDATE public\.erp_preparing_project_test_lines/i);
 assert.match(svc,/QC-\$\{randomUUID\(\)\}/);
});
test('changed JS and JSX files parse cleanly',()=>{
 for(const file of ['components/preparing/ProjectTesting.jsx','lib/preparing-project-testing.js']){
  const a=ts.createSourceFile(file,src(file),ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(a.parseDiagnostics,[],file);
 }
});
