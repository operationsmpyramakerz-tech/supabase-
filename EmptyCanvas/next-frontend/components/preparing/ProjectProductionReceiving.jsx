"use client";
import StageExportDialog from "./StageExportDialog";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {warehouseGroups} from "../../lib/preparing-warehouse-view.mjs";
import {filterProductionReceivingRows,productionReceiptDelta} from "../../lib/preparing-production-math.mjs";
import ProjectBoxDistribution from "./ProjectBoxDistribution";
import StageFilterTabs from "./StageFilterTabs";
import StageQuantityInput from "./StageQuantityInput";
const n=v=>Number(v)||0;
const fmt=v=>n(v).toLocaleString("en-US");
const csvSafe=v=>{const raw=String(v??"");return `"${(/^\s*[=+@-]/.test(raw)?"'":"")+raw.replaceAll('"','""')}"`;};
const date=v=>{try{return new Date(v).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});}catch{return "—";}};
const RECEIVING_COLUMNS=[{key:"name",label:"Component"},{key:"code",label:"Code"},{key:"required",label:"Project Required"},{key:"warehouse",label:"Warehouse Returned"},{key:"production",label:"Operations Received"},{key:"available",label:"Available for Operations"},{key:"receivedBy",label:"Received By"},{key:"signature",label:"Signature"}];
const BOX_COLUMNS=[{key:"name",label:"Component"},{key:"code",label:"Code"},{key:"required",label:"Project Required"},{key:"production",label:"Operations Received"},{key:"packed",label:"Packed"},{key:"unpacked",label:"Available to Pack / Unpacked"},{key:"signature",label:"Signature"}];
const initial={items:[],handoffs:[],kitGroups:[],cartons:[],cartonLines:[],schoolsCount:0};
// Match the solid Kit tiles used by Project Components, Testing and Warehouse.
// This is strictly presentational; receiving and packing records stay unchanged.
function productionKitAppearance(name){
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
function ProductionIcon({name="box",size=20}){
 const shapes={
  layers:<><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z"/><path d="m3.5 11 8.5 4.5 8.5-4.5M3.5 15.5 12 20l8.5-4.5"/></>,
  box:<><path d="M12 2 3.5 6.7 12 11.5l8.5-4.8L12 2Z"/><path d="M3.5 6.7v10L12 22l8.5-5.3v-10M12 11.5V22"/></>,
  cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  pencil:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8M4 20h16"/></>,
  laser:<><circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5M19.1 4.9l-3.5 3.5m-7.2 7.2-3.5 3.5"/></>,
  spool:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 7h14M5 17h14M9 11c2-1 4-1 6 0m-6 3c2-1 4-1 6 0"/></>,
  puzzle:<path d="M10 3H4a1 1 0 0 0-1 1v6h2a3 3 0 0 1 0 6H3v4a1 1 0 0 0 1 1h6v-2a3 3 0 0 1 6 0v2h4a1 1 0 0 0 1-1v-6h-2a3 3 0 0 1-6 0V3Z"/>,
  wrench:<path d="M21 7.5a6 6 0 0 1-8 5.7L6.4 20a2 2 0 0 1-2.8-2.8l6.7-6.6a6 6 0 0 1 6-8l-3.8 3.8 3.1 3.1L19.5 6 21 7.5Z"/>,
  close:<path d="M5 5 19 19M19 5 5 19"/>,
  search:<><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
  history:<><path d="M3 12a9 9 0 1 0 2.3-6"/><path d="M3 4v5h5M12 7v5l3.5 2"/></>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  inbox:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
  engineer:<><path d="M4 10h16M7 10V8a5 5 0 0 1 10 0v2M12 3v4M8 11.5a4 4 0 0 0 8 0M8 16l-4 2v4h16v-4l-4-2M9 17l3 3 3-3"/></>,
  edit:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
  expand:<><path d="M14 4h6v6M20 4l-8 8M20 14v6H4V4h6"/></>,
  arrowLeft:<path d="m14 5-7 7 7 7"/>,
  arrowRight:<path d="m10 5 7 7-7 7"/>,
  truck:<><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}
// Shared visual language from Stages 1–3; editor avatars are view-only.
function EditorAvatars({people=[]}){
 if(!people.length)return <span className="pr-intake-no-editors" aria-label="No recorded receivers">—</span>;
 const visible=people.slice(0,3);
 return <div className="pr-intake-editors" aria-label={`Received by ${people.map(person=>person.name).join(", ")}`}>
  {visible.map(person=><span className="pr-intake-avatar" key={person.id||person.name} title={person.name}>
   <span aria-hidden="true">{String(person.name||"?").trim().slice(0,1).toUpperCase()}</span>
   {person.photoUrl&&<img src={person.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}
  </span>)}
  {people.length>3&&<span className="pr-intake-avatar pr-intake-avatar-more" title={people.slice(3).map(person=>person.name).join(", ")}>+{people.length-3}</span>}
 </div>;
}
function ComponentThumbnail({row,onOpen}){
 const image=row.imageUrls?.[0];
 return image?<button type="button" className="pr-intake-thumb" title={`View photo: ${row.name}`} aria-label={`View image of ${row.name}`} onClick={()=>onOpen(row)}><img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("is-broken");}}/><span className="pr-intake-thumb-expand"><ProductionIcon name="expand" size={12}/></span></button>:
 <span className="pr-intake-thumb pr-intake-thumb-empty" title="No component photo available" aria-label="No component photo available"><ProductionIcon name="box" size={18}/></span>;
}
export default function ProjectProductionReceiving({projectId,projectName,allowed,cartonsAllowed,editTabs={},request,onClose,closurePanel,view="receiving"}){
 const boxView=view==="boxes";
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState(boxView?"boxes":"receiving"),[search,setSearch]=useState(""),[filter,setFilter]=useState("available"),[opened,setOpened]=useState(null);
 const [searchOpen,setSearchOpen]=useState(false),searchInputRef=useRef(null);
 const [preview,setPreview]=useState(null),[previewIndex,setPreviewIndex]=useState(0);
 const closeSearch=()=>{setSearchOpen(false);setSearch("");};
 useEffect(()=>{if(searchOpen&&!boxView&&tab==="receiving")searchInputRef.current?.focus();},[searchOpen,boxView,tab]);
 useEffect(()=>{if(!preview)return;const handle=event=>{if(event.key==="Escape")setPreview(null);if(event.key==="ArrowRight")setPreviewIndex(index=>(index+1)%(preview.imageUrls?.length||1));if(event.key==="ArrowLeft")setPreviewIndex(index=>(index+(preview.imageUrls?.length||1)-1)%(preview.imageUrls?.length||1));};window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle);},[preview]);
 const canEditTab=allowed && editTabs[filter] !== false;
 const [editing,setEditing]=useState({}),[draft,setDraft]=useState({}),[rowError,setRowError]=useState({});
 const [exportOpen,setExportOpen]=useState(false),[exportBusy,setExportBusy]=useState(false),[columns,setColumns]=useState(RECEIVING_COLUMNS.map(c=>c.key)),[selectedGroups,setSelectedGroups]=useState([]);
 async function reload(){const v=await request(`/production?projectId=${encodeURIComponent(projectId)}&scope=${boxView ? "boxes" : "receiving"}`);setData(v);setLoading(false);return v;}
 useEffect(()=>{let active=true;request(`/production?projectId=${encodeURIComponent(projectId)}&scope=${boxView ? "boxes" : "receiving"}`).then(v=>{if(active){setData(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[projectId]);
 const named=useMemo(()=>{const m=new Map();for(const h of [...data.handoffs].reverse()){if(!h.received_by_id&&!h.received_by_name)continue;if(!m.has(h.item_id))m.set(h.item_id,new Map());const person={id:h.received_by_id||h.received_by_name,name:h.received_by_name||"Recorded receiver",photoUrl:h.received_by_photo_url||""};m.get(h.item_id).set(person.id,person);}return m;},[data.handoffs]);
 const rows=useMemo(()=>data.items.map(r=>{const editors=[...(named.get(r.id)?.values()||[])];return {...r,name:r.product_name,code:r.product_id,required_qty:n(r.required_qty)*Math.max(1,n(data.schoolsCount)),receivedBy:editors.map(p=>p.name),editors};}),[data.items,data.schoolsCount,named]);
 const kits=useMemo(()=>warehouseGroups(rows,data.kitGroups),[rows,data.kitGroups]);
 const shown=useMemo(()=>warehouseGroups(filterProductionReceivingRows(rows.filter(r=>`${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())),filter),data.kitGroups),[rows,data.kitGroups,search,filter]);
 const filterOptions=useMemo(()=>[
  {value:"available",label:"Available to Receive",hint:"Warehouse stock awaiting Operations",count:rows.filter(r=>n(r.availableToProduction)>0).length},
  {value:"not-received",label:"Not Received",hint:"No Operations handover recorded",count:rows.filter(r=>n(r.productionReceived)===0).length},
  {value:"received",label:"Received",hint:"Components with a positive Operations receipt",count:rows.filter(r=>n(r.productionReceived)>0).length},
  {value:"all",label:"All Components",hint:"Entire project component list",count:rows.length},
 ],[rows]);
 const totals=useMemo(()=>rows.reduce((o,r)=>({required:o.required+n(r.required_qty),warehouse:o.warehouse+n(r.warehouseReceived),production:o.production+n(r.productionReceived),packed:o.packed+n(r.packedQty)}),{required:0,warehouse:0,production:0,packed:0}),[rows]);
 const percent=totals.required>0?Math.min(100,Math.max(0,totals.production/totals.required*100)):0;
 const showPreview=row=>{setPreview(row);setPreviewIndex(0);};
 function begin(row){if(!canEditTab||busy)return;setDraft(p=>({...p,[row.id]:String(row.productionReceived)}));setEditing(p=>({...p,[row.id]:true}));setRowError(p=>({...p,[row.id]:""}));}
 function cancel(id){setEditing(p=>({...p,[id]:false}));setDraft(p=>{const next={...p};delete next[id];return next;});setRowError(p=>({...p,[id]:""}));}
 async function save(row){
  if(!canEditTab||busy)return;
  const value=draft[row.id];
  try{productionReceiptDelta(row.productionReceived,value,row.warehouseReceived,row.packedQty);}catch(e){setRowError(p=>({...p,[row.id]:e.message}));return;}
  if(Number(value)===row.productionReceived){cancel(row.id);return;}
  setBusy(true);setError("");setNotice("");
  try{
   await request("/production","POST",{action:"handoff",projectId,editTab:filter,itemId:row.id,totalReceived:Number(value),expectedReceived:row.productionReceived});
   cancel(row.id);setNotice(`Operations receipt saved for ${row.name}.`);
   try{await reload();}catch{setError("Saved successfully, but the updated balances could not be refreshed. Reopen Operations Receiving to reload them.");}
  }catch(e){setRowError(p=>({...p,[row.id]:e.message||"Save failed."}));}finally{setBusy(false);}
 }
 const isBoxTab=boxView;
 const exportColumns=isBoxTab?BOX_COLUMNS:RECEIVING_COLUMNS;
 const value=(row,k,blank=false)=>{if(k==="name")return row.name;if(k==="code")return row.code||"";if(k==="required")return String(row.required_qty);if(k==="warehouse")return String(row.warehouseReceived);if(blank)return "";if(k==="production")return String(row.productionReceived);if(k==="available")return String(row.availableToProduction);if(k==="packed")return String(row.packedQty);if(k==="unpacked")return String(row.unpacked);if(k==="receivedBy")return row.receivedBy.join("; ");return "";};
 const exportKits=()=>kits.filter(k=>!selectedGroups.length||selectedGroups.includes(k.key));
 function exportCsv(blank){const out=[["Kit",...columns.map(k=>exportColumns.find(c=>c.key===k)?.label||k)]];for(const kit of exportKits())for(const row of kit.items)out.push([kit.name,...columns.map(c=>value(row,c,blank))]);const blob=new Blob(["\uFEFF"+out.map(r=>r.map(csvSafe).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`production-${isBoxTab?"boxes":"receiving"}-${blank?"blank":"values"}-${projectId}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);setExportOpen(false);}
 async function exportPdf(blank){setExportBusy(true);setError("");try{const res=await fetch("/next/api/projects-preparing/production/export",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({projectId,blank,columns,groupKeys:selectedGroups,scope:isBoxTab?"boxes":"receiving"})});if(!res.ok){const payload=await res.json().catch(()=>({}));throw Error(payload.error||"PDF export failed.");}const url=URL.createObjectURL(await res.blob()),a=document.createElement("a");a.href=url;a.download=`production-${isBoxTab?"boxes":"receiving"}-${blank?"blank":"values"}-${projectId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);setExportOpen(false);}catch(e){throw new Error(e?.message||"Unable to export PDF.");}finally{setExportBusy(false);}}
 function toggleExportColumn(key){if(key==="name")return;setColumns(v=>v.includes(key)?v.filter(k=>k!==key):[...v,key]);}
 function toggleKit(key){const all=kits.map(g=>g.key),base=selectedGroups.length?selectedGroups:all,next=base.includes(key)?base.filter(k=>k!==key):[...base,key];setSelectedGroups(next.length===all.length?[]:next.length?next:base);}
 function openExport(){setColumns(exportColumns.map(c=>c.key));setSelectedGroups([]);setExportOpen(true);}
 if(!boxView)return <div className="pr-delivery pr-production pr-pt pr-pt-modern pr-intake-v401 pr-production-v408">
  <header className="pr-manifest-title pr-pt-title">
   <div className="pr-intake-heading"><ProductionIcon name="engineer" size={48}/><div><h3>Operations Receiving</h3></div></div>
   <div className="pr-intake-header-actions">
    <button type="button" aria-pressed={tab==="receiving-history"} className={`pr-pt-history-button${tab==="receiving-history"?" is-active":""}`} aria-label={`Receiving History (${data.handoffs.length} changes)`} title={`Receiving History (${data.handoffs.length})`} onClick={()=>{setTab(tab==="receiving-history"?"receiving":"receiving-history");if(tab!=="receiving-history")closeSearch();setError("");}}><ProductionIcon name="history" size={19}/></button>
    <button type="button" className="pr-pt-close" aria-label="Close Operations Receiving" title="Close" onClick={onClose}><ProductionIcon name="close" size={19}/></button>
   </div>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError("")}>×</button></div>}
  {notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading Operations Receiving…</p>:<>
   <div className="pr-intake-summary">
    <div className="pr-intake-progress" aria-label={`Project operations receiving progress ${percent.toFixed(2)}%`}>
     <div className="pr-intake-progress-title"><span>Project Progress</span><strong>{percent.toFixed(2)}%</strong></div>
     <div className="pr-intake-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(2))} aria-label="Operations received quantities"><span style={{width:`${percent}%`}}/></div>
     <strong className="pr-intake-progress-numbers">{fmt(totals.production)} / {fmt(totals.required)}</strong>
    </div>
    <div className="pr-intake-signoff">{closurePanel}</div>
   </div>
   <div className="pr-intake-tabs-toolbar">
    <StageFilterTabs label="Operations receiving status" options={[{value:"all",label:"All Components"},{value:"available",label:"Remaining to Receive"},{value:"received",label:"Received"},{value:"not-received",label:"Not Received"}]} value={tab==="receiving"?filter:""} onChange={value=>{setFilter(value);setTab("receiving");setOpened(null);setEditing({});setDraft({});setRowError({});setError("");}}/>
    <div className="pr-intake-tabs-actions" aria-label="Operations Receiving toolbar">
     <div className="pr-intake-search-slot"><div className={`pr-intake-search-control${searchOpen?" is-open":""}`} role="search">
      <button type="button" className="pr-intake-search-toggle" aria-label={searchOpen?"Close component search":"Search components"} aria-controls="pr-operations-component-search" aria-expanded={searchOpen} title={searchOpen?"Close search":"Search components"} onClick={()=>{if(searchOpen)closeSearch();else{setTab("receiving");setSearchOpen(true);}}}><ProductionIcon name="search" size={17}/></button>
      <div className="pr-intake-search-expand">
       <input ref={searchInputRef} id="pr-operations-component-search" type="search" aria-label="Search Operations components" placeholder="Search component or code…" disabled={!searchOpen} tabIndex={searchOpen?0:-1} value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closeSearch();}}}/>
       <button type="button" className="pr-intake-search-clear" aria-label="Close component search" title="Close search" onClick={closeSearch} tabIndex={searchOpen?0:-1} disabled={!searchOpen}><ProductionIcon name="close" size={17}/></button>
      </div>
     </div></div>
     <button type="button" className="pr-pt-download-button" aria-label="Download Operations Receiving report" title="Download Operations Receiving report" onClick={openExport} disabled={!rows.length}><ProductionIcon name="download" size={21}/></button>
    </div>
   </div>
   {tab==="receiving"&&<div className="pr-pt-kits pr-pt-kit-list" aria-label="Operations receiving components by Kit">
    {shown.map(group=>{const appearance=productionKitAppearance(group.name),open=Boolean(search.trim())||opened===group.key;return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={group.key}>
     <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setOpened(open?"__none__":group.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><ProductionIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{group.name}</strong></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
     {open&&<div className="pr-pt-kit-body">{group.items.map(row=>{const active=!!editing[row.id],pendingValue=draft[row.id]??"",validDraft=/^(0|[1-9]\d*)$/.test(String(pendingValue)),remaining=active&&validDraft?Math.max(0,row.warehouseReceived-Number(pendingValue)):row.availableToProduction;return <article className={`pr-pt-row pr-intake-component pr-intake-item--${filter==="available"?"pending":filter}${active?" is-editing":""}`} key={`${group.key}-${row.id}`}>
      <div className={`pr-intake-component-main pr-intake-cols--${filter==="available"?"pending":filter}`}>
       <div className="pr-intake-component-product"><ComponentThumbnail row={row} onOpen={showPreview}/><div className="pr-pt-name"><strong title={row.code?`Product code: ${row.code}`:undefined}>{row.name}</strong>{row.code&&<small>{row.code}</small>}{row.productionReceived>row.warehouseReceived&&<small className="pr-pt-warning">Historical Operations receipt exceeds warehouse return; please review this balance.</small>}</div></div>
       {filter!=="available"&&<div className="pr-intake-cell"><span>Warehouse Returned</span><strong>{fmt(row.warehouseReceived)}</strong></div>}
       {filter==="available"&&<div className="pr-intake-cell"><span>Ready to Receive</span><strong>{fmt(remaining)}</strong></div>}
       <div className={`pr-intake-cell pr-intake-cell--received${active?" is-inline-edit":""}`}><span>Received</span>{active?<StageQuantityInput id={`pr-operations-qty-${row.id}`} min={row.packedQty} max={Math.max(row.warehouseReceived,row.productionReceived)} step="1" inputMode="numeric" aria-label={`Operations Received ${row.name}`} disabled={busy} value={pendingValue} onValueChange={value=>{setDraft(p=>({...p,[row.id]:value}));setRowError(p=>({...p,[row.id]:""}));}} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();save(row);}else if(event.key==="Escape"){event.preventDefault();cancel(row.id);}}}/>:<strong>{fmt(row.productionReceived)}</strong>}</div>
       {filter==="all"&&<div className="pr-intake-cell"><span>Remaining</span><strong>{fmt(remaining)}</strong></div>}
       <EditorAvatars people={row.editors}/>
       <div className="pr-intake-row-actions">{canEditTab&&(active?<>
        <button type="button" className="pr-intake-action pr-intake-action--cancel" aria-label={`Cancel edit for ${row.name}`} title="Cancel" disabled={busy} onClick={()=>cancel(row.id)}><ProductionIcon name="close" size={16}/></button>
        <button type="button" className="pr-intake-action pr-intake-action--save" aria-label={`Save received quantity for ${row.name}`} title="Save" disabled={busy} onClick={()=>save(row)}><ProductionIcon name="check" size={18}/></button>
       </>:<button type="button" className="pr-intake-edit-icon" aria-label={`Edit ${row.name}`} title="Edit received quantity" disabled={busy} onClick={()=>begin(row)}><ProductionIcon name="edit" size={17}/></button>)}</div>
      </div>
      {rowError[row.id]&&<p className="pr-pt-inline-error" role="alert">{rowError[row.id]}</p>}
     </article>;})}</div>}
    </section>;})}
    {!shown.length&&<div className="pr-wh-empty">No components match this status or search.</div>}
   </div>}
   {tab==="receiving-history"&&<section className="pr-pt-history" aria-label="Operations receiving audit history">
    <div className="pr-pt-history-heading"><div><h4>Receiving History</h4><p>Every receipt and correction remains in the audit log.</p></div><span className="pr-pt-history-count">{data.handoffs.length} changes</span></div>
    <div className="pr-pt-history-grid pr-production-history">{data.handoffs.map(h=>{const item=data.items.find(i=>i.id===h.item_id);return <article className="pr-pt-history-card" key={h.id}>
     <div className="pr-pt-history-top"><span className="pr-pt-history-avatar" aria-hidden="true">{String(h.received_by_name||"?").slice(0,1).toUpperCase()}{h.received_by_photo_url&&<img src={h.received_by_photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}</span><div className="pr-pt-history-person"><strong>{h.received_by_name||"Recorded receiver"}</strong><span>{date(h.created_at)}</span></div><span className="pr-pt-history-label">{h.qty_delta<0?"Correction":"Operations receipt"}</span></div>
     <div className="pr-pt-history-component"><strong>{item?.product_name||"Component"}</strong><span>{h.reference}</span></div>
     <div className="pr-pt-history-deltas"><span>Quantity change<strong>{h.qty_delta>0?"+":""}{fmt(h.qty_delta)}</strong></span><span>Received by<strong>{h.received_by_name}</strong></span></div>{h.notes&&<p className="pr-pt-history-note">{h.notes}</p>}
    </article>;})}{!data.handoffs.length&&<p className="pr-wh-empty">No Operations receipts yet.</p>}</div>
   </section>}
  </>}
  {preview&&typeof document!=="undefined"&&createPortal(<div className="pr-intake-image-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPreview(null);}}><section className="pr-intake-image-modal" role="dialog" aria-modal="true" aria-label={`Component image: ${preview.name}`}>
   <header className="pr-intake-image-header"><div><strong>{preview.name}</strong>{(preview.imageUrls?.length||0)>1&&<small>{previewIndex+1} / {preview.imageUrls.length}</small>}</div><button type="button" autoFocus aria-label="Close image preview" onClick={()=>setPreview(null)}><ProductionIcon name="close" size={20}/></button></header>
   <div className="pr-intake-image-content">{(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Previous image" onClick={()=>setPreviewIndex(index=>(index+preview.imageUrls.length-1)%preview.imageUrls.length)}><ProductionIcon name="arrowLeft" size={23}/></button>}<img src={preview.imageUrls[previewIndex]} alt={preview.name}/>{(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Next image" onClick={()=>setPreviewIndex(index=>(index+1)%preview.imageUrls.length)}><ProductionIcon name="arrowRight" size={23}/></button>}</div>
  </section></div>,document.body)}
  {exportOpen&&<StageExportDialog title="Export Operations Receiving" columnOptions={exportColumns} columns={columns} groups={kits} groupKeys={selectedGroups}
   onSelectAllColumns={()=>setColumns(exportColumns.map(c=>c.key))} onToggleColumn={toggleExportColumn}
   onSelectAllGroups={()=>setSelectedGroups([])} onToggleGroup={toggleKit} busy={exportBusy} onClose={()=>setExportOpen(false)} onCSV={exportCsv} onPDF={exportPdf}/>}
 </div>;
 // Stage 5 is intentionally independent from Operations Receiving's ledger editor.
 // Keep the atomic Pack by School dialog, box labels and box history in their own child.
 const boxPercent=totals.required>0?Math.min(100,Math.max(0,totals.packed/totals.required*100)):0;
 return <div className="pr-delivery pr-production pr-pt pr-pt-modern pr-intake-v401 pr-box-v409">
  <header className="pr-manifest-title pr-pt-title">
   <div className="pr-intake-heading"><ProductionIcon name="box" size={48}/><div><h3>Box Distribution</h3></div></div>
   <div className="pr-intake-header-actions">
    <button type="button" aria-pressed={tab==="box-history"} className={`pr-pt-history-button${tab==="box-history"?" is-active":""}`} aria-label="Box History" title="Box History" onClick={()=>setTab(value=>value==="box-history"?"boxes":"box-history")}><ProductionIcon name="history" size={19}/></button>
    <button type="button" className="pr-pt-close" aria-label="Close Box Distribution" title="Close" onClick={onClose}><ProductionIcon name="close" size={19}/></button>
   </div>
  </header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError("")}>×</button></div>}
  {notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading Box Distribution…</p>:<>
   <div className="pr-intake-summary">
    <div className="pr-intake-progress" aria-label={`Project box distribution progress ${boxPercent.toFixed(2)}%`}>
     <div className="pr-intake-progress-title"><span>Project Progress</span><strong>{boxPercent.toFixed(2)}%</strong></div>
     <div className="pr-intake-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(boxPercent.toFixed(2))} aria-label="Packed quantities"><span style={{width:`${boxPercent}%`}}/></div>
     <strong className="pr-intake-progress-numbers">{fmt(totals.packed)} / {fmt(totals.required)}</strong>
    </div>
    <div className="pr-intake-signoff">{closurePanel}</div>
   </div>
   <ProjectBoxDistribution
    projectId={projectId} rows={data.items} kitGroups={data.kitGroups} request={request}
    allowed={allowed&&cartonsAllowed} editTabs={editTabs} filter={filter} setFilter={setFilter}
    mode={tab==="box-history"?"history":"boxes"}
    historyActive={tab==="box-history"}
    onHistoryToggle={()=>setTab(value=>value==="box-history"?"boxes":"box-history")}
    onReturnToBoxes={()=>setTab("boxes")}
    onDownload={openExport} downloadDisabled={!rows.length}
    onChanged={reload}
   />
  </>}
  {exportOpen&&<StageExportDialog title="Export Box Distribution" columnOptions={exportColumns} columns={columns} groups={kits} groupKeys={selectedGroups}
   onSelectAllColumns={()=>setColumns(exportColumns.map(c=>c.key))} onToggleColumn={toggleExportColumn}
   onSelectAllGroups={()=>setSelectedGroups([])} onToggleGroup={toggleKit} busy={exportBusy} onClose={()=>setExportOpen(false)} onCSV={exportCsv} onPDF={exportPdf}/>}
 </div>;
}
