import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { join } from 'node:path';
import { Writable } from 'node:stream';
const require = createRequire(import.meta.url);
const { wrapLogicalLines, layoutMaintenanceArabicText, drawMaintenanceArabicText } = require('../lib/maintenancePdfTextLayout.js');

// Actual logical text from the supplied orders export, ORD-155, without
// personal identifiers. It includes the leading space in the stored value.
const repair = ' تم التواصل مع المدرس المسؤل و ارسال فيديوهات تدريبية له و سيتم المتابعة بعد الانتهاء من مشاهدة الفيديوهات لإتمام التدريب';
const actual = 'تم التواصل مع المدرس المسؤل و اتضح عدم الدراية الكافية عن طريقة تشغيل الماكينة بسبب عدم حضور التدريب الذي تم للمدارس لدواعي مأمورية خارجية';
const normalize = text => text.trim().replace(/\s+/g, ' ');
const measure = text => Array.from(text).length * 4.25;

for (const [name, value] of [['Repair Action', repair], ['Actual Issue Description', actual]]) {
  test(`ORD-155 ${name} retains all words in logical order across different widths`, () => {
    for (const width of [70, 91, 113, 180, 211, 216, 220, 230, 260, 500]) {
      const lines = wrapLogicalLines(value, width, measure);
      assert.equal(lines.map(line => line.logical).join(' '), normalize(value));
      assert.ok(lines.every(line => line.width <= width));
      assert.equal(lines[0].text.split(' ').at(-1), 'تم');
      assert.equal(lines.map(line => line.text.split(' ').reverse().join(' ')).join(' '), normalize(value));
    }
  });
}

test('mixed English phrases, serials and numbers are retained in order', () => {
  const [line] = wrapLogicalLines('تم اختبار Power Supply 24V 2A رقم RC20-2515-1001', 500, measure);
  assert.equal(line.text, 'RC20-2515-1001 رقم Power Supply 24V 2A اختبار تم');
  assert.equal(wrapLogicalLines('تم استخدام ١٢ ٣٤ قطعة', 500, measure)[0].text, 'قطعة ١٢ ٣٤ استخدام تم');
  assert.equal(wrapLogicalLines('Power Supply تم الاختبار', 500, measure)[0].text, 'Power Supply الاختبار تم');
  assert.equal(wrapLogicalLines('تم تجهيز (كتب الفصل) إلى (Theme Two)', 500, measure)[0].text, '(Theme Two) إلى (الفصل كتب) تجهيز تم');
});

test('explicit line breaks, empty lines and long tokens survive wrapping', () => {
  const lines = wrapLogicalLines('تم\r\n\r\nإصلاح\nRC20-2515-1001-ABCDEFGHIJK', 30, measure);
  assert.equal(lines[0].logical, 'تم');
  assert.equal(lines[1].text, '');
  assert.equal(lines[2].logical, 'إصلاح');
  assert.equal(lines.slice(3).map(line => line.logical).join(''), 'RC20-2515-1001-ABCDEFGHIJK');
  assert.ok(lines.every(line => line.width <= 30));
  const combined = 'مُ'.repeat(20);
  const chunks = wrapLogicalLines(combined, 34, measure);
  assert.equal(chunks.map(l => l.logical).join(''), combined);
  assert.ok(chunks.every(l => l.logical.startsWith('م')));
});

class MockDoc extends EventEmitter {
  constructor() {
    super();
    this.page = { width: 595.28, height: 841.89, margins: {left:36,right:36,top:36,bottom:36} };
    this.x = 36; this.y = 60; this.calls = []; this.fontName = 'Helvetica'; this.size = 8.8;
    this.__pdfArabicFontNames = {regular:'ArabicRegular',bold:'ArabicBold'};
  }
  font(name) { this.fontName = name; return this; }
  fontSize(size) { this.size = size; return this; }
  widthOfString(text) { return Array.from(text).length * this.size * (this.fontName.startsWith('Arabic') ? .45 : .52); }
  currentLineHeight() { return this.size * 1.45; }
  heightOfString(text, {width} = {}) { return this.currentLineHeight() * Math.max(1, Math.ceil(this.widthOfString(text) / (width || 500))); }
  text(value, x, y, options = {}) {
    this.calls.push({value:String(value),x,y,options,font:this.fontName,native:this.__pdfArabicNativeShaping});
    if (typeof y === 'number') this.y = y + this.currentLineHeight(); else this.y += this.currentLineHeight();
    return this;
  }
  moveDown() { this.y += 10; return this; }
  addPage() { this.y = 36; return this; }
  end() { this.stream?.emit('finish'); }
  pipe(stream) { this.stream = stream; return stream; }
}
for (const name of ['save','restore','fillColor','roundedRect','fillAndStroke','rect','fill','strokeColor','lineWidth','moveTo','lineTo','stroke']) MockDoc.prototype[name] = function() {return this;};

