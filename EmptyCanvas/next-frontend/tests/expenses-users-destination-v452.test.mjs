import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expenseOrderLinks, expenseReasonExportPayload } from '../lib/expense-export-order-links.mjs';
import { selectAuthorizedExpenseExportRows } from '../lib/expense-export-input-policy.mjs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const jsx = source('../components/expenses/ExpensesUsersDialogs.jsx');
const groupUserExpenses = vm.runInNewContext(jsx.slice(jsx.indexOf('const SETTLEMENT_KEY'), jsx.indexOf('function groupTotal(')) + '\ngroupUserExpenses;', { Date });
const row = (id, destinationUserId, destinationUserName, cashOut = 100, extra = {}) => ({
  id, date: '2026-11-17', reason: 'ORD-129', fundsType: 'Indrive', cashIn: 0, cashOut,
  destinationUserId, destinationUserName, orders: [{ orderId: 'ORD-129' }], ...extra,
});
const plain = value => JSON.parse(JSON.stringify(value));

test('same date and reason but different destination IDs produce separate tickets and totals', () => {
  const groups = groupUserExpenses([row('1', 'a', 'ACIC', 150), row('2', 'a', 'ACIC', 137), row('3', 'b', 'Princeton', 40)]);
  assert.equal(groups.length, 2);
  assert.deepEqual(plain(groups.map(g => [g.destinationName, g.totalCashOut, g.items.map(i => i.id)])), [['ACIC', 287, ['1', '2']], ['Princeton', 40, ['3']]]);
  assert.equal(groups[0].orders.length, 1);
});

test('same name different IDs, legacy missing destination, and name-only records remain separate', () => {
  const groups = groupUserExpenses([row('1', 'a', 'ACIC'), row('2', 'b', 'ACIC'), row('3', '', ''), row('4', '', ' ACIC '), row('5', '', 'acic')]);
  assert.equal(groups.length, 4);
  assert.equal(groups.find(g => g.destinationName === '').items[0].id, '3');
  assert.equal(groups.find(g => g.items.length === 2).totalCashOut, 200);
});

test('renamed destination retains one ID-based ticket with latest nonempty name', () => {
  const groups = groupUserExpenses([row('1', 'a', 'New', 15, { createdTime: '2026-11-17T09:00:00Z' }), row('2', 'a', 'Old', 20, { createdTime: '2026-11-17T08:00:00Z' }), row('3', 'a', '', 5, { createdTime: '2026-11-17T10:00:00Z' })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].destinationName, 'New');
  assert.equal(groups[0].totalCashOut, 40);
});

test('destination grouping preserves date/reason boundaries, cash in and sort order', () => {
  const groups = groupUserExpenses([row('1', 'a', 'ACIC', 70), row('2', 'a', 'ACIC', 0, { reason: 'Cash In', cashIn: 600 }), row('3', 'a', 'ACIC', 15, { date: '2026-11-16' })], 'high');
  assert.equal(groups.length, 3);
  assert.equal(groups[0].totalCashIn, 600);
  assert.equal(groups.reduce((sum, g) => sum + g.totalCashOut, 0), 85);
});

test('ticket header shows destination, date, then reason and retains permission-gated actions', () => {
  const ticket = jsx.slice(jsx.indexOf('function UserExpenseTicket('), jsx.indexOf('export function UserExpensesModal('));
  assert.match(ticket, /group\.destinationName \|\| "—"/);
  assert.match(ticket, /expense-ticket__destination-date[\s\S]*formatExpenseGroupDate[\s\S]*expense-ticket__destination-divider[\s\S]*UserExpenseOrderActions/);
  assert.match(ticket, /Boolean\(ids\.length && \(onEdit \|\| onDelete\)\)/);
  assert.match(ticket, /onDelete\(ids\)/);
  assert.match(ticket, /onEdit\(primary\)/);
});

