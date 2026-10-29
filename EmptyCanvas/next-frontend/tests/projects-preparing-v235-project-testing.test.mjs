import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {testingChange} from "../lib/preparing-project-testing-math.mjs";
const ts=createRequire(import.meta.url)("typescript");
const file=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const migration=file("sql/2026-10-28-preparing-project-testing-v235.sql");
const ui=file("components/preparing/ProjectTesting.jsx");
const shell=file("components/preparing/PreparingClient.jsx");
const server=file("lib/preparing-project-testing.js");
const route=file("app/api/projects-preparing/testing/route.js");
test("testing intake can be saved before any warehouse receipt, with technician",()=>{
 const row={id:"item-1",required:20,received:0,accepted:0,passed:0,failed:0};
 assert.deepEqual(testingChange(row,{received:"10",passed:"6",failed:"4"}),
  {itemId:"item-1",receivedDelta:10,passedDelta:6,failedDelta:4,expectedReceived:0,expectedPassed:0,expectedFailed:0});
 assert.equal(testingChange({...row,received:10,passed:6,failed:4},{received:"10",passed:"6",failed:"4"}),null);
 assert.deepEqual(testingChange({...row,received:10,passed:6,failed:4},{received:"10",passed:"8",failed:"2"}).failedDelta,-2);
 assert.throws(()=>testingChange(row,{received:"4",passed:"4",failed:"1"}));
 assert.throws(()=>testingChange(row,{received:"10",passed:"1.5",failed:"0"}));

 assert.throws(()=>testingChange({...row,received:10,passed:8,accepted:6},{received:"10",passed:"5",failed:"0"}));
});
test("testing persists append-only reports independent from school deliveries",()=>{
 for(const t of ["erp_preparing_project_test_batches","erp_preparing_project_test_lines"])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.erp_preparing_project_testing_record/);
 assert.match(migration,/FROM public\.erp_preparing_projects WHERE id=p_project_id AND deleted_at IS NULL FOR UPDATE/);
 assert.match(migration,/new_passed\+new_failed>accepted/);
 assert.match(migration,/prior_passed <> \(entry->>'expectedPassed'\)/);
 assert.match(migration,/tr_preparing_testing_receipt_guard/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.erp_preparing_project_testing_record.*TO service_role/);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|UPDATE public\.erp_preparing_warehouse_receipt_lines|UPDATE public\.erp_preparing_schools|UPDATE public\.stocktaking/i);
});
test("project testing route is strictly feature-gated",()=>{
 assert.match(route,/gate\("view"\)/);assert.match(route,/gate\("stage_update"\)/);
 assert.match(route,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
 assert.match(server,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(route,/"Cache-Control":"private, no-store"/);
});
test("testing is a separate project-level screen like warehouse receiving",()=>{
 assert.match(shell,/ProjectTesting/);
 assert.ok(shell.indexOf("Project Testing</strong>")<shell.indexOf("Warehouse Receiving</strong>"));
 assert.ok(shell.indexOf("Warehouse Receiving</strong>")<shell.indexOf("Project Kit Cartons</strong>"));
 for(const label of ["Passed","Failed","Remaining","Testing History","Export"]){
  assert.ok(ui.includes(label),label);
 }
 assert.doesNotMatch(ui,/Testing Record|Report reference \(optional\)|Save All Changes/);
});
test("new server and JSX files parse cleanly",()=>{
 for(const name of ["components/preparing/ProjectTesting.jsx","components/preparing/PreparingClient.jsx","app/api/projects-preparing/testing/route.js","lib/preparing-project-testing.js"]){
  const parsed=ts.createSourceFile(name,file(name),ts.ScriptTarget.Latest,true,name.endsWith(".jsx")?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
 assert.match(file("app/projects-preparing/page.jsx"),/projects-preparing\.css\?v=247/);
});
