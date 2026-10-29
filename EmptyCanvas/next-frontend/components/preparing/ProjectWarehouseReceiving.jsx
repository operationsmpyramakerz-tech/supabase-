"use client";
import { useEffect, useMemo, useState } from "react";
import { warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit,demandsForSchool,projectRequired } from "../../lib/preparing-warehouse-math.mjs";
import {WAREHOUSE_COLUMNS,warehouseGroups,warehouseExportValue} from "../../lib/preparing-warehouse-view.mjs";
const number=v=>Number(v)||0;
const pretty=v=>number(v).toLocaleString("en-US");
const safeCSV=v=>{const raw=String(v??"");const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
const date=v=>new Date(v).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});
const empty={schools:[],items:[],demands:[],receipts:[],receiptLines:[],allocations:[],testingBalances:[]};
export default function ProjectWarehouseReceiving({projectId,projectName,hasProjectProposal=false,canReceive,canAllocate,request,onClose}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("receiving"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [showExport,setShowExport]=useState(false),[exportColumns,setExportColumns]=useState(WAREHOUSE_COLUMNS.map(c=>c.key)),[exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
 const [expandedKit,setExpandedKit]=useState(null);
 const [reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [editing,setEditing]=useState({}),[clearConfirm,setClearConfirm]=useState(null),[rowError,setRowError]=useState({});
 const [draft,setDraft]=useState({}),[schoolId,setSchoolId]=useState(""),[assignReference,setAssignReference]=useState(""),[assignNotes,setAssignNotes]=useState(""),[assignDraft,setAssignDraft]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 async function reload(){const response=await request(`/warehouse?projectId=${encodeURIComponent(projectId)}`);setState(response);setLoading(false);}
 useEffect(()=>{let active=true;request(`/warehouse?projectId=${encodeURIComponent(projectId)}`).then(v=>{if(active){setState(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[projectId]);
 const summaries=useMemo(()=>warehouseReceivingBalances(warehouseTotals((state.items||[]).map(row=>({...row,required_qty:projectRequired(Number(row.required_qty||0),(state.schools||[]).length)})),state.receiptLines||[],state.allocations||[]),state.testingBalances||[]),[state]);
 const nameById=useMemo(()=>new Map(state.items.map(row=>[row.id,row.product_name])),[state]);
 const receivedById=useMemo(()=>{
  const result=new Map();
  for(const receipt of [...state.receipts].reverse()){
   if(!receipt.created_by_name)continue;
   for(const line of state.receiptLines.filter(l=>l.receipt_id===receipt.id)){
    if(!result.has(line.item_id))result.set(line.item_id,new Map());
    result.get(line.item_id).set(receipt.created_by_id,{id:receipt.created_by_id,name:receipt.created_by_name});
   }
  }
  return result;
 },[state.receipts,state.receiptLines]);
 const schoolsCaptured=new Set(state.demands.map(row=>row.school_id));
 const uncaptured=state.schools.filter(row=>!schoolsCaptured.has(row.id));
 const totals=useMemo(()=>summaries.reduce((sum,row)=>({required:sum.required+number(row.required_qty),accepted:sum.accepted+row.accepted,damaged:sum.damaged+row.damaged,allocated:sum.allocated+row.allocated,available:sum.available+row.available,passed:sum.passed+row.passed,readyToReceive:sum.readyToReceive+row.readyToReceive}),{required:0,accepted:0,damaged:0,allocated:0,available:0,passed:0,readyToReceive:0}),[summaries]);
 const shown=useMemo(()=>summaries.filter(row=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(search.toLowerCase().trim())).filter(row=>filter==="short"?row.accepted<row.required_qty:filter==="available"?row.readyToReceive>0:true),[summaries,search,filter]);
 const schoolDemands=useMemo(()=>demandsForSchool(state.demands,state.allocations,schoolId),[state.demands,state.allocations,schoolId]);
 const demandsMap=useMemo(()=>new Map(schoolDemands.map(row=>[row.item_id,row])),[schoolDemands]);
 const schoolShown=shown.filter(row=>demandsMap.has(row.id));
 const allGroups=useMemo(()=>warehouseGroups(summaries,state.kitGroups),[summaries,state.kitGroups]);
 const shownGroups=useMemo(()=>warehouseGroups(shown,state.kitGroups),[shown,state.kitGroups]);
 const historyEntries=useMemo(()=>state.receipts.flatMap(receipt=>state.receiptLines.filter(line=>line.receipt_id===receipt.id).map(line=>({key:line.id,receipt,line,component:nameById.get(line.item_id)||"Component"}))),[state.receipts,state.receiptLines,nameById]);
 async function execute(action,payload) {
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try {await request("/warehouse","POST",{action,projectId,...payload});await reload();setSuccess(action==="capture"?"Project BOM captured.":action==="receive"?"Warehouse voucher recorded.":"School allocation recorded.");return true;}
  catch(e){setError(e.message||"Unable to save.");return false;}finally{setBusy(false);}
 }
 function enableReceipt(row){
  setError("");setClearConfirm(null);
  setDraft(prev=>({...prev,[row.id]:String(row.accepted)}));
  setEditing(prev=>({...prev,[row.id]:true}));
 }
 function cancelReceipt(row){
  setEditing(prev=>{const next={...prev};delete next[row.id];return next;});
  setDraft(prev=>{const next={...prev};delete next[row.id];return next;});
 }
 async function saveReceipt(row){
  if(busy)return;
  let acceptedDelta;
  try{acceptedDelta=warehouseReceiptLimit(row.accepted,draft[row.id],row.passed,row.allocated);}
  catch(e){setRowError(old=>({...old,[row.id]:e.message}));return;}
  if(acceptedDelta===0){setRowError(old=>({...old,[row.id]:"Change the Received amount before saving."}));return;}
  const ok=await execute("receive",{kind:acceptedDelta<0?"adjustment":"receipt",lines:[{itemId:row.id,accepted:acceptedDelta}]});
  if(ok){cancelReceipt(row);setRowError(old=>({...old,[row.id]:""}));}
 }
 async function clearReceipt(row){
  if(row.accepted<=0){setClearConfirm(null);return;}
  if(await execute("receive",{kind:"adjustment",lines:[{itemId:row.id,accepted:-row.accepted}]})){
   cancelReceipt(row);setClearConfirm(null);
  }
 }
 async function allocateBatch(){
  if(!schoolId||!assignReference.trim()){setError("Select a school and enter the internal allocation reference.");return;}
  const lines=Object.entries(assignDraft).filter(([,value])=>String(value).trim()!=="" && Number(value)!==0)
    .map(([itemId,value])=>({itemId,delta:Number(value)}));
  if(!lines.length){setError("Enter at least one assignment quantity.");return;}
  if(lines.some(line=>{const row=summaries.find(r=>r.id===line.itemId),d=demandsMap.get(line.itemId);
   return !row||!d||!Number.isSafeInteger(line.delta)||Math.abs(line.delta)>1000000||d.allocated+line.delta<0||d.allocated+line.delta>d.required_qty||line.delta>row.available;})){
    setError("One or more assignments exceed available project stock or school requirements.");return;
  }
  if(await execute("allocate_batch",{schoolId,reference:assignReference,notes:assignNotes,lines}))setAssignDraft({});
 }
 async function allocateItem(row){
  const d=Number(assignDraft[row.id]||0),r=demandsMap.get(row.id);
  if(!schoolId||!assignReference.trim()){setError("Select a school and enter the internal allocation reference.");return;}
  if(!Number.isSafeInteger(d)||!d||Math.abs(d)>1000000||d>row.available||r.allocated+d>r.required_qty||r.allocated+d<0){setError("Allocation must stay within accepted stock and this school's requirement.");return;}
  if(await execute("allocate",{schoolId,itemId:row.id,delta:d,reference:assignReference,notes:assignNotes}))
    setAssignDraft(prev=>({...prev,[row.id]:""}));
 }
 const exportSelected=()=>allGroups.filter(g=>!exportGroups.length||exportGroups.includes(g.key));
 function exportCSV(blank){
  const rows=[["Kit Tag",...exportColumns.map(k=>WAREHOUSE_COLUMNS.find(c=>c.key===k).label)]];
  for(const group of exportSelected())for(const row of group.items){
   rows.push([group.name,...exportColumns.map(key=>warehouseExportValue({...row,receivedBy:[...(receivedById.get(row.id)?.values()||[])]},key,blank))]);
  }
  const content="\uFEFF"+rows.map(r=>r.map(safeCSV).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=`warehouse-${blank?"blank":"received"}-${projectId}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setShowExport(false);
 }
 async function exportPDF(blank){
  if(exportBusy)return;setExportBusy(true);setError("");
  try{
   const resp=await fetch("/next/api/projects-preparing/warehouse/export",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({projectId,columns:exportColumns,groupKeys:exportGroups,blank})});
   if(!resp.ok){const data=await resp.json().catch(()=>({}));throw Error(data.error||"Unable to export warehouse PDF.");}
   const url=URL.createObjectURL(await resp.blob()),a=document.createElement("a");a.href=url;a.download=`warehouse-${blank?"blank":"received"}-${projectId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);setShowExport(false);
  }catch(e){setError(e.message);}finally{setExportBusy(false);}
 }
 const toggleColumn=key=>{if(key==="name")return;setExportColumns(old=>old.includes(key)?old.filter(v=>v!==key):WAREHOUSE_COLUMNS.filter(c=>old.includes(c.key)||c.key===key).map(c=>c.key));};
 const toggleGroup=key=>setExportGroups(old=>{const all=allGroups.map(g=>g.key),current=old.length?old:all,updated=current.includes(key)?current.filter(k=>k!==key):all.filter(k=>current.includes(k)||k===key);return !updated.length?old:updated.length===all.length?[]:updated;});
 return <div className="pr-wh pr-wr-modern">
  <header className="pr-manifest-title pr-wh-title"><div><span className="pr-wh-overline">PROJECT INVENTORY · {projectName}</span><h3>Warehouse Receiving</h3></div><button type="button" className="pr-secondary" onClick={onClose}>Close</button></header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading warehouse records…</p>:<>
   <div className="pr-wh-stats">{[["Project Required",totals.required],["Passed Testing",totals.passed],["Received",totals.accepted],["Available to Receive",totals.readyToReceive],["Available for Schools",totals.available]].map(([label,value])=><div key={label}><span>{label}</span><strong>{pretty(value)}</strong></div>)}</div>
   <div className="pr-wh-navigation" role="group" aria-label="Warehouse view">
    {[["receiving","Warehouse Receiving"],["allocation","School Allocation"],["history","Movement History"]].map(([key,label])=><button type="button" key={key} className={tab===key?"is-active":""} onClick={()=>{setTab(key);setError("");}}>{label}</button>)}
    <button type="button" className="pr-wh-export" onClick={()=>setShowExport(true)} disabled={!state.items.length}>Export <span aria-hidden="true">⌄</span></button>
   </div>
   {uncaptured.length>0&&<div className="pr-wh-notice"><div><strong>{uncaptured.length} school(s) need requirement capture</strong><small>{hasProjectProposal?"Capture each school’s Proposal for school allocation limits. This does not modify the project Master BOM or warehouse receipts.":"Capture linked school Proposals to calculate legacy project requirements. Existing school baselines stay frozen."}</small></div>{canReceive&&<button className="pr-primary" disabled={busy} onClick={()=>execute("capture",{})}>{busy?"Capturing…":hasProjectProposal?"Capture School Requirements":"Capture Project BOM"}</button>}</div>}
   {!!state.items.length&&<div className="pr-wh-toolbar"><label className="pr-search"><input aria-label="Search warehouse components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Warehouse filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All components</option><option value="short">Warehouse shortage</option><option value="available">Available to Receive</option></select><button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setLoading(true);reload().catch(e=>{setLoading(false);setError(e.message);});}}>Refresh</button></div>}
   {tab==="receiving"&&<div className="pr-wh-list pr-wr-list" aria-label="Master project components by Kit">{shownGroups.map((group,index)=>{
    const open=!!search.trim()||(expandedKit===null?index===0:expandedKit===group.key);
    return <section className={`pr-pt-kit-group${open?" is-open":""}`} key={group.key}>
     <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setExpandedKit(open?"__none__":group.key)}><span className="pr-pt-kit-emblem" aria-hidden="true">▤</span><span className="pr-pt-kit-title"><strong>{group.name}</strong><small>{group.items.length} components</small></span><span className="pr-pt-kit-arrow" aria-hidden="true">{open?"⌃":"⌄"}</span></button>
     {open&&<div className="pr-pt-kit-body">{group.items.map(row=>{
      const active=!!editing[row.id],people=[...(receivedById.get(row.id)?.values()||[])];
      return <article className={`pr-wr-row${active?" is-editing":""}`} key={`${group.key}-${row.id}`}>
       <div className="pr-wr-heading"><div className="pr-wr-name"><strong>{row.product_name}</strong><small>{row.product_id?`#${row.product_id}`:"No component code"}{row.kitQuantity>0?` · Kit Qty: ${pretty(row.kitQuantity)}`:""}</small></div><span className="pr-wr-required">Required <b>{pretty(row.required_qty)}</b></span></div>
       <div className="pr-wr-metrics"><div className="pr-wr-stat"><span>Received</span>{active?<input type="number" step="1" min="0" aria-label={`Received ${row.product_name}`} disabled={busy} value={draft[row.id]??""} max={Math.max(row.accepted,row.passed)} onChange={e=>{setDraft(prev=>({...prev,[row.id]:e.target.value}));setRowError(prev=>({...prev,[row.id]:""}));}}/>:<strong>{pretty(row.accepted)}</strong>}</div>
       <div className="pr-wr-stat"><span>Passed Testing</span><strong>{pretty(row.passed)}</strong></div>
       <div className="pr-wr-stat"><span>Allocated</span><strong>{pretty(row.allocated)}</strong></div>
       <div className="pr-wr-stat"><span>Available to Receive</span><strong>{pretty(active?Math.max(0,row.passed-(Number(draft[row.id])||0)):row.readyToReceive)}</strong></div>
       {!active&&<div className="pr-wr-stat pr-wr-person"><span>Received By</span><div className="pr-wr-people">{people.length?people.map(person=><span key={person.id}>{person.name}</span>):<em>—</em>}</div></div>}
       <div className="pr-wr-actions">{canReceive&&(active?<><button className="pr-secondary" type="button" disabled={busy} onClick={()=>cancelReceipt(row)}>Cancel</button><button className="pr-primary" type="button" disabled={busy} onClick={()=>saveReceipt(row)}>Save</button></>:<><button className="pr-secondary" type="button" disabled={busy} onClick={()=>enableReceipt(row)}>Edit</button>{row.accepted>0&&<button className="pr-wr-erase" type="button" disabled={busy} title="Reverse received balance without deleting audit history" onClick={()=>setClearConfirm(row)}>Clear</button>}</>)}</div></div>
       {rowError[row.id]&&<p className="pr-wr-inline-error" role="alert">{rowError[row.id]}</p>}
       {clearConfirm?.id===row.id&&<div className="pr-wr-confirm"><strong>Reverse all Received units?</strong><small>This records a signed correction. Existing vouchers are never deleted. Allocated quantities cannot be reversed.</small><button type="button" className="pr-secondary" onClick={()=>setClearConfirm(null)}>Cancel</button><button type="button" className="pr-wr-erase" disabled={busy} onClick={()=>clearReceipt(row)}>Confirm reversal</button></div>}
      </article>;
     })}</div>}
    </section>;
   })}{!shownGroups.length&&<div className="pr-wh-empty">No matching project components.</div>}</div>}
   {tab==="allocation"&&<><div className="pr-wh-school-select"><label>Beneficiary school<select value={schoolId} onChange={e=>{setSchoolId(e.target.value);setAssignDraft({});}}><option value="">Select school</option>{state.schools.filter(s=>schoolsCaptured.has(s.id)).map(s=><option value={s.id} key={s.id}>{s.beneficiary_name}</option>)}</select></label>{canAllocate&&<label>Allocation reference<input placeholder="INT-0001" maxLength={160} value={assignReference} onChange={e=>setAssignReference(e.target.value)}/></label>}{canAllocate&&<label>Notes<input placeholder="Optional" maxLength={1000} value={assignNotes} onChange={e=>setAssignNotes(e.target.value)}/></label>}</div>{schoolId&&canAllocate&&<div className="pr-wh-voucher-bottom"><small>Enter quantities below to assign multiple items in one verified transaction.</small><button type="button" className="pr-primary" disabled={busy} onClick={allocateBatch}>Save School Allocation</button></div>}{schoolId?<div className="pr-wh-list" aria-label="School component allocations">{schoolShown.map(row=>{const demand=demandsMap.get(row.id);return <div key={row.id} className="pr-wh-item"><div className="pr-wh-component-name"><strong>{row.product_name}</strong><small>{row.product_id||"Uncoded component"}</small></div><div className="pr-wh-item-figures"><span><small>School required</small><b>{pretty(demand.required_qty)}</b></span><span><small>Assigned</small><b>{pretty(demand.allocated)}</b></span><span><small>Still needed</small><b>{pretty(Math.max(0,demand.required_qty-demand.allocated))}</b></span><span><small>Warehouse available</small><b>{pretty(row.available)}</b></span></div>{canAllocate&&<div className="pr-wh-assign"><input aria-label={`Allocate ${row.product_name}`} type="number" step="1" placeholder="+ / − qty" value={assignDraft[row.id]??""} onChange={e=>setAssignDraft(s=>({...s,[row.id]:e.target.value}))}/><button type="button" className="pr-secondary" disabled={busy} onClick={()=>allocateItem(row)}>Assign</button></div>}</div>;})}{!schoolShown.length&&<div className="pr-wh-empty">No matching school items.</div>}</div>:<div className="pr-wh-empty">Select a school to view and allocate its component requirements.</div>}</>}
   {tab==="history"&&<section className="pr-wr-history" aria-label="Warehouse movement audit history">
    <div className="pr-pt-history-heading"><div><h4>Receiving History</h4><p>Every change is retained as a separate transaction.</p></div><span className="pr-pt-history-count">{historyEntries.length} changes</span></div>
    <div className="pr-pt-history-grid">{historyEntries.map(({key,receipt,line,component})=><article className="pr-pt-history-card" key={key}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{(receipt.created_by_name||"?").slice(0,1).toUpperCase()}</span><div className="pr-pt-history-person"><strong>{receipt.created_by_name||"Historical record (name not available)"}</strong><span>{date(receipt.created_at)}</span></div><span className="pr-pt-history-label">{receipt.kind==="adjustment"?"Corrected":"Received"}</span></div>
     <div className="pr-pt-history-component"><strong>{component}</strong><span>{receipt.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Received change<strong>{line.accepted_delta>0?"+":""}{pretty(line.accepted_delta)}</strong></span><span>Transaction<strong>{receipt.kind}</strong></span></div>
     {line.damaged_delta!==0&&<p className="pr-pt-history-note">Historical damaged entry: {pretty(line.damaged_delta)} (read-only)</p>}
     {receipt.notes&&<p className="pr-pt-history-note">{receipt.notes}</p>}
    </article>)}{!historyEntries.length&&<div className="pr-wh-empty">No receiving movements recorded yet.</div>}</div>
    <div className="pr-pt-history-heading"><h4>School Allocations</h4><span className="pr-pt-history-count">{state.allocations.length} movements</span></div>
    <div className="pr-pt-history-grid">{state.allocations.map(row=><article key={row.id} className="pr-pt-history-card"><div className="pr-pt-history-component"><strong>{state.schools.find(s=>s.id===row.school_id)?.beneficiary_name||"School"}</strong><span>{date(row.created_at)} · {row.reference}</span></div><div className="pr-pt-history-component"><strong>{nameById.get(row.item_id)||"Component"}</strong><span>{row.delta_qty>0?"+":""}{pretty(row.delta_qty)} allocated</span></div>{row.notes&&<p className="pr-pt-history-note">{row.notes}</p>}</article>)}</div>
   </section>}
  </>}
  {showExport&&<div className="pr-pt-export-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!exportBusy)setShowExport(false);}}><section className="pr-pt-export-modal" role="dialog" aria-modal="true" aria-label="Export warehouse receiving">
   <header className="pr-pt-export-head"><div><strong>Export Warehouse Receiving</strong><small>Choose columns, Kits, and format</small></div><button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>setShowExport(false)}>×</button></header>
   <div className="pr-pt-export-body"><div className="pr-pt-export-section-head"><strong>Columns</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportColumns(WAREHOUSE_COLUMNS.map(c=>c.key))}>Select all</button></div><div className="pr-pt-export-checks">{WAREHOUSE_COLUMNS.map(c=><label key={c.key} className="pr-pt-export-check"><input type="checkbox" checked={exportColumns.includes(c.key)} disabled={c.fixed} onChange={()=>toggleColumn(c.key)}/><span>{c.label}</span></label>)}</div>
   <div className="pr-pt-export-section-head"><strong>Kit groups</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportGroups([])}>All Kits</button></div><div className="pr-pt-export-kits">{allGroups.map(g=><label key={g.key} className="pr-pt-export-check"><input type="checkbox" checked={!exportGroups.length||exportGroups.includes(g.key)} onChange={()=>toggleGroup(g.key)}/><span>{g.name}</span></label>)}</div><div className="pr-pt-export-info">Blank forms keep component names and requirements; receiving counts, user names, and signatures are empty for handwritten receiving.</div></div>
   <footer className="pr-pt-export-actions"><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(false)}>CSV · Values</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(true)}>CSV · Blank</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportPDF(false)}>PDF · Values</button><button className="pr-primary" type="button" disabled={exportBusy} onClick={()=>exportPDF(true)}>PDF · Blank</button></footer>
  </section></div>}
 </div>;
}
