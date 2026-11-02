"use client";

import {useEffect,useMemo,useState} from "react";
import PreparingSelect from "./PreparingSelect";
import ProjectProductPicker from "./ProjectProductPicker";
import {warehouseTotals,projectRequired} from "../../lib/preparing-warehouse-math.mjs";

const empty={items:[],receiptLines:[],allocations:[],demands:[],kitGroups:[],bomAudit:[]};
const fmt=value=>Number(value||0).toLocaleString("en-US");
const groupKey=kit=>kit?.kitId?`id:${String(kit.kitId).toLowerCase()}`:`name:${String(kit?.kitName||"").toLowerCase()}`;

function BomIcon({name="box",size=21}) {
 const shapes={
  layers:<><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z"/><path d="m3.5 11 8.5 4.5 8.5-4.5M3.5 15.5 12 20l8.5-4.5"/></>,
  box:<><path d="M12 2 3.5 6.7 12 11.5l8.5-4.8L12 2Z"/><path d="M3.5 6.7v10L12 22l8.5-5.3v-10M12 11.5V22"/></>,
  clipboard:<><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5h6V2H9v2.5ZM9 12l2 2 4-4M9 18h6"/></>,
  cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  pencil:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8M4 20h16"/></>,
  laser:<><circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5M19.1 4.9l-3.5 3.5m-7.2 7.2-3.5 3.5"/></>,
  spool:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 7h14M5 17h14M9 11c2-1 4-1 6 0m-6 3c2-1 4-1 6 0"/></>,
  puzzle:<><path d="M10 3H4a1 1 0 0 0-1 1v6h2a3 3 0 0 1 0 6H3v4a1 1 0 0 0 1 1h6v-2a3 3 0 0 1 6 0v2h4a1 1 0 0 0 1-1v-6h-2a3 3 0 0 1 0-6h2V4a1 1 0 0 0-1-1h-4v2a3 3 0 0 1-6 0V3Z"/></>,
  wrench:<><path d="M21 7.5a6 6 0 0 1-8 5.7L6.4 20a2 2 0 0 1-2.8-2.8l6.7-6.6a6 6 0 0 1 6-8l-3.8 3.8 3.1 3.1L19.5 6 21 7.5Z"/></>,
  chevron:<path d="m6 9 6 6 6-6"/>,
  search:<><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
  refresh:<><path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/></>,
  close:<path d="M5 5 19 19M19 5 5 19"/>,
  school:<><path d="m3 10 9-7 9 7M5 10v10h14V10M9 20v-7h6v7"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

function kitAppearance(name) {
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

export default function ProjectMasterComponents({project,proposals,allowed,request,onClose,inline=false,onChanged}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState("");
 const [sourceId,setSourceId]=useState("");
 const [editor,setEditor]=useState(null),[quantity,setQuantity]=useState("1"),[selectedProduct,setSelectedProduct]=useState(null);
 const [confirm,setConfirm]=useState(null);
 const [expandedGroup,setExpandedGroup]=useState(null);
 const rows=useMemo(()=>warehouseTotals(state.items||[],state.receiptLines||[],state.allocations||[]),[state]);
 const schoolCount=(state.schools||[]).length;
 const total=rows.reduce((sum,row)=>sum+projectRequired(Number(row.required_qty||0),schoolCount),0);
 const hasMovements=!!(state.receiptLines?.length||state.allocations?.length||state.demands?.length);
 const needsKitCapture=rows.length>0&&!rows.some(row=>Array.isArray(row.source_kits)&&row.source_kits.length>0)&&!!project.source_proposal_id;

 const groups=useMemo(()=>{
  const result=new Map();
  for(const group of state.kitGroups||[])result.set(group.kit_key,{key:group.kit_key,kitId:group.kit_id,kitName:group.kit_name,items:[],total:0});
  for(const row of rows)for(const kit of Array.isArray(row.source_kits)?row.source_kits:[]){
   const key=groupKey(kit);
   if(!result.has(key))result.set(key,{key,kitId:kit.kitId||"",kitName:kit.kitName||"Direct components",items:[],total:0});
   const group=result.get(key),qty=Number(kit.quantity)||0;
   group.items.push({row,qty,kit});group.total+=qty;
  }
  const orphaned=rows.filter(row=>!Array.isArray(row.source_kits)||!row.source_kits.length);
  if(orphaned.length)result.set("ungrouped",{key:"ungrouped",kitId:"",kitName:"Unassigned components",items:orphaned.map(row=>({row,qty:Number(row.required_qty)||0,kit:null})),total:orphaned.reduce((sum,row)=>sum+Number(row.required_qty||0),0)});
  return [...result.values()];
 },[rows,state.kitGroups]);

 const visibleGroups=useMemo(()=>{
  const term=search.trim().toLowerCase();
  return groups.map(group=>({...group,items:!term||group.kitName.toLowerCase().includes(term)?group.items:group.items.filter(({row})=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(term))}))
   .filter(group=>!term||group.kitName.toLowerCase().includes(term)||group.items.length>0);
 },[groups,search]);

 async function reload(){const value=await request(`/warehouse?projectId=${encodeURIComponent(project.id)}`);setState(value);setLoading(false);}
 useEffect(()=>{let active=true;request(`/warehouse?projectId=${encodeURIComponent(project.id)}`).then(value=>{if(active){setState(value);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[project.id]);
 async function submit(payload,message){if(busy)return false;setBusy(true);setError("");setNotice("");try{
   await request("/warehouse","POST",{projectId:project.id,...payload});await reload();setEditor(null);setConfirm(null);setNotice(message);onChanged?.();return true;
  }catch(e){setError(e.message||"Unable to save.");return false;}finally{setBusy(false);}}
 function addTo(group){setExpandedGroup(group.key);setEditor({kind:"add",group,row:null});setSelectedProduct(null);setQuantity("1");setError("");}
 function changeQuantity(group,item){setExpandedGroup(group.key);setEditor({kind:"update",group,row:item.row});setQuantity(String(item.qty));setError("");}
 function saveEditor(){const q=Number(quantity);if(!Number.isSafeInteger(q)||q<=0||q>1000000000){setError("Enter a positive whole-number quantity.");return;}
   if(editor.kind==="add"&&!selectedProduct){setError("Select a product from the Products catalog.");return;}
   submit({action:"edit_kit",operation:editor.kind,itemId:editor.row?.id||null,
     kitId:editor.group.kitId,kitName:editor.group.kitName,
     productCatalogId:editor.kind==="add"?selectedProduct.id:null,quantity:q,expectedUpdatedAt:editor.row?.updated_at},
     editor.kind==="add"?"Component added to Kit.":"Kit quantity updated.");
 }

 return <div className={`pr-pbom pr-pbom--modern${inline?" pr-pbom--inline":""}`}>
  <div className="pr-manifest-title pr-pbom-title">
   <div><span className="pr-wh-overline">PROJECT · {project.name}</span><h3>Project Components</h3></div>
   {!inline&&<button className="pr-pbom-close" type="button" onClick={onClose} aria-label="Close Project Components" title="Close"><BomIcon name="close" size={19}/></button>}
  </div>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<div className="pr-pbom-skeleton" role="status" aria-label="Loading Kits"><span/><span/><span/><span/></div>:<>
   <div className="pr-pbom-summary" aria-label="Project components summary">
    <div className="pr-pbom-summary-card pr-pbom-summary-card--black"><span className="pr-pbom-stat-icon"><BomIcon name="layers" size={23}/></span><span className="pr-pbom-stat-copy"><span>Source Proposal</span><strong>{project.source_proposal_name||"Custom project"}</strong></span></div>
    <div className="pr-pbom-summary-card pr-pbom-summary-card--orange"><span className="pr-pbom-stat-icon"><BomIcon name="box" size={23}/></span><span className="pr-pbom-stat-copy"><span>Unique Components</span><strong>{fmt(rows.length)}</strong></span></div>
    <div className="pr-pbom-summary-card pr-pbom-summary-card--white"><span className="pr-pbom-stat-icon"><BomIcon name="clipboard" size={23}/></span><span className="pr-pbom-stat-copy"><span>Project Required</span><strong>{fmt(total)}</strong><small>{fmt(schoolCount)} {schoolCount===1?"school":"schools"}</small></span></div>
   </div>
   {!rows.length&&!project.source_proposal_id&&allowed&&!hasMovements&&<div className="pr-pbom-import"><strong>Import source Proposal</strong><div className="pr-pbom-import-action"><PreparingSelect value={sourceId} onChange={e=>setSourceId(e.target.value)} aria-label="Source Proposal"><option value="">Select Proposal…</option>{(proposals||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</PreparingSelect><button className="pr-primary" disabled={!sourceId||busy} onClick={()=>submit({action:"attach_proposal",proposalId:sourceId},"Proposal imported.")}>Import Proposal</button></div></div>}
   {needsKitCapture&&<div className="pr-pbom-import"><div><strong>Load Kit Groups from Proposal</strong><small>One-time organization of the existing Master BOM. Warehouse receipts and allocation amounts stay unchanged.</small></div>{allowed&&<button type="button" className="pr-primary" disabled={busy} onClick={()=>submit({action:"init_kits"},"Proposal Kit groups loaded.")}>Load Kit Groups</button>}</div>}
   <div className="pr-pbom-toolbar">
    <label className="pr-search pr-pbom-search"><BomIcon name="search" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search within Kits or components…" aria-label="Search project components"/>{search&&<button className="pr-pbom-clear-search" type="button" onClick={()=>setSearch("")} aria-label="Clear search" title="Clear search"><BomIcon name="close" size={16}/></button>}</label>

   </div>
   <div className="pr-pbom-list-heading"><span>Kit groups <b>{visibleGroups.length}</b></span></div>
   <div className="pr-kit-group-list" aria-label="Project Kit groups">
    {visibleGroups.map((group,index)=>{
      const isOpen=Boolean(search.trim())||expandedGroup===group.key;
      const groupItemsId=`pr-kit-items-${index}`;
      const appearance=kitAppearance(group.kitName);
      const shownItems=group.items;
      return <section key={group.key} className={`pr-kit-group pr-kit-group--${appearance.tone}${isOpen?" is-open":""}`}>
       <button type="button" className="pr-kit-group-head" aria-expanded={isOpen} aria-controls={groupItemsId} onClick={()=>setExpandedGroup(isOpen?"__none__":group.key)}>
        <span className="pr-kit-group-icon" aria-hidden="true"><BomIcon name={appearance.icon} size={22}/></span>
        <span className="pr-kit-group-title"><strong>{group.kitName}</strong><small><BomIcon name="box" size={13}/> {fmt(group.total)} units / school</small></span>
        <span className="pr-kit-group-count"><BomIcon name="box" size={14}/> {fmt(group.items.length)} {group.items.length===1?"component":"components"}</span>
        <span className="pr-kit-group-chevron" aria-hidden="true"><BomIcon name="chevron" size={18}/></span>
       </button>
       <div className={`pr-kit-group-panel${isOpen?" is-expanded":""}`} aria-hidden={!isOpen} inert={!isOpen}>
        <div className="pr-kit-group-panel-inner"><div className="pr-kit-group-body" id={groupItemsId}>
         <div className="pr-kit-group-rows">
          {shownItems.map(({row,qty,kit})=><div key={row.id} className="pr-kit-group-row-shell">
           <div className="pr-kit-group-row">
            <div className="pr-pbom-name"><strong>{row.product_name}</strong></div>
            <div className="pr-pbom-qty"><span>Kit Qty / School</span>{editor?.kind==="update"&&editor.row?.id===row.id&&editor.group.key===group.key?<input className="pr-pbom-inline-qty" type="number" aria-label={`Kit quantity for ${row.product_name}`} min="1" max="1000000000" step="1" value={quantity} disabled={busy} onChange={e=>setQuantity(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();saveEditor();}else if(e.key==="Escape"){setEditor(null);}}} autoFocus/>:<b>{fmt(qty)}</b>}</div>
            <div className="pr-pbom-qty"><span>Total Required · {schoolCount} {schoolCount===1?"school":"schools"}</span><b>{fmt(editor?.kind==="update"&&editor.row?.id===row.id&&editor.group.key===group.key&&Number.isSafeInteger(Number(quantity))&&Number(quantity)>0?projectRequired(Number(quantity),schoolCount):projectRequired(qty,schoolCount))}</b></div>
            {allowed&&kit&&<div className="pr-pbom-row-actions">{editor?.kind==="update"&&editor.row?.id===row.id&&editor.group.key===group.key?<><button type="button" className="pr-primary" disabled={busy} onClick={saveEditor}>{busy?"Saving…":"Save"}</button><button type="button" className="pr-secondary" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></>:<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>changeQuantity(group,{row,qty})}>Edit Qty</button><button type="button" className="pr-pbom-delete" disabled={busy} onClick={()=>{setEditor(null);setConfirm({group,row});}}>Remove</button></>}</div>}
           </div>
          </div>)}
         </div>
         {!group.items.length&&<p className="pr-pbom-group-empty">No components in this Kit yet.</p>}
         {allowed&&group.key!=="ungrouped"&&<button type="button" className="pr-kit-group-add" onClick={()=>addTo(group)}><BomIcon name="plus" size={16}/> Add Component to {group.kitName}</button>}
         {editor?.kind==="add"&&editor.group.key===group.key&&<div className="pr-kit-inline-editor" role="group" aria-label={`Add component to ${group.kitName}`}>
          <div className="pr-pbom-form-head"><strong>Add Component to {group.kitName}</strong></div>
          <div className="pr-kit-editor-fields"><div className="pr-pbom-product-field"><span>Component</span><ProjectProductPicker value={selectedProduct} onChange={setSelectedProduct} disabled={busy} label="Select component from Products"/></div><label>Kit quantity<input type="number" min="1" max="1000000000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><div className="pr-pbom-add-actions"><button type="button" className="pr-secondary" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="pr-primary" type="button" disabled={busy} onClick={saveEditor}>{busy?"Saving…":"Save"}</button></div></div>
         </div>}
        </div></div>
       </div>
      </section>;
    })}
    {!visibleGroups.length&&<div className="pr-wh-empty">{rows.length?"No matching Kits or components.":"No components in this project."}</div>}
   </div>
   {confirm&&<div className="pr-pbom-confirm" role="group" aria-label="Confirm component removal"><div><strong>Remove {confirm.row.product_name} from {confirm.group.kitName}?</strong><small>This changes the planned Kit quantity only. Recorded stock and school movements are protected.</small></div><div className="pr-pbom-actions"><button className="pr-secondary" type="button" onClick={()=>setConfirm(null)}>Cancel</button><button className="pr-pbom-delete" type="button" disabled={busy} onClick={()=>submit({action:"edit_kit",operation:"delete",itemId:confirm.row.id,kitId:confirm.group.kitId,kitName:confirm.group.kitName,expectedUpdatedAt:confirm.row.updated_at},"Component removed from Kit.")}>Confirm Remove</button></div></div>}
  </>}
 </div>;
}
