import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { featureAllowed, isKnownFeature, ACTIVE_PILOT_FEATURE_KEYS } from '../lib/feature-permissions-registry.js';
import { preparingStageAllowed, preparingStageReadable, preparingStagesGranular, PREPARING_STAGE_KEYS } from '../lib/preparing-stage-access.js';
import { membersWithPreparingStageAccess } from '../lib/preparing-step-access.mjs';

const account = grants => ({featureAccess:{mode:'enforced',grants:Object.fromEntries(
  Object.entries(grants).map(([key,allowed])=>[key,{allowed,scope:'all'}]))}});
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root),'utf8');

test('Users Center contains a granular marker and individual grants for all five stages',()=>{
  assert.deepEqual(PREPARING_STAGE_KEYS,['testing','warehouse','production','boxes','cartons']);
  for(const name of PREPARING_STAGE_KEYS){
    const key=`preparing.stage.${name}`;
    assert.equal(isKnownFeature(key),true);
    assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key));
  }
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes('preparing.stages.__granular'));
  assert.match(read('components/users-center/UsersCenterDialogs.jsx'),/individual project stage permissions/);
});

test('Legacy/old advanced users retain existing stage rights until explicit opt-in',()=>{
  assert.equal(preparingStageAllowed({},'testing'),true);
  assert.equal(preparingStageReadable({},'cartons'),true);
  const old=account({'preparing.view':true,'preparing.stage_update':true,'preparing.warehouse_receive':false});
  assert.equal(preparingStagesGranular(old),false);
  assert.equal(preparingStageAllowed(old,'testing'),true);
  assert.equal(preparingStageAllowed(old,'warehouse'),false);
  assert.equal(preparingStageReadable(old,'warehouse'),true);
});

test('Granular mode denies all unselected stages, even with generic stage_update',()=>{
  const selected=account({'preparing.view':true,'preparing.stage_update':true,'preparing.warehouse_receive':true,
    'preparing.stages.__granular':true,'preparing.stage.testing':true,'preparing.stage.boxes':true});
  assert.equal(preparingStagesGranular(selected),true);
  assert.equal(preparingStageAllowed(selected,'testing'),true);
  assert.equal(preparingStageAllowed(selected,'boxes'),true);
  for(const name of ['warehouse','production','cartons']){
    assert.equal(preparingStageAllowed(selected,name),false);
    assert.equal(preparingStageReadable(selected,name),false);
  }
  assert.equal(preparingStageAllowed(selected,'not-a-stage'),false);
  assert.equal(preparingStageAllowed(account({'preparing.view':false,'preparing.stages.__granular':true,'preparing.stage.testing':true}),'testing'),false);
});

test('Step avatars reflect individual grants instead of a shared stage_update permission',()=>{
  const pages=[{id:'p',page_key:'projects-preparing'}];
  const pageAccess=[{team_member_id:'id',page_id:'p',is_enabled:true}];
  const profiles=[{team_member_id:'id',enabled:true}];
  const grants=['preparing.view','preparing.stage_update','preparing.stages.__granular','preparing.stage.warehouse']
    .map(permission_key=>({team_member_id:'id',permission_key,is_allowed:true,data_scope:'all'}));
  const stages=membersWithPreparingStageAccess({members:[{id:'id',name:'Engineer'}],pages,pageAccess,profiles,grants});
  assert.deepEqual(stages.warehouse.map(user=>user.name),['Engineer']);
  assert.deepEqual(stages.testing,[]);
  assert.deepEqual(stages.cartons,[]);
});

test('Stage APIs guard both mutations and read/export and aggregate progress exposes only totals',()=>{
  for(const file of ['testing/route.js','warehouse/route.js','production/route.js','project-cartons/route.js',
    'testing/export/route.js','warehouse/export/route.js','production/export/route.js']){
    assert.match(read(`app/api/projects-preparing/${file}`),/preparingStage(?:Gate|ReadGate|Allowed|Readable|sGranular)/, file);
  }
  const dashboard=read('components/preparing/PreparingClient.jsx');
  assert.match(dashboard,/stagePermissions\[step\.key\]/);
  assert.match(dashboard,/stagePermissions\.testing/);
  assert.match(dashboard,/stagePermissions\.warehouse/);
  assert.match(dashboard,/stagePermissions\.production/);
  assert.match(dashboard,/stagePermissions\.boxes/);
  assert.match(dashboard,/stagePermissions\.cartons/);
  assert.match(dashboard,/api\(`\/progress\$\{suffix\}`\)/);
  const progress=read('app/api/projects-preparing/progress/route.js');
  assert.match(progress,/calculateProjectPreparationProgress/);
  assert.match(progress,/preparing\.view/);
  assert.match(progress,/progress: calculateProjectPreparationProgress/);
});


test('Shared production and carton workspaces distinguish receiving versus boxes/cartons scope',()=>{
  const production=read('app/api/projects-preparing/production/route.js');
  assert.match(production,/params.get\("scope"\)===\"boxes\"/);
  assert.match(production,/preparingStageReadable\(auth.account,stage\)/);
  const cartons=read('app/api/projects-preparing/project-cartons/route.js');
  assert.match(cartons,/params.get\("scope"\)===\"boxes\"/);
  assert.match(cartons,/preparingStageReadable\(auth.account,scope\)/);
  assert.match(read('components/preparing/ProjectProductionReceiving.jsx'),/scope=\$\{boxView/);
  assert.match(read('components/preparing/ProjectBoxDistribution.jsx'),/scope=boxes/);
  assert.match(read('components/preparing/ProjectKitCartons.jsx'),/scope=cartons/);
});
