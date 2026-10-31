import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const src=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ui=src('components/preparing/ProjectTesting.jsx');
const select=src('components/preparing/PreparingSelect.jsx');
const css=src('public/css/projects-preparing.css');

test('Passed / Failed / Remaining have green / red / yellow solid cards with legible text',()=>{
 for(const [key,bg] of [['passed','#087d53'],['failed','#ca2e3c'],['remaining','#f5c536']]) {
  const expression=new RegExp(`\\.pr-pt-modern \\.pr-pt-stat-grid>\\.pr-pt-stat\\.pr-pt-stat--${key} \\{([^}]+)\\}`,'g');
  const matches=[...css.matchAll(expression)];
  assert.ok(matches.length,`${key} must be styled`);
  assert.ok(matches.at(-1)[1].includes(`--pt-card-bg:${bg}`),`${key} background`);
 }
 assert.match(css,/\.pr-pt-stat--remaining\s*\{[^}]*--pt-card-text:#171b23/s);
 assert.match(css,/\.pr-pt-stat--passed\s*\{[^}]*--pt-card-text:#fff/s);
 assert.match(css,/\.pr-pt-stat--failed\s*\{[^}]*--pt-card-text:#fff/s);
});

test('Download is visible labeled button, History is icon-only right beside it',()=>{
 assert.match(ui,/className="pr-pt-download-button"[^\n]+?><TestingIcon name="download" size=\{18\}\/>(?:<span>)Download<\/span>/);
 assert.match(ui,/aria-label=\{`Testing History \(\$\{entries.length\} changes\)`\}/);
 assert.match(ui,/className=\{`pr-pt-history-button/);
 assert.match(ui,/<TestingIcon name="history" size=\{19\}\/>(?:<\/button>)/);
 assert.ok(ui.indexOf('pr-pt-history-button')<ui.indexOf('pr-pt-download-button'));
 assert.match(ui,/onClick=\{\(\)=>setTab\("history"\)\}/);
 assert.match(ui,/onClick=\{\(\)=>setShowExport\(true\)\}/);
});

test('Refresh is removed, compact icon Filter preserves all four filter values',()=>{
 const toolbar=ui.split('pr-wh-toolbar pr-pt-toolbar')[1].split('pr-wh-list pr-pt-list')[0];
 assert.doesNotMatch(toolbar,/>Refresh</);
 assert.match(toolbar,/PreparingSelect iconOnly/);
 assert.match(toolbar,/className=\{`pr-pt-filter-select/);
 assert.match(toolbar,/aria-label="Filter testing components"/);
 for(const value of ['all','pending','failed','done']) assert.ok(toolbar.includes(`<option value="${value}">`));
 assert.match(select,/iconOnly \? <svg/);
 assert.match(select,/role="listbox"/);
 assert.match(select,/onChange\?\.\(\{target:\{value:item.value,name\}\}\)/);
});

test('shared select still displays labels by default, and modified JSX and CSS parse',()=>{
 assert.match(select,/: <><span className="pr-modern-select-value">/);
 for(const [name,source] of [['ProjectTesting.jsx',ui],['PreparingSelect.jsx',select]]) {
  const parsed=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(src('app/projects-preparing/page.jsx'),/v279-testing-controls/);
});
