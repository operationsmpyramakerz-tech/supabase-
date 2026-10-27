import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TECHNICAL_CHECKPOINTS, technicalSummary, ISSUE_STATES } from "../lib/preparing-technical.js";
import { PREPARING_STAGES } from "../lib/preparing-workflow.js";
const file = p=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=file("../sql/2026-10-27-preparing-technical-phase4.sql");
const api=file("../app/api/projects-preparing/technical/route.js");
const service=file("../lib/preparing-service.js");
const ui=file("../components/preparing/TechnicalFollowUp.jsx");
const main=file("../components/preparing/PreparingClient.jsx");

test("phase 4 maintains technical team execution distinct from Operations follow-up",()=>{
  assert.deepEqual(PREPARING_STAGES.slice(6).map(r=>r.team),["followup","followup","followup"]);
  assert.equal(TECHNICAL_CHECKPOINTS.filter(r=>r.phase==="installation").length,4);
  assert.equal(TECHNICAL_CHECKPOINTS.filter(r=>r.phase==="testing").length,4);
  assert.equal(new Set(TECHNICAL_CHECKPOINTS.map(r=>r.key)).size,8);
});
test("pure technical completion and issue summary",()=>{
  const summary=technicalSummary([{milestone_key:"site_ready",status:"completed"},
    {milestone_key:"power_on",status:"blocked"}],[{status:"open"},{status:"resolved"}],null);
  assert.equal(summary.installed,1);assert.equal(summary.tested,0);assert.equal(summary.openIssues,1);
  assert.equal(summary.accepted,false);
  assert.deepEqual(ISSUE_STATES,["open","in_progress","resolved"]);
});
test("technical API has a server-side Page Access and feature gate for all methods",()=>{
  assert.match(api,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
  assert.match(api,/access\("view"\)/);
  assert.equal((api.match(/access\("stage_update"\)/g)||[]).length,2);
  assert.match(api,/Cache-Control/);
  for(const name of ["updateTechnicalCheckpoint","createTechnicalIssue","updateTechnicalIssue","recordTechnicalAcceptance"])
    assert.match(api,new RegExp(name));
});
test("migration protects tables and mutation RPCs with service role only",()=>{
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  for(const name of ["erp_preparing_technical_checklist","erp_preparing_technical_issues","erp_preparing_technical_acceptance","erp_preparing_technical_audit"])
    assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}`));
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY;/g)||[]).length,4);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/TO service_role/);
  assert.match(sql,/FOR UPDATE/g);
  assert.match(sql,/p_expected_updated_at::timestamptz/g);
  assert.match(sql,/technical_audit/g);
});
test("SQL enforces 4 installation + 4 testing checkpoints and resolves all issues",()=>{
  assert.match(sql,/ELSIF current_position=7 THEN/);
  assert.match(sql,/ELSIF current_position=8 THEN/);
  assert.match(sql,/ELSIF current_position=9 THEN/);
  assert.match(sql,/Final School Closing is reserved/);
  assert.match(sql,/milestone_key IN \('site_ready','equipment_installed','cabling_and_safety','software_configured'\)/);
  assert.match(sql,/milestone_key IN \('power_on','functional_tests','safety_validation','technical_handover'\)/);
  assert.match(sql,/status<>'resolved'/);
  assert.match(sql,/Record the technical team''s acceptance reference first/);
  for(const legacy of ["current_position=4","current_position=5","current_position=6","received_qty<planned_qty"])
    assert.ok(sql.includes(legacy),`Preserved Phase 3 gate: ${legacy}`);
});
test("technical acceptance is invalidated on changed issue or milestone",()=>{
  assert.ok((sql.match(/DELETE FROM public\.erp_preparing_technical_acceptance/g)||[]).length>=3);
  assert.match(sql,/p_status='resolved' AND length\(btrim\(coalesce\(p_resolution_notes,''\)\)\)<3/);
  assert.match(sql,/Reopen Testing before modifying issues/);
  assert.match(sql,/Reopen Testing before adding an issue/);
  assert.match(sql,/Complete the preceding delivery\/installation stage/);
});
test("service validates technical payloads and uses transactions via RPC",()=>{
  for(const name of ["preparingTechnical","updateTechnicalCheckpoint","createTechnicalIssue","updateTechnicalIssue","recordTechnicalAcceptance"])
    assert.match(service,new RegExp(`export async function ${name}\\(`));
  assert.match(service,/technicalVersion/);
  assert.match(service,/technicalEvidence/);
  assert.match(service,/erp_preparing_record_technical_acceptance/);
});
test("school UI includes technical follow-up surface and issue/acceptance actions",()=>{
  assert.match(main,/TechnicalFollowUp/);assert.match(main,/Open Technical/);
  assert.match(ui,/action:"checkpoint"/);
  assert.match(ui,/record\?"issue":"create_issue"/);
  assert.match(ui,/action:"acceptance"/);
  assert.match(ui,/Export CSV/);
  assert.match(main,/currentStage.key === "final_closing"/);
});
