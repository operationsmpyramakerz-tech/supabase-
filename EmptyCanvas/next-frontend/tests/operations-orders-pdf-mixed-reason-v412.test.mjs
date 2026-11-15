import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { isMixedArabicReason, prepareMixedArabicReason } = require('../lib/pdfMixedArabicReason.js');
const delivery = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/deliveryReceiptPdf.js'), 'utf8');

test('detects mixed Arabic/English reasons but leaves purely Arabic/English untouched', () => {
  assert.equal(isMixedArabicReason('تم توريد كتب Theme Two'), true);
  assert.equal(isMixedArabicReason('تم توريد الكتب'), false);
  assert.equal(isMixedArabicReason('Theme Two'), false);
});

test('RTL reason preserves Arabic word direction and English phrase word order', () => {
  assert.deepEqual(prepareMixedArabicReason('استكمال الجزء في إعداد الكتب المطبوعة من قبل Theme Two'), {
    text: 'Theme Two قبل من المطبوعة الكتب إعداد في الجزء استكمال', align: 'right',
  });
});

test('starts with English: keeps its order and reverses only the adjacent Arabic words', () => {
  assert.deepEqual(prepareMixedArabicReason('Theme Two استكمال الجزء في إعداد الكتب'), {
    text: 'Theme Two الكتب إعداد في الجزء استكمال', align: 'left',
  });
});

test('preserves numeric and Latin runs in between Arabic words', () => {
  assert.deepEqual(prepareMixedArabicReason('تم تسليم 11 Kits إلى School One'), {
    text: 'School One إلى 11 Kits تسليم تم', align: 'right',
  });
});

test('parentheses around an Arabic phrase remain balanced and English parentheses stay intact', () => {
  assert.deepEqual(prepareMixedArabicReason('تجهيز (كتب الفصل) إلى (Theme Two)'), {
    text: '(Theme Two) إلى (الفصل كتب) تجهيز', align: 'right',
  });
});

test('wrapping occurs at logical word boundaries before reversing each visual line', () => {
  const result = prepareMixedArabicReason('استكمال الكتب Theme Two في مدرسة الإسكندرية', {
    width: 15,
    measure: (text) => text.length,
  });
  assert.equal(result.align, 'right');
  assert.deepEqual(result.text.split('\n'), ['الكتب استكمال', 'في Theme Two', 'مدرسة', 'الإسكندرية']);
});

test('preserves explicit line breaks and original values without mixed scripts', () => {
  assert.deepEqual(prepareMixedArabicReason('تم توريد Theme One\nبواسطة Production Team'), {
    text: 'Theme One توريد تم\nProduction Team بواسطة', align: 'right',
  });
  assert.equal(prepareMixedArabicReason('New books').text, 'New books');
  assert.equal(prepareMixedArabicReason('بواسطة المخزن').text, 'بواسطة المخزن');
});

test('delivery receipt uses native Arabic shaping in summary reason and group heading', () => {
  assert.match(delivery, /const drawReasonText = \(value, x, y, width, options = \{\}\) =>/);
  assert.match(delivery, /withNativeArabicPdfText\(doc, \(\) => \{\s*const prepared = prepareMixedArabicReason\(raw\)/);
  assert.match(delivery, /summaryLabel\("reason", "Reason"\), reasonLabel, \{ isReason: true \}/);
  assert.match(delivery, /drawReasonText\(reason \|\| "No Reason"/);
});

test('table Reason column measures and renders the same native-shaped wrapped string', () => {
  assert.match(delivery, /c\.key !== "reason" \|\| !isMixedArabicReason\(raw\)/);
  assert.match(delivery, /prepareMixedArabicReason\(raw, \{ width, measure:/);
  assert.match(delivery, /value\.native \? withNativeArabicPdfText\(doc, measure\) : measure\(\)/);
  assert.match(delivery, /if \(value\.native\) withNativeArabicPdfText\(doc, draw\)/);
});

test('the actual Delivery Receipt renderer passes mixed Reason to PDFKit in visual order under native shaping', async () => {
  // The repository does not bundle node_modules; stub PDFKit to exercise the
  // receipt's real rendering control flow and inspect text sent to the engine.
  const vm = await import('node:vm');
  const file = path.resolve(import.meta.dirname, '../lib/deliveryReceiptPdf.js');
  const source = fs.readFileSync(file, 'utf8');
  const instances = [];
  class MockDoc {
    constructor() {
      this.page = { width: 595, height: 842, margins: { left: 36, right: 36, top: 36, bottom: 36 } };
      this.y = 60;
      this.calls = [];
      this.__pdfArabicNativeShaping = false;
      instances.push(this);
    }
    text(value, ...args) {
      this.calls.push({ value: String(value), native: this.__pdfArabicNativeShaping, args });
      if (typeof args[1] === 'number') this.y = args[1] + 11;
      else this.y += 11;
      return this;
    }
    heightOfString(text) { return (String(text).split('\n').length) * 11; }
    widthOfString(text) { return String(text).length * 5; }
    moveDown() { this.y += 7; return this; }
    save() { return this; }
    restore() { return this; }
    pipe() { return this; }
    end() { return this; }
    addPage() { this.y = 70; return this; }
  }
  for (const method of ['roundedRect', 'rect', 'fillColor', 'fill', 'strokeColor', 'stroke', 'font',
    'fontSize', 'lineWidth', 'moveTo', 'lineTo', 'fillAndStroke']) {
    MockDoc.prototype[method] = function () { return this; };
  }
  const loaded = { exports: {} };
  const moduleRequire = (name) => {
    if (name === 'pdfkit') return MockDoc;
    if (name === './pdfPageNumbers') return { attachPageNumbers() {} };
    if (name === './pdfHeader') return { drawStocktakingHeader(doc) { doc.y = 80; } };
    if (name === './pdfArabicSupport') return {
      enableArabicPdf() {}, ensurePdfArabicSupport: async () => {},
      withNativeArabicPdfText(doc, callback) {
        const previous = doc.__pdfArabicNativeShaping;
        doc.__pdfArabicNativeShaping = true;
        try { return callback(); } finally { doc.__pdfArabicNativeShaping = previous; }
      },
    };
    if (name === './pdfMixedArabicReason') return require('../lib/pdfMixedArabicReason.js');
    if (name === 'path') return require('node:path');
    throw new Error(`Unexpected mock dependency ${name}`);
  };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: moduleRequire,
    __dirname: path.dirname(file), console, process, Date, Number, String, Map, Array, Math }, { filename: file });
  const reason = 'استكمال الجزء في إعداد الكتب المطبوعة من قبل Theme Two';
  await loaded.exports.pipeDeliveryReceiptPDF({
    orderId: 'ORD-124', createdAt: '2026-11-15', teamMember: 'Djibouti School', preparedBy: reason,
    rows: [{ idCode: 'A500235', component: 'Grade 1 Book', reason, qty: 16, unit: 200, total: 3200 }],
    showCosts: false, showFooterSignature: false,
  }, {});
  const output = instances[0]?.calls || [];
  const visual = 'Theme Two قبل من المطبوعة الكتب إعداد في الجزء استكمال';
  const matches = output.filter(({ value }) => value === visual);
  assert.ok(matches.length >= 2, 'summary card and Reason group header should both use the corrected visual string');
  assert.ok(matches.every(({ native }) => native), 'mixed Arabic text must bypass legacy visual shaping');
  assert.ok(output.some(({ value, native }) => value === 'Djibouti School' && !native));
});
