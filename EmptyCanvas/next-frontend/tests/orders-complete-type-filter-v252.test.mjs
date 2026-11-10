import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectOrderTypeCounts } from '../lib/order-filter-type-counts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');
const pageNames = ['OperationsOrdersClient.jsx', 'CurrentOrdersClient.jsx', 'OrdersReviewClient.jsx', 'MaintenanceOrdersClient.jsx'];

const pages = new Map([
  [null, { items: [{ orderIdNumber: 125, orderType: 'Request Products' }, { orderIdNumber: 124, orderType: 'Request Products' }], pageInfo: { hasMore: true, nextCursor: 123 } }],
  [123, { items: [{ orderIdNumber: 123, orderType: 'Request Maintenance' }, { orderIdNumber: 122, orderType: 'Withdraw Products' }, { orderIdNumber: 122, orderType: 'Withdraw Products' }], pageInfo: { hasMore: false, nextCursor: null } }],
]);

test('type totals include types that appear only after Load more', async () => {
  const seen = [];
  const output = await collectOrderTypeCounts(async cursor => { seen.push(cursor); return pages.get(cursor); });
  assert.deepEqual(seen, [null, 123]);
  assert.equal(output.total, 4);
  assert.deepEqual(Object.fromEntries(output.options.map(({ key, count }) => [key, count])), {
    requestmaintenance: 1, requestproducts: 2, withdrawproducts: 1,
  });
});

test('one order with multiple component rows counts only once', async () => {
  const result = await collectOrderTypeCounts(async () => ({
    items: Array.from({ length: 100 }, (_, i) => ({ orderIdNumber: 88, orderType: 'Request Products', id: `row-${i}` })),
    pageInfo: { hasMore: false, nextCursor: null },
  }));
  assert.equal(result.total, 1);
  assert.equal(result.options[0].count, 1);
});

test('empty result is a complete zero count', async () => {
  const result = await collectOrderTypeCounts(async () => ({ items: [], pageInfo: { hasMore: false, nextCursor: null } }));
  assert.deepEqual(result, { total: 0, options: [] });
});

test('incomplete and repeating pages fail rather than display misleading totals', async () => {
  await assert.rejects(() => collectOrderTypeCounts(async () => ({ items: [], pageInfo: { hasMore: true, nextCursor: null } })), /did not advance/);
  await assert.rejects(() => collectOrderTypeCounts(async () => null), /Incomplete/);
  await assert.rejects(() => collectOrderTypeCounts(async () => ({ items: [{ orderType: 'Request Products' }], pageInfo: { hasMore: false } })), /valid order number/);
  await assert.rejects(() => collectOrderTypeCounts(async () => ({ items: [], pageInfo: { hasMore: true, nextCursor: 1 } })), /did not advance/);
});

test('every orders page feeds complete type counts to the combined preferences control', () => {
  for (const name of pageNames) {
    const source = read(`components/orders/${name}`);
    if (name === 'OperationsOrdersClient.jsx') {
      assert.match(source, /collectOperationsFilterGroups\(/, name);
      assert.match(source, /loadGroups=\{loadFilterGroups\}/, name);
    } else {
      assert.match(source, /useCompleteOrderTypeCounts\(\{ endpoint:/, name);
      assert.match(source, /onFilterOpen=\{completeTypes\.refresh\}/, name);
    }
    assert.match(source, /<OrdersPreferencesControl /, name);
  }
});

test('aggregate request uses existing authorized routes with type=all and page size 80, separate from displayed cards', () => {
  const source = read('components/orders/useCompleteOrderTypeCounts.js');
  assert.match(source, /filterType: "all", limit: "80"/);
  assert.match(source, /credentials: "include"/);
  assert.match(source, /collectOrderTypeCounts/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /if \(query\.trim\(\)\) params\.set\("q", query\.trim\(\)\)/);
  assert.match(source, /if \(cursor !== null\) params\.set\("cursor"/);
});

test('maintenance counts are not derived from the loaded groups', () => {
  const source = read('components/orders/MaintenanceOrdersClient.jsx');
  assert.doesNotMatch(source, /<MaintenanceFilter[^>]*count=\{groups\.length\}/);
  assert.match(source, /count: completeTypes\.counts\?\.total \?\? null/);
});
