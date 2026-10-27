"use client";
import { useEffect, useMemo, useState } from "react";
import { CLOSING_CHECKS, CLOSING_STATES, closingSummary } from "../../lib/preparing-closing";
const EMPTY={checks:[],approval:null,audit:[],lastDelivery:null,technicalAcceptance:null};
const day=value=>value?String(value).slice(0,10):"";
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const friendly=s=>String(s||"").replaceAll("_"," ");
const csvCell=value=>{const v=String(value??"");return `"${(/^[\s]*[=+@-]/.test(v)?"'":"")+v.replaceAll('"','""')}"`;};
function exportClosing(data,schoolName){
  const rows=[["School","Checkpoint","Status","Reference","Verified on","Evidence URL","Notes"],
    ...CLOSING_CHECKS.map(item=>{const row=data.checks.find(x=>x.check_key===item.key)||{};
      return [schoolName,item.title,row.status||"pending",row.reference||"",day(row.verified_on),row.evidence_url||"",row.notes||""];}),
    [schoolName,"Final Operations approval",data.approval?.status||"pending",data.approval?.approval_reference||"",
      day(data.approval?.approved_on),data.approval?.evidence_url||"",data.approval?.notes||""]];
  const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const uri=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=uri;
  anchor.download="school-final-closing.csv";anchor.click();setTimeout(()=>URL.revokeObjectURL(uri),1000);
}
function ClosingCheck({item,record,disabled,busy,onSave,earliestGrace}){
  const [status,setStatus]=useState(record?.status||"pending");
  const [reference,setReference]=useState(record?.reference||"");
  const [notes,setNotes]=useState(record?.notes||"");
  const [evidenceUrl,setEvidenceUrl]=useState(record?.evidence_url||"");
  const [verifiedOn,setVerifiedOn]=useState(day(record?.verified_on)||today());
  const invalidDate=status==="verified"&&(!verifiedOn||verifiedOn>today()||item.key==="grace_review"&&earliestGrace&&verifiedOn<earliestGrace);
  return <article className="pr-closing-check">
    <div className="pr-closing-check-head"><div><strong>{item.title}</strong><p>{item.description}</p></div><span className={`pr-status ${status==="verified"?"completed":status==="blocked"?"blocked":"not_started"}`}>{friendly(status)}</span></div>
    <div className="pr-closing-check-fields">
      <label className="pr-field">Status<select value={status} disabled={disabled} onChange={e=>setStatus(e.target.value)}>{CLOSING_STATES.map(v=><option key={v} value={v}>{friendly(v)}</option>)}</select></label>
      <label className="pr-field">Document / approval reference<input value={reference} maxLength={160} disabled={disabled} placeholder="Reference from the actual signed record" onChange={e=>setReference(e.target.value)}/></label>
      <label className="pr-field">{item.key==="signed_handover"?"Signed handover date":"Verified on"}<input type="date" max={today()} min={item.key==="grace_review"?earliestGrace||undefined:undefined} value={verifiedOn} disabled={disabled} onChange={e=>setVerifiedOn(e.target.value)}/></label>
      <label className="pr-field">Evidence URL (HTTPS, optional)<input value={evidenceUrl} maxLength={2048} disabled={disabled} placeholder="https://..." onChange={e=>setEvidenceUrl(e.target.value)}/></label>
      <label className="pr-field pr-closing-wide">Notes<textarea value={notes} maxLength={1500} rows={2} disabled={disabled} onChange={e=>setNotes(e.target.value)}/></label>
    </div>
    {item.key==="grace_review"&&<p className="pr-hint">Required end of 7-day receipt review (from the signed handover date): {earliestGrace||"verify the signed handover date first"}. Record issues and their resolution before verifying.</p>}
    <div className="pr-closing-actions">{record?.evidence_url&&<a className="pr-link" target="_blank" rel="noopener noreferrer" href={record.evidence_url}>Open saved evidence</a>}
      <button type="button" className="pr-secondary" disabled={disabled||busy||invalidDate||(status==="verified"&&reference.trim().length<2)}
        onClick={()=>onSave(item.key,{status,reference,verifiedOn:status==="verified"?verifiedOn:null,evidenceUrl,notes},record?.updated_at||null)}>Save checkpoint</button>
    </div>
  </article>;
}
export default function FinalSchoolClosing({schoolId,schoolName,stageStatuses=[],canEdit,canApprove,request,onClose}){
  const [data,setData]=useState(EMPTY),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [approverName,setApproverName]=useState(""),[reference,setReference]=useState(""),[approvedOn,setApprovedOn]=useState(today());
  const [evidenceUrl,setEvidenceUrl]=useState(""),[notes,setNotes]=useState(""),[reopenReason,setReopenReason]=useState("");
  const load=async()=>{const response=await request(`/closing?schoolId=${encodeURIComponent(schoolId)}`);setData(response);setLoaded(true);};
  useEffect(()=>{let live=true;request(`/closing?schoolId=${encodeURIComponent(schoolId)}`).then(response=>{if(live){setData(response);setLoaded(true);}}).catch(e=>{if(live){setError(e.message);setLoaded(true);}});return()=>{live=false;};},[schoolId]);
  const summary=closingSummary(data.checks,data.approval);
  const completed=new Set(stageStatuses.filter(s=>s.status==="completed").map(s=>s.stage_key));
  const closed=data.approval?data.approval.status==="approved":completed.has("final_closing");
  const priorReady=["receiving","quality","preparing","packing","delivery","delivery_closing","installation","testing"].every(key=>completed.has(key));
  const signedDate=day(data.checks.find(row=>row.check_key==="signed_handover"&&row.status==="verified")?.verified_on);
  const graceDate=useMemo(()=>{if(!signedDate)return "";const d=new Date(`${signedDate}T12:00:00Z`);if(Number.isNaN(d.valueOf()))return "";d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);},[signedDate]);
  const graceFinished=!!graceDate&&today()>=graceDate;
  const canFinalize=canApprove&&!closed&&priorReady&&summary.verified===summary.total&&graceFinished&&!!data.technicalAcceptance;
  async function execute(action,success){if(busy)return;setBusy(true);setError("");setNotice("");try{await action();await load();setNotice(success);}catch(e){setError(e.message||"Unable to update closing record.");}finally{setBusy(false);}}
  function saveCheck(key,payload,expectedUpdatedAt){execute(()=>request("/closing","PATCH",{action:"check",schoolId,checkKey:key,expectedUpdatedAt,...payload}),"Closing evidence updated.");}
  function approve(){if(!window.confirm("Confirm that the REAL Operations approval and supporting signed documents have been verified? This action records Final School Closing."))return;
    execute(()=>request("/closing","PATCH",{action:"finalize",schoolId,approverName,approvalReference:reference,approvedOn,evidenceUrl,notes}),"School closing approved. Close this panel to refresh the school status.");}
  function reopen(){if(!window.confirm("Reopen this closed school? The previous approval remains in the audit history."))return;
    execute(()=>request("/closing","PATCH",{action:"reopen",schoolId,reason:reopenReason}),"School reopening recorded. Update outstanding records before approving again.");}
  return <div className="pr-closing">
    <div className="pr-manifest-title"><div><h3>Final School Closing</h3></div><button type="button" className="pr-secondary" onClick={onClose}>Close</button></div>
    {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<p className="pr-manifest-success" role="status">{notice}</p>}
    {!loaded?<p className="pr-muted">Loading final closing…</p>:<>
      <div className="pr-closing-stats"><div><span>Verified checks</span><strong>{summary.verified}/{summary.total}</strong></div><div><span>Prior stages</span><strong>{priorReady?"8/8":"Pending"}</strong></div><div><span>7-day review</span><strong>{graceFinished?"Finished":"Pending"}</strong></div><div><span>School status</span><strong>{closed?"Closed":"Open"}</strong></div></div>
      {!priorReady&&<p className="pr-hint">Complete delivery, installation follow-up, and testing stages before final approval.</p>}
      {data.technicalAcceptance?<p className="pr-muted">Technical acceptance: {data.technicalAcceptance.confirmation_reference} · {data.technicalAcceptance.technician_name}</p>:<p className="pr-hint">Technical acceptance has not been recorded.</p>}
      <div className="pr-closing-heading"><div className="pr-closing-heading-row"><h4>Closing Checklist</h4><button type="button" className="pr-secondary" onClick={()=>exportClosing(data,schoolName)}>Export CSV</button></div></div>
      <div className="pr-closing-items">{CLOSING_CHECKS.map(item=><ClosingCheck key={`${item.key}:${data.checks.find(x=>x.check_key===item.key)?.updated_at||"new"}`} item={item}
        record={data.checks.find(x=>x.check_key===item.key)} earliestGrace={graceDate}
        busy={busy} disabled={!canEdit||closed} onSave={saveCheck}/>)}</div>
      <div className="pr-closing-approval">
        <h4>{closed?"Approved Final Closing":"Operations Final Approval"}</h4>
        {data.approval&&<p className="pr-muted">Last recorded approval: {data.approval.approval_reference} · {data.approval.approver_name} · {day(data.approval.approved_on)} · {friendly(data.approval.status)}</p>}
        {data.approval?.evidence_url&&<a href={data.approval.evidence_url} target="_blank" rel="noopener noreferrer" className="pr-link">View approval evidence</a>}
        {!closed&&<><div className="pr-closing-check-fields">
          <label className="pr-field">Operations approver<input maxLength={160} value={approverName} onChange={e=>setApproverName(e.target.value)} disabled={!canApprove}/></label>
          <label className="pr-field">Final approval reference<input maxLength={160} value={reference} onChange={e=>setReference(e.target.value)} disabled={!canApprove}/></label>
          <label className="pr-field">Approval date<input type="date" max={today()} min={graceDate||undefined} value={approvedOn} onChange={e=>setApprovedOn(e.target.value)} disabled={!canApprove}/></label>
          <label className="pr-field">Approval evidence (HTTPS)<input maxLength={2048} value={evidenceUrl} onChange={e=>setEvidenceUrl(e.target.value)} disabled={!canApprove}/></label>
          <label className="pr-field pr-closing-wide">Approval notes<textarea maxLength={1500} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canApprove}/></label>
        </div><button className="pr-primary" type="button" disabled={!canFinalize||busy||approverName.trim().length<2||reference.trim().length<2||!approvedOn||approvedOn>today()||(graceDate&&approvedOn<graceDate)} onClick={approve}>Approve & Close School</button>
        {!canApprove&&<p className="pr-muted">Only members granted preparing.close can approve closing.</p>}</>}
        {closed&&<div className="pr-closing-reopen"><p className="pr-hint">Reopening requires a documented reason and the Final Closing permission. The original approval stays in the audit log.</p>
          <label className="pr-field">Reason for reopening<textarea value={reopenReason} maxLength={1500} rows={2} disabled={!canApprove} onChange={e=>setReopenReason(e.target.value)}/></label>
          <button type="button" className="pr-secondary" disabled={!canApprove||busy||reopenReason.trim().length<10} onClick={reopen}>Reopen School</button></div>}
      </div>
      <div className="pr-closing-heading"><h4>Closing Audit History</h4></div>
      <div className="pr-closing-audit">{data.audit.length?data.audit.map(row=><div key={row.id}><strong>{friendly(row.action)}</strong><span>{row.changed_by_id} · {new Date(row.changed_at).toLocaleString("en-GB")}</span></div>):<p className="pr-muted">No closing activity recorded yet.</p>}</div>
    </>}
  </div>;
}
