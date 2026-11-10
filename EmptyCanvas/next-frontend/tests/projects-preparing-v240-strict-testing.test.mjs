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
const initial={id:'x',tested:0,accepted:0};
test('new testing results require one non-negative whole number',()=>{
 const good=testingChange(initial,{tested:'8'});
 assert.equal(good.testedDelta,8);
 for(const invalid of ['-1','2.5','','abc'])assert.throws(()=>testingChange(initial,{tested:invalid}),/whole number/);
});
test('old incomplete quantities can be reviewed and corrected without rewriting history',()=>{
 const old={id:'x',tested:4,accepted:0};
 assert.equal(testingChange(old,{tested:'4'}),null);
 assert.deepEqual(testingChange(old,{tested:'5'}),{itemId:'x',testedDelta:1,expectedTested:4});
});
test('testing page removes entire Testing Record panel and only saves inline item edits',()=>{
 for(const gone of ['Testing Record','Report reference (optional)','Save All Changes','Batch, test conditions, or retest details','Saved under your signed-in ERP account']) assert.equal(ui.includes(gone),false,gone);
 assert.match(ui,/onClick=\{\(\)=>save\(\[r\.id\]\)\}/);
 assert.match(ui,/await request\("\/testing","POST",\{projectId,lines\}\)/);
 assert.match(ui,/rowError\[r\.id\]/);
 assert.match(ui,/setEditing\(old=>Object\.fromEntries/);
});
test('API and SQL reject invalid or stale tested totals',()=>{
 const next=src('sql/2026-11-10-preparing-tested-only-v384.sql');
 assert.match(svc,/expectedTested/);
 assert.match(next,/prior_tested<>\(entry->>'expectedTested'\)::bigint/);
 assert.match(next,/next_tested<0/);
 assert.match(next,/FOR UPDATE/);
 assert.match(next,/REVOKE ALL ON FUNCTION/);
 assert.match(svc,/QC-\$\{randomUUID\(\)\}/);
});
test('changed JS and JSX files parse cleanly',()=>{
 for(const file of ['components/preparing/ProjectTesting.jsx','lib/preparing-project-testing.js']){
  const a=ts.createSourceFile(file,src(file),ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(a.parseDiagnostics,[],file);
 }
});
