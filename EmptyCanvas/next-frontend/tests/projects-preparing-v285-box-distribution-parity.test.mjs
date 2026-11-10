import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {filterBoxDistributionRows} from '../lib/preparing-box-visibility.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const parent=read('components/preparing/ProjectProductionReceiving.jsx');
const boxes=read('components/preparing/ProjectBoxDistribution.jsx');
const css=read('public/css/projects-preparing.css');

test('Box Distribution has independent close, icon history and labeled download',()=>{
 for(const re of [/pr-box-parity/,/aria-label="Close Box Distribution"/,/aria-label="Box History"/,/aria-pressed=\{tab==="box-history"\}/,/pr-pt-history-button/,/aria-label="Download Box Distribution report"/,/pr-pt-download-button/,/ProductionIcon name="download"/,/mode=\{tab==="box-history"\?"history":"boxes"\}/])assert.match(parent,re);
 assert.doesNotMatch(parent,/>Box History<\/button>/);
 assert.match(parent,/tab==="box-history"\?"boxes":"box-history"/);
});

test('Box Distribution solid KPI cards use actual packing totals and semantic color tones',()=>{
 for(const re of [/Production Received/,/Packed/,/Available to Pack \/ Unpacked/,/pr-box-summary pr-pt-stat-grid/,/pr-pt-stat--\$\{tone\}/,/totals\.production/,/totals\.packed/,/totals\.unpacked/])assert.match(boxes,re);
 for(const re of [/\.pr-box-parity \.pr-production-summary\.pr-box-summary\.pr-pt-stat-grid/,/\.pr-box-parity \.pr-box-summary\.pr-pt-stat-grid>\.pr-pt-stat--available/,/--pt-card-bg:#f5c536/,/border-top:1px solid var\(--pt-card-border\)/])assert.match(css,re);
});

test('Box filter is accessible stage status tabs, with transparent search and clear control',()=>{
 for(const re of [/<StageFilterTabs/,/Box component status/,/value=\{mode==="boxes"\?filter:""\}/,/setOpened\(null\)/,/pr-pt-clear-search/,/aria-label="Clear box search"/,/className="pr-search pr-pt-search"/])assert.match(boxes,re);
 const select=read('components/preparing/PreparingSelect.jsx');
 for(const re of [/createPortal/,/role="listbox"/,/role="option"/,/Escape/,/aria-selected=/,/r\.right - width/])assert.match(select,re);
 assert.match(css,/\.pr-box-parity \.pr-box-search-toolbar \.pr-pt-search input/);
 assert.doesNotMatch(boxes,/PreparingStatusFilter/);
});

test('Kit groups have solid category icons, start collapsed, and retain packing tools',()=>{
 for(const re of [/boxKitAppearance/,/pr-pt-kit--\$\{appearance\.tone\}/,/pr-pt-kit-emblem/,/pr-pt-kit-heading/,/opened,setOpened\]=useState\(null\)/,/open=Boolean\(search\.trim\(\)\)\|\|opened===g\.key/,/aria-expanded=\{open\}/,/action:"pack"/,/action:"create"/,/action:"rename"/,/action:"cancel"/,/Create Box/,/Packed in selected box/,/Box Distribution History/])assert.match(boxes,re);
 assert.doesNotMatch(boxes,/groups\[0\]\?\.key===g\.key/);
 assert.match(css,/\.pr-pt-modern \.pr-pt-kit-emblem/);
 assert.match(css,/\.pr-box-parity \.pr-box-kit-list \.pr-pt-kit-group\.is-open \.pr-pt-kit-body/);
 assert.deepEqual(filterBoxDistributionRows([{productionReceived:1,unpacked:1,packedQty:0},{productionReceived:1,unpacked:0,packedQty:1}],'available').length,1);
});

test('production actions and export scopes remain unchanged and both JSX files parse',()=>{
 for(const re of [/action:"handoff"/,/productionReceiptDelta\(/,/scope:isBoxTab\?"boxes":"receiving"/,/pr-production-parity/])assert.match(parent,re);
 assert.match(read('app/projects-preparing/page.jsx'),/v285-box-ui/);
 for(const [name,source] of [['Production',parent],['Boxes',boxes]]){
  const parsed=ts.createSourceFile(name+'.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
});
