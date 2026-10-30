import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nativePrPdfRtlWordOrder } from '../lib/purchase-requisition-pdf-text.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('corrects visual RTL word order without reversing the Arabic characters inside words', () => {
  assert.equal(nativePrPdfRtlWordOrder('نموذج طلب شراء'), 'شراء طلب نموذج');
  assert.equal(nativePrPdfRtlWordOrder('أولاً | بيانات طلب الشراء'), 'الشراء طلب بيانات | أولاً');
  assert.equal(nativePrPdfRtlWordOrder('خامساً | التوقيعات والاعتمادات'), 'والاعتمادات التوقيعات | خامساً');
});

test('keeps Latin names, order IDs and parenthesized English descriptions in order', () => {
  assert.equal(nativePrPdfRtlWordOrder('رقم طلب الشراء (PR No.)'), '(PR No.) الشراء طلب رقم');
  assert.equal(nativePrPdfRtlWordOrder('اسم مقدم الطلب MennaMedany'), 'MennaMedany الطلب مقدم اسم');
  assert.equal(nativePrPdfRtlWordOrder('أمر شغل ORD-123'), 'ORD-123 شغل أمر');
  assert.equal(nativePrPdfRtlWordOrder('Neodymium Disc Magnets 15x3mm'), 'Neodymium Disc Magnets 15x3mm');
});

test('preserves checkbox markers with their selected Arabic labels and multiline structure', () => {
  assert.equal(nativePrPdfRtlWordOrder('☐ عادي  ☑ عاجل  ☐ طارئ'), 'طارئ ☐  عاجل ☑  عادي ☐');
  assert.equal(nativePrPdfRtlWordOrder('اسم مقدم الطلب\nتاريخ الطلب'), 'الطلب مقدم اسم\nالطلب تاريخ');
});

test('purchase requisition has export/save actions at bottom only', () => {
  const client = fs.readFileSync(path.join(root, 'components/orders/PurchaseRequisitionClient.jsx'), 'utf8');
  assert.equal((client.match(/onClick=\{saveForm\}/g) || []).length, 1);
  assert.equal((client.match(/onClick=\{\(\)=>exportFile\('pdf'\)\}/g) || []).length, 1);
  assert.equal((client.match(/onClick=\{\(\)=>exportFile\('word'\)\}/g) || []).length, 1);
  assert.doesNotMatch(client, /className="pr-top-actions"/);
});

test('orange button uses title case with no CSS uppercase transform', () => {
  const css = fs.readFileSync(path.join(root, 'public/css/classic-parity.css'), 'utf8');
  const modal = fs.readFileSync(path.join(root, 'components/orders/OrderDownloadModal.jsx'), 'utf8');
  assert.match(modal, /<span>Purchase Requisition<\/span>/);
  assert.match(css, /\.order-download-btn--purchase\{[^}]*text-transform:none/);
});
