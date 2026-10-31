import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const testing=read('components/preparing/ProjectTesting.jsx');
const css=read('public/css/projects-preparing.css');

test('Testing header uses a functional icon-only close button',()=>{
 assert.match(testing, /className="pr-pt-close" onClick=\{onClose\} aria-label="Close Components Testing"/);
 assert.match(testing, /<TestingIcon name="close" size=\{19\}\/>/);
 assert.doesNotMatch(testing, /onClick=\{onClose\}>Close<\/button>/);
});

test('Testing KPI cards use approved black, orange, white solid colors and preserve all metrics',()=>{
 for(const key of ['required','received','passed','failed','remaining']){
  assert.match(testing,new RegExp(`key:"${key}"`));
  assert.ok(css.includes(`pr-pt-stat--${key}`));
 }
 for(const color of ['#101010','#ff6900','#fff'])assert.ok(css.includes(`--pt-card-bg:${color}`));
 assert.match(css,/\.pr-pt-modern \.pr-pt-stat-grid>\.pr-pt-stat:before \{content:none;/);
 assert.match(css,/\.pr-pt-modern \.pr-pt-stat-grid \.pr-pt-stat-copy>strong \{color:var\(--pt-card-text\)/);
});

test('Testing Kit rows use categorized solid icons, white glyphs and initially closed groups',()=>{
 assert.match(testing,/const appearance=testingKitAppearance\(group.name\)/);
 assert.match(testing,/className=\{`pr-pt-kit-group pr-pt-kit--\$\{appearance.tone\}/);
 assert.match(testing,/<TestingIcon name=\{appearance.icon\} size=\{21\}\/>/);
 assert.match(testing,/const open=!!search.trim\(\)\|\|expandedKit===group.key/);
 assert.doesNotMatch(testing,/index===0/);
 assert.match(css,/\.pr-pt-modern \.pr-pt-kit-emblem \{[^}]*background:var\(--pt-kit-solid\);color:#fff/s);
 assert.match(testing,/onClick=\{\(\)=>setExpandedKit\(open\?"__none__":group.key\)\}/);
});

test('Testing search has a transparent input and accessible clear action; filters remain available',()=>{
 assert.match(testing,/className="pr-search pr-pt-search"/);
 assert.match(testing,/aria-label="Clear search"/);
 assert.match(testing,/setSearch\(""\)/);
 assert.match(css,/\.pr-pt-modern \.pr-pt-search input:focus-visible \{[^}]*background:transparent!important;/s);
 assert.match(testing,/Filter testing components/);
 assert.match(testing,/onClick=\{\(\)=>setShowExport\(true\)\}/);
 assert.match(testing,/onClick=\{\(\)=>save\(\[r.id\]\)\}/);
 assert.match(testing,/groupKeys:exportGroups/);
});

test('new styles parse and are cache-busted without affecting Master Components',()=>{
 const parsed=ts.createSourceFile('ProjectTesting.jsx',testing,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(read('app/projects-preparing/page.jsx'),/v278-testing-parity/);
 assert.match(read('components/preparing/ProjectMasterComponents.jsx'),/pr-pbom-summary-card--black/);
});
