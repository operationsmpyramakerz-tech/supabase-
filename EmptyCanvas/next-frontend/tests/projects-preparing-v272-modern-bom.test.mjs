import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript'),postcss=require('postcss');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const jsx=read('components/preparing/ProjectMasterComponents.jsx');
const css=read('public/css/projects-preparing.css');

test('Master BOM shows solid black, orange and white cards on a white sheet',()=>{
 assert.match(jsx,/pr-pbom-summary-card--black/);
 assert.match(jsx,/pr-pbom-summary-card--orange/);
 assert.match(jsx,/pr-pbom-summary-card--white/);
 assert.match(css,/\.pr-components-sheet\.pr-warehouse-sheet\s*\{[^}]*background:#fff/s);
 assert.match(css,/\.pr-pbom--modern\s*\{[^}]*background:#fff/s);
 assert.match(css,/--pr-bom-stat-bg:#101010/);
 assert.match(css,/--pr-bom-stat-bg:#ff6900/);
 assert.match(css,/--pr-bom-stat-bg:#fff/);
 assert.match(css,/--pr-bom-stat-color:#fff/);
 assert.match(css,/--pr-bom-stat-color:#101010/);
 assert.match(css,/pr-pbom-stat-icon::after/);
 assert.match(css,/pr-pbom-summary-card::after\s*\{content:none/);
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

test('search works without the removed filter, Refresh, helper text, or Add Kit toolbar button',()=>{
 assert.match(jsx,/Search within Kits or components/);
 assert.match(jsx,/const shownItems=group\.items/);
 assert.match(jsx,/await reload\(\)/);
 assert.match(jsx,/aria-label="Clear search"/);
 assert.doesNotMatch(jsx,/Filter Kits|kitFilter|pr-pbom-refresh|pr-pbom-create-trigger/);
 assert.doesNotMatch(jsx,/Select a Kit to view or edit its components|Manage project Kits and their components/);
 assert.match(read('lib/preparing-warehouse.js'),/export async function editProjectKitItem\(/);
});

test('latest JSX and CSS are structurally valid and responsive',()=>{
 const parsed=ts.createSourceFile('ProjectMasterComponents.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=274/);
});
