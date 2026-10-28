import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { warehouseTotals, demandsForSchool, assembleSchoolProposalItems,componentKey } from "../lib/preparing-warehouse-math.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const sql=read("sql/2026-10-28-preparing-central-warehouse-phase10.sql");
const service=read("lib/preparing-warehouse.js"),route=read("app/api/projects-preparing/warehouse/route.js");
const ui=read("components/preparing/ProjectWarehouseReceiving.jsx");
const shell=read("components/preparing/PreparingClient.jsx"),registry=read("lib/feature-permissions-registry.js");

test("warehouse master BOM collapses repeat product identities, keeps different product IDs separate",()=>{
 const items=assembleSchoolProposalItems([{productId:"SKU-5",productName:"DC Motor",quantity:3},{productId:"SKU-5",productName:"DC Motor",quantity:2},{productId:"SKU-6",productName:"DC Motor",quantity:4}]);
 assert.equal(items.length,2);assert.equal(items[0].qty,5);assert.equal(items[1].qty,4);
 assert.equal(componentKey("", "Plastic   Propeller"),"name:plastic propeller");
 assert.throws(()=>assembleSchoolProposalItems([{productName:"Bad count",quantity:-1}]));
});
test("warehouse received is independent from school delivered or individual QC",()=>{
 const rows=warehouseTotals([{id:"c1",required_qty:20},{id:"c2",required_qty:3}],
   [{item_id:"c1",accepted_delta:15,damaged_delta:2},{item_id:"c1",accepted_delta:5,damaged_delta:0},{item_id:"c2",accepted_delta:1,damaged_delta:1}],
   [{item_id:"c1",school_id:"s1",delta_qty:12},{item_id:"c1",school_id:"s2",delta_qty:8},{item_id:"c1",school_id:"s2",delta_qty:-3}]);
 assert.deepEqual(rows.map(r=>[r.accepted,r.damaged,r.allocated,r.available]),[[20,2,17,3],[1,1,0,1]]);
 const demand=demandsForSchool([{item_id:"c1",school_id:"s2",required_qty:10},{item_id:"c1",school_id:"s1",required_qty:12}],
 [{item_id:"c1",school_id:"s2",delta_qty:8},{item_id:"c1",school_id:"s2",delta_qty:-3}],"s2");
 assert.equal(demand[0].allocated,5);
});
test("new SQL only adds warehouse tables; standalone transaction, separate from school receipt",()=>{
 assert.match(sql,/^BEGIN;\s*$/m);assert.match(sql,/^COMMIT;\s*$/m);
 for(const name of ["items","demands","receipts","receipt_lines","allocations"]){
  assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS public\\.erp_preparing_warehouse_${name}`));
  assert.match(sql,new RegExp(`ALTER TABLE public\\.erp_preparing_warehouse_${name} ENABLE ROW LEVEL SECURITY`));
 }
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|UPDATE public\.erp_preparing_components|UPDATE public\.erp_preparing_shipments|UPDATE public\.stocktaking/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.erp_preparing_warehouse_allocate/);
});
test("project-level row lock prevents over-issue and receipt correction beneath allocations",()=>{
 for(const fn of ["warehouse_capture","warehouse_receive","warehouse_allocate"]){
  const section=sql.split(`CREATE OR REPLACE FUNCTION public.erp_preparing_${fn}(`)[1];
  assert.ok(section,`missing ${fn}`);assert.match(section.slice(0,3200),/FROM public\.erp_preparing_projects WHERE id=p_project_id FOR UPDATE/);
 }
 assert.match(sql,/prior_good\+good<reserved/);
 assert.match(sql,/school_balance\+p_delta>school_limit/);
 assert.match(sql,/total_allocated\+p_delta>total_good/);
 assert.match(sql,/CONTINUE; END IF;/);
});
test("feature-gated API exposes read to viewer, write by warehouse rights and no anonymous access",()=>{
 assert.match(route,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
 assert.match(route,/gate\("view"\)/);
 assert.match(route,/"warehouse_allocate"/);
 assert.match(route,/"warehouse_receive"/);
 assert.match(route,/"Cache-Control":"private, no-store"/);
 assert.match(service,/SUPABASE_SERVICE_ROLE_KEY/);
 for(const feature of ["preparing.warehouse_receive","preparing.warehouse_allocate"])assert.match(registry,new RegExp(feature.replace(".","\\.")));
});
test("project root links warehouse before project cartons; school component receiving stays separate",()=>{
 assert.match(shell,/ProjectWarehouseReceiving/);
 assert.match(shell,/Warehouse Receiving/);
 assert.ok(shell.indexOf("Warehouse Receiving") < shell.indexOf("Project Kit Cartons</strong>"));
 assert.doesNotMatch(service,/erp_preparing_update_component|erp_preparing_receive_shipment/);
 assert.match(ui,/School Allocation/);assert.match(ui,/Warehouse Receiving/);assert.match(ui,/Movement History/);
});
test("new/updated JSX parses without diagnostics",()=>{
 for(const file of ["components/preparing/ProjectWarehouseReceiving.jsx","components/preparing/PreparingClient.jsx","app/projects-preparing/page.jsx"]){
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[],file);
 }
 assert.match(read("app/projects-preparing/page.jsx"),/projects-preparing\.css\?v=238/);
});
