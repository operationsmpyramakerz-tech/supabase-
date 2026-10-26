// Phase 29 - focused functional regressions (no live database needed).
// Run: node --test tests/orders-phase29-edit-archive.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isCompleteOrderSelection } from '../lib/order-action-selection.mjs';

function excerpt(file, start, end) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const a = source.indexOf(start);
  assert.ok(a >= 0, `Missing source function: ${start}`);
  // Both exported functions under test are the final declarations in their files.
  return source.slice(a).replace(/^export /, '');
}
const error = (message, status) => Object.assign(new Error(message), { status });
const text = value => String(value ?? '').trim();

function currentHarness(rows, { changedRows = null, savedRows = null } = {}) {
  rows = rows.map(row => ({ order_number: 117, ...row }));
  const calls = { updates: 0, deletes: 0 };
  const sandbox = {
    text,
    directPageMutationAccess: () => true,
    cleanCurrentActionIds: ids => ids.map(text),
    isSupabaseConfigured: () => true,
    verifyPageAdminPasswordDirect: async () => true,
    loadRawOrderRowsByIds: async () => rows,
    updateByIds: async (_table, ids, data) => {
      calls.updates++;
      return changedRows ?? ids.map(id => ({ id, ...data }));
    },
    deleteByIds: async (_table, ids) => { calls.deletes++; return ids.map(id => ({ id })); },
    tableName: () => 'orders',
    select: async () => (savedRows ?? rows).map(row => ({ id: row.id, order_number: row.order_number })),
    isCompleteOrderSelection,
    invalidateLegacyOperationsCaches: async () => {},
    directCurrentMutationError: error,
    statusIndex: value => /archiv/i.test(value) ? 5 : 2,
  };
  vm.runInNewContext(excerpt('../lib/current-orders-data.js', 'export async function performCurrentOrdersProtectedAction(', '\n}'), sandbox);
  return { run: sandbox.performCurrentOrdersProtectedAction, calls };
}

test('Current Orders cannot re-archive already archived components', async () => {
  const { run, calls } = currentHarness([{ id: '1', status: 'Archive' }]);
  await assert.rejects(run({ action: 'archive', orderIds: ['1'], adminPassword: 'p' }), { status: 409 });
  assert.equal(calls.updates, 0);
});

test('Current Orders cannot restore non-archived or mixed-state orders', async () => {
  const { run, calls } = currentHarness([{ id: '1', status: 'Archive' }, { id: '2', status: 'Shipped' }]);
  await assert.rejects(run({ action: 'unarchive', orderIds: ['1', '2'], adminPassword: 'p' }), { status: 409 });
  assert.equal(calls.updates, 0);
});

test('Current Orders archive/restore updates exactly the selected components', async () => {
  const arch = currentHarness([{ id: '1', status: 'Shipping' }, { id: '2', status: 'Shipping' }]);
  const result = await arch.run({ action: 'archive', orderIds: ['1', '2'], adminPassword: 'p' });
  assert.equal(result.status, 'Archive');
  assert.equal(arch.calls.updates, 1);
  const restore = currentHarness([{ id: '1', status: 'Archive' }, { id: '2', status: 'Archive' }]);
  const restored = await restore.run({ action: 'unarchive', orderIds: ['1', '2'], adminPassword: 'p' });
  assert.equal(restored.status, 'In progress');
});

test('Current Orders rejects deleting only part of an existing order', async () => {
  const { run, calls } = currentHarness([{ id: '1', status: 'Shipped' }], {
    savedRows: [{ id: '1', order_number: 117 }, { id: '2', order_number: 117 }],
  });
  await assert.rejects(run({ action: 'delete', orderIds: ['1'], adminPassword: 'p' }), { status: 409 });
  assert.equal(calls.deletes, 0);
});

test('Current Orders reports partial updates instead of false success', async () => {
  const { run } = currentHarness([{ id: '1', status: 'Shipped' }, { id: '2', status: 'Shipped' }], { changedRows: [{ id: '1' }] });
  await assert.rejects(run({ action: 'archive', orderIds: ['1', '2'], adminPassword: 'p' }), { status: 409 });
});

function editHarness() {
  const calls = { reads: 0, writes: 0 };
  const row = { id: '1', source_kits: null };
  const sandbox = {
    text,
    ensureOperationsMutationAccess: () => true,
    loadOperationRowsByIds: async () => ({ clean: ['1'], byId: new Map([['1', row]]), rows: [row] }),
    directOperationsAdminPasswordResult: async () => true,
    directOperationsMutationError: error,
    getProductsCatalog: async () => { calls.reads++; return { products: [] }; },
    opsEditSplitOrderRow: () => null,
    opsEditBuildItemPatch: () => ({}),
    serializeOperationsOrderDetail: () => ({ quantity: 1 }),
    opsEditApplyQuantityMapPatch: () => ({}),
    opsPrepareStockContext: async () => ({ needed: false }),
    opsSyncStocktakingAfterEdit: async () => ({ synced: 0, skipped: 0 }),
    invalidateLegacyOperationsCaches: async () => {},
    loadOperationRowsByIds: async () => ({ clean: ['1'], byId: new Map([['1', row]]), rows: [row] }),
    deleteById: async () => { calls.writes++; },
    opsEditUpdateOrderSafe: async () => { calls.writes++; return row; },
    opsEditCloneOrderInsertRow: x => x,
    opsEditInsertOrderSafe: async () => { calls.writes++; return row; },
  };
  // The isolated function returns its mutation plan before touching any DB writes.
  const src = excerpt('../lib/operations-orders-data.js', 'export async function saveOperationsEditDetails(', '\n}');
  vm.runInNewContext(`${src}\nthis.run=saveOperationsEditDetails;`, sandbox);
  return { run: sandbox.run, calls };
}

test('Operations edit rejects stale row IDs before catalog lookup or writing', async () => {
  const { run, calls } = editHarness();
  await assert.rejects(run({ orderIds: ['1'], itemUpdates: [{ id: '99', requestedQty: 2 }] }), { status: 409 });
  assert.equal(calls.reads, 0);
  assert.equal(calls.writes, 0);
});

test('Operations edit cannot turn a stale source-specific deletion into a full row deletion', async () => {
  const { run, calls } = editHarness();
  await assert.rejects(run({ orderIds: ['1'], itemDeletes: [{ id: '1', sourceSpecific: true, sourceKitId: 'missing-kit' }] }), { status: 409 });
  assert.equal(calls.writes, 0);
});

test('Desktop empty-state spans every grid track while mobile keeps current layout', () => {
  const css = fs.readFileSync(new URL('../public/css/orders-workspace.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 769px\)[\s\S]*?\.co-cards > \.orders-workspace-empty\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1\s*!important/);
});
