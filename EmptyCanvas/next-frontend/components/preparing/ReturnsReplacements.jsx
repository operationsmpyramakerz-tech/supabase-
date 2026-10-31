"use client";
import PreparingSelect from "./PreparingSelect";
import {useEffect,useMemo,useState} from "react";
import {reconciliationBalance} from "../../lib/preparing-reconciliation-math";
const n=v=>Number(v)||0;
const count=v=>/^\d+$/.test(String(v).trim())&&Number.isSafeInteger(Number(v))&&Number(v)>0;
const date=v=>v?new Date(v).toLocaleDateString("en-GB"):"—";
const csvCell=value=>{const raw=String(value??"");const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
function downloadCsv(rows,filename){const content="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const initial={componentId:"",shipmentId:"",quantity:"",reference:"",reason:"",evidenceUrl:""};
export default function ReturnsReplacements({schoolId,schoolName,stageStatuses=[],allowed,request,onClose,onOpenDelivery}){
 const [data,setData]=useState({components:[],shipments:[],lines:[],returns:[],replacements:[],audit:[]});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [mode,setMode]=useState("replacement"),[draft,setDraft]=useState(initial);
 const status=key=>stageStatuses.find(s=>s.stage_key===key)?.status||"not_started";
 const deliveredLocked=["delivery_closing","installation","testing","final_closing"].some(k=>status(k)==="completed");
 const replacementLocked=deliveredLocked||status("delivery")==="completed";
 const batches=useMemo(()=>new Map(data.shipments.map(s=>[s.id,s])),[data.shipments]);
 const totals=useMemo(()=>new Map(data.components.map(c=>{
   const gross=data.lines.filter(l=>l.component_id===c.id&&batches.get(l.shipment_id)?.status==="delivered").reduce((a,l)=>a+n(l.received_qty),0);
   const returns=data.returns.filter(r=>r.component_id===c.id).reduce((a,r)=>a+n(r.quantity),0);
   const pending=data.replacements.filter(r=>r.component_id===c.id&&["draft","dispatched"].includes(batches.get(r.shipment_id)?.status)).reduce((a,r)=>a+n(r.quantity),0);
   const balance=reconciliationBalance(c.planned_qty,gross,returns,pending);
   return [c.id,{gross,returns,net:balance.net,pending,due:balance.outstanding}];
 })),[data,batches]);
 const options=data.lines.filter(l=>batches.get(l.shipment_id)?.status==="delivered"&&n(l.received_qty)>0).map(l=>{
   const prev=data.returns.filter(r=>r.shipment_id===l.shipment_id&&r.component_id===l.component_id).reduce((a,r)=>a+n(r.quantity),0);
   const c=data.components.find(c=>c.id===l.component_id);
   return {...l,available:n(l.received_qty)-prev,label:`${batches.get(l.shipment_id)?.carton_label} · ${c?.product_name||"Component"} · ${n(l.received_qty)-prev} returnable`};
 }).filter(l=>l.available>0);
 const selectedReturn=options.find(l=>`${l.shipment_id}:${l.component_id}`===draft.shipmentId);
 const selectedComponent=data.components.find(c=>c.id===draft.componentId);
 async function refresh(){const value=await request(`/reconciliation?schoolId=${encodeURIComponent(schoolId)}`);setData(value);setLoading(false);return value;}
 useEffect(()=>{let active=true;request(`/reconciliation?schoolId=${encodeURIComponent(schoolId)}`).then(v=>{if(active){setData(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[schoolId]);
 async function run(fn,message){if(busy)return;setBusy(true);setError("");setNotice("");try{await fn();await refresh();setDraft(initial);setNotice(message);}catch(e){setError(e.message||"Operation failed");}finally{setBusy(false);}}
 function exportLedger(){
  const rows=[["School","Entry type","Component","Shipment","Qty","Reference","Status","Reason","Date","Evidence HTTPS"]];
  for(const r of data.returns){const c=data.components.find(c=>c.id===r.component_id);const batch=batches.get(r.shipment_id);rows.push([schoolName,"Physical return",c?.product_name||"",batch?.carton_label||"",r.quantity,r.reference,"recorded",r.reason,r.created_at,r.evidence_url||""]);}
  for(const r of data.replacements){const c=data.components.find(c=>c.id===r.component_id);const batch=batches.get(r.shipment_id);rows.push([schoolName,"Replacement",c?.product_name||"",batch?.carton_label||"",r.quantity,r.reference,batch?.status||"",r.reason,r.created_at,""]);}
  downloadCsv(rows,`school-reconciliation-${schoolId}.csv`);
 }
 function submit(){
  if(!count(draft.quantity)){setError("Enter a positive whole number.");return;}
  if(draft.reference.trim().length<2||draft.reason.trim().length<10){setError("Signed reference (2+ characters) and documented reason (10+ characters) required.");return;}
  const isReturn=mode==="return";
  const item=isReturn?selectedReturn:selectedComponent;
  if(!item){setError("Select a component or signed receipt.");return;}
  const limit=isReturn?selectedReturn.available:totals.get(selectedComponent.id)?.due;
  if(Number(draft.quantity)>limit){setError(`Quantity exceeds available limit (${limit}).`);return;}
  if(!window.confirm(isReturn?"Record this physically returned quantity? This entry cannot be deleted or changed.":"Create a controlled replacement batch for this outstanding quantity?"))return;
  const payload={action:isReturn?"return":"replacement",schoolId,componentId:isReturn?selectedReturn.component_id:draft.componentId,
   ...(isReturn?{shipmentId:selectedReturn.shipment_id,evidenceUrl:draft.evidenceUrl}:{}),quantity:Number(draft.quantity),reference:draft.reference,reason:draft.reason};
  run(()=>request("/reconciliation","POST",payload),isReturn?"Return recorded. Net school receipt updated.":"Replacement batch created. Open Delivery to dispatch and obtain signed receipt.");
 }
 function cancel(batch){if(!window.confirm(`Cancel draft replacement ${batches.get(batch.shipment_id)?.carton_label}?`))return;
  run(()=>request("/reconciliation","PATCH",{action:"cancel_replacement",schoolId,shipmentId:batch.shipment_id,
   expectedUpdatedAt:batches.get(batch.shipment_id)?.updated_at}),"Draft replacement cancelled; reservation released.");}
 return <div className="pr-delivery pr-reconciliation">
  <div className="pr-manifest-title"><div><h3>Returns & Replacements</h3></div><button className="pr-secondary" onClick={onClose}>Close</button></div>
  {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading reconciliation records…</p>:<>

   <div className="pr-delivery-toolbar"><h4>Reconciliation by component</h4><div className="pr-carton-actions"><button className="pr-secondary" type="button" onClick={exportLedger}>Export Ledger CSV</button>{onOpenDelivery&&<button className="pr-secondary" type="button" onClick={onOpenDelivery}>Open Delivery</button>}</div></div>
   <div className="pr-delivery-lines">{data.components.map(c=>{const t=totals.get(c.id);return <div className="pr-delivery-line" key={c.id}><div><strong>{c.product_name}</strong><small>Required {c.planned_qty} · Gross signed {t.gross} · Returned {t.returns} · Net {t.net}</small></div><div><strong>{t.due} outstanding</strong><small>{t.pending} replacement units pending</small></div></div>;})}</div>
   {allowed&&<div className="pr-delivery-action"><h4>New reconciliation entry</h4><div className="pr-carton-pills"><button className={`pr-carton-pill ${mode==="replacement"?"selected":""}`} type="button" onClick={()=>{setMode("replacement");setDraft(initial);}}>Replacement</button><button className={`pr-carton-pill ${mode==="return"?"selected":""}`} type="button" onClick={()=>{setMode("return");setDraft(initial);}}>Physical return</button></div>
    {mode==="replacement"&&replacementLocked&&<p className="pr-hint">To issue a replacement, reopen School Delivery (stage 5), then any later completed stages first. This protects existing approvals.</p>}
    {mode==="return"&&deliveredLocked&&<p className="pr-hint">To record a physical return, reopen Delivery Handover (stage 6) and later completed stages first.</p>}
    {mode==="replacement"?<label className="pr-field">Missing component<PreparingSelect value={draft.componentId} disabled={busy} onChange={e=>setDraft(d=>({...d,componentId:e.target.value}))}><option value="">Choose component</option>{data.components.filter(c=>totals.get(c.id)?.due>0&&totals.get(c.id)?.gross>0).map(c=><option key={c.id} value={c.id}>{c.product_name} · {totals.get(c.id).due} outstanding</option>)}</PreparingSelect></label>:
     <label className="pr-field">Original signed receipt / component<PreparingSelect value={draft.shipmentId} disabled={busy} onChange={e=>setDraft(d=>({...d,shipmentId:e.target.value}))}><option value="">Select signed receipt</option>{options.map(l=><option key={`${l.shipment_id}:${l.component_id}`} value={`${l.shipment_id}:${l.component_id}`}>{l.label}</option>)}</PreparingSelect></label>}
    <div className="pr-delivery-fields"><label className="pr-field">Quantity<input type="number" min="1" step="1" disabled={busy} value={draft.quantity} onChange={e=>setDraft(d=>({...d,quantity:e.target.value}))}/></label><label className="pr-field">{mode==="return"?"Signed return reference":"Replacement approval reference"}<input maxLength={160} disabled={busy} value={draft.reference} onChange={e=>setDraft(d=>({...d,reference:e.target.value}))}/></label></div>
    <label className="pr-field">Reason (required, min 10 characters)<textarea rows={2} maxLength={1500} disabled={busy} value={draft.reason} onChange={e=>setDraft(d=>({...d,reason:e.target.value}))}/></label>
    {mode==="return"&&<label className="pr-field">Signed return evidence (optional HTTPS)<input type="url" maxLength={2048} disabled={busy} value={draft.evidenceUrl} onChange={e=>setDraft(d=>({...d,evidenceUrl:e.target.value}))}/></label>}
    <button className="pr-primary" type="button" disabled={busy||(mode==="return"?deliveredLocked:replacementLocked)||!count(draft.quantity)} onClick={submit}>{busy?"Saving…":mode==="return"?"Record signed return":"Create replacement batch"}</button>
   </div>}
   <div className="pr-delivery-toolbar"><h4>Replacement batches ({data.replacements.length})</h4></div>
   <div className="pr-delivery-lines">{data.replacements.map(r=>{const s=batches.get(r.shipment_id);const c=data.components.find(c=>c.id===r.component_id);return <div className="pr-delivery-line" key={r.id}><div><strong>{s?.carton_label} · {c?.product_name}</strong><small>{r.quantity} units · {s?.status||"unknown"} · Reference: {r.reference}</small><small>{r.reason}</small></div>{allowed&&s?.status==="draft"&&<button className="pr-secondary" type="button" disabled={busy} onClick={()=>cancel(r)}>Cancel draft</button>}</div>;})}{!data.replacements.length&&<p className="pr-muted">No replacement batches yet.</p>}</div>
   <div className="pr-delivery-toolbar"><h4>Signed physical returns ({data.returns.length})</h4></div>
   <div className="pr-delivery-lines">{data.returns.map(r=>{const c=data.components.find(c=>c.id===r.component_id);return <div className="pr-delivery-line" key={r.id}><div><strong>{c?.product_name} · {r.quantity} returned</strong><small>Reference: {r.reference} · {date(r.created_at)}</small><small>{r.reason}</small>{r.evidence_url&&<a href={r.evidence_url} target="_blank" rel="noopener noreferrer">Evidence</a>}</div></div>;})}{!data.returns.length&&<p className="pr-muted">No returns recorded.</p>}</div>

  </>}
 </div>;
}
