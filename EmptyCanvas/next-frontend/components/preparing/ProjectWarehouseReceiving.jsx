"use client";
import StageFilterTabs from "./StageFilterTabs";
import StageQuantityInput from "./StageQuantityInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { warehouseTotals,warehouseReceivingBalances,warehouseReceiptLimit,projectRequired } from "../../lib/preparing-warehouse-math.mjs";
import {WAREHOUSE_COLUMNS,warehouseGroups,warehouseExportValue,filterWarehouseReceivingRows} from "../../lib/preparing-warehouse-view.mjs";
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
  edit:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
  expand:<><path d="M14 4h6v6M20 4l-8 8M20 14v6H4V4h6"/></>,
  arrowLeft:<path d="m14 5-7 7 7 7"/>,
  arrowRight:<path d="m10 5 7 7-7 7"/>,
  warehouse:<><path d="M3 10 12 3l9 7v11H3V10Z"/><path d="M9 21v-8h6v8M3 10h18"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

// The shared Stage 1/2 visual primitives; images and avatars are read-only.
function EditorAvatars({people=[]}){
 if(!people.length)return <span className="pr-intake-no-editors" aria-label="No recorded editors">—</span>;
 const visible=people.slice(0,3);
 return <div className="pr-intake-editors" aria-label={`Recorded by ${people.map(person=>person.name).join(", ")}`}>
  {visible.map(person=><span className="pr-intake-avatar" key={person.id||person.name} title={person.name}>
   <span aria-hidden="true">{String(person.name||"?").trim().slice(0,1).toUpperCase()}</span>
   {person.photoUrl&&<img src={person.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}
  </span>)}
  {people.length>3&&<span className="pr-intake-avatar pr-intake-avatar-more" title={people.slice(3).map(person=>person.name).join(", ")}>+{people.length-3}</span>}
 </div>;
}
function ComponentThumbnail({row,onOpen}){
 const image=row.imageUrls?.[0];
 return image?<button type="button" className="pr-intake-thumb" title={`View photo: ${row.name}`} aria-label={`View image of ${row.name}`} onClick={()=>onOpen(row)}><img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("is-broken");}}/><span className="pr-intake-thumb-expand"><WarehouseIcon name="expand" size={12}/></span></button>:
 <span className="pr-intake-thumb pr-intake-thumb-empty" title="No component photo available" aria-label="No component photo available"><WarehouseIcon name="box" size={18}/></span>;
}
export default function ProjectWarehouseReceiving({projectId,projectName,canReceive,editTabs={},request,onClose,closurePanel}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("receiving"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [searchOpen,setSearchOpen]=useState(false);
 const searchInputRef=useRef(null);
 const [preview,setPreview]=useState(null),[previewIndex,setPreviewIndex]=useState(0);
 useEffect(()=>{if(searchOpen&&tab==="receiving")searchInputRef.current?.focus();},[searchOpen,tab]);
 const closeSearch=()=>{setSearchOpen(false);setSearch("");};
 const canEditTab=canReceive && editTabs[filter] !== false;
 const [showExport,setShowExport]=useState(false),[exportColumns,setExportColumns]=useState(WAREHOUSE_COLUMNS.map(c=>c.key)),[exportGroups,setExportGroups]=useState([]),[exportBusy,setExportBusy]=useState(false);
 const [expandedKit,setExpandedKit]=useState(null);
 const [editing,setEditing]=useState({}),[clearConfirm,setClearConfirm]=useState(null),[rowError,setRowError]=useState({});
 const [draft,setDraft]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 async function reload(){const response=await request(`/warehouse?projectId=${encodeURIComponent(projectId)}`);setState(response);setLoading(false);}
 useEffect(()=>{let active=true;request(`/warehouse?projectId=${encodeURIComponent(projectId)}`).then(v=>{if(active){setState(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[projectId]);
 const summaries=useMemo(()=>warehouseReceivingBalances(warehouseTotals((state.items||[]).map(row=>({...row,required_qty:projectRequired(Number(row.required_qty||0),(state.schools||[]).length)})),state.receiptLines||[],state.allocations||[]),state.testingBalances||[],state.intakeBalances||[]),[state]);
 const nameById=useMemo(()=>new Map(state.items.map(row=>[row.id,row.product_name])),[state]);
 const receivedById=useMemo(()=>{
  const result=new Map(),linesByReceipt=new Map();
  for(const line of state.receiptLines){
   if(!linesByReceipt.has(line.receipt_id))linesByReceipt.set(line.receipt_id,[]);
   linesByReceipt.get(line.receipt_id).push(line);
  }
  for(const receipt of [...state.receipts].reverse()){
   if(!receipt.created_by_name)continue;
   for(const line of linesByReceipt.get(receipt.id)||[]){
    if(!result.has(line.item_id))result.set(line.item_id,new Map());
    result.get(line.item_id).set(receipt.created_by_id||receipt.created_by_name,{id:receipt.created_by_id||receipt.created_by_name,name:receipt.created_by_name,photoUrl:receipt.created_by_photo_url||""});
   }
  }
  return result;
 },[state.receipts,state.receiptLines]);
 const totals=useMemo(()=>summaries.reduce((sum,row)=>({required:sum.required+number(row.required_qty),accepted:sum.accepted+row.accepted,damaged:sum.damaged+row.damaged,allocated:sum.allocated+row.allocated,available:sum.available+row.available,tested:sum.tested+row.tested,readyToReceive:sum.readyToReceive+row.readyToReceive}),{required:0,accepted:0,damaged:0,allocated:0,available:0,tested:0,readyToReceive:0}),[summaries]);
 const shown=useMemo(()=>filterWarehouseReceivingRows(summaries.filter(row=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(search.toLowerCase().trim())),filter),[summaries,search,filter]);
 // Export remains based on tested/returned components, not the new Stage 1 tab filter.
 const allGroups=useMemo(()=>warehouseGroups(summaries.filter(row=>number(row.tested)>0||number(row.accepted)>0),state.kitGroups),[summaries,state.kitGroups]);
 const shownGroups=useMemo(()=>warehouseGroups(shown,state.kitGroups),[shown,state.kitGroups]);
 const percent=totals.required>0?Math.min(100,Math.max(0,totals.accepted/totals.required*100)):0;
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
 const historyEntries=useMemo(()=>state.receipts.flatMap(receipt=>state.receiptLines.filter(line=>line.receipt_id===receipt.id).map(line=>({key:line.id,receipt,line,component:nameById.get(line.item_id)||"Component"}))),[state.receipts,state.receiptLines,nameById]);
 async function execute(action,payload) {
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try {
   await request("/warehouse","POST",{action,projectId,editTab:action==="receive"?filter:"all",...payload});
   setSuccess(action==="capture"?"Project BOM captured.":"Warehouse return recorded.");
   try{await reload();}catch{setError("Saved successfully, but the latest values could not be refreshed. Reopen Warehouse Return to reload them.");}
   return true;
  }catch(e){setError(e.message||"Unable to save.");return false;}finally{setBusy(false);}
 }
 function enableReceipt(row){
  if(!canEditTab||busy)return;
  setError("");setClearConfirm(null);
  setDraft(prev=>({...prev,[row.id]:String(row.accepted)}));
  setEditing(prev=>({...prev,[row.id]:true}));
 }
 function cancelReceipt(row){
  setEditing(prev=>{const next={...prev};delete next[row.id];return next;});
  setDraft(prev=>{const next={...prev};delete next[row.id];return next;});
 }
 async function saveReceipt(row){
  if(busy||!canEditTab)return;
  let acceptedDelta;
  try{acceptedDelta=warehouseReceiptLimit(row.accepted,draft[row.id],row.tested,row.allocated);}
  catch(e){setRowError(old=>({...old,[row.id]:e.message}));return;}
  if(acceptedDelta===0){setRowError(old=>({...old,[row.id]:"Change the Returned amount before saving."}));return;}
  const ok=await execute("receive",{kind:acceptedDelta<0?"adjustment":"receipt",lines:[{itemId:row.id,accepted:acceptedDelta}]});
  if(ok){cancelReceipt(row);setRowError(old=>({...old,[row.id]:""}));}
 }
 async function clearReceipt(row){
  if(busy||!canEditTab)return;
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
  const link=document.createElement("a");link.href=url;link.download=`warehouse-return-${blank?"blank":"values"}-${projectId}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setShowExport(false);
 }
 async function exportPDF(blank){
  if(exportBusy)return;setExportBusy(true);setError("");
  try{
   const resp=await fetch("/next/api/projects-preparing/warehouse/export",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({projectId,columns:exportColumns,groupKeys:exportGroups,blank})});
   if(!resp.ok){const data=await resp.json().catch(()=>({}));throw Error(data.error||"Unable to export warehouse PDF.");}
   const url=URL.createObjectURL(await resp.blob()),a=document.createElement("a");a.href=url;a.download=`warehouse-return-${blank?"blank":"values"}-${projectId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);setShowExport(false);
  }catch(e){setError(e.message);}finally{setExportBusy(false);}
 }
 const toggleColumn=key=>{if(key==="name")return;setExportColumns(old=>old.includes(key)?old.filter(v=>v!==key):WAREHOUSE_COLUMNS.filter(c=>old.includes(c.key)||c.key===key).map(c=>c.key));};
 const toggleGroup=key=>setExportGroups(old=>{const all=allGroups.map(g=>g.key),current=old.length?old:all,updated=current.includes(key)?current.filter(k=>k!==key):all.filter(k=>current.includes(k)||k===key);return !updated.length?old:updated.length===all.length?[]:updated;});
 return <div className="pr-wh pr-wr-modern pr-pt pr-pt-modern pr-warehouse-parity pr-intake-v401 pr-warehouse-v407">
  <header className="pr-manifest-title pr-wh-title pr-pt-title">
   <div className="pr-intake-heading"><WarehouseIcon name="warehouse" size={48}/><div><h3>Warehouse Return</h3></div></div>
   <div className="pr-intake-header-actions">
    <button type="button" aria-pressed={tab==="history"} className={`pr-pt-history-button${tab==="history"?" is-active":""}`} aria-label={`Return History (${historyEntries.length} changes)`} title={`Return History (${historyEntries.length})`} onClick={()=>{setTab(tab==="history"?"receiving":"history");if(tab!=="history")closeSearch();setError("");}}><WarehouseIcon name="history" size={19}/></button>
    <button type="button" className="pr-pt-close" aria-label="Close Warehouse Return" title="Close" onClick={onClose}><WarehouseIcon name="close" size={19}/></button>
   </div>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading warehouse return records…</p>:<>
   <div className="pr-intake-summary">
    <div className="pr-intake-progress" aria-label={`Project warehouse return progress ${percent.toFixed(2)}%`}>
     <div className="pr-intake-progress-title"><span>Project Progress</span><strong>{percent.toFixed(2)}%</strong></div>
     <div className="pr-intake-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(2))} aria-label="Returned quantities"><span style={{width:`${percent}%`}}/></div>
     <strong className="pr-intake-progress-numbers">{pretty(totals.accepted)} / {pretty(totals.required)}</strong>
    </div>
    <div className="pr-intake-signoff">{closurePanel}</div>
   </div>
   <div className="pr-intake-tabs-toolbar">
    <StageFilterTabs label="Warehouse return status" options={[{value:"all",label:"Production Received"},{value:"available",label:"Remaining to Return"},{value:"received",label:"Returned"}]} value={tab==="receiving"?filter:""} onChange={value=>{setFilter(value);setTab("receiving");setEditing({});setDraft({});setClearConfirm(null);setError("");}}/>
    <div className="pr-intake-tabs-actions" aria-label="Warehouse Return toolbar">
     <div className="pr-intake-search-slot">
      <div className={`pr-intake-search-control${searchOpen?" is-open":""}`} role="search">
       <button type="button" className="pr-intake-search-toggle" aria-label={searchOpen?"Close component search":"Search components"} aria-controls="pr-warehouse-component-search" aria-expanded={searchOpen} title={searchOpen?"Close search":"Search components"} onClick={()=>{if(searchOpen)closeSearch();else{setTab("receiving");setSearchOpen(true);}}}><WarehouseIcon name="search" size={17}/></button>
       <div className="pr-intake-search-expand">
        <input ref={searchInputRef} id="pr-warehouse-component-search" type="search" aria-label="Search warehouse return components" placeholder="Search component or code…" disabled={!searchOpen} tabIndex={searchOpen?0:-1} value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closeSearch();}}}/>
        <button type="button" className="pr-intake-search-clear" onClick={closeSearch} aria-label="Close component search" title="Close search" tabIndex={searchOpen?0:-1} disabled={!searchOpen}><WarehouseIcon name="close" size={17}/></button>
       </div>
      </div>
     </div>
     <button type="button" className="pr-pt-download-button" aria-label="Download warehouse return report" title="Download warehouse return report" onClick={()=>setShowExport(true)} disabled={!state.items.length}><WarehouseIcon name="download" size={21}/></button>
    </div>
   </div>
   {tab==="receiving"&&<div className="pr-wh-list pr-wr-list pr-pt-list pr-pt-kit-list" aria-label="Warehouse return components grouped by Kit">{shownGroups.map(group=>{
    const open=!!search.trim()||expandedKit===group.key;
    const appearance=warehouseKitAppearance(group.name);
    return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={group.key}>
     <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setExpandedKit(open?"__none__":group.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><WarehouseIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{group.name}</strong></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
     {open&&<div className="pr-pt-kit-body">{group.items.map(row=>{
      const active=!!editing[row.id],people=[...(receivedById.get(row.id)?.values()||[])];
      const editableDraft=draft[row.id]??"";
      const pendingQuantity=active&&/^(0|[1-9]\d*)$/.test(String(editableDraft))?Math.max(0,row.tested-Number(editableDraft)):row.readyToReceive;
      return <article className={`pr-pt-row pr-intake-component pr-intake-item--${filter==="available"?"pending":filter}${active?" is-editing":""}`} key={`${group.key}-${row.id}`}>
       <div className={`pr-intake-component-main pr-intake-cols--${filter==="available"?"pending":filter}`}>
        <div className="pr-intake-component-product"><ComponentThumbnail row={{...row,name:row.product_name}} onOpen={showPreview}/><div className="pr-pt-name"><strong title={row.product_id?`Product code: ${row.product_id}`:undefined}>{row.product_name}</strong>{row.product_id&&<small>{row.product_id}</small>}{row.accepted>row.tested&&<small className="pr-pt-warning">Historical returned quantity exceeds tested quantity; review this record.</small>}</div></div>
        {filter==="all"&&<div className="pr-intake-cell pr-warehouse-intake-count"><span>Production Received</span><strong>{pretty(row.productionIntakeReceived)}</strong><small>Tested: {pretty(row.tested)}</small></div>}
        {filter==="received"&&<div className="pr-intake-cell"><span>Tested</span><strong>{pretty(row.tested)}</strong></div>}
        {filter==="available"&&<div className="pr-intake-cell"><span>Ready to Return</span><strong>{pretty(pendingQuantity)}</strong></div>}
        <div className={`pr-intake-cell pr-intake-cell--received${active?" is-inline-edit":""}`}>
         <span>Returned</span>
         {active?<StageQuantityInput id={`pr-warehouse-qty-${row.id}`} step="1" min="0" inputMode="numeric" aria-label={`Returned quantity ${row.product_name}`} disabled={busy} value={editableDraft} max={Math.max(row.accepted,row.tested)} onValueChange={value=>{setDraft(prev=>({...prev,[row.id]:value}));setRowError(prev=>({...prev,[row.id]:""}));}} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();saveReceipt(row);}else if(event.key==="Escape"){event.preventDefault();cancelReceipt(row);}}}/>:<strong>{pretty(row.accepted)}</strong>}
        </div>
        {filter==="all"&&<div className="pr-intake-cell"><span>Ready to Return</span><strong>{pretty(pendingQuantity)}</strong></div>}
        <EditorAvatars people={people}/>
        <div className="pr-intake-row-actions">{canEditTab&&(row.tested>0||row.accepted>0)&&(active?<>
         <button type="button" className="pr-intake-action pr-intake-action--cancel" aria-label={`Cancel edit for ${row.product_name}`} title="Cancel" disabled={busy} onClick={()=>cancelReceipt(row)}><WarehouseIcon name="close" size={16}/></button>
         <button type="button" className="pr-intake-action pr-intake-action--save" aria-label={`Save returned quantity for ${row.product_name}`} title="Save" disabled={busy} onClick={()=>saveReceipt(row)}><WarehouseIcon name="check" size={18}/></button>
        </>:<>
         <button type="button" className="pr-intake-edit-icon" aria-label={`Edit ${row.product_name}`} title="Edit returned quantity" disabled={busy} onClick={()=>enableReceipt(row)}><WarehouseIcon name="edit" size={17}/></button>
         {row.accepted>0&&<button type="button" className="pr-intake-edit-icon" aria-label={`Reverse returned quantity for ${row.product_name}`} title="Reverse returned balance (audit retained)" disabled={busy} onClick={()=>setClearConfirm(row)}><WarehouseIcon name="history" size={17}/></button>}
        </>)}</div>
       </div>
       {rowError[row.id]&&<p className="pr-pt-inline-error" role="alert">{rowError[row.id]}</p>}
       {clearConfirm?.id===row.id&&<div className="pr-wr-confirm"><strong>Reverse all Returned units?</strong><small>This records a signed correction without deleting history. Units already handed to Operations or allocated cannot be reversed.</small><button type="button" className="pr-secondary" onClick={()=>setClearConfirm(null)}>Cancel</button><button type="button" className="pr-wr-erase" disabled={busy} onClick={()=>clearReceipt(row)}>Confirm reversal</button></div>}
      </article>;
     })}</div>}
    </section>;
   })}{!shownGroups.length&&<div className="pr-wh-empty">No components match this filter.</div>}</div>}
   {tab==="history"&&<section className="pr-wr-history" aria-label="Warehouse return audit history">
    <div className="pr-pt-history-heading"><div><h4>Return History</h4><p>Every change is retained as a separate transaction.</p></div><span className="pr-pt-history-count">{historyEntries.length} changes</span></div>
    <div className="pr-pt-history-grid">{historyEntries.map(({key,receipt,line,component})=><article className="pr-pt-history-card" key={key}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{(receipt.created_by_name||"?").slice(0,1).toUpperCase()}{receipt.created_by_photo_url&&<img className="pr-warehouse-history-photo" src={receipt.created_by_photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}</span><div className="pr-pt-history-person"><strong>{receipt.created_by_name||"Historical record (name not available)"}</strong><span>{date(receipt.created_at)}</span></div><span className="pr-pt-history-label">{receipt.kind==="adjustment"?"Corrected":"Returned"}</span></div>
     <div className="pr-pt-history-component"><strong>{component}</strong><span>{receipt.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Returned change<strong>{line.accepted_delta>0?"+":""}{pretty(line.accepted_delta)}</strong></span><span>Transaction<strong>{receipt.kind}</strong></span></div>
     {line.damaged_delta!==0&&<p className="pr-pt-history-note">Historical damaged entry: {pretty(line.damaged_delta)} (read-only)</p>}
     {receipt.notes&&<p className="pr-pt-history-note">{receipt.notes}</p>}
    </article>)}{!historyEntries.length&&<div className="pr-wh-empty">No warehouse return movements recorded yet.</div>}</div>
   </section>}
  </>}
  {preview&&typeof document!=="undefined"&&createPortal(
   <div className="pr-intake-image-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPreview(null);}}>
    <section className="pr-intake-image-modal" role="dialog" aria-modal="true" aria-label={`Component image: ${preview.name}`}>
     <header className="pr-intake-image-header"><div><strong>{preview.name}</strong>{(preview.imageUrls?.length||0)>1&&<small>{previewIndex+1} / {preview.imageUrls.length}</small>}</div><button type="button" autoFocus aria-label="Close image preview" onClick={()=>setPreview(null)}><WarehouseIcon name="close" size={20}/></button></header>
     <div className="pr-intake-image-content">
      {(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Previous image" onClick={()=>setPreviewIndex(i=>(i+preview.imageUrls.length-1)%preview.imageUrls.length)}><WarehouseIcon name="arrowLeft" size={23}/></button>}
      <img src={preview.imageUrls[previewIndex]} alt={preview.name}/>
      {(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Next image" onClick={()=>setPreviewIndex(i=>(i+1)%preview.imageUrls.length)}><WarehouseIcon name="arrowRight" size={23}/></button>}
     </div>
    </section>
   </div>,document.body
  )}
  {showExport&&<div className="pr-pt-export-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!exportBusy)setShowExport(false);}}><section className="pr-pt-export-modal" role="dialog" aria-modal="true" aria-label="Export warehouse return">
   <header className="pr-pt-export-head"><div><strong>Export Warehouse Return</strong><small>Choose columns, Kits, and format</small></div><button type="button" className="pr-secondary" disabled={exportBusy} onClick={()=>setShowExport(false)}>×</button></header>
   <div className="pr-pt-export-body"><div className="pr-pt-export-summary">{exportColumns.length} columns selected <span aria-hidden="true">·</span> {exportGroups.length||allGroups.length} kit groups</div><div className="pr-pt-export-section-head"><strong>Columns</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportColumns(WAREHOUSE_COLUMNS.map(c=>c.key))}>Select all</button></div><div className="pr-pt-export-checks">{WAREHOUSE_COLUMNS.map(c=><label key={c.key} className="pr-pt-export-check"><input type="checkbox" checked={exportColumns.includes(c.key)} disabled={c.fixed} onChange={()=>toggleColumn(c.key)}/><span>{c.label}</span></label>)}</div>
   <div className="pr-pt-export-section-head"><strong>Kit groups</strong><button type="button" className="pr-pt-export-link" onClick={()=>setExportGroups([])}>All Kits</button></div><div className="pr-pt-export-kits">{allGroups.map(g=><label key={g.key} className="pr-pt-export-check"><input type="checkbox" checked={!exportGroups.length||exportGroups.includes(g.key)} onChange={()=>toggleGroup(g.key)}/><span>{g.name}</span></label>)}</div><div className="pr-pt-export-info">Blank forms keep tested quantities and component names; returned counts, user names, and signatures are empty for warehouse handover.</div></div>
   <footer className="pr-pt-export-actions"><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(false)}>CSV · Values</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportCSV(true)}>CSV · Blank</button><button className="pr-secondary" type="button" disabled={exportBusy} onClick={()=>exportPDF(false)}>PDF · Values</button><button className="pr-primary" type="button" disabled={exportBusy} onClick={()=>exportPDF(true)}>PDF · Blank</button></footer>
  </section></div>}
 </div>;
}
