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

test('Download remains in toolbar while History sits beside stage close button',()=>{
 assert.match(ui,/className="pr-pt-download-button"[^\n]+?><TestingIcon name="download" size=\{21\}\/><\/button>/);
 assert.match(ui,/aria-label=\{`Testing History \(\$\{entries.length\} changes\)`\}/);
 assert.match(ui,/className=\{`pr-pt-history-button/);
 assert.match(ui,/<TestingIcon name="history" size=\{19\}\/>(?:<\/button>)/);
 assert.ok(ui.indexOf('pr-pt-history-button')<ui.indexOf('pr-pt-close'));
 assert.match(ui,/pr-intake-header-actions/);
 assert.match(ui,/setTab\(tab==="history"\?"testing":"history"\)/);
 assert.match(ui,/onClick=\{\(\)=>setShowExport\(true\)\}/);
});

test('Refresh is removed, stage tabs preserves all three filter values',()=>{
 const toolbar=ui.split('<StageFilterTabs')[1].split('pr-wh-list pr-pt-list')[0];
 assert.doesNotMatch(toolbar,/>Refresh</);
 assert.doesNotMatch(toolbar,/PreparingSelect iconOnly/);
 assert.match(ui,/pr-intake-tabs-toolbar/);
 assert.match(toolbar,/label="Testing component status"/);
 for(const value of ['all','pending','done']) assert.ok(toolbar.includes(`value:"${value}"`));
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
