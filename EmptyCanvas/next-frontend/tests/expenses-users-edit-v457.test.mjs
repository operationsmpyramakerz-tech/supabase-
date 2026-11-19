import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { duplicateExpenseOrderReason, expenseOrderCode, retainedExpenseReceipts, sameExpenseSelection } from '../lib/expense-user-edit.mjs';
import { ownCarCostForKilometers } from '../lib/own-car-expense.mjs';
import { legacyFeaturePreview } from '../lib/users-center-legacy-permission-preview.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registry = await import(`data:text/javascript;base64,${Buffer.from(read('lib/feature-permissions-registry.js')).toString('base64')}`);
const account = (allowed=true, scope='all') => ({featureAccess:{mode:'enforced',grants:{'expenses.users.view':{allowed:true,scope:'all'},'expenses.users.edit':{allowed,scope}}}});
const codes = ['ORD-148','ORD-136','ORD-135'].map(orderId=>({orderId}));
test('multiple order codes already represented by chips do not repeat; actual notes remain',()=>{
  assert.equal(duplicateExpenseOrderReason('ORD-148, ORD-136, ORD-135',codes),true);
  assert.equal(duplicateExpenseOrderReason('ord-135، ord-148',codes),true);
  assert.equal(duplicateExpenseOrderReason('ORD-148, fuel delivery',codes),false);
  assert.equal(duplicateExpenseOrderReason('Site visit 148',codes),false);
  assert.equal(duplicateExpenseOrderReason('Return to Alexandria',[]),false);
  assert.equal(duplicateExpenseOrderReason('ORD-148, ORD-999',codes),false);
  assert.equal(sameExpenseSelection(['ord:1','ord:2'],['ord:2','ord:1']),true);
  assert.equal(sameExpenseSelection(['ord:1'],['ord:2']),false);
});
test('password-free edit needs explicit edit and view grants, never inherited from legacy',()=>{
  assert.equal(registry.featureAllowed({},'expenses.users.edit'),false);
  assert.equal(registry.featureAllowed({featureAccess:{mode:'enforced',grants:{}}},'expenses.users.edit'),false);
  assert.equal(registry.featureAllowed(account(false),'expenses.users.edit'),false);
  for(const scope of ['own','team','all']) assert.equal(registry.featureAllowed(account(true,scope),'expenses.users.edit'),true);
  assert.equal(registry.featureAllowed(account(true,'assigned'),'expenses.users.edit'),false);
  const denied = account(); denied.featureAccess.grants['expenses.users.view'].allowed=false;
  assert.equal(registry.featureAllowed(denied,'expenses.users.edit'),false);
  assert.equal(legacyFeaturePreview({isEnabled:true,accessLevel:'admin'},'expenses.users.edit'),false);
  assert.equal(legacyFeaturePreview({isEnabled:true,accessLevel:'admin'},'expenses.users.delete'),true);
});
test('receipt selection preserves original attachment names and rejects forged references',()=>{
  const existing=[{url:'https://erp/one',name:'original.jpg'},{url:'https://erp/two',name:'second.jpg'}];
  assert.deepEqual(retainedExpenseReceipts(existing,undefined),existing);
  assert.deepEqual(retainedExpenseReceipts(existing,['https://erp/two']),[existing[1]]);
  assert.throws(()=>retainedExpenseReceipts(existing,['https://external/forged']),{status:400});
});
// Execute the real edit implementation with a deterministic mocked database and upload layer.
const data = read('lib/expenses-data.js');
const editSource = data.slice(data.indexOf('export async function updateExpenseForAdmin('),data.indexOf('export async function deleteExpenseForAdmin(')).replace('export async function','async function');
function fixture(overrides={}) {
  const shot={url:'https://erp/one',name:'original.jpg'};
  const row={id:'expense-1',reason:'ORD-148, ORD-136',fundsType:'Indrive',date:'2026-11-18',cashIn:0,cashOut:165,from:'Office',to:'School',kilometer:0,destinationUserId:'old',destinationUserName:'Old school',orders:[{orderId:'ORD-148'},{orderId:'ORD-136'}],shots:[shot],...overrides};
  const calls={patches:[],uploads:0,verified:0};
  const text=value=>String(value??'').trim();
  const update=vm.runInNewContext(editSource+'\nupdateExpenseForAdmin;',{
    text, number:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,
    expenseFundsTypeKey:v=>text(v).toLowerCase().replace(/[^a-z0-9]/g,''),expenseOrderCode,
    expenseError:(message,status)=>Object.assign(new Error(message),{status}),
    selectById:async()=>row,expensesTable:()=> 'expenses',serializeExpense:r=>r,
    expenseDestinationOptions:async()=>[{id:'new',name:'New school'}],
    assertExpenseOrderReferences:async(_account,payload)=>{calls.verified++;if(payload.orderIds.includes('denied'))throw Object.assign(new Error('Scope denied'),{status:403});return payload.orderIds.length?{orderLabel:'ORD-777'}:null;},
    parseScreenshots:()=>row.shots, valueFor:()=>null, retainedExpenseReceipts,
    buildExpenseScreenshotText:async({screenshots})=>{if(screenshots.length)calls.uploads++;return screenshots.length?JSON.stringify([{url:'https://erp/new',name:'new.jpg'}]):null;},
    expenseScreenshotField:JSON.stringify,
    ownCarCostForKilometers,ownCarRatePerKm:()=>5.17,
    updateById:async(_table,_id,patch)=>{calls.patches.push(JSON.parse(JSON.stringify(patch)));return {...row,...patch};},invalidateExpenseDataCaches:()=>{},
  });
  const payload={date:row.date,fundsType:row.fundsType,cashIn:row.cashIn,cashOut:row.cashOut,from:row.from,to:row.to,kilometer:row.kilometer,reason:row.reason,destinationUserId:row.destinationUserId,screenshotUrls:row.shots.map(s=>s.url),screenshots:[]};
  return {update,payload,calls};
}
test('ordinary edit leaves existing linked order IDs, destination, receipts and owner untouched',async()=>{
  const {update,payload,calls}=fixture(); await update('expense-1',{...payload,cashOut:170},account());
  const patch=calls.patches[0]; assert.equal(patch.cash_out,170); assert.equal(patch.reason,payload.reason);
  for(const k of ['orders_raw','orders_names','screenshot','destination_user_id','user_id','cash_in_from']) assert.equal(Object.hasOwn(patch,k),false,k);
  assert.equal(calls.verified,0);
});
test('new destination and multi-order links persist canonical server values in one update',async()=>{
  const {update,payload,calls}=fixture(); await update('expense-1',{...payload,destinationUserId:'new',reason:'spoof',orderSelection:{orderIds:['row-777'],orderKeys:['ord:777']}},account());
  const patch=calls.patches[0];assert.equal(patch.destination_user_id,'new');assert.equal(patch.destination_user_name,'New school');assert.equal(patch.reason,'ORD-777');assert.equal(patch.orders_names,'ORD-777');assert.equal(patch.orders_raw,'row-777');assert.equal(calls.verified,1);
});
test('switch to Other reason clears old relations and keeps manual note',async()=>{
  const {update,payload,calls}=fixture();await update('expense-1',{...payload,reason:'Site visit',orderSelection:{orderIds:[],orderKeys:[]}},account());
  assert.equal(calls.patches[0].orders_raw,null);assert.equal(calls.patches[0].orders_names,'Other reason');assert.equal(calls.patches[0].reason,'Site visit');
});
test('reject invalid destination or inaccessible order before mutation or upload',async()=>{
  for(const [change,status] of [[{destinationUserId:'missing'},400],[{orderSelection:{orderIds:['denied'],orderKeys:['ord:1']}},403],[{screenshotUrls:['https://external/forged']},400],[{cashOut:-1},400],[{date:'2026-02-30'},400]]){
    const {update,payload,calls}=fixture();await assert.rejects(update('expense-1',{...payload,...change,screenshots:[{dataUrl:'data:image/png;base64,a'}]},account()),{status}); assert.equal(calls.patches.length,0);assert.equal(calls.uploads,0);
  }
});
test('receipt additions preserve original name and enforce required screenshot policy',async()=>{
  const {update,payload,calls}=fixture(); await update('expense-1',{...payload,screenshots:[{dataUrl:'data:image/png;base64,a'}]},account());
  assert.deepEqual(JSON.parse(calls.patches[0].screenshot),[{url:'https://erp/one',name:'original.jpg'},{url:'https://erp/new',name:'new.jpg'}]);
  const second=fixture();await assert.rejects(second.update('expense-1',{...second.payload,screenshotUrls:[]},account()),{status:400});
});
test('Own car cost is computed server-side; cash in and settlement keep their transaction identity',async()=>{
  const {update,payload,calls}=fixture(); await update('expense-1',{...payload,fundsType:'Own car',cashOut:999,kilometer:3},account());assert.equal(calls.patches[0].cash_out,15.51);
  const credit=fixture({cashIn:500,cashOut:0,fundsType:'Cash Payment',reason:'Receipt 20'}); await credit.update('expense-1',{...credit.payload,cashIn:600},account()); assert.equal(credit.calls.patches[0].cash_in,600);assert.equal(credit.calls.patches[0].cash_out,0);
  const settle=fixture({fundsType:'Cash Payment',reason:'Settled my account'});await assert.rejects(settle.update('expense-1',{...settle.payload,reason:'Other reason'},account()),{status:400});
});
test('API checks feature and record scope before edit; only delete invokes Admin password',()=>{
  const route=read('app/api/expenses/mutations-direct/route.js');const branch=route.slice(route.indexOf('await assertExpenseRecordAccess'),route.indexOf('if (["cash-in"'));
  assert.match(branch,/assertExpenseRecordAccess[\s\S]*if \(action === "admin-update"\)[\s\S]*updateExpenseForAdmin[\s\S]*else[\s\S]*verifyPageAdminPasswordDirect[\s\S]*deleteExpenseForAdmin/);
  assert.doesNotMatch(branch.slice(0,branch.indexOf('} else {')), /verifyPageAdminPasswordDirect|adminPassword/);
  assert.match(read('app/api/expenses/edit-options/route.js'),/assertExpenseRecordAccess[\s\S]*scopeExpenseOrderOptions\(gate.account/);
  const editor=read('components/expenses/EditUserExpense.jsx');assert.match(editor,/ExpenseOrderMultiSelect/);assert.match(editor,/ExpenseDestinationSelect/);assert.match(editor,/ClassicFileField/);assert.match(editor,/ExpenseCurrencyInput/);
  assert.match(read('components/expenses/ExpensesUsersDialogs.jsx'),/setAction\(\{ type: "edit", rows \}\)/);
});
