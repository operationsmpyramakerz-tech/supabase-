// Final Closing checklist. Evidence is maintained by Operations; installation remains with the technical team.
export const CLOSING_CHECKS=Object.freeze([
  {key:"signed_handover",title:"Signed School Handover",description:"Signed delivery minutes and school recipient details are recorded."},
  {key:"proposal_grades",title:"Proposal & Grades Reconciliation",description:"Delivered material matches the approved proposal and actual school grades."},
  {key:"custody_settlement",title:"Warehouse & Custody Settlement",description:"Accounting/warehouse reconcile any returns, shortages, damages and custody records."},
  {key:"grace_review",title:"Seven-day Receipt Review",description:"The school review window has ended; received complaints are documented and resolved."},
  {key:"technical_clearance",title:"Technical Acceptance & Issues",description:"Technical team sign-off is recorded and all technical issues are resolved."},
  {key:"closing_archive",title:"Final Documents Archive",description:"Signed minutes, reconciliation records, photos and approvals are referenced for retrieval."},
]);
export const CLOSING_STATES=Object.freeze(["pending","verified","blocked"]);
export function closingSummary(rows=[],approval=null){
  const verified=CLOSING_CHECKS.filter(c=>rows.some(r=>r.check_key===c.key&&r.status==="verified")).length;
  return {verified,total:CLOSING_CHECKS.length,blocked:rows.filter(r=>r.status==="blocked").length,
    approved:approval?.status==="approved"};
}
