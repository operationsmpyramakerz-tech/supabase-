import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availableSchoolKits,validSchoolCartonSelection,schoolCartonContents} from '../lib/preparing-school-cartons.mjs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const sql=read('sql/2026-11-11-preparing-school-cartons-v397.sql');
const api=read('app/api/projects-preparing/project-cartons/route.js');
const service=read('lib/preparing-project-cartons.js');
const ui=read('components/preparing/SchoolKitCartons.jsx');
const gate=read('lib/preparing-tab-write-server.js');
const all=[
 {id:'s-a-1',school_id:'school-a',generated_kit_label:true,status:'ready',kit_name:'Addons'},
 {id:'s-a-2',school_id:'school-a',generated_kit_label:true,status:'ready',kit_name:'Electronics'},
 {id:'s-a-draft',school_id:'school-a',generated_kit_label:true,status:'draft'},
 {id:'s-b-1',school_id:'school-b',generated_kit_label:true,status:'ready'},
 {id:'legacy',school_id:'school-a',generated_kit_label:false,status:'ready'},
];
const joined=[{carton_id:'carton-1',kit_box_id:'s-a-1'}];
test('Only complete unassigned Kits belonging to the same school can be selected',()=>{
 assert.deepEqual(availableSchoolKits('school-a',all,joined).map(k=>k.id),['s-a-2']);
 assert.deepEqual(availableSchoolKits('school-b',all,joined).map(k=>k.id),['s-b-1']);
 assert.deepEqual(availableSchoolKits('',all,joined),[]);
});
test('Cannot reassign, duplicate, or mix schools with a carton selection',()=>{
 assert.equal(validSchoolCartonSelection('school-a',['s-a-2'],all,joined),true);
 for(const ids of [[],['s-a-1'],['s-a-2','s-a-2'],['s-b-1'],['legacy'],['s-a-draft'],['s-a-2','s-b-1']])
  assert.equal(validSchoolCartonSelection('school-a',ids,all,joined),false);
 assert.equal(validSchoolCartonSelection('school-b',['s-b-1'],all,joined),true);
});
test('Physical carton manifest contains exactly its linked Kits',()=>{
 assert.deepEqual(schoolCartonContents('carton-1',joined,all).map(k=>k.id),['s-a-1']);
 assert.deepEqual(schoolCartonContents('carton-2',joined,all),[]);
});
test('School cartons use fresh, independent tables; legacy cartons are untouched',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_school_cartons/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_school_carton_kits/);
 assert.match(sql,/kit_box_id uuid NOT NULL UNIQUE/);
 assert.match(sql,/UNIQUE\(project_id,school_id,label_sequence\)/);
 assert.match(sql,/UNIQUE\(project_id,carton_label\)/);
 assert.doesNotMatch(sql,/TRUNCATE|DROP TABLE|UPDATE public\.erp_preparing_project_cartons/);
});
test('SQL transaction locks project and verifies school, packed Kits, exact components, duplicate ids',()=>{
 for(const clause of [
  'WHERE id=p_project_id FOR UPDATE',
  'school_rec FROM public.erp_preparing_schools',
  'b.school_id=p_school_id AND b.generated_kit_label AND b.status=\'ready\'',
  'SELECT count(DISTINCT box_id)',
  'Already assigned',
 ]){
  // Label wording is not part of the contract; check the structural SQL instead.
  if(clause==='Already assigned')assert.match(sql,/already assigned to a packed carton/);
  else assert.ok(sql.includes(clause),clause);
 }
 assert.match(sql,/coalesce\(l\.packed_qty,0\)<>t\.expected_qty/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.erp_preparing_school_kit_targets/);
});
test('One atomic RPC creates a school-id label and its selected Kit links',()=>{
 assert.match(sql,/stem\|\|'-'\|\|lpad\(next_seq::text,2,'0'\)/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_school_cartons/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_school_carton_kits/);
 assert.match(sql,/RETURN jsonb_build_object\('carton_id'/);
});
test('Only the signed-in server with carton stage & tab Edit rights may pack',()=>{
 assert.match(api,/preparingStageAllowed\(auth\.account,scope\)/);
 assert.match(api,/pack_school_carton.*scope!=="cartons"/);
 assert.match(api,/requirePreparingTabWrite\(auth\.account,scope,b/);
 assert.match(gate,/\['create', 'pack_school_carton'\]/);
 assert.match(service,/p_member_id:actor\(account\)/);
 assert.match(service,/erp_preparing_pack_school_carton_v397/);
});
test('Immutable school carton tables and restricted RPC grants',()=>{
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.erp_preparing_school_cartons/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.erp_preparing_school_carton_kits/);
 assert.match(sql,/current_setting\('erp_preparing\.school_carton_write',true\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.erp_preparing_pack_school_carton_v397/);
 assert.match(sql,/TO service_role/);
});
test('UI preserves legacy carton management, exposes verified Kit and carton contents',()=>{
 assert.match(ui,/ProjectKitCartonsLegacy/);
 assert.match(ui,/Legacy Cartons/);
 assert.match(ui,/Pack Carton/);
 assert.match(ui,/schoolCartonContents/);
 assert.match(ui,/readyKitTargets/);
 assert.match(ui,/readyKitLines/);
 assert.match(ui,/Kit content is verified and locked/);
 assert.match(ui,/editTabs\.all!==false/);
});

test('Stage 6 progress counts only verified Kits placed inside outer cartons, not loose ready Kits',async()=>{
 const {calculateProjectPreparationProgress}=await import('../lib/preparing-project-progress.mjs');
 const baseline={testing:{items:[{required:10}]},warehouse:{},production:{items:[],cartons:[
  {id:'loose-kit',generated_kit_label:true,status:'ready'},
  {id:'in-carton',generated_kit_label:true,status:'ready'},
  {id:'legacy-ready',generated_kit_label:false,status:'ready'},
 ],cartonLines:[
  {carton_id:'loose-kit',packed_qty:4},
  {carton_id:'in-carton',packed_qty:3},
  {carton_id:'legacy-ready',packed_qty:2},
 ],schoolCartonKits:[{kit_box_id:'in-carton'}]}};
 assert.equal(calculateProjectPreparationProgress(baseline).stages[5],50);
 assert.equal(calculateProjectPreparationProgress({...baseline,production:{...baseline.production,schoolCartonKits:[]}}).stages[5],20);
});
