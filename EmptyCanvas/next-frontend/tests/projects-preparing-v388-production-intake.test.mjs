import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {testingChange} from '../lib/preparing-project-testing-math.mjs';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
import {PREPARING_STAGE_KEYS,preparingStageAllowed} from '../lib/preparing-stage-access.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ts=createRequire(import.meta.url)('typescript');
test('New intake is first; Operations retains historical production key and closure',()=>{
 assert.deepEqual(PREPARING_STAGE_KEYS,['intake','testing','warehouse','production','boxes','cartons']);
 const p=calculateProjectPreparationProgress({testing:{items:[{required:10,tested:4,productionIntakeReceived:6}]},closures:{production:true}});
 assert.deepEqual(p.stages,[60,40,0,100,0,0]);assert.equal(p.overall,33);
 const ui=read('components/preparing/PreparingClient.jsx');assert.match(ui,/key:"intake"[^\n]*title:"Production Receiving"/);assert.match(ui,/key:"production"[^\n]*title:"Operations Receiving"/);
});
test('Testing cannot exceed preceding intake, but can correct valid totals',()=>{
 const row={id:'x',tested:4,accepted:2,productionIntakeReceived:6};
 assert.throws(()=>testingChange(row,{tested:'7'}),/Production Received/);
 assert.deepEqual(testingChange(row,{tested:'6'}),{itemId:'x',testedDelta:2,expectedTested:4});
 assert.throws(()=>testingChange(row,{tested:'1'}),/warehouse/);
 assert.deepEqual(testingChange(row,{tested:'3'}),{itemId:'x',testedDelta:-1,expectedTested:4});
});
test('Migration preserves historical testing, protects both ledgers and serializes writes',()=>{
 const sql=read('sql/2026-11-10-preparing-production-intake-v388.sql');
 assert.match(sql,/sum\(t.tested_delta\)/);assert.match(sql,/Opening balance \(migration\)/);
 assert.match(sql,/next_qty<tested/);assert.match(sql,/prior\+NEW.tested_delta>received/);
 assert.match(sql,/BEFORE INSERT ON public.erp_preparing_project_test_lines/);assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON public.erp_preparing_production_intake_lines FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(sql,/DROP COLUMN|DELETE FROM/);
});
test('New endpoints guard reads/writes; exports and React import paths exist and parse',()=>{
 const route=read('app/api/projects-preparing/intake/route.js');assert.match(route,/preparingStageReadGate\(await gate\("view"\),"intake"\)/);assert.match(route,/preparingStageGate\(await gate\("view"\),"intake"\)/);
 for(const file of ['components/preparing/ProjectProductionIntake.jsx','components/preparing/ProjectTesting.jsx','components/preparing/PreparingClient.jsx','app/api/projects-preparing/intake/export/route.js']){
  const src=read(file);assert.deepEqual(ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS).parseDiagnostics,[]);
  for(const [,path] of src.matchAll(/from\s+["'](\.[^"']+\.(?:mjs|jsx|js))["']/g))assert.ok(existsSync(new URL(path,new URL('../'+file,import.meta.url))),path);
 }
 assert.match(read('app/api/projects-preparing/intake/export/route.js'),/"intake"\)/);
});
