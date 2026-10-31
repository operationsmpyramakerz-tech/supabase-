import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const component=read('components/preparing/ProjectMasterComponents.jsx');
const css=read('public/css/projects-preparing.css');

test('kit icons have solid categorical backgrounds and white glyphs',()=>{
 assert.match(css,/\.pr-pbom--modern \.pr-kit-group-icon \{[^}]*background:var\(--bom-kit-solid\);color:#fff/s);
 for (const tone of ['purple','blue','green','red','amber','sky']) {
  assert.match(css,new RegExp(`\\.pr-pbom--modern \\.pr-kit-group--${tone} \\{[^}]*--bom-kit-solid:#[0-9a-fA-F]{6}`));
 }
 assert.match(component,/className=\{`pr-kit-group pr-kit-group--\$\{appearance\.tone\}/);
 assert.doesNotMatch(css,/\.pr-pbom--modern \.pr-kit-group-icon \{[^}]*linear-gradient/s);
});

test('remove marked visual labels while keeping kit and catalog data in state',()=>{
 assert.doesNotMatch(component,/pr-kit-group-meta-separator/);
 assert.doesNotMatch(component,/className="pr-pbom-preview-heading"/);
 assert.doesNotMatch(component,/<small>\{row\.product_id\|\|"No product code"\}<\/small>/);
 assert.match(component,/\{fmt\(group\.total\)\} units \/ school/);
 assert.match(component,/\{fmt\(group\.items\.length\)\}/);
 assert.match(component,/row\.product_id/); // still searchable by catalog code
 assert.match(component,/projectRequired\(qty,schoolCount\)/); // quantities unchanged
 assert.match(component,/saveEditor/);
});

test('new CSS and component parse and stylesheet is cache-busted',()=>{
 const parsed=ts.createSourceFile('ProjectMasterComponents.jsx',component,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(read('app/projects-preparing/page.jsx'),/v276-solid-kit-icons/);
});
