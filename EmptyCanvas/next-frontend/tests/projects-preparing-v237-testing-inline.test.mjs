import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingChange} from '../lib/preparing-project-testing-math.mjs';
const ts=createRequire(import.meta.url)('typescript');
const file=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ui=file('components/preparing/ProjectTesting.jsx');
const backend=file('lib/preparing-project-testing.js');
const css=file('public/css/projects-preparing.css');

test('testing row shows component, code and project required on the same header row',()=>{
 assert.match(ui,/pr-pt-heading/);
 assert.match(ui,/pr-pt-name-inline/);
 assert.match(ui,/pr-pt-required/);
 assert.match(ui,/pretty\(r\.required\)/);
 assert.match(css,/\.pr-pt-heading\{display:flex/);
});
test('editing swaps each displayed metric for an input in the exact same metric slot',()=>{
 assert.match(ui,/metrics\.map\(field=>/);
 assert.match(ui,/isEditing&&!isRemaining\?<input/);
 assert.match(ui,/pr-pt-metric-value/);
 assert.doesNotMatch(ui,/className="pr-pt-controls"/);
 assert.doesNotMatch(ui,/className="pr-pt-figures"/);
 assert.match(ui,/save\(\[r\.id\]\)/);
 assert.match(ui,/rowError\[r\.id\]/);
});
test('Save per row automatically generates a unique report reference server-side',()=>{
 assert.doesNotMatch(ui,/reference:manualReference|Report reference|Save All Changes/);
 assert.match(ui,/await request\("\/testing","POST",\{projectId,lines\}\)/);
 assert.match(backend,/import \{ randomUUID \} from "node:crypto"/);
 assert.match(backend,/\|\| `QC-\$\{randomUUID\(\)\}`/);
 assert.match(ui,/Save and refresh are separate/);
});
test('testing calculations and validation remain enforced',()=>{
 assert.deepEqual(testingChange({id:'x',received:0,passed:0,failed:0,accepted:0},{received:'4',passed:'3',failed:'1'}),{
  itemId:'x',receivedDelta:4,passedDelta:3,failedDelta:1,expectedReceived:0,expectedPassed:0,expectedFailed:0
 });
 assert.throws(()=>testingChange({id:'x',received:0,passed:0,failed:0},{received:'2',passed:'3',failed:'0'}));
});
test('responsive layout and syntax remain valid',()=>{
 assert.match(css,/@media\(max-width:580px\)/);
 assert.match(file('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=245/);
 for(const f of ['components/preparing/ProjectTesting.jsx','lib/preparing-project-testing.js','app/projects-preparing/page.jsx']){
  const ast=ts.createSourceFile(f,file(f),ts.ScriptTarget.Latest,true,f.endsWith('jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics,[],f);
 }
});
