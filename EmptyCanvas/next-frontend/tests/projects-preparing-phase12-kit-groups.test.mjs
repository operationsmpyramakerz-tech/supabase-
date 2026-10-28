import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {assembleProjectProposalItems} from '../lib/preparing-warehouse-math.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
const sql=read('sql/2026-10-28-preparing-kit-groups-warehouse-inline-phase12.sql');
const bom=read('components/preparing/ProjectMasterComponents.jsx');
const receiving=read('components/preparing/ProjectWarehouseReceiving.jsx');
const route=read('app/api/projects-preparing/warehouse/route.js');
const service=read('lib/preparing-warehouse.js');
test('Kit quantities are separate, while duplicate products have a single required total',()=>{
 const rows=assembleProjectProposalItems([{productId:'101',productName:'Motor',quantity:12,sourceKits:[{kitId:'g2',kitName:'G2',quantity:5},{kitId:'g3',kitName:'G3',quantity:7}]}]);
 assert.equal(rows.length,1);assert.equal(rows[0].qty,12);assert.deepEqual(rows[0].sourceKits.map(k=>k.quantity),[5,7]);
});
test('repeat product rows merge across Kit groups without duplicating warehouse stock',()=>{
 const rows=assembleProjectProposalItems([
  {productId:'P',productName:'Sensor',quantity:2,sourceKits:[{kitId:'g2',kitName:'G2',quantity:2}]},
  {productId:'P',productName:'Sensor',quantity:3,sourceKits:[{kitId:'g3',kitName:'G3',quantity:3}]},
 ]);
 assert.equal(rows.length,1);assert.equal(rows[0].qty,5);assert.deepEqual(rows[0].sourceKits.map(k=>k.quantity),[2,3]);
});
test('direct components fill the residual quantity but cannot overstate Kit demand',()=>{
 const rows=assembleProjectProposalItems([{productId:'a',productName:'Fan',quantity:8,sourceKits:[{kitId:'g2',kitName:'G2',quantity:4}]}]);
 assert.equal(rows[0].sourceKits[1].kitName,'Direct components');assert.equal(rows[0].sourceKits[1].quantity,4);
 assert.throws(()=>assembleProjectProposalItems([{productId:'b',productName:'Bad',quantity:3,sourceKits:[{kitName:'G3',quantity:4}]}]));
});
test('migration includes additive Kit snapshot, receipt-safe initialization and locked writes',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS source_kits jsonb/);
 assert.match(sql,/erp_preparing_validate_kit_sources/);
 assert.match(sql,/erp_preparing_initialize_project_kits/);
 assert.match(sql,/erp_preparing_edit_project_kit_item/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/Cannot remove the final Kit of a component with warehouse or school history/);
 assert.match(sql,/INSERT INTO public.erp_preparing_warehouse_bom_audit/);
 assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b/i);
});
test('Kit editor belongs to Project Components; receipt editor and delete belong to warehouse',()=>{
 assert.match(bom,/pr-kit-group-list/);assert.match(bom,/Edit Qty/);assert.match(bom,/Add Component to/);
 assert.match(bom,/Confirm Remove/);assert.doesNotMatch(bom,/Receiving <input/);
 assert.match(receiving,/disabled=\{!active\|\|busy\}/);assert.match(receiving,/Confirm Delete/);
 assert.match(receiving,/kind:"adjustment"/);assert.match(receiving,/Movement History/);
 assert.match(route,/edit_kit/);assert.match(route,/init_kits/);
 assert.match(service,/erp_preparing_edit_project_kit_item/);
});
test('changed JSX and JS files parse cleanly',()=>{
 for(const name of ['components/preparing/ProjectMasterComponents.jsx','components/preparing/ProjectWarehouseReceiving.jsx','lib/preparing-warehouse.js','lib/preparing-service.js','lib/preparing-warehouse-math.mjs','app/api/projects-preparing/warehouse/route.js']){
  const f=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,name.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(f.parseDiagnostics.map(d=>d.messageText),[],name);
 }
});
