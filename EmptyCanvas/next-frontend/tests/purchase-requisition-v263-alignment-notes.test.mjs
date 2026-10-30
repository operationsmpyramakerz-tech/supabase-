import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, '../lib/purchase-requisition-render.js'), 'utf8');

test('date values are one LTR run centered within their own cells', () => {
  assert.match(source, /function centeredDate\(value,x,y,w,h\)/);
  assert.match(source, /dateX=x\+\(w-dateWidth\)\/2/);
  assert.match(source, /dateY=y\+\(h-fontSize\*1\.18\)\/2/);
  assert.ok(source.includes('if(!label && /^\\d{2}'));
  assert.match(source, /centeredDate\(values\[j\],xx,y,width,h\)/);
});

test('PR No label measures both scripts, right-aligns the group, and inserts a dash', () => {
  assert.match(source, /function prNumberLabel\(x,y,w,h\)/);
  assert.match(source, /const arabic="رقم طلب الشراء", english="PR No\."/);
  assert.match(source, /const groupLeft=x\+w-7-groupWidth/);
  assert.match(source, /write\("-",groupLeft\+englishWidth\+gap/);
  assert.match(source, /if\(label && values\[j\]==="رقم طلب الشراء - PR No\."\)/);
});

test('names and signature labels have separate regions for centered Arabic and English values', () => {
  assert.match(source, /const labelWidth=39,valueLeft=xx\+13,valueWidth=width-labelWidth-18/);
  assert.match(source, /write\(value,valueLeft,rowY,valueWidth,30,\{size:8\.2,rtl:hasPrArabic\(value\),align:"center"/);
  assert.match(source, /doc\.save\(\)\.rect\(valueLeft,rowY\+1,valueWidth,28\)\.clip\(\)/);
});

test('blank notes placeholder is nearly halved so signatures move upward without truncating populated notes', () => {
  assert.match(source, /if \(!noteLines\.length\) \{cell\("",left,y,pageContent,25\);y\+=33;\}/);
  assert.match(source, /else \{\s*let current=0;/);
  assert.match(source, /y=guard\(y,162\);y\+=5;y=section\("خامساً \| التوقيعات والاعتمادات",y\)/);
});
