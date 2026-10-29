import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { packableRows } from "../lib/preparing-box-visibility.mjs";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
test("Packing queue shows only components with Production stock and positive Available to Pack",()=>{
 const rows=[
 {name:"no stock",productionReceived:0,unpacked:0},
 {name:"completely packed",productionReceived:6,unpacked:0},
 {name:"free stock",productionReceived:5,unpacked:2},
 {name:"another free",productionReceived:2,unpacked:2},
 ];
 assert.deepEqual(packableRows(rows).map(x=>x.name),["free stock","another free"]);
 assert.deepEqual(packableRows([]),[]);
});
test("Boxes support long press, context menu, rename / Delete, and show history",()=>{
 const src=read("components/preparing/ProjectBoxDistribution.jsx");
 for(const pattern of [/onPointerDown/,/setTimeout\(/,/onContextMenu/,/Rename/,/Delete/,/boxDialog/,/action:"rename"/,/action:"cancel"/,/"rename"\]/,/packableRows\(items\)/])assert.match(src,pattern);
 const parsed=ts.createSourceFile("ProjectBoxDistribution.jsx",src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
});
test("Project carton rename permission and concurrency are validated server-side",()=>{
 const api=read("app/api/projects-preparing/project-cartons/route.js");
 const lib=read("lib/preparing-project-cartons.js");
 const sql=read("sql/2026-10-29-preparing-box-folder-actions-v250.sql");
 assert.match(api,/gate\("stage_update"\)/);
 assert.match(api,/rename:renameProjectCarton/);
 assert.match(lib,/erp_preparing_rename_project_carton_v250/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/Only Draft boxes may be renamed/);
 assert.match(sql,/changed_by_id/);
 assert.match(sql,/updated_at IS DISTINCT FROM p_expected_updated_at/);
 assert.match(sql,/action IN \('create','set_line','seal','allocate','reverse','cancel','rename'\)/);
 assert.match(read("lib/preparing-project-cartons.js"),/erp_preparing_cancel_project_carton/);
 assert.match(read("sql/2026-10-27-preparing-project-cartons-phase7.sql"),/Reverse every undispatched allocation before cancelling this carton/);
});
