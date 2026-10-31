import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const jsx=read('components/preparing/ProjectMasterComponents.jsx');
const css=read('public/css/projects-preparing.css');

test('Project Components has a clean title and search-only toolbar',()=>{
 assert.match(jsx,/<h3>Project Components<\/h3>/);
 assert.doesNotMatch(jsx,/Manage project Kits and their components|Filter Kits|Add Kit<\/button>|\{refreshing\?|pr-pbom-refresh/);
 assert.doesNotMatch(jsx,/Select a Kit to view or edit its components/);
 assert.match(jsx,/aria-label="Search project components"/);
});

test('Kit groups start collapsed, remain controlled, and can expand on click',()=>{
 assert.match(jsx,/useState\(null\)/);
 assert.match(jsx,/const isOpen=Boolean\(search\.trim\(\)\)\|\|expandedGroup===group\.key/);
 assert.doesNotMatch(jsx,/expandedGroup===null\?index===0/);
 assert.match(jsx,/aria-expanded=\{isOpen\}/);
 assert.match(jsx,/onClick=\{\(\)=>setExpandedGroup\(isOpen\?"__none__":group\.key\)\}/);
});

test('Add Component uses a dark card with adjacent Save and Cancel',()=>{
 assert.match(jsx,/className="pr-pbom-add-actions"/);
 assert.match(jsx,/pr-pbom-add-actions"><button type="button" className="pr-secondary"[\s\S]*?>Cancel<\/button><button className="pr-primary"/);
 assert.match(jsx,/onClick=\{saveEditor\}/);
 assert.match(jsx,/ProjectProductPicker/);
 assert.match(css,/\.pr-pbom--modern \.pr-kit-group-body>\.pr-kit-inline-editor \{[^}]*background:#141414/s);
 assert.match(css,/\.pr-pbom--modern \.pr-pbom-add-actions \{[^}]*display:flex/s);
 assert.match(css,/@media\(max-width:560px\) \{/);
});

test('JSX/CSS parse and stylesheet uses fresh cache key',()=>{
 const parsed=ts.createSourceFile('ProjectMasterComponents.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=274-pbom-compact-black/);
});
