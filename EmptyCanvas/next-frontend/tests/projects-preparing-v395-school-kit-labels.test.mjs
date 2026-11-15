import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load = path => fs.readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const migration = load('sql/2026-11-11-preparing-school-kit-labels-v395.sql');
const api = load('app/api/projects-preparing/project-cartons/route.js');
const service = load('lib/preparing-project-cartons.js');
const packing = load('lib/preparing-production.js');
const ui = load('components/preparing/ProjectBoxDistribution.jsx');
const authorization = load('lib/preparing-tab-write-server.js');

test('v395 additive SQL: immutable school-specific sequential labels, locked bulk creation',()=>{
  assert.match(migration,/ADD COLUMN IF NOT EXISTS school_id uuid/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS generated_kit_label boolean/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS label_sequence integer/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS erp_prep_generated_school_kit_sequence/);
  assert.match(migration,/FOR UPDATE/);
  assert.match(migration,/max\(label_sequence\)/i);
  assert.match(migration,/UNIQUE|unique/i);
  assert.match(migration,/NEW\.carton_label IS DISTINCT FROM OLD\.carton_label/);
  assert.match(migration,/p_count NOT BETWEEN 1 AND 100/);
  assert.match(migration,/Kit group is not part of the selected school Proposal/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.erp_preparing_generate_school_kits_v395/);
  assert.match(migration,/TO service_role/);
});
test('no optimistic client IDs: the atomic server RPC owns box creation',()=>{
  assert.match(service,/export async function generateSchoolKitLabels/);
  assert.match(service,/p_school_id:id\(body\.schoolId\)/);
  assert.match(service,/p_count:count/);
  assert.match(service,/erp_preparing_generate_school_kits_v395/);
  assert.match(api,/b\.action==="generate_school_kits" && scope!=="boxes"/);
  assert.match(api,/requirePreparingTabWrite\(auth\.account,scope,b/);
  assert.match(authorization,/\['create','generate_school_kits','rename','cancel'\]/);
});
test('school-specific boxes cannot pack components from other schools',()=>{
  assert.match(packing,/if\(box\.generated_kit_label\)/);
  assert.match(packing,/School Kit packing must be distributed equally/);
  assert.match(ui,/SchoolEqualPackingEditor/);
  assert.match(api,/Generated Kit label codes cannot be renamed/);
  assert.match(api,/School Kit labels must be managed in Box Distribution/);
});
test('school+kit+quantity UI and honest contents inspection; old pool view stays separate',()=>{
  assert.match(ui,/Generate School Kit Labels/);
  assert.match(ui,/Schools for new Kit labels/);
  assert.match(ui,/Kit group for new labels/);
  assert.match(ui,/Number of kits per selected school/);
  assert.match(ui,/action:"generate_school_kits"/);
  assert.match(ui,/Packed contents \(/);
  assert.doesNotMatch(ui,/reference only; not proof of packed contents/);
  assert.match(api,/if\(scope==="cartons"\)/);
  assert.match(api,/!c\.generated_kit_label/);
});
