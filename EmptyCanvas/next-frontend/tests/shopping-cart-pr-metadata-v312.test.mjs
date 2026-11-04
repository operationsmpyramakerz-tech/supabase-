import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  prPriorityFromOrder, prDeliveryDateFromOrder, prMetadataFromOrders,
  prInitialForm, normalizePrForm, prSyncSavedWithLiveOrder, prVisibleItemsDiffer,
} from '../lib/purchase-requisition-data.mjs';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const order = (priorityLevel, requestedDeliveryDate, id = '35') => ({
  id, orderIdNumber: 128, productName: 'Laser Machine', productIdCode: 'A400015',
  quantityRequested: 2, priorityLevel, requestedDeliveryDate, reason: 'New lab',
});

test('all Shopping Cart priorities map to existing, unchanged PR labels', () => {
  assert.equal(prPriorityFromOrder('Low'), 'عادي');
  assert.equal(prPriorityFromOrder('Normal'), 'عادي');
  assert.equal(prPriorityFromOrder('High'), 'عاجل');
  assert.equal(prPriorityFromOrder('Urgent'), 'طارئ');
  assert.equal(prPriorityFromOrder(''), '');
  assert.equal(prPriorityFromOrder('UNRECOGNIZED'), '');
});

test('date maps without locale/timezone shift and invalid dates stay blank', () => {
  assert.equal(prDeliveryDateFromOrder('2026-11-08'), '2026-11-08');
  assert.equal(prDeliveryDateFromOrder('2026-02-30'), '');
  assert.equal(prDeliveryDateFromOrder(''), '');
});

test('new Purchase Requisition preloads order priority and delivery date', () => {
  const form = prInitialForm([order('Urgent', '2026-11-08')]);
  assert.equal(form.priority, 'طارئ');
  assert.equal(form.requiredDate, '2026-11-08');
  assert.equal(form.workOrder, 'ORD-128');
  assert.equal(form.orderMetadataSnapshot.priority, 'طارئ');
  assert.equal(form.purchaseReason, 'New lab');
});

test('changed order priority/date propagate to a saved requisition, retaining the other PR details', () => {
  const original = prInitialForm([order('High', '2026-11-08')]);
  const stored = normalizePrForm({...original, prNumber:'PR-42', department:'Operations', notes:'Keep specs', priority:'طارئ', requiredDate:'2026-11-11'});
  const unchanged = prSyncSavedWithLiveOrder(stored, prInitialForm([order('High', '2026-11-08')]));
  assert.equal(unchanged.priority, 'طارئ');
  assert.equal(unchanged.requiredDate, '2026-11-11');
  assert.equal(prVisibleItemsDiffer(stored, unchanged), false);
  const revised = prSyncSavedWithLiveOrder(unchanged, prInitialForm([order('Urgent', '2026-11-15')]));
  assert.equal(revised.priority, 'طارئ');
  assert.equal(revised.requiredDate, '2026-11-15');
  assert.equal(revised.prNumber, 'PR-42');
  assert.equal(revised.department, 'Operations');
  assert.equal(revised.notes, 'Keep specs');
  assert.equal(prVisibleItemsDiffer(unchanged, revised), true);
});

test('legacy PR only gets missing fields backfilled and no order metadata stays blank', () => {
  const old = normalizePrForm({priority:'عاجل', requiredDate:'', notes:'Legacy data'});
  const linked = prSyncSavedWithLiveOrder(old, prInitialForm([order('Normal','2026-12-05')]));
  assert.equal(linked.priority, 'عاجل');
  assert.equal(linked.requiredDate, '2026-12-05');
  assert.equal(linked.notes, 'Legacy data');
  assert.deepEqual(prMetadataFromOrders([order('', '')]), {priority:'', requiredDate:''});
});

test('conflicting metadata across combined orders is not arbitrarily attributed to the PR', () => {
  assert.deepEqual(prMetadataFromOrders([
    order('Urgent','2026-11-08','1'), order('High','2026-11-11','2'),
  ]), {priority:'', requiredDate:''});
});

test('UI uses withdrawal-red totals and displays icons beside reason, priority and date', () => {
  const ui = read('../components/orders/ShoppingCartClient.jsx');
  const css = read('../public/css/product-additions.css');
  assert.match(ui, /name="file-text" size=\{15\}/);
  assert.match(ui, /name="flag" size=\{15\}/);
  assert.match(ui, /name="calendar" size=\{15\}/);
  assert.match(css, /theme-withdraw-products[^\n]*classic-cart-summary-total strong/);
  assert.match(css, /theme-withdraw-products[^\n]*classic-cart-card-metric--total>strong/);
  const page = read('../components/orders/ShoppingCartPageServer.jsx');
  assert.match(page, /product-additions\.css\?v=v31[2-9]/);
});
