import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
const source=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const page=source("components/preparing/PreparingClient.jsx");
const wh=source("components/preparing/ProjectWarehouseReceiving.jsx");
const header=source("components/HeaderSearch.jsx");

test("Projects and schools use the AppShell search bar instead of duplicated inputs",()=>{
 assert.match(header,/system-header-search__input/);
 assert.match(page,/document.querySelector\("\.classic-app-shell \.main-header \.system-header-search__input"\)/);
 assert.match(page,/input.addEventListener\("input", onInput\)/);
 assert.match(page,/input.removeEventListener\("input", onInput\)/);
 assert.match(page,/Search projects\.\.\./);
 assert.match(page,/Search schools\.\.\./);
 assert.doesNotMatch(page,/aria-label="Search projects"/);
 // v300 uses only the AppShell search. The duplicate school-tab input is gone.
 assert.doesNotMatch(page,/aria-label="Search schools"/);
 assert.doesNotMatch(page,/pr-project-school-search|pr-project-view-switch/);
 assert.doesNotMatch(page,/aria-label="Refresh projects"/);
 assert.match(page,/setSchoolId\(id\); setQuery\(""\)/);
});
test("Warehouse Edit remains clickable and explains missing receiving access without bypassing server permissions",()=>{
 assert.match(wh,/disabled=\{busy\} title=\{!canReceive/);
 assert.match(wh,/if\(!canReceive\)/);
 assert.match(wh,/preparing\.warehouse_receive in Users Center/);
 assert.match(wh,/enableReceipt\(row\)/);
 const api=source("app/api/projects-preparing/warehouse/route.js");
 assert.match(api,/body.action==="receive"\?"warehouse_receive"/);
 assert.match(api,/gate\(permission\)/);
});
test("Changed JSX remains parseable",()=>{
 for(const name of ["PreparingClient","ProjectWarehouseReceiving"]){
  const s=source(`components/preparing/${name}.jsx`);
  const parsed=ts.createSourceFile(`${name}.jsx`,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
});
