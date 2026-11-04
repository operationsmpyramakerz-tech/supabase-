import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeOrderPriority, normalizeRequestedDeliveryDate, normalizeOrderRequestMetadata } from '../lib/order-request-metadata.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('priority is normalized, defaults safely, and rejects an invalid selection', () => {
  assert.equal(normalizeOrderPriority('urgent'), 'Urgent');
  assert.equal(normalizeOrderPriority(''), 'Normal');
  assert.equal(normalizeOrderPriority('High'), 'High');
  assert.throws(() => normalizeOrderPriority('instant'), /Priority Level/);
});

test('delivery date accepts a real ISO day, null when blank, rejects malformed dates', () => {
  assert.equal(normalizeRequestedDeliveryDate('2026-11-30'), '2026-11-30');
  assert.equal(normalizeRequestedDeliveryDate(null), null);
  assert.throws(() => normalizeRequestedDeliveryDate('2026-02-30'), /valid calendar date/);
  assert.throws(() => normalizeRequestedDeliveryDate('30-11-2026'), /YYYY-MM-DD/);
  assert.deepEqual(normalizeOrderRequestMetadata({ priorityLevel: 'low', requestedDeliveryDate: '2026-12-01' }), { priorityLevel: 'Low', requestedDeliveryDate: '2026-12-01' });
});

test('shopping cart displays compact select and add buttons with correct icons and accessible actions', () => {
  const ui = read('components/orders/ShoppingCartClient.jsx');
  const css = read('public/css/product-additions.css');
  assert.match(ui, /CartSvgIcon name="list-check" size=\{22\}/);
  assert.match(ui, /CartSvgIcon name="list-check" size=\{15\}/);
  assert.match(ui, /title="Delete product" aria-label=\{`Delete \$\{product\.name\}`\}/);
  assert.match(ui, /aria-label=\{`Open \$\{product\.name\}`\}/);
  assert.doesNotMatch(ui, /<span>Delete<\/span>/);
  assert.doesNotMatch(ui, /<span>Open<\/span>/);
  assert.match(css, /v309.*compact Select\/Add actions/);
  assert.match(css, /classic-cart-add-new--requested/);
  assert.match(css, /\.classic-cart-update-btn--new\{[\s\S]*?background:#101827!important/);
});

test('metadata is preserved across draft, submit API, create, edit, and order detail modals', () => {
  const ui = read('components/orders/ShoppingCartClient.jsx');
  const route = read('app/api/orders/shopping-cart/submit-direct/route.js');
  const service = read('lib/shopping-cart-order-service.js');
  assert.match(ui, /priorityLevel: priorityValue/);
  assert.match(ui, /requestedDeliveryDate: deliveryDateValue/);
  assert.match(ui, /<span>Priority Level<\/span>/);
  assert.match(ui, /<span>Delivery Date<\/span>/);
  assert.match(ui, /priorityLevel: maintenance \? null : priorityLevel/);
  assert.match(route, /priorityLevel: body\?\.priorityLevel/);
  assert.match(route, /requestedDeliveryDate: body\?\.requestedDeliveryDate/);
  assert.match(service, /priority_level: requestMetadata\.priorityLevel/g);
  assert.match(service, /requested_delivery_date: requestMetadata\.requestedDeliveryDate/g);
  assert.match(service, /priorityLevel,\s*requestedDeliveryDate,\s*products: draft/);
  for (const file of ['CurrentOrdersHeavyModals.jsx','OperationsOrdersHeavyModals.jsx','OrdersReviewHeavyModals.jsx']) {
    const modal = read(`components/orders/${file}`);
    assert.match(modal, /<span>Priority Level<\/span>/);
    assert.match(modal, /<span>Delivery Date<\/span>/);
  }
});

test('SQL is additive and the versioned page stylesheet is used', () => {
  const sql = read('sql/2026-11-04-shopping-cart-priority-delivery-v309.sql');
  const page = read('components/orders/ShoppingCartPageServer.jsx');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS priority_level text/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS requested_delivery_date date/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE)\b/);
  assert.match(page, /product-additions\.css\?v=v311/);
});
