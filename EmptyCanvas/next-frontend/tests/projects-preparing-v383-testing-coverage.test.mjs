import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testingCoverage,testingCoverageTotals,testingChange} from '../lib/preparing-project-testing-math.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('three KPIs count successful and failed completed tests, not untested intake',()=>{
 assert.deepEqual(testingCoverage({required:4896,received:64,passed:62,failed:2}),{required:4896,tested:64,remaining:4832});
 assert.deepEqual(testingCoverage({required:100,received:40,passed:20,failed:5}),{required:100,tested:25,remaining:75});
 assert.deepEqual(testingCoverage({required:8,received:0,passed:0,failed:0}),{required:8,tested:0,remaining:8});
});
test('shared kit rows use project requirement, excess in one product cannot offset another',()=>{
 assert.deepEqual(testingCoverage({required:5,projectTotalRequired:20,passed:6,failed:2}),{required:20,tested:8,remaining:12});
 assert.deepEqual(testingCoverageTotals([{required:2,passed:4},{required:10,passed:3}]),{required:12,tested:7,remaining:7});
});
test('summary and read-only row use three quantities; QA editor remains intact',()=>{
 const ui=read('components/preparing/ProjectTesting.jsx');
 const summary=ui.split('aria-label="Testing summary"')[1].split('pr-wh-navigation')[0];
 assert.deepEqual([...summary.matchAll(/key:"(\w+)"/g)].map(m=>m[1]),['required','tested','remaining']);
 assert.match(ui,/pretty\(coverage.required\)/);assert.match(ui,/pretty\(coverage.tested\)/);assert.match(ui,/pretty\(coverage.remaining\)/);
 assert.match(ui,/testingCoverage\(r\).remaining>0/);assert.match(ui,/isEditing\?metrics.map/);
 assert.equal(testingChange({id:'a',required:8},{received:'4',passed:'2',failed:'2'}).passedDelta,2);
});
