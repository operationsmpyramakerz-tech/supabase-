import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {reconciliationBalance} from "../lib/preparing-reconciliation-math.js";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
const sql=read("sql/2026-10-27-preparing-reconciliation-phase8.sql");
const api=read("app/api/projects-preparing/reconciliation/route.js");
const service=read("lib/preparing-reconciliation.js");
const ui=read("components/preparing/ReturnsReplacements.jsx");
const shell=read("components/preparing/PreparingClient.jsx");

test("net accepted balance subtracts signed returns, and reservation prevents double compensation",()=>{
 assert.deepEqual(reconciliationBalance(10,8,0,2),{planned:10,gross:8,returned:0,net:8,reserved:2,outstanding:0,overReceived:0});
 assert.deepEqual(reconciliationBalance(10,10,3,1),{planned:10,gross:10,returned:3,net:7,reserved:1,outstanding:2,overReceived:0});
 assert.equal(reconciliationBalance(10,12,1).overReceived,1);
});
test("additive and atomic migration without mutating historic signed receipts",()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.erp_preparing_delivery_returns|UPDATE public\.erp_preparing_shipment_lines\s+SET received_qty/i);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_delivery_returns/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_replacement_batches/);
});
test("RLS and explicit service-only grant for append-only reconciliation metadata",()=>{
 for(const table of ["erp_preparing_delivery_returns","erp_preparing_replacement_batches","erp_preparing_reconciliation_audit"]){
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
 }
 assert.match(sql,/REVOKE ALL ON public\.erp_preparing_delivery_returns.*FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/trg_prep_returns_immutable/);
 assert.match(sql,/trg_prep_replacements_immutable/);
 assert.match(sql,/TO service_role/);
});
test("return is tied to a real signed receipt, cannot exceed accepted units, and invalidates stale closing checks",()=>{
 const fn=sql.split("CREATE OR REPLACE FUNCTION public.erp_preparing_record_school_return(")[1].split("END; $$;")[0];
 assert.match(fn,/erp_preparing_schools WHERE id=p_school_id FOR UPDATE/);
 assert.match(fn,/status='delivered' AND btrim\(receipt_reference\)<>''/);
 assert.match(fn,/returned\+p_quantity>line_row\.received_qty/);
 assert.match(fn,/custody_settlement','closing_archive/);
 assert.match(fn,/erp_preparing_closing_audit/);
 assert.match(fn,/INSERT INTO public\.erp_preparing_delivery_returns/);
});
test("replacement is limited by outstanding net qty, other original shipments must be received first",()=>{
 const fn=sql.split("CREATE OR REPLACE FUNCTION public.erp_preparing_create_replacement_batch(")[1].split("END; $$;")[0];
 assert.match(fn,/erp_preparing_schools WHERE id=p_school_id FOR UPDATE/);
 assert.match(fn,/status IN \('draft','dispatched'\)/);
 assert.match(fn,/received-returned\+reserved\+p_quantity>planned/);
 assert.match(fn,/stage_key IN \('delivery','delivery_closing','installation','testing','final_closing'\)/);
 assert.match(fn,/INSERT INTO public\.erp_preparing_shipments/);
 assert.match(fn,/INSERT INTO public\.erp_preparing_shipment_lines/);
});
test("replacement is immutable to legacy pack and cancel, cancellation only before dispatch",()=>{
 assert.match(sql,/trg_prep_replacement_line_guard/);
 assert.match(sql,/trg_prep_replacement_batch_guard/);
 const cancel=sql.split("CREATE OR REPLACE FUNCTION public.erp_preparing_cancel_replacement_batch(")[1].split("END; $$;")[0];
 assert.match(cancel,/batch\.status<>'draft'/);
 assert.match(cancel,/DELETE FROM public\.erp_preparing_shipment_lines/);
 assert.match(cancel,/erp_preparing_reconciliation_audit/);
});
test("latest stage and final-close RPCs check net delivered, do not rewrite receipt history",()=>{
 const stage=sql.split("CREATE OR REPLACE FUNCTION public.erp_preparing_save_stage(")[1].split("END; $$;")[0];
 const close=sql.split("CREATE OR REPLACE FUNCTION public.erp_preparing_finalize_school(")[1].split("END; $$;")[0];
 for(const f of [stage,close]){assert.match(f,/erp_preparing_delivery_returns/);assert.match(f,/s\.status='delivered'/);}
 assert.match(stage,/current_position=6/);
 assert.match(close,/Seven-day review/);
});
test("route checks both page and granular permissions",()=>{
 assert.match(api,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
 assert.match(api,/access\("view"\)/);
 assert.match(api,/access\("stage_update"\)/);
 assert.match(service,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(api,/private, no-store/);
});
test("school screen exposes reconciliation and original delivery handover separately",()=>{
 assert.match(shell,/ReturnsReplacements/);
 assert.match(shell,/Open Reconciliation/);
 assert.match(ui,/Open Delivery/);
 assert.match(ui,/signed/);
 assert.match(ui,/replacement/);
});
test("project dashboard and school delivery show NET received after physical returns",()=>{
 assert.match(read("lib/preparing-report-service.js"),/erp_preparing_delivery_returns/);
 assert.match(read("lib/preparing-reports.js"),/grossSignedQty-returnedQty/);
 assert.match(read("components/preparing/ProjectDashboard.jsx"),/Net school received/);
 assert.match(read("components/preparing/PackingDelivery.jsx"),/returnedByComponent/);
});
test("modified TSX files have no parse errors",()=>{
 for(const file of ["components/preparing/PreparingClient.jsx","components/preparing/ReturnsReplacements.jsx","components/preparing/PackingDelivery.jsx","components/preparing/ProjectDashboard.jsx"]){
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(source.parseDiagnostics.map(d=>String(d.messageText)),[],file);
 }
});
