import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parseBackupOrderNumberSearch } from '../lib/backup-order-number-search.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => readFileSync(path.join(root, rel), 'utf8');

for (const input of ['117', 'ORD-117', 'ord117', 'Ord #117', 'ORD: 0117', '00117', '  117  ']) {
  test(`Order search normalizes ${JSON.stringify(input)} to exact order 117`, () => {
    assert.deepEqual(parseBackupOrderNumberSearch(input), { active: true, valid: true, number: '117' });
  });
}

test('Empty input shows all orders again', () => {
  assert.deepEqual(parseBackupOrderNumberSearch(''), { active: false, valid: true, number: '' });
});

for (const input of ['Infrared Remote', 'ORD-117 OR 1=1', '117,118', '-117', '117a', '1234567891234567891234']) {
  test(`Rejects non-order-number input ${JSON.stringify(input)}`, () => {
    const result = parseBackupOrderNumberSearch(input);
    assert.equal(result.active, true);
    assert.equal(result.valid, false);
  });
}

test('Only Orders table gets server-side order_number equality filter', () => {
  const data = source('lib/backup-data.js');
  const route = source('app/api/backup/rows-direct/route.js');
  assert.match(data, /item\.key === "orders" \? parseBackupOrderNumberSearch\(orderNumber\)/);
  assert.match(data, /query\.set\("order_number", `eq\.\$\{orderSearch\.number\}`\)/);
  assert.match(data, /query\.set\("order", "id\.asc"\)/);
  assert.match(route, /key === "orders" \? url\.searchParams\.get\("orderNumber"\)/);
});

test('Header search loads server-wide order results with debounce, pagination and cancellation', () => {
  const client = source('components/backup/BackupTableClient.jsx');
  assert.match(client, /const isOrdersTable = tableKey === "orders"/);
  assert.match(client, /if \(search\) params\.set\("orderNumber", search\)/);
  assert.match(client, /setTimeout\(\(\) => loadRows\(0, query\), 320\)/);
  assert.match(client, /if \(isOrdersTable\) return rows/);
  assert.match(client, /signal: controller\.signal/);
  assert.match(client, /loadRows\(offset \+ pageSize, activeOrderSearch\)/);
});
