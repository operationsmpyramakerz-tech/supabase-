import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireOrderRequestMetadata } from '../lib/order-request-metadata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('new/edited non-maintenance orders require an explicit priority and delivery date on the server', () => {
  assert.throws(() => requireOrderRequestMetadata({ requestedDeliveryDate: '2026-11-20' }), /Priority Level is required/);
  assert.throws(() => requireOrderRequestMetadata({ priorityLevel: 'Normal' }), /Delivery Date is required/);
  assert.throws(() => requireOrderRequestMetadata({ priorityLevel: '', requestedDeliveryDate: '' }), /Priority Level is required/);
  assert.throws(() => requireOrderRequestMetadata({ priorityLevel: 'Urgent', requestedDeliveryDate: '2026-02-30' }), /valid calendar date/);
  assert.deepEqual(requireOrderRequestMetadata({ priorityLevel: 'high', requestedDeliveryDate: '2026-11-20' }), {
    priorityLevel: 'High', requestedDeliveryDate: '2026-11-20',
  });
  const service = read('lib/shopping-cart-order-service.js');
  assert.equal((service.match(/requestMetadata = requireOrderRequestMetadata\(\{ priorityLevel, requestedDeliveryDate \}\)/g) || []).length, 2);
  assert.match(service, /if \(orderTypeKey\(finalType\) !== "requestmaintenance"\)/);
  assert.doesNotMatch(service, /priorityLevel = "Normal"/);
});

test('shopping cart requires an actual priority selection and a date before calling submit-direct', () => {
  const ui = read('components/orders/ShoppingCartClient.jsx');
  const picker = read('components/orders/ShoppingCartMetaControls.jsx');
  assert.match(ui, /function safePriority\(value\)\s*\{[\s\S]*?\|\| "";/);
  assert.match(ui, /const priorityMissing = !maintenance && !text\(priorityLevel\);/);
  assert.match(ui, /const deliveryDateMissing = !maintenance && !text\(requestedDeliveryDate\);/);
  assert.ok(ui.indexOf('if (cartMissing || reasonMissing || priorityMissing || deliveryDateMissing)') < ui.indexOf('setBusy(true);'));
  assert.match(ui, /required fields missing/i);
  assert.match(ui, /aria-label="Requested delivery date"[^>]*required/);
  assert.match(ui, /<ShoppingCartPrioritySelect value=\{priorityLevel\} onChange=\{updatePriority\} invalid=\{validationFeedback.priority\}/);
  assert.match(picker, /value \|\| "Select priority"/);
  assert.match(picker, /aria-required="true"/);
  assert.match(ui, /priorityLevel: maintenance \? null : priorityLevel/);
  assert.match(ui, /requestedDeliveryDate: maintenance \? null : requestedDeliveryDate \|\| null/);
});
