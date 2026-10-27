"use client";
import { useEffect, useMemo, useState } from "react";

const num = v => Number(v) || 0;
const validInt = v => /^\d+$/.test(String(v).trim()) && Number.isSafeInteger(Number(v));
const csvCell = value => {const raw=String(value??"");const safe=/^\s*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
const kitNames = source => (Array.isArray(source)?source:[]).map(item=>item?.kitName).filter(Boolean).join(" · ");
function downloadCsv(rows, filename) {
  const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const emptyTransport={carrier:"",trackingReference:"",notes:""};

export default function PackingDelivery({schoolId,schoolName,proposalName,request,allowed,stageStatuses=[],onClose}) {
  const [data,setData]=useState({shipments:[],lines:[],components:[],returns:[],projectAllocationShipmentIds:[],replacementShipmentIds:[]});
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [cartonId,setCartonId]=useState("");
  const [cartonLabel,setCartonLabel]=useState("");
  const [draftTransport,setDraftTransport]=useState(emptyTransport);
  const [packingDraft,setPackingDraft]=useState({});
  const [receiptDraft,setReceiptDraft]=useState({});
  const [recipient,setRecipient]=useState("");
  const [receiptReference,setReceiptReference]=useState("");
  const [receiptUrl,setReceiptUrl]=useState("");
  const [deliveryNotes,setDeliveryNotes]=useState("");
  const [query,setQuery]=useState("");
  const shipment=data.shipments.find(s=>s.id===cartonId);
  const projectLinked=Array.isArray(data.projectAllocationShipmentIds)&&data.projectAllocationShipmentIds.includes(cartonId);
  const replacementLinked=Array.isArray(data.replacementShipmentIds)&&data.replacementShipmentIds.includes(cartonId);
  const activeBatchIds=useMemo(()=>new Set(data.shipments.filter(s=>s.status!=="cancelled").map(s=>s.id)),[data.shipments]);
  const lines=useMemo(()=>data.lines.filter(l=>l.shipment_id===cartonId),[data.lines,cartonId]);
  const lineByComponent=useMemo(()=>new Map(lines.map(l=>[l.component_id,l])),[lines]);
  const packedByComponent=useMemo(()=>{
    const totals=new Map();for(const l of data.lines)if(activeBatchIds.has(l.shipment_id))totals.set(l.component_id,(totals.get(l.component_id)||0)+num(l.packed_qty));return totals;
  },[data.lines,activeBatchIds]);
  const returnedByComponent=useMemo(()=>{const totals=new Map();for(const r of data.returns)totals.set(r.component_id,(totals.get(r.component_id)||0)+num(r.quantity));return totals;},[data.returns]);
  const receivedByComponent=useMemo(()=>{
    const totals=new Map();for(const l of data.lines)if(activeBatchIds.has(l.shipment_id))totals.set(l.component_id,(totals.get(l.component_id)||0)+num(l.received_qty));return totals;
  },[data.lines,activeBatchIds]);
  const summary=useMemo(()=>{
    const required=data.components.reduce((a,c)=>a+num(c.planned_qty),0);
    const packed=data.lines.filter(l=>activeBatchIds.has(l.shipment_id)).reduce((a,l)=>a+num(l.packed_qty),0);
    const gross=data.lines.filter(l=>activeBatchIds.has(l.shipment_id)).reduce((a,l)=>a+num(l.received_qty),0);
    const returned=data.returns.reduce((a,r)=>a+num(r.quantity),0);
    const delivered=gross-returned;
    return {required,packed,gross,returned,delivered,packingGap:Math.max(0,required-packed),deliveryGap:Math.max(0,required-delivered)};
  },[data.components,data.lines,data.returns,activeBatchIds]);
  const components=data.components.filter(c=>`${c.product_name} ${kitNames(c.source_kits)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const statusOf=k=>stageStatuses.find(s=>s.stage_key===k)?.status || "not_started";
  const preparingComplete=statusOf("preparing")==="completed";
  const packingLocked=["packing","delivery","delivery_closing","installation","testing","final_closing"].some(k=>statusOf(k)==="completed");
  const packingComplete=statusOf("packing")==="completed";
  const canPack=allowed&&preparingComplete&&!packingLocked;
  async function refresh(nextId="") {
    const json=await request(`/shipments?schoolId=${encodeURIComponent(schoolId)}`);
    const next={shipments:json.shipments||[],lines:json.lines||[],components:json.components||[],projectAllocationShipmentIds:json.projectAllocationShipmentIds||[],returns:json.returns||[],replacementShipmentIds:json.replacementShipmentIds||[]};
    setData(next);setLoaded(true);
    setCartonId(current=>{
      const value=nextId||current;
      return next.shipments.some(s=>s.id===value&&s.status!=="cancelled")?value:(next.shipments.find(s=>s.status!=="cancelled")?.id||"");
    });
    return next;
  }
  useEffect(()=>{
    let active=true;
    request(`/shipments?schoolId=${encodeURIComponent(schoolId)}`).then(json=>{
      if(!active)return;
      const next={shipments:json.shipments||[],lines:json.lines||[],components:json.components||[],projectAllocationShipmentIds:json.projectAllocationShipmentIds||[],returns:json.returns||[],replacementShipmentIds:json.replacementShipmentIds||[]};
      setData(next);setCartonId(next.shipments.find(s=>s.status!=="cancelled")?.id||"");setLoaded(true);
    }).catch(err=>{if(active){setError(err.message);setLoaded(true);}});
    return()=>{active=false;};
  },[schoolId]);
  useEffect(()=>{
    setPackingDraft(Object.fromEntries(lines.map(l=>[l.component_id,String(l.packed_qty)])));
    setReceiptDraft(Object.fromEntries(lines.map(l=>[l.component_id,String(l.packed_qty)])));
    setDraftTransport({carrier:shipment?.carrier||"",trackingReference:shipment?.tracking_reference||"",notes:shipment?.notes||""});
    setRecipient(shipment?.recipient_name||"");setReceiptReference(shipment?.receipt_reference||"");
    setReceiptUrl(shipment?.receipt_url||"");setDeliveryNotes(shipment?.delivery_notes||"");
    setQuery("");
  },[cartonId,data]);
  async function run(task, success) {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {const result=await task();await refresh(result?.result?.id||"");setNotice(success);}
    catch(err){setError(err.message||"Action failed.");}
    finally{setBusy(false);}
  }
  function create() {
    if(cartonLabel.trim().length<2){setError("Add a unique carton / packing label.");return;}
    run(()=>request("/shipments","POST",{action:"create",schoolId,cartonLabel:cartonLabel.trim()}),"Carton created. Assign its components below.");
    setCartonLabel("");
  }
  function savePacked(component) {
    const current=lineByComponent.get(component.id);
    const input=packingDraft[component.id]??String(current?.packed_qty||0);
    if(!validInt(input)){setError("Packed count must be a non-negative whole number.");return;}
    run(()=>request("/shipments","PATCH",{action:"pack",schoolId,shipmentId:cartonId,componentId:component.id,
      quantity:Number(input),expectedUpdatedAt:current?.updated_at||null}),`Saved packing for ${component.product_name}.`);
  }
  function cancelCarton() {
    if(!window.confirm(`Cancel carton ${shipment.carton_label}? Its packed items will return to the unallocated balance.`))return;
    run(()=>request("/shipments","PATCH",{action:"cancel",schoolId,shipmentId:cartonId,expectedUpdatedAt:shipment.updated_at}),"Draft carton cancelled and packed quantities released.");
  }
  function dispatch() {
    if(!window.confirm(`Dispatch carton ${shipment.carton_label}? This locks the carton contents.`))return;
    run(()=>request("/shipments","PATCH",{action:"dispatch",schoolId,shipmentId:cartonId,
      ...draftTransport,expectedUpdatedAt:shipment.updated_at}),"Carton marked dispatched. Record school receipt when signed.");
  }
  function confirmReceipt() {
    if(!recipient.trim()||!receiptReference.trim()){setError("School recipient and signed receipt reference are required.");return;}
    const items=lines.map(line=>({componentId:line.component_id,received:receiptDraft[line.component_id]}));
    if(items.some(i=>!validInt(i.received)||Number(i.received)>num(lineByComponent.get(i.componentId)?.packed_qty))){setError("Received must be a whole number within each packed count.");return;}
    const discrepancies=items.some(i=>Number(i.received)!==num(lineByComponent.get(i.componentId)?.packed_qty));
    if(!window.confirm(discrepancies?"Some received counts are lower than dispatched. Record this discrepancy? Delivery closing will remain blocked until reconciled.":"Confirm signed receipt? The record will be locked and audited."))return;
    run(()=>request("/shipments","PATCH",{action:"receive",schoolId,shipmentId:cartonId,
      items:items.map(i=>({...i,received:Number(i.received)})),recipientName:recipient,
      receiptReference,receiptUrl,deliveryNotes,expectedUpdatedAt:shipment.updated_at}),"School handover recorded. Review the final delivery quantity balance.");
  }
  function exportPacking() {
    const rows=[["Project school",schoolName],["Proposal",proposalName],["Carton",shipment?.carton_label||""],["Carton status",shipment?.status||""],
      ["Transport",shipment?.carrier||""],["Waybill",shipment?.tracking_reference||""],["Recipient",shipment?.recipient_name||""],
      ["Signed receipt reference",shipment?.receipt_reference||""],[],["Component","Source kits","Required for school","Prepared","Packed in carton","Received by school"]];
    for(const l of lines){const c=data.components.find(c=>c.id===l.component_id);rows.push([c?.product_name||"",kitNames(c?.source_kits),c?.planned_qty||0,c?.prepared_qty||0,l.packed_qty,l.received_qty]);}
    downloadCsv(rows,`carton-${(shipment?.carton_label||"packing").replace(/[^\w-]/g,"_")}.csv`);
  }
  function exportReconciliation() {
    const rows=[["School",schoolName],["Proposal",proposalName],[],["Component","Source kits","Required","Prepared","Packed","Gross school receipt","Returned","Net school receipt","Packing gap","Delivery gap"]];
    for(const c of data.components){const packed=packedByComponent.get(c.id)||0;const gross=receivedByComponent.get(c.id)||0;const returned=returnedByComponent.get(c.id)||0;const net=gross-returned;
      rows.push([c.product_name,kitNames(c.source_kits),c.planned_qty,c.prepared_qty,packed,gross,returned,net,Math.max(0,c.planned_qty-packed),Math.max(0,c.planned_qty-net)]);}
    downloadCsv(rows,`school-delivery-reconciliation-${schoolId}.csv`);
  }
  return <div className="pr-delivery">
    <div className="pr-manifest-title"><div><h3>Packing & Delivery</h3></div><button className="pr-secondary" onClick={onClose}>Close</button></div>
    {error&&<div className="pr-alert" role="alert">{error}</div>}
    {notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
    {!loaded?<p className="pr-muted">Loading cartons…</p>:!data.components.length?<div className="pr-manifest-empty"><h3>Capture Proposal components first</h3><p>Open Components & QC and capture the school BOM before creating packing records.</p></div>:<>
      <div className="pr-qty-summary pr-delivery-totals">{[["Required",summary.required],["Prepared",data.components.reduce((a,c)=>a+num(c.prepared_qty),0)],["Packed",summary.packed],["Gross received",summary.gross],["Returned",summary.returned],["Net school received",summary.delivered],["To pack",summary.packingGap],["Receipt gap",summary.deliveryGap]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>

      <div className="pr-delivery-toolbar"><h4>Cartons / shipments ({data.shipments.filter(s=>s.status!=="cancelled").length})</h4><button className="pr-secondary" onClick={exportReconciliation}>Export reconciliation CSV</button></div>
      {!preparingComplete&&<p className="pr-hint">Complete Sorting & Preparing (stage 3) before making carton lists. This freezes component quantities and avoids packing figures changing during preparation.</p>}
      {canPack&&<div className="pr-delivery-create"><label className="pr-field">New carton / packing label<input maxLength={100} placeholder="30J-S01-BOX01" value={cartonLabel} onChange={e=>setCartonLabel(e.target.value)}/></label><button className="pr-primary" disabled={busy||cartonLabel.trim().length<2} onClick={create}>Add carton</button></div>}
      <div className="pr-carton-pills">{data.shipments.filter(s=>s.status!=="cancelled").map(s=><button type="button" key={s.id} className={`pr-carton-pill ${cartonId===s.id?"selected":""}`} onClick={()=>setCartonId(s.id)}><strong>{s.carton_label}</strong><small>{s.status}</small></button>)}</div>
      {!data.shipments.some(s=>s.status!=="cancelled")?<p className="pr-muted">No cartons yet. Create a carton to begin packing.</p>:shipment&&<div className="pr-carton-detail">
        <div className="pr-delivery-toolbar"><div><h4>{shipment.carton_label}</h4><p className="pr-muted">{shipment.status.toUpperCase()} · {lines.length} component lines · {lines.reduce((a,l)=>a+num(l.packed_qty),0)} packed units</p></div><div className="pr-carton-actions"><button className="pr-secondary" onClick={exportPacking}>Packing list CSV</button>{canPack&&!projectLinked&&!replacementLinked&&shipment.status==="draft"&&<button className="pr-secondary" disabled={busy} onClick={cancelCarton}>Cancel carton</button>}</div></div>
        {shipment.status==="draft"&&<>
          {projectLinked&&<p className="pr-hint">This batch was allocated from a central Project Kit Carton. Edit or reverse its quantities only in Project Kit Cartons before dispatch. The school can still dispatch and record signed receipt here.</p>}
          {replacementLinked&&<p className="pr-hint">Controlled replacement batch: quantities are locked here. Cancel draft in Returns & Replacements, or dispatch and record the signed school receipt below.</p>}
          {!projectLinked&&!replacementLinked&&<>
          <label className="pr-search pr-delivery-search"><input placeholder="Find component / kit" aria-label="Find packing component" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className="pr-delivery-lines">{components.map(c=>{const line=lineByComponent.get(c.id);const allocated=packedByComponent.get(c.id)||0;const available=Math.max(0,num(c.prepared_qty)-allocated+num(line?.packed_qty));return <div className="pr-delivery-line" key={c.id}>
            <div><strong>{c.product_name}</strong><small>{kitNames(c.source_kits)||"Proposal item"}</small><small>Required {c.planned_qty} · Prepared {c.prepared_qty} · Available for this carton {available}</small></div>
            <div className="pr-line-input"><input aria-label={`Packed ${c.product_name}`} type="number" min="0" max={available} step="1" disabled={!canPack||busy} value={packingDraft[c.id]??String(line?.packed_qty||0)} onChange={e=>setPackingDraft(prev=>({...prev,[c.id]:e.target.value}))}/>{canPack&&<button className="pr-secondary" disabled={busy} onClick={()=>savePacked(c)}>Save</button>}</div>
          </div>;})}{!components.length&&<p className="pr-muted">No matching components.</p>}</div>
          {packingLocked?<p className="pr-hint">Packing is completed. Reopen Packing (and subsequent completed stages) before editing cartons.</p>:<p className="pr-muted">Save each packed component. Enter zero to remove the component from a draft carton. Packed counts cannot exceed prepared units across all cartons.</p>}
          </>}
          {allowed&&<div className="pr-delivery-action"><h4>Dispatch details</h4><div className="pr-delivery-fields"><label className="pr-field">Transport provider / vehicle<input maxLength={160} value={draftTransport.carrier} onChange={e=>setDraftTransport(v=>({...v,carrier:e.target.value}))} placeholder="Company vehicle / carrier"/></label><label className="pr-field">Waybill / tracking (optional)<input maxLength={160} value={draftTransport.trackingReference} onChange={e=>setDraftTransport(v=>({...v,trackingReference:e.target.value}))}/></label></div><label className="pr-field">Transport notes<textarea rows={2} maxLength={1000} value={draftTransport.notes} onChange={e=>setDraftTransport(v=>({...v,notes:e.target.value}))}/></label><button className="pr-primary" disabled={busy||!packingComplete||!draftTransport.carrier.trim()||!lines.length} onClick={dispatch}>Mark Dispatched</button>{!packingComplete&&<p className="pr-hint">Complete stage 4 (Packing & Dispatch) before dispatching any carton.</p>}</div>}
        </>}
        {shipment.status==="dispatched"&&<div className="pr-delivery-action"><h4>School signed receipt</h4><p className="pr-muted">Transport: {shipment.carrier} {shipment.tracking_reference?`· ${shipment.tracking_reference}`:""}. Enter the actual quantity the school received for every component.</p><div className="pr-delivery-lines">{lines.map(l=>{const c=data.components.find(x=>x.id===l.component_id);return <div className="pr-delivery-line" key={l.component_id}><div><strong>{c?.product_name||"Component"}</strong><small>Packed {l.packed_qty}</small></div><div className="pr-line-input"><input type="number" min="0" max={l.packed_qty} step="1" disabled={!allowed||busy} aria-label={`Received ${c?.product_name||"component"}`} value={receiptDraft[l.component_id]??String(l.packed_qty)} onChange={e=>setReceiptDraft(v=>({...v,[l.component_id]:e.target.value}))}/></div></div>;})}</div>
          <div className="pr-delivery-fields"><label className="pr-field">School recipient name<input maxLength={160} disabled={!allowed} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><label className="pr-field">Signed handover / receipt reference<input maxLength={160} disabled={!allowed} value={receiptReference} onChange={e=>setReceiptReference(e.target.value)}/></label></div><label className="pr-field">Signed document URL (optional HTTPS link)<input type="url" maxLength={2048} disabled={!allowed} placeholder="https://…" value={receiptUrl} onChange={e=>setReceiptUrl(e.target.value)}/></label><label className="pr-field">Delivery notes / discrepancies<textarea maxLength={1000} rows={3} disabled={!allowed} value={deliveryNotes} onChange={e=>setDeliveryNotes(e.target.value)}/></label>
          {allowed&&<button className="pr-primary" disabled={busy||!recipient.trim()||!receiptReference.trim()} onClick={confirmReceipt}>Confirm School Receipt</button>}
          <p className="pr-hint">Confirm against the actual signed paper. This receipt is permanent; any discrepancy blocks Delivery Handover. Direct uploads are not available. For short receipts or physical returns, use Returns & Replacements in the school folder.</p>
        </div>}
        {shipment.status==="delivered"&&<div className="pr-delivery-closed"><strong>Received by: {shipment.recipient_name}</strong><span>Receipt: {shipment.receipt_reference}</span><span>Received: {lines.reduce((a,l)=>a+num(l.received_qty),0)} / {lines.reduce((a,l)=>a+num(l.packed_qty),0)} units</span>{shipment.receipt_url&&<a href={shipment.receipt_url} rel="noopener noreferrer" target="_blank">View receipt evidence</a>}{shipment.delivery_notes&&<p>{shipment.delivery_notes}</p>}</div>}
      </div>}
      {summary.deliveryGap>0&&data.shipments.some(s=>s.status==="delivered")&&<p className="pr-hint">There are {summary.deliveryGap} net accepted units outstanding after documented returns. Delivery Handover cannot be completed until quantities are reconciled.</p>}
      <p className="pr-muted">School delivery records do not debit warehouse inventory. Delivery receipts must be signed physically; optional evidence can be referenced by HTTPS link. All updates are checked and audited on the server.</p>
    </>}
  </div>;
}
