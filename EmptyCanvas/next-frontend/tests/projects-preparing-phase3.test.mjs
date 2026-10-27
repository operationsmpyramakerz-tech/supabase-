import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PREPARING_STAGES } from "../lib/preparing-workflow.js";
const file = path => readFileSync(new URL(path,import.meta.url),"utf8");
const sql=file("../sql/2026-10-27-preparing-delivery-phase3.sql");
const api=file("../app/api/projects-preparing/shipments/route.js");
const service=file("../lib/preparing-service.js");
const ui=file("../components/preparing/PackingDelivery.jsx");
const main=file("../components/preparing/PreparingClient.jsx");
test("phase 3 keeps operations delivery stages 4–6 separate from technical follow-up",()=>{
  assert.deepEqual(PREPARING_STAGES.slice(3,6).map(x=>x.key),["packing","delivery","delivery_closing"]);
  assert.equal(PREPARING_STAGES[6].team,"followup");
});
test("shipments API requires view to read and stage_update to mutate",()=>{
  assert.match(api,/access\("view"\)/);
  assert.equal((api.match(/access\("stage_update"\)/g)||[]).length,2);
  assert.match(api,/const actions=\{/);
  assert.match(api,/Cache-Control/);
});
test("SQL preserves Phase 2 BOM and provides constrained packing and signed receipt",()=>{
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_shipments/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_shipment_lines/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.erp_preparing_receive_shipment/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.erp_preparing_receive_shipment/);
  assert.match(sql,/FOR UPDATE/g);
  assert.match(sql,/others\+p_quantity>component_row\.prepared_qty/);
  assert.match(sql,/p_expected_updated_at::timestamptz/);
  assert.match(sql,/INSERT INTO public\.erp_preparing_shipping_audit/g);
  assert.match(sql,/signed handover reference/);
  assert.match(sql,/receipt_reference/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_cancel_draft_shipment/);
  assert.match(sql,/stage_key='preparing' AND status='completed'/);
  assert.match(sql,/status='cancelled'/);
  assert.match(sql,/status IN \('draft','dispatched','delivered','cancelled'\)/);
  assert.match(sql,/ELSIF current_position=4 THEN/);assert.match(sql,/ELSIF current_position=5 THEN/);assert.match(sql,/ELSIF current_position=6 THEN/);
});
test("packing workflow has explicit create, pack, dispatch, and receive actions",()=>{
  for(const name of ["createPreparingShipment","packPreparingComponent","dispatchPreparingShipment","receivePreparingShipment"])
    assert.match(service,new RegExp(`export async function ${name}\\(`));
  assert.match(service,/offset:String\(offset\)/);
  assert.match(ui,/action:"pack"/);assert.match(ui,/action:"cancel"/);assert.match(ui,/action:"dispatch"/);assert.match(ui,/action:"receive"/);
  assert.match(ui,/Export reconciliation CSV/);
  assert.match(main,/PackingDelivery/);assert.match(main,/name:"Packing & Delivery", icon:"truck", open:\(\)=>setShowDelivery\(true\)/);
});
