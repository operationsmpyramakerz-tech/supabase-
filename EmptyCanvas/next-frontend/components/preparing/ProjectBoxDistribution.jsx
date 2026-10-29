"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {warehouseGroups} from "../../lib/preparing-warehouse-view.mjs";
import {boxPackingTarget} from "../../lib/preparing-production-math.mjs";
import {packableRows} from "../../lib/preparing-box-visibility.mjs";
const count=x=>Number(x)||0;
const formatted=x=>count(x).toLocaleString("en-US");
const norm=x=>String(x??"").trim().toLowerCase();
const same=(a,b)=>norm(a.product_id)===norm(b.product_id)&&norm(a.product_name)===norm(b.product_name);
const matchesKit=(c,kit)=>kit==="General"?!(c.source_kits||[]).length:(c.source_kits||[]).some(x=>x.kitName===kit);
const readableDate=x=>{try{return new Date(x).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});}catch{return "—";}};
export default function ProjectBoxDistribution({projectId,rows,kitGroups,request,allowed,mode="boxes",onChanged}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[opened,setOpened]=useState(""),[editing,setEditing]=useState(""),[cartonId,setCartonId]=useState(""),[quantity,setQuantity]=useState("0"),[rowError,setRowError]=useState("");
 const [newKit,setNewKit]=useState(""),[newLabel,setNewLabel]=useState("");
 const [boxMenu,setBoxMenu]=useState(""),[boxDialog,setBoxDialog]=useState(""),[boxName,setBoxName]=useState(""),[boxError,setBoxError]=useState("");
 const holdTimer=useRef(null),holdStart=useRef(null),suppressBoxClick=useRef(false);
 async function refresh(){const result=await request(`/project-cartons?projectId=${encodeURIComponent(projectId)}`);setData(result);setLoading(false);return result;}
 useEffect(()=>{let active=true;request(`/project-cartons?projectId=${encodeURIComponent(projectId)}`).then(r=>{if(active){setData(r);setLoading(false);}}).catch(e=>{if(active){setError(e.message||"Could not load boxes.");setLoading(false);}});return()=>{active=false;};},[projectId]);
 const draftCartons=useMemo(()=>(data?.cartons||[]).filter(c=>c.status==="draft"),[data]);
 const liveCartons=useMemo(()=>new Map((data?.cartons||[]).filter(c=>c.status!=="cancelled").map(c=>[c.id,c])),[data]);
 const packedByComponent=useMemo(()=>{const map=new Map();for(const line of data?.lines||[]){if(!liveCartons.has(line.carton_id))continue;const k=`${norm(line.product_id)}\u0000${norm(line.product_name)}`;map.set(k,(map.get(k)||0)+count(line.packed_qty));}return map;},[data,liveCartons]);
 const items=useMemo(()=>rows.map(r=>({...r,packedQty:packedByComponent.get(`${norm(r.product_id)}\u0000${norm(r.product_name)}`)||0})).map(r=>({...r,unpacked:Math.max(0,count(r.productionReceived)-r.packedQty),name:r.product_name,code:r.product_id})),[rows,packedByComponent]);
 // Only items with real unpacked Production stock belong in the packing queue.
 // Fully packed items remain in the carton records and Box History.
 const groups=useMemo(()=>warehouseGroups(packableRows(items).filter(r=>`${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())),kitGroups),[items,kitGroups,search]);
 const totals=useMemo(()=>items.reduce((s,r)=>({production:s.production+count(r.productionReceived),packed:s.packed+r.packedQty,unpacked:s.unpacked+r.unpacked}),{production:0,packed:0,unpacked:0}),[items]);
 const currentRow=items.find(r=>r.id===editing);
 const choices=useMemo(()=>draftCartons.filter(c=>currentRow&& (data?.components||[]).some(s=>same(s,currentRow)&&matchesKit(s,c.kit_name))),[draftCartons,currentRow,data]);
 function storedLine(row,id){return (data?.lines||[]).find(l=>l.carton_id===id&&same(row,l));}
 function begin(row){const options=draftCartons.filter(c=>(data?.components||[]).some(s=>same(s,row)&&matchesKit(s,c.kit_name)));const target=options.find(c=>!!storedLine(row,c.id))||options[0];setEditing(row.id);setCartonId(target?.id||"");setQuantity(String(target?count(storedLine(row,target.id)?.packed_qty):0));setRowError("");}
 function choose(id){setCartonId(id);setQuantity(String(count(currentRow&&storedLine(currentRow,id)?.packed_qty)));setRowError("");}
 function clearHold(){if(holdTimer.current!==null)clearTimeout(holdTimer.current);holdTimer.current=null;holdStart.current=null;}
 function startHold(event,boxId){if(event.pointerType==="mouse"&&event.button!==0)return;clearHold();suppressBoxClick.current=false;holdStart.current={x:event.clientX,y:event.clientY,id:event.pointerId};holdTimer.current=setTimeout(()=>{holdTimer.current=null;holdStart.current=null;suppressBoxClick.current=true;setBoxMenu(boxId);},550);}
 function moveHold(event){const start=holdStart.current;if(start&&start.id===event.pointerId&&Math.hypot(start.x-event.clientX,start.y-event.clientY)>12)clearHold();}
 function showMenu(event,boxId){event.preventDefault();clearHold();suppressBoxClick.current=true;setBoxMenu(boxId);}
 useEffect(()=>()=>clearHold(),[]);
 useEffect(()=>{if(!boxMenu)return;const outside=e=>{if(!e.target.closest?.(".pr-box-pill"))setBoxMenu("");};const escape=e=>{if(e.key==="Escape")setBoxMenu("");};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[boxMenu]);
 const selectedBox=(data?.cartons||[]).find(c=>c.id===boxDialog);
 function boxAction(action,box){clearHold();setBoxMenu("");setBoxError("");setBoxDialog(box.id);setBoxName(box.carton_label);setBoxActionType(action);}
 const [boxActionType,setBoxActionType]=useState("");
 function dismissBoxDialog(){if(busy)return;setBoxDialog("");setBoxActionType("");setBoxError("");}
 async function submitBoxAction(){const box=selectedBox;if(!box||busy)return;setBoxError("");setBusy(true);setError("");setNotice("");try{
   if(boxActionType==="rename"){
     const label=boxName.trim();if(label.length<2||label.length>100)throw Error("Box name must be 2 to 100 characters.");
     await request("/project-cartons","PATCH",{action:"rename",projectId,cartonId:box.id,cartonLabel:label,expectedUpdatedAt:box.updated_at});
     setNotice(`Box renamed to ${label}.`);
   }else if(boxActionType==="delete"){
     await request("/project-cartons","PATCH",{action:"cancel",projectId,cartonId:box.id});
     setNotice(`Box ${box.carton_label} removed from active packing. History preserved.`);
     if(cartonId===box.id){setEditing("");setCartonId("");}
   }
   await refresh();setBoxDialog("");setBoxActionType("");
 }catch(e){setBoxError(e.message||"Could not update box.");}finally{setBusy(false);}}
 async function createCarton(){if(!newKit||newLabel.trim().length<2)return;setBusy(true);setError("");setNotice("");try{await request("/project-cartons","POST",{action:"create",projectId,kitName:newKit,cartonLabel:newLabel.trim()});await refresh();setNewLabel("");setNotice("New box created. Select it from the component Edit menu to pack items.");}catch(e){setError(e.message||"Could not create box.");}finally{setBusy(false);}}
 async function save(row){const carton=draftCartons.find(c=>c.id===cartonId);if(!carton){setRowError("Create or select a draft box for this component.");return;}
  const source=(data?.components||[]).find(c=>same(c,row)&&matchesKit(c,carton.kit_name));if(!source){setRowError("This component is not available in the selected box Kit. Check captured school components.");return;}
  try{boxPackingTarget(row.productionReceived,row.packedQty,count(storedLine(row,carton.id)?.packed_qty),quantity);}catch(e){setRowError(e.message);return;}
  if(Number(quantity)===count(storedLine(row,carton.id)?.packed_qty)){setEditing("");return;}
  setBusy(true);setRowError("");setError("");setNotice("");try{
   await request("/production","POST",{action:"pack",projectId,cartonId:carton.id,sourceComponentId:source.id,itemId:row.id,quantity:Number(quantity),expectedUpdatedAt:carton.updated_at});
   await refresh();await onChanged?.();setEditing("");setNotice(`Box distribution saved for ${row.name} in ${carton.carton_label}.`);
  }catch(e){setRowError(e.message||"Could not save box quantity.");}finally{setBusy(false);}
 }
 const history=useMemo(()=>{
  const audit=[...(data?.audit||[])].sort((a,b)=>new Date(a.changed_at)-new Date(b.changed_at));
  const previous=new Map();
  return audit.filter(h=>["set_line","create","seal","cancel","allocate","reverse","rename"].includes(h.action)).map(h=>{
   if(h.action!=="set_line")return {...h,delta:null};
   const key=`${h.carton_id}:${norm(h.details?.component)}`;
   const prior=previous.get(key)||0,now=count(h.details?.quantity);
   previous.set(key,now);
   return {...h,delta:now-prior};
  }).reverse();
 },[data]);
 return <div className="pr-box-distribution">
  {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading box distribution…</p>:<>
   {mode==="boxes"&&<>
    <div className="pr-production-summary pr-box-summary">{[["Production Received",totals.production,"#20846b"],["Packed",totals.packed,"#7755b3"],["Available to Pack / Unpacked",totals.unpacked,"#db7d27"]].map(([name,n,color])=><div className="pr-pt-stat" key={name} style={{borderTop:`3px solid ${color}`}}><span>{name}</span><strong>{formatted(n)}</strong></div>)}</div>
    <section className="pr-box-toolbar"><div><strong>Project Boxes</strong><small>Create a Kit box, then use Edit on a component to distribute its quantity. Unpacked updates automatically.</small></div>{allowed&&<div className="pr-box-create"><select aria-label="Kit for new box" value={newKit} onChange={e=>setNewKit(e.target.value)}><option value="">Kit type</option>{(data?.kits||[]).map(kit=><option key={kit} value={kit}>{kit}</option>)}</select><input aria-label="New box label" placeholder="Box label" value={newLabel} onChange={e=>setNewLabel(e.target.value)} maxLength={100}/><button className="pr-primary" disabled={busy||!newKit||newLabel.trim().length<2} onClick={createCarton}>Create Box</button></div>}</section>
    <div className="pr-box-pills">{(data?.cartons||[]).filter(c=>c.status!=="cancelled").map(c=><div key={c.id} className="pr-box-pill" onPointerDown={e=>allowed&&startHold(e,c.id)} onPointerMove={moveHold} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold} onContextMenu={e=>{if(allowed)showMenu(e,c.id);}}>
     <button type="button" className="pr-box-pill-trigger" aria-label={`Box ${c.carton_label}, actions`} aria-expanded={boxMenu===c.id} onClick={()=>{if(suppressBoxClick.current){suppressBoxClick.current=false;return;}if(allowed)setBoxMenu(v=>v===c.id?"":c.id);}} onKeyDown={e=>{if(allowed&&(e.key==="ContextMenu"||(e.shiftKey&&e.key==="F10")))showMenu(e,c.id);}}><strong>{c.carton_label}</strong><small>{c.kit_name} · {c.status}</small></button>
     {allowed&&boxMenu===c.id&&<div className="pr-box-context-menu" role="menu"><button type="button" role="menuitem" disabled={c.status!=="draft"} title={c.status!=="draft"?"Only draft boxes can be renamed":"Rename box"} onClick={()=>boxAction("rename",c)}>Rename</button><button type="button" role="menuitem" className="danger" onClick={()=>boxAction("delete",c)}>Delete</button></div>}
    </div>)}</div>
    <div className="pr-production-controls"><input aria-label="Search box distribution" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="pr-pt-kits">{groups.map(g=><section className="pr-pt-kit" key={g.key}><button type="button" className="pr-pt-kit-toggle" onClick={()=>setOpened(opened===g.key?"":g.key)}><span className="pr-pt-kit-title"><strong>{g.name}</strong><small>{g.items.length} components</small></span><span>{opened===g.key?"⌃":"⌄"}</span></button>{(opened===g.key||(!opened&&groups[0]?.key===g.key))&&<div className="pr-pt-kit-body">{g.items.map(row=><article className="pr-production-row" key={g.key+row.id}><div className="pr-production-item-head"><div><strong>{row.name}</strong><small>{row.code?`#${row.code}`:"Component"}</small></div><span className="pr-production-badge">Production Received {formatted(row.productionReceived)}</span></div><div className="pr-production-metrics pr-box-metrics"><div><small>Available to Pack</small><strong>{formatted(row.unpacked)}</strong></div><div><small>Packed</small><strong className="pr-box-purple">{formatted(row.packedQty)}</strong></div><div><small>Unpacked</small><strong>{formatted(row.unpacked)}</strong></div><div className="pr-production-actions">{editing===row.id?<button className="pr-secondary" disabled={busy} onClick={()=>{setEditing("");setRowError("");}}>Cancel</button>:<button className="pr-secondary" disabled={!allowed||busy} onClick={()=>begin(row)}>Edit</button>}</div></div>{editing===row.id&&<div className="pr-box-editor"><label>Box<select aria-label={`Box for ${row.name}`} value={cartonId} onChange={e=>choose(e.target.value)}><option value="">Choose draft box</option>{choices.map(c=><option key={c.id} value={c.id}>{c.carton_label} · {c.kit_name}</option>)}</select></label><label>Packed in selected box<input type="number" min="0" step="1" aria-label={`Packed ${row.name}`} value={quantity} onChange={e=>{setQuantity(e.target.value);setRowError("");}}/></label><div className="pr-box-preview"><small>Unpacked after saving</small><strong>{Number.isSafeInteger(Number(quantity))?formatted(Math.max(0,row.productionReceived-row.packedQty+count(storedLine(row,cartonId)?.packed_qty)-Number(quantity))):"—"}</strong></div><button className="pr-primary" disabled={busy||!cartonId} onClick={()=>save(row)}>Save</button>{rowError&&<p className="pr-wr-inline-error" role="alert">{rowError}</p>}</div>}</article>)}</div>}</section>)}{!groups.length&&<p className="pr-wh-empty">No components available to pack. All received units are already packed, or Production has not received any stock.</p>}</div>
   </>}
   {boxDialog&&<div className="pr-box-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)dismissBoxDialog();}}><section className="pr-box-dialog" role="dialog" aria-modal="true" aria-label={boxActionType==="rename"?"Rename box":"Delete box"}>
    <header><h4>{boxActionType==="rename"?"Rename Box":"Delete Box"}</h4><button type="button" className="pr-secondary" disabled={busy} onClick={dismissBoxDialog} aria-label="Close">×</button></header>
    {boxActionType==="rename"?<label>Box name<input autoFocus maxLength={100} value={boxName} onChange={e=>setBoxName(e.target.value)} /></label>:<p>Remove <strong>{selectedBox?.carton_label}</strong> from active boxes? Packed quantities return to Production's available balance. The box and its movements stay in History. A box allocated to a school cannot be deleted.</p>}
    {boxError&&<p role="alert" className="pr-wr-inline-error">{boxError}</p>}
    <footer><button type="button" className="pr-secondary" disabled={busy} onClick={dismissBoxDialog}>Cancel</button><button type="button" className={boxActionType==="delete"?"pr-danger-button":"pr-primary"} disabled={busy||(boxActionType==="rename"&&(boxName.trim().length<2||boxName.trim()===selectedBox?.carton_label))} onClick={submitBoxAction}>{busy?"Saving…":boxActionType==="rename"?"Save Name":"Delete Box"}</button></footer>
    </section></div>}
   {mode==="history"&&<><div className="pr-pt-history-heading"><h4>Box Distribution History</h4><span className="pr-pt-history-count">{history.length} movements</span></div><div className="pr-pt-history-grid pr-production-history">{history.map(h=><article className="pr-pt-history-card" key={h.id}><div className="pr-pt-history-top"><span className="pr-pt-history-avatar">{String(h.changed_by_name||h.changed_by_id||"?").slice(0,1).toUpperCase()}</span><div className="pr-pt-history-person"><strong>{h.changed_by_name||`User ${h.changed_by_id}`}</strong><span>{readableDate(h.changed_at)}</span></div><span className="pr-pt-history-label">{h.action==="set_line"?"Pack / Unpack":h.action==="rename"?"Box renamed":h.action}</span></div><div className="pr-pt-history-component"><strong>{h.details?.component||h.details?.new_label||h.details?.label||"Project box"}</strong><span>{data.cartons.find(c=>c.id===h.carton_id)?.carton_label||"Historical box"}</span></div><div className="pr-pt-history-deltas"><span>{h.action==="set_line"?"Packed change":h.action==="rename"?"Old name":"Quantity after movement"}<strong>{h.action==="set_line"?`${h.delta>0?"+":""}${h.delta}`:(h.action==="rename"?(h.details?.old_label||"—"):(h.details?.quantity??"—"))}</strong></span><span>Kit<strong>{data.cartons.find(c=>c.id===h.carton_id)?.kit_name||h.details?.kit||"—"}</strong></span></div></article>)}{!history.length&&<p className="pr-wh-empty">No box distribution movements yet.</p>}</div></>}
  </>}
 </div>;
}
