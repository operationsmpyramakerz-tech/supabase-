import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {assembleSchoolProposalItems,warehouseTotals} from "../lib/preparing-warehouse-math.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
const sql=read("sql/2026-10-28-preparing-project-proposal-bom-phase11.sql");
const service=read("lib/preparing-service.js"),warehouse=read("lib/preparing-warehouse.js");
const ui=read("components/preparing/PreparingClient.jsx"),bomUI=read("components/preparing/ProjectMasterComponents.jsx");
const route=read("app/api/projects-preparing/warehouse/route.js");

test("new projects require Proposal and capture it with project in one transaction",()=>{
 assert.match(ui,/Source Proposal<PreparingSelect required/);
 assert.match(ui,/disabled=\{busy \|\| projectName\.trim\(\)\.length < 2 \|\| !projectSourceId\}/);
 assert.match(service,/erp_preparing_create_project_with_bom/);
 assert.match(service,/assembleProjectProposalItems\(source\.items\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_create_project_with_bom/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_projects/);
 assert.match(sql,/amount:=public\.erp_preparing_seed_project_bom\(output_id,p_items,p_member_id\)/);
});
test("project component editor has management gate and optimistic concurrency",()=>{
 assert.match(ui,/ProjectMasterComponents/);
 assert.match(ui,/allowed=\{canManage\}/);
 assert.match(route,/body.action==="edit_bom"/);
 assert.match(route,/body.action==="edit_kit"\?"manage"/);
 assert.match(warehouse,/erp_preparing_edit_project_bom/);
 assert.match(sql,/old_row\.updated_at IS DISTINCT FROM p_expected_updated_at/);
 assert.match(sql,/FROM public\.erp_preparing_projects WHERE id=p_project_id FOR UPDATE/);
 for(const op of ["add","update","delete"])assert.match(sql,new RegExp(`'${op}'`));
});
test("project BOM is independent from school demand, receipt, and delivery",()=>{
 assert.match(sql,/source_proposal_id IS NOT NULL/);
 assert.match(sql,/IF NOT EXISTS \(SELECT 1 FROM public\.erp_preparing_projects/);
 assert.match(sql,/IF history_exists THEN RAISE EXCEPTION 'Cannot delete/);
 assert.match(sql,/p_required_qty<reserved/);
 assert.doesNotMatch(sql,/UPDATE public\.erp_preparing_(components|shipments|manifests)|TRUNCATE|DROP TABLE/i);
 assert.match(bomUI,/Project required ·/);
 assert.match(bomUI,/Source Proposal/);
 assert.match(bomUI,/Confirm Remove/);
 const rows=assembleSchoolProposalItems([{productId:"M1",productName:"Motor",quantity:5},{productId:"M1",productName:"Motor",quantity:3}]);
 assert.equal(rows[0].qty,8);
 const totals=warehouseTotals([{id:"one",required_qty:8}],[{item_id:"one",accepted_delta:5,damaged_delta:1}],[{item_id:"one",delta_qty:2}]);
 assert.deepEqual([totals[0].required_qty,totals[0].accepted,totals[0].allocated,totals[0].available],[8,5,2,3]);
});
test("old projects can only attach source while warehouse is empty",()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_attach_project_proposal/);
 assert.match(sql,/Project warehouse already contains a BOM or movements/);
 assert.match(bomUI,/attach_proposal/);
 assert.match(route,/attachProjectProposal/);
});
test("changed JS and JSX parse",()=>{
 for(const name of ["components/preparing/PreparingClient.jsx","components/preparing/ProjectMasterComponents.jsx","components/preparing/ProjectWarehouseReceiving.jsx","app/api/projects-preparing/warehouse/route.js","app/projects-preparing/page.jsx","lib/preparing-service.js","lib/preparing-warehouse.js"]){
  const source=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,name.endsWith(".jsx")?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(source.parseDiagnostics.map(d=>d.messageText),[],name);
 }
});
