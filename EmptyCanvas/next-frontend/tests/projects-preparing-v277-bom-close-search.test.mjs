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

test('Project Components uses an accessible icon-only Close button',()=>{
  assert.match(component,/<button className="pr-pbom-close" type="button" onClick=\{onClose\} aria-label="Close Project Components"[^>]*><BomIcon name="close" size=\{19\}\/><\/button>/);
  assert.doesNotMatch(component,/<BomIcon name="close" size=\{19\}\/>\s*Close/);
  assert.match(css,/\.pr-pbom--modern \.pr-pbom-close \{[^}]*place-items:center;[^}]*width:42px;height:42px/s);
});

test('Project Components search uses an unframed transparent input and centered X',()=>{
  assert.match(component,/value=\{search\} onChange=\{e=>setSearch\(e\.target\.value\)\}/);
  assert.match(component,/className="pr-pbom-clear-search"[^>]*onClick=\{\(\)=>setSearch\(""\)\}[^>]*aria-label="Clear search"/);
  assert.match(css,/\.pr-pbom--modern \.pr-pbom-search input:focus-visible \{[^}]*border:0;[^}]*outline:none;[^}]*background:transparent;[^}]*box-shadow:none/s);
  assert.match(css,/\.pr-pbom--modern \.pr-pbom-search \.pr-pbom-clear-search \{[^}]*place-items:center;[^}]*width:29px;height:29px/s);
  assert.match(css,/\.pr-pbom--modern \.pr-pbom-search:focus-within \{[^}]*border-color:#cad2dd/s);
});

test('Project Components style updates parse and asset version is refreshed',()=>{
  const parsed=ts.createSourceFile('ProjectMasterComponents.jsx',component,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[]);
  assert.doesNotThrow(()=>postcss.parse(css));
  assert.match(read('app/projects-preparing/page.jsx'),/v277-clean-search-close/);
});
