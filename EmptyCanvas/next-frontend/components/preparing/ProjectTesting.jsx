"use client";
import {useEffect,useMemo,useState} from "react";
import {testingChange} from "../../lib/preparing-project-testing-math.mjs";

const n=v=>Number(v)||0;
const pretty=v=>n(v).toLocaleString("en-US");
const csvCell=v=>{const x=String(v??"");return `"${(/^[\s]*[=+@-]/.test(x)?"'":"")+x.replaceAll('"','""')}"`;};
const initial={items:[],history:[]};

export default function ProjectTesting({projectId,projectName,canTest,request,onClose}) {
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("testing"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [draft,setDraft]=useState({}),[editing,setEditing]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[rowError,setRowError]=useState({});
 const load=async()=>{const result=await request(`/testing?projectId=${encodeURIComponent(projectId)}`);setData({items:result.items||[],history:result.history||[]});};
 useEffect(()=>{let mounted=true;
  request(`/testing?projectId=${encodeURIComponent(projectId)}`)
   .then(result=>{if(mounted)setData({items:result.items||[],history:result.history||[]});})
   .catch(e=>{if(mounted)setError(e.message||"Unable to load testing.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[projectId]);
 const totals=useMemo(()=>(data.items||[]).reduce((a,r)=>({
  required:a.required+n(r.required),received:a.received+n(r.received),passed:a.passed+n(r.passed),
  failed:a.failed+n(r.failed),pending:a.pending+Math.max(0,n(r.received)-n(r.passed)-n(r.failed))
 }),{required:0,received:0,passed:0,failed:0,pending:0}),[data.items]);
 const shown=useMemo(()=>(data.items||[])
  .filter(r=>`${r.name||""} ${r.code||""}`.toLowerCase().includes(search.trim().toLowerCase()))
  .filter(r=>filter==="pending"?n(r.received)>n(r.passed)+n(r.failed):filter==="failed"?n(r.failed)>0:filter==="done"?n(r.received)>0&&n(r.received)===n(r.passed)+n(r.failed):true),
 [data.items,search,filter]);
 const activeIds=Object.keys(editing).filter(k=>editing[k]);
 const reset=()=>{setDraft({});setEditing({});setRowError({});};
 const edit=r=>{
  setEditing(old=>({...old,[r.id]:true}));
  setDraft(old=>({...old,[r.id]:{received:String(r.received),passed:String(r.passed),failed:String(r.failed),technicianName:String(r.technicianName||"")}}));
  setError("");setSuccess("");setRowError(old=>({...old,[r.id]:""}));
 };
 const cancel=id=>{
  setEditing(old=>{const next={...old};delete next[id];return next;});
  setDraft(old=>{const next={...old};delete next[id];return next;});
  setRowError(old=>{const next={...old};delete next[id];return next;});
 };
 const change=(id,key,value)=>setDraft(old=>({...old,[id]:{...old[id],[key]:value}}));
 async function save(ids=activeIds) {
  if(busy)return;
  const rowId=ids.length===1?ids[0]:null;
  const fail=message=>{setError(message);if(rowId)setRowError(old=>({...old,[rowId]:message}));};
  const manualReference=reference.trim();
  // A manual reference is optional. The API generates a unique audit reference
  // when it is blank, so Save on a component row always works without scrolling.
  if(manualReference&&manualReference.length<2){fail("Report reference must be at least 2 characters, or leave it blank to generate one automatically.");return;}
  const lines=[];
  try{for(const itemId of ids){const row=data.items.find(r=>r.id===itemId),values=draft[itemId];if(!row||!values)continue;
   const line=testingChange(row,values);if(line)lines.push(line);
  }}catch(e){fail(e.message);return;}
  if(!lines.length){fail("Change at least one testing quantity before saving.");return;}
  setBusy(true);setError("");setSuccess("");setRowError({});
  try{
   await request("/testing","POST",{projectId,reference:manualReference,notes:notes.trim(),lines});
   // A successful POST has already committed. A failed refresh must never
   // be described as a failed Save (otherwise users may double-submit).
   reset();setReference("");setNotes("");
   setSuccess(`Saved testing results for ${lines.length} component(s).`);
   try{await load();}catch(e){setError("Saved successfully, but the latest values could not be refreshed. Use Refresh to reload them.");}
  }catch(e){fail(e.message||"Unable to save testing results.");}
  finally{setBusy(false);}
 }
 function exportCSV(){const lines=[["Component","Code","Project required","Testing received","Passed","Failed","Not tested","Warehouse accepted","Technician","Mismatch"],
  ...data.items.map(r=>[r.name,r.code,r.required,r.received,r.passed,r.failed,Math.max(0,n(r.received)-n(r.passed)-n(r.failed)),r.accepted,r.technicianName||"",r.mismatch?"YES":"NO"])];
  const file=new Blob(["\uFEFF"+lines.map(line=>line.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=`project-testing-${projectId}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 const byId=useMemo(()=>new Map(data.items.map(r=>[r.id,r.name])),[data.items]);
 const numericFields=[{key:"received",label:"Testing Received",aria:"Testing received"},{key:"passed",label:"Passed",aria:"Passed testing"},{key:"failed",label:"Failed",aria:"Failed testing"}];
 return <div className="pr-wh pr-pt">
  <header className="pr-manifest-title pr-wh-title"><div><span className="pr-wh-overline">PROJECT TESTING · {projectName}</span><h3>Components Testing</h3></div><button type="button" className="pr-secondary" onClick={onClose}>Close</button></header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading testing records…</p>:<>
   <div className="pr-wh-stats">{[["Project required",totals.required],["Testing received",totals.received],["Passed",totals.passed],["Failed",totals.failed],["Not tested",totals.pending]].map(([label,value])=><div key={label}><span>{label}</span><strong>{pretty(value)}</strong></div>)}</div>
   <div className="pr-wh-navigation" role="tablist" aria-label="Project testing views"><button role="tab" type="button" aria-selected={tab==="testing"} className={tab==="testing"?"is-active":""} onClick={()=>setTab("testing")}>Testing</button><button role="tab" type="button" aria-selected={tab==="history"} className={tab==="history"?"is-active":""} onClick={()=>setTab("history")}>Testing History</button><button type="button" className="pr-wh-export" onClick={exportCSV} disabled={!data.items.length}>Export CSV</button></div>
   {tab==="testing"&&<>
    {canTest&&<div className="pr-wh-voucher"><div className="pr-wh-voucher-head"><strong>Test report</strong><span className="pr-wh-voucher-help">Test first, then receive passed units in Warehouse Receiving</span></div><div className="pr-wh-form"><label>Report reference (optional)<input value={reference} maxLength={160} placeholder="Generated automatically if blank" onChange={e=>setReference(e.target.value)}/></label><label>Notes<input value={notes} maxLength={1000} placeholder="Batch, test conditions or retest details" onChange={e=>setNotes(e.target.value)}/></label></div><div className="pr-wh-voucher-bottom"><small>{activeIds.length} component(s) in edit mode</small><button type="button" className="pr-primary" disabled={busy||!activeIds.length} onClick={()=>save()}>{busy?"Saving…":"Save All Changes"}</button></div></div>}
    <div className="pr-wh-toolbar"><label className="pr-search"><input type="search" aria-label="Search testing components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter testing components" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All components</option><option value="pending">Not fully tested</option><option value="failed">Has failed units</option><option value="done">Fully tested</option></select><button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setLoading(true);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Refresh</button></div>
    <div className="pr-wh-list pr-pt-list" aria-label="Project component testing">{shown.map(r=>{
     const isEditing=!!editing[r.id],v=draft[r.id]||{};
     const metrics=[...numericFields,{key:"pending",label:"Not tested"},{key:"technicianName",label:"Tested By"}];
     return <div key={r.id} className={`pr-pt-row${isEditing?" is-editing":""}`}>
      <div className="pr-pt-heading">
       <div className="pr-pt-name"><div className="pr-pt-name-inline"><strong>{r.name}</strong>{r.code&&<small>#{r.code}</small>}</div>{r.mismatch&&<small className="pr-pt-warning">Historical warehouse receipt exceeds Passed testing; review before the next handover.</small>}</div>
       <div className="pr-pt-required"><span>Required</span><strong>{pretty(r.required)}</strong></div>
      </div>
      <div className="pr-pt-metrics">
       {metrics.map(field=>{
        const isPending=field.key==="pending",isTechnician=field.key==="technicianName";
        const current=isPending?Math.max(0,n(isEditing?v.received:r.received)-n(isEditing?v.passed:r.passed)-n(isEditing?v.failed:r.failed)):r[field.key];
        return <label key={field.key} className={`pr-pt-metric pr-pt-metric--${field.key}`}>
         <span>{field.label}</span>
         {isEditing&&!isPending?<input type={isTechnician?"text":"number"} min={isTechnician?undefined:"0"} step={isTechnician?undefined:"1"} maxLength={isTechnician?160:undefined} aria-label={isTechnician?`Technician ${r.name}`:`${field.aria} ${r.name}`} placeholder={isTechnician?"Technician name":undefined} disabled={busy} value={v[field.key]??""} onChange={e=>change(r.id,field.key,e.target.value)}/>
         :<strong className={`pr-pt-metric-value${field.key==="passed"?" pr-pt-pass":field.key==="failed"?" pr-pt-fail":""}`}>{isTechnician?(current||"—"):pretty(current)}</strong>}
        </label>;
       })}
       <div className="pr-pt-actions">{canTest&&(isEditing?<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>cancel(r.id)}>Cancel</button><button type="button" className="pr-primary" disabled={busy} onClick={()=>save([r.id])}>{busy?"Saving…":"Save"}</button></>:<button type="button" className="pr-secondary" disabled={busy} onClick={()=>edit(r)}>Edit</button>)}</div>
      </div>
      {rowError[r.id]&&<p className="pr-pt-inline-error" role="alert">{rowError[r.id]}</p>}
     </div>;
    })}{!shown.length&&<div className="pr-wh-empty">No testing components match this view.</div>}</div>
   </>}
   {tab==="history"&&<div className="pr-wh-history"><h4>Testing reports</h4>{data.history.map(row=><div className="pr-wh-history-entry" key={row.id}><strong>{row.reference}</strong><span>{new Date(row.createdAt).toLocaleString("en-GB")}</span><small>{(row.lines||[]).map(l=>`${byId.get(l.itemId)||"Component"}: ${n(l.receivedDelta)>=0?"+":""}${l.receivedDelta??0} received for testing, ${n(l.passedDelta)>=0?"+":""}${l.passedDelta} passed, ${n(l.failedDelta)>=0?"+":""}${l.failedDelta} failed${l.technicianName?` · Technician: ${l.technicianName}`:""}`).join(" · ")}</small>{row.notes&&<small>{row.notes}</small>}</div>)}{!data.history.length&&<div className="pr-wh-empty">No testing records yet.</div>}</div>}
  </>}
 </div>;
}
