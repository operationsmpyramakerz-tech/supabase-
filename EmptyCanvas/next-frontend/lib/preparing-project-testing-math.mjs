// Single quantity testing ledger. Remaining is derived, never stored.
const whole = value => /^(0|[1-9]\d*)$/.test(String(value ?? ""));
export function testingChange(row, values) {
 if (!row || !values || !whole(values.tested)) throw new Error("Tested must be a non-negative whole number.");
 const tested=Number(values.tested), oldTested=Number(row.tested||0);
 if (![tested,oldTested].every(Number.isSafeInteger)) throw new Error("Invalid tested quantity.");
 if (row.productionIntakeReceived != null && tested>oldTested && tested>Number(row.productionIntakeReceived)) throw new Error(`Tested cannot exceed Production Received (${row.productionIntakeReceived}).`);
 if (tested<oldTested && tested<Number(row.accepted||0)) throw new Error("Tested cannot be lower than the quantity already received by the warehouse.");
 const testedDelta=tested-oldTested;
 if (Math.abs(testedDelta)>1000000) throw new Error("Maximum change per component is 1,000,000 units.");
 return testedDelta?{itemId:row.id,testedDelta,expectedTested:oldTested}:null;
}
// Production Receiving is the gate to Testing: only physically received,
// not-yet-tested units are actionable in the "Remaining to Test" tab.
// Keep overall project requirements separate for progress and reporting.
export function testingReadyToTest(row={}) {
 const received=Math.max(0,Number(row.productionIntakeReceived)||0);
 const tested=Math.max(0,Number(row.tested)||0);
 return Math.max(0,received-tested);
}
export function testingCoverage(row={}) {
 const required=Math.max(0,Number(row.projectTotalRequired??row.required)||0);
 const tested=Math.max(0,Number(row.tested)||0);
 return {required,tested,remaining:Math.max(0,required-tested)};
}
export function testingCoverageTotals(items=[]) {
 return items.reduce((totals,row)=>{
  const item=testingCoverage(row);
  return {required:totals.required+item.required,tested:totals.tested+item.tested,remaining:totals.remaining+item.remaining};
 },{required:0,tested:0,remaining:0});
}
