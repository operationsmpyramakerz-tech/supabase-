import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingChange} from '../lib/preparing-project-testing-math.mjs';
const ts=createRequire(import.meta.url)('typescript');
const src=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ui=src('components/preparing/ProjectTesting.jsx');
const api=src('lib/preparing-project-testing.js');
const migration=src('sql/2026-10-28-preparing-testing-identity-and-remaining-v238.sql');
const css=src('public/css/projects-preparing.css');

test('quantity edit does not accept actor identity or technicianName from the client',()=>{
 const change=testingChange({id:'a',received:0,passed:0,failed:0,accepted:0},{received:'4',passed:'2',failed:'2',technicianName:'spoof'});
 assert.deepEqual(change,{itemId:'a',receivedDelta:4,passedDelta:2,failedDelta:2,expectedReceived:0,expectedPassed:0,expectedFailed:0});
 assert.equal('technicianName' in change,false);
 assert.match(api,/account\?\.name\|\|account\?\.username/);
 assert.match(api,/p_actor_name:actorName/);
 assert.match(api,/erp_preparing_project_testing_record_v238/);
 assert.doesNotMatch(api,/row\?\.technicianName/);
});
test('remaining is project required minus testing received, not unclassified intake',()=>{
 assert.match(ui,/Math\.max\(0,n\(row\.required\)-n\(row\.received\)\)/);
 assert.match(ui,/Remaining/);
 assert.match(ui,/remaining:a\.remaining\+remaining\(r\)/);
 assert.match(ui,/remaining\(r\),r\.accepted/);
 assert.doesNotMatch(ui,/"Not tested"/);
});
test('Tested By is read-only and only appears outside edit mode, with multiple participants',()=>{
 assert.match(ui,/!isEditing&&<div className="pr-pt-metric pr-pt-metric--testedBy"/);
 assert.match(ui,/\(r\.testedBy\|\|\[\]\)\.map\(person/);
 assert.match(ui,/key=\{person\.id\}/);
 assert.doesNotMatch(ui,/technicianName:String\(/);
 assert.doesNotMatch(ui,/type=\{isTechnician/);
});
test('audit history uses a separate card per component change and authenticated editor',()=>{
 assert.match(ui,/flatMap\(batch=>\(batch\.lines\|\|\[\]\)\.map/);
 assert.match(ui,/editor:batch\.createdByName/);
 assert.match(ui,/pr-pt-history-card/);
 assert.match(ui,/record\.editor\|\|"Legacy record \(name not recorded\)"/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS created_by_name text NOT NULL DEFAULT ''/);
 assert.match(migration,/SELECT DISTINCT ON \(b\.created_by_id\)/);
 assert.match(migration,/createdByName',b\.created_by_name/);
 assert.match(migration,/technician:=btrim\(p_actor_name\)/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.erp_preparing_project_testing_record_v238/);
});
test('responsive colorful UI retains functional inline edits and parses cleanly',()=>{
 assert.match(css,/\.pr-pt-stat--passed/);
 assert.match(css,/\.pr-pt-stat--failed/);
 assert.match(css,/\.pr-pt-stat--remaining/);
 assert.match(css,/\.pr-pt-history-grid/);
 assert.match(css,/@media\(max-width:580px\)/);
 assert.match(ui,/onClick=\{\(\)=>save\(\[r\.id\]\)\}/);
 for(const f of ['components/preparing/ProjectTesting.jsx','lib/preparing-project-testing.js','app/api/projects-preparing/testing/route.js']){
  const parsed=ts.createSourceFile(f,src(f),ts.ScriptTarget.Latest,true,f.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(parsed.parseDiagnostics,[],f);
 }
});
