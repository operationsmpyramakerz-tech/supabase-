import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {productionBalance,productionReceiptDelta} from "../lib/preparing-production-math.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
test("Production totals are separate from warehouse and physical carton counts",()=>{
 assert.deepEqual(productionBalance(12,7,3),{warehouseReceived:12,productionReceived:7,packedQty:3,availableToProduction:5,unpacked:4});
 assert.equal(productionReceiptDelta(0,"8",10,0),8);
 assert.equal(productionReceiptDelta(8,"6",10,3),-2);
 assert.throws(()=>productionReceiptDelta(8,"11",10,0),/Warehouse Received/);
 assert.throws(()=>productionReceiptDelta(8,"2",10,3),/packed into boxes/);
 assert.throws(()=>productionReceiptDelta(0,"1.2",10,0),/whole number/);
});
test("Production API enforces ERP feature authorization and verified receiver identity",()=>{
 const api=read("app/api/projects-preparing/production/route.js"),server=read("lib/preparing-production.js");
 assert.match(api,/gate\("stage_update"\)/);assert.match(api,/gate\("view"\)/);
 assert.match(server,/identity\(account\)/);assert.match(server,/p_actor_name:name/);
 assert.match(server,/p_expected_total:expected/);
});
test("Additive SQL enforces stage boundaries, carton packing and historical receipts",()=>{
 const sql=read("sql/2026-10-29-preparing-production-receiving-v247.sql");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_production_handoffs/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_production_handoff_v247/);
 assert.match(sql,/p_new_total>warehouse_qty/);
 assert.match(sql,/p_new_total<packed_qty/);
 assert.match(sql,/prep_prod_warehouse_guard_v247/);
 assert.match(sql,/prep_prod_box_guard_v247/);
 assert.match(sql,/REVOKE ALL ON public\.erp_preparing_production_handoffs FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(sql,/DELETE FROM public\.erp_preparing_warehouse_receipts/);
});
test("Project tool order and production tabs, exports and sheet are wired",()=>{
 const main=read("components/preparing/PreparingClient.jsx"),ui=read("components/preparing/ProjectProductionReceiving.jsx");
 assert.ok(main.indexOf("Warehouse Receiving</strong>")<main.indexOf("Production Receiving</strong>"));
 assert.ok(main.indexOf("Production Receiving</strong>")<main.indexOf("Project Kit Cartons</strong>"));
 assert.match(main,/showProduction &&/);assert.match(ui,/Box Distribution/);
 for(const label of ["CSV · Values","CSV · Blank","PDF · Values","PDF · Blank","Movement History","Production Received","Available for Production"]){assert.ok(ui.includes(label),label);}
 for(const f of ["components/preparing/PreparingClient.jsx","components/preparing/ProjectProductionReceiving.jsx"]){const parsed=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);assert.deepEqual(parsed.parseDiagnostics,[],f);}
});
