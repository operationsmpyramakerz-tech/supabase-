import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testingChange,testingCoverage} from '../lib/preparing-project-testing-math.mjs';
import {testingRemaining,TESTING_EXPORT_COLUMNS,testingExportValue} from '../lib/preparing-project-testing-grouping.mjs';
import {warehouseReceivingBalances,warehouseReceiptLimit} from '../lib/preparing-warehouse-math.mjs';
import {calculateProjectPreparationProgress} from '../lib/preparing-project-progress.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const sql=read('sql/2026-11-10-preparing-tested-only-v384.sql');
test('single tested input: append delta, guard previously received stock, validate integer',()=>{
 const r={id:'i',required:8,tested:4,accepted:2};
 assert.deepEqual(testingChange(r,{tested:'6'}),{itemId:'i',testedDelta:2,expectedTested:4});
 assert.equal(testingChange(r,{tested:'4'}),null);
 assert.throws(()=>testingChange(r,{tested:'1'}),/warehouse/);
 for(const tested of ['', '-1','2.5','1e3'])assert.throws(()=>testingChange(r,{tested}));
 assert.deepEqual(testingCoverage(r),{required:8,tested:4,remaining:4});
});
test('tested-only counts drive warehouse availability and open stage progress; closure still overrides',()=>{
 const [row]=warehouseReceivingBalances([{id:'i',accepted:2}],[{item_id:'i',tested:4}]);
 assert.equal(row.readyToReceive,2);assert.equal(warehouseReceiptLimit(2,'4',row.tested),2);
 assert.throws(()=>warehouseReceiptLimit(2,'5',row.tested),/Only 2 tested/);
 const testing={items:[{required:8,tested:4}]};
 assert.equal(calculateProjectPreparationProgress({testing}).stages[1],50);
 assert.equal(calculateProjectPreparationProgress({testing,closures:{testing:true}}).stages[1],100);
});
test('history, editor and exports only expose tested quantities',()=>{
 const ui=read('components/preparing/ProjectTesting.jsx');const metrics=ui.split('const metrics=')[1].split('];')[0];
 assert.deepEqual([...metrics.matchAll(/key:"(\w+)"/g)].map(m=>m[1]),['tested']);
 assert.doesNotMatch(ui,/passedDelta|failedDelta|receivedDelta|Has failed units/);
 assert.match(ui,/record.line.testedDelta/);
 assert.deepEqual(TESTING_EXPORT_COLUMNS.map(c=>c.key),['name','code','required','tested','remaining','testedBy','signature']);
 assert.equal(testingRemaining({required:8,tested:4}),4);
 assert.equal(testingExportValue({tested:4},'tested',true),'');
});
test('migration review gate, backfill, atomic column removal and updated warehouse trigger',()=>{
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.match(sql,/legacy_failed_policy text := 'review'/);
 assert.match(sql,/HAVING sum\(failed_delta\)<>0/);
 assert.match(sql,/SET tested_delta=passed_delta::bigint\+CASE WHEN legacy_failed_policy='exclude' THEN 0 ELSE failed_delta::bigint END/);
 assert.ok(sql.indexOf('SET tested_delta=')<sql.indexOf('DROP COLUMN received_delta'));
 assert.match(sql,/DROP COLUMN received_delta, DROP COLUMN passed_delta, DROP COLUMN failed_delta/);
 assert.match(sql,/CREATE TRIGGER prep_wh_tested_limit_v384 BEFORE INSERT/);
 assert.match(sql,/prior_tested<>\(entry->>'expectedTested'\)::bigint/);
 assert.match(sql,/next_tested<prior_tested AND next_tested<accepted/);
 assert.doesNotMatch(sql,/DROP TABLE[^;]*CASCADE|TRUNCATE|DELETE FROM public\.erp_preparing_project_test/);
});
