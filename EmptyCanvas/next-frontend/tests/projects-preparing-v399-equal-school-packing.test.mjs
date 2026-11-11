import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {schoolKitRequested,schoolKitPackingPreview,schoolKitPackingSchools} from '../lib/preparing-equal-kit-packing.mjs';
const root = new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
test('a school BOM quantity uses only the selected Kit group',()=>{
 assert.equal(schoolKitRequested({planned_qty:14,source_kits:[{kitName:'Addons',quantity:6},{kitName:'Tools',quantity:8}]},'Addons'),6);
 assert.equal(schoolKitRequested({planned_qty:5,source_kits:[]},'General'),5);
 assert.equal(schoolKitRequested({planned_qty:5,source_kits:[{kitName:'Tools',quantity:5}]},'General'),0);
});
test('identical boxes demand exact integer splits and school limits',()=>{
 assert.deepEqual(schoolKitPackingPreview({requested:10,boxes:5,packed:4,total:10}),{ok:true,perBox:2,requiredPerBox:2,delta:6,remaining:0});
 assert.match(schoolKitPackingPreview({requested:5,boxes:2,total:4}).error,/whole number/);
 assert.match(schoolKitPackingPreview({requested:10,boxes:5,total:6}).error,/split equally/);
 assert.match(schoolKitPackingPreview({requested:10,boxes:5,total:15}).error,/cannot pack/);
 assert.match(schoolKitPackingPreview({requested:10,boxes:0,total:10}).error,/Generate/);
 assert.equal(schoolKitPackingPreview({requested:10,boxes:5,total:0}).ok,true);
});
test('a school gets only its own generated physical boxes and current quantities',()=>{
 const row={product_id:'B1',product_name:'Battery'};
 const schools=[{id:'s1',beneficiary_name:'City'},{id:'s2',beneficiary_name:'Smart'}];
 const comps=[{school_id:'s1',...row,source_kits:[{kitName:'GEK',quantity:10}]},{school_id:'s2',...row,source_kits:[{kitName:'GEK',quantity:6}]}];
 const boxes=[{id:'a',school_id:'s1',kit_name:'GEK',status:'draft',generated_kit_label:true},{id:'b',school_id:'s1',kit_name:'GEK',status:'draft',generated_kit_label:true},{id:'c',school_id:'s2',kit_name:'GEK',status:'ready',generated_kit_label:true},{id:'x',school_id:'s1',kit_name:'Tools',status:'draft',generated_kit_label:true}];
 const lines=[{carton_id:'a',...row,packed_qty:2},{carton_id:'x',...row,packed_qty:5}];
 const result=schoolKitPackingSchools(row,'GEK',schools,comps,boxes,lines);
 assert.equal(result.length,2);assert.deepEqual(result.map(s=>[s.boxes,s.required,s.packed,s.locked]),[[2,10,2,false],[1,6,0,true]]);
});
test('the whole Kit group must divide equally, not only the selected component',()=>{
 const row={product_id:'B1',product_name:'Battery'};
 const components=[{school_id:'s1',...row,source_kits:[{kitName:'GEK',quantity:10}]},
  {school_id:'s1',product_id:'S1',product_name:'Sensor',source_kits:[{kitName:'GEK',quantity:5}]}];
 const boxes=[{id:'a',school_id:'s1',kit_name:'GEK',status:'draft',generated_kit_label:true},
  {id:'b',school_id:'s1',kit_name:'GEK',status:'draft',generated_kit_label:true}];
 const [school]=schoolKitPackingSchools(row,'GEK',[{id:'s1'}],components,boxes,[]);
 assert.match(school.groupIssue,/Sensor: 5 requested/);
});
test('endpoints keep writes gated and use a single batch RPC for school selections',()=>{
 const api=read('app/api/projects-preparing/production/route.js');
 const service=read('lib/preparing-production.js');
 const sql=read('sql/2026-11-11-preparing-equal-school-packing-v399.sql');
 assert.match(api,/pack_schools/);assert.match(api,/requirePreparingTabWrite/);
 assert.match(service,/erp_preparing_pack_school_boxes_v399/);
 assert.match(sql,/FOR UPDATE/);assert.match(sql,/mod\(/i);assert.match(sql,/erp_preparing_production_pack_v249/);
 assert.match(sql,/incoming_qty/);assert.match(sql,/GRANT EXECUTE[\s\S]*service_role/);
});
