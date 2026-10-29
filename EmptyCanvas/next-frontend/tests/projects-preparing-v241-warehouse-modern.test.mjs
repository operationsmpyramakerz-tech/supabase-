import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {warehouseGroups,warehouseReceiptDelta,warehouseExportValue,WAREHOUSE_COLUMNS} from "../lib/preparing-warehouse-view.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const ui=read("components/preparing/ProjectWarehouseReceiving.jsx");
const backend=read("lib/preparing-warehouse.js");
const sql=read("sql/2026-10-29-preparing-warehouse-receiving-v241.sql");
const exportRoute=read("app/api/projects-preparing/warehouse/export/route.js");

test("Warehouse receipt stores usable quantities and rejects damaged payloads in UI, API and database",()=>{
 assert.doesNotMatch(ui,/aria-label=\{`Damaged|>Damaged</);
 assert.match(backend,/row\.damaged!==undefined&&Number\(row\.damaged\)!==0/);
 assert.match(backend,/damaged:0/);
 assert.match(sql,/NEW\.damaged_delta<>0/);
 assert.match(sql,/BEFORE INSERT ON public\.erp_preparing_warehouse_receipt_lines/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.erp_preparing_warehouse_receive_v241/);
});
test("Received By derives from ERP session and appears in movement cards, with old records preserved",()=>{
 assert.match(backend,/account\?\.name\|\|account\?\.username/);
 assert.match(backend,/p_actor_name:name/);
 assert.doesNotMatch(ui,/<input[^>]*[Rr]eceived [Bb]y/);
 assert.match(ui,/receipt\.created_by_name/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS created_by_name/);
 assert.doesNotMatch(sql,/TRUNCATE|DELETE FROM public\.erp_preparing_warehouse_receipts|DROP TABLE/i);
});
test("Kit groups come from proposal master sourceKits and do not duplicate stock ledger totals",()=>{
 const item={id:"one",product_name:"DC motor",product_id:"SKU",required_qty:6,accepted:3,source_kits:[{kitId:"kit-1",kitName:"G1",quantity:2},{kitId:"kit-2",kitName:"G2",quantity:1}]};
 const groups=warehouseGroups([item],[{kit_key:"id:kit-1",kit_name:"G1",sort_order:0},{kit_key:"id:kit-2",kit_name:"G2",sort_order:1}]);
 assert.deepEqual(groups.map(g=>g.name),["G1","G2"]);
 assert.deepEqual(groups.map(g=>g.items[0].required),[4,2]);
 assert.deepEqual(groups.map(g=>g.items[0].accepted),[3,3]);
 assert.equal(item.accepted,3);
});
test("Inline correction accepts valid nonnegative totals and rejects invalid quantities",()=>{
 assert.equal(warehouseReceiptDelta(5,"7"),2);
 assert.equal(warehouseReceiptDelta(5,"3"),-2);
 for(const bad of ["", "-1", "3.5", "not a number"])assert.throws(()=>warehouseReceiptDelta(5,bad));
 assert.throws(()=>warehouseReceiptDelta(0,"1000001"));
 assert.match(ui,/setDraft\(prev=>\(\{\.\.\.prev,\[row\.id\]:String\(row\.accepted\)\}\)\)/);
 assert.match(ui,/onClick=\{\(\)=>saveReceipt\(row\)\}/);
});
test("Export values/blank CSV and PDF supports columns, kits and signatures, not damaged",()=>{
 assert.equal(WAREHOUSE_COLUMNS[0].key,"name");
 assert.ok(WAREHOUSE_COLUMNS.some(col=>col.key==="receivedBy"));
 assert.ok(WAREHOUSE_COLUMNS.some(col=>col.key==="signature"));
 assert.ok(!WAREHOUSE_COLUMNS.some(col=>col.key==="damaged"));
 const row={name:"DC Motor",required:20,accepted:7,receivedBy:[{name:"Officer"}]};
 assert.equal(warehouseExportValue(row,"accepted",false),"7");
 assert.equal(warehouseExportValue(row,"accepted",true),"");
 assert.equal(warehouseExportValue(row,"receivedBy",true),"");
 assert.equal(warehouseExportValue(row,"name",true),"DC Motor");
 assert.match(ui,/Export Warehouse Receiving/);
 assert.match(exportRoute,/featureGate\(.*"preparing\.view"/);
 assert.match(exportRoute,/PDFDocument/);
 assert.match(exportRoute,/warehouseWorkspace\(body\.projectId\)/);
});
test("Warehouse updated React/CSS/PDF route parse cleanly",()=>{
 for(const path of ["components/preparing/ProjectWarehouseReceiving.jsx","lib/preparing-warehouse-view.mjs","lib/preparing-warehouse.js","app/api/projects-preparing/warehouse/export/route.js"]){
  const parsed=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,path.endsWith(".jsx")?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(parsed.parseDiagnostics.map(x=>x.messageText),[],path);
 }
 assert.match(read("app/projects-preparing/page.jsx"),/projects-preparing\.css\?v=247/);
 assert.match(read("public/css/projects-preparing.css"),/\.pr-wr-row\.is-editing/);
});
