import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {testingReadyToTest, testingCoverage, testingCoverageTotals, testingChange} from '../lib/preparing-project-testing-math.mjs';
import {preparingRowMatchesTab} from '../lib/preparing-tab-permissions.mjs';

const source = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('only received-but-untested production intake appears in Remaining to Test', () => {
 const rows = [
  {id:'not-received',required:100,tested:0,productionIntakeReceived:0},
  {id:'received',required:100,tested:0,productionIntakeReceived:4},
  {id:'part-tested',required:50,tested:2,productionIntakeReceived:3},
  {id:'tested-all-received',required:50,tested:3,productionIntakeReceived:3},
  {id:'finished-project',required:10,tested:10,productionIntakeReceived:10},
 ];
 assert.deepEqual(rows.filter(r=>testingReadyToTest(r)>0).map(r=>r.id),['received','part-tested']);
 assert.deepEqual(rows.map(testingReadyToTest),[0,4,1,0,0]);
 assert.equal(rows.reduce((sum,r)=>sum+testingReadyToTest(r),0),5);
 assert.equal(testingCoverageTotals(rows).required,310); // Project planning remains independent.
 for (const row of rows) assert.equal(preparingRowMatchesTab('testing','pending',row),testingReadyToTest(row)>0);
});

test('returning to production intake makes new units available for testing', () => {
 const row={id:'part',required:20,tested:4,productionIntakeReceived:4};
 assert.equal(testingReadyToTest(row),0);
 assert.equal(testingReadyToTest({...row,productionIntakeReceived:9}),5);
 assert.deepEqual(testingChange({...row,productionIntakeReceived:9},{tested:'9'}),{itemId:'part',testedDelta:5,expectedTested:4});
 assert.throws(()=>testingChange({...row,productionIntakeReceived:9},{tested:'10'}),/Production Received/);
 assert.equal(testingReadyToTest({...row,tested:9,productionIntakeReceived:9}),0);
});

test('project totals, Fully Tested, and Production Receiving filter are unchanged',()=>{
 const row={required:100,tested:4,productionIntakeReceived:4};
 assert.deepEqual(testingCoverage(row),{required:100,tested:4,remaining:96});
 assert.equal(preparingRowMatchesTab('testing','done',row),false);
 assert.equal(preparingRowMatchesTab('intake','received',{required:100,tested:4}),true);
 assert.equal(preparingRowMatchesTab('intake','pending',{required:100,tested:4}),true);
});

test('client filter, live count and quantity align with server authorization',()=>{
 const ui=source('components/preparing/ProjectTesting.jsx');
 const permissions=source('lib/preparing-tab-permissions.mjs');
 const view=source('lib/preparing-project-testing.js');
 assert.match(ui,/filter==="pending"\?testingReadyToTest\(r\)>0/);
 assert.match(ui,/label:"Ready to Test",value:readyToTest/);
 assert.match(ui,/<span>Ready to Test<\/span><strong[^>]*>\{pretty\(testingReadyToTest\(r\)\)\}/);
 assert.match(permissions,/stage === 'testing' \? testingReadyToTest\(row\) > 0/);
 assert.match(view,/productionIntakeReceived:received\.get\(row\.id\)\|\|0/);
});
