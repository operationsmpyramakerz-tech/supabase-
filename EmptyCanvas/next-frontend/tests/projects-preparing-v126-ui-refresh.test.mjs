import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const css=read('public/css/projects-preparing.css');
const select=read('components/preparing/PreparingSelect.jsx');

test('four preparation stage indices use one dark accessible number color',()=>{
 assert.match(css,/\.pr-project-step-timeline::before \{background:#141b2b/);
 assert.match(css,/\.pr-root--project \.pr-project-step-row:nth-child\(n\) \.pr-project-step-index/);
 assert.match(css,/background:#141b2b;color:#fff/);
});
test('Master BOM card has no progress; four operational cards keep muted horizontal bars',()=>{
 const src=read('components/preparing/PreparingClient.jsx');
 assert.match(src,/pr-project-components-card/);
 assert.doesNotMatch(src,/--pr-liquid-pct/);
 assert.match(src,/pr-step-kpi-track/);
 assert.match(css,/\.pr-step-kpi-fill/);
});
test('all Preparing native selects have been migrated to accessible controlled dropdowns',()=>{
 const folder=new URL('../components/preparing/',import.meta.url);
 for(const file of readdirSync(folder).filter(f=>f.endsWith('.jsx') && f!=='PreparingSelect.jsx')) {
   const src=read(`components/preparing/${file}`);
   assert.doesNotMatch(src,/<select[\s>]/,`${file} still uses a native select`);
   if(src.includes('<PreparingSelect'))assert.match(src,/import PreparingSelect from "\.\/PreparingSelect";/);
 }
 assert.match(select,/aria-haspopup="listbox"/);
 assert.match(select,/aria-expanded=\{open\}/);
 assert.match(select,/role="option"/);
 assert.match(select,/e\.key === "Escape"/);
 assert.match(select,/createPortal/);
 assert.match(select,/onChange\?\.\(\{target:\{value:item.value,name\}\}\)/);
});
test('modern export modal shared between all three project reports',()=>{
 for(const f of ['ProjectTesting.jsx','ProjectWarehouseReceiving.jsx','ProjectProductionReceiving.jsx']) {
  const src=read(`components/preparing/${f}`);
  assert.match(src,/pr-pt-export-summary/);
  assert.match(src,/pr-pt-export-modal/);
  assert.match(src,/pr-pt-export-actions/);
 }
 assert.match(css,/\.pr-pt-export-check:has\(input:checked\)/);
 assert.match(css,/\.pr-pt-export-actions \{display:grid;grid-template-columns:repeat\(2/);
});
test('kit cards have consistent SVG chevrons and expanded state',()=>{
 for(const f of ['ProjectTesting.jsx','ProjectWarehouseReceiving.jsx','ProjectProductionReceiving.jsx','ProjectBoxDistribution.jsx','ProjectMasterComponents.jsx']) {
  const src=read(`components/preparing/${f}`);
  assert.match(src,/viewBox="0 0 24 24"/);
  assert.doesNotMatch(src, /\{open\?"⌃":"⌄"\}|\{opened===g.key\?"⌃":"⌄"\}/);
 }
 assert.match(css,/\.pr-pt-kit-toggle\[aria-expanded="true"\]/);
});
test('all changed JSX files parse without diagnostics',()=>{
 for(const f of readdirSync(new URL('../components/preparing/',import.meta.url)).filter(f=>f.endsWith('.jsx'))) {
  const src=read(`components/preparing/${f}`);
  const tree=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(tree.parseDiagnostics,[],f);
 }
});