// Workbook test double: execute the real exporter, inspecting its row/cell
// assignments without needing ExcelJS or a production Supabase connection.
function workbookDouble() {
  const sheets = [];
  class Row {
    constructor() { this.cells = new Map(); }
    getCell(n) { if (!this.cells.has(n)) this.cells.set(n, {}); return this.cells.get(n); }
    eachCell(_options, cb) { for (const [n, cell] of this.cells) cb(cell, n); }
  }
  class Sheet {
    constructor() { this.rows = new Map(); this.columns = new Map(); }
    get rowCount() { return Math.max(0, ...this.rows.keys()); }
    getRow(n) { if (!this.rows.has(n)) this.rows.set(n, new Row()); return this.rows.get(n); }
    addRow(values) { const row = this.getRow(this.rowCount + 1); values.forEach((v, i) => { row.getCell(i + 1).value = v; }); return row; }
    getCell(a) { const [, col, n] = a.match(/^([A-Z]+)(\d+)$/); return this.getRow(Number(n)).getCell(col.charCodeAt(0) - 64); }
    getColumn(n) { if (!this.columns.has(n)) this.columns.set(n, {}); return this.columns.get(n); }
    mergeCells() {}
  }
  class Workbook { constructor() { this.xlsx = { writeBuffer: async () => Buffer.from('test-double') }; } addWorksheet() { const sheet = new Sheet(); sheets.push(sheet); return sheet; } }
  return { Workbook, sheets };
}
async function runExport(items, includeDestination) {
  const ExcelJS = workbookDouble();
  const exp = source('../lib/expense-export-service.js');
  const helpers = exp.slice(exp.indexOf('function text('), exp.indexOf('function collectPdfBuffer('));
  const body = exp.slice(exp.indexOf('function numberFormat('), exp.indexOf('export async function renderExpenseExport('));
  const render = vm.runInNewContext(helpers + body + '\nrenderExpenseExcel;', { ExcelJS, expenseOrderLinks, expenseReasonExportPayload, Date, Buffer });
  await render({ userName: 'Expenses — Test', baseUrl: 'https://erp.test', items, includeDestination });
  return ExcelJS.sheets[0];
}
function columnFor(sheet, label) { return [...sheet.getRow(8).cells].find(([, cell]) => cell.value === label)?.[0]; }

test('users export adds destination without shifting order, amount or screenshot data incorrectly', async () => {
  const sheet = await runExport([
    row('1', 'a', 'مدرسة ACIC', 137.5, { reason: 'ORD-129, ORD-130', orders: [{ orderId: 'ORD-129' }, { orderId: 'ORD-130' }], from: 'A', to: 'B', kilometer: 5, screenshots: [{ name: 'receipt.jpg', url: 'https://erp.test/receipt' }] }),
    row('2', '', '', 0, { cashIn: 600 }),
  ], true);
  const cell = (r, label) => sheet.getRow(r).getCell(columnFor(sheet, label));
  assert.equal(columnFor(sheet, 'Destination'), 6);
  assert.equal(cell(9, 'Destination').value, 'مدرسة ACIC');
  assert.equal(cell(10, 'Destination').value, '');
  assert.match(cell(9, 'Order 1').value.hyperlink, /129/);
  assert.match(cell(9, 'Order 2').value.hyperlink, /130/);
  assert.equal(cell(9, 'From').value, 'A');
  assert.equal(cell(9, 'To').value, 'B');
  assert.equal(cell(9, 'Kilometers').value, 5);
  assert.equal(cell(9, 'Cash Out').value, 137.5);
  assert.equal(cell(9, 'Cash Out').font.color.argb, 'FFDC2626');
  assert.equal(cell(10, 'Cash In').value, 600);
  assert.equal(cell(10, 'Cash In').font.color.argb, 'FF16A34A');
  assert.match(cell(9, 'Screenshot 1').value.hyperlink, /expenseId=1&index=0/);
  assert.equal(sheet.getCell('B4').value, 600);
  assert.equal(sheet.getCell('B5').value, 137.5);
  assert.equal(sheet.getCell('B6').value, 462.5);
});

test('users export works with no linked orders or screenshots; other export scope unchanged', async () => {
  const items = [row('1', 'a', 'ACIC', 5, { reason: 'Manual', orders: [] })];
  const users = await runExport(items, true);
  const current = await runExport(items, false);
  assert.equal(columnFor(users, 'Destination'), 4);
  assert.equal(columnFor(current, 'Destination'), undefined);
  assert.equal(current.getRow(9).getCell(columnFor(current, 'Cash Out')).value, 5);
  assert.equal(users.getRow(9).getCell(columnFor(users, 'Cash Out')).value, 5);
});

test('export flag is server-derived and canonical row supplies destination rather than browser payload', () => {
  const route = source('../app/api/expenses/export-direct/route.js');
  assert.match(route, /includeDestination: isUsersExport/);
  const result = selectAuthorizedExpenseExportRows([{ id: '1', destinationUserName: 'Forged' }], [row('1', 'a', 'ACIC')]);
  assert.equal(result.rows[0].destinationUserName, 'ACIC');
});
