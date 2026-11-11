import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const component=readFileSync(new URL('../components/preparing/ProjectProductionIntake.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/projects-preparing.css',import.meta.url),'utf8');
const header=readFileSync(new URL('../components/HeaderSearch.jsx',import.meta.url),'utf8');
const headerCSS=readFileSync(new URL('../public/css/classic-parity.css',import.meta.url),'utf8');

test('v405 intake search stays valid JSX with same search-pill elements as main header',()=>{
 const parsed=ts.createSourceFile('ProjectProductionIntake.jsx',component,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 const toolbar=component.slice(component.indexOf('<div className="pr-intake-tabs-toolbar">'),component.indexOf('{tab==="testing"&&<>'));
 assert.match(toolbar,/role="search"/);
 assert.match(toolbar,/pr-intake-search-toggle/);
 assert.match(toolbar,/pr-intake-search-expand/);
 assert.match(toolbar,/pr-intake-search-clear/);
 assert.match(header,/className="system-header-search__toggle"/);
 assert.match(header,/className="system-header-search__close"/);
 assert.equal((toolbar.match(/className="pr-intake-search-clear"/g)||[]).length,1);
 assert.doesNotMatch(toolbar,/searchOpen&&search&&/);
 assert.match(toolbar,/onClick=\{closeSearch\}/);
 assert.match(toolbar,/disabled=\{!searchOpen\}/);
 assert.match(toolbar,/if\(event.key==="Escape"\)/);
});

test('native browser search cancel button is hidden and only one custom X is rendered',()=>{
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-expand input::-webkit-search-cancel-button/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-expand input::-ms-clear\s*\{display:none;\}/);
 assert.match(headerCSS,/\.system-header-search__input::-webkit-search-cancel-button/);
 assert.match(component,/aria-label="Close component search" title="Close search"/);
});

test('header-style expanding pill retains filters/history/download and mobile behavior',()=>{
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-control\.is-open\s*\{[^}]*width:clamp\(230px,24vw,350px\)/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-toggle\s*\{[^}]*background:#101828/);
 assert.match(css,/@media\(max-width:800px\)\s*\{[\s\S]*?\.pr-intake-v401 \.pr-intake-search-control\.is-open/);
 assert.match(component,/setTab\(tab==="history"\?"testing":"history"\)/);
 assert.match(component,/setShowExport\(true\)/);
 assert.match(component,/\.filter\(r=>`\$\{r\.name\|\|""\} \$\{r\.code\|\|""\}`\.toLowerCase\(\)\.includes\(search\.trim\(\)\.toLowerCase\(\)\)\)/);
});
