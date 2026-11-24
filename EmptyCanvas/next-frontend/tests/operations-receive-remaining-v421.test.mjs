import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { operationsMatchesTab } from '../lib/operations-remaining-status.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const server = read('lib/operations-orders-data.js');
const client = read('components/orders/OperationsOrdersClient.jsx');
const modal = read('components/orders/OperationsOrdersHeavyModals.jsx');
const route = read('app/api/orders/operations/mutations-direct/route.js');
const migration = read('2026-11-16-operations-remaining-receipts-v421.sql');
const start = server.indexOf('export async function receiveOperationsRemainingBatch(');
const end = server.indexOf('\nexport async function markOperationsShipped(', start);
assert.ok(start >= 0 && end > start);
const script = server.slice(start, end).replace(/^export /, '');

const text = value => String(value ?? '').trim();
const makeError = (message, status = 409) => Object.assign(new Error(message), {status, code: 'DIRECT_OPERATIONS_MUTATION_FAILED'});
const row = (id, status = 'Arrived', received = 5, remaining = 5, order_number = 108) => ({
  id: String(id), status, order_number, order_type: 'Request Products',
  quantity_requested: received + remaining,
  quantity_received_by_operations: received, quantity_remaining: remaining,
});

function harness(rows = [row(10), row(11, 'Shipped', 3, 7)]) {
  const state = { calls: [], invalidations: 0 };
  const sandbox = {
    text,
    ensureOperationsMutationAccess: () => true,
    loadOperationRowsByIds: async ids => ({
      clean: ids.map(text),
      rows: rows.filter(r => ids.some(id => text(id) === text(r.id))),
      byId: new Map(rows.map(r => [text(r.id), r])),
    }),
    directOperationsMutationError: makeError,
    opsOrderTypeKey: value => text(value).toLowerCase().replace(/[^a-z0-9]/g, ''),
    statusIndex: value => /arrived|delivered|received/i.test(value) ? 4 : /shipped/i.test(value) ? 3 : 1,
    serializeOperationsOrderDetail: r => ({ quantityRemaining: r.quantity_remaining }),
    roundQty: value => Math.round(value * 1e6) / 1e6,
    supabaseRequest: async (path, options) => {
      state.calls.push({path, options});
      return {receivedCount: Object.values(options.body.p_quantities).length};
    },
    invalidateLegacyOperationsCaches: async () => { state.invalidations++; },
    recordHistoryForAccount: async () => {},
  };
  vm.runInNewContext(`${script}\nthis.run = receiveOperationsRemainingBatch;`, sandbox);
  return { run: sandbox.run, state };
}

test('mixed delivered and shipping batches can share Shipping/Remaining/Delivered tabs', () => {
  const mixed = {stage: 4, hasRemaining: true, hasReceived: true, hasShipping: true, maintenance: false};
  assert.equal(operationsMatchesTab(mixed, 'remaining'), true);
  assert.equal(operationsMatchesTab(mixed, 'received'), true);
  assert.equal(operationsMatchesTab(mixed, 'delivered'), true);
  assert.equal(operationsMatchesTab({...mixed, hasShipping: false}, 'received'), false);
  assert.equal(operationsMatchesTab({...mixed, stage: 5}, 'remaining'), false);
  assert.equal(operationsMatchesTab({...mixed, stage: 5}, 'received'), false);
});

test('batch receipt sends only the NEW quantity, never the previously delivered total', async () => {
  const {run, state} = harness();
  const result = await run({account: {username: 'Ops Test'}, orderIds: ['10','11'], quantities: {'10':2, '11':0}, receiptNumber:'R-42'});
  assert.equal(result.success, true);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].path, '/rpc/operations_receive_remaining_v423');
  assert.equal(state.calls[0].options.body.p_legacy_link_confirmed, false);
  assert.equal(state.calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0].options.body.p_quantities)), {'10':2});
  assert.equal(state.calls[0].options.body.p_received_by,'Ops Test');
  assert.equal(state.invalidations,1);
});

test('invalid, oversized, and out-of-scope quantities never trigger a mutation', async () => {
  const {run, state} = harness();
  for (const quantities of [{'10': 6},{'10':-1},{'10':'bad'},{'999':1},{'10':0}]) {
    await assert.rejects(() => run({account:{},orderIds:['10','11'],quantities}));
  }
  assert.equal(state.calls.length,0);
});

test('database split remains atomic, retains original stock source, and starts a distinct shipped batch', () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /INSERT INTO public\.orders/);
  assert.match(migration, /v_new_ids := v_new_ids/);
  assert.match(migration, /quantity_received_by_operations = v_received/);
  assert.match(migration, /quantity_remaining = 0/);
  assert.match(migration, /'status', 'Shipped'/);
  assert.match(migration, /'order_receipt', NULL/);
  assert.match(migration, /REVOKE ALL.*FROM PUBLIC/);
  assert.match(migration, /TO service_role/);
  assert.match(route, /"receive-remaining": "orders\.operations\.ship"/);
  assert.match(route, /assertOrderIdsInScope\(gate\.account, actionPermission/);
  assert.match(client, /receiveAnotherBatch \? "receive-remaining" : "mark-shipped"/);
  assert.match(modal, /actionScope: orderTypeKey\(group\.orderType\) === "requestproducts" \? "remaining-batch" : "remaining-legacy"/);
  assert.match(modal, /shippingActionGroup/);
});
