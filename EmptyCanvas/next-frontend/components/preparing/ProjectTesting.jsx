"use client";
import {useEffect,useMemo,useState} from "react";
import {testingChange} from "../../lib/preparing-project-testing-math.mjs";
import {testingGroups,testingRemaining,TESTING_EXPORT_COLUMNS,testingExportValue} from "../../lib/preparing-project-testing-grouping.mjs";

const n=value=>Number(value)||0;
const pretty=value=>n(value).toLocaleString("en-US");
const remaining=testingRemaining;
const csvCell=value=>{const s=String(value??"");return `"${(/^[\s]*[=+@-]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;};
const initial={items:[],history:[],kitGroups:[]};
const metrics=[
 {key:"received",label:"Testing Received",aria:"Testing received"},
 {key:"passed",label:"Passed",aria:"Passed testing"},
 {key:"failed",label:"Failed",aria:"Failed testing"},
 {key:"remaining",label:"Remaining"},
];
const delta=value=>{const x=n(value);return `${x>0?"+":""}${pretty(x)}`;};
const dateText=value=>{if(!value)return "—";const date=new Date(value);return Number.isNaN(date.getTime())?"—":date.toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});};

export default function ProjectTesting({projectId,projectName,canTest,request,onClose}) {
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("testing"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [expandedKit,setExpandedKit]=useState(null),[showExport,setShowExport]=useState(false);
 const [exportColumns,setExportColumns]=useState(TESTING_EXPORT_COLUMNS.map(c=>c.key));
 const [exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
 const [reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [draft,setDraft]=useState({}),[editing,setEditing]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[rowError,setRowError]=useState({});
 const load=async()=>{const result=await request(`/testing?projectId=${encodeURIComponent(projectId)}`);setData({items:result.items||[],history:result.history||[],kitGroups:result.kitGroups||[]});};
 useEffect(()=>{let mounted=true;
  request(`/testing?projectId=${encodeURIComponent(projectId)}`)
   .then(result=>{if(mounted)setData({items:result.items||[],history:result.history||[],kitGroups:result.kitGroups||[]});})
   .catch(e=>{if(mounted)setError(e.message||"Unable to load testing.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[projectId]);
 const totals=useMemo(()=>(data.items||[]).reduce((a,r)=>({
  required:a.required+n(r.required),received:a.received+n(r.received),passed:a.passed+n(r.passed),
  failed:a.failed+n(r.failed),remaining:a.remaining+remaining(r)
 }),{required:0,received:0,passed:0,failed:0,remaining:0}),[data.items]);
 const shown=useMemo(()=>(data.items||[])
  .filter(r=>`${r.name||""} ${r.code||""}`.toLowerCase().includes(search.trim().toLowerCase()))
  .filter(r=>filter==="pending"?remaining(r)>0:filter==="failed"?n(r.failed)>0:filter==="done"?n(r.received)>0&&remaining(r)===0:true),
 [data.items,search,filter]);
 const allGroups=useMemo(()=>testingGroups(data.items,data.kitGroups),[data.items,data.kitGroups]);
 const groupedShown=useMemo(()=>testingGroups(shown,data.kitGroups).filter(group=>group.items.length),[shown,data.kitGroups]);
 const activeIds=Object.keys(editing).filter(k=>editing[k]);
 const reset=()=>{setDraft({});setEditing({});setRowError({});};
 const edit=r=>{
  setEditing(old=>({...old,[r.id]:true}));
  setDraft(old=>({...old,[r.id]:{received:String(r.received),passed:String(r.passed),failed:String(r.failed)}}));
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
  if(manualReference&&manualReference.length<2){fail("Report reference must have at least 2 characters, or leave it blank for automatic generation.");return;}
  const lines=[];
  try{for(const itemId of ids){const row=data.items.find(r=>r.id===itemId),values=draft[itemId];if(!row||!values)continue;
   const line=testingChange(row,values);if(line)lines.push(line);
  }}catch(e){fail(e.message);return;}
  if(!lines.length){fail("Change at least one testing quantity before saving.");return;}
  setBusy(true);setError("");setSuccess("");setRowError({});
  try{
   await request("/testing","POST",{projectId,reference:manualReference,notes:notes.trim(),lines});
   // Save and refresh are separate. Never describe a committed save as failed on refresh errors.
   reset();setReference("");setNotes("");
   setSuccess(`Saved ${lines.length} component(s). Your ERP user is recorded in Testing History.`);
   try{await load();}catch{setError("Saved successfully, but the latest values could not be refreshed. Use Refresh to reload them.");}
  }catch(e){fail(e.message||"Unable to save testing results.");}
  finally{setBusy(false);}
 }
 const selectedExportGroups=()=>allGroups.filter(g=>!exportGroups.length||exportGroups.includes(g.key));
 function exportCSV(blank=false){
  if(!exportColumns.includes("name"))return;
  const headers=["Kit Tag",...exportColumns.map(key=>TESTING_EXPORT_COLUMNS.find(col=>col.key===key).label)];
  const rows=[headers];
  for(const group of selectedExportGroups()){
   for(const row of group.items)rows.push([group.name,...exportColumns.map(key=>testingExportValue(row,key,blank))]);
  }
  const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`project-testing-${blank?"blank":"results"}-${projectId}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  setShowExport(false);
 }
 async function exportPDF(blank){
  if(exportBusy||!exportColumns.includes("name"))return;
  setExportBusy(true);setError("");
  try{
   const response=await fetch("/next/api/projects-preparing/testing/export",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,projectName,columns:exportColumns,blank,groupKeys:exportGroups})});
   if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||`PDF export failed (${response.status}).`);}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`project-testing-${blank?"blank":"results"}-${projectId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
   setShowExport(false);
  }catch(e){setError(e?.message||"Unable to export PDF.");}finally{setExportBusy(false);}
 }
 const toggleColumn=key=>{if(key==="name")return;setExportColumns(old=>old.includes(key)?old.filter(k=>k!==key):TESTING_EXPORT_COLUMNS.filter(c=>old.includes(c.key)||c.key===key).map(c=>c.key));};
 const toggleGroup=key=>{setExportGroups(old=>{
  const all=allGroups.map(g=>g.key);
  const current=old.length?old:all;
  const updated=current.includes(key)?current.filter(k=>k!==key):all.filter(k=>current.includes(k)||k===key);
  return !updated.length?old:updated.length===all.length?[]:updated;
 });};
 const byId=useMemo(()=>new Map(data.items.map(r=>[r.id,r.name])),[data.items]);
 const entries=useMemo(()=>(data.history||[]).flatMap(batch=>(batch.lines||[]).map((line,index)=>({
  key:`${batch.id}-${line.itemId}-${index}`,reference:batch.reference,createdAt:batch.createdAt,
  editor:batch.createdByName||"",legacy:!batch.createdByName,notes:batch.notes,
  component:byId.get(line.itemId)||"Component",line,
 }))),[data.history,byId]);
 return <div className="pr-wh pr-pt pr-pt-modern">
  <header className="pr-manifest-title pr-wh-title pr-pt-title">
   <div><span className="pr-wh-overline">PROJECT QUALITY CONTROL <span className="pr-pt-overline-sep">/</span> {projectName}</span><h3>Components Testing</h3></div>
   <button type="button" className="pr-secondary" onClick={onClose}>Close</button>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading testing records…</p>:<>
   <div className="pr-wh-stats pr-pt-stat-grid">{[
    {key:"required",label:"Project Required",value:totals.required,mark:"◆"},
    {key:"received",label:"Testing Received",value:totals.received,mark:"↓"},
    {key:"passed",label:"Passed",value:totals.passed,mark:"✓"},
    {key:"failed",label:"Failed",value:totals.failed,mark:"!"},
    {key:"remaining",label:"Remaining",value:totals.remaining,mark:"◷"},
   ].map(stat=><div className={`pr-pt-stat pr-pt-stat--${stat.key}`} key={stat.key}>
    <span className="pr-pt-stat-icon" aria-hidden="true">{stat.mark}</span><span>{stat.label}</span><strong>{pretty(stat.value)}</strong>
   </div>)}</div>
   <div className="pr-wh-navigation pr-pt-navigation" role="tablist" aria-label="Project testing views">
    <button role="tab" type="button" aria-selected={tab==="testing"} className={tab==="testing"?"is-active":""} onClick={()=>setTab("testing")}>Testing</button>
    <button role="tab" type="button" aria-selected={tab==="history"} className={tab==="history"?"is-active":""} onClick={()=>setTab("history")}>Testing History <span className="pr-pt-tab-count">{entries.length}</span></button>
    <button type="button" className="pr-wh-export pr-pt-export-open" onClick={()=>setShowExport(true)} disabled={!data.items.length}>Export <span aria-hidden="true">⌄</span></button>
   </div>
   {tab==="testing"&&<>
    {canTest&&<div className="pr-wh-voucher pr-pt-report">
     <div className="pr-wh-voucher-head"><strong>Testing Record</strong><span className="pr-pt-audit-hint">Saved under your signed-in ERP account</span></div>
     <div className="pr-wh-form"><label>Report reference (optional)<input value={reference} maxLength={160} placeholder="Generated automatically if blank" onChange={e=>setReference(e.target.value)}/></label><label>Notes<input value={notes} maxLength={1000} placeholder="Batch, test conditions, or retest details" onChange={e=>setNotes(e.target.value)}/></label></div>
     <div className="pr-wh-voucher-bottom"><small>{activeIds.length} component(s) in edit mode</small><button type="button" className="pr-primary" disabled={busy||!activeIds.length} onClick={()=>save()}>{busy?"Saving…":"Save All Changes"}</button></div>
    </div>}
    <div className="pr-wh-toolbar pr-pt-toolbar"><label className="pr-search"><input type="search" aria-label="Search testing components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter testing components" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All components</option><option value="pending">Remaining to pass</option><option value="failed">Has failed units</option><option value="done">Fully received for testing</option></select><button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setLoading(true);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Refresh</button></div>
    <div className="pr-wh-list pr-pt-list pr-pt-kit-list" aria-label="Project component testing">{groupedShown.map((group,index)=>{
     const open=!!search.trim()||(expandedKit===null?index===0:expandedKit===group.key);
     return <section className={`pr-pt-kit-group${open?" is-open":""}`} key={group.key}>
      <button type="button" className="pr-pt-kit-heading" onClick={()=>setExpandedKit(open?"__none__":group.key)} aria-expanded={open}>
       <span className="pr-pt-kit-emblem" aria-hidden="true">▤</span><span className="pr-pt-kit-title"><strong>{group.name}</strong><small>{group.items.length} components</small></span>
       <span className="pr-pt-kit-arrow" aria-hidden="true">{open?"⌃":"⌄"}</span>
      </button>
      {open&&<div className="pr-pt-kit-body">{group.items.map(r=>{
     const isEditing=!!editing[r.id],v=draft[r.id]||{};
     return <article key={r.id} className={`pr-pt-row${isEditing?" is-editing":""}`}>
      <div className="pr-pt-heading">
       <div className="pr-pt-name"><div className="pr-pt-name-inline"><strong>{r.name}</strong>{r.code&&<small>#{r.code}</small>}{r.kitQuantity>0&&<small>Kit Qty: {pretty(r.kitQuantity)}</small>}</div>{r.mismatch&&<small className="pr-pt-warning">Historical warehouse receipt exceeds passed testing; review before handover.</small>}</div>
       <div className="pr-pt-required"><span>Required</span><strong>{pretty(r.required)}</strong></div>
      </div>
      <div className="pr-pt-metrics">
       {metrics.map(field=>{
        const isRemaining=field.key==="remaining";
        const current=isRemaining?Math.max(0,n(isEditing?v.received:r.received)-n(isEditing?v.passed:r.passed)):r[field.key];
        return <label key={field.key} className={`pr-pt-metric pr-pt-metric--${field.key}`}>
         <span>{field.label}</span>
         {isEditing&&!isRemaining?<input type="number" min="0" step="1" aria-label={`${field.aria} ${r.name}`} disabled={busy} value={v[field.key]??""} onChange={e=>change(r.id,field.key,e.target.value)}/>
         :<strong className={`pr-pt-metric-value pr-pt-number${field.key==="passed"?" pr-pt-pass":field.key==="failed"?" pr-pt-fail":""}`}>{pretty(current)}</strong>}
        </label>;
       })}
       {!isEditing&&<div className="pr-pt-metric pr-pt-metric--testedBy"><span>Tested By</span><div className="pr-pt-people">{(r.testedBy||[]).length?(r.testedBy||[]).map(person=><span className="pr-pt-person" title={person.name} key={person.id}>{person.name}</span>):<span className="pr-pt-person-empty">—</span>}</div></div>}
       <div className="pr-pt-actions">{canTest&&(isEditing?<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>cancel(r.id)}>Cancel</button><button type="button" className="pr-primary" disabled={busy} onClick={()=>save([r.id])}>{busy?"Saving…":"Save"}</button></>:<button type="button" className="pr-secondary" disabled={busy} onClick={()=>edit(r)}>Edit</button>)}</div>
      </div>
      {rowError[r.id]&&<p className="pr-pt-inline-error" role="alert">{rowError[r.id]}</p>}
     </article>;
    })}</div>}</section>;
    })}{!groupedShown.length&&<div className="pr-wh-empty">No testing components match this view.</div>}</div>
   </>}
   {tab==="history"&&<section className="pr-wh-history pr-pt-history" aria-label="Testing change history">
    <div className="pr-pt-history-heading"><div><h4>Testing Activity</h4><p>One audit card for every saved component change.</p></div><span className="pr-pt-history-count">{entries.length} changes</span></div>
    <div className="pr-pt-history-grid">{entries.map(record=><article className="pr-pt-history-card" key={record.key}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{record.editor?record.editor.slice(0,1).toUpperCase():"?"}</span><div className="pr-pt-history-person"><strong>{record.editor||"Legacy record (name not recorded)"}</strong><span>{dateText(record.createdAt)}</span></div><span className="pr-pt-history-label">Saved</span></div>
     <div className="pr-pt-history-component"><strong>{record.component}</strong><span title={record.reference}>{record.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Testing Received <strong>{delta(record.line.receivedDelta)}</strong></span><span>Passed <strong className="pr-pt-pass">{delta(record.line.passedDelta)}</strong></span><span>Failed <strong className="pr-pt-fail">{delta(record.line.failedDelta)}</strong></span></div>
     {record.notes&&<p className="pr-pt-history-note">{record.notes}</p>}
     {record.legacy&&record.line.technicianName&&<p className="pr-pt-history-note">Historical technician entry: {record.line.technicianName}</p>}
    </article>)}{!entries.length&&<div className="pr-wh-empty">No testing records yet.</div>}</div>
   </section>}
  </>}
  {showExport&&<div className="pr-pt-export-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!exportBusy)setShowExport(false);}}>
   <section className="pr-pt-export-modal" role="dialog" aria-modal="true" aria-label="Export components testing">
    <header className="pr-pt-export-head"><div><strong>Export Testing</strong><small>Choose columns, Kits and report format</small></div><button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>setShowExport(false)} aria-label="Close export">×</button></header>
    <div className="pr-pt-export-body">
     <div className="pr-pt-export-section-head"><strong>Columns</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportColumns(TESTING_EXPORT_COLUMNS.map(c=>c.key))}>Select all</button></div>
     <div className="pr-pt-export-checks">{TESTING_EXPORT_COLUMNS.map(col=><label key={col.key} className="pr-pt-export-check"><input type="checkbox" checked={exportColumns.includes(col.key)} disabled={col.fixed} onChange={()=>toggleColumn(col.key)}/><span>{col.label}</span></label>)}</div>
     <div className="pr-pt-export-section-head"><strong>Kit groups</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportGroups([])}>All Kits</button></div>
     <div className="pr-pt-export-kits">{allGroups.map(group=><label key={group.key} className="pr-pt-export-check"><input type="checkbox" checked={!exportGroups.length||exportGroups.includes(group.key)} onChange={()=>toggleGroup(group.key)}/><span>{group.name}</span></label>)}</div>
     <div className="pr-pt-export-info">Blank physical sheets include component names and required quantities; testing numbers, Tested By and Signature remain empty for handwriting.</div>
    </div>
    <footer className="pr-pt-export-actions">
     <button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>exportCSV(false)}>CSV · Values</button>
     <button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>exportCSV(true)}>CSV · Blank</button>
     <button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>exportPDF(false)}>PDF · Values</button>
     <button type="button" className="pr-primary" disabled={exportBusy} onClick={()=>exportPDF(true)}>{exportBusy?"Exporting…":"PDF · Blank sheet"}</button>
    </footer>
   </section>
  </div>}
 </div>;
}
