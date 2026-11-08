// Offline, database-free contract tests for manual Send to Stock.
// Run with: node --test tests/operations-manual-send-to-stock-v357.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const data = readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/orders/operations/mutations-direct/route.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../components/orders/OperationsOrdersHeavyModals.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../components/orders/OperationsOrdersClient.jsx', import.meta.url), 'utf8');
const source = (start, end) => {
  const s = data.indexOf(start);
  const e = data.indexOf(end, s + start.length);
  assert.ok(s !== -1 && e > s, `Cannot find test excerpt: ${start}`);
  return data.slice(s, e).replace(/^export /, '');
};
const text = value => String(value ?? '').trim();
const makeError = (message, status = 500) => Object.assign(new Error(message), { status, code: 'DIRECT_OPERATIONS_MUTATION_FAILED' });
const firstOrder = { id:1, order_number:121, status:'Arrived', order_type:'Request Products', team_member_id:'u1', product_name:'Motor' };
const secondOrder = { id:2, order_number:121, status:'Arrived', order_type:'Request Products', team_member_id:'u1', product_name:'Sensor' };

function harness({ rows = [firstOrder,secondOrder], existing = [], failAfter = null } = {}) {
  const stock = existing.map(r => ({ ...r }));
  const calls = { inserted:0, invalidated:0 };
  const context = () => ({
    needed:true, sourceOrderColumn:'source_order_id',stockRows:stock.map(r => ({...r})),
    members:[{id:'u1',name:'User A',stocktakingColumn:'user_a'}],
    quantityColumnBySchool:new Map([['user_a','user_a']]),
  });
  const sandbox = {
    text,
    ensureOperationsMutationAccess: () => true,
    loadOperationRowsByIds: async ids => ({
      clean:ids.map(text),
      rows:rows.filter(row => ids.map(text).includes(text(row.id))),
      byId:new Map(rows.map(row => [text(row.id),row])),
    }),
    directOperationsMutationError:makeError,
    directOperationsCommittedError:makeError,
    serializeOperationsOrderDetail: row => ({status:row.status,orderType:row.order_type}),
    opsFinalStatus: value => /arrived|delivered|received/i.test(text(value)),
    opsOrderTypeKey: value => text(value).toLowerCase().replace(/[^a-z0-9]/g,''),
    operationsValueFor: (row,aliases) => aliases.map(alias=>row[alias]).find(v => v!==undefined) ?? null,
    getProductsCatalog: async () => ({products:[]}),
    opsPrepareStockContext: async () => context(),
    opsBuildStockRow: row => ({row:{source_order_id:row.id,user_a:3},required:['source_order_id','user_a']}),
    opsStockInsertSafe: async row => {if (calls.inserted === failAfter) throw makeError('Simulated write failure',503);stock.push(row);calls.inserted++;},
    invalidateStocktakingReadCaches:() => { calls.invalidated++; },
    upstashDeleteOperationsKeys: async () => true,
  };
  vm.runInNewContext(`${source('export async function sendOperationsDeliveredToStock(', '\n\nfunction opsHasColumn(')}\nthis.run=sendOperationsDeliveredToStock;`,sandbox);
  return { run:sandbox.run, stock, calls };
}

test('Delivered Request Products transfer adds every component exactly once', async () => {
  const {run,stock,calls}=harness();
  let result=await run({orderIds:['1','2']});
  assert.equal(result.success,true);
  assert.equal(result.stocktakingSyncedCount,2);
  assert.equal(stock.length,2);
  assert.equal(calls.invalidated,1);
  result=await run({orderIds:['1','2']});
  assert.equal(result.stocktakingSyncedCount,0);
  assert.equal(result.stocktakingSkippedCount,2);
  assert.equal(result.alreadySynced,true);
  assert.equal(stock.length,2);
  assert.equal(calls.invalidated,1);
});

test('Previously delivered/synced items are skipped and only missing ones are added', async () => {
  const {run,stock}=harness({existing:[{source_order_id:1,user_a:3}]});
  const result=await run({orderIds:['1','2']});
  assert.equal(result.stocktakingSyncedCount,1);
  assert.equal(result.stocktakingSkippedCount,1);
  assert.equal(stock.length,2);
});

test('A failed partial batch is retryable without duplicating the completed row', async () => {
  const h=harness({failAfter:1});
  await assert.rejects(h.run({orderIds:['1','2']}), e => e.status===500 && /Retry Send to Stock/.test(e.message));
  assert.equal(h.stock.length,1);
  // The second call sees persisted first row, so only the second is retried.
  const h2=harness({existing:h.stock});
  const result=await h2.run({orderIds:['1','2']});
  assert.equal(result.stocktakingSyncedCount,1);
  assert.equal(h2.stock.length,2);
});

test('Undelivered, maintenance and withdrawal rows are rejected before writes', async () => {
  for (const row of [
    {...firstOrder,status:'Shipped'},
    {...firstOrder,order_type:'Withdraw Products'},
    {...firstOrder,order_type:'Request Maintenance'},
  ]) {
    const h=harness({rows:[row]});
    await assert.rejects(h.run({orderIds:['1']}),{status:409});
    assert.equal(h.calls.inserted,0);
  }
});

test('Multiple order numbers and missing IDs reject without writes', async () => {
  const h=harness({rows:[firstOrder,{...secondOrder,order_number:122}]});
  await assert.rejects(h.run({orderIds:['1','2']}),{status:400});
  await assert.rejects(h.run({orderIds:['1','999']}),{status:404});
  assert.equal(h.calls.inserted,0);
});

test('Permission-gated API, visible workflow button, confirmation and animations are connected', () => {
  assert.match(route,/"send-to-stock": "orders\.operations\.send_to_stock"/);
  assert.match(route,/assertOrderIdsInScope\(gate\.account, actionPermission/);
  assert.match(route,/sendOperationsDeliveredToStock\(/);
  assert.match(modal,/const canSendToStock = tab === "delivered" && delivered && orderTypeKey\(group\.orderType\) === "requestproducts"/);
  assert.match(modal,/onAction\("send-to-stock", group\)/);
  assert.match(modal,/"send-to-stock": \["Send to Stock\?"/);
  assert.match(modal,/"send-to-stock"\].includes\(actionState\?\.action\)/);
  assert.match(client,/"send-to-stock": \{ title: "Sending products to Stock"/);
  assert.match(client,/startActionLoading\(loadingConfig\)/);
  assert.match(client,/finishActionLoading\("done", loadingSuccessMessage\)/);
});


test('New Send to Stock access inherits Receive only when no explicit grant exists', async () => {
  const registry = readFileSync(new URL('../lib/feature-permissions-registry.js',import.meta.url),'utf8');
  const {featureAllowed} = await import(`data:text/javascript;base64,${Buffer.from(registry).toString('base64')}`);
  const profile = grants => ({featureAccess:{mode:'enforced',grants:{'orders.operations.view':{allowed:true,scope:'all'},...grants}}});
  assert.equal(featureAllowed(profile({'orders.operations.receive':{allowed:true,scope:'all'}}),'orders.operations.send_to_stock'),true);
  assert.equal(featureAllowed(profile({'orders.operations.receive':{allowed:false,scope:'all'}}),'orders.operations.send_to_stock'),false);
  assert.equal(featureAllowed(profile({'orders.operations.receive':{allowed:true,scope:'all'},'orders.operations.send_to_stock':{allowed:false,scope:'all'}}),'orders.operations.send_to_stock'),false);
});
