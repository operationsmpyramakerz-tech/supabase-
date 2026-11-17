import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expenseOrderLinks, expenseReasonExportPayload } from '../lib/expense-export-order-links.mjs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const base = 'https://erp.test';

const options = { secret: 'expense-test-secret-32-characters-minimum' };
const linked = (extra = {}) => ({ id:'expense-1', cashOut:100, reason:'ORD-147, ORD-138', ordersRaw:'1001,1002,2001', orders:[{orderId:'ORD-147'}, {orderId:'ORD-138'}], ...extra });
const parse = href => new URL(href).searchParams;
test('two linked orders keep both labels and receive independent signed public links', () => {
  const item = linked();
  const links = expenseOrderLinks(item, base, options);
  assert.deepEqual(links.map(x=>x.text), ['ORD-147','ORD-138']);
  assert.equal(new URL(links[0].hyperlink).pathname, '/next/share/expenses/order');
  assert.equal(parse(links[0].hyperlink).get('target'), '147');
  assert.equal(parse(links[1].hyperlink).get('target'), '138');
  const reason = expenseReasonExportPayload(item, base, options);
  assert.equal(reason.text, 'ORD-147, ORD-138');
  assert.equal(parse(reason.hyperlink).get('target'), 'all');
  assert.notEqual(parse(reason.hyperlink).get('token'), parse(links[0].hyperlink).get('token'));
});
test('duplicate component rows never duplicate exported order columns', () => {
  assert.deepEqual(expenseOrderLinks(linked({orders:[{orderId:'ORD-147'},{orderId:'ORD-147'},{orderId:'ORD-138'}]}), base, options).map(x=>x.text), ['ORD-147','ORD-138']);
});
test('legacy label without verified component IDs stays text and manual reason is preserved', () => {
  const one = expenseReasonExportPayload(linked({reason:'ORD-123',orders:[{orderId:'ORD-123'}],ordersRaw:''}), base, options);
  assert.equal(one.text, 'ORD-123'); assert.equal(one.hyperlink, '');
  assert.deepEqual(expenseReasonExportPayload({cashOut:75,reason:'Printer repair - £75',orders:[{orderId:'Other reason'}]},base,options), {text:'Printer repair - £75',hyperlink:'',links:[]});
});
test('unsafe or missing URL origins never create arbitrary hyperlinks', () => {
  assert.equal(expenseOrderLinks(linked(), 'javascript:alert(1)', options)[0].hyperlink, '');
  assert.equal(expenseReasonExportPayload(linked(), 'javascript:alert(1)', options).hyperlink, '');
});
test('invalid raw relation IDs never issue public order capabilities', () => {
  const reason = expenseReasonExportPayload(linked({ordersRaw:'1001;drop'}), base, options);
  assert.equal(reason.text, 'ORD-147, ORD-138'); assert.equal(reason.hyperlink, '');
  assert.equal(reason.links.length, 2); assert.ok(reason.links.every(x=>!x.hyperlink));
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
