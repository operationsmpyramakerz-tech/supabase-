import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const style=read('public/css/projects-preparing.css');
const v417=style.slice(style.indexOf('/* v417 —'));
const originalSearch=read('components/HeaderSearch.jsx');
const parts=['ProjectProductionIntake','ProjectTesting','ProjectWarehouseReceiving','ProjectProductionReceiving','ProjectBoxDistribution','SchoolKitCartons'];

const headerAction=(source,label)=>{
 const titleStart=source.indexOf('aria-label="Close '+label+'"');
 assert.ok(titleStart>=0,`close button for ${label}`);
 const header=source.slice(source.lastIndexOf('<header className="pr-manifest-title',titleStart),titleStart+180);
 assert.match(header,/pr-intake-header-actions/);
 const historyIndex=header.indexOf('pr-pt-history-button');
 const closeIndex=header.indexOf('pr-pt-close');
 assert.ok(historyIndex>=0&&closeIndex>historyIndex,`${label}: history must be left of modal X`);
 return header;
};
test('HeaderSearch reference is the existing icon/input/X style',()=>{
 for(const token of ['system-header-search__toggle','system-header-search__input','system-header-search__close','is-expanded']) assert.ok(originalSearch.includes(token));
 assert.match(v417,/flex-direction:row;align-items:center/);
 assert.match(v417,/border:1px solid #e4e7ec;background:#f8fafc/);
 assert.match(v417,/background:#fff;border-color:#d9dee7/);
 assert.match(v417,/margin:0 0 0 3px;border-radius:999px/);
 assert.match(v417,/\.pr-intake-search-control\.is-open \.pr-intake-search-clear/);
});
test('Every stage keeps one controlled search input with focus, Escape, clear, and stable overlay',()=>{
 for(const name of parts){
  const source=read(`components/preparing/${name}.jsx`);
  assert.match(source,/pr-intake-search-slot/);
  assert.match(source,/pr-intake-search-control\$\{searchOpen\?" is-open":""\}/);
  assert.match(source,/pr-intake-search-toggle/);
  assert.match(source,/pr-intake-search-expand/);
  assert.match(source,/pr-intake-search-clear/);
  assert.match(source,/tabIndex=\{searchOpen\?0:-1\}/);
  assert.match(source,/event\.key==="Escape"/);
  assert.match(source,/setSearchOpen\(false\)/);
 }
 assert.match(v417,/width:min\(320px,calc\(100vw - 110px\)\)/);
 assert.match(style,/\.pr-root \.pr-intake-v401 \.pr-intake-search-control\s*\{[\s\S]*?position:absolute;top:0;right:0;left:auto/);
 assert.doesNotMatch(v417,/flex-direction:row-reverse/);
});
test('Stages 1-4 expose History beside X, never inside filtering toolbar',()=>{
 for(const [name,title] of [['ProjectProductionIntake','Production Receiving'],['ProjectTesting','Components Testing'],['ProjectWarehouseReceiving','Warehouse Return'],['ProjectProductionReceiving','Operations Receiving']]){
  const source=read('components/preparing/'+name+'.jsx');
  headerAction(source,title);
  const toolbar=source.slice(source.indexOf('pr-intake-tabs-actions'),source.indexOf('pr-pt-download-button',source.indexOf('pr-intake-tabs-actions')));
  assert.doesNotMatch(toolbar,/pr-pt-history-button/,`${title} toolbar must not contain history`);
 }
});
test('Stage 5 history moves to its own header; history mode closes search',()=>{
 const parent=read('components/preparing/ProjectProductionReceiving.jsx');
 const child=read('components/preparing/ProjectBoxDistribution.jsx');
 headerAction(parent,'Box Distribution');
 assert.match(parent,/mode=\{tab==="box-history"\?"history":"boxes"\}/);
 assert.match(parent,/setTab\(value=>value==="box-history"\?"boxes":"box-history"\)/);
 assert.doesNotMatch(child,/aria-label="Box History"/);
 assert.match(child,/if\(mode==="history"\)\{setSearchOpen\(false\);setSearch\(""\);\}/);
 assert.match(child,/Box Distribution History/);
});
test('Stage 6 has no fabricated History action and keeps carton search and QR tools',()=>{
 const source=read('components/preparing/SchoolKitCartons.jsx');
 assert.doesNotMatch(source,/pr-pt-history-button/);
 assert.match(source,/pr-intake-search-toggle/);
 assert.match(source,/Legacy Cartons/);
 assert.match(source,/Download carton QR label/);
});
test('Mobile title stays in one row; JSX and CSS parse; deployed stylesheet is cache-busted',()=>{
 assert.match(v417,/@media \(max-width:600px\)/);
 assert.match(v417,/flex-wrap:nowrap;align-items:center;gap:7px/);
 assert.match(v417,/font-size:clamp\(16px,4\.2vw,20px\)/);
 assert.match(read('app/projects-preparing/page.jsx'),/v417-header-search-parity-history-in-title/);
 for(const name of parts){
  const parsed=ts.createSourceFile(name+'.jsx',read('components/preparing/'+name+'.jsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name+' parse');
 }
 assert.doesNotThrow(()=>postcss.parse(style));
});
