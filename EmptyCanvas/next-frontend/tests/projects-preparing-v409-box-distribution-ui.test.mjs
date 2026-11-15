import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {filterBoxDistributionRows} from '../lib/preparing-box-visibility.mjs';
import {warehouseGroups} from '../lib/preparing-warehouse-view.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const parent=read('components/preparing/ProjectProductionReceiving.jsx');
const boxes=read('components/preparing/ProjectBoxDistribution.jsx');
const css=read('public/css/projects-preparing.css');
const route=read('app/api/projects-preparing/production/route.js');
const presenter=read('lib/preparing-production-presentation.js');

test('Box Distribution has the same stage header, progress and sign-off as Stages 1–4',()=>{
 for(const token of ['pr-box-v409','pr-intake-v401','pr-intake-heading','pr-intake-summary','pr-intake-progress','pr-intake-progress-track','pr-intake-signoff','Packed quantities','Close Box Distribution']) assert.ok(parent.includes(token),token);
 assert.match(parent,/const boxPercent=totals\.required>0\?Math\.min\(100,Math\.max\(0,totals\.packed\/totals\.required\*100\)\):0/);
 assert.match(parent,/\{fmt\(totals\.packed\)\} \/ \{fmt\(totals\.required\)\}/);
 assert.match(parent,/mode=\{tab==="box-history"\?"history":"boxes"\}/);
 assert.match(parent,/allowed=\{allowed&&cartonsAllowed\} editTabs=\{editTabs\}/);
 assert.match(css,/\.pr-root \.pr-box-v409 \.pr-pt-kit-list/);
});

test('Stage 5 toolbar follows global search style with a single custom close X',()=>{
 for(const token of ['pr-intake-tabs-toolbar','pr-intake-tabs-actions','pr-intake-search-control','pr-intake-search-expand','pr-intake-search-clear','pr-box-v409-label-button','pr-pt-history-button','pr-pt-download-button']) assert.ok(boxes.includes(token),token);
 for(const label of ['All Components','Remaining to Pack','Packed','Boxes Label','Box History','Download Box Distribution report','Close box search']) assert.ok(boxes.includes(label),label);
 assert.match(boxes,/id="pr-box-distribution-search" type="search"/);
 assert.match(boxes,/onClick=\{closeSearch\}/);
 assert.match(boxes,/if\(event\.key==="Escape"\)\{event\.preventDefault\(\);closeSearch\(\);\}/);
 assert.doesNotMatch(boxes,/pr-pt-clear-search/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-search-expand input::-webkit-search-cancel-button/);
});

test('Box rows use the same kit cards, thumbnails and inline action without replacing school editor',()=>{
 for(const token of ['pr-pt-kit-group','pr-pt-kit-heading','pr-intake-component-main','pr-intake-component-product','BoxComponentPhoto','pr-intake-cell','pr-intake-edit-icon','pr-intake-editors','pr-box-v409-equal-editor','SchoolEqualPackingEditor']) assert.ok(boxes.includes(token),token);
 for(const label of ['Operations Received','Packed','Remaining','Edit packing for']) assert.ok(boxes.includes(label),label);
 assert.match(boxes,/onSave=\{selections=>saveSchoolPacking\(row,g\.name,selections\)\}/);
 assert.match(boxes,/action:"pack_schools"/);
 assert.match(boxes,/action:"generate_school_kits"/);
 assert.doesNotMatch(boxes,/action:"complete_school_kit"/);
 assert.match(boxes,/onChanged\?\.\(\)/);
 assert.match(boxes,/createPortal\(/);
 const shown=filterBoxDistributionRows([{id:'a',productionReceived:3,packedQty:1,unpacked:2},{id:'b',productionReceived:5,packedQty:5,unpacked:0}], 'available');
 assert.deepEqual(shown.map(row=>row.id),['a']);
 const group=warehouseGroups([{id:'a',product_id:'123',product_name:'A',imageUrls:['https://example.com/a.png'],source_kits:[{kitName:'Addons',quantity:1}]}],[]);
 assert.equal(group[0].items[0].imageUrls[0],'https://example.com/a.png');
});

test('Box labels, packing history and export remain separate from receiving data',()=>{
 for(const token of ['openBoxLabels','Boxes Label','boxGroups','LabelSchoolsPicker','mode==="history"','Box Distribution History','onHistoryToggle','onDownload','onChanged={reload}']) assert.ok((boxes+parent).includes(token),token);
 for(const token of ['CSV · Values','CSV · Blank','PDF · Values','PDF · Blank','scope:isBoxTab?"boxes":"receiving"']) assert.ok(parent.includes(token),token);
 assert.match(route,/preparingStageReadable\(auth\.account,stage\)/);
 assert.match(route,/includeReceivers:stage==="production"/);
 assert.match(route,/\.\.\.data,handoffs:\[\]/);
 assert.match(presenter,/includeReceivers\?snapshot\.handoffs\|\|\[\]:\[\]/);
 assert.match(presenter,/imageUrls:\[\.\.\.new Set/);
});

test('All edited JSX and JS source files parse, stylesheet parses, cache version changes',()=>{
 for(const file of ['components/preparing/ProjectProductionReceiving.jsx','components/preparing/ProjectBoxDistribution.jsx','lib/preparing-production-presentation.js','app/api/projects-preparing/production/route.js','app/projects-preparing/page.jsx']){
  const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[],file);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(read('app/projects-preparing/page.jsx'),/v409-box-distribution-stage/);
});
