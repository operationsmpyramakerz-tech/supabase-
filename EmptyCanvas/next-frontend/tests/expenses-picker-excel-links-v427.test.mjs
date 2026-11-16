import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expenseOrderLinks, expenseReasonExportPayload } from '../lib/expense-export-order-links.mjs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const base = 'https://erp.test';

test('two linked orders keep both labels and receive independent tracking links', () => {
  const item = {
    reason: 'ORD-147, ORD-138', ordersRaw: '1001,1002,2001',
    orders: [{ orderId: 'ORD-147' }, { orderId: 'ORD-138' }],
  };
  const links = expenseOrderLinks(item, base);
  assert.deepEqual(links.map(({ text }) => text), ['ORD-147', 'ORD-138']);
  assert.equal(links[0].hyperlink, `${base}/next/orders/tracking?groupId=ord%3A147`);
  assert.equal(links[1].hyperlink, `${base}/next/orders/tracking?groupId=ord%3A138`);
  const reason = expenseReasonExportPayload(item, base);
  assert.equal(reason.text, 'ORD-147, ORD-138');
  assert.equal(reason.hyperlink, `${base}/next/orders/receipt-viewer?ids=1001%2C1002%2C2001`);
});

test('duplicate component rows never duplicate exported order columns', () => {
  const item = { orders: [{ orderId: 'ORD-147' }, { orderId: 'ORD-147' }, { orderId: 'ORD-138' }] };
  assert.deepEqual(expenseOrderLinks(item, base).map((x) => x.text), ['ORD-147', 'ORD-138']);
});

test('single legacy order and manual reason keep their original meaning', () => {
  const one = expenseReasonExportPayload({ reason: 'ORD-123', orders: [{ orderId: 'ORD-123' }] }, base);
  assert.equal(one.text, 'ORD-123');
  assert.equal(one.hyperlink, `${base}/next/orders/tracking?groupId=ord%3A123`);
  const manual = expenseReasonExportPayload({ reason: 'Printer repair - £75', orders: [{ orderId: 'Other reason' }] }, base);
  assert.deepEqual(manual, { text: 'Printer repair - £75', hyperlink: '', links: [] });
});

test('unsafe or missing URL origins never create arbitrary hyperlinks', () => {
  const item = { orders: [{ orderId: 'ORD-147' }], ordersRaw: '1001' };
  assert.equal(expenseOrderLinks(item, 'javascript:alert(1)')[0].hyperlink, '');
  assert.equal(expenseReasonExportPayload(item, 'javascript:alert(1)').hyperlink, '');
});

test('reason keeps links for each order when component-row IDs are invalid or absent', () => {
  const item = { orders: [{ orderId: 'ORD-147' }, { orderId: 'ORD-138' }], ordersRaw: '1001;drop' };
  const reason = expenseReasonExportPayload(item, base);
  assert.equal(reason.text, 'ORD-147, ORD-138');
  assert.equal(reason.hyperlink, `${base}/next/orders/tracking?groupId=ord%3A147`);
  assert.equal(reason.links.length, 2);
});

test('the picker uses the shared Operations Orders wrench, separate manual button, and compact icon removal', () => {
  const jsx = source('../components/expenses/ExpensesDialogs.jsx');
  const css = source('../public/css/expenses-classic-inline.css');
  assert.match(jsx, /ClassicOrderIcon name="tool"/);
  assert.match(jsx, /className=\{`expense-orders-menu__manual/);
  assert.match(jsx, /aria-pressed=\{isManual\}/);
  assert.match(jsx, /expense-orders-picker__chip-remove/);
  assert.match(jsx, /<ClassicExpenseIcon name="x" size=\{13\}/);
  assert.match(css, /\.expense-orders-picker__chip \.expense-orders-picker__chip-remove\{/);
  assert.match(css, /\.expense-orders-menu__manual\{[^}]+background:#28354a;color:#fff/);
});

test('the export dynamically inserts distinct per-order links without changing totals', () => {
  const server = source('../lib/expense-export-service.js');
  assert.match(server, /maxLinkedOrderCount = rows\.reduce/);
  assert.match(server, /\.\.\.orderColumns,/);
  assert.match(server, /\.\.\.orderLinkValues,/);
  assert.match(server, /row\.getCell\(4 \+ index\)/);
  assert.match(server, /cashColumnStart \+ 3/);
  assert.match(server, /cashColumnStart \+ 4/);
  assert.match(server, /screenshotStartColumn \+ index/);
  assert.match(server, /totalCashIn = rows\.reduce/);
  assert.match(server, /totalCashOut = rows\.reduce/);
});
