// Pure validation shared by project testing UI and regression tests.
export function testingChange(row,values){
 if(!row||!values||!/^(0|[1-9]\d*)$/.test(String(values.passed??""))||!/^(0|[1-9]\d*)$/.test(String(values.failed??"")))
  throw new Error("Passed and Failed must be non-negative whole numbers.");
 const passed=Number(values.passed),failed=Number(values.failed),accepted=Number(row.accepted||0);
 if(!Number.isSafeInteger(passed)||!Number.isSafeInteger(failed)||!Number.isSafeInteger(accepted)||passed+failed>accepted)
  throw new Error("Testing results cannot exceed accepted warehouse stock.");
 const expectedPassed=Number(row.passed||0),expectedFailed=Number(row.failed||0);
 const passedDelta=passed-expectedPassed,failedDelta=failed-expectedFailed;
 if(!Number.isSafeInteger(passedDelta)||!Number.isSafeInteger(failedDelta)||Math.abs(passedDelta)>1000000||Math.abs(failedDelta)>1000000)
  throw new Error("Maximum change per component is 1,000,000 units.");
 if(!passedDelta&&!failedDelta)return null;
 return {itemId:row.id,passedDelta,failedDelta,expectedPassed,expectedFailed};
}
