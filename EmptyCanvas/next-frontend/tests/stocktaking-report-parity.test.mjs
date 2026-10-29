import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stocktakingReportRows,
  stocktakingReportGroups,
  stocktakingReportSummary,
  stocktakingReportCell,
} from '../lib/stocktaking-report-layout.mjs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every stock item is exported; duplicate components remain separate', () => {
  const input = Array.from({ length: 167 }, (_, i) => ({
    id: `id-${i + 1}`, idCode: `A${i % 17}`, name: `Motor ${i % 6}`, quantity: i % 2 ? 2 : 1,
    unitPrice: 5.17, tag: { name: i < 100 ? 'G1' : 'Tools' },
  }));
  const rows = stocktakingReportRows(input, ['stock', 'unityPrice', 'totalPrice']);
  assert.equal(rows.length, 167);
  assert.equal(stocktakingReportGroups(rows).reduce((sum, group) => sum + group.items.length, 0), 167);
  assert.equal(stocktakingReportSummary(rows).items, 167);
  assert.equal(stocktakingReportSummary(rows).tags, 2);
  assert.equal(stocktakingReportSummary(rows).quantity, 250);
  assert.equal(Number(stocktakingReportSummary(rows).stockValue.toFixed(2)), 1292.5);
});

test('a zero-stock row is excluded unless a chosen inventory session column has a value', () => {
  const input = [{ id: '1', quantity: 0, inventory: 3, defected: 0, tag: { name: 'G1' } }, { id: '2', quantity: 4, tag: { name: 'G2' } }];
  assert.equal(stocktakingReportRows(input, ['stock']).length, 1);
  assert.equal(stocktakingReportRows(input, ['stock', 'inventory']).length, 2);
  assert.equal(stocktakingReportRows(input, ['stock', 'defected']).length, 2);
});

test('all optional columns have accurate values, including zero and empty values', () => {
  const item = { idCode: 'A100020', name: 'DC Motor', quantity: 3, unitPrice: 5.17, receiptNumber: 'R1, R2\nR3', inventory: 0, defected: null };
  assert.equal(stocktakingReportCell(item, 'idCode'), 'A100020');
  assert.equal(stocktakingReportCell(item, 'stock'), 3);
  assert.equal(stocktakingReportCell(item, 'totalPrice'), 15.51);
  assert.equal(stocktakingReportCell(item, 'receiptNumber'), 'R1, R2, R3');
  assert.equal(stocktakingReportCell(item, 'inventory'), 0);
  assert.equal(stocktakingReportCell(item, 'defected'), '');
});

test('Stocktaking PDF reuses the Operations Orders renderer and preserves user-selected columns', () => {
  const stock = source('lib/stocktaking-export-service.js');
  const orderPdf = source('lib/deliveryReceiptPdf.js');
  assert.match(stock, /pipeDeliveryReceiptPDF\(/);
  assert.match(stock, /groupMode: "product-tag"/);
  assert.match(stock, /exportColumnDefs: stockPdfColumns\(selectedColumns\)/);
  assert.match(stock, /signatureLabels: signatures/);
  assert.match(stock, /stocktakingForColumn\(column, \{ inventoryColumn, defectedColumn, fresh \}\)/);
  assert.match(orderPdf, /summaryTitle = "Order Summary"/);
  assert.match(orderPdf, /summaryLabels = null/);
  assert.match(orderPdf, /drawInfoBox\(mL, infoY1, summaryLabel\("teamMember"/);
});

test('Stocktaking Excel follows the Operations Orders report hierarchy', () => {
  const code = source('lib/stocktaking-export-service.js');
  assert.match(code, /ws\.mergeCells\(1, 1, 1, lastCol\)/);
  assert.match(code, /summaryHeader\.value = "Summary"/);
  assert.match(code, /stocktakingReportGroups\(rows\)/);
  assert.match(code, /groupIndex \+ 1/);
  assert.match(code, /ws\.views = \[\{ state: "frozen", ySplit: headerIndex \}\]/);
  assert.match(code, /"EGP" #,##0\.00/);
});
