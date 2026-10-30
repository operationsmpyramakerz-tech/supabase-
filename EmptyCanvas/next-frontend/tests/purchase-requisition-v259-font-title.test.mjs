import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'lib/purchase-requisition-render.js'), 'utf8');

test('native PR PDF text uses a six-percent smaller font throughout, not in Word', () => {
  assert.match(src, /const PDF_FONT_SCALE\s*=\s*0\.94/);
  assert.match(src, /const size=\(opts\.size\?\?9\)\*PDF_FONT_SCALE/);
  const wordStart = src.indexOf('export async function renderPrWord(');
  const pdfStart = src.indexOf('export async function renderPrPdf(');
  const fontScaleAt = src.indexOf('const PDF_FONT_SCALE');
  assert.ok(wordStart >= 0 && pdfStart > wordStart && fontScaleAt > pdfStart);
});

test('Arabic PR title and orange divider are vertically aligned with the English title', () => {
  assert.match(src, /write\(english,groupLeft,cy,182,33,\{size:13,bold:true,rtl:false,align:"right"\}\)/);
  assert.match(src, /write\(arabic,groupLeft\+200,cy-7,165,33,\{size:14\.5,bold:true,rtl:true,align:"left"\}\)/);
  assert.match(src, /moveTo\(groupLeft\+190,cy\+1\)\.lineTo\(groupLeft\+190,cy\+21\)/);
});

test('table geometry and native PDF export flow are unchanged', () => {
  assert.match(src, /const margin=34, left=margin, pageContent=pageWidth-margin\*2/);
  assert.match(src, /const columnWidths=\[25,51,172,39,36,73,61,pageContent-/);
  assert.match(src, /convertFilledWordToPdf\(raw\)/);
  assert.match(src, /await ensurePdfArabicSupport\(\)/);
});
