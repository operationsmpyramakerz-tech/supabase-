// Focused regression checks for Phase 28: no live Supabase required.
// Runs with: node --test tests/orders-phase28-workflow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function excerpt(file, start, end) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Cannot isolate ${start}`);
  return source.slice(from, to).replace(/^export /, '');
}

function makeError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}
const text = (value) => String(value ?? '').trim();
const makeOps = (rows, { maintenanceAllowed = true, operationsAllowed = true } = {}) => {
  const calls = { writes: 0, uploads: 0 };
  const sandbox = {
    text, calls,
    directPageMutationAccess: (_account, pages) => maintenanceAllowed && pages.includes('Maintenance Orders'),
    ensureOperationsMutationAccess: () => operationsAllowed ? true : (() => { throw makeError('Forbidden', 403); })(),
    featureAllowed: (account, key) => account?.featureAccess?.mode !== "enforced" || account?.featureAccess?.grants?.[key]?.allowed === true,
    directOperationsMutationError: makeError,
    loadOperationRowsByIds: async (ids) => ({ clean: ids.map(text), rows, byId: new Map(rows.map(r => [text(r.id), r])) }),
    serializeOperationsOrderDetail: row => ({ ...row, orderType: row.order_type, maintenanceLogs: row.maintenanceLogs || [], sparePartsReplacedEntries: row.sparePartsReplacedEntries || [] }),
    statusIndex: value => value === 'Archive' ? 5 : value === 'Arrived' ? 4 : value === 'Shipped' ? 3 : 2,
    opsReceiptUploadInput: () => [{ buffer: 'image', contentType: 'image/jpeg', cleanName: 'receipt.jpg', safeExt: 'jpg' }],
    mergeReceiptNumbers: () => '',
    splitReceiptNumbers: value => (Array.isArray(value) ? value : [value]).flatMap(item => String(item ?? '').split(',')).map(item => item.trim()).filter(Boolean),
    opsHasColumn: () => true,
    opsSupportedStockOrderType: () => false,
    getSupabaseConfig: () => ({ storageBucket: 'test' }),
    uploadStorageObject: async () => { calls.uploads += 1; return { publicUrl: 'https://example.test/file.jpg' }; },
    opsReceiptStoragePath: () => 'receipt.jpg',
    mapWithConcurrency: async (ids, count, fn) => Promise.all(ids.map(fn)),
    updateById: async (_table, id, patch) => { calls.writes += 1; return { ...rows.find(r => text(r.id) === text(id)), ...patch }; },
    operationsValueFor: () => null,
    tableName: () => 'orders',
    invalidateLegacyOperationsCaches: async () => {},
  };
  const src = excerpt('../lib/operations-orders-data.js', 'export async function markOperationsArrived(', '\nexport async function saveOperationsEditDetails(');
  vm.runInNewContext(`${src}\nthis.run = markOperationsArrived;`, sandbox);
  return { run: sandbox.run, calls };
};

const maintRow = (id, status = 'In progress', logs = [{ repairAction: 'Fixed', loggedAt: '2026-10-01' }]) => ({
  id, order_type: 'Request Maintenance', status, order_receipt: null, maintenanceLogs: logs,
});
const productRow = (id, status = 'Shipped') => ({ id, order_type: 'Request Products', status, order_receipt: null });

test('maintenance-only editor can deliver logged in-progress maintenance (without Operations edit)', async () => {
  const { run, calls } = makeOps([maintRow(1)], { operationsAllowed: false });
  const value = await run({ account: {}, orderIds: ['1'], maintenanceOnly: true });
  assert.equal(value.success, true);
  assert.equal(value.status, 'Arrived');
  assert.equal(calls.uploads, 1);
  assert.equal(calls.writes, 1);
});

test('maintenance permission does not authorize product delivery', async () => {
  const { run, calls } = makeOps([productRow(1)]);
  await assert.rejects(run({ account: {}, orderIds: ['1'], maintenanceOnly: true }), { status: 403 });
  assert.equal(calls.uploads, 0);
  assert.equal(calls.writes, 0);
});

test('maintenance without a log cannot be marked delivered', async () => {
  const { run, calls } = makeOps([maintRow(1, 'In progress', [])]);
  await assert.rejects(run({ account: {}, orderIds: ['1'], maintenanceOnly: true }), { status: 409 });
  assert.equal(calls.uploads, 0);
});

test('completed/archived orders cannot overwrite receipt photos', async () => {
  for (const status of ['Arrived', 'Archive']) {
    const { run, calls } = makeOps([productRow(1, status)]);
    await assert.rejects(run({ account: {}, orderIds: ['1'] }), { status: 409 });
    assert.equal(calls.uploads, 0);
    assert.equal(calls.writes, 0);
  }
});

