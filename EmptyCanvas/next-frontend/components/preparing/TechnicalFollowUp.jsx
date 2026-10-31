"use client";
import PreparingSelect from "./PreparingSelect";
import { useEffect, useMemo, useState } from "react";
import { TECHNICAL_CHECKPOINTS, TECHNICAL_STATES, ISSUE_STATES, ISSUE_SEVERITIES, technicalSummary } from "../../lib/preparing-technical";
const blankIssue={title:"",description:"",severity:"medium",status:"open",ownerName:"",dueDate:"",resolutionNotes:"",evidenceUrl:""};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const str=value=>String(value??"");
const asDate=value=>value?str(value).slice(0,10):"";
const displayStatus=value=>str(value||"not_started").replaceAll("_"," ");
const labelIssue=i=>i.status==="resolved"?"Resolved":i.status==="in_progress"?"In progress":"Open";
const csvSafe=value=>{const v=str(value);return `"${(/^\s*[=+@-]/.test(v)?"'":"")+v.replaceAll('"','""')}"`;};
function downloadIssues(rows,schoolId){
  const head=[["Technical issue","Severity","Status","Technical owner","Due","Description","Resolution","Evidence URL"],...rows.map(i=>[i.title,i.severity,i.status,i.owner_name,i.due_date||"",i.description,i.resolution_notes,i.evidence_url])];
  const blob=new Blob(["\uFEFF"+head.map(r=>r.map(csvSafe).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`technical-issues-${schoolId}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function EditIssue({issue,disabled,busy,onSave,onCancel}) {
  const [form,setForm]=useState(issue?{title:issue.title||"",description:issue.description||"",severity:issue.severity,
    status:issue.status,ownerName:issue.owner_name||"",dueDate:asDate(issue.due_date),resolutionNotes:issue.resolution_notes||"",evidenceUrl:issue.evidence_url||""}:{...blankIssue});
  const set=(name,value)=>setForm(p=>({...p,[name]:value}));
  return <div className="pr-technical-form">
    <div className="pr-technical-grid">
      <label className="pr-field">Issue title<input maxLength={180} value={form.title} disabled={disabled} onChange={e=>set("title",e.target.value)} placeholder="Describe the issue"/></label>
      <label className="pr-field">Severity<PreparingSelect value={form.severity} disabled={disabled} onChange={e=>set("severity",e.target.value)}>{ISSUE_SEVERITIES.map(v=><option key={v} value={v}>{v}</option>)}</PreparingSelect></label>
      {issue&&<label className="pr-field">Status<PreparingSelect value={form.status} disabled={disabled} onChange={e=>set("status",e.target.value)}>{ISSUE_STATES.map(v=><option key={v} value={v}>{displayStatus(v)}</option>)}</PreparingSelect></label>}
      <label className="pr-field">Responsible technical person / team<input maxLength={160} value={form.ownerName} disabled={disabled} onChange={e=>set("ownerName",e.target.value)} placeholder="Owner / contractor"/></label>
      <label className="pr-field">Target date<input type="date" value={form.dueDate} disabled={disabled} onChange={e=>set("dueDate",e.target.value)}/></label>
      {issue&&<label className="pr-field">Resolution evidence URL (optional)<input type="url" maxLength={2048} value={form.evidenceUrl} disabled={disabled} placeholder="https://" onChange={e=>set("evidenceUrl",e.target.value)}/></label>}
    </div>
    <label className="pr-field">Issue details<textarea rows={2} maxLength={2000} value={form.description} disabled={disabled} onChange={e=>set("description",e.target.value)}/></label>
    {issue&&<label className="pr-field">Resolution notes{form.status==="resolved"?" (required)":""}<textarea rows={2} maxLength={2000} value={form.resolutionNotes} disabled={disabled} onChange={e=>set("resolutionNotes",e.target.value)} placeholder="Technical team's corrective action"/></label>}
    <div className="pr-component-buttons"><button type="button" className="pr-secondary" onClick={onCancel}>Cancel</button>
      {!disabled&&<button type="button" className="pr-primary" disabled={busy||form.title.trim().length<3||(form.status==="resolved"&&form.resolutionNotes.trim().length<3)} onClick={()=>onSave(form)}>{busy?"Saving…":issue?"Save Issue":"Create Issue"}</button>}</div>
  </div>;
}
function Milestone({item,record,disabled,busy,onSave}){
  const [draft,setDraft]=useState({status:record?.status||"not_started",ownerName:record?.owner_name||"",dueDate:asDate(record?.due_date),notes:record?.notes||"",evidenceUrl:record?.evidence_url||""});
  const [editing,setEditing]=useState(false);
  const set=(name,value)=>setDraft(p=>({...p,[name]:value}));
  const late=draft.dueDate&&draft.dueDate<today()&&draft.status!=="completed";
  return <article className="pr-technical-item">
    <div className="pr-technical-item-head"><div><strong>{item.title}</strong><small>{item.description}</small></div>
      <span className={`pr-status ${record?.status||"not_started"}`}>{displayStatus(record?.status)}</span></div>
    <div className="pr-technical-meta"><span>Technical owner: {record?.owner_name||"Unassigned"}</span>
      <span>Due: {asDate(record?.due_date)||"—"}</span>{late&&<span className="pr-technical-late">Overdue</span>}</div>
    {record?.notes&&<p className="pr-technical-note">{record.notes}</p>}
    {record?.evidence_url&&<a href={record.evidence_url} target="_blank" rel="noopener noreferrer" className="pr-link">Open evidence</a>}
    {!disabled&&!editing&&<button className="pr-link pr-technical-edit" type="button" onClick={()=>setEditing(true)}>Update checkpoint</button>}
    {editing&&<div className="pr-technical-form">
      <div className="pr-technical-grid">
        <label className="pr-field">Status<PreparingSelect value={draft.status} onChange={e=>set("status",e.target.value)}>{TECHNICAL_STATES.map(v=><option value={v} key={v}>{displayStatus(v)}</option>)}</PreparingSelect></label>
        <label className="pr-field">Responsible technical person / team<input value={draft.ownerName} maxLength={160} onChange={e=>set("ownerName",e.target.value)} placeholder="Technical team"/></label>
        <label className="pr-field">Target date<input type="date" value={draft.dueDate} onChange={e=>set("dueDate",e.target.value)}/></label>
        <label className="pr-field">Evidence URL (optional)<input type="url" value={draft.evidenceUrl} maxLength={2048} onChange={e=>set("evidenceUrl",e.target.value)} placeholder="https://"/></label>
      </div>
      <label className="pr-field">Technical update / reference<textarea rows={2} value={draft.notes} maxLength={1500} onChange={e=>set("notes",e.target.value)}/></label>
      <div className="pr-component-buttons"><button type="button" className="pr-secondary" onClick={()=>setEditing(false)}>Cancel</button>
        <button type="button" className="pr-primary" disabled={busy||(draft.status==="completed"&&!draft.ownerName.trim())} onClick={()=>onSave(item.key,draft,record?.updated_at||null,()=>setEditing(false))}>{busy?"Saving…":"Save Checkpoint"}</button></div>
    </div>}
  </article>;
}
export default function TechnicalFollowUp({schoolId,schoolName,stageStatuses=[],allowed,request,onClose}){
  const [data,setData]=useState({checkpoints:[],issues:[],acceptance:null});
  const [loaded,setLoaded]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false),[tab,setTab]=useState("installation"),[editIssue,setEditIssue]=useState(""),[issueFilter,setIssueFilter]=useState("all");
  const [acceptForm,setAcceptForm]=useState({technicianName:"",confirmationReference:"",confirmedOn:today(),evidenceUrl:"",notes:""});
  const stages=new Map(stageStatuses.map(row=>[row.stage_key,row.status]));
  const delivered=stages.get("delivery_closing")==="completed";
  const installed=stages.get("installation")==="completed";
  const testing=stages.get("testing")==="completed";
  const closed=stages.get("final_closing")==="completed";
  const summary=useMemo(()=>technicalSummary(data.checkpoints,data.issues,data.acceptance),[data]);
  const filteredIssues=data.issues.filter(i=>issueFilter==="all"||i.status===issueFilter);
  const canEdit=allowed&&delivered&&!testing&&!closed;
  const canMilestoneEdit=key=>canEdit&&(TECHNICAL_CHECKPOINTS.find(i=>i.key===key)?.phase==="installation"?!installed:installed);
  async function fetchData(){const json=await request(`/technical?schoolId=${encodeURIComponent(schoolId)}`);
    const next={checkpoints:json.checkpoints||[],issues:json.issues||[],acceptance:json.acceptance||null};setData(next);setLoaded(true);return next;}
  useEffect(()=>{let active=true;request(`/technical?schoolId=${encodeURIComponent(schoolId)}`).then(json=>{
    if(active){setData({checkpoints:json.checkpoints||[],issues:json.issues||[],acceptance:json.acceptance||null});setLoaded(true);}
  }).catch(e=>{if(active){setError(e.message);setLoaded(true);}});return()=>{active=false;};},[schoolId]);
  useEffect(()=>{const a=data.acceptance;if(a)setAcceptForm({technicianName:a.technician_name,confirmationReference:a.confirmation_reference,
    confirmedOn:asDate(a.confirmed_on),evidenceUrl:a.evidence_url||"",notes:a.notes||""});},[data.acceptance]);
  async function run(action,success){if(busy)return;setBusy(true);setError("");setNotice("");try{await action();await fetchData();setNotice(success);}catch(e){setError(e.message||"Unable to save follow-up.");}finally{setBusy(false);}}
  function saveCheckpoint(key,form,version,done){run(async()=>{await request("/technical","PATCH",{action:"checkpoint",schoolId,milestoneKey:key,expectedUpdatedAt:version,...form});done();},"Technical checkpoint updated.");}
  function saveIssue(form,record){run(async()=>{
    await request("/technical",record?"PATCH":"POST",{action:record?"issue":"create_issue",schoolId,...form,
      ...(record?{issueId:record.id,expectedUpdatedAt:record.updated_at}:{})});setEditIssue("");
  },record?"Issue updated and logged.":"Technical issue registered.");}
  function saveAcceptance(){if(!window.confirm("Record the REAL technical team's acceptance reference? This is a log of evidence, not a digital signature."))return;
    run(()=>request("/technical","PATCH",{action:"acceptance",schoolId,expectedUpdatedAt:data.acceptance?.updated_at||null,...acceptForm}),"Technical acceptance reference recorded.");}
  const activeIssue=data.issues.find(i=>i.id===editIssue);
  const acceptanceReady=installed&&summary.tested===summary.testingTotal&&summary.openIssues===0&&!testing;
  return <div className="pr-technical">
    <div className="pr-manifest-title"><div><h3>Technical Installation Follow-up</h3></div><button type="button" className="pr-secondary" onClick={onClose}>Close</button></div>
    {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
    {!loaded?<p className="pr-muted">Loading technical follow-up…</p>:<>
      <div className="pr-technical-summary">{[["Installation",`${summary.installed}/${summary.installationTotal}`],["Testing",`${summary.tested}/${summary.testingTotal}`],["Open issues",summary.openIssues],["Acceptance",summary.accepted?"Recorded":"Pending"]].map(([name,value])=><div key={name}><small>{name}</small><strong>{value}</strong></div>)}</div>
      {!delivered&&<p className="pr-hint">Technical records become editable after Delivery Handover (stage 6) is completed.</p>}
      {testing&&<p className="pr-hint">Testing is completed. Reopen the Testing stage before changing technical records.</p>}
      <div className="pr-technical-tabs" role="tablist" aria-label="Technical follow-up sections">{[["installation","Installation"],["testing","Testing"],["issues",`Issues (${summary.openIssues} open)`],["acceptance","Technical acceptance"]].map(([key,label])=><button type="button" role="tab" aria-selected={tab===key} className={tab===key?"active":""} onClick={()=>setTab(key)} key={key}>{label}</button>)}</div>
      {(["installation","testing"].includes(tab))&&<div className="pr-technical-checkpoints">

        {TECHNICAL_CHECKPOINTS.filter(item=>item.phase===tab).map(item=><Milestone key={`${item.key}:${data.checkpoints.find(x=>x.milestone_key===item.key)?.updated_at||"new"}`}
          item={item} record={data.checkpoints.find(x=>x.milestone_key===item.key)} disabled={!canMilestoneEdit(item.key)} busy={busy} onSave={saveCheckpoint}/>)}
      </div>}
      {tab==="issues"&&<div className="pr-technical-checkpoints">
        <div className="pr-delivery-toolbar"><div><h4>Snag / issue register</h4></div>
          <div className="pr-carton-actions"><button className="pr-secondary" type="button" onClick={()=>downloadIssues(data.issues,schoolId)}>Export CSV</button>{canEdit&&<button type="button" className="pr-primary" onClick={()=>setEditIssue("new")}>+ Add Issue</button>}</div></div>
        <label className="pr-field">Filter<PreparingSelect value={issueFilter} onChange={e=>setIssueFilter(e.target.value)}><option value="all">All issues</option>{ISSUE_STATES.map(v=><option key={v} value={v}>{displayStatus(v)}</option>)}</PreparingSelect></label>
        {editIssue==="new"&&<EditIssue key="new" disabled={!canEdit} busy={busy} onSave={form=>saveIssue(form,null)} onCancel={()=>setEditIssue("")}/>}
        {!filteredIssues.length&&<div className="pr-manifest-empty"><p>No technical issues in this view.</p></div>}
        {filteredIssues.map(issue=><article key={issue.id} className="pr-technical-item">
          <div className="pr-technical-item-head"><div><strong>{issue.title}</strong><small>{issue.description||"No details"}</small></div><span className={`pr-status ${issue.status==="resolved"?"completed":"blocked"}`}>{labelIssue(issue)}</span></div>
          <div className="pr-technical-meta"><span>{issue.severity.toUpperCase()} priority</span><span>Owner: {issue.owner_name||"Unassigned"}</span><span>Due: {asDate(issue.due_date)||"—"}</span>{issue.status!=="resolved"&&asDate(issue.due_date)&&asDate(issue.due_date)<today()&&<span className="pr-technical-late">Overdue</span>}</div>
          {issue.resolution_notes&&<p className="pr-technical-note">Resolution: {issue.resolution_notes}</p>}{issue.evidence_url&&<a href={issue.evidence_url} target="_blank" rel="noopener noreferrer" className="pr-link">Evidence</a>}
          {canEdit&&editIssue!==issue.id&&<button type="button" className="pr-link pr-technical-edit" onClick={()=>setEditIssue(issue.id)}>Update Issue</button>}
          {editIssue===issue.id&&<EditIssue key={`${issue.id}:${issue.updated_at}`} issue={activeIssue} disabled={!canEdit} busy={busy} onSave={form=>saveIssue(form,issue)} onCancel={()=>setEditIssue("")}/>}
        </article>)}
      </div>}
      {tab==="acceptance"&&<div className="pr-technical-checkpoints">
        <div className="pr-manifest-snapshot"><span>Installation stage: <b>{displayStatus(stages.get("installation"))}</b></span><span>Testing tasks: <b>{summary.tested}/{summary.testingTotal}</b></span><span>Open issues: <b>{summary.openIssues}</b></span></div>
        <p className="pr-hint">Record the actual technical team's acceptance/document reference. This entry does not create a signature or prove the referenced document is valid. Final administrative school closure comes in Phase 5.</p>
        {data.acceptance&&<div className="pr-delivery-closed"><strong>Technical acceptance logged</strong><p>{data.acceptance.technician_name} · {data.acceptance.confirmation_reference} · {asDate(data.acceptance.confirmed_on)}</p>{data.acceptance.evidence_url&&<a href={data.acceptance.evidence_url} target="_blank" rel="noopener noreferrer">Open reference</a>}</div>}
        {allowed&&!testing&&<div className="pr-technical-form">
          <div className="pr-technical-grid">
            <label className="pr-field">Responsible technical person<input maxLength={160} disabled={!acceptanceReady} value={acceptForm.technicianName} onChange={e=>setAcceptForm(p=>({...p,technicianName:e.target.value}))}/></label>
            <label className="pr-field">Actual technical acceptance reference<input maxLength={160} disabled={!acceptanceReady} value={acceptForm.confirmationReference} onChange={e=>setAcceptForm(p=>({...p,confirmationReference:e.target.value}))}/></label>
            <label className="pr-field">Acceptance date<input type="date" max={today()} disabled={!acceptanceReady} value={acceptForm.confirmedOn} onChange={e=>setAcceptForm(p=>({...p,confirmedOn:e.target.value}))}/></label>
            <label className="pr-field">Evidence URL (optional)<input type="url" maxLength={2048} disabled={!acceptanceReady} value={acceptForm.evidenceUrl} placeholder="https://" onChange={e=>setAcceptForm(p=>({...p,evidenceUrl:e.target.value}))}/></label>
          </div>
          <label className="pr-field">Follow-up notes<textarea rows={3} maxLength={1000} disabled={!acceptanceReady} value={acceptForm.notes} onChange={e=>setAcceptForm(p=>({...p,notes:e.target.value}))}/></label>
          <div className="pr-component-buttons"><button type="button" className="pr-primary" disabled={!acceptanceReady||busy||acceptForm.technicianName.trim().length<2||acceptForm.confirmationReference.trim().length<2} onClick={saveAcceptance}>{busy?"Saving…":data.acceptance?"Update acceptance reference":"Record acceptance reference"}</button></div>
        </div>}
      </div>}

    </>}
  </div>;
}
