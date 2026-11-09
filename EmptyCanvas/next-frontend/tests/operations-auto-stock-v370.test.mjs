import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { operationsDeliveredTransferQuantity } from '../lib/operations-delivered-transfer.mjs';

const source = readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../components/orders/OperationsOrdersClient.jsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../components/orders/OperationsOrdersHeavyModals.jsx', import.meta.url), 'utf8');
const start = source.indexOf('export async function markOperationsArrived(');
const end = source.indexOf('\nexport async function saveOperationsEditDetails(', start);
assert.ok(start > -1 && end > start);
const markSrc = source.slice(start, end).replace(/^export /, '');

const text = value => String(value ?? '').trim();
const makeError = (message, status = 500) => Object.assign(new Error(message), { status, code: 'DIRECT_OPERATIONS_MUTATION_FAILED' });
const row = (id, received, remaining) => ({
  id: String(id), order_type: 'Request Products', status: 'Shipped', order_receipt: null,
  quantity_requested: received + remaining, quantity_received_by_operations: received,
  quantity_remaining: remaining,
});

function harness({ rows = [row(62, 4, 2), row(63, 0, 6)], stockPreflightError = null, stockSyncError = null } = {}) {
  const state = { events: [], transferredIds: [], transferredQty: [], syncCalls: 0, writes: 0, uploads: 0 };
  const all = rows.map(item => ({ ...item }));
  const serialize = item => ({
    ...item, orderType: item.order_type, quantity: item.quantity_requested,
    quantityReceived: item.quantity_received_by_operations,
    quantityRemaining: item.quantity_remaining,
  });
  const sandbox = {
    text, operationsDeliveredTransferQuantity,
    directOperationsMutationError: makeError,
    directOperationsCommittedError: makeError,
    ensureOperationsMutationAccess: () => true,
    directPageMutationAccess: () => true,
    featureAllowed: () => true,
    loadOperationRowsByIds: async ids => ({ clean: ids.map(text), rows: all,
      byId: new Map(all.map(item => [text(item.id), item])) }),
    serializeOperationsOrderDetail: serialize,
    statusIndex: value => ({ Shipped: 3, Arrived: 4 }[value] || 1),
    splitReceiptNumbers: () => [], mergeReceiptNumbers: () => '',
    opsReceiptUploadInput: () => [{ buffer: Buffer.from('image'), cleanName: 'receipt.jpg', safeExt: 'jpg', contentType: 'image/jpeg' }],
    opsOrderTypeKey: value => text(value).toLowerCase().replace(/[^a-z0-9]/g, ''),
    getProductsCatalog: async () => ({ products: [] }),
    opsPrepareStockContext: async stockRows => {
      state.events.push('preflight');
      if (stockPreflightError) throw stockPreflightError;
      assert.deepEqual(Array.from(stockRows.map(item => text(item.id))), ['62']);
      return { needed: true };
    },
    opsBuildStockRow: (item, _context, options) => {
      assert.equal(options.deliveredOnly, true);
      state.transferredQty.push(operationsDeliveredTransferQuantity(serialize(item)));
      return { row: {}, required: [] };
    },
    getSupabaseConfig: () => ({ storageBucket: 'test' }),
    uploadStorageObject: async () => {
      state.events.push('upload'); state.uploads += 1;
      return { publicUrl: 'https://example.test/photo.jpg' };
    },
    opsReceiptStoragePath: () => 'receipts/photo.jpg',
    mapWithConcurrency: async (ids, _max, fn) => Promise.all(ids.map(fn)),
    updateById: async (_table, id, patch) => {
      state.events.push('update'); state.writes += 1;
      const current = all.find(item => item.id === text(id));
      Object.assign(current, patch);
      return { ...current };
    },
    operationsValueFor: (item, aliases) => aliases.map(alias => item?.[alias]).find(v => v !== undefined) ?? null,
    tableName: () => 'orders',
    sendOperationsDeliveredToStock: async options => {
      state.syncCalls += 1; state.events.push('stock');
      assert.equal(options.automaticDelivery, true);
      assert.deepEqual(Array.from(options.orderIds), ['62']);
      if (stockSyncError) throw stockSyncError;
      state.transferredIds.push(...options.orderIds);
      return { stocktakingSyncedCount: 1, stocktakingSkippedCount: 0 };
    },
    invalidateLegacyOperationsCaches: async () => {},
  };
  vm.runInNewContext(`${markSrc}\nthis.run = markOperationsArrived;`, sandbox);
  return { run: sandbox.run, state };
}

test('Mark as Delivered auto-transfers only received quantities for mixed orders', async () => {
  const { run, state } = harness();
  const result = await run({ orderIds: ['62', '63'], account: {} });
  assert.equal(result.success, true);
  assert.equal(result.stocktakingSyncedCount, 1);
  assert.deepEqual(state.transferredQty, [4]);
  assert.deepEqual(state.transferredIds, ['62']);
  assert.equal(state.writes, 2);
  assert.equal(state.uploads, 1);
  assert.equal(state.syncCalls, 1);
  assert.ok(state.events.indexOf('preflight') < state.events.indexOf('upload'));
  assert.ok(state.events.indexOf('stock') > state.events.lastIndexOf('update'));
});

test('An order without any received quantity cannot silently turn Delivered without adding stock', async () => {
  const { run, state } = harness({ rows: [row(62, 0, 6)] });
  await assert.rejects(run({ orderIds: ['62'] }), error => error.status === 409 && /No received quantities/.test(error.message));
  assert.equal(state.writes, 0);
  assert.equal(state.uploads, 0);
  assert.equal(state.syncCalls, 0);
});

test('A missing stocktaking configuration blocks delivery before updates or uploads', async () => {
  const { run, state } = harness({ stockPreflightError: makeError('Stocktaking source_order_id missing', 409) });
  await assert.rejects(run({ orderIds: ['62', '63'] }), err => err.status === 409);
  assert.equal(state.writes, 0);
  assert.equal(state.uploads, 0);
});

test('A stock sync error after status update is reported as a committed/partial failure', async () => {
  const { run, state } = harness({ stockSyncError: makeError('Stocktaking unavailable', 503) });
  await assert.rejects(run({ orderIds: ['62', '63'] }), error => error.status === 503 && /Stocktaking unavailable/.test(error.message));
  assert.equal(state.writes, 2);
  assert.equal(state.syncCalls, 1);
});

test('Manual Send to Stock remains and delivery UI no longer instructs user to press it', () => {
  assert.match(source, /await sendOperationsDeliveredToStock\(\{ account, orderIds: requestIds, automaticDelivery: true \}\)/);
  assert.match(ui, /added to Stocktaking automatically/);
  assert.doesNotMatch(ui, /Use Send to Stock to add its components/);
  assert.match(modal, /Send to Stock remains available for manual reconciliation/);
});
