import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prTextTokens} from '../lib/purchase-requisition-pdf-layout.mjs';

const source=fs.readFileSync(path.join(import.meta.dirname,'../lib/purchase-requisition-render.js'),'utf8');

test('pipe separator in Arabic section headings is drawn slightly lower',()=>{
  assert.deepEqual(prTextTokens('ثالثا | المتطلبات الفنية والتسليم'),['ثالثا','|','المتطلبات','الفنية','والتسليم']);
  assert.match(source,/token==="\|"\?size\*\.36/);
});

test('slash separator in table labels is lowered without moving text words',()=>{
  assert.deepEqual(prTextTokens('متطلبات الفحص / الاختبار'),['متطلبات','الفحص','/','الاختبار']);
  assert.match(source,/token==="\/"\?size\*\.33/);
  assert.match(source,/doc\.text\(token,xx,yy,\{lineBreak:false\}\)/);
});

test('parentheses and main orange title divider keep previous alignment',()=>{
  assert.match(source,/size\*\.14/);
  assert.match(source,/moveTo\(groupLeft\+190,cy\+1\)\.lineTo\(groupLeft\+190,cy\+21\)/);
  assert.match(source,/yy\+baselineDrop/);
});
