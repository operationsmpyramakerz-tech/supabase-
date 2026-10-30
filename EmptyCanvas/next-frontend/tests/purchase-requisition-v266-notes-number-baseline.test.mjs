import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prNotesNumeralBaselineDrop, prTextTokens} from '../lib/purchase-requisition-pdf-layout.mjs';

const source=fs.readFileSync(new URL('../lib/purchase-requisition-render.js',import.meta.url),'utf8');

test('standalone Western numerals in Arabic notes descend slightly',()=>{
  const size=9.2*.94;
  assert.ok(Math.abs(prNotesNumeralBaselineDrop('350',size)-2.162)<.001);
  assert.ok(Math.abs(prNotesNumeralBaselineDrop('100',size)-2.162)<.001);
  assert.equal(prNotesNumeralBaselineDrop('12.5',8),2);
  assert.deepEqual(prTextTokens('الغلاف: ورق سُمك 350 جرام'),['الغلاف:','ورق','سُمك','350','جرام']);
});

test('only isolated numeric tokens are moved, not ordinary words or mixed codes',()=>{
  for(const value of ['الغلاف','جرام','350جرام','A500235','02/11/2026','Two','-','']){
    assert.equal(prNotesNumeralBaselineDrop(value,9),0,value);
  }
  assert.equal(prNotesNumeralBaselineDrop('350',NaN),0);
});

test('numeric alignment is opt-in exclusively in Notes drawing; dates and table cells retain baselines',()=>{
  assert.match(source,/numeralBaselineDrop > 0/);
  assert.match(source,/doc\.text\(token,xx,yy\+numeralBaselineDrop,\{lineBreak:false\}\)/);
  assert.match(source,/opts\.notesNumeralAlignment\?prNotesNumeralBaselineDrop\(token,size\):0/);
  assert.equal((source.match(/notesNumeralAlignment:true/g)||[]).length,1);
  assert.match(source,/valign:"top",padding:11,notesNumeralAlignment:true/);
  assert.match(source,/doc\.text\(token,xx,yy,\{lineBreak:false\}\)/);
});
