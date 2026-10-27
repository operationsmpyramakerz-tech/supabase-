import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderScopeFor, ownerInOrderScope, orderCardAllows, ORDER_SCOPE_MARKERS } from '../lib/order-data-scope.mjs';
import { featureAllowed } from '../lib/feature-permissions-registry.js';

const read = path => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');
const member = (view='team', edit='own', marker=true) => ({
  teamMemberId:'manager', featureAccess:{mode:'enforced',grants:{
    'orders.maintenance.view':{allowed:true,scope:view},
    'orders.maintenance.details':{allowed:true,scope:view},
    'orders.maintenance.edit':{allowed:true,scope:edit},
    'orders.maintenance.delete':{allowed:false,scope:'all'},
    ...(marker ? {[ORDER_SCOPE_MARKERS['orders.maintenance']]:{allowed:true,scope:'all'}} : {}),
  }}
});

test('maintenance scope uses a separate explicit opt-in marker',()=>{
  assert.equal(ORDER_SCOPE_MARKERS['orders.maintenance'],'orders.maintenance.__scoped');
  assert.equal(orderScopeFor(member('team','own',false),'orders.maintenance.view'),null);
  assert.equal(orderScopeFor(member(),'orders.maintenance.view'),'team');
  assert.equal(orderScopeFor({featureAccess:{mode:'legacy'}},'orders.maintenance.view'),null);
});
test('maintenance view caps Edit, denied Delete cannot be used and no grant means no action',()=>{
  assert.equal(orderScopeFor(member('own','all'),'orders.maintenance.edit'),'own');
  assert.equal(orderScopeFor(member('team','own'),'orders.maintenance.edit'),'own');
  assert.equal(orderScopeFor(member(),'orders.maintenance.delete'),'none');
  assert.equal(orderScopeFor(member(),'orders.maintenance.export'),'none');
});
test('maintenance scoped feature grants are accepted only with marker',()=>{
  assert.equal(featureAllowed(member('team','own',false),'orders.maintenance.view'),false);
  assert.equal(featureAllowed(member(),'orders.maintenance.view'),true);
  assert.equal(featureAllowed(member(),'orders.maintenance.edit'),true);
  assert.equal(featureAllowed(member(),'orders.maintenance.delete'),false);
});
test('maintenance mutations are denied when View is denied independently of action grant',()=>{
  const account=member();
  account.featureAccess.grants['orders.maintenance.view'].allowed=false;
  assert.equal(featureAllowed(account,'orders.maintenance.edit'),false);
  assert.equal(orderScopeFor(account,'orders.maintenance.edit'),'none');
});
test('maintenance row access never infers owner from imported names',()=>{
  assert.equal(ownerInOrderScope({team_member_id:'colleague'},'team',['manager','colleague']),true);
  assert.equal(ownerInOrderScope({team_member_name:'Manager'},'team',['manager','colleague']),false);
  assert.equal(ownerInOrderScope({team_member_id:'outsider',team_member_name:'Manager'},'team',['manager','colleague']),false);
});
test('maintenance group actions require every component within scope',()=>{
  const policy={self:'manager',visibleIds:['manager','colleague'],scopes:{details:'team',edit:'own',export:'team',delete:'none'}};
  assert.equal(orderCardAllows(policy,'edit',{items:[{createdById:'manager'}]}),true);
  assert.equal(orderCardAllows(policy,'edit',{items:[{createdById:'colleague'}]}),false);
  assert.equal(orderCardAllows(policy,'export',{items:[{createdById:'manager'},{createdById:'outsider'}]}),false);
  assert.equal(orderCardAllows(policy,'delete',{items:[{createdById:'manager'}]}),false);
});
test('maintenance summary filters full raw groups before serializing while retaining pagination',()=>{
  const code=read('lib/maintenance-orders-data.js');
  assert.match(code,/rawGroups\.get\(orderNumber\)\.push\(row\)/);
  assert.match(code,/originals\.every\(row => visibleOrderRow\(row, resolvedScope\)\)/);
  assert.match(code,/resolveOrderScope\(account, "orders\.maintenance\.view"\)/);
  assert.match(code,/consumeOrderSummaryWindows/);
  assert.match(read('app/api/orders/maintenance/paged-summary/route.js'),/account: gate\.account/);
  assert.match(read('app/maintenance-orders/page.jsx'),/loadMaintenanceOrdersInitialPage\(\{ account: gate\.account \}\)/);
});
test('maintenance detail, mutation and export routes all check IDs in server scope',()=>{
  for(const path of ['app/api/orders/maintenance/details-direct/route.js', 'app/api/orders/maintenance/mutations-direct/route.js','app/api/orders/export-direct/route.js']) {
    assert.match(read(path),/assertOrderIdsInScope\(/,path);
  }
  assert.match(read('app/api/orders/maintenance/mutations-direct/route.js'),/permissionByAction\[action\]/);
  assert.match(read('app/api/orders/export-direct/route.js'),/orders\.maintenance\.export/);
});
test('maintenance card modal and actions use individual order scope to hide forbidden functionality',()=>{
  const code=read('components/orders/MaintenanceOrdersClient.jsx');
  assert.match(code,/maintenanceCardAllows\(action, group\)/);
  assert.match(code,/permissions=\{groupPermissions\(selected\)\}/);
  assert.match(code,/groupPermissions\(group\)\.details/);
  assert.match(code,/createdById: item.scopeOwnerId \?\? ""/);
  assert.match(read("lib/maintenance-orders-data.js"),/scopeOwnerId: text\(row.team_member_id\)/);
});
test('Users Center can configure Maintenance row scope and stores its marker',()=>{
  const code=read('components/users-center/UsersCenterDialogs.jsx');
  assert.match(code,/ORDER_SCOPE_MARKERS/);
  assert.match(code,/Enable row-level Own \/ Team \/ All/);
  assert.match(code,/orders\.maintenance/);
});
