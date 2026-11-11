import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const jsx=read('components/preparing/ProjectBoxDistribution.jsx');
const css=read('public/css/projects-preparing.css');

test('box actions trigger uses a vector icon instead of baseline-shifted text glyphs',()=>{
 assert.match(jsx,/more:\s*<>\s*<circle/);
 assert.match(jsx,/className="pr-box-labels-box-menu"[\s\S]*?<BoxIcon name="more" size=\{19\}\/>/);
 assert.doesNotMatch(jsx,/>•••<\/button>/);
 assert.match(css,/\.pr-box-labels-box-menu\s*\{[^}]*display:inline-flex;align-items:center;justify-content:center;[^}]*padding:0;line-height:0;/);
 assert.match(css,/\.pr-box-labels-box-menu svg\s*\{[^}]*display:block;/);
});

test('Rename and Delete actions show icons and preserve handlers and permission restriction',()=>{
 assert.match(jsx,/rename:<><path/);
 assert.match(jsx,/trash:<><path/);
 assert.match(jsx,/disabled=\{c.status!=="draft"\|\|c.generated_kit_label\}[\s\S]*?onClick=\{\(\)=>boxAction\("rename",c\)\}><BoxIcon name="rename" size=\{16\}\/><span>Rename<\/span>/);
 assert.match(jsx,/onClick=\{\(\)=>boxAction\("delete",c\)\}><BoxIcon name="trash" size=\{16\}\/><span>Delete<\/span>/);
 assert.match(css,/\.pr-box-labels-sheet \.pr-box-context-menu button\s*\{[^}]*display:flex;align-items:center;gap:10px;/);
});

test('JSX parses and changed stylesheet has a fresh cache version',()=>{
 const parsed=ts.createSourceFile('ProjectBoxDistribution.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.match(read('app/projects-preparing/page.jsx'),/v288-centered-menu-icons/);
});