test('maintenance delivery with replaced parts requires a numeric store receipt', async () => {
  const row = { ...maintRow(1), sparePartsReplacedEntries: [{ name: 'Laser Tube', qty: 1 }] };
  const { run, calls } = makeOps([row]);
  await assert.rejects(run({ account: {}, orderIds: ['1'], maintenanceOnly: true }), { status: 400 });
  await assert.rejects(run({ account: {}, orderIds: ['1'], maintenanceOnly: true, receiptNumbers: ['not-a-number'] }), { status: 400 });
  assert.equal(calls.uploads, 0);
  assert.equal(calls.writes, 0);
});

test('shipped product orders can still be delivered', async () => {
  const { run, calls } = makeOps([productRow(1)]);
  const value = await run({ account: {}, orderIds: ['1'] });
  assert.equal(value.success, true);
  assert.equal(calls.writes, 1);
});

test('receiving cannot roll back a delivered/archived or rejected component', async () => {
  const source = excerpt('../lib/operations-orders-data.js', 'export async function markOperationsShipped(', '\nfunction operationsProductKey(');
  for (const row of [{ id: 1, status: 'Arrived' }, { id: 1, status: 'Archive' }, { id: 1, status: 'In progress', operations_approval: 'Rejected' }]) {
    const sandbox = {
      ensureOperationsMutationAccess: () => true,
      loadOperationRowsByIds: async () => ({ clean: ['1'], rows: [row], byId: new Map([['1', row]]) }),
      directOperationsMutationError: makeError,
      statusIndex: value => value === 'Archive' ? 5 : value === 'Arrived' ? 4 : 2,
      decision: item => item.operations_approval === 'Rejected' ? 'rejected' : 'approved',
    };
    vm.runInNewContext(`${source}\nthis.run=markOperationsShipped;`, sandbox);
    await assert.rejects(sandbox.run({ account: {}, orderIds: ['1'] }), { status: 409 });
  }
});

function makeLogs(rows) {
  const calls = { writes: 0 };
  const sandbox = {
    text,
    norm: value => text(value).toLowerCase(),
    maintenanceWorkflowAccess: () => true,
    directMaintenanceMutationError: makeError,
    cleanMaintenanceActionIds: ids => ids.map(text),
    isSupabaseConfigured: () => true,
    loadRawOrderRowsByIds: async () => rows,
    serializeOperationsOrderDetail: row => ({ ...row, orderType: row.order_type }),
    isMaintenanceOrder: type => type === 'Request Maintenance',
    getProductsCatalog: async () => ({ products: [] }),
    uniqueMaintenanceStrings: entries => [...new Set((Array.isArray(entries) ? entries : [entries]).map(text).filter(Boolean))],
    maintenanceSparePlaceholder: () => false,
    normalizeMaintenanceSpareEntries: entries => (Array.isArray(entries) ? entries : []),
    maintenanceLogMetaText: () => '{"maintenanceLogs":[]}',
    updateMaintenanceRowSafe: async (id, patch) => { calls.writes += 1; return { ...rows.find(row => text(row.id) === text(id)), ...patch }; },
    invalidateLegacyOperationsCaches: async () => {},
    enrichMaintenanceDetailProducts: async items => items,
  };
  const src = excerpt('../lib/maintenance-orders-data.js', 'export async function logMaintenanceDirect(', '\nexport async function markMaintenanceArrivedDirect(');
  vm.runInNewContext(`${src}\nthis.run = logMaintenanceDirect;`, sandbox);
  return { run: sandbox.run, calls };
}
const logRow = (id, count) => ({ id, order_type: 'Request Maintenance', maintenanceLogs: Array.from({ length: count }, (_, i) => ({ repairAction: `Repair ${i + 1}` })) });

test('second maintenance log conflict preflights all rows before any write', async () => {
  const { run, calls } = makeLogs([logRow(1, 1), logRow(2, 2)]);
  const entries = ['1', '2'].map(orderId => ({ orderId, repairAction: 'Replacement' }));
  await assert.rejects(run({ orderIds: ['1', '2'], perItemLogs: entries, appendLog: true }), { status: 409 });
  assert.equal(calls.writes, 0);
});

test('an empty second log or empty replacement cannot destroy existing history', async () => {
  const { run, calls } = makeLogs([logRow(1, 1)]);
  await assert.rejects(run({ orderIds: ['1'], perItemLogs: [{ orderId: '1', serialNumber: 'ABC' }], appendLog: true }), { status: 400 });
  await assert.rejects(run({ orderIds: ['1'], perItemLogs: [{ orderId: '1' }], replaceExisting: true }), { status: 400 });
  assert.equal(calls.writes, 0);
});

test('second log cannot silently become a first log', async () => {
  const { run, calls } = makeLogs([logRow(1, 0)]);
  await assert.rejects(run({ orderIds: ['1'], perItemLogs: [{ orderId: '1', repairAction: 'New repair' }], appendLog: true }), { status: 409 });
  assert.equal(calls.writes, 0);
});

test('valid second maintenance log remains saveable', async () => {
  const { run, calls } = makeLogs([logRow(1, 1)]);
  const result = await run({ orderIds: ['1'], perItemLogs: [{ orderId: '1', repairAction: 'Another repair' }], appendLog: true });
  assert.equal(result.success, true);
  assert.equal(calls.writes, 1);
});
