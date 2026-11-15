import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schoolKitPackingProgress} from '../lib/preparing-school-kit-packing.mjs';
import {schoolKitGroupsForSelection,kitLabelGroupHasPlan} from '../lib/preparing-kit-label-schools.mjs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=load('sql/2026-11-15-preparing-school-kits-auto-complete-multischool-v413.sql');
const ui=load('components/preparing/ProjectBoxDistribution.jsx');
const service=load('lib/preparing-project-cartons.js');
const packing=load('lib/preparing-production.js');
const api=load('app/api/projects-preparing/project-cartons/route.js');
const base={school_id:'s1',product_id:'a',product_name:'Sensor',source_kits:[{kitName:'Addons',quantity:4}]};

test('Kit groups must be shared by ALL selected schools',()=>{
 const comps=[base,{...base,school_id:'s2'},
  {...base,school_id:'s1',product_name:'Laser',source_kits:[{kitName:'Laser',quantity:1}]},
  {...base,school_id:'s3',source_kits:[]}];
 assert.deepEqual(schoolKitGroupsForSelection(comps,['s1']),['Addons','Laser']);
 assert.deepEqual(schoolKitGroupsForSelection(comps,['s1','s2']),['Addons']);
 assert.deepEqual(schoolKitGroupsForSelection(comps,['s1','s3']),[]);
 assert.deepEqual(schoolKitGroupsForSelection(comps,[]),[]);
});

test('A school with an existing packing plan cannot receive new generated labels',()=>{
 const data={cartons:[{id:'c1',school_id:'s1',kit_name:'Addons',generated_kit_label:true,status:'draft'},
 {id:'c2',school_id:'s2',kit_name:'Addons',generated_kit_label:true,status:'ready'}],kitTargets:[{kit_box_id:'c1'}],lines:[]};
 assert.equal(kitLabelGroupHasPlan(data,['s1'],'Addons'),true);
 assert.equal(kitLabelGroupHasPlan(data,['s2'],'Addons'),true);
 assert.equal(kitLabelGroupHasPlan(data,['s3'],'Addons'),false);
 assert.equal(kitLabelGroupHasPlan(data,['s1'],'Other'),false);
 assert.equal(kitLabelGroupHasPlan({cartons:[{id:'a',school_id:'s1',kit_name:'Addons',generated_kit_label:true,status:'draft'}],lines:[{carton_id:'a',packed_qty:1}]},['s1'],'Addons'),true);
});

test('Kit only qualifies for closure when all nonempty targets match physical packed lines',()=>{
 const target=[{kit_box_id:'box1',product_id:'a',product_name:'Sensor',expected_qty:4},{kit_box_id:'box1',product_id:'b',product_name:'Cable',expected_qty:1}];
 const full=[{carton_id:'box1',product_id:'a',product_name:'Sensor',packed_qty:4},{carton_id:'box1',product_id:'b',product_name:'Cable',packed_qty:1}];
 assert.equal(schoolKitPackingProgress('box1',target,full).complete,true);
 assert.equal(schoolKitPackingProgress('box1',target,full.slice(0,1)).complete,false);
 assert.equal(schoolKitPackingProgress('box1',target,[...full,{carton_id:'box1',product_id:'c',product_name:'Extra',packed_qty:1}]).complete,false);
 assert.equal(schoolKitPackingProgress('box1',target,[{...full[0],packed_qty:5},full[1]]).complete,false);
 assert.equal(schoolKitPackingProgress('box1',[],full).complete,false);
});

test('Auto closure is transactional and uses existing independently verified v396 seal',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_pack_school_boxes_auto_v413/);
 assert.match(sql,/result := public\.erp_preparing_pack_school_boxes_v399/);
 assert.match(sql,/PERFORM public\.erp_preparing_complete_school_kit_v396/);
 assert.match(sql,/coalesce\(l\.packed_qty,0\)<>t\.expected_qty/);
 assert.match(sql,/AND NOT EXISTS/);
 assert.match(sql,/b\.status='draft'/);
 assert.match(sql,/closed_labels/);
 assert.match(sql,/AUTO-PACKING-V413/);
 assert.match(sql,/GRANT EXECUTE[\s\S]*TO service_role/);
 assert.match(packing,/erp_preparing_pack_school_boxes_auto_v413/);
 assert.doesNotMatch(packing,/return rpc\("erp_preparing_pack_school_boxes_v399"/);
});

test('All-or-none label generation sends 1 authorized server action with schoolIds',()=>{
 assert.match(ui,/LabelSchoolsPicker/);
 assert.match(ui,/Select all/);
 assert.match(ui,/type="checkbox"/);
 assert.match(ui,/schoolIds:labelSchools/);
 assert.match(ui,/labelSchools\.length/);
 assert.match(ui,/kitLabelGroupHasPlan/);
 assert.match(ui,/schoolKitGroupsForSelection/);
 assert.match(service,/erp_preparing_generate_school_kits_multi_v413/);
 assert.match(api,/requirePreparingTabWrite\(auth\.account,scope,b/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_generate_school_kits_multi_v413/);
 assert.match(sql,/FOREACH school_id IN ARRAY p_school_ids LOOP/);
 assert.match(sql,/public\.erp_preparing_generate_school_kits_v395/);
 assert.match(sql,/array_length\(p_school_ids,1\) NOT BETWEEN 1 AND 50/);
 assert.match(sql,/count\(DISTINCT school_key\)/);
});

test('Inspector removes manual completion and proposal reference but retains QR + contents',()=>{
 assert.doesNotMatch(ui,/Mark Kit as Packed/);
 assert.doesNotMatch(ui,/School Proposal components \(reference only/);
 assert.match(ui,/manifestTargets\.map/);
 assert.match(ui,/Download Kit Label \+ QR/);
 assert.match(ui,/Packed · Verified/);
 assert.match(ui,/auto_closed/);
 assert.match(load('app/projects-preparing/page.jsx'),/v413-multischool-auto-seal/);
});
