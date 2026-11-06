import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { orderPriority, orderDeliveryDate, orderCreatedDate } from '../components/orders/order-summary-meta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = pathName => readFileSync(path.join(root, pathName), 'utf8');
const modalFiles = [
  'CurrentOrdersHeavyModals.jsx', 'OrdersReviewHeavyModals.jsx',
  'OperationsOrdersHeavyModals.jsx', 'MaintenanceHeavyModals.jsx',
];

test('Priority and delivery date read saved source fields, no invented values', () => {
  const group = { items: [{ priorityLevel: 'Urgent', requestedDeliveryDate: '2026-11-25' }] };
  assert.equal(orderPriority(group), 'Urgent');
  assert.equal(orderDeliveryDate(group), '2026-11-25');
  assert.equal(orderPriority({ items: [{}] }), '—');
  assert.equal(orderDeliveryDate({ items: [{}] }), null);
  assert.equal(orderPriority({ items: [{ priority_level: 'Low' }] }), 'Low');
});

test('Created Date represents the first component created, not an updated timestamp', () => {
  const group = {
    latestCreated: '2026-11-06T15:00:00Z',
    items: [
      { createdTime: '2026-11-06T15:00:00Z' },
      { createdTime: '2026-11-04T09:00:00Z' },
    ],
  };
  assert.equal(orderCreatedDate(group), '2026-11-04T09:00:00Z');
  assert.equal(orderCreatedDate({ latestCreated: '2026-11-06' }), '2026-11-06');
  assert.equal(orderCreatedDate({}), null);
});

test('All order detail summaries show real created date, requested delivery and priority', () => {
  for (const filename of modalFiles) {
    const content = source(`components/orders/${filename}`);
    assert.match(content, /<span>Created Date<\/span>/, filename);
    assert.match(content, /<span>Delivery Date<\/span>/, filename);
    assert.match(content, /<span>Priority<\/span>/, filename);
    assert.match(content, /<OrderPriorityBadge value=\{orderPriority\(group\)\}/, filename);
  }
  const loading = source('components/orders/OrderDetailsLoadingOverlay.jsx');
  for (const label of ['Created Date', 'Delivery Date', 'Priority']) assert.ok(loading.includes(`label="${label}"`));
});

test('Order details keep count, member or total while the summary fields change', () => {
  const current = source('components/orders/CurrentOrdersHeavyModals.jsx');
  const ops = source('components/orders/OperationsOrdersHeavyModals.jsx');
  const maintenance = source('components/orders/MaintenanceHeavyModals.jsx');
  assert.match(current, /<span>Components<\/span>/);
  assert.match(ops, /<span>Components<\/span>/);
  assert.match(ops, /<span>Estimate Total<\/span>/);
  assert.match(maintenance, /<span>Team member<\/span>/);
});

test('Preference popup keeps option controls but no explanatory subtext', () => {
  const component = source('components/orders/OrdersPreferencesControl.jsx');
  assert.doesNotMatch(component, /Filter and sort your orders<\/small>/);
  assert.doesNotMatch(component, /Recently created orders|Choose an order|Earliest created orders|Descending order number/);
  assert.doesNotMatch(component, /<small>\{option\./);
  for (const label of ['Order type', 'Sort by', 'Newest first', 'Oldest first']) assert.ok(component.includes(label));
  for (const state of ['filter', 'sort']) assert.match(component, new RegExp(`section === "${state}"`));
});

test('Preference icons have explicit centered geometry', () => {
  const css = source('public/css/orders-workspace.css');
  assert.match(css, /orders-preferences__close svg\s*\{/);
  assert.match(css, /orders-preferences__choice-icon svg/);
  assert.match(css, /align-items: center !important; justify-content: center !important/);
});

test('Order detail Sort uses a sorting icon instead of Filter', () => {
  const sourceText = source('components/orders/OrderGrouping.jsx');
  assert.match(sourceText, /<ClassicOrderIcon name="sort-desc" \/><span>Sort<\/span>/);
  assert.doesNotMatch(sourceText, /<ClassicOrderIcon name="filter" \/><span>Sort<\/span>/);
  const css = source('public/css/orders-workspace.css');
  assert.match(css, /order-sort-trigger > svg/);
  assert.match(css, /co-modal-close::before/);
});
