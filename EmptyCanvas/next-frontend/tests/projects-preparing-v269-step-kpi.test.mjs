import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { membersWithPreparingStageAccess, PREPARING_STEP_PERMISSIONS } from '../lib/preparing-step-access.mjs';

const pages = [{ id: 'projects', page_key: 'projects-preparing', page_name: 'Projects Preparing', route_path: '/next/projects-preparing' }];
const members = [{id:'one',name:'Ada'}, {id:'two',name:'Bela'}, {id:'three',name:'Chloe'}, {id:'four',name:'Dara'}];
const pageAccess = [{team_member_id:'one',page_id:'projects',is_enabled:true},{team_member_id:'two',page_id:'projects',is_enabled:true},{team_member_id:'three',page_id:'projects',is_enabled:false}];
const profiles = [{team_member_id:'two',enabled:true}];
const grants = (id,key,allowed = true,scope='all') => ({team_member_id:id,permission_key:key,is_allowed:allowed,data_scope:scope});

test('stage editor avatars use permissioned ERP members, not school beneficiaries',()=>{
  const list = membersWithPreparingStageAccess({ members,pages,pageAccess,profiles,grants:[
    grants('two','preparing.view'),grants('two','preparing.stage_update'),grants('two','preparing.manage',false),grants('two','preparing.warehouse_receive',false),
  ]});
  assert.deepEqual(list.components.map(p=>p.name),['Ada']);
  assert.deepEqual(list.testing.map(p=>p.name),['Ada','Bela']);
  assert.deepEqual(list.warehouse.map(p=>p.name),['Ada']);
  assert.deepEqual(list.production.map(p=>p.name),['Ada','Bela']);
  assert.deepEqual(list.boxes.map(p=>p.name),['Ada','Bela']);
  assert.deepEqual(list.cartons.map(p=>p.name),['Ada','Bela']);
});
test('explicit feature deny or disabled page cannot display a user',()=>{
  const list=membersWithPreparingStageAccess({members,pages,pageAccess,profiles,grants:[
    grants('two','preparing.view',false),grants('two','preparing.stage_update'),
  ]});
  assert.deepEqual(list.testing.map(p=>p.id),['one']);
  assert.ok(!Object.values(list).flat().some(p=>p.id==='three'||p.id==='four'));
});
test('only all-scope advanced permissions appear as full stage access',()=>{
  const list=membersWithPreparingStageAccess({members,pages,pageAccess,profiles,grants:[
    grants('two','preparing.view',true,'own'),grants('two','preparing.stage_update'),
  ]});
  assert.deepEqual(list.testing.map(p=>p.id),['one']);
});
test('legacy allowed pages work only when no explicit access record exists',()=>{
  const list=membersWithPreparingStageAccess({members,pages,pageAccess,legacyPages:[
    {id:'four',allowed_pages:'Home,Projects Preparing'} ,{id:'three',allowed_pages:'Projects Preparing'},
  ]});
  assert.deepEqual(list.components.map(p=>p.id),['one','two','four']);
});
test('UI uses a percentage bar, not the old liquid gauge; card remains clickable',()=>{
  const text=fs.readFileSync(new URL('../components/preparing/PreparingClient.jsx', import.meta.url),'utf8');
  assert.match(text,/pr-step-kpi-track/);
  assert.match(text,/pr-step-kpi-fill/);
  assert.match(text,/projectStepCards\.map\(/);
  assert.match(text,/step\.open/);
  assert.ok(!/className="pr-project-step-card"[\s\S]{0,140}<LiquidGauge/.test(text));
  assert.match(text,/StepAccessAvatars/);
});
test('avatar lookup is gated and returns only permission-holders; CSS uses muted KPI styling',()=>{
  const route=fs.readFileSync(new URL('../app/api/projects-preparing/step-access/route.js',import.meta.url),'utf8');
  const service=fs.readFileSync(new URL('../lib/preparing-step-access-service.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/css/projects-preparing.css',import.meta.url),'utf8');
  assert.match(route,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
  assert.match(route,/"preparing.view"/);
  assert.match(service,/membersWithPreparingStageAccess/);
  assert.match(css,/\.pr-step-kpi-fill/);
  assert.match(css,/background:#39b99b/);
  assert.deepEqual(Object.keys(PREPARING_STEP_PERMISSIONS),['components','intake','testing','warehouse','production','boxes','cartons']);
});
