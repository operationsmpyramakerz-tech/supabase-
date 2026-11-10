import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), ts=require('typescript');
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const wh=read('components/preparing/ProjectWarehouseReceiving.jsx');
const css=read('public/css/projects-preparing.css');
const page=read('app/projects-preparing/page.jsx');

test('Warehouse matches Testing KPI tile design without changing quantities',()=>{
 assert.match(wh,/pr-pt-modern pr-warehouse-parity/);
 for(const key of ['required','received','available'])assert.match(wh,new RegExp(`pr-pt-stat--\\$\\{key\\}|pr-pt-stat--`));
 assert.match(css,/\.pr-warehouse-parity \.pr-wh-stats\.pr-pt-stat-grid \{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.pr-warehouse-parity \.pr-wh-stats\.pr-pt-stat-grid>\.pr-pt-stat--available/);
 assert.match(wh,/totals\.required/);assert.match(wh,/totals\.accepted/);assert.match(wh,/totals\.readyToReceive/);
});

test('Warehouse has icon-only close, solid kit icons and initially collapsed groups',()=>{
 assert.match(wh,/aria-label="Close Warehouse Receiving"/);
 assert.doesNotMatch(wh,/>Close<\/button>/);
 assert.match(wh,/warehouseKitAppearance\(group\.name\)/);
 assert.match(wh,/pr-pt-kit--\$\{appearance\.tone\}/);
 assert.match(wh,/<WarehouseIcon name=\{appearance\.icon\} size=\{21\}/);
 assert.match(wh,/const open=!!search\.trim\(\)\|\|expandedKit===group\.key/);
 assert.doesNotMatch(wh,/index===0/);
});

test('Warehouse retains receiving workflow and shows Download plus accessible history icon',()=>{
 assert.doesNotMatch(wh,/School Allocation/);assert.match(wh,/<StageFilterTabs/);
 assert.match(wh,/setTab\(tab==="history"\?"receiving":"history"\)/);
 assert.match(wh,/Movement History \(\$\{historyEntries\.length\} changes\)/);
 assert.match(wh,/className="pr-stage-filter-actions"/);
 assert.match(wh,/className="pr-pt-download-button"/);
 assert.match(wh,/onClick=\{\(\)=>setShowExport\(true\)\}/);
 assert.match(wh,/onClick=\{\(\)=>saveReceipt\(row\)\}/);
 assert.doesNotMatch(wh,/allocateBatch/);
 assert.match(wh,/exportCSV\(true\)/);
 assert.match(wh,/exportPDF\(true\)/);
});

test('Search is transparent, status tabs replace filter, refresh removed, CSS version bumped',()=>{
 assert.match(wh,/pr-search pr-pt-search/);
 assert.match(wh,/pr-pt-clear-search/);
 assert.match(wh,/<StageFilterTabs/);
 assert.match(wh,/onChange=\{value=>\{setFilter\(value\);setTab\("receiving"\)/);
 assert.doesNotMatch(wh,/\bRefresh<\/button>/);
 assert.match(page,/v282-warehouse-ui/);
 assert.match(css,/\.pr-warehouse-parity \.pr-pt-toolbar/);
});

test('Warehouse JSX parses cleanly',()=>{
 const parsed=ts.createSourceFile('ProjectWarehouseReceiving.jsx',wh,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
});
