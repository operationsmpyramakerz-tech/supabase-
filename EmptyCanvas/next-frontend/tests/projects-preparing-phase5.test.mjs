import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CLOSING_CHECKS,CLOSING_STATES,closingSummary} from "../lib/preparing-closing.js";
import {PREPARING_STAGES} from "../lib/preparing-workflow.js";
const source=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=source("../sql/2026-10-27-preparing-final-closing-phase5.sql");
const service=source("../lib/preparing-service.js");
const route=source("../app/api/projects-preparing/closing/route.js");
const ui=source("../components/preparing/FinalSchoolClosing.jsx");
const client=source("../components/preparing/PreparingClient.jsx");
const registry=source("../lib/feature-permissions-registry.js");

test("exactly six distinct documented closing checks",()=>{
  assert.equal(CLOSING_CHECKS.length,6);
  assert.equal(new Set(CLOSING_CHECKS.map(x=>x.key)).size,6);
  assert.deepEqual(CLOSING_STATES,["pending","verified","blocked"]);
  assert.deepEqual(closingSummary([{check_key:"signed_handover",status:"verified"},{check_key:"grace_review",status:"blocked"}],null),
    {verified:1,total:6,blocked:1,approved:false});
  assert.equal(PREPARING_STAGES.at(-1).key,"final_closing");
});
test("migration creates server-only tables with auditable atomic approval",()=>{
  assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
  for(const table of ["checks","approval","audit"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS public\\.erp_preparing_closing_${table}`));
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY;/g)||[]).length,3);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/g);
  assert.match(sql,/TO service_role/g);
  for(const rpc of ["erp_preparing_save_closing_check","erp_preparing_finalize_school","erp_preparing_reopen_school"]){
    assert.match(sql,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
    assert.match(sql,new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}`));
  }
  assert.match(sql,/FOR UPDATE/g);
  assert.match(sql,/p_expected_updated_at::timestamptz/);
  assert.match(sql,/updated_by_id/);
  assert.match(sql,/INSERT INTO public\.erp_preparing_closing_audit/g);
});
test("closing cannot skip stages, delivery, seven day grace, technical approval, or open issues",()=>{
  assert.match(sql,/stage_key IN \('receiving','quality','preparing','packing','delivery','delivery_closing','installation','testing'\)/);
  assert.match(sql,/<>8/);
  assert.match(sql,/count\(\*\) FROM public\.erp_preparing_closing_checks WHERE school_id=p_school_id AND status='verified'/);
  assert.match(sql,/<>6/);
  assert.match(sql,/check_key='signed_handover'/);
  assert.match(sql,/verified_on \+ 7/);
  assert.match(sql,/received_qty/);
  assert.match(sql,/erp_preparing_technical_acceptance/);
  assert.match(sql,/erp_preparing_technical_issues/);
  assert.match(sql,/status<>'resolved'/);
  assert.match(sql,/'final_closing','completed'/);
  assert.match(sql,/Use the dedicated Final Closing approval or reopening workflow/);
  assert.match(sql,/previous_approval/);
});
test("Final Closing independent server permission and guarded stage mutations",()=>{
  assert.match(route,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
  assert.match(route,/access\("view"\)/);
  assert.match(route,/"stage_update"/);
  assert.match(route,/"close"/);
  assert.match(route,/body\.action==="finalize"\|\|body\.action==="reopen"/);
  assert.match(route,/Cache-Control/);
  assert.match(registry,/"key": "preparing.close"/);
  assert.match(registry,/"preparing.stage_update", "preparing.close"/);
  assert.match(service,/if \(stageKey === "final_closing"\) fail/);
  assert.match(service,/erp_preparing_finalize_school/);
  assert.match(service,/erp_preparing_reopen_school/);
});
test("UI has approval/reopening controls and prevents manual stage completion",()=>{
  assert.match(client,/FinalSchoolClosing/);
  assert.match(client,/Open Closing/);
  assert.match(client,/canApprove=\{canClose\}/);
  assert.match(client,/currentStage.key !== "final_closing"/);
  assert.match(ui,/Approve & Close School/);
  assert.match(ui,/Reopen School/);
  assert.match(ui,/action:"finalize"/);
  assert.match(ui,/action:"reopen"/);
  assert.match(ui,/action:"check"/);
  assert.match(ui,/Signed handover date/);
  assert.match(ui,/graceDate/);
});
