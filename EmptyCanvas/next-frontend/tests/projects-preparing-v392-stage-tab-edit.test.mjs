import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FEATURE_DEFINITIONS, ACTIVE_PILOT_FEATURE_KEYS, isKnownFeature} from '../lib/feature-permissions-registry.js';
import {preparingStageAllowed, preparingStageReadable, preparingTabsGranular, preparingTabEditAllowed} from '../lib/preparing-stage-access.js';
import {PREPARING_EDIT_TAB_LABELS, preparingTabKey, preparingRowMatchesTab} from '../lib/preparing-tab-permissions.mjs';
const read = file => fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const account = (values={}) => ({featureAccess:{mode:'enforced',grants:Object.fromEntries(Object.entries(values).map(([key,allowed])=>[key,{allowed,scope:'all'}]))}});
const baseline = {'preparing.view':true,'preparing.stages.__granular':true,...Object.fromEntries(Object.keys(PREPARING_EDIT_TAB_LABELS).map(stage=>[`preparing.stage.${stage}`,true]))};
test('all tabs have individual registered grants, accepted by the database key constraint',()=>{
  const tabs=Object.entries(PREPARING_EDIT_TAB_LABELS);
  assert.equal(tabs.length,6);
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes('preparing.tabs.__granular'));
  for(const [stage,options] of tabs) for(const tab of Object.keys(options)) {
    const key=preparingTabKey(stage,tab);
    assert.match(key,/^[a-z][a-z0-9_.]{2,99}$/);
    assert.equal(isKnownFeature(key),true);
    assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key),key);
    assert.ok(FEATURE_DEFINITIONS.find(x=>x.key===key),key);
  }
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.length<250);
  assert.equal(preparingTabKey('production','not-received'),'preparing.tab.production.not_received');
  assert.equal(preparingTabKey('boxes','not-packed'),'preparing.tab.boxes.not_packed');
});
test('new tab restrictions opt in; existing users retain their current rights',()=>{
  const old=account(baseline);
  assert.equal(preparingTabsGranular(old),false);
  for(const [stage,options] of Object.entries(PREPARING_EDIT_TAB_LABELS))
    for(const tab of Object.keys(options)) assert.equal(preparingTabEditAllowed(old,stage,tab),true);
  const restricted=account({...baseline,'preparing.tabs.__granular':true, [preparingTabKey('warehouse','received')]:true});
  assert.equal(preparingTabsGranular(restricted),true);
  assert.equal(preparingStageReadable(restricted,'warehouse'),true);
  assert.equal(preparingStageAllowed(restricted,'warehouse'),true);
  assert.equal(preparingTabEditAllowed(restricted,'warehouse','all'),false);
  assert.equal(preparingTabEditAllowed(restricted,'warehouse','received'),true);
  assert.equal(preparingTabEditAllowed(restricted,'warehouse','available'),false);
  assert.equal(preparingTabEditAllowed(restricted,'testing','received'),false);
  assert.equal(preparingTabEditAllowed(account({...baseline,'preparing.tabs.__granular':true,'preparing.stage.warehouse':false,[preparingTabKey('warehouse','received')]:true}),'warehouse','received'),false);
});
test('tab membership exactly matches current row status (including partial receipts)',()=>{
  assert.equal(preparingRowMatchesTab('intake','pending',{required:5,tested:4}),true);
  assert.equal(preparingRowMatchesTab('intake','received',{required:5,tested:4}),true);
  assert.equal(preparingRowMatchesTab('intake','pending',{required:5,tested:5}),false);
  assert.equal(preparingRowMatchesTab('testing','pending',{required:5,tested:0,productionIntakeReceived:0}),false);
  assert.equal(preparingRowMatchesTab('testing','pending',{required:5,tested:0,productionIntakeReceived:4}),true);
  assert.equal(preparingRowMatchesTab('testing','pending',{required:5,tested:4,productionIntakeReceived:4}),false);
  assert.equal(preparingRowMatchesTab('testing','done',{required:5,tested:5}),true);
  assert.equal(preparingRowMatchesTab('testing','done',{required:5,tested:4}),false);
  assert.equal(preparingRowMatchesTab('warehouse','short',{required_qty:5,accepted:4}),true);
  assert.equal(preparingRowMatchesTab('warehouse','received',{accepted:4}),true);
  assert.equal(preparingRowMatchesTab('warehouse','available',{readyToReceive:1}),true);
  assert.equal(preparingRowMatchesTab('production','not-received',{productionReceived:0}),true);
  assert.equal(preparingRowMatchesTab('production','received',{productionReceived:4}),true);
  assert.equal(preparingRowMatchesTab('boxes','available',{productionReceived:4,unpacked:1}),true);
  assert.equal(preparingRowMatchesTab('boxes','packed',{packedQty:1}),true);
  assert.equal(preparingRowMatchesTab('boxes','not-packed',{productionReceived:4,packedQty:0}),true);
  assert.equal(preparingRowMatchesTab('cartons','draft',{status:'draft'}),true);
  assert.equal(preparingRowMatchesTab('cartons','ready',{status:'draft'}),false);
  assert.equal(preparingRowMatchesTab('production','unknown',{productionReceived:4}),false);
});
test('all six stage UIs and every mutation endpoint include tab edit protections',()=>{
  for(const path of ['intake','testing','warehouse','production','project-cartons'])
    assert.match(read(`app/api/projects-preparing/${path}/route.js`),/requirePreparingTabWrite/);
  const backend=read('lib/preparing-tab-write-server.js');
  assert.match(backend,/preparingRowMatchesTab/);
  assert.match(backend,/projectCartonWorkspace/);
  assert.match(backend,/productionWorkspace/);
  for (const comp of ['ProjectProductionIntake','ProjectTesting','ProjectWarehouseReceiving','ProjectProductionReceiving','ProjectBoxDistribution','ProjectKitCartons']) {
    const code=read(`components/preparing/${comp}.jsx`);
    assert.match(code,/editTabs/);
    assert.match(code,/editTab:/);
    assert.match(code,/canEditTab/);
  }
  const registry=read('components/users-center/UsersCenterDialogs.jsx');
  assert.match(registry,/preparing\.tabs\.__granular/);
  assert.match(registry,/preparing\.tab\./);
});
