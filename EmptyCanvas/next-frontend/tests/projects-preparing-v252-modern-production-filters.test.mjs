import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {filterBoxDistributionRows} from "../lib/preparing-box-visibility.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const records=[
 {id:"not-received",productionReceived:0,packedQty:0,unpacked:0},
 {id:"ready",productionReceived:4,packedQty:0,unpacked:4},
 {id:"partially-packed",productionReceived:5,packedQty:3,unpacked:2},
 {id:"fully-packed",productionReceived:2,packedQty:2,unpacked:0},
];
test("Box Distribution defaults to available inventory, not already packed or zero-stock components",()=>{
 assert.deepEqual(filterBoxDistributionRows(records).map(r=>r.id),["ready","partially-packed"]);
 assert.deepEqual(filterBoxDistributionRows(records,"available").map(r=>r.id),["ready","partially-packed"]);
});
test("Not Packed excludes production stock already packed in one or more boxes",()=>{
 assert.deepEqual(filterBoxDistributionRows(records,"not-packed").map(r=>r.id),["ready"]);
});
test("All Components permits review and correction of fully packed items without changing ledger",()=>{
 assert.equal(filterBoxDistributionRows(records,"all"),records);
 assert.deepEqual(filterBoxDistributionRows([]),[]);
 assert.deepEqual(filterBoxDistributionRows(undefined,"not-packed"),[]);
 assert.deepEqual(records.map(r=>r.packedQty),[0,0,3,2]);
});
test("Box filter and Production filter share modern dropdown and remain separate state",()=>{
 const boxes=read("components/preparing/ProjectBoxDistribution.jsx");
 const production=read("components/preparing/ProjectProductionReceiving.jsx");
 assert.match(boxes,/import PreparingStatusFilter from/);
 assert.match(boxes,/<PreparingStatusFilter/);
 assert.match(production,/import PreparingSelect from/);
 assert.match(production,/<PreparingSelect iconOnly/);
 assert.match(boxes,/\[filter,setFilter\]=useState\("available"\)/);
 assert.match(boxes,/filterBoxDistributionRows\(items,filter\)/);
 assert.match(boxes,/value:"not-packed",label:"Not Packed"/);
 assert.match(boxes,/value:"all",label:"All Components"/);
 assert.match(boxes,/setEditing\(""\)/);
 assert.match(production,/value:"not-received",label:"Not Received"/);
 const menu=read("components/preparing/PreparingStatusFilter.jsx");
 const modernMenu=read("components/preparing/PreparingSelect.jsx");
 for(const pattern of [/role="listbox"/,/role="option"/,/aria-expanded=/,/Escape/,/ArrowDown/,/pointerdown/,/aria-selected=/])assert.match(menu,pattern);
 for(const pattern of [/createPortal/,/iconOnly/,/role="listbox"/,/role="option"/,/aria-expanded=/,/Escape/,/ArrowDown/,/aria-selected=/])assert.match(modernMenu,pattern);
 for(const [name,jsx] of [["Box",boxes],["Production",production],["Filter",menu],["ModernFilter",modernMenu]]){
  const parsed=ts.createSourceFile(name+".jsx",jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],name);
 }
});
test("Modern styling and cache refresh cover both tabs",()=>{
 const css=read("public/css/projects-preparing.css");
 assert.match(css,/\.pr-stage-filter-menu/);
 assert.match(css,/\.pr-stage-filter-option\.is-selected/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(read("app/projects-preparing/page.jsx"),/projects-preparing\.css\?v=\d+/);
});
