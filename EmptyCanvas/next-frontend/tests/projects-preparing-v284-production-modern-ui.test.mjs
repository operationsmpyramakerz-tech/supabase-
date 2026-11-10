import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const jsx=read('components/preparing/ProjectProductionReceiving.jsx');
const css=read('public/css/projects-preparing.css');

test('Production Receiving retains ledger actions and a separate Box Distribution view',()=>{
 for(const pattern of [/action:"handoff"/,/productionReceiptDelta\(/,/isBoxTab&&<ProjectBoxDistribution/,/scope:isBoxTab\?"boxes":"receiving"/,/view="receiving"/,/Box History/,/mode=\{tab==="box-history"\?"history":"boxes"\}/])assert.match(jsx,pattern);
});
test('Production summary is black, orange and yellow Solid without top-line accents',()=>{
 for(const label of ['Warehouse Received','Production Received','Available to Receive'])assert.ok(jsx.includes(label));
 for(const pattern of [/pr-production-parity/,/pr-pt-stat--\$\{tone\}/,/pr-pt-stat-icon/,/pr-pt-stat-copy/,/--pt-card-bg:#f5c536/,/border-top:1px solid var\(--pt-card-border\)/])assert.match(jsx+css,pattern);
});
test('Production header, Download and history controls have accessible icons',()=>{
 for(const pattern of [/aria-label="Close Production Receiving"/,/name="close"/,/aria-pressed=\{tab==="receiving-history"\}/,/name="history"/,/pr-pt-download-button/,/name="download"/,/>Download</])assert.match(jsx,pattern);
 assert.doesNotMatch(jsx,/PreparingStatusFilter/);
});
test('Production Receiving has single-layer search and stage status tabs',()=>{
 for(const pattern of [/<StageFilterTabs/,/pr-stage-filter-toolbar/,/pr-pt-clear-search/,/aria-label="Clear search"/,/value=\{tab==="receiving"\?filter:""\}/])assert.match(jsx,pattern);
 assert.match(css,/\.pr-production-parity \.pr-production-controls \.pr-pt-search input/);
 assert.match(read('components/preparing/PreparingSelect.jsx'),/r\.right - width/);
});
test('production Kits use solid category symbols and start collapsed',()=>{
 for(const pattern of [/productionKitAppearance/,/pr-pt-kit--\$\{appearance\.tone\}/,/pr-pt-kit-emblem/,/opened,setOpened\]=useState\(null\)/,/open=Boolean\(search\.trim\(\)\)\|\|opened===g\.key/,/pr-pt-kit-heading/,/aria-expanded=\{open\}/])assert.match(jsx,pattern);
});
test('Production JSX parses and CSS revision changes for production',()=>{
 assert.deepEqual(ts.createSourceFile('production.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX).parseDiagnostics,[]);
 assert.match(read('app/projects-preparing/page.jsx'),/v284-production-ui/);
});
