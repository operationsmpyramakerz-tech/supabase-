"use client";
import PreparingSelect from "./PreparingSelect";
import StageQuantityInput from "./StageQuantityInput";
import { useEffect,useMemo,useState } from "react";
const number=value=>Number(value)||0;
const sourceKits=component=>Array.isArray(component?.source_kits)?component.source_kits:[];
const matchesKit=(c,kit)=>kit==="General"?!sourceKits(c).length:sourceKits(c).some(x=>x?.kitName===kit);
const matches=(c,l)=>c.product_id===l.product_id&&String(c.product_name||"").trim().toLowerCase()===String(l.product_name||"").trim().toLowerCase();
const ident=c=>`${c.product_id||""}\u0000${String(c.product_name||"").trim().toLowerCase()}`;
export default function ProjectKitCartons({projectId,projectName,stageRecords=[],request,allowed,onClose}) {
  const [data,setData]=useState(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [activeId,setActiveId]=useState(""),[newLabel,setNewLabel]=useState(""),[newKit,setNewKit]=useState(""),[newNotes,setNewNotes]=useState("");
  const [search,setSearch]=useState(""),[quantities,setQuantities]=useState({});
  const [chosenLine,setChosenLine]=useState(""),[chosenSchool,setChosenSchool]=useState(""),[chosenComponent,setChosenComponent]=useState(""),[allocateQty,setAllocateQty]=useState("1");
  const active=data?.cartons.find(c=>c.id===activeId);
  const cartonLines=useMemo(()=>data?.lines.filter(l=>l.carton_id===activeId)||[],[data,activeId]);
  const allAllocations=data?.allocations||[];
  const availability=line=>Math.max(0,number(line.packed_qty)-allAllocations.filter(a=>a.carton_line_id===line.id&&a.status==="active").reduce((sum,a)=>sum+number(a.allocated_qty),0));
  const selectedLine=cartonLines.find(l=>l.id===chosenLine);
  const matchingSchools=(data?.schools||[]).filter(s=>(data?.components||[]).some(c=>c.school_id===s.id&&selectedLine&&matches(c,selectedLine)&&matchesKit(c,active?.kit_name)));
  const suitableComponents=(data?.components||[]).filter(c=>c.school_id===chosenSchool&&selectedLine&&matches(c,selectedLine)&&matchesKit(c,active?.kit_name));
  const sourceRows=useMemo(()=>{
    const byKey=new Map();
    for(const c of data?.components||[])if(active&&matchesKit(c,active.kit_name)&&!byKey.has(ident(c)))byKey.set(ident(c),c);
    return [...byKey.values()].filter(c=>c.product_name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.product_name.localeCompare(b.product_name));
  },[data,active,search]);
  async function refresh(nextId="") {
    const v=await request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=cartons`);
    setData(v);setActiveId(old=>nextId||(v.cartons.some(c=>c.id===old)?old:(v.cartons.find(c=>c.status!=="cancelled")?.id||"")));
    return v;
  }
  useEffect(()=>{let active=true;request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=cartons`)
    .then(v=>{if(active){setData(v);setActiveId(v.cartons.find(c=>c.status!=="cancelled")?.id||"");}})
    .catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectId]);
  useEffect(()=>{setChosenLine("");setChosenSchool("");setChosenComponent("");setSearch("");setQuantities({});},[activeId]);
  useEffect(()=>{setChosenSchool("");setChosenComponent("");},[chosenLine]);
  useEffect(()=>{setChosenComponent("");},[chosenSchool]);
  async function perform(task,success,nextId=""){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{const res=await task();await refresh(nextId||(res?.result?.id||""));setNotice(success);}catch(e){setError(e.message||"Action failed.");}
    finally{setBusy(false);}
  }
  const write=(action,body)=>request("/project-cartons","PATCH",{action,projectId,...body});
  async function create(){const chosen=newKit.trim();if(!chosen||newLabel.trim().length<2)return;
    await perform(()=>request("/project-cartons","POST",{action:"create",projectId,cartonLabel:newLabel.trim(),kitName:chosen,notes:newNotes}),"Project carton created. Add its contents before sealing.");
    setNewLabel("");setNewNotes("");
  }
  function setLine(c){const existing=cartonLines.find(l=>ident(l)===ident(c));const value=quantities[ident(c)]??String(existing?.packed_qty||0);
    if(!/^\d+$/.test(value)||Number(value)>1000000){setError("Enter an integer quantity from 0 to 1,000,000.");return;}
    perform(()=>write("set_line",{cartonId:active.id,sourceComponentId:c.id,quantity:Number(value),expectedUpdatedAt:active.updated_at}),
      `Saved ${c.product_name}.`,active.id);
  }
  function allocate(){if(!selectedLine||!chosenSchool||!chosenComponent||!/^\d+$/.test(allocateQty)||Number(allocateQty)<1||Number(allocateQty)>availability(selectedLine)){
      setError("Select a school, matching Proposal item, and a quantity within the free carton balance.");return;}
    perform(()=>write("allocate",{cartonLineId:selectedLine.id,schoolId:chosenSchool,componentId:chosenComponent,quantity:Number(allocateQty)}),
      "Allocation created. Open the school's Delivery page to dispatch and record signed receipt.",activeId);
  }
  function reverse(a){if(!window.confirm("Reverse this UNDISPATCHED allocation? Its linked school delivery draft will be cancelled and the units returned to the project carton."))return;
    perform(()=>write("reverse",{allocationId:a.id}),"Draft allocation reversed and quantity released.",activeId);
  }
  function cancel(){if(!window.confirm("Cancel this project carton? This is only possible with no active allocations."))return;
    perform(()=>write("cancel",{cartonId:activeId}),"Project carton cancelled.");
  }
  const completedSchool=id=>stageRecords.some(s=>s.school_id===id&&s.stage_key==="preparing"&&s.status==="completed");
  const activeAllocations=allAllocations.filter(a=>a.carton_id===activeId);
  return <div className="pr-delivery pr-pool">
    <div className="pr-manifest-title"><div><h3>Project Kit Cartons</h3></div><button className="pr-secondary" type="button" onClick={onClose}>Close</button></div>
    {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
    {!data?<p className="pr-muted">Loading project cartons…</p>:<>

      <div className="pr-qty-summary">{[["Project cartons",data.cartons.filter(c=>c.status!=="cancelled").length],["Packed units",data.lines.filter(l=>data.cartons.some(c=>c.id===l.carton_id&&c.status!=="cancelled")).reduce((s,l)=>s+number(l.packed_qty),0)],["Allocated",data.allocations.filter(a=>a.status==="active").reduce((s,a)=>s+number(a.allocated_qty),0)],["Captured schools",new Set(data.components.map(c=>c.school_id)).size]].map(([name,n])=><div key={name}><small>{name}</small><strong>{n}</strong></div>)}</div>
      {allowed&&<div className="pr-delivery-create pr-pool-create"><label className="pr-field">Kit type<PreparingSelect value={newKit} onChange={e=>setNewKit(e.target.value)}><option value="">Choose Kit</option>{data.kits.map(k=><option value={k} key={k}>{k}</option>)}</PreparingSelect></label><label className="pr-field">Carton label<input maxLength={100} value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="G2-CARTON-01"/></label><label className="pr-field">Notes (optional)<input maxLength={1000} value={newNotes} onChange={e=>setNewNotes(e.target.value)}/></label><button className="pr-primary" disabled={busy||!newKit||newLabel.trim().length<2} onClick={create}>Create carton</button></div>}
      {!data.kits.length&&<p className="pr-hint">Capture Proposal Components for at least one school to discover the available Kit types.</p>}
      <div className="pr-carton-pills">{data.cartons.filter(c=>c.status!=="cancelled").map(c=><button key={c.id} className={`pr-carton-pill ${c.id===activeId?"selected":""}`} onClick={()=>setActiveId(c.id)}><strong>{c.carton_label}</strong><small>{c.kit_name} · {c.status}</small></button>)}</div>
      {!active?<p className="pr-muted">Create or choose a project-level Kit carton to begin.</p>:<div className="pr-carton-detail">
        <div className="pr-delivery-toolbar"><div><h4>{active.carton_label} · {active.kit_name}</h4><p className="pr-muted">{active.status} · {cartonLines.length} item types · {cartonLines.reduce((s,l)=>s+number(l.packed_qty),0)} packed units</p></div><div className="pr-carton-actions">{allowed&&active.status==="draft"&&<button className="pr-primary" disabled={busy||!cartonLines.length} onClick={()=>perform(()=>write("seal",{cartonId:activeId,expectedUpdatedAt:active.updated_at}),"Carton sealed and ready for allocation.",activeId)}>Seal & Ready</button>}{allowed&&<button className="pr-secondary" disabled={busy} onClick={cancel}>Cancel carton</button>}</div></div>
        {active.status==="draft"&&<><label className="pr-search"><input placeholder="Search project components" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="pr-delivery-lines">{sourceRows.map(c=>{const current=cartonLines.find(l=>ident(l)===ident(c));return <div key={ident(c)} className="pr-delivery-line"><div><strong>{c.product_name}</strong><small>{c.product_id||"Named Proposal item"}</small></div><div className="pr-line-input"><StageQuantityInput aria-label={`Packed ${c.product_name}`} min="0" step="1" max="1000000" disabled={!allowed||busy} value={quantities[ident(c)]??String(current?.packed_qty||0)} onValueChange={value=>setQuantities(v=>({...v,[ident(c)]:value}))}/>{allowed&&<button className="pr-secondary" disabled={busy} onClick={()=>setLine(c)}>Save</button>}</div></div>;})}{!sourceRows.length&&<p className="pr-muted">No matching components in this Kit.</p>}</div></>}
        {active.status==="ready"&&<><h4>Allocate to beneficiary schools</h4><p className="pr-muted">Each allocation creates one linked school delivery batch. Only allocate after that school has completed Sorting & Preparing. Multiple schools can use one central carton.</p>
          <div className="pr-delivery-fields"><label className="pr-field">Carton component<PreparingSelect value={chosenLine} onChange={e=>setChosenLine(e.target.value)}><option value="">Choose product</option>{cartonLines.map(l=><option key={l.id} value={l.id} disabled={availability(l)===0}>{l.product_name} · {availability(l)} available</option>)}</PreparingSelect></label><label className="pr-field">School<PreparingSelect value={chosenSchool} onChange={e=>setChosenSchool(e.target.value)}><option value="">Choose school</option>{matchingSchools.map(s=><option key={s.id} value={s.id}>{s.beneficiary_name}{completedSchool(s.id)?"":" · preparing not completed"}</option>)}</PreparingSelect></label></div>
          <div className="pr-delivery-fields"><label className="pr-field">School Proposal item<PreparingSelect value={chosenComponent} onChange={e=>setChosenComponent(e.target.value)}><option value="">Choose line</option>{suitableComponents.map(c=><option key={c.id} value={c.id}>{c.product_name} · Required {c.planned_qty} / Prepared {c.prepared_qty}</option>)}</PreparingSelect></label><label className="pr-field">Quantity to allocate<StageQuantityInput step="1" min="1" max={selectedLine?availability(selectedLine):1} value={allocateQty} onValueChange={setAllocateQty}/></label></div>
          {allowed&&<button className="pr-primary" disabled={busy||!selectedLine||!chosenSchool||!chosenComponent||!completedSchool(chosenSchool)} onClick={allocate}>Allocate to School</button>}
          <p className="pr-hint">Quantity is validated against the physical project carton balance AND the school prepared quantity in one database transaction. School receipt and dispatch remain on the School Delivery page.</p>
        </>}
        <div className="pr-delivery-toolbar"><h4>Carton contents</h4></div>{cartonLines.map(l=><div className="pr-delivery-line" key={l.id}><div><strong>{l.product_name}</strong><small>{l.product_id||"Named component"}</small></div><div><strong>{l.packed_qty}</strong><small className="pr-muted">{availability(l)} free</small></div></div>)}
        <div className="pr-delivery-toolbar"><h4>School allocations ({activeAllocations.filter(a=>a.status==="active").length} active)</h4></div>
        {activeAllocations.map(a=><div className="pr-delivery-line" key={a.id}><div><strong>{data.schools.find(s=>s.id===a.school_id)?.beneficiary_name||"School"}</strong><small>{data.components.find(c=>c.id===a.component_id)?.product_name||"Component"} · {a.allocated_qty} units · {a.status}</small><small>Shipment: {a.shipment_id}</small></div>{allowed&&a.status==="active"&&<button className="pr-secondary" disabled={busy} onClick={()=>reverse(a)}>Reverse if Draft</button>}</div>)}
        {!activeAllocations.length&&<p className="pr-muted">No allocations for this carton yet.</p>}
      </div>}
    </>}
  </div>;
}
