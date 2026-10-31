import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript'),postcss=require('postcss');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const jsx=read('components/preparing/ProjectMasterComponents.jsx');
const css=read('public/css/projects-preparing.css');

test('Master BOM shows three softly colored information cards on a white sheet',()=>{
 assert.match(jsx,/pr-pbom-summary-card--orange/);
 assert.match(jsx,/pr-pbom-summary-card--blue/);
 assert.match(jsx,/pr-pbom-summary-card--green/);
 assert.match(css,/\.pr-components-sheet\.pr-warehouse-sheet\s*\{[^}]*background:#fff/s);
 assert.match(css,/\.pr-pbom--modern\s*\{[^}]*background:#fff/s);
 assert.match(css,/--pr-bom-stat-bg:#fffaf6/);
});

test('Kit list renders category icons and a controlled animated accordion',()=>{
 assert.match(jsx,/function kitAppearance\(/);
 for(const icon of ['cpu','pencil','laser','spool','puzzle','wrench'])assert.match(jsx,new RegExp(`icon:"${icon}"`));
 assert.match(jsx,/aria-expanded=\{isOpen\}/);
 assert.match(jsx,/inert=\{!isOpen\}/);
 assert.match(css,/\.pr-pbom--modern \.pr-kit-group-panel\s*\{[^}]*grid-template-rows:0fr/s);
 assert.match(css,/\.pr-pbom--modern \.pr-kit-group-panel\.is-expanded\s*\{grid-template-rows:1fr/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('search, kit filtering, preview, and refresh preserve all rows and accessible actions',()=>{
 assert.match(jsx,/Search within Kits or components/);
 assert.match(jsx,/Filter Kits/);
 assert.match(jsx,/kitFilter==="with"&&group\.items\.length>0/);
 assert.match(jsx,/shownItems=showAll\?group\.items:group\.items\.slice\(0,3\)/);
 assert.match(jsx,/View all components/);
 assert.match(jsx,/await reload\(\)/);
 assert.match(jsx,/aria-label="Clear search"/);
});

test('Add Kit is permission-gated and backed by existing edit_kit operation',()=>{
 assert.match(jsx,/\{allowed&&<button[^>]+className="pr-pbom-create-trigger"/);
 assert.match(jsx,/Create Kit with first component/);
 assert.match(jsx,/action:"edit_kit",operation:"add",itemId:null/);
 assert.match(jsx,/if\(groups\.some\(group=>group\.kitName/);
 assert.match(read('lib/preparing-warehouse.js'),/export async function editProjectKitItem\(/);
});

test('latest JSX and CSS are structurally valid and responsive',()=>{
 const parsed=ts.createSourceFile('ProjectMasterComponents.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=272/);
});
