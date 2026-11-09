import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { operationsDeliveredTransferQuantity } from '../lib/operations-delivered-transfer.mjs';

const data = readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../components/orders/OperationsOrdersHeavyModals.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../components/orders/OperationsOrdersClient.jsx', import.meta.url), 'utf8');
const excerpt = (start, end) => {
  const s = data.indexOf(start);
  const e = data.indexOf(end, s + start.length);
  assert.ok(s >= 0 && e > s, `Missing excerpt: ${start}`);
  return data.slice(s, e).replace(/^export /, '');
};
const text = value => String(value ?? '').trim();
const roundQty = value => Math.round(Number(value) * 1e6) / 1e6;
const opsType = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const makeError = (message, status = 500) => Object.assign(new Error(message), {status});
const valueFor = (row, aliases) => aliases.map(alias => row[alias]).find(value => value !== undefined) ?? null;

const partiallyDelivered = {status:'Arrived',quantity:6,quantityRequested:6,quantityReceived:4,quantityRemaining:2};

test('Delivered numbers are actually received (4 of 6), not requested or remaining', () => {
  assert.equal(operationsDeliveredTransferQuantity(partiallyDelivered),4);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered, quantityReceived:2, quantityRemaining:4}),2);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered, quantityReceived:0, quantityRemaining:6}),0);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered,status:'Shipped'}),0);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered,quantityReceived:null,quantityRemaining:2}),0);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered,quantityReceived:null,quantityRemaining:0}),6);
  assert.equal(operationsDeliveredTransferQuantity({...partiallyDelivered,quantityReceived:null,quantityRemaining:null}),0);
});

test('UI keeps All strikethrough and uses plain actual Delivered quantity', () => {
  assert.match(modal,/const partialRemainingInAll = tab === "all"/);
  assert.match(modal,/const qtyMarkup = partialRemainingInAll/);
  assert.match(modal,/tab === "delivered"\s*\? operationsDeliveredTransferQuantity\(item\)/);
  assert.match(modal,/const showReceivedDiff = tab === "archive"/);
  assert.match(modal,/onAction\("send-to-stock", deliveredActionGroup\)/);
  assert.match(modal,/onAction\("withdrawal", deliveredActionGroup\)/);
  assert.match(modal,/const deliveredActionItems = tab === "delivered"/);
  assert.match(modal,/const canSendToStock = canTransferDelivered/);
  assert.match(modal,/const canCreateWithdrawal = canTransferDelivered/);
  assert.match(client,/action: "send-to-stock", orderIds: group\.orderIds/);
  assert.match(client,/action: "create-withdrawal", orderIds: group\.orderIds/);
});

test('Actual Stocktaking row builder writes only received quantity on manual transfer', () => {
  const sandbox = {
    text, roundQty, operationsDeliveredTransferQuantity,
    serializeOperationsOrderDetail: row => ({...row,orderType:row.order_type,productName:row.product_name,orderIdNumber:row.order_number}),
    opsSupportedStockOrderType: value => opsType(value)==='requestproducts' || opsType(value)==='withdrawproducts',
    opsOrderTypeKey:opsType,
    opsResolveOwnerMember: () => ({stocktakingColumn:'school_a'}),
    resolveOperationsEditProduct: () => null,
    opsEditProductFirstTag: () => '',
    opsStockFindKey: (keys, aliases) => aliases.find(alias => keys.includes(alias)) || '',
    opsReceiptPhotosJson: () => null,
    operationsValueFor:valueFor,
    directOperationsCommittedError:makeError,
    directOperationsMutationError:makeError,
  };
  vm.runInNewContext(`${excerpt('function opsBuildStockRow(', '\nasync function opsSyncStocktakingAfterEdit(')}\nthis.run=opsBuildStockRow;`,sandbox);
  const context = {members:[],keys:['source_order_id','source_order_number','name','user_a','order_type'],sourceOrderColumn:'source_order_id',quantityColumnBySchool:new Map([['school_a','user_a']]),productMaps:{}};
  const raw = {id:15,order_number:70,order_type:'Request Products',product_name:'Grade 5 Book',...partiallyDelivered};
  const result = sandbox.run(raw, context, {deliveredOnly:true});
  assert.equal(result.row.user_a,4);
  assert.equal(result.row.source_order_id,15);
  assert.equal(result.row.source_order_number,70);
  assert.throws(()=>sandbox.run({...raw,quantityReceived:0,quantityRemaining:6},context,{deliveredOnly:true}),/No delivered quantity/);
  assert.equal(sandbox.run({...raw,quantityReceived:null,quantityRemaining:0},context,{deliveredOnly:true}).row.user_a,6);
});

test('Withdrawal from delivered partial order creates a new row with -4, not -6', async () => {
  const sourceRows = [
    {id:15,order_number:70,order_type:'Request Products',product_name:'Grade 5 Book',...partiallyDelivered},
    {id:16,order_number:70,order_type:'Request Products',product_name:'Undelivered',status:'Shipped',quantity:6,quantityReceived:0,quantityRemaining:6},
  ];
  const created = [];
  const sandbox={
    ensureOperationsMutationAccess:()=>true,
    text,roundQty,operationsDeliveredTransferQuantity,
    directOperationsMutationError:makeError,
    loadOperationRowsByIds:async ids=>({clean:ids.map(text),byId:new Map(sourceRows.map(r=>[text(r.id),r]))}),
    serializeOperationsOrderDetail: row=>({...row,orderType:row.order_type,productName:row.product_name,orderIdNumber:row.order_number}),
    orderTypeKey:opsType,orderTypeLabel:value=>value,
    repeatOrderFinalStatus:status=>/(arrived|delivered|received)/i.test(text(status)),
    repeatOrderEffectiveDeliveredQty:row=>row.quantity,
    nextOperationsOrderNumber:async()=>999,
    operationsValueFor:valueFor,
    opsEditCleanInsertRow:row=>row,
    insertOperationsRepeatRows:async rows=>{created.push(...rows);return rows;},
    invalidateLegacyOperationsCaches:async()=>true,
  };
  vm.runInNewContext(`${excerpt('export async function createOperationsRepeatOrder(', '\nfunction splitReceiptNumbers(')}\nthis.run=createOperationsRepeatOrder;`,sandbox);
  const result=await sandbox.run({account:{username:'Admin'},orderIds:['15'],action:'create-withdrawal'});
  assert.equal(result.createdCount,1);
  assert.equal(created[0].quantity_requested,-4);
  assert.equal(created[0].quantity_remaining,-4);
  await assert.rejects(sandbox.run({account:{username:'Admin'},orderIds:['15','16'],action:'create-withdrawal'}),/Delivered \/ Arrived/);
  assert.equal(created.length,1);
});
