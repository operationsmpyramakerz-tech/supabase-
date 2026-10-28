"use client";
import { useEffect, useMemo, useState } from "react";
import { warehouseTotals,demandsForSchool } from "../../lib/preparing-warehouse-math.mjs";
const number=v=>Number(v)||0;
const pretty=v=>number(v).toLocaleString("en-US");
const safeCSV=v=>{const raw=String(v??"");const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
const date=v=>new Date(v).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});
const empty={schools:[],items:[],demands:[],receipts:[],receiptLines:[],allocations:[]};
export default function ProjectWarehouseReceiving({projectId,projectName,hasProjectProposal=false,canReceive,canAllocate,request,onClose}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState("receiving"),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [editing,setEditing]=useState({}),[clearConfirm,setClearConfirm]=useState(null);
 const [draft,setDraft]=useState({}),[schoolId,setSchoolId]=useState(""),[assignReference,setAssignReference]=useState(""),[assignNotes,setAssignNotes]=useState(""),[assignDraft,setAssignDraft]=useState({});
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 async function reload(){const response=await request(`/warehouse?projectId=${encodeURIComponent(projectId)}`);setState(response);setLoading(false);}
 useEffect(()=>{let active=true;request(`/warehouse?projectId=${encodeURIComponent(projectId)}`).then(v=>{if(active){setState(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[projectId]);
 const summaries=useMemo(()=>warehouseTotals(state.items||[],state.receiptLines||[],state.allocations||[]),[state]);
 const nameById=useMemo(()=>new Map(state.items.map(row=>[row.id,row.product_name])),[state]);
 const schoolsCaptured=new Set(state.demands.map(row=>row.school_id));
 const uncaptured=state.schools.filter(row=>!schoolsCaptured.has(row.id));
 const totals=useMemo(()=>summaries.reduce((sum,row)=>({required:sum.required+number(row.required_qty),accepted:sum.accepted+row.accepted,damaged:sum.damaged+row.damaged,allocated:sum.allocated+row.allocated,available:sum.available+row.available}),{required:0,accepted:0,damaged:0,allocated:0,available:0}),[summaries]);
 const shown=useMemo(()=>summaries.filter(row=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(search.toLowerCase().trim())).filter(row=>filter==="short"?row.accepted<row.required_qty:filter==="available"?row.available>0:true),[summaries,search,filter]);
 const schoolDemands=useMemo(()=>demandsForSchool(state.demands,state.allocations,schoolId),[state.demands,state.allocations,schoolId]);
 const demandsMap=useMemo(()=>new Map(schoolDemands.map(row=>[row.item_id,row])),[schoolDemands]);
 const schoolShown=shown.filter(row=>demandsMap.has(row.id));
 async function execute(action,payload) {
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try {await request("/warehouse","POST",{action,projectId,...payload});await reload();setSuccess(action==="capture"?"Project BOM captured.":action==="receive"?"Warehouse voucher recorded.":"School allocation recorded.");return true;}
  catch(e){setError(e.message||"Unable to save.");return false;}finally{setBusy(false);}
 }
 function enableReceipt(row){
  setError("");setClearConfirm(null);
  setDraft(prev=>({...prev,[row.id]:{good:String(row.accepted),damaged:String(row.damaged)}}));
  setEditing(prev=>({...prev,[row.id]:true}));
 }
 function cancelReceipt(row){
  setEditing(prev=>{const next={...prev};delete next[row.id];return next;});
  setDraft(prev=>{const next={...prev};delete next[row.id];return next;});
 }
 async function saveVoucher(onlyIds=null){
  if(!reference.trim()){setError("Enter the signed warehouse voucher / correction reference.");return;}
  const ids=onlyIds||Object.keys(editing).filter(id=>editing[id]);
  const lines=ids.map(itemId=>{
   const row=summaries.find(entry=>entry.id===itemId);
   const values=draft[itemId]||{};
   const good=Number(values.good),damaged=Number(values.damaged);
   return {itemId,accepted:good-number(row?.accepted),damaged:damaged-number(row?.damaged),good,damagedTotal:damaged};
  }).filter(line=>line.accepted!==0||line.damaged!==0);
  if(!lines.length){setError("Change at least one received quantity before saving.");return;}
  if(lines.some(line=>!Number.isSafeInteger(line.good)||!Number.isSafeInteger(line.damagedTotal)||line.good<0||line.damagedTotal<0||Math.abs(line.accepted)>1000000||Math.abs(line.damaged)>1000000)){
   setError("Enter valid non-negative whole-number quantities (up to 1,000,000 per change).");return;
  }
  const kind=lines.some(line=>line.accepted<0||line.damaged<0)?"adjustment":"receipt";
  if(await execute("receive",{kind,reference:reference.trim(),notes,lines:lines.map(({itemId,accepted,damaged})=>({itemId,accepted,damaged}))})){
   for(const itemId of ids)cancelReceipt({id:itemId});
   setReference("");setNotes("");
  }
 }
 async function clearReceipt(row){
  if(!reference.trim()){setError("Enter the signed correction reference before clearing this receipt.");return;}
  if(row.accepted===0&&row.damaged===0)return;
  if(await execute("receive",{kind:"adjustment",reference:reference.trim(),notes:notes||`Reversal for ${row.product_name}`,
      lines:[{itemId:row.id,accepted:-row.accepted,damaged:-row.damaged}]})){
    cancelReceipt(row);setClearConfirm(null);setReference("");setNotes("");
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
 function csv(){
  const rows=[["Component","Product ID","Required (Project)","Accepted from Warehouse","Damaged at Warehouse","Allocated to Schools","Available to Allocate","Warehouse Shortage"],
  ...summaries.map(r=>[r.product_name,r.product_id,r.required_qty,r.accepted,r.damaged,r.allocated,r.available,Math.max(0,r.required_qty-r.accepted)])];
  const content="\uFEFF"+rows.map(row=>row.map(safeCSV).join(",")).join("\r\n");
  const link=document.createElement("a"),url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  link.href=url;link.download=`warehouse-${projectId}.csv`;link.click();URL.revokeObjectURL(url);
 }
 return <div className="pr-wh">
  <header className="pr-manifest-title pr-wh-title"><div><span className="pr-wh-overline">PROJECT INVENTORY · {projectName}</span><h3>Warehouse Receiving</h3></div><button type="button" className="pr-secondary" onClick={onClose}>Close</button></header>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {success&&<div className="pr-manifest-success" role="status">{success}</div>}
  {loading?<p className="pr-muted">Loading warehouse records…</p>:<>
   <div className="pr-wh-stats">{[["Project required",totals.required],["Accepted",totals.accepted],["Damaged",totals.damaged],["Allocated",totals.allocated],["Available",totals.available]].map(([label,value])=><div key={label}><span>{label}</span><strong>{pretty(value)}</strong></div>)}</div>
   <div className="pr-wh-navigation" role="group" aria-label="Warehouse view">
    {[["receiving","Warehouse Receiving"],["allocation","School Allocation"],["history","Movement History"]].map(([key,label])=><button type="button" key={key} className={tab===key?"is-active":""} onClick={()=>{setTab(key);setError("");}}>{label}</button>)}
    <button type="button" className="pr-wh-export" onClick={csv} disabled={!state.items.length}>Export CSV</button>
   </div>
   {uncaptured.length>0&&<div className="pr-wh-notice"><div><strong>{uncaptured.length} school(s) need requirement capture</strong><small>{hasProjectProposal?"Capture each school’s Proposal for school allocation limits. This does not modify the project Master BOM or warehouse receipts.":"Capture linked school Proposals to calculate legacy project requirements. Existing school baselines stay frozen."}</small></div>{canReceive&&<button className="pr-primary" disabled={busy} onClick={()=>execute("capture",{})}>{busy?"Capturing…":hasProjectProposal?"Capture School Requirements":"Capture Project BOM"}</button>}</div>}
   {!!state.items.length&&<div className="pr-wh-toolbar"><label className="pr-search"><input aria-label="Search warehouse components" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Warehouse filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All components</option><option value="short">Warehouse shortage</option><option value="available">Available to allocate</option></select><button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setLoading(true);reload().catch(e=>{setLoading(false);setError(e.message);});}}>Refresh</button></div>}
   {tab==="receiving"&&<>
    {canReceive&&!!state.items.length&&<div className="pr-wh-voucher"><div className="pr-wh-voucher-head"><strong>Warehouse receiving & corrections</strong><span className="pr-wh-voucher-help">Edit quantities directly in each component row</span></div><div className="pr-wh-form"><label>Warehouse voucher / correction reference<input maxLength={160} placeholder="WH-0001" value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Notes<input maxLength={1000} placeholder="Optional notes" value={notes} onChange={e=>setNotes(e.target.value)}/></label></div><div className="pr-wh-voucher-bottom"><small>Every change is saved as a new signed voucher; earlier vouchers remain in Movement History.</small><button className="pr-primary" disabled={busy||!Object.values(editing).some(Boolean)} onClick={()=>saveVoucher()}>{busy?"Saving…":"Save Edited Quantities"}</button></div></div>}
    <div className="pr-wh-list" aria-label="Master project components">{shown.map(row=>{
     const active=!!editing[row.id],values=draft[row.id]||{};
     return <div className={`pr-wh-item pr-wh-item--editable ${active?"is-editing":""}`} key={row.id}>
      <div className="pr-wh-component-name"><strong>{row.product_name}</strong><small>{row.product_id||"Uncoded component"}</small></div>
      <div className="pr-wh-item-figures"><span><small>Required</small><b>{pretty(row.required_qty)}</b></span><span><small>Accepted</small><b>{pretty(row.accepted)}</b></span><span><small>Damaged</small><b>{pretty(row.damaged)}</b></span><span><small>Remaining</small><b className={row.required_qty>row.accepted?"pr-wh-shortage":""}>{pretty(Math.max(0,row.required_qty-row.accepted))}</b></span></div>
      <div className="pr-wh-receiving-control">
       <label>Receiving <input type="number" step="1" min="0" aria-label={`Receiving ${row.product_name}`} disabled={!active||busy} value={active?values.good??"":row.accepted} onChange={e=>setDraft(prev=>({...prev,[row.id]:{...prev[row.id],good:e.target.value}}))}/></label>
       <label>Damaged <input type="number" step="1" min="0" aria-label={`Damaged ${row.product_name}`} disabled={!active||busy} value={active?values.damaged??"":row.damaged} onChange={e=>setDraft(prev=>({...prev,[row.id]:{...prev[row.id],damaged:e.target.value}}))}/></label>
       {canReceive&&<div className="pr-wh-inline-buttons">{active?<><button type="button" className="pr-primary" disabled={busy} onClick={()=>saveVoucher([row.id])}>Save</button><button type="button" className="pr-secondary" disabled={busy} onClick={()=>cancelReceipt(row)}>Cancel</button></>:<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>enableReceipt(row)}>{row.accepted||row.damaged?"Edit":"Receive"}</button><button type="button" className="pr-pbom-delete" disabled={busy||(!row.accepted&&!row.damaged)} title="Clear using a signed reversal; original vouchers remain" onClick={()=>setClearConfirm(row)}>Delete</button></>}</div>}
      </div>
      {clearConfirm?.id===row.id&&<div className="pr-wh-inline-confirm"><strong>Clear the recorded receiving quantities?</strong><small>This creates a reversing voucher, not a deletion of warehouse history. Allocated quantities cannot be reversed.</small><button type="button" className="pr-secondary" onClick={()=>setClearConfirm(null)}>Cancel</button><button type="button" className="pr-pbom-delete" disabled={busy} onClick={()=>clearReceipt(row)}>Confirm Delete</button></div>}
     </div>;
    })}{!shown.length&&<div className="pr-wh-empty">No components to display.</div>}</div>
   </>}
   {tab==="allocation"&&<><div className="pr-wh-school-select"><label>Beneficiary school<select value={schoolId} onChange={e=>{setSchoolId(e.target.value);setAssignDraft({});}}><option value="">Select school</option>{state.schools.filter(s=>schoolsCaptured.has(s.id)).map(s=><option value={s.id} key={s.id}>{s.beneficiary_name}</option>)}</select></label>{canAllocate&&<label>Allocation reference<input placeholder="INT-0001" maxLength={160} value={assignReference} onChange={e=>setAssignReference(e.target.value)}/></label>}{canAllocate&&<label>Notes<input placeholder="Optional" maxLength={1000} value={assignNotes} onChange={e=>setAssignNotes(e.target.value)}/></label>}</div>{schoolId&&canAllocate&&<div className="pr-wh-voucher-bottom"><small>Enter quantities below to assign multiple items in one verified transaction.</small><button type="button" className="pr-primary" disabled={busy} onClick={allocateBatch}>Save School Allocation</button></div>}{schoolId?<div className="pr-wh-list" aria-label="School component allocations">{schoolShown.map(row=>{const demand=demandsMap.get(row.id);return <div key={row.id} className="pr-wh-item"><div className="pr-wh-component-name"><strong>{row.product_name}</strong><small>{row.product_id||"Uncoded component"}</small></div><div className="pr-wh-item-figures"><span><small>School required</small><b>{pretty(demand.required_qty)}</b></span><span><small>Assigned</small><b>{pretty(demand.allocated)}</b></span><span><small>Still needed</small><b>{pretty(Math.max(0,demand.required_qty-demand.allocated))}</b></span><span><small>Warehouse available</small><b>{pretty(row.available)}</b></span></div>{canAllocate&&<div className="pr-wh-assign"><input aria-label={`Allocate ${row.product_name}`} type="number" step="1" placeholder="+ / − qty" value={assignDraft[row.id]??""} onChange={e=>setAssignDraft(s=>({...s,[row.id]:e.target.value}))}/><button type="button" className="pr-secondary" disabled={busy} onClick={()=>allocateItem(row)}>Assign</button></div>}</div>;})}{!schoolShown.length&&<div className="pr-wh-empty">No matching school items.</div>}</div>:<div className="pr-wh-empty">Select a school to view and allocate its component requirements.</div>}</>}
   {tab==="history"&&<div className="pr-wh-history"><h4>Warehouse vouchers</h4>{state.receipts.map(row=><div className="pr-wh-history-entry" key={row.id}><strong>{row.reference}</strong><span>{row.kind} · {date(row.created_at)}</span><small>{state.receiptLines.filter(l=>l.receipt_id===row.id).map(l=>`${nameById.get(l.item_id)||"Component"}: ${l.accepted_delta>=0?"+":""}${l.accepted_delta} accepted / ${l.damaged_delta>=0?"+":""}${l.damaged_delta} damaged`).join(" · ")}</small>{row.notes&&<small>{row.notes}</small>}</div>)}{!state.receipts.length&&<p className="pr-muted">No warehouse vouchers yet.</p>}<h4>School allocation movements</h4>{state.allocations.map(row=><div key={row.id} className="pr-wh-history-entry"><strong>{row.reference}</strong><span>{date(row.created_at)} · {state.schools.find(s=>s.id===row.school_id)?.beneficiary_name||"School"}</span><small>{nameById.get(row.item_id)||"Component"} · {row.delta_qty>0?"+":""}{row.delta_qty} units</small>{row.notes&&<small>{row.notes}</small>}</div>)}{!state.allocations.length&&<p className="pr-muted">No allocations yet.</p>}</div>}
  </>}
 </div>;
}