test('draw uses exactly the measured lines, font and XY, never PDFKit auto wrapping', () => {
  const doc = new MockDoc();
  const layout = layoutMaintenanceArabicText(doc, repair, 211, {fontName:'Helvetica',fontSize:8.8,lineGap:1});
  assert.equal(doc.fontName, 'Helvetica');
  drawMaintenanceArabicText(doc, layout, 50, 100, 211);
  assert.equal(doc.calls.length, layout.lines.length);
  assert.equal(doc.calls[0].value.split(' ').at(-1), 'تم');
  doc.calls.forEach((call,i) => {
    assert.equal(call.value, layout.lines[i].text);
    assert.equal(call.options.lineBreak, false);
    assert.ok(!('width' in call.options));
    assert.equal(call.font, layout.arabicFont);
    assert.equal(call.native, true);
    assert.ok(Math.abs(call.x + layout.lines[i].width - 261) < 1e-6);
    assert.equal(call.y, 100 + i * layout.lineHeight);
  });
  assert.equal(doc.y, 100 + layout.height);
  assert.equal(doc.fontName, 'Helvetica');
  assert.equal(doc.__pdfArabicNativeShaping, false);
});

test('Arabic font stays consistent even on English-only continuation and with bold links', () => {
  const doc = new MockDoc();
  const layout = layoutMaintenanceArabicText(doc, 'تم\nRC20-2515-1001', 211, {fontName:'Helvetica-Bold',fontSize:10.5});
  drawMaintenanceArabicText(doc, layout, 10, 50, 211, {link:'https://example.com',underline:true});
  assert.equal(doc.calls.length, 2);
  assert.ok(doc.calls.every(c => c.font === 'ArabicBold' && c.options.link === 'https://example.com' && c.options.underline));
  assert.throws(() => layoutMaintenanceArabicText(Object.assign(new MockDoc(),{__pdfArabicFontNames:{}}), repair, 200, {fontName:'Helvetica',fontSize:8.8}), /Arabic font unavailable/);
});

const fixture = {
  orderId:'ORD-155', createdAt:'2026-11-19T10:22:32.218Z', teamMember:'مدرسة تجريبية',
  componentLogs:[{component:'3D Printer - machine',serialNumber:'RC20-2515-1001',issueDescription:'عدم معرفة طريقة تشغيل الماكينة',actualIssueDescription:actual,repairAction:repair,resolutionMethod:'Remote',technicianName:'Technician',loggedAt:'2026-11-19T10:29:06.913Z',logLabel:'Log One'}],
};

test('actual maintenance renderer sends every ORD-155 Repair Action line to PDFKit without a width or automatic wrapping', async () => {
  const filename = join(import.meta.dirname, '../lib/maintenanceReceiptPdf.js');
  const instances = [];
  class Document extends MockDoc { constructor() { super(); instances.push(this); } }
  const loaded = {exports:{}};
  const localRequire = name => {
    if (name === 'pdfkit') return Document;
    if (name === './pdfPageNumbers') return {attachPageNumbers(){}};
    if (name === './pdfHeader') return {drawStocktakingHeader(doc){doc.y=80;}};
    if (name === './pdfArabicSupport') return {...require('../lib/pdfArabicSupport.js'),enableArabicPdf(){},ensurePdfArabicSupport:async()=>{}};
    if (name === './maintenancePdfTextLayout') return require('../lib/maintenancePdfTextLayout.js');
    return require(name);
  };
  vm.runInNewContext(readFileSync(filename,'utf8'), {module:loaded,exports:loaded.exports,require:localRequire,process,console,Date,Number,String,Map,Array,Math}, {filename});
  await loaded.exports.pipeMaintenanceReceiptPDF(fixture,new EventEmitter());
  const calls = instances[0].calls;
  const start = calls.findIndex(c => c.value === 'Repair Action');
  assert.ok(start >= 0);
  const actionCalls = calls.slice(start+1).filter(c => c.native);
  assert.ok(actionCalls.length > 1);
  assert.equal(actionCalls[0].value.split(' ').at(-1),'تم');
  assert.equal(actionCalls.map(c => c.value.split(' ').reverse().join(' ')).join(' '),normalize(repair));
  assert.ok(actionCalls.every(c => c.options.lineBreak === false && !('width' in c.options)));
  assert.ok(actionCalls.every((c,i) => i === 0 || c.y > actionCalls[i-1].y));
});

// Runs automatically in an installed project (npm install). In a bare source
// archive it is skipped explicitly rather than claiming a real PDF was made.
let realPdfKit;
try { realPdfKit = require('pdfkit'); } catch {}
test('installed PDFKit produces a genuine one-page maintenance PDF for ORD-155', {skip:!realPdfKit}, async () => {
  const { pipeMaintenanceReceiptPDF } = require('../lib/maintenanceReceiptPdf.js');
  const chunks=[];
  const stream=new Writable({write(chunk,enc,cb){chunks.push(Buffer.from(chunk));cb();}});
  await pipeMaintenanceReceiptPDF(fixture,stream);
  const buffer=Buffer.concat(chunks);
  assert.equal(buffer.subarray(0,5).toString(),'%PDF-');
  assert.match(buffer.toString('latin1'),/\/Count\s+1\b/);
});
