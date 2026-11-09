import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasOutstandingOrderItem, isPartiallyDeliveredOrder } from '../lib/order-partial-delivery.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const mixed = { stage: 4, hasRemaining: true, hasReceived: true, maintenance: false };

test('ORD-108: mixed delivered/remaining is Partially Delivered', () => {
  assert.equal(isPartiallyDeliveredOrder(mixed), true);
  assert.equal(isPartiallyDeliveredOrder({ ...mixed, hasRemaining: false }), false);
  assert.equal(isPartiallyDeliveredOrder({ ...mixed, hasReceived: false }), false);
  assert.equal(isPartiallyDeliveredOrder({ ...mixed, stage: 3 }), false);
  assert.equal(isPartiallyDeliveredOrder({ ...mixed, stage: 5 }), false);
  assert.equal(isPartiallyDeliveredOrder({ ...mixed, maintenance: true }), false);
});

test('Arrived raw status must not override a remaining component quantity', () => {
  assert.equal(hasOutstandingOrderItem({ stage: 4, remaining: 7, maintenance: false }), true);
  assert.equal(hasOutstandingOrderItem({ stage: 4, remaining: 0, maintenance: false }), false);
  assert.equal(hasOutstandingOrderItem({ stage: 3, remaining: 7, maintenance: false }), true);
  assert.equal(hasOutstandingOrderItem({ stage: 2, remaining: 7, maintenance: false }), false);
  assert.equal(hasOutstandingOrderItem({ stage: 5, remaining: 7, maintenance: false }), false);
  assert.equal(hasOutstandingOrderItem({ stage: 4, remaining: 7, maintenance: true }), false);
});

test('Operations All and Delivered both use mixed status; unchanged Remaining logic', () => {
  const client = read('components/orders/OperationsOrdersClient.jsx');
  assert.match(client, /\(tab === "all" \|\| tab === "delivered"\) && isPartiallyDeliveredOrder/);
  assert.match(client, /partialDelivered \? "Partially Delivered"/);
  assert.match(client, /forceShipping \? "Shipping"/);
});

test('My Orders cards use group quantity markers and support the mixed status', () => {
  const client = read('components/orders/CurrentOrdersClient.jsx');
  assert.match(client, /isPartiallyDeliveredOrder\(\{ stage, hasRemaining, hasReceived/);
  assert.match(client, /status = "partially-delivered";/);
  assert.match(client, /"partially-delivered": "Partially Delivered"/);
  assert.match(client, /"partially-delivered": \{ bg:/);
  assert.match(client, /\(group.stage === 3 \|\| group.stage === 4\).*group.hasRemaining/);
  assert.match(client, /if \(tab === "arrived"\) \{[\s\S]*?group.items.some/);
});

test('My Orders detail line shows Remaining when status is Arrived but remaining qty > 0', () => {
  const modal = read('components/orders/CurrentOrdersHeavyModals.jsx');
  assert.match(modal, /\(tab === "all" \|\| tab === "arrived"\) && hasOutstandingOrderItem\(\{ stage, remaining, maintenance \}\)/);
  assert.match(modal, /\? "remaining"\s*:\s*statusTabForItem\(item\)/);
  assert.match(modal, /if \(stage < 3 \|\| stage >= 5\) return false/);
  const server = read('lib/current-orders-data.js');
  assert.match(server, /\(stage === 3 \|\| stage === 4\) && !maintenance && hasRemaining/);
});
