import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOperationsStatuses, operationsMatchesStatuses, operationsCardStatusKeys } from '../lib/operations-status-filter.mjs';
const read = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
const groups = [
  { id: 1, stage: 1 },
  { id: 2, stage: 2, hasApproved: true },
  { id: 3, stage: 2, hasRejected: true },
  { id: 4, stage: 2, hasApproved: true, hasRejected: true },
  { id: 5, stage: 3, hasRemaining: true, hasReceived: true },
  { id: 6, stage: 3, hasRemaining: false, hasReceived: true },
  { id: 7, stage: 4, hasRemaining: true, hasReceived: true },
  { id: 8, stage: 4, hasRemaining: false },
  { id: 9, stage: 5 },
  { id: 10, stage: 3, maintenance: true, hasRemaining: true },
];
const matching = selected => groups.filter(group => operationsMatchesStatuses(group, selected)).map(group => group.id);
test('Status choices are normalized and matched with OR semantics', () => {
  assert.deepEqual(normalizeOperationsStatuses(' approved,REJECTED,approved,invalid '), ['approved','rejected']);
  assert.deepEqual(matching(['approved','received']), [2,4,6,10]);
  assert.deepEqual(matching(['rejected']), [3,4]);
  assert.deepEqual(matching([]), groups.map(group=>group.id));
  assert.deepEqual(matching(['under-supervision','archive']), [1,9]);
});
test('Matches exact card status, including partial delivery and maintenance', () => {
  assert.deepEqual(matching(['remaining']), [5]);
  assert.deepEqual(matching(['partial-delivered']), [7]);
  assert.deepEqual(matching(['delivered']), [8]);
  assert.deepEqual(operationsCardStatusKeys(groups[3]), ['approved','rejected']);
  assert.deepEqual(operationsCardStatusKeys(groups[9]), ['received']);
});
test('Status filter is forwarded to scoped API before pagination and remains on Load More', () => {
  const ui = read('components/orders/OperationsOrdersClient.jsx');
  assert.match(ui, /statusOptions=\{OPERATIONS_STATUS_OPTIONS\}/);
  assert.match(ui, /params\.set\("statuses", statusKey\)/);
  assert.match(ui, /\[tab, type, query, statusKey\]/);
  assert.match(ui, /fetchOrdersPage\(\{ reset: false \}\)/);
  assert.match(ui, /changeTab\(item.key\)/);
  assert.match(read('app/api/orders/requested/paged-summary/route.js'), /statuses: url\.searchParams\.get\("statuses"\)/);
  const data = read('lib/operations-orders-data.js');
  const loop = data.slice(data.indexOf('export async function loadOperationsOrdersPage('),data.indexOf('export async function loadOperationsOrdersInitialPage('));
  assert.ok(loop.indexOf('resolveOrderScope') < loop.indexOf('operationsMatchesStatuses(groupMeta(items, true), selectedStatuses)'));
  assert.ok(loop.indexOf('operationsMatchesStatuses(groupMeta(items, true), selectedStatuses)') < loop.indexOf('outputGroups.push'));
  assert.match(loop, /rpcOptions: !searchPlan && !includeArchive/);
  assert.match(loop, /forceRows: includeArchive/);
  assert.match(loop, /cleanType.*orderTypeKey/);
});
test('Shared Preferences exposes optional multi-select toggles and a clear action', () => {
  const ui = read('components/orders/OrdersPreferencesControl.jsx');
  assert.match(ui, /statusOptions = \[\]/);
  assert.match(ui, /aria-pressed=\{checked\}/);
  assert.match(ui, /statusValues\.filter\(key => key !== option.key\)/);
  assert.match(ui, /onStatusChange\?\.\(\[\]\)/);
  for (const name of ['CurrentOrdersClient','OrdersReviewClient','MaintenanceOrdersClient']) assert.doesNotMatch(read(`components/orders/${name}.jsx`), /statusOptions=\{/);
});
