import assert from "node:assert/strict";
import { test } from "node:test";
import { PREPARING_STAGES, canCompleteStage, schoolProgress, validStage } from "../lib/preparing-workflow.js";
import { featureAllowed, isKnownFeature, ACTIVE_PILOT_FEATURE_KEYS } from "../lib/feature-permissions-registry.js";

test("preparing stages are unique and ordered", () => {
  const ids = PREPARING_STAGES.map(row => row.key);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(5), "delivery_closing");
  assert.equal(ids.at(-1), "final_closing");
  assert.equal(validStage("received_extra"), false);
});
test("completion requires all previous stages", () => {
  assert.equal(canCompleteStage("receiving", []), true);
  assert.equal(canCompleteStage("final_closing", []), false);
  const almost = PREPARING_STAGES.slice(0, -1).map(stage => ({ stage_key: stage.key, status: "completed" }));
  assert.equal(canCompleteStage("final_closing", almost), true);
  assert.equal(schoolProgress(almost).delivered, true);
  assert.equal(schoolProgress(almost).closed, false);
  assert.equal(schoolProgress([...almost, {stage_key:"final_closing",status:"completed"}]).closed, true);
});
test("preparing grants are recognized and enforced", () => {
  assert.equal(isKnownFeature("preparing.stage_update"), true);
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes("preparing.stage_update"));
  const account = { featureAccess: { mode:"enforced", grants:{
    "preparing.view": { allowed:true, scope:"all" },
    "preparing.create": { allowed:true, scope:"all" },
    "preparing.stage_update": { allowed:false, scope:"all" },
  } } };
  assert.equal(featureAllowed(account,"preparing.view"),true);
  assert.equal(featureAllowed(account,"preparing.create"),true);
  assert.equal(featureAllowed(account,"preparing.manage"),false);
  assert.equal(featureAllowed(account,"preparing.stage_update"),false);
  assert.equal(featureAllowed({featureAccess:{mode:"enforced",grants:{"preparing.create":{allowed:true,scope:"all"}}}},"preparing.create"),false);
});
