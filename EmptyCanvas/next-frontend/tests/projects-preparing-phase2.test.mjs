import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { componentTotals, PREPARING_STAGES } from "../lib/preparing-workflow.js";

const file = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("Component math handles duplicate product names as separate proposal rows", () => {
  const a = { planned_qty: 4, received_qty: 3, damaged_qty: 1, prepared_qty: 2 };
  const b = { planned_qty: 4, received_qty: 4, damaged_qty: 0, prepared_qty: 4 };
  assert.deepEqual(componentTotals([a,b]), { planned:8,received:7,damaged:1,prepared:6,missing:1,usableShortage:2 });
  assert.deepEqual(componentTotals([]), { planned:0,received:0,damaged:0,prepared:0,missing:0,usableShortage:0 });
});
test("Components API does not allow anonymous or view-only writes", () => {
  const route = file("../app/api/projects-preparing/components/route.js");
  assert.match(route, /access\("view"\)/);
  assert.equal((route.match(/access\("stage_update"\)/g) || []).length, 2);
  assert.match(route, /Cache-Control/);
});
test("Database snapshot is one-per-school and quantity writes are version-checked and audited", () => {
  const sql=file("../sql/2026-10-27-preparing-components-phase2.sql");
  assert.match(sql,/school_id uuid PRIMARY KEY REFERENCES public\.erp_preparing_schools/);
  assert.match(sql,/UNIQUE\(school_id,proposal_item_id\)/);
  assert.match(sql,/FOR UPDATE/g);
  assert.match(sql,/p_expected_updated_at::timestamptz/);
  assert.match(sql,/INSERT INTO public\.erp_preparing_component_audit/);
  assert.match(sql,/received_qty - damaged_qty/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.erp_preparing_update_component/);
  assert.match(sql,/p_received < prior\.planned_qty/);
  assert.match(sql,/Capture the school Proposal components/);
  assert.match(sql,/current_position IN \(1,2,3\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
});
test("Existing workflow stage definitions stay intact", () => {
  assert.equal(PREPARING_STAGES.length, 9);
  assert.equal(PREPARING_STAGES[0].key,"receiving");
  assert.equal(PREPARING_STAGES[2].key,"preparing");
  assert.equal(PREPARING_STAGES[5].key,"delivery_closing");
});
