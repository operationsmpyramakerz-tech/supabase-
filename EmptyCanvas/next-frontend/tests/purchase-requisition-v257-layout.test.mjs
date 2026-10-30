import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nativePrPdfRtlWordOrder } from '../lib/purchase-requisition-pdf-text.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Arabic parentheticals stay paired, preserving RTL word order',()=>{
  assert.equal(nativePrPdfRtlWordOrder('المراجعة الفنية (إن لزم)'), '(لزم إن) الفنية المراجعة');
  assert.equal(nativePrPdfRtlWordOrder('رقم طلب الشراء (PR No.)'), '(PR No.) الشراء طلب رقم');
});
test('PDF fallback has no watermark, has compact branded header and shaded labels',()=>{
  const pdf=source('lib/purchase-requisition-render.js');
  assert.doesNotMatch(pdf,/const watermark\s*=/);
  assert.match(pdf,/function brand\(\)/);
  assert.match(pdf,/label:"\#EAF1F7"/);
  assert.match(pdf,/function sectionTitle\(\)/);
  assert.match(pdf,/prSplitLines\(text,maxWidth,measure,gap\)/);
});
test('editor preview does not draw watermark, and company appears alongside logo',()=>{
  const css=source('components/orders/purchase-requisition.css');
  assert.match(css,/\.pr-paper:before\{display:none\}/);
  assert.match(css,/\.pr-paper-head\{justify-content:flex-start/);
  assert.match(css,/border-left:3px solid \#ea6a16/);
});
