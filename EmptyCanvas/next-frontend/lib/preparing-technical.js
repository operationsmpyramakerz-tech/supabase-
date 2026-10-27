// Fixed per-school technical handover checkpoints. Operations follows up; technical teams execute.
export const TECHNICAL_CHECKPOINTS = Object.freeze([
  {key:"site_ready",phase:"installation",title:"Site and utilities ready",description:"Confirm power, space, ventilation and required safety infrastructure."},
  {key:"equipment_installed",phase:"installation",title:"Equipment installed",description:"Technical team confirms hardware and workstations are installed."},
  {key:"cabling_and_safety",phase:"installation",title:"Cabling and safety checks",description:"Technical team verifies electrical, mechanical and safety requirements."},
  {key:"software_configured",phase:"installation",title:"Software and licenses configured",description:"Required teaching tools, controllers and workstations are configured."},
  {key:"power_on",phase:"testing",title:"Power-on and initial checks",description:"Technical team records equipment start-up and initial functionality."},
  {key:"functional_tests",phase:"testing",title:"Functional testing",description:"Perform and record agreed STEAM lab functional tests."},
  {key:"safety_validation",phase:"testing",title:"Final safety validation",description:"Validate safe operation before classroom use."},
  {key:"technical_handover",phase:"testing",title:"Technical handover and orientation",description:"Confirm school representative orientation and technical handover."},
]);
export const TECHNICAL_STATES = Object.freeze(["not_started","in_progress","blocked","completed"]);
export const ISSUE_STATES = Object.freeze(["open","in_progress","resolved"]);
export const ISSUE_SEVERITIES = Object.freeze(["low","medium","high","critical"]);
export function technicalSummary(checkpoints = [],issues = [],acceptance = null){
  const done=new Set(checkpoints.filter(row=>row.status==="completed").map(row=>row.milestone_key));
  const install=TECHNICAL_CHECKPOINTS.filter(row=>row.phase==="installation");
  const tests=TECHNICAL_CHECKPOINTS.filter(row=>row.phase==="testing");
  return {installed:install.filter(row=>done.has(row.key)).length,installationTotal:install.length,
    tested:tests.filter(row=>done.has(row.key)).length,testingTotal:tests.length,
    openIssues:issues.filter(row=>row.status!=="resolved").length,allIssues:issues.length,
    accepted:Boolean(acceptance?.confirmation_reference)};
}
