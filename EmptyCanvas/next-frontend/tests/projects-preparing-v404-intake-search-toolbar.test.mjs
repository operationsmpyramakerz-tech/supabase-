import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const component=readFileSync(new URL('../components/preparing/ProjectProductionIntake.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/projects-preparing.css',import.meta.url),'utf8');

test('Production Receiving remains valid JSX and retains read-only All Components',()=>{
 const parsed=ts.createSourceFile('ProjectProductionIntake.jsx',component,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.match(component,/canEditTab = canTest && filter !== "all" && editTabs\[filter\] !== false/);
 assert.match(component,/if\(busy\|\|!canEditTab\)return/);
});

test('tabs and the three actions share one row in the requested order',()=>{
 const start=component.indexOf('<div className="pr-intake-tabs-toolbar">');
 const end=component.indexOf('{tab==="testing"&&<>',start);
 assert.ok(start>=0 && end>start);
 const markup=component.slice(start,end);
 assert.ok(markup.indexOf('<StageFilterTabs') < markup.indexOf('pr-intake-tabs-actions'));
 assert.ok(markup.indexOf('pr-intake-search-toggle') < markup.indexOf('pr-pt-download-button'));
 assert.doesNotMatch(markup,/pr-pt-history-button/);
 const heading=component.slice(component.indexOf('<header className="pr-manifest-title'),start);
 assert.ok(heading.indexOf('pr-pt-history-button') < heading.indexOf('pr-pt-close'));
 assert.match(heading,/pr-intake-header-actions/);
 assert.doesNotMatch(markup,/pr-stage-filter-toolbar pr-pt-toolbar/);
 assert.match(css,/\.pr-root \.pr-intake-v401 \.pr-intake-tabs-toolbar\s*\{[^}]*display:flex/);
 assert.match(css,/\.pr-root \.pr-intake-v401 \.pr-intake-tabs-toolbar \.pr-stage-filter-tabs\s*\{[^}]*flex:1 1 auto/);
});

test('search expands and collapses with focus, Escape and clear behavior',()=>{
 assert.match(component,/\[searchOpen,setSearchOpen\]=useState\(false\)/);
 assert.match(component,/if\(searchOpen&&tab==="testing"\)searchInputRef\.current\?\.focus\(\)/);
 assert.match(component,/const closeSearch=\(\)=>\{setSearchOpen\(false\);setSearch\(""\);\}/);
 assert.match(component,/aria-expanded=\{searchOpen\}/);
 assert.match(component,/aria-controls="pr-intake-component-search"/);
 assert.match(component,/disabled=\{!searchOpen\}/);
 assert.match(component,/if\(event\.key==="Escape"\)/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-control\.is-open \.pr-intake-search-expand/);
 assert.match(css,/@media\(max-width:720px\)[\s\S]*?\.pr-intake-v401 \.pr-intake-search-expand/);
});

test('only the Received quantity becomes an input; the caption keeps the original span style',()=>{
 const start=component.indexOf('pr-intake-cell--received${isEditing?');
 const end=component.indexOf('filter==="all"&&',start);
 const markup=component.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(markup,/<span>Received<\/span>/);
 assert.match(markup,/<StageQuantityInput /);
 assert.doesNotMatch(markup,/<label htmlFor=/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-cell--received\.is-inline-edit > span/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-cell--received\.is-inline-edit input\s*\{[^}]*height:30px/);
 assert.match(css,/\.pr-intake-v401 \.pr-pt-kit-body \.pr-intake-component\.is-editing\s*\{[^}]*background:#fff/);
 assert.match(component,/pr-intake-action--save/);
 assert.match(component,/pr-intake-action--cancel/);
});

test('download, change history, and quantity saving remain wired to their previous handlers',()=>{
 assert.match(component,/setShowExport\(true\)/);
 assert.match(component,/setTab\(tab==="history"\?"testing":"history"\)/);
 assert.match(component,/onClick=\{\(\)=>save\(\[r\.id\]\)\}/);
 assert.match(component,/await request\("\/intake","POST",\{projectId,editTab:filter,lines\}\)/);
});
