import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { operationsHasOutstandingQuantity, operationsMatchesTab } from '../lib/operations-remaining-status.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const arrivedPartial = { stage: 4, hasRemaining: true, hasReceived: true, maintenance: false };
const arrivedComplete = { stage: 4, hasRemaining: false, hasReceived: true, maintenance: false };
const shippedPartial = { stage: 3, hasRemaining: true, hasReceived: true, maintenance: false };

test('Arrived partial receipt (35 requested / 14 received / 21 outstanding) appears in both tabs', () => {
  const requested = 35;
  const received = 14;
  assert.equal(requested - received, 21);
  assert.equal(operationsHasOutstandingQuantity(arrivedPartial), true);
  assert.equal(operationsMatchesTab(arrivedPartial, 'remaining'), true);
  assert.equal(operationsMatchesTab(arrivedPartial, 'delivered'), true);
  assert.equal(operationsMatchesTab(arrivedPartial, 'all'), true);
});

test('fully arrived orders remain Delivered; shipped partial orders remain Remaining', () => {
  assert.equal(operationsHasOutstandingQuantity(arrivedComplete), false);
  assert.equal(operationsMatchesTab(arrivedComplete, 'delivered'), true);
  assert.equal(operationsMatchesTab(arrivedComplete, 'remaining'), false);
  assert.equal(operationsMatchesTab(shippedPartial, 'remaining'), true);
});

test('pending orders, archived orders and maintenance retain their existing status semantics', () => {
  assert.equal(operationsMatchesTab({ ...arrivedPartial, stage: 5 }, 'remaining'), false);
  assert.equal(operationsMatchesTab({ ...arrivedPartial, stage: 5 }, 'archive'), true);
  assert.equal(operationsMatchesTab({ ...arrivedPartial, stage: 2 }, 'remaining'), false);
  assert.equal(operationsMatchesTab({ ...arrivedPartial, maintenance: true }, 'remaining'), false);
  assert.equal(operationsMatchesTab({ ...arrivedPartial, maintenance: true }, 'delivered'), true);
  assert.equal(operationsMatchesTab({ ...shippedPartial, hasRemaining: false }, 'received'), true);
});

test('remaining list retrieves Arrived rows and bypasses old stage-only RPC filters', () => {
  const server = source('lib/operations-orders-data.js');
  assert.match(server, /status\.ilike\.\*arrived\*/);
  assert.match(server, /!\["remaining", "delivered"\]\.includes\(rpcOptions\.tab\)/);
  assert.match(server, /!\["remaining", "delivered"\]\.includes\(tab\)/);
  assert.match(server, /operationsMatchesTab\(meta, cleanTab\)/);
});

test('both list and detail views distinguish quantity remaining from raw Arrived status', () => {
  for (const name of ['OperationsOrdersClient.jsx', 'OperationsOrdersHeavyModals.jsx']) {
    const client = source(`components/orders/${name}`);
    assert.ok(client.startsWith('"use client";'), 'Preserve Next.js client directive');
    assert.match(client, /operationsHasOutstandingQuantity/);
    assert.match(client, /operationsMatchesTab/);
    assert.match(client, /return "Remaining";/);
  }
  const detail = source('components/orders/OperationsOrdersHeavyModals.jsx');
  assert.match(detail, /tab === "all" && stage >= 3 && stage < 5 && !maintenance/);
});
