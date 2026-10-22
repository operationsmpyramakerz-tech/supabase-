import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expenseLinksReceiptSource, receiptOrderNumbers, receiptReferenceTokens } from '../lib/order-receipt-relations.mjs';

const read = path => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');

test('2N2: exact numeric relations cannot match substrings or neighboring orders', () => {
  const row = { id: '12', order_number: '7' };
  assert.equal(expenseLinksReceiptSource({ orders_raw: '112,113', orders_names: 'ORD-70' }, '12', [row]), false);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '12,113', orders_names: 'ORD-70' }, '12', [row]), true);
});

test('2N2: legacy UUIDs match normalized formats only, not near misses', () => {
  const uuid = '12345678-1234-1234-abcd-123456789abc';
  assert.equal(expenseLinksReceiptSource({ orders_raw: '1234567812341234abcd123456789abc' }, uuid, [{ id: uuid }]), true);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '1234567812341234abcd123456789abd' }, uuid, [{ id: uuid }]), false);
});

test('2N2: order number grouping requires complete ORD token', () => {
  assert.deepEqual(receiptOrderNumbers('ORD-12, ORDER:019; ORD-120'), ['12', '19', '120']);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '', orders_names: 'ORD-012 - Approved' }, 'ORD-12', [{ id: '700', order_number: 12 }]), true);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '', orders_names: 'ORD-120' }, 'ORD-12', [{ id: '700', order_number: 12 }]), false);
});

test('2N2: JSON and comma-delimited relations are interpreted as separate IDs', () => {
  assert.deepEqual(receiptReferenceTokens('["42","43"]'), ['42', '43']);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '["42","43"]' }, '43', [{ id: '43' }]), true);
  assert.equal(expenseLinksReceiptSource({ orders_raw: '["42","43"]' }, '4', [{ id: '4' }]), false);
});

test('2N2: arbitrary label text and empty relation do not prove access', () => {
  assert.equal(expenseLinksReceiptSource({ orders_raw: '', orders_names: 'Transportation materials' }, '1', [{ id: '1', order_number: 15 }]), false);
  assert.equal(expenseLinksReceiptSource({}, '1', [{ id: '1' }]), false);
});

test('2N2: both direct API and server-rendered viewer forward verified account context', () => {
  const api = read('app/api/orders/order-receipts/route.js');
  const page = read('app/orders/receipt-viewer/page.jsx');
  assert.match(api, /loadOrderReceiptViewerItems\(ids, \{ account: gate\.account \}\)/);
  assert.match(page, /loadOrderReceiptViewerItems\(ids, \{ account: gate\.account \}\)/);
});

test('2N2: authenticated receipt loader authorizes all requested sources before URLs are materialized', () => {
  const loader = read('lib/order-receipts-data.js');
  assert.ok(loader.indexOf('await assertReceiptSourcesAccessible(account, rowsBySource)') < loader.indexOf('for (const { sourceId, rows } of rowsBySource) {'));
  assert.doesNotMatch(loader, /receiptCache|get\(key\).*expiresAt/);
  assert.match(loader, /if \(!account\)/);
  const access = read('lib/order-receipt-access.js');
  assert.match(access, /if \(!matched\) deny\(\)/);
  assert.match(access, /canSeeExpense\(candidate\)/);
  assert.match(access, /expenseLinksReceiptSource\(candidate, sourceId, rows\)/);
});

test('2N2: receipts use canonical expense row identity and explicit team links, never employee-name substring matching', () => {
  const scope = read('lib/expenses-users-scope.js');
  assert.match(scope, /export async function expenseReceiptRowChecker/);
  assert.match(scope, /permittedDirectory\(account, "own"\)/);
  assert.match(scope, /ownerOfExpenseRow\(ownIndex, row\)/);
  assert.match(scope, /permittedDirectory\(account, usersScope\)/);
});
