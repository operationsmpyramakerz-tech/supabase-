// Client-only validation for project testing intake; independent from warehouse receipt.
const whole = value => /^(0|[1-9]\d*)$/.test(String(value ?? ""));
export function testingChange(row, values) {
 if (!row || !values || !whole(values.received) || !whole(values.passed) || !whole(values.failed))
  throw new Error("Testing Received, Passed and Failed must be non-negative whole numbers.");
 const received=Number(values.received), passed=Number(values.passed), failed=Number(values.failed);
 const oldReceived=Number(row.received||0), oldPassed=Number(row.passed||0), oldFailed=Number(row.failed||0);
 if ([received,passed,failed,oldReceived,oldPassed,oldFailed].some(value=>!Number.isSafeInteger(value)) || passed+failed!==received)
  throw new Error("Passed + Failed must equal Testing Received before you can save.");
 // Warehouse Receiving is a subsequent physical handover. Do not invalidate it by
 // lowering a historical Passed quantity below already accepted/allocated stock.
 if (passed<oldPassed && passed < Number(row.accepted||0))
  throw new Error("Passed quantity cannot be lower than the quantity already accepted by the warehouse.");
 const receivedDelta=received-oldReceived, passedDelta=passed-oldPassed, failedDelta=failed-oldFailed;
 if ([receivedDelta,passedDelta,failedDelta].some(value=>Math.abs(value)>1000000))
  throw new Error("Maximum change per component is 1,000,000 units.");
 if (!receivedDelta && !passedDelta && !failedDelta) return null;
 return {itemId:row.id,receivedDelta,passedDelta,failedDelta,expectedReceived:oldReceived,expectedPassed:oldPassed,expectedFailed:oldFailed};
}

// The display tracks physical testing coverage; failed units are tested too.
// Kit group copies refer to a single project-wide testing ledger.
export function testingCoverage(row={}) {
 const required=Math.max(0,Number(row.projectTotalRequired??row.required)||0);
 const tested=Math.max(0,Number(row.passed)||0)+Math.max(0,Number(row.failed)||0);
 return {required,tested,remaining:Math.max(0,required-tested)};
}
export function testingCoverageTotals(items=[]) {
 return items.reduce((totals,row)=>{
  const item=testingCoverage(row);
  return {required:totals.required+item.required,tested:totals.tested+item.tested,remaining:totals.remaining+item.remaining};
 },{required:0,tested:0,remaining:0});
}
