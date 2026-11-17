import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { orderActionAllowed, orderActionGate } from '../lib/current-shopping-action-permissions.mjs';
import { canViewMyOrderRow, legacyMyOrderOwnerMatches } from '../lib/my-orders-owner-visibility.mjs';
import { orderScopeFor } from '../lib/order-data-scope.mjs';
import { isCompleteOrderSelection } from '../lib/order-action-selection.mjs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const grant = (allowed = true, scope = 'all') => ({ allowed, scope });
const my = ['edit','archive','unarchive','delete','update_received'].map(action => `orders.my.${action}`);
const cart = ['submit','edit_submit','undo'].map(action => `orders.shopping.${action}`);
function account(level = 'view', { grants = {}, scoped = false, viewScope = 'all' } = {}) {
  return { teamMemberId:'12', username:'Lab 1', role:level, pageAccess:{pages:[{pageName:'Current Orders',accessLevel:level},{pageName:'Create New Order',accessLevel:level}]}, featureAccess:{mode:'enforced', grants:{
    'orders.my.__enforced':grant(), 'orders.my.view':grant(true, viewScope), 'orders.shopping.view':grant(),
    ...Object.fromEntries([...my,...cart].map(k => [k,grant()])),
    ...(scoped ? {'orders.my.__scoped':grant()} : {}), ...grants
  }}};
}
const error = (message,status) => Object.assign(new Error(message),{status});
const resolveOrderScope = async (actor,key) => {
  const scope = orderScopeFor(actor,key);
  return {scope, visibleIds: scope === 'team' ? ['12','14'] : scope === 'own' ? ['12'] : []};
};
const own = {id:'1',order_number:8,team_member_id:'12',status:'Approved',product_id:'7'};
const foreign = {...own,id:'2',team_member_id:'13'};
function extract(file, start, end) {
  const src = read(file); const a=src.indexOf(start); const b=end ? src.indexOf(end,a+start.length) : src.length;
  assert.ok(a>=0 && b>a); return src.slice(a,b).replace(/^export /gm,'');
}
test('View, Edit and Admin page levels all obey the same explicit action grants', () => {
  for (const level of ['view','edit','admin']) {
    for (const key of [...my,...cart]) {
      assert.equal(orderActionAllowed(account(level),key),true,`${level} ${key}`);
      assert.equal(orderActionAllowed(account(level,{grants:{[key]:grant(false)}}),key),false,`${level} denied ${key}`);
    }
  }
});
test('A missing profile, unconfigured module, absent action, or denied module View cannot authorize password-free mutations', () => {
  for (const key of [...my,...cart]) {
    assert.equal(orderActionAllowed({role:'admin'},key),false);
    const actor=account('admin'); delete actor.featureAccess.grants[key];
    assert.equal(orderActionAllowed(actor,key),false);
    const unconfigured=account('edit'); delete unconfigured.featureAccess.grants[key.startsWith('orders.my.')?'orders.my.__enforced':'orders.shopping.view'];
    assert.equal(orderActionAllowed(unconfigured,key),false);
    const noView=account('admin',{grants:{[key.startsWith('orders.my.')?'orders.my.view':'orders.shopping.view']:grant(false)}});
    assert.equal(orderActionAllowed(noView,key),false);
  }
  const denied={ok:false,status:401}; assert.equal(orderActionGate(denied,'orders.my.edit'),denied);
  assert.equal(orderActionGate({ok:true,account:account('admin',{grants:{'orders.my.edit':grant(false)}})},'orders.my.edit').status,403);
});
test('Current Orders writes require action permission and exact owner or permitted scoped owner before touching DB', async () => {
  const code=extract('lib/current-orders-data.js','export async function performCurrentOrdersProtectedAction(');
  for(const action of ['archive','unarchive','delete']) {
    let writes=0; let selected=[{...own,status:action==='unarchive'?'Archive':'Approved'}];
    const sandbox={orderActionAllowed, resolveOrderScope, canViewMyOrderRow,isCompleteOrderSelection,text:v=>String(v??'').trim(),cleanCurrentActionIds:v=>v,isSupabaseConfigured:()=>true,
      directCurrentMutationError:error,loadRawOrderRowsByIds:async()=>selected,select:async()=>selected,tableName:()=> 'orders',
      statusIndex:s=>s==='Archive'?5:2,useAtomicOrderActions:()=>false,updateByIds:async(_t,ids)=>{writes++;return ids;},deleteByIds:async(_t,ids)=>{writes++;return ids;},invalidateLegacyOperationsCaches:async()=>{}};
    vm.runInNewContext(code,sandbox);
    const run=(actor)=>sandbox.performCurrentOrdersProtectedAction({account:actor,action,orderIds:selected.map(r=>r.id)});
    await assert.rejects(run(account('admin',{grants:{[`orders.my.${action}`]:grant(false)}})),{status:403});
    selected=[{...foreign,status:action==='unarchive'?'Archive':'Approved'}];
    await assert.rejects(run(account()),{status:403});
    await assert.rejects(run(account('view',{scoped:true,viewScope:'own'})),{status:403});
    assert.equal(writes,0);
    assert.equal((await run(account('view',{scoped:true}))).success,true);
    selected=[{...own,status:action==='unarchive'?'Archive':'Approved'}];
    assert.equal((await run(account('view'))).success,true);
    assert.equal(writes,2);
  }
});
test('Shopping Cart edit lookup rejects foreign, partial and mixed-order IDs; Undo depends on owner, not My Orders Edit', async () => {
  let loaded=[own]; let all=[own];
  const sandbox={loadRawOrderRowsByIds:async()=>loaded,text:v=>String(v??'').trim(),directError:error,resolveOrderScope,canViewMyOrderRow,rowOwnedByAccount:legacyMyOrderOwnerMatches,isCompleteOrderSelection,select:async()=>all,orderTable:()=> 'orders'};
  vm.runInNewContext(extract('lib/shopping-cart-order-service.js','async function verifyOwnedRows(','export async function initializeCurrentOrderEditDirect('),sandbox);
  const run=(ids,actor,opts)=>sandbox.verifyOwnedRows(ids,actor,opts);
  assert.equal((await run(['1'],account())).length,1);
  loaded=[foreign]; all=[foreign];
  await assert.rejects(run(['2'],account()),{status:403});
  assert.equal((await run(['2'],account('view',{scoped:true}))).length,1);
  await assert.rejects(run(['2'],account('view',{scoped:true}),{undo:true}),{status:403});
  loaded=[own]; all=[own,{...own,id:'3'}];
  await assert.rejects(run(['1'],account()),{status:409});
  loaded=[own,{...own,id:'3',order_number:9}]; all=loaded;
  await assert.rejects(run(['1','3'],account()),{status:409});
  loaded=[own]; all=[own];
  assert.equal((await run(['1'],account('view',{grants:{'orders.my.edit':grant(false)}}),{undo:true})).length,1);
});
test('Fresh submit permission, double grant for edited submission, and undo grant are checked before processing', async () => {
  let calls=0;
  const sandbox={orderActionAllowed,isSupabaseConfigured:()=>true,directError:error,text:v=>String(v??'').trim(),createNewOrderDirect:async()=>++calls,updateExistingOrderDirect:async()=>++calls};
  vm.runInNewContext(extract('lib/shopping-cart-order-service.js','export async function submitShoppingCartOrderDirect(','export const __shoppingCartOrderServiceTest'),sandbox);
  const run=(actor,editMode)=>sandbox.submitShoppingCartOrderDirect({account:actor,editMode,editToken:'token'});
  await assert.rejects(run(account('admin',{grants:{'orders.shopping.submit':grant(false)}}),false),{status:403});
  for (const key of ['orders.my.edit','orders.shopping.edit_submit']) await assert.rejects(run(account('admin',{grants:{[key]:grant(false)}}),true),{status:403});
  await assert.rejects(sandbox.undoShoppingCartOrderDirect({account:account('admin',{grants:{'orders.shopping.undo':grant(false)}}),undoToken:'token'}),{status:403});
  assert.equal(calls,0);
  assert.equal(await run(account('view'),false),1);
  assert.equal(await run(account('view'),true),2);
});
test('Editor and undo tokens are signed and bind to member ID rather than a mutable username', () => {
  const sandbox={crypto,Buffer,Date,accountMemberId:a=>a.teamMemberId, text:v=>String(v??'').trim(),directError:error,sessionSigningSecret:()=> 'private-test-only-signing-key'};
  vm.runInNewContext(extract('lib/shopping-cart-order-service.js','function signingSecret()','function productMaps('),sandbox);
  const token=sandbox.signPayload({scope:'edit-order',uid:'12',ids:['1'],exp:Date.now()+60000});
  assert.equal(sandbox.verifySignedPayload(token,'edit-order',{teamMemberId:'12',username:'Renamed'}).uid,'12');
  assert.throws(()=>sandbox.verifySignedPayload(token,'edit-order',{teamMemberId:'13',username:'Lab 1'}),{status:403});
  assert.throws(()=>sandbox.verifySignedPayload(token,'undo-order',{teamMemberId:'12'}),{status:400});
  const expired=sandbox.signPayload({scope:'edit-order',uid:'12',exp:Date.now()-100});
  assert.throws(()=>sandbox.verifySignedPayload(expired,'edit-order',{teamMemberId:'12'}),{status:400});
});
test('Current Orders direct action flow retains only ordinary delete confirmation and sends no password', () => {
  const client=read('components/orders/CurrentOrdersClient.jsx'); const modal=read('components/orders/CurrentOrdersHeavyModals.jsx');
  assert.doesNotMatch(client+modal,/adminPassword|Admin password|PasswordModal|DeleteVerificationDialog/);
  assert.match(client,/void submitAction\(action, group\)/);
  assert.match(client,/setDeleteConfirm\(\{ group \}\)/);
  assert.match(modal,/<DeleteConfirmDialog/);
  assert.match(client,/actionInFlight\.current/);
  for (const route of ['current/edit-direct','current/mutations-direct','current/update-received-direct','shopping-cart/submit-direct','shopping-cart/undo-direct','shopping-cart/request-image']) {
    const src=read(`app/api/orders/${route}/route.js`);
    assert.match(src,/orderActionGate\(/); assert.doesNotMatch(src,/adminPassword/);
  }
});
