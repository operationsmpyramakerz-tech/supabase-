import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {schoolKitPackingProgress} from '../lib/preparing-school-kit-packing.mjs';
const load=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const sql=load('sql/2026-11-11-preparing-school-kit-packing-v396.sql');
const ui=load('components/preparing/ProjectBoxDistribution.jsx');
const api=load('app/api/projects-preparing/project-cartons/route.js');
const svc=load('lib/preparing-project-cartons.js');
const auth=load('lib/preparing-tab-write-server.js');
const target=(q=2)=>({kit_box_id:'kit-a',product_id:'123',product_name:'Arduino',expected_qty:q});
const line=(q=2)=>({carton_id:'kit-a',product_id:'123',product_name:'Arduino',packed_qty:q});

test('Packing cannot complete with missing, extra, or overpacked quantities',()=>{
 assert.equal(schoolKitPackingProgress('kit-a',[target(2)],[]).complete,false);
 assert.equal(schoolKitPackingProgress('kit-a',[target(2)],[line(1)]).remaining,1);
 assert.equal(schoolKitPackingProgress('kit-a',[target(2)],[line(2)]).complete,true);
 assert.equal(schoolKitPackingProgress('kit-a',[target(2)],[line(3)]).complete,false);
 assert.equal(schoolKitPackingProgress('kit-a',[target(2)],[line(2),{...line(1),product_id:'extra'}]).complete,false);
 assert.equal(schoolKitPackingProgress('kit-a',[],[line(2)]).complete,false);
});
test('A box is calculated independently of other schools / boxes',()=>{
 assert.equal(schoolKitPackingProgress('kit-a',[target(2),{...target(3),kit_box_id:'kit-b'}],[line(2),{...line(3),carton_id:'kit-b'}]).complete,true);
 assert.equal(schoolKitPackingProgress('kit-b',[target(2)],[line(2)]).complete,false);
});
test('SQL snapshots school group BOM and respects physically packed v395 lines',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_school_kit_targets/);
 assert.match(sql,/kit_box_id uuid NOT NULL/);
 assert.match(sql,/source_component_id uuid NOT NULL/);
 assert.match(sql,/source_qty-already_packed/);
 assert.match(sql,/target_qty:=packed_in_box\+base_qty/);
 assert.match(sql,/label_sequence,id/);
 assert.match(sql,/Duplicate components in the school Kit group/);
 assert.match(sql,/Existing packed quantities exceed this school Kit BOM/);
 assert.match(sql,/School BOM quantities|source_kits/);
});
test('DB enforces group size freeze, target bounds, complete comparison and lock',()=>{
 assert.match(sql,/trg_erp_prep_kit_group_size_v396/);
 assert.match(sql,/trg_erp_prep_kit_target_v396/);
 assert.match(sql,/NEW\.packed_qty>limit_qty/);
 assert.match(sql,/coalesce\(l\.packed_qty,0\)<>t\.expected_qty/);
 assert.match(sql,/trg_erp_prep_completed_kit_v396/);
 assert.match(sql,/Kit plan is locked; cannot cancel a planned physical label/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.erp_preparing_initialize_school_kit_plan_v396/);
 assert.match(sql,/TO service_role;/);
});
test('Move required quantities only between draft Kits of same school/group',()=>{
 assert.match(sql,/p_from_box_id=p_to_box_id/);
 assert.match(sql,/from_box\.school_id IS DISTINCT FROM to_box\.school_id/);
 assert.match(sql,/from_box\.kit_name IS DISTINCT FROM to_box\.kit_name/);
 assert.match(sql,/current_packed>new_from_qty/);
 assert.match(sql,/ON CONFLICT \(kit_box_id,source_component_id\) DO UPDATE/);
});
test('API actions scoped to Box Distribution, all-components edit and verified account',()=>{
 for(const a of ['init_school_kit_plan','transfer_school_kit_target','complete_school_kit']){
  assert.ok(api.includes(a)); assert.ok(auth.includes(a));
 }
 assert.match(auth,/tab !== 'all'/);
 assert.match(api,/complete_school_kit" && scope!=="boxes"/);
 assert.match(svc,/erp_preparing_complete_school_kit_v396/);
 assert.match(svc,/p_member_id:actor\(account\)/);
 assert.match(api,/kitTargets:\[\]/);
});
test('v413 auto-completes physical kits through verified SQL on save',()=>{
 assert.match(ui,/Equal school Kit manifest/);
 assert.match(ui,/SchoolEqualPackingEditor/);
 assert.doesNotMatch(ui,/Mark Kit as Packed/);
 assert.match(ui,/action:"pack_schools"/);
 assert.match(load('sql/2026-11-15-preparing-school-kits-auto-complete-multischool-v413.sql'),/erp_preparing_complete_school_kit_v396/);
 assert.doesNotMatch(ui,/saveManifestLine|transferManifestTarget|Prepare Kit Packing Plan/);
});
