import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const ts=createRequire(import.meta.url)("typescript");
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
const sql=read("sql/2026-10-28-preparing-testing-before-receiving-v236.sql");
const view=read("components/preparing/ProjectTesting.jsx");
const api=read("lib/preparing-project-testing.js");
const css=read("public/css/projects-preparing.css");
test("v236 schema retains old testing history and adds per-item technician",()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS received_delta integer/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS technician_name text/);
 assert.match(sql,/erp_preparing_project_test_legacy_intake/);
 assert.match(sql,/ON CONFLICT \(item_id\) DO NOTHING/);
 assert.doesNotMatch(sql,/TRUNCATE |DELETE FROM public\.erp_preparing_project_test|DROP TABLE /i);
});
test("testing no longer requires prior warehouse receipt",()=>{
 assert.match(sql,/new_passed\+new_failed>new_received/);
 assert.match(sql,/new_passed<prior_passed AND new_passed<warehouse_accepted/);
 assert.match(sql,/NEW\.accepted_delta>0 AND total_accepted>greatest\(old_accepted,passed_total\)/);
 assert.match(sql,/Test Received must cover Passed and Failed quantities/);
 assert.match(view,/Testing Received/);
 assert.match(view,/Received for Testing/);
 assert.match(view,/Technician/);
});
test("the route validates actual user, three quantity deltas and technician",()=>{
 assert.match(api,/actor=String\(account\?\.id/);
 assert.match(api,/receivedDelta/);
 assert.match(api,/expectedReceived/);
 assert.match(api,/technicianName/);
 assert.match(read("app/api/projects-preparing/testing/route.js"),/gate\("stage_update"\)/);
});
test("test fields remain inline and responsive",()=>{
 assert.match(view,/aria-label=\{`Testing received/);
 assert.match(view,/aria-label=\{`Technician/);
 assert.match(css,/@media\(max-width:520px\)/);
 for(const file of ["components/preparing/ProjectTesting.jsx","components/preparing/PreparingClient.jsx","lib/preparing-project-testing.js","app/api/projects-preparing/testing/route.js"]){
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith(".jsx")?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(parsed.parseDiagnostics,[],file);
 }
});
