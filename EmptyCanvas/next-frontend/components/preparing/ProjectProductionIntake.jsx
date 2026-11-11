"use client";
import StageFilterTabs from "./StageFilterTabs";
import StageQuantityInput from "./StageQuantityInput";
import {useEffect,useMemo,useState} from "react";
import {testingChange,testingCoverage,testingCoverageTotals} from "../../lib/preparing-project-testing-math.mjs";
import {testingGroups,TESTING_EXPORT_COLUMNS,testingExportValue} from "../../lib/preparing-project-testing-grouping.mjs";

const n=value=>Number(value)||0;
const pretty=value=>n(value).toLocaleString("en-US");
const csvCell=value=>{const s=String(value??"");return `"${(/^[\s]*[=+@-]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;};
const initial={items:[],history:[],kitGroups:[]};
const metrics=[
 {key:"tested",label:"Received",aria:"Received quantity"},
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
  engineer:<><path d="M4 10h16M7 10V8a5 5 0 0 1 10 0v2M12 3v4M8 11.5a4 4 0 0 0 8 0M8 16l-4 2v4h16v-4l-4-2M9 17l3 3 3-3"/></>,
  document:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6"/></>,
  edit:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8"/></>,
  expand:<><path d="M14 4h6v6M20 4l-8 8M20 14v6H4V4h6"/></>,
  arrowLeft:<path d="m14 5-7 7 7 7"/>,
  arrowRight:<path d="m10 5 7 7-7 7"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

function EditorAvatars({people=[]}){
 if(!people.length)return <span className="pr-intake-no-editors" aria-label="No recorded editors">—</span>;
 const visible=people.slice(0,3);
 return <div className="pr-intake-editors" aria-label={`Edited by ${people.map(person=>person.name).join(", ")}`}>
  {visible.map(person=><span className="pr-intake-avatar" key={person.id} title={person.name}>
   <span aria-hidden="true">{String(person.name||"?").trim().slice(0,1).toUpperCase()}</span>
   {person.photoUrl&&<img src={person.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}
  </span>)}
  {people.length>3&&<span className="pr-intake-avatar pr-intake-avatar-more" title={people.slice(3).map(person=>person.name).join(", ")}>+{people.length-3}</span>}
 </div>;
}
function ComponentThumbnail({row,onOpen}){
 const image=row.imageUrls?.[0];
 return image?<button type="button" className="pr-intake-thumb" title={`View photo: ${row.name}`} aria-label={`View image of ${row.name}`} onClick={()=>onOpen(row)}><img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("is-broken");}}/><span className="pr-intake-thumb-expand"><TestingIcon name="expand" size={12}/></span></button>:
 <span className="pr-intake-thumb pr-intake-thumb-empty" title="No component photo available" aria-label="No component photo available"><TestingIcon name="box" size={18}/></span>;
}
export default function ProjectProductionIntake({projectId,projectName,canTest,editTabs={},request,onClose,closurePanel}) {
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("testing"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const canEditTab = canTest && editTabs[filter] !== false;
 const [expandedKit,setExpandedKit]=useState(null),[showExport,setShowExport]=useState(false);
 const [preview,setPreview]=useState(null),[previewIndex,setPreviewIndex]=useState(0);
 const [exportColumns,setExportColumns]=useState(TESTING_EXPORT_COLUMNS.map(c=>c.key));
 const [exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
 const [draft,setDraft]=useState({}),[editing,setEditing]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[rowError,setRowError]=useState({});
 const load=async()=>{const result=await request(`/intake?projectId=${encodeURIComponent(projectId)}`);setData({items:result.items||[],history:result.history||[],kitGroups:result.kitGroups||[]});};
 useEffect(()=>{let mounted=true;
  request(`/intake?projectId=${encodeURIComponent(projectId)}`)
   .then(result=>{if(mounted)setData({items:result.items||[],history:result.history||[],kitGroups:result.kitGroups||[]});})
   .catch(e=>{if(mounted)setError(e.message||"Unable to load testing.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[projectId]);
 const totals=useMemo(()=>testingCoverageTotals(data.items||[]),[data.items]);
 const shown=useMemo(()=>(data.items||[])
  .filter(r=>`${r.name||""} ${r.code||""}`.toLowerCase().includes(search.trim().toLowerCase()))
  .filter(r=>filter==="pending"?testingCoverage(r).remaining>0:filter==="received"?testingCoverage(r).tested>0:true),
 [data.items,search,filter]);
 const allGroups=useMemo(()=>testingGroups(data.items,data.kitGroups),[data.items,data.kitGroups]);
 const groupedShown=useMemo(()=>testingGroups(shown,data.kitGroups).filter(group=>group.items.length),[shown,data.kitGroups]);
 const edit=r=>{
  setEditing(old=>({...old,[r.id]:true}));
  setDraft(old=>({...old,[r.id]:{tested:String(testingCoverage(r).tested)}}));
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
  }}catch(e){fail(e.message.replaceAll("Tested", "Received").replace("already received by the warehouse", "already tested"));return;}
  if(!lines.length){fail("Change at least one received quantity before saving.");return;}
  setBusy(true);setError("");setSuccess("");setRowError({});
  try{
   await request("/intake","POST",{projectId,editTab:filter,lines});
   // Save and refresh are separate. Never describe a committed save as failed on refresh errors.
   const savedIds=new Set(lines.map(line=>line.itemId));
   setEditing(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setDraft(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setRowError(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!savedIds.has(id))));
   setSuccess(`Saved ${lines.length} component(s). Your ERP user is recorded in Receiving History.`);
   try{await load();}catch{setError("Saved successfully, but the latest values could not be refreshed. Reopen Production Receiving to reload them.");}
  }catch(e){fail(e.message||"Unable to save receiving results.");}
  finally{setBusy(false);}
 }
 const selectedExportGroups=()=>allGroups.filter(g=>!exportGroups.length||exportGroups.includes(g.key));
 function exportCSV(blank=false){
  if(!exportColumns.includes("name"))return;
  const headers=["Kit Tag",...exportColumns.map(key=>TESTING_EXPORT_COLUMNS.find(col=>col.key===key).label.replace("Tested", "Received"))];
  const rows=[headers];
  for(const group of selectedExportGroups()){
   for(const row of group.items)rows.push([group.name,...exportColumns.map(key=>testingExportValue(row,key,blank))]);
  }
  const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`production-intake-${blank?"blank":"results"}-${projectId}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  setShowExport(false);
 }
 async function exportPDF(blank){
  if(exportBusy||!exportColumns.includes("name"))return;
  setExportBusy(true);setError("");
  try{
   const response=await fetch("/next/api/projects-preparing/intake/export",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,projectName,columns:exportColumns,blank,groupKeys:exportGroups})});
   if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||`PDF export failed (${response.status}).`);}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`production-intake-${blank?"blank":"results"}-${projectId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
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
 useEffect(()=>{
  if(!preview)return;
  const onKey=event=>{
   if(event.key==="Escape")setPreview(null);
   if(event.key==="ArrowRight")setPreviewIndex(index=>(index+1)%(preview.imageUrls?.length||1));
   if(event.key==="ArrowLeft")setPreviewIndex(index=>(index+(preview.imageUrls?.length||1)-1)%(preview.imageUrls?.length||1));
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[preview]);
 const showPreview=row=>{setPreview(row);setPreviewIndex(0);};
 const percent=totals.required>0?Math.min(100,Math.max(0,(totals.tested/totals.required)*100)):0;
 const byId=useMemo(()=>new Map(data.items.map(r=>[r.id,r.name])),[data.items]);
 const entries=useMemo(()=>(data.history||[]).flatMap(batch=>(batch.lines||[]).map((line,index)=>({
  key:`${batch.id}-${line.itemId}-${index}`,reference:batch.reference,createdAt:batch.createdAt,
  editor:batch.createdByName||"",legacy:!batch.createdByName,notes:batch.notes,
  component:byId.get(line.itemId)||"Component",line,
 }))),[data.history,byId]);
 return <div className="pr-wh pr-pt pr-pt-modern pr-intake-v401">
  <header className="pr-manifest-title pr-wh-title pr-pt-title">
   <div className="pr-intake-heading"><TestingIcon name="engineer" size={48}/><div><span className="pr-wh-overline">Projects Preparing <span className="pr-pt-overline-sep">›</span> {projectName} <span className="pr-pt-overline-sep">›</span> Production Receiving</span><h3>Production Receiving</h3><p>Receive components from production to move them to the testing stage.</p></div></div>
   <button type="button" className="pr-pt-close" onClick={onClose} aria-label="Close Production Receiving" title="Close"><TestingIcon name="close" size={19}/></button>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading receiving records…</p>:<>
   <div className="pr-intake-summary">
    <div className="pr-intake-progress" aria-label={`Project receiving progress ${percent.toFixed(2)}%`}>
     <div className="pr-intake-progress-title"><span>Project Progress</span><strong>{percent.toFixed(2)}%</strong></div>
     <div className="pr-intake-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(2))} aria-label="Received quantities"><span style={{width:`${percent}%`}}/></div>
     <strong className="pr-intake-progress-numbers">{pretty(totals.tested)} / {pretty(totals.required)}</strong>
    </div>
    <div className="pr-intake-signoff">{closurePanel}</div>
   </div>
   <StageFilterTabs label="Receiving component status" options={[{value:"all",label:"All Components"},{value:"pending",label:"Remaining to Receive"},{value:"received",label:"Received"}]} value={tab==="testing"?filter:""} onChange={value=>{setFilter(value);setTab("testing");setEditing({});setDraft({});}}/>
   <div className="pr-stage-filter-toolbar pr-pt-toolbar">
    {tab==="testing"?<label className="pr-search pr-pt-search"><TestingIcon name="search" size={18}/><input type="search" aria-label="Search receiving components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="pr-pt-clear-search" onClick={()=>setSearch("")} aria-label="Clear search" title="Clear search"><TestingIcon name="close" size={16}/></button>}</label>:<span className="pr-stage-history-label">Receiving History</span>}
    <div className="pr-stage-filter-actions"><button type="button" aria-pressed={tab==="history"} aria-label={`Receiving History (${entries.length} changes)`} title={`Receiving History (${entries.length})`} className={`pr-pt-history-button${tab==="history"?" is-active":""}`} onClick={()=>setTab(tab==="history"?"testing":"history")}><TestingIcon name="history" size={19}/></button><button type="button" className="pr-pt-download-button" aria-label="Download receiving report" onClick={()=>setShowExport(true)} disabled={!data.items.length}><TestingIcon name="download" size={21}/></button></div>
   </div>
   {tab==="testing"&&<>
    <div className="pr-wh-list pr-pt-list pr-pt-kit-list" aria-label="Project component receiving">{groupedShown.map(group=>{
     const open=!!search.trim()||expandedKit===group.key;
     const appearance=testingKitAppearance(group.name);
     return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={group.key}>
      <button type="button" className="pr-pt-kit-heading" onClick={()=>setExpandedKit(open?"__none__":group.key)} aria-expanded={open}>
       <span className="pr-pt-kit-emblem" aria-hidden="true"><TestingIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{group.name}</strong></span>
       <span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
      </button>
      {open&&<div className="pr-pt-kit-body">{group.items.map(r=>{
     const isEditing=!!editing[r.id],v=draft[r.id]||{},coverage=testingCoverage(r);
     return <article key={r.id} className={`pr-pt-row pr-intake-component${isEditing?" is-editing":""}`}>
      <div className="pr-intake-component-main">
       <div className="pr-intake-component-product">
        <ComponentThumbnail row={r} onOpen={showPreview}/>
        <div className="pr-pt-name"><strong title={r.code?`Product code: ${r.code}`:undefined}>{r.name}</strong>{r.code&&<small>{r.code}</small>}{r.mismatch&&<small className="pr-pt-warning">Historical testing exceeds received quantity; review before continuing.</small>}</div>
       </div>
       {isEditing?<div className="pr-intake-receive-input"><label htmlFor={`pr-intake-qty-${r.id}`}>Received</label><StageQuantityInput id={`pr-intake-qty-${r.id}`} min="0" step="1" aria-label={`Received quantity ${r.name}`} disabled={busy} value={v.tested??""} onValueChange={value=>change(r.id,"tested",value)}/></div>:<>
        <div className="pr-intake-cell"><span>Required</span><strong>{pretty(coverage.required)}</strong></div>
        <div className="pr-intake-cell pr-intake-cell--received"><span>Received</span><strong>{pretty(coverage.tested)}</strong></div>
        <div className="pr-intake-cell"><span>Remaining</span><strong>{pretty(coverage.remaining)}</strong></div>
        <EditorAvatars people={r.testedBy||[]}/>
       </>}
       <div className="pr-intake-row-actions">{canEditTab&&(isEditing?<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>cancel(r.id)}>Cancel</button><button type="button" className="pr-primary" disabled={busy} onClick={()=>save([r.id])}>{busy?"Saving…":"Save"}</button></>:<button type="button" className="pr-intake-edit-icon" aria-label={`Edit ${r.name}`} title={`Edit ${r.name}`} disabled={busy} onClick={()=>edit(r)}><TestingIcon name="edit" size={19}/></button>)}</div>
      </div>
      {rowError[r.id]&&<p className="pr-pt-inline-error" role="alert">{rowError[r.id]}</p>}
     </article>;
    })}</div>}</section>;
    })}{!groupedShown.length&&<div className="pr-wh-empty">No receiving components match this view.</div>}</div>
   </>}
   {tab==="history"&&<section className="pr-wh-history pr-pt-history" aria-label="Receiving change history">
    <div className="pr-pt-history-heading"><div><h4>Receiving Activity</h4><p>One audit card for every saved component change.</p></div><span className="pr-pt-history-count">{entries.length} changes</span></div>
    <div className="pr-pt-history-grid">{entries.map(record=><article className="pr-pt-history-card" key={record.key}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{record.editor?record.editor.slice(0,1).toUpperCase():"?"}</span><div className="pr-pt-history-person"><strong>{record.editor||"Legacy record (name not recorded)"}</strong><span>{dateText(record.createdAt)}</span></div><span className="pr-pt-history-label">Saved</span></div>
     <div className="pr-pt-history-component"><strong>{record.component}</strong><span title={record.reference}>{record.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Tested <strong className="pr-pt-pass">{delta(record.line.testedDelta)}</strong></span></div>
     {record.notes&&<p className="pr-pt-history-note">{record.notes}</p>}
     {record.legacy&&record.line.technicianName&&<p className="pr-pt-history-note">Historical technician entry: {record.line.technicianName}</p>}
    </article>)}{!entries.length&&<div className="pr-wh-empty">No receiving records yet.</div>}</div>
   </section>}
  </>}
  {preview&&<div className="pr-intake-lightbox" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPreview(null);}}>
   <section className="pr-intake-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`Component photo: ${preview.name}`}>
    <header><div><strong>{preview.name}</strong><small>{preview.code||"Component"} · {previewIndex+1} / {preview.imageUrls?.length||1}</small></div><button type="button" className="pr-intake-lightbox-close" aria-label="Close photo preview" onClick={()=>setPreview(null)}><TestingIcon name="close" size={21}/></button></header>
    <div className="pr-intake-lightbox-body">
     {(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Previous image" onClick={()=>setPreviewIndex(i=>(i+preview.imageUrls.length-1)%preview.imageUrls.length)}><TestingIcon name="arrowLeft" size={22}/></button>}
     <img src={preview.imageUrls[previewIndex]} alt={`${preview.name} — photo ${previewIndex+1}`}/>
     {(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Next image" onClick={()=>setPreviewIndex(i=>(i+1)%preview.imageUrls.length)}><TestingIcon name="arrowRight" size={22}/></button>}
    </div>
   </section>
  </div>}
  {showExport&&<div className="pr-pt-export-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!exportBusy)setShowExport(false);}}>
   <section className="pr-pt-export-modal" role="dialog" aria-modal="true" aria-label="Export production receiving">
    <header className="pr-pt-export-head"><div><strong>Export Receiving</strong><small>Choose columns, Kits and report format</small></div><button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>setShowExport(false)} aria-label="Close export">×</button></header>
    <div className="pr-pt-export-body"><div className="pr-pt-export-summary">{exportColumns.length} columns selected <span aria-hidden="true">·</span> {exportGroups.length||allGroups.length} kit groups</div>
     <div className="pr-pt-export-section-head"><strong>Columns</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportColumns(TESTING_EXPORT_COLUMNS.map(c=>c.key))}>Select all</button></div>
     <div className="pr-pt-export-checks">{TESTING_EXPORT_COLUMNS.map(col=><label key={col.key} className="pr-pt-export-check"><input type="checkbox" checked={exportColumns.includes(col.key)} disabled={col.fixed} onChange={()=>toggleColumn(col.key)}/><span>{col.label.replace("Tested", "Received")}</span></label>)}</div>
     <div className="pr-pt-export-section-head"><strong>Kit groups</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportGroups([])}>All Kits</button></div>
     <div className="pr-pt-export-kits">{allGroups.map(group=><label key={group.key} className="pr-pt-export-check"><input type="checkbox" checked={!exportGroups.length||exportGroups.includes(group.key)} onChange={()=>toggleGroup(group.key)}/><span>{group.name}</span></label>)}</div>
     <div className="pr-pt-export-info">Blank physical sheets include component names and required quantities; received quantities, Received By and Signature remain empty for handwriting.</div>
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
