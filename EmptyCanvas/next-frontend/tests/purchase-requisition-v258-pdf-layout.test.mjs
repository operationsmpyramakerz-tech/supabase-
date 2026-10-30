import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {hasPrArabic,prTextTokens,prSplitLines,prLineWidth} from '../lib/purchase-requisition-pdf-layout.mjs';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'lib/purchase-requisition-render.js'),'utf8');

test('keeps Arabic in logical order, so PDFKit shapes words separately',()=>{
  assert.deepEqual(prTextTokens('نموذج طلب شراء'),['نموذج','طلب','شراء']);
  assert.deepEqual(prTextTokens('المراجعة الفنية (إن لزم)'),['المراجعة','الفنية','(','إن','لزم',')']);
  assert.deepEqual(prTextTokens('رقم طلب الشراء (PR No.)'),['رقم','طلب','الشراء','(PR No.)']);
  assert.deepEqual(prTextTokens('اسم الصنف / الخدمة'),['اسم','الصنف','/','الخدمة']);
  assert.equal(hasPrArabic('Neodymium Disc Magnets 15x3mm'),false);
});

test('wraps Arabic and English in cells with explicit spaces instead of dropping words',()=>{
  const measure=(s)=>s.length*6;
  const lines=prSplitLines('الحد الأدنى للصلاحية عند التوريد',88,measure,3);
  assert.ok(lines.length>1);
  assert.equal(lines.flat().join(' '),'الحد الأدنى للصلاحية عند التوريد');
  for(const line of lines)assert.ok(prLineWidth(line,measure,3)<=88);
  assert.deepEqual(prSplitLines('requester\nmanager',180,measure),[['requester'],['manager']]);
});

test('native PDF uses token-positioned RTL text and page-aware section tables',()=>{
  assert.match(source,/prSplitLines\(text,maxWidth,measure,gap\)/);
  assert.match(source,/for\(const token of tokens\)/);
  assert.match(source,/cursor-=tw;paintToken/);
  assert.match(source,/guard=\(y,h\)=>y\+h>bottomLimit/);
  assert.match(source,/function brand\(\)/);
  assert.match(source,/function footer\(\)/);
  assert.match(source,/const tableHead=/);
  assert.match(source,/function pairRow/);
  assert.doesNotMatch(source,/nativePrPdfRtlWordOrder/);
});

test('keeps DOCX conversion as first choice and preserves download/save routes',()=>{
  assert.match(source,/convertFilledWordToPdf\(raw\)/);
  assert.match(source,/export async function renderPrWord/);
  const api=fs.readFileSync(path.join(root,'app/api/orders/purchase-requisition/route.js'),'utf8');
  assert.match(api,/assertOrderIdsInScope/);
});
