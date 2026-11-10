import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const select=read('components/preparing/PreparingSelect.jsx');
const testing=read('components/preparing/ProjectTesting.jsx');
const css=read('public/css/projects-preparing.css');

test('Testing filter is icon-only and preserves its three actual filtering modes',()=>{
 assert.match(testing,/PreparingSelect iconOnly/);
 for(const key of ['all','pending','done'])assert.ok(testing.includes(`<option value="${key}">`));
 assert.match(select,/onChange\?\.\(\{target:\{value:item.value,name\}\}\)/);
});
test('Filter popup aligns to icon right and cannot extend beyond sheet boundaries',()=>{
 assert.match(select,/const sheet = iconOnly \? trigger\.current\.closest\("\.pr-components-sheet"\)/);
 assert.match(select,/const desiredLeft = iconOnly \? r\.right - width : r\.left/);
 assert.match(select,/Math\.max\(minLeft, Math\.min\(desiredLeft, maxRight - width\)\)/);
 assert.match(select,/const above = roomBelow < wantedHeight && roomAbove > roomBelow/);
 assert.match(select,/window\.addEventListener\("scroll",handleView,true\)/);
});
test('Popup displays a clear heading, selected option, checkmark and accepts Escape/keyboard controls',()=>{
 assert.match(select,/Filter components/);
 assert.match(select,/Choose a view/);
 assert.match(select,/role="listbox"/);
 assert.match(select,/aria-selected=\{String\(value\)===item\.value\}/);
 assert.match(select,/keyOption\(e,index\)/);
 assert.match(select,/e\.key === "Escape"/);
 assert.match(css,/\.pr-modern-select-menu--filter \.pr-modern-select-option\.is-selected/);
 assert.match(css,/background:#111827;color:#fff/);
});
test('Filter button uses subtle dark focus styling instead of orange outline; layout rules parse',()=>{
 assert.match(css,/\.pr-pt-modern \.pr-pt-toolbar \.pr-pt-filter-select\.is-open \.pr-modern-select-trigger/);
 assert.match(css,/outline:none;border-color:#30394a/);
 assert.match(css,/\.pr-modern-select-menu--filter/);
 assert.match(read('app/projects-preparing/page.jsx'),/v280-testing-filter-popover/);
 const ast=ts.createSourceFile('PreparingSelect.jsx',select,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(ast.parseDiagnostics,[]);
 assert.doesNotThrow(()=>postcss.parse(css));
});
