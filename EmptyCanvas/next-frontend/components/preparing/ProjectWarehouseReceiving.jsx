"use client";
import StageFilterTabs from "./StageFilterTabs";
import StageQuantityInput from "./StageQuantityInput";
import { useEffect, useMemo, useState } from "react";
import { warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit,projectRequired } from "../../lib/preparing-warehouse-math.mjs";
import {WAREHOUSE_COLUMNS,warehouseGroups,warehouseExportValue} from "../../lib/preparing-warehouse-view.mjs";
const number=v=>Number(v)||0;
const pretty=v=>number(v).toLocaleString("en-US");
const safeCSV=v=>{const raw=String(v??"");const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
const date=v=>new Date(v).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});
const empty={schools:[],items:[],demands:[],receipts:[],receiptLines:[],allocations:[],testingBalances:[]};
// Mirror the solid, category-specific Kit icons in Project Components.
// Icons are presentation-only; Kit identity and quantities remain untouched.
function warehouseKitAppearance(name){
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
function WarehouseIcon({name="box",size=20}){
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
  inbox:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

export default function ProjectWarehouseReceiving({projectId,projectName,hasProjectProposal=false,canReceive,request,onClose,closurePanel}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("receiving"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [showExport,setShowExport]=useState(false),[exportColumns,setExportColumns]=useState(WAREHOUSE_COLUMNS.map(c=>c.key)),[exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
 const [expandedKit,setExpandedKit]=useState(null);
 const [editing,setEditing]=useState({}),[clearConfirm,setClearConfirm]=useState(null),[rowError,setRowError]=useState({});
 const [draft,setDraft]=useState({});
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
 const totals=useMemo(()=>summaries.reduce((sum,row)=>({required:sum.required+number(row.required_qty),accepted:sum.accepted+row.accepted,damaged:sum.damaged+row.damaged,allocated:sum.allocated+row.allocated,available:sum.available+row.available,tested:sum.tested+row.tested,readyToReceive:sum.readyToReceive+row.readyToReceive}),{required:0,accepted:0,damaged:0,allocated:0,available:0,tested:0,readyToReceive:0}),[summaries]);
 const shown=useMemo(()=>summaries.filter(row=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(search.toLowerCase().trim())).filter(row=>filter==="short"?row.accepted<row.required_qty:filter==="available"?row.readyToReceive>0:true),[summaries,search,filter]);
 const allGroups=useMemo(()=>warehouseGroups(summaries,state.kitGroups),[summaries,state.kitGroups]);
 const shownGroups=useMemo(()=>warehouseGroups(shown,state.kitGroups),[shown,state.kitGroups]);
 const historyEntries=useMemo(()=>state.receipts.flatMap(receipt=>state.receiptLines.filter(line=>line.receipt_id===receipt.id).map(line=>({key:line.id,receipt,line,component:nameById.get(line.item_id)||"Component"}))),[state.receipts,state.receiptLines,nameById]);
 async function execute(action,payload) {
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try {await request("/warehouse","POST",{action,projectId,...payload});await reload();setSuccess(action==="capture"?"Project BOM captured.":"Warehouse voucher recorded.");return true;}
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
  try{acceptedDelta=warehouseReceiptLimit(row.accepted,draft[row.id],row.tested,row.allocated);}
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
 return <div className="pr-wh pr-wr-modern pr-pt-modern pr-warehouse-parity">
  <header className="pr-manifest-title pr-wh-title pr-pt-title"><div><span className="pr-wh-overline">PROJECT INVENTORY · {projectName}</span><h3>Warehouse Receiving</h3></div><button type="button" className="pr-pt-close" aria-label="Close Warehouse Receiving" title="Close" onClick={onClose}><WarehouseIcon name="close" size={19}/></button></header>
  {closurePanel}
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading warehouse records…</p>:<>
   <div className="pr-wh-stats pr-pt-stat-grid" aria-label="Warehouse summary">{[["Project Required",totals.required,"required","◆"],["Received",totals.accepted,"received","↓"],["Available to Receive",totals.readyToReceive,"available","inbox"]].map(([label,value,key,mark])=><div className={`pr-pt-stat pr-pt-stat--${key}`} key={key}><span className="pr-pt-stat-icon" aria-hidden="true">{mark==="inbox"?<WarehouseIcon name="inbox" size={23}/>:mark}</span><span className="pr-pt-stat-copy"><span>{label}</span><strong>{pretty(value)}</strong></span></div>)}</div>
   <StageFilterTabs label="Warehouse component status" options={[{value:"all",label:"All Components"},{value:"short",label:"Warehouse Shortage"},{value:"available",label:"Available to Receive"}]} value={tab==="receiving"?filter:""} onChange={value=>{setFilter(value);setTab("receiving");setError("");}}/>
   <div className="pr-stage-filter-toolbar pr-pt-toolbar">{tab==="receiving"?<label className="pr-search pr-pt-search"><WarehouseIcon name="search" size={18}/><input type="search" aria-label="Search warehouse components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="pr-pt-clear-search" onClick={()=>setSearch("")} aria-label="Clear search" title="Clear search"><WarehouseIcon name="close" size={16}/></button>}</label>:<span className="pr-stage-history-label">Receiving History</span>}
    <div className="pr-stage-filter-actions"><button type="button" aria-pressed={tab==="history"} className={`pr-pt-history-button${tab==="history"?" is-active":""}`} aria-label={`Movement History (${historyEntries.length} changes)`} title={`Movement History (${historyEntries.length})`} onClick={()=>{setTab(tab==="history"?"receiving":"history");setError("");}}><WarehouseIcon name="history" size={19}/></button><button type="button" className="pr-pt-download-button" aria-label="Download warehouse report" onClick={()=>setShowExport(true)} disabled={!state.items.length}><WarehouseIcon name="download" size={18}/><span>Download</span></button></div>
   </div>
   {uncaptured.length>0&&<div className="pr-wh-notice"><div><strong>{uncaptured.length} school(s) need requirement capture</strong><small>{hasProjectProposal?"Capture each school’s Proposal to retain its requirement baseline. This does not modify the project Master BOM or warehouse receipts.":"Capture linked school Proposals to calculate legacy project requirements. Existing school baselines stay frozen."}</small></div>{canReceive&&<button className="pr-primary" disabled={busy} onClick={()=>execute("capture",{})}>{busy?"Capturing…":hasProjectProposal?"Capture School Requirements":"Capture Project BOM"}</button>}</div>}
   {tab==="receiving"&&<div className="pr-wh-list pr-wr-list pr-pt-kit-list" aria-label="Master project components by Kit">{shownGroups.map(group=>{
    const open=!!search.trim()||expandedKit===group.key;
    const appearance=warehouseKitAppearance(group.name);
    return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={group.key}>
     <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setExpandedKit(open?"__none__":group.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><WarehouseIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{group.name}</strong><small>{group.items.length} components</small></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
     {open&&<div className="pr-pt-kit-body">{group.items.map(row=>{
      const active=!!editing[row.id],people=[...(receivedById.get(row.id)?.values()||[])];
      return <article className={`pr-wr-row${active?" is-editing":""}`} key={`${group.key}-${row.id}`}>
       <div className="pr-wr-heading"><div className="pr-wr-name"><strong title={row.product_id?`Product code: ${row.product_id}`:undefined}>{row.product_name}</strong>{row.kitQuantity>0&&<small>Kit Qty: {pretty(row.kitQuantity)}</small>}</div><span className="pr-wr-required">Required <b>{pretty(row.required_qty)}</b></span></div>
       <div className="pr-wr-metrics">
        <div className="pr-wr-stat pr-wr-stat-available"><span>Available to Receive</span><strong>{pretty(active?Math.max(0,row.tested-(Number(draft[row.id])||0)):row.readyToReceive)}</strong></div>
        <div className="pr-wr-stat pr-wr-stat-received"><span>Received</span>{active?<StageQuantityInput step="1" min="0" aria-label={`Received ${row.product_name}`} disabled={busy} value={draft[row.id]??""} max={Math.max(row.accepted,row.tested)} onValueChange={value=>{setDraft(prev=>({...prev,[row.id]:value}));setRowError(prev=>({...prev,[row.id]:""}));}}/>:<strong>{pretty(row.accepted)}</strong>}</div>
        <div className="pr-wr-stat pr-wr-person"><span>Received By</span><div className="pr-wr-people">{people.length?people.map(person=><span key={person.id}>{person.name}</span>):<em>—</em>}</div></div>
        <div className="pr-wr-actions">{active?<><button className="pr-secondary" type="button" disabled={busy} onClick={()=>cancelReceipt(row)}>Cancel</button><button className="pr-primary" type="button" disabled={busy} onClick={()=>saveReceipt(row)}>Save</button></>:<><button className="pr-secondary" type="button" disabled={busy} title={!canReceive?"Enable Warehouse Receiving permission in Users Center":"Edit received quantity"} onClick={()=>{if(!canReceive){setRowError(old=>({...old,[row.id]:"Warehouse Receiving access is required. Ask an administrator to enable preparing.warehouse_receive in Users Center → Advanced Permissions."}));return;}enableReceipt(row);}}>Edit</button>{canReceive&&row.accepted>0&&<button className="pr-wr-erase" type="button" disabled={busy} title="Reverse received balance without deleting audit history" onClick={()=>setClearConfirm(row)}>Clear</button>}</>}</div>
       </div>
       {rowError[row.id]&&<p className="pr-wr-inline-error" role="alert">{rowError[row.id]}</p>}
       {clearConfirm?.id===row.id&&<div className="pr-wr-confirm"><strong>Reverse all Received units?</strong><small>This records a signed correction. Existing vouchers are never deleted. Allocated quantities cannot be reversed.</small><button type="button" className="pr-secondary" onClick={()=>setClearConfirm(null)}>Cancel</button><button type="button" className="pr-wr-erase" disabled={busy} onClick={()=>clearReceipt(row)}>Confirm reversal</button></div>}
      </article>;
     })}</div>}
    </section>;
   })}{!shownGroups.length&&<div className="pr-wh-empty">No matching project components.</div>}</div>}
   {tab==="history"&&<section className="pr-wr-history" aria-label="Warehouse movement audit history">
    <div className="pr-pt-history-heading"><div><h4>Receiving History</h4><p>Every change is retained as a separate transaction.</p></div><span className="pr-pt-history-count">{historyEntries.length} changes</span></div>
    <div className="pr-pt-history-grid">{historyEntries.map(({key,receipt,line,component})=><article className="pr-pt-history-card" key={key}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{(receipt.created_by_name||"?").slice(0,1).toUpperCase()}</span><div className="pr-pt-history-person"><strong>{receipt.created_by_name||"Historical record (name not available)"}</strong><span>{date(receipt.created_at)}</span></div><span className="pr-pt-history-label">{receipt.kind==="adjustment"?"Corrected":"Received"}</span></div>
     <div className="pr-pt-history-component"><strong>{component}</strong><span>{receipt.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Received change<strong>{line.accepted_delta>0?"+":""}{pretty(line.accepted_delta)}</strong></span><span>Transaction<strong>{receipt.kind}</strong></span></div>
     {line.damaged_delta!==0&&<p className="pr-pt-history-note">Historical damaged entry: {pretty(line.damaged_delta)} (read-only)</p>}
     {receipt.notes&&<p className="pr-pt-history-note">{receipt.notes}</p>}
    </article>)}{!historyEntries.length&&<div className="pr-wh-empty">No receiving movements recorded yet.</div>}</div>
   </section>}
  </>}
  {showExport&&<div className="pr-pt-export-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!exportBusy)setShowExport(false);}}><section className="pr-pt-export-modal" role="dialog" aria-modal="true" aria-label="Export warehouse receiving">
   <header className="pr-pt-export-head"><div><strong>Export Warehouse Receiving</strong><small>Choose columns, Kits, and format</small></div><button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>setShowExport(false)}>×</button></header>
   <div className="pr-pt-export-body"><div className="pr-pt-export-summary">{exportColumns.length} columns selected <span aria-hidden="true">·</span> {exportGroups.length||allGroups.length} kit groups</div><div className="pr-pt-export-section-head"><strong>Columns</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportColumns(WAREHOUSE_COLUMNS.map(c=>c.key))}>Select all</button></div><div className="pr-pt-export-checks">{WAREHOUSE_COLUMNS.map(c=><label key={c.key} className="pr-pt-export-check"><input type="checkbox" checked={exportColumns.includes(c.key)} disabled={c.fixed} onChange={()=>toggleColumn(c.key)}/><span>{c.label}</span></label>)}</div>
   <div className="pr-pt-export-section-head"><strong>Kit groups</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportGroups([])}>All Kits</button></div><div className="pr-pt-export-kits">{allGroups.map(g=><label key={g.key} className="pr-pt-export-check"><input type="checkbox" checked={!exportGroups.length||exportGroups.includes(g.key)} onChange={()=>toggleGroup(g.key)}/><span>{g.name}</span></label>)}</div><div className="pr-pt-export-info">Blank forms keep component names and requirements; receiving counts, user names, and signatures are empty for handwritten receiving.</div></div>
   <footer className="pr-pt-export-actions"><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(false)}>CSV · Values</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(true)}>CSV · Blank</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportPDF(false)}>PDF · Values</button><button className="pr-primary" type="button" disabled={exportBusy} onClick={()=>exportPDF(true)}>PDF · Blank</button></footer>
  </section></div>}
 </div>;
}
