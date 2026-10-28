// Client-only validation for project testing intake; independent from warehouse receipt.
const whole = value => /^(0|[1-9]\d*)$/.test(String(value ?? ""));
export function testingChange(row, values) {
 if (!row || !values || !whole(values.received) || !whole(values.passed) || !whole(values.failed))
  throw new Error("Testing Received, Passed and Failed must be non-negative whole numbers.");
 const received=Number(values.received), passed=Number(values.passed), failed=Number(values.failed);
 const oldReceived=Number(row.received||0), oldPassed=Number(row.passed||0), oldFailed=Number(row.failed||0);
 if ([received,passed,failed,oldReceived,oldPassed,oldFailed].some(value=>!Number.isSafeInteger(value)) || passed+failed>received)
  throw new Error("Passed and Failed must fit within the quantity received for testing.");
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
