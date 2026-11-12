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
 for(const re of [/pr-box-v409/,/aria-label="Close Box Distribution"/,/onHistoryToggle/,/onDownload=\{openExport\}/,/mode=\{tab==="box-history"\?"history":"boxes"\}/])assert.match(parent,re);
 for(const re of [/aria-label="Box History"/,/pr-pt-history-button/,/aria-label="Download Box Distribution report"/,/pr-pt-download-button/,/BoxIcon name="download"/])assert.match(boxes,re);
 assert.doesNotMatch(parent,/>Box History<\/button>/);
 assert.match(parent,/value=>value==="box-history"\?"boxes":"box-history"/);
});

test('Box Distribution replaces legacy KPI cards with packed progress and 3 quantity columns',()=>{
 for(const re of [/totals\.packed/,/totals\.required/,/pr-intake-progress/,/pr-intake-signoff/])assert.match(parent,re);
 for(const re of [/Operations Received/,/Packed/,/Remaining/,/pr-intake-component-main/,/pr-pt-kit-group/])assert.match(boxes,re);
 assert.match(css,/\.pr-root \.pr-box-v409 \.pr-pt-kit-list/);
});

test('Box filter is accessible stage status tabs with expandable single-X search',()=>{
 for(const re of [/<StageFilterTabs/,/Box component status/,/value=\{mode==="boxes"\?filter:""\}/,/setOpened\(null\)/,/pr-intake-search-clear/,/aria-label="Close box search"/,/pr-intake-search-control/])assert.match(boxes,re);
 const select=read('components/preparing/PreparingSelect.jsx');
 for(const re of [/createPortal/,/role="listbox"/,/role="option"/,/Escape/,/aria-selected=/,/r\.right - width/])assert.match(select,re);
 assert.doesNotMatch(boxes,/PreparingStatusFilter/);
});

test('Kit groups have solid category icons, start collapsed, and retain packing tools',()=>{
 for(const re of [/boxKitAppearance/,/pr-pt-kit--\$\{appearance\.tone\}/,/pr-pt-kit-emblem/,/pr-pt-kit-heading/,/opened,setOpened\]=useState\(null\)/,/open=Boolean\(search\.trim\(\)\)\|\|opened===g\.key/,/aria-expanded=\{open\}/,/action:"pack_schools"/,/action:"generate_school_kits"/,/action:"rename"/,/action:"cancel"/,/Generate School Kit Labels/,/SchoolEqualPackingEditor/,/Box Distribution History/])assert.match(boxes,re);
 assert.doesNotMatch(boxes,/groups\[0\]\?\.key===g\.key/);
 assert.match(css,/\.pr-pt-modern \.pr-pt-kit-emblem/);
 assert.match(css,/\.pr-root \.pr-box-v409 \.pr-pt-kit-body/);
 assert.deepEqual(filterBoxDistributionRows([{productionReceived:1,unpacked:1,packedQty:0},{productionReceived:1,unpacked:0,packedQty:1}],'available').length,1);
});

test('production actions and export scopes remain unchanged and both JSX files parse',()=>{
 for(const re of [/action:"handoff"/,/productionReceiptDelta\(/,/scope:isBoxTab\?"boxes":"receiving"/,/pr-production-v408/])assert.match(parent,re);
 assert.match(read('app/projects-preparing/page.jsx'),/v285-box-ui/);
 for(const [name,source] of [['Production',parent],['Boxes',boxes]]){
  const parsed=ts.createSourceFile(name+'.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
});
