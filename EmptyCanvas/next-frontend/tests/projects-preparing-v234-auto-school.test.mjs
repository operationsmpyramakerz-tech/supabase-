import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {projectRequired,warehouseTotals} from '../lib/preparing-warehouse-math.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read = path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const sql=read('sql/2026-10-28-preparing-school-auto-components-v234.sql');
const service=read('lib/preparing-service.js');
const bom=read('components/preparing/ProjectMasterComponents.jsx');
const warehouse=read('components/preparing/ProjectWarehouseReceiving.jsx');

test('Project Kit Qty is per-school, project total scales with count',()=>{
 assert.equal(projectRequired(2,2),4);
 assert.equal(projectRequired(2,3),6);
 assert.equal(projectRequired(400,11),4400);
 assert.equal(projectRequired(400,0),0);
 assert.throws(()=>projectRequired(-2,3));
 assert.throws(()=>projectRequired(1.2,3));
 assert.match(bom,/projectRequired\(qty,schoolCount\)/);
 assert.match(bom,/Kit Qty \/ School/);
 assert.match(warehouse,/projectRequired\(Number\(row\.required_qty\|\|0\),\(state\.schools\|\|\[\]\)\.length\)/);
});
test('Warehouse physical accepted and allocated stock never get multiplied by school count',()=>{
 const base={id:'motor',required_qty:3};
 const received=[{item_id:'motor',accepted_delta:2,damaged_delta:0}];
 const alloc=[{item_id:'motor',delta_qty:1}];
 const totals=warehouseTotals([{...base,required_qty:projectRequired(base.required_qty,3)}],received,alloc)[0];
 assert.deepEqual([totals.required_qty,totals.accepted,totals.allocated,totals.available],[9,2,1,1]);
});
test('School creation transaction inserts the school, its QC components, and its demand',()=>{
 assert.match(service,/erp_preparing_add_schools_with_components/);
 assert.match(service,/Project.*components|Project must have between 1 and 1000 components/i);
 assert.match(sql,/INSERT INTO public\.erp_preparing_schools/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_manifests/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_components/);
 assert.match(sql,/INSERT INTO public\.erp_preparing_warehouse_demands/);
 assert.match(sql,/source_proposal_id/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/COMMIT;/);
 assert.doesNotMatch(sql,/DELETE FROM public\.erp_preparing|TRUNCATE|DROP TABLE/);
});
test('SQL migration is a single transaction and grants access only to service role',()=>{
 assert.equal((sql.match(/\bBEGIN;/g)||[]).length,1);
 assert.equal((sql.match(/\bCOMMIT;/g)||[]).length,1);
 assert.equal((sql.match(/\$\$/g)||[]).length,2);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/TO service_role/);
});
test('Modified source files parse cleanly',()=>{
 for(const name of ['lib/preparing-service.js','components/preparing/ProjectMasterComponents.jsx', 'components/preparing/ProjectWarehouseReceiving.jsx']) {
  const ast=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,name.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[],name);
 }
});
