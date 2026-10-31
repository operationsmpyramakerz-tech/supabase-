"use client";
import PreparingSelect from "./PreparingSelect";
import {useEffect,useMemo,useState} from "react";
import {warehouseTotals,projectRequired} from "../../lib/preparing-warehouse-math.mjs";

const empty={items:[],receiptLines:[],allocations:[],demands:[],kitGroups:[],bomAudit:[]};
const fmt=v=>Number(v||0).toLocaleString("en-US");
const groupKey=kit=>kit?.kitId?`id:${String(kit.kitId).toLowerCase()}`:`name:${String(kit?.kitName||"").toLowerCase()}`;

export default function ProjectMasterComponents({project,proposals,allowed,request,onClose}) {
 const [state,setState]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState("");
 const [sourceId,setSourceId]=useState("");
 const [editor,setEditor]=useState(null),[quantity,setQuantity]=useState("1"),[newName,setNewName]=useState(""),[newCode,setNewCode]=useState("");
 const [confirm,setConfirm]=useState(null);
 const [expandedGroup,setExpandedGroup]=useState(null);
 const rows=useMemo(()=>warehouseTotals(state.items||[],state.receiptLines||[],state.allocations||[]),[state]);
 const schoolCount=(state.schools||[]).length;
 const total=rows.reduce((sum,r)=>sum+projectRequired(Number(r.required_qty||0),schoolCount),0);
 const hasMovements=!!(state.receiptLines?.length||state.allocations?.length||state.demands?.length);
 const needsKitCapture=rows.length>0&&!rows.some(r=>Array.isArray(r.source_kits)&&r.source_kits.length>0)&&!!project.source_proposal_id;
 const groups=useMemo(()=>{
  const result=new Map();
  for(const group of state.kitGroups||[])result.set(group.kit_key,{key:group.kit_key,kitId:group.kit_id,kitName:group.kit_name,items:[],total:0});
  for(const row of rows) for(const kit of Array.isArray(row.source_kits)?row.source_kits:[]){
    const key=groupKey(kit);
    if(!result.has(key))result.set(key,{key,kitId:kit.kitId||"",kitName:kit.kitName||"Direct components",items:[],total:0});
    const group=result.get(key);const qty=Number(kit.quantity)||0;
    group.items.push({row,qty,kit});group.total+=qty;
  }
  const orphaned=rows.filter(row=>!Array.isArray(row.source_kits)||!row.source_kits.length);
  if(orphaned.length)result.set("ungrouped",{key:"ungrouped",kitId:"",kitName:"Unassigned components",items:orphaned.map(row=>({row,qty:Number(row.required_qty)||0,kit:null})),total:orphaned.reduce((s,r)=>s+Number(r.required_qty||0),0)});
  return [...result.values()];
 },[rows,state.kitGroups]);
 const visibleGroups=groups.map(group=>({...group,items:group.items.filter(({row})=>`${row.product_name} ${row.product_id}`.toLowerCase().includes(search.toLowerCase().trim()))})).filter(group=>group.items.length||!search.trim());
 async function reload(){const value=await request(`/warehouse?projectId=${encodeURIComponent(project.id)}`);setState(value);setLoading(false);}
 useEffect(()=>{let active=true;request(`/warehouse?projectId=${encodeURIComponent(project.id)}`).then(v=>{if(active){setState(v);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[project.id]);
 async function submit(payload,message){if(busy)return false;setBusy(true);setError("");setNotice("");try{
   await request("/warehouse","POST",{projectId:project.id,...payload});await reload();setEditor(null);setConfirm(null);setNotice(message);return true;
  }catch(e){setError(e.message||"Unable to save.");return false;}finally{setBusy(false);}}
 function addTo(group){setExpandedGroup(group.key);setEditor({kind:"add",group,row:null});setNewName("");setNewCode("");setQuantity("1");}
 function changeQuantity(group,item){setExpandedGroup(group.key);setEditor({kind:"update",group,row:item.row});setQuantity(String(item.qty));}
 function saveEditor(){const q=Number(quantity);if(!Number.isSafeInteger(q)||q<=0||q>1000000000){setError("Enter a positive whole-number quantity.");return;}
   if(editor.kind==="add"&&!newName.trim()){setError("Enter a component name.");return;}
   submit({action:"edit_kit",operation:editor.kind,itemId:editor.row?.id||null,
     kitId:editor.group.kitId,kitName:editor.group.kitName,
     productName:newName.trim(),productId:newCode.trim(),quantity:q,expectedUpdatedAt:editor.row?.updated_at},
     editor.kind==="add"?"Component added to Kit.":"Kit quantity updated.");
 }
 return <div className="pr-pbom">
  <div className="pr-manifest-title"><div><span className="pr-wh-overline">PROJECT · {project.name}</span><h3>Project Components</h3></div><button className="pr-secondary" type="button" onClick={onClose}>Close</button></div>
  {error&&<div className="pr-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss">×</button></div>}
  {notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading Kits…</p>:<>
   <div className="pr-pbom-summary"><div><span>Source Proposal</span><strong>{project.source_proposal_name||"Custom project"}</strong></div><div><span>Unique components</span><strong>{fmt(rows.length)}</strong></div><div><span>Project required · {schoolCount} schools</span><strong>{fmt(total)}</strong></div></div>
   {!rows.length&&!project.source_proposal_id&&allowed&&!hasMovements&&<div className="pr-pbom-import"><strong>Import source Proposal</strong><div className="pr-pbom-import-action"><PreparingSelect value={sourceId} onChange={e=>setSourceId(e.target.value)} aria-label="Source Proposal"><option value="">Select Proposal…</option>{(proposals||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</PreparingSelect><button className="pr-primary" disabled={!sourceId||busy} onClick={()=>submit({action:"attach_proposal",proposalId:sourceId},"Proposal imported.")}>Import Proposal</button></div></div>}
   {needsKitCapture&&<div className="pr-pbom-import"><div><strong>Load Kit Groups from Proposal</strong><small>One-time organization of the existing Master BOM. Warehouse receipts and allocation amounts stay unchanged.</small></div>{allowed&&<button type="button" className="pr-primary" disabled={busy} onClick={()=>submit({action:"init_kits"},"Proposal Kit groups loaded.")}>Load Kit Groups</button>}</div>}
   <div className="pr-pbom-toolbar"><label className="pr-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search within Kits…" aria-label="Search project components"/></label><button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setLoading(true);reload().catch(e=>{setError(e.message);setLoading(false);});}}>Refresh</button></div>
   <div className="pr-kit-group-list" aria-label="Project Kit groups">
    {visibleGroups.map((group,index)=>{
      const isOpen=Boolean(search.trim())||(expandedGroup===null?index===0:expandedGroup===group.key);
      const groupItemsId=`pr-kit-items-${index}`;
      return <section key={group.key} className={`pr-kit-group${isOpen?" is-open":""}`}>
        <button type="button" className="pr-kit-group-head" aria-expanded={isOpen} aria-controls={groupItemsId} onClick={()=>setExpandedGroup(isOpen?"__none__":group.key)}>
          <span className="pr-kit-group-icon" aria-hidden="true">▤</span>
          <span className="pr-kit-group-title"><strong>{group.kitName}</strong><small>{fmt(group.total)} units / school · {schoolCount} schools</small></span>
          <span className="pr-kit-group-count">{group.items.length} components</span>
          <span className="pr-kit-group-chevron" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        {isOpen&&<div className="pr-kit-group-body" id={groupItemsId}>
          <div className="pr-kit-group-rows">
            {group.items.map(({row,qty,kit})=><div key={row.id} className="pr-kit-group-row-shell">
              <div className="pr-kit-group-row">
                <div className="pr-pbom-name"><strong>{row.product_name}</strong><small>{row.product_id||"No product code"}</small></div>
                <div className="pr-pbom-qty"><span>Kit Qty / School</span><b>{fmt(qty)}</b></div>
                <div className="pr-pbom-qty"><span>Total Required · {schoolCount} schools</span><b>{fmt(projectRequired(qty,schoolCount))}</b></div>
                {allowed&&kit&&<div className="pr-pbom-row-actions"><button type="button" className="pr-secondary" onClick={()=>changeQuantity(group,{row,qty})}>Edit Qty</button><button type="button" className="pr-pbom-delete" onClick={()=>{setEditor(null);setConfirm({group,row});}}>Remove</button></div>}
              </div>
              {editor?.kind==="update"&&editor.row?.id===row.id&&editor.group.key===group.key&&<div className="pr-kit-inline-editor" role="group" aria-label={`Edit ${row.product_name} quantity`}>
                <div className="pr-pbom-form-head"><strong>Edit Kit quantity</strong><button type="button" className="pr-secondary" onClick={()=>setEditor(null)}>Cancel</button></div>
                <div className="pr-kit-editor-fields"><label>Kit quantity<input type="number" min="1" max="1000000000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button className="pr-primary" type="button" disabled={busy} onClick={saveEditor}>{busy?"Saving…":"Save"}</button></div>
              </div>}
            </div>)}
          </div>
          {allowed&&group.key!=="ungrouped"&&<button type="button" className="pr-kit-group-add" onClick={()=>addTo(group)}>+ Add Component to {group.kitName}</button>}
          {editor?.kind==="add"&&editor.group.key===group.key&&<div className="pr-kit-inline-editor" role="group" aria-label={`Add component to ${group.kitName}`}>
            <div className="pr-pbom-form-head"><strong>Add Component to {group.kitName}</strong><button type="button" className="pr-secondary" onClick={()=>setEditor(null)}>Cancel</button></div>
            <div className="pr-kit-editor-fields"><label>Component<input value={newName} maxLength={500} onChange={e=>setNewName(e.target.value)}/></label><label>Product code<input value={newCode} maxLength={500} onChange={e=>setNewCode(e.target.value)}/></label><label>Kit quantity<input type="number" min="1" max="1000000000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button className="pr-primary" type="button" disabled={busy} onClick={saveEditor}>{busy?"Saving…":"Save"}</button></div>
          </div>}
        </div>}
      </section>;
    })}
    {!visibleGroups.length&&<div className="pr-wh-empty">{rows.length?"No matching components.":"No components in this project."}</div>}
   </div>
   {confirm&&<div className="pr-pbom-confirm" role="group" aria-label="Confirm component removal"><div><strong>Remove {confirm.row.product_name} from {confirm.group.kitName}?</strong><small>This changes the planned Kit quantity only. Recorded stock and school movements are protected.</small></div><div className="pr-pbom-actions"><button className="pr-secondary" type="button" onClick={()=>setConfirm(null)}>Cancel</button><button className="pr-pbom-delete" type="button" disabled={busy} onClick={()=>submit({action:"edit_kit",operation:"delete",itemId:confirm.row.id,kitId:confirm.group.kitId,kitName:confirm.group.kitName,expectedUpdatedAt:confirm.row.updated_at},"Component removed from Kit.")}>Confirm Remove</button></div></div>}
  </>}
 </div>;
}
