"use client";
import PreparingSelect from "./PreparingSelect";
import StageQuantityInput from "./StageQuantityInput";
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

// Mirror the solid, category-specific Kit icons in Project Components.
// Icons are presentation-only; Kit identity and quantities remain untouched.
function testingKitAppearance(name){
 const label=String(name||"").toLowerCase();
 if(/electronic|arduino|sensor|circuit|robot/.test(label))return {icon:"cpu",tone:"blue"};
 if(/stationary|stationery|writing/.test(label))return {icon:"pencil",tone:"green"};
 if(/laser|cutter/.test(label))return {icon:"laser",tone:"red"};
 if(/filament|printer/.test(label))return {icon:"spool",tone:"amber"};
 if(/addon|add.on/.test(label))return {icon:"puzzle",tone:"purple"};
 if(/tool|hand.held/.test(label))return {icon:"wrench",tone:"sky"};
 if(/project/.test(label))return {icon:"layers",tone:"purple"};
 return {icon:"box",tone:"orange"};
}
function TestingIcon({name="box",size=20}){
 const shapes={
  layers:<><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z"/><path d="m3.5 11 8.5 4.5 8.5-4.5M3.5 15.5 12 20l8.5-4.5"/></>,
  box:<><path d="M12 2 3.5 6.7 12 11.5l8.5-4.8L12 2Z"/><path d="M3.5 6.7v10L12 22l8.5-5.3v-10M12 11.5V22"/></>,
  cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  pencil:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8M4 20h16"/></>,
  laser:<><circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5M19.1 4.9l-3.5 3.5m-7.2 7.2-3.5 3.5"/></>,
  spool:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 7h14M5 17h14M9 11c2-1 4-1 6 0m-6 3c2-1 4-1 6 0"/></>,
  puzzle:<path d="M10 3H4a1 1 0 0 0-1 1v6h2a3 3 0 0 1 0 6H3v4a1 1 0 0 0 1 1h6v-2a3 3 0 0 1 6 0v2h4a1 1 0 0 0 1-1v-6h-2a3 3 0 0 1 0-6h2V4a1 1 0 0 0-1-1h-4v2a3 3 0 0 1-6 0V3Z"/>,
  wrench:<path d="M21 7.5a6 6 0 0 1-8 5.7L6.4 20a2 2 0 0 1-2.8-2.8l6.7-6.6a6 6 0 0 1 6-8l-3.8 3.8 3.1 3.1L19.5 6 21 7.5Z"/>,
  close:<path d="M5 5 19 19M19 5 5 19"/>,
  search:<><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
  history:<><path d="M3 12a9 9 0 1 0 2.3-6"/><path d="M3 4v5h5M12 7v5l3.5 2"/></>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

export default function ProjectTesting({projectId,projectName,canTest,request,onClose}) {
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("testing"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [expandedKit,setExpandedKit]=useState(null),[showExport,setShowExport]=useState(false);
 const [exportColumns,setExportColumns]=useState(TESTING_EXPORT_COLUMNS.map(c=>c.key));
 const [exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
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
 const change=(id,key,value)=>{
  setDraft(old=>({...old,[id]:{...old[id],[key]:value}}));
  setRowError(old=>({...old,[id]:""}));
 };
 async function save(ids) {
  if(busy)return;
  const rowId=ids.length===1?ids[0]:null;
  const fail=message=>{setError(message);if(rowId)setRowError(old=>({...old,[rowId]:message}));};
  const lines=[];
  try{for(const itemId of ids){const row=data.items.find(r=>r.id===itemId),values=draft[itemId];if(!row||!values)continue;
   const line=testingChange(row,values);if(line)lines.push(line);
  }}catch(e){fail(e.message);return;}
  if(!lines.length){fail("Change at least one testing quantity before saving.");return;}
  setBusy(true);setError("");setSuccess("");setRowError({});
  try{
   await request("/testing","POST",{projectId,lines});
   // Save and refresh are separate. Never describe a committed save as failed on refresh errors.
   const savedIds=new Set(lines.map(line=>line.itemId));
   setEditing(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setDraft(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setRowError(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setSuccess(`Saved ${lines.length} component(s). Your ERP user is recorded in Testing History.`);
   try{await load();}catch{setError("Saved successfully, but the latest values could not be refreshed. Reopen Components Testing to reload them.");}
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
   <button type="button" className="pr-pt-close" onClick={onClose} aria-label="Close Components Testing" title="Close"><TestingIcon name="close" size={19}/></button>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading testing records…</p>:<>
   <div className="pr-wh-stats pr-pt-stat-grid" aria-label="Testing summary">{[
    {key:"required",label:"Project Required",value:totals.required,mark:"◆"},
    {key:"received",label:"Testing Received",value:totals.received,mark:"↓"},
    {key:"passed",label:"Passed",value:totals.passed,mark:"✓"},
    {key:"failed",label:"Failed",value:totals.failed,mark:"!"},
    {key:"remaining",label:"Remaining",value:totals.remaining,mark:"◷"},
   ].map(stat=><div className={`pr-pt-stat pr-pt-stat--${stat.key}`} key={stat.key}>
    <span className="pr-pt-stat-icon" aria-hidden="true">{stat.key==="remaining"?<TestingIcon name="clock" size={25}/>:stat.mark}</span><span className="pr-pt-stat-copy"><span>{stat.label}</span><strong>{pretty(stat.value)}</strong></span>
   </div>)}</div>
   <div className="pr-wh-navigation pr-pt-navigation">
    <div className="pr-pt-view-tabs" role="tablist" aria-label="Project testing views">
     <button role="tab" type="button" aria-selected={tab==="testing"} className={tab==="testing"?"is-active":""} onClick={()=>setTab("testing")}>Testing</button>
     <button role="tab" type="button" aria-selected={tab==="history"} aria-label={`Testing History (${entries.length} changes)`} title={`Testing History (${entries.length})`} className={`pr-pt-history-button${tab==="history"?" is-active":""}`} onClick={()=>setTab("history")}><TestingIcon name="history" size={19}/></button>
    </div>
    <button type="button" className="pr-pt-download-button" aria-label="Download testing report" onClick={()=>setShowExport(true)} disabled={!data.items.length}><TestingIcon name="download" size={18}/><span>Download</span></button>
   </div>
   {tab==="testing"&&<>
     <div className="pr-wh-toolbar pr-pt-toolbar"><label className="pr-search pr-pt-search"><TestingIcon name="search" size={18}/><input type="search" aria-label="Search testing components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="pr-pt-clear-search" onClick={()=>setSearch("")} aria-label="Clear search" title="Clear search"><TestingIcon name="close" size={16}/></button>}</label><PreparingSelect iconOnly className={`pr-pt-filter-select${filter!=="all"?" is-filtered":""}`} aria-label="Filter testing components" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All components</option><option value="pending">Remaining to pass</option><option value="failed">Has failed units</option><option value="done">Fully received for testing</option></PreparingSelect></div>
    <div className="pr-wh-list pr-pt-list pr-pt-kit-list" aria-label="Project component testing">{groupedShown.map(group=>{
     const open=!!search.trim()||expandedKit===group.key;
     const appearance=testingKitAppearance(group.name);
     return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={group.key}>
      <button type="button" className="pr-pt-kit-heading" onClick={()=>setExpandedKit(open?"__none__":group.key)} aria-expanded={open}>
       <span className="pr-pt-kit-emblem" aria-hidden="true"><TestingIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{group.name}</strong><small>{group.items.length} components</small></span>
       <span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
      </button>
      {open&&<div className="pr-pt-kit-body">{group.items.map(r=>{
     const isEditing=!!editing[r.id],v=draft[r.id]||{};
     return <article key={r.id} className={`pr-pt-row${isEditing?" is-editing":""}`}>
      <div className="pr-pt-heading">
       <div className="pr-pt-name"><div className="pr-pt-name-inline"><strong title={r.code?`Product code: ${r.code}`:undefined}>{r.name}</strong>{r.kitQuantity>0&&<small>Kit Qty: {pretty(r.kitQuantity)}</small>}</div>{r.mismatch&&<small className="pr-pt-warning">Historical warehouse receipt exceeds passed testing; review before handover.</small>}</div>
       <div className="pr-pt-required"><span>Required</span><strong>{pretty(r.required)}</strong></div>
      </div>
      <div className="pr-pt-metrics">
       {metrics.map(field=>{
        const isRemaining=field.key==="remaining";
        const current=isRemaining?Math.max(0,n(isEditing?v.received:r.received)-n(isEditing?v.passed:r.passed)):r[field.key];
        return <label key={field.key} className={`pr-pt-metric pr-pt-metric--${field.key}`}>
         <span>{field.label}</span>
         {isEditing&&!isRemaining?<StageQuantityInput min="0" step="1" aria-label={`${field.aria} ${r.name}`} disabled={busy} value={v[field.key]??""} onValueChange={value=>change(r.id,field.key,value)}/>
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
    <div className="pr-pt-export-body"><div className="pr-pt-export-summary">{exportColumns.length} columns selected <span aria-hidden="true">·</span> {exportGroups.length||allGroups.length} kit groups</div>
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
