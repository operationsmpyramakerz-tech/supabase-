import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {boxPackingTarget} from "../lib/preparing-production-math.mjs";
const require=createRequire(import.meta.url);const ts=require("typescript");
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),"utf8");
test("Box arithmetic is derived from Production Received and prevents overpacking",()=>{
 assert.deepEqual(boxPackingTarget(6,4,2,"3"),{packed:5,unpacked:1});
 assert.deepEqual(boxPackingTarget(6,4,2,"0"),{packed:2,unpacked:4});
 assert.throws(()=>boxPackingTarget(6,4,2,"5"),/cannot exceed Production Received/);
 for(const invalid of ["","2.1","-1","Infinity","NaN"])assert.throws(()=>boxPackingTarget(6,2,1,invalid),/whole number/);
});
test("Production Received tab has only receiving columns, while box tab owns Packed and Unpacked",()=>{
 const ui=read("components/preparing/ProjectProductionReceiving.jsx");
 const box=read("components/preparing/ProjectBoxDistribution.jsx");
 const receive=ui.match(/pr-production-receipt-metrics[\s\S]*?pr-production-actions/);
 assert.ok(receive,"Receiving row markup was not found");
 assert.doesNotMatch(receive[0],/<small>Packed<\/small>|<small>Unpacked<\/small>/);
 assert.match(ui,/Receiving History/);assert.match(ui,/Box History/);
 assert.match(box,/Available to Pack/);assert.match(box,/Unpacked/);assert.match(box,/Packed in selected box/);
 assert.match(box,/request\("\/production","POST",\{action:"pack"/);
 assert.match(box,/changed_by_name/);
});
test("Independent carton movement audit and verified ERP actor are protected by server-side SQL",()=>{
 const sql=read("sql/2026-10-29-preparing-production-box-distribution-v249.sql");
 const api=read("app/api/projects-preparing/production/route.js");
 const helper=read("lib/preparing-production.js");
 const carton=read("lib/preparing-project-cartons.js");
 assert.match(sql,/erp_preparing_set_project_carton_line\(/);
 assert.match(sql,/changed_by_name=btrim\(p_actor_name\)/);
 assert.match(sql,/Cannot unpack units already allocated to a school/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.erp_preparing_production_pack_v249/);
 assert.match(api,/preparingStage(?:Gate|Allowed)/);
 assert.match(helper,/identity\(account\)/);assert.match(helper,/p_actor_name:name/);
 assert.match(carton,/"box audit"/);
});
test("Export is separated by receiving and box distribution and new JSX parses",()=>{
 const source=read("app/api/projects-preparing/production/export/route.js");
 assert.match(source,/scope==="boxes"/);assert.match(source,/const boxKeys=/);
 for(const file of ["components/preparing/ProjectProductionReceiving.jsx","components/preparing/ProjectBoxDistribution.jsx"]){
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],file);
 }
});
