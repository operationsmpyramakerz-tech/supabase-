import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { operationsArrivedItemVisible, operationsMatchesTab } from '../lib/operations-remaining-status.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mixed108 = { stage: 4, hasRemaining: true, hasReceived: true, maintenance: false };

test('ORD-108: mixed Arrived + Remaining shows in both lists, but not Shipping', () => {
  assert.equal(operationsMatchesTab(mixed108, 'all'), true);
  assert.equal(operationsMatchesTab(mixed108, 'remaining'), true);
  assert.equal(operationsMatchesTab(mixed108, 'delivered'), true);
  assert.equal(operationsMatchesTab(mixed108, 'received'), false);
});

test('Delivered tab includes received quantities without including outstanding-only items', () => {
  const alreadyArrived = { stage: 4, received: 35, remaining: 0 };
  const partiallyArrived = { stage: 4, received: 14, remaining: 21 };
  const stillOutstanding = { stage: 4, received: 0, remaining: 7 };
  const notYetArrived = { stage: 3, received: 7, remaining: 0 };
  const legacyArrived = { stage: 4, received: null, remaining: 0 };
  assert.equal(operationsArrivedItemVisible(alreadyArrived), true);
  assert.equal(operationsArrivedItemVisible(partiallyArrived), true);
  assert.equal(operationsArrivedItemVisible(stillOutstanding), false);
  assert.equal(operationsArrivedItemVisible(notYetArrived), false);
  assert.equal(operationsArrivedItemVisible(legacyArrived), true);
  assert.equal(operationsArrivedItemVisible({ stage: 4, delivered: 2, remaining: 5 }), true);
});

test('fully received, pending, maintenance and archived orders preserve their tabs', () => {
  assert.equal(operationsMatchesTab({ ...mixed108, hasRemaining: false }, 'remaining'), false);
  assert.equal(operationsMatchesTab({ ...mixed108, hasRemaining: false }, 'delivered'), true);
  assert.equal(operationsMatchesTab({ ...mixed108, stage: 3 }, 'delivered'), false);
  assert.equal(operationsMatchesTab({ ...mixed108, stage: 5 }, 'delivered'), false);
  assert.equal(operationsMatchesTab({ ...mixed108, stage: 5 }, 'archive'), true);
  assert.equal(operationsMatchesTab({ ...mixed108, maintenance: true }, 'remaining'), false);
  assert.equal(operationsMatchesTab({ ...mixed108, maintenance: true }, 'delivered'), true);
});

test('both client and detail modal scope Delivered to arrived items and show the arrived quantity', () => {
  for (const filename of ['OperationsOrdersClient.jsx', 'OperationsOrdersHeavyModals.jsx']) {
    const src = read(`components/orders/${filename}`);
    assert.match(src, /operationsArrivedItemVisible/);
    assert.match(src, /if \(tab === "delivered"\) return source\.filter/);
    assert.match(src, /remaining: remainingQuantity\(item\)/);
  }
  const client = read('components/orders/OperationsOrdersClient.jsx');
  assert.match(client, /Partially Delivered/);
  const modal = read('components/orders/OperationsOrdersHeavyModals.jsx');
  assert.match(modal, /const completedDelivery = tab === "delivered" && delivered && !group\.hasRemaining/);
  assert.match(modal, /itemsForOperationsTab\(expandOrderItemsForDisplay\(tabItems\)\.map\(applyEditDraft\), tab\)/);
  assert.match(modal, /showReceivedValue && receivedWasEdited/);
});

test('server avoids outdated RPC-only Delivered filtering on partial groups', () => {
  const server = read('lib/operations-orders-data.js');
  assert.match(server, /!\["remaining", "delivered"\]\.includes\(rpcOptions\.tab\)/);
  assert.match(server, /!\["remaining", "delivered"\]\.includes\(tab\)/);
  assert.match(server, /operationsMatchesTab\(meta, cleanTab\)/);
  assert.match(server, /status\.ilike\.\*arrived\*/);
});
