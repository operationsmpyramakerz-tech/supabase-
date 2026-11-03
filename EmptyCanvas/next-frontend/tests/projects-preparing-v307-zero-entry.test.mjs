import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {normalizeStageQuantityDraft} from '../lib/preparing-stage-quantity-input.mjs';
const ts=createRequire(import.meta.url)('typescript');
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('zero is removed only when digits follow it; draft stays editable',()=>{
  for(const [raw,expected] of [
    ['', ''], ['0','0'], ['00','0'], ['0008','8'], ['07','7'],
    ['12','12'], ['100','100'], ['-0007','-7'], ['-0','-0'],
    ['0.5','0.5'], ['1e2','1e2'], ['','']
  ]) assert.equal(normalizeStageQuantityDraft(raw), expected, raw);
});

test('shared numeric component shows a blank on focus only for 0, restores on untouched blur',()=>{
  const jsx=read('components/preparing/StageQuantityInput.jsx');
  assert.match(jsx,/String\(value\?\?""\)==="0"/);
  assert.match(jsx,/value=\{replaceInitialZero&&isZero\?"":value\?\?""\}/);
  assert.match(jsx,/onFocus=\{event=>\{setReplaceInitialZero\(isZero\)/);
  assert.match(jsx,/onBlur=\{event=>\{setReplaceInitialZero\(false\)/);
  assert.match(jsx,/onValueChange\(normalizeStageQuantityDraft\(event.currentTarget.value\)\)/);
  const ast=ts.createSourceFile('StageQuantityInput.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[]);
});

test('all five project stage quantity editors use the zero-replacement input',()=>{
  const expectations={
    'ProjectTesting.jsx':['Testing received', 'Passed testing', 'Failed testing'],
    'ProjectWarehouseReceiving.jsx':['Received ${row.product_name}','Allocate ${row.product_name}'],
    'ProjectProductionReceiving.jsx':['Production Received ${r.name}'],
    'ProjectBoxDistribution.jsx':['Packed ${row.name}'],
    'ProjectKitCartons.jsx':['Packed ${c.product_name}','Quantity to allocate'],
  };
  for(const [file,tokens] of Object.entries(expectations)){
    const jsx=read(`components/preparing/${file}`);
    assert.match(jsx,/import StageQuantityInput from "\.\/StageQuantityInput";/,file);
    assert.match(jsx,/<StageQuantityInput\b/,file);
    assert.doesNotMatch(jsx,/<input\b[^>]*type="number"/,file);
    for(const token of tokens) assert.ok(jsx.includes(token), `${file} missing ${token}`);
    const ast=ts.createSourceFile(file,jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
    assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[],file);
  }
});
