import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPreparingProjectReport, cairoDate, csvField, internalPreparingCSV, ministryStatusCSV } from "../lib/preparing-reports.js";
import { PREPARING_STAGES } from "../lib/preparing-workflow.js";
const source = name => readFileSync(new URL(name, import.meta.url), "utf8");
const SCHOOL_A = "a", SCHOOL_B = "b", SCHOOL_C = "c";
const project = { id: "project", name: "30 June Schools" };
const schools = [
  {id:SCHOOL_A,beneficiary_name:"Alpha",proposal_name:"G2"},
  {id:SCHOOL_B,beneficiary_name:"Beta",proposal_name:"G3"},
  {id:SCHOOL_C,beneficiary_name:"Gamma",proposal_name:"G4"},
];
const all = (school_id, stop=9) => PREPARING_STAGES.slice(0,stop).map(stage => ({ school_id, stage_key:stage.key, status:"completed" }));
const fixture = () => ({ project, schools,
  progress: [...all(SCHOOL_A,9),...all(SCHOOL_B,6),{school_id:SCHOOL_C,stage_key:"receiving",status:"blocked"}],
  components: [{school_id:SCHOOL_A,planned_qty:10,received_qty:10,damaged_qty:0,prepared_qty:10},
    {school_id:SCHOOL_B,planned_qty:6,received_qty:4,damaged_qty:1,prepared_qty:3}],
  shipments: [{id:"active",school_id:SCHOOL_A,status:"delivered",receipt_reference:"signed",delivered_at:"2026-10-24T08:00:00Z"},
    {id:"cancel",school_id:SCHOOL_A,status:"cancelled",receipt_reference:"",delivered_at:null},
    {id:"draft",school_id:SCHOOL_B,status:"draft",receipt_reference:"",delivered_at:null}],
  shipmentLines: [{school_id:SCHOOL_A,shipment_id:"active",packed_qty:10,received_qty:10},
    {school_id:SCHOOL_A,shipment_id:"cancel",packed_qty:9,received_qty:0},
    {school_id:SCHOOL_B,shipment_id:"draft",packed_qty:3,received_qty:0}],
  issues: [{school_id:SCHOOL_A,status:"resolved",due_date:"2026-10-01"},
    {school_id:SCHOOL_B,status:"in_progress",due_date:"2026-10-26"},
    {school_id:SCHOOL_B,status:"open",due_date:"2026-10-28"}],
  checkpoints: [{school_id:SCHOOL_B,milestone_key:"site_ready",status:"blocked"}],
  acceptances: [{school_id:SCHOOL_A,confirmation_reference:"TECH-SIGN-01"}],
  closingChecks: [{school_id:SCHOOL_A,check_key:"signed_handover",status:"verified"}],
  approvals: [{school_id:SCHOOL_A,status:"approved"}],
  today:"2026-10-27" });

test("strict school grouping, independent delivery and final approval", () => {
  const result=buildPreparingProjectReport(fixture());
  assert.equal(result.summary.totalSchools,3);
  assert.equal(result.summary.deliveredSchools,2);
  assert.equal(result.summary.closedSchools,1);
  assert.equal(result.summary.blockedSchools,2);
  assert.equal(result.summary.schoolsWithoutManifest,1);
  assert.equal(result.schools[0].phase,"closed");
  assert.equal(result.schools[1].phase,"blocked");
  assert.equal(result.schools[2].stageKey,"receiving");
});
test("quantities exclude cancelled shipments and never infer missing BOM as zero", () => {
  const result=buildPreparingProjectReport(fixture());
  assert.equal(result.summary.quantities.planned,16);
  assert.equal(result.summary.quantities.delivered,10);
  assert.equal(result.summary.quantities.packed,13);
  assert.equal(result.summary.quantities.usableShortage,3);
  assert.equal(result.schools[2].quantities,null);
  assert.equal(result.schools[0].shipments.total,1);
  assert.equal(result.schools[0].shipments.signed,1);
});
test("issue overdue uses individual assigned date, excludes resolved and future issues", () => {
  const result=buildPreparingProjectReport(fixture());
  assert.equal(result.summary.openIssues,2);
  assert.equal(result.summary.overdueIssues,1);
  assert.equal(result.schools[1].nextIssueDeadline,"2026-10-26");
  assert.equal(result.schools[0].openIssues,0);
});
test("closed status requires both actual final closing stage and approved record", () => {
  const data=fixture();data.approvals=[];
  const row=buildPreparingProjectReport(data).schools[0];
  assert.equal(row.closed,false);
  assert.match(row.anomalies.join(" "),/mismatch/);
});
test("project without schools returns genuine empty report", () => {
  const report=buildPreparingProjectReport({project,schools:[],today:"2026-10-27"});
  assert.equal(report.summary.averageProgress,0);
  assert.equal(report.schools.length,0);
});
test("CSV quotes and neutralizes formula-leading user data", () => {
  for (const value of ["=1+1"," +SUM(A1)","\t@SUM(5)","-1","@evil"]) assert.ok(csvField(value).startsWith('"\''));
  assert.equal(csvField('A"B'), '"A""B"');
  const data=fixture();data.schools[0].beneficiary_name='=HYPERLINK("https://bad")';
  assert.match(internalPreparingCSV(buildPreparingProjectReport(data)),/"'=HYPERLINK/);
});
test("Ministry status export does not assert machine-condition certification", () => {
  const csv=ministryStatusCSV(buildPreparingProjectReport(fixture()));
  assert.match(csv,/Not separately assessed in ERP/);
  assert.match(csv,/Technical Acceptance Recorded/);
  assert.doesNotMatch(csv,/Machine ready to operate/);
});
test("report API rechecks feature gate, paginates and uses no direct client credentials", () => {
  const route=source("../app/api/projects-preparing/reports/route.js");
  const service=source("../lib/preparing-report-service.js");
  const client=source("../components/preparing/PreparingClient.jsx");
  const dashboard=source("../components/preparing/ProjectDashboard.jsx");
  assert.match(route,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
  assert.match(route,/"preparing\.view"/);
  assert.match(route,/Cache-Control.*private, no-store/);
  assert.match(service,/serviceOnly\(\)/);
  assert.match(service,/offset: String\(offset\)/);
  assert.match(service,/no partial results were returned/);
  assert.match(client,/ProjectDashboard/);
  assert.match(dashboard,/Ministry Status CSV/);
});
test("Cairo date formatting stable", () => {
  assert.equal(cairoDate(new Date("2026-10-27T22:45:00Z")),"2026-10-28");
});
