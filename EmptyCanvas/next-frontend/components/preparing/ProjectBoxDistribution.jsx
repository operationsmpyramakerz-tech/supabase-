"use client";
import PreparingSelect from "./PreparingSelect";
import StageQuantityInput from "./StageQuantityInput";
import {useEffect,useMemo,useRef,useState} from "react";
import {warehouseGroups} from "../../lib/preparing-warehouse-view.mjs";
import {boxPackingTarget} from "../../lib/preparing-production-math.mjs";
import {filterBoxDistributionRows} from "../../lib/preparing-box-visibility.mjs";
import {groupBoxLabels} from "../../lib/preparing-box-labels.mjs";
// The same solid Kit icons as Production Receiving, without coupling its
// independent Box Distribution step to the Production Receiving component.
function boxKitAppearance(name){
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
function BoxIcon({name="box",size=21}){
 const shapes={
  box:<><path d="M12 2 3.5 6.7 12 11.5l8.5-4.8L12 2Z"/><path d="M3.5 6.7v10L12 22l8.5-5.3v-10M12 11.5V22"/></>,
  layers:<><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z"/><path d="m3.5 11 8.5 4.5 8.5-4.5M3.5 15.5 12 20l8.5-4.5"/></>,
  cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  pencil:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8M4 20h16"/></>,
  laser:<><circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5M19.1 4.9l-3.5 3.5m-7.2 7.2-3.5 3.5"/></>,
  spool:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 7h14M5 17h14M9 11c2-1 4-1 6 0m-6 3c2-1 4-1 6 0"/></>,
  puzzle:<path d="M10 3H4a1 1 0 0 0-1 1v6h2a3 3 0 0 1 0 6H3v4a1 1 0 0 0 1 1h6v-2a3 3 0 0 1 6 0v2h4a1 1 0 0 0 1-1v-6h-2a3 3 0 0 1-6 0V3Z"/>,
  wrench:<path d="M21 7.5a6 6 0 0 1-8 5.7L6.4 20a2 2 0 0 1-2.8-2.8l6.7-6.6a6 6 0 0 1 6-8l-3.8 3.8 3.1 3.1L19.5 6 21 7.5Z"/>,
  inbox:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
  packed:<><path d="M3 7 12 2l9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10m-3-13 6-3"/></>,
  search:<><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
  close:<path d="M5 5 19 19M19 5 5 19"/>,
  more:<><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></>,
  rename:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z"/></>,
  trash:<><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}
const count=x=>Number(x)||0;
const formatted=x=>count(x).toLocaleString("en-US");
const norm=x=>String(x??"").trim().toLowerCase();
const same=(a,b)=>norm(a.product_id)===norm(b.product_id)&&norm(a.product_name)===norm(b.product_name);
const matchesKit=(c,kit)=>kit==="General"?!(c.source_kits||[]).length:(c.source_kits||[]).some(x=>x.kitName===kit);
const readableDate=x=>{try{return new Date(x).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});}catch{return "—";}};
export default function ProjectBoxDistribution({projectId,rows,kitGroups,request,allowed,mode="boxes",navigation,onChanged}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("available"),[opened,setOpened]=useState(null),[editing,setEditing]=useState(""),[cartonId,setCartonId]=useState(""),[quantity,setQuantity]=useState("0"),[rowError,setRowError]=useState("");
 const [newKit,setNewKit]=useState(""),[newLabel,setNewLabel]=useState("");
 const [boxesOpen,setBoxesOpen]=useState(false),[expandedBoxKit,setExpandedBoxKit]=useState("");
 const closeBoxLabels=()=>{if(!busy&&!boxDialog){setBoxesOpen(false);setBoxMenu("");}};
 const boxesCloseRef=useRef(null),boxesModalRef=useRef(null);
 const [boxMenu,setBoxMenu]=useState(""),[boxDialog,setBoxDialog]=useState(""),[boxName,setBoxName]=useState(""),[boxError,setBoxError]=useState("");
 const boxDialogRef=useRef("");boxDialogRef.current=boxDialog;
 useEffect(()=>{
  if(!boxesOpen)return undefined;
  const previous=document.activeElement;
  boxesCloseRef.current?.focus();
  const onKey=e=>{
   if(boxDialogRef.current)return;
   if(e.key==="Escape"){e.preventDefault();setBoxesOpen(false);setBoxMenu("");return;}
   if(e.key!=="Tab")return;
   const controls=[...(boxesModalRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])')||[])].filter(node=>node.getClientRects().length);
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("keydown",onKey);previous?.focus?.();};
 },[boxesOpen]);
 const holdTimer=useRef(null),holdStart=useRef(null),suppressBoxClick=useRef(false);
 async function refresh(){const result=await request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=boxes`);setData(result);setLoading(false);return result;}
 useEffect(()=>{let active=true;request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=boxes`).then(r=>{if(active){setData(r);setLoading(false);}}).catch(e=>{if(active){setError(e.message||"Could not load boxes.");setLoading(false);}});return()=>{active=false;};},[projectId]);
 const activeCartons=useMemo(()=>(data?.cartons||[]).filter(c=>c.status!=="cancelled"),[data]);
 const boxGroups=useMemo(()=>groupBoxLabels(data?.kits,data?.cartons),[data]);
 const openBoxLabels=()=>{setExpandedBoxKit(boxGroups.find(g=>g.cartons.length)?.name||boxGroups[0]?.name||"");setBoxesOpen(true);};
 const draftCartons=useMemo(()=>(data?.cartons||[]).filter(c=>c.status==="draft"),[data]);
 const liveCartons=useMemo(()=>new Map((data?.cartons||[]).filter(c=>c.status!=="cancelled").map(c=>[c.id,c])),[data]);
 const packedByComponent=useMemo(()=>{const map=new Map();for(const line of data?.lines||[]){if(!liveCartons.has(line.carton_id))continue;const k=`${norm(line.product_id)}\u0000${norm(line.product_name)}`;map.set(k,(map.get(k)||0)+count(line.packed_qty));}return map;},[data,liveCartons]);
 const items=useMemo(()=>rows.map(r=>({...r,packedQty:packedByComponent.get(`${norm(r.product_id)}\u0000${norm(r.product_name)}`)||0})).map(r=>({...r,unpacked:Math.max(0,count(r.productionReceived)-r.packedQty),name:r.product_name,code:r.product_id})),[rows,packedByComponent]);
 // Only items with real unpacked Production stock belong in the packing queue.
 // Fully packed items remain in the carton records and Box History.
 const filteredItems=useMemo(()=>filterBoxDistributionRows(items,filter),[items,filter]);
 const groups=useMemo(()=>warehouseGroups(filteredItems.filter(r=>`${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())),kitGroups),[filteredItems,kitGroups,search]);
 const filterOptions=useMemo(()=>[
  {value:"available",label:"Available to Pack",hint:"Units waiting to be boxed",count:items.filter(r=>r.unpacked>0&&r.productionReceived>0).length},
  {value:"not-packed",label:"Not Packed",hint:"Production stock with no packed units",count:items.filter(r=>r.productionReceived>0&&r.packedQty===0).length},
  {value:"all",label:"All Components",hint:"Including fully packed items",count:items.length},
 ],[items]);
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
   await refresh();if(boxActionType==="delete")await onChanged?.();setBoxDialog("");setBoxActionType("");
 }catch(e){setBoxError(e.message||"Could not update box.");}finally{setBusy(false);}}
 async function createCarton(){if(!newKit||newLabel.trim().length<2)return;setBusy(true);setError("");setNotice("");try{await request("/project-cartons","POST",{action:"create",projectId,kitName:newKit,cartonLabel:newLabel.trim()});await refresh();setExpandedBoxKit(newKit);setNewLabel("");setNotice("New box created. Select it from the component Edit menu to pack items.");}catch(e){setError(e.message||"Could not create box.");}finally{setBusy(false);}}
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
   <div className="pr-production-summary pr-box-summary pr-pt-stat-grid" aria-label="Box Distribution summary">{[["Production Received",totals.production,"required","inbox"],["Packed",totals.packed,"received","packed"],["Available to Pack / Unpacked",totals.unpacked,"available","box"]].map(([name,n,tone,icon])=><div className={`pr-pt-stat pr-pt-stat--${tone}`} key={tone}><span className="pr-pt-stat-icon"><BoxIcon name={icon} size={22}/></span><span className="pr-pt-stat-copy"><span>{name}</span><strong>{formatted(n)}</strong></span></div>)}</div>
   {typeof navigation==="function"&&navigation(openBoxLabels,activeCartons.length)}
   {mode==="boxes"&&<>
    <div className="pr-production-controls pr-pt-toolbar pr-box-search-toolbar"><label className="pr-search pr-pt-search"><BoxIcon name="search" size={18}/><input type="search" aria-label="Search box distribution" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="pr-pt-clear-search" aria-label="Clear box search" title="Clear search" onClick={()=>setSearch("")}><BoxIcon name="close" size={16}/></button>}</label><PreparingSelect iconOnly className={`pr-pt-filter-select${filter!=="all"?" is-filtered":""}`} aria-label="Filter Box Distribution components" value={filter} onChange={e=>{setFilter(e.target.value);setOpened(null);setEditing("");setRowError("");}}>{filterOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</PreparingSelect></div>
    <div className="pr-pt-kits pr-pt-kit-list pr-box-kit-list">{groups.map(g=>{const appearance=boxKitAppearance(g.name),open=Boolean(search.trim())||opened===g.key;return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={g.key}><button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setOpened(open?"__none__":g.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{g.name}</strong><small>{g.items.length} components</small></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>{open&&<div className="pr-pt-kit-body">{g.items.map(row=><article className="pr-production-row" key={g.key+row.id}><div className="pr-production-item-head"><div><strong>{row.name}</strong></div><span className="pr-production-badge">Production Received {formatted(row.productionReceived)}</span></div><div className="pr-production-metrics pr-box-metrics"><div><small>Available to Pack</small><strong>{formatted(row.unpacked)}</strong></div><div><small>Packed</small><strong className="pr-box-purple">{formatted(row.packedQty)}</strong></div><div><small>Unpacked</small><strong>{formatted(row.unpacked)}</strong></div><div className="pr-production-actions">{editing===row.id?<button className="pr-secondary" disabled={busy} onClick={()=>{setEditing("");setRowError("");}}>Cancel</button>:<button className="pr-secondary" disabled={!allowed||busy} onClick={()=>begin(row)}>Edit</button>}</div></div>{editing===row.id&&<div className="pr-box-editor"><label>Box<PreparingSelect aria-label={`Box for ${row.name}`} value={cartonId} onChange={e=>choose(e.target.value)}><option value="">Choose draft box</option>{choices.map(c=><option key={c.id} value={c.id}>{c.carton_label} · {c.kit_name}</option>)}</PreparingSelect></label><label>Packed in selected box<StageQuantityInput min="0" step="1" aria-label={`Packed ${row.name}`} value={quantity} onValueChange={value=>{setQuantity(value);setRowError("");}}/></label><div className="pr-box-preview"><small>Unpacked after saving</small><strong>{Number.isSafeInteger(Number(quantity))?formatted(Math.max(0,row.productionReceived-row.packedQty+count(storedLine(row,cartonId)?.packed_qty)-Number(quantity))):"—"}</strong></div><button className="pr-primary" disabled={busy||!cartonId} onClick={()=>save(row)}>Save</button>{rowError&&<p className="pr-wr-inline-error" role="alert">{rowError}</p>}</div>}</article>)}</div>}</section>;})}{!groups.length&&<p className="pr-wh-empty">No components match this filter. Try All Components to review previously packed stock.</p>}</div>
   </>}
   {boxesOpen&&<div className="pr-box-labels-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeBoxLabels();}}><section ref={boxesModalRef} className="pr-box-labels-sheet" role="dialog" aria-modal="true" aria-label="Boxes Label">
      <header className="pr-box-labels-head"><div className="pr-box-labels-head-icon"><BoxIcon name="box" size={23}/></div><div className="pr-box-labels-heading"><h4>Boxes Label</h4><p>Manage project kit boxes by group</p></div><span className="pr-box-labels-total">{activeCartons.length} boxes</span><button type="button" ref={boxesCloseRef} className="pr-box-labels-close" aria-label="Close Boxes Label" onClick={closeBoxLabels}><BoxIcon name="close" size={19}/></button></header>
      <div className="pr-box-labels-body">
       {error&&<p className="pr-wr-inline-error" role="alert">{error}</p>}{notice&&<p className="pr-manifest-success" role="status">{notice}</p>}
       {allowed&&<section className="pr-box-labels-create"><div className="pr-box-labels-section-title"><strong>Create Box</strong><small>Choose a kit group and enter the label.</small></div><div className="pr-box-create"><PreparingSelect aria-label="Kit for new box" value={newKit} onChange={e=>setNewKit(e.target.value)}><option value="">Kit type</option>{boxGroups.map(kit=><option key={kit.name} value={kit.name}>{kit.name}</option>)}</PreparingSelect><input aria-label="New box label" placeholder="Box label" value={newLabel} onChange={e=>setNewLabel(e.target.value)} maxLength={100}/><button type="button" className="pr-primary" disabled={busy||!newKit||newLabel.trim().length<2} onClick={createCarton}>Create Box</button></div></section>}
       <div className="pr-box-labels-section-title pr-box-labels-groups-label"><strong>Kit Groups</strong><small>{boxGroups.length} groups</small></div>
       <div className="pr-box-labels-groups">{boxGroups.map(group=>{const appearance=boxKitAppearance(group.name),open=expandedBoxKit===group.name;return <section key={group.name} className={`pr-box-labels-group pr-pt-kit--${appearance.tone}`}><button type="button" className="pr-box-labels-group-toggle" aria-expanded={open} onClick={()=>{setExpandedBoxKit(open?"":group.name);setBoxMenu("");}}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-box-labels-group-name"><strong>{group.name}</strong><small>{group.cartons.length} {group.cartons.length===1?"box":"boxes"}</small></span><span className={`pr-box-labels-chevron${open?" is-open":""}`} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>{open&&<div className="pr-box-labels-group-body">{group.cartons.length?<div className="pr-box-labels-box-grid">{group.cartons.map(c=><div key={c.id} className="pr-box-pill" onPointerDown={e=>allowed&&startHold(e,c.id)} onPointerMove={moveHold} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold} onContextMenu={e=>{if(allowed)showMenu(e,c.id);}}><div className="pr-box-labels-box-details"><span className="pr-box-labels-box-symbol"><BoxIcon name="box" size={19}/></span><div><strong>{c.carton_label}</strong><small className={`pr-box-labels-status${c.status==="draft"?" is-draft":""}`}>{c.status}</small></div></div>{allowed&&<button type="button" className="pr-box-labels-box-menu" title={`Actions for ${c.carton_label}`} aria-label={`Actions for ${c.carton_label}`} aria-expanded={boxMenu===c.id} onClick={()=>{if(suppressBoxClick.current){suppressBoxClick.current=false;return;}setBoxMenu(v=>v===c.id?"":c.id);}}><BoxIcon name="more" size={19}/></button>}{allowed&&boxMenu===c.id&&<div className="pr-box-context-menu" role="menu"><button type="button" role="menuitem" disabled={c.status!=="draft"} title={c.status!=="draft"?"Only draft boxes can be renamed":"Rename box"} onClick={()=>boxAction("rename",c)}><BoxIcon name="rename" size={16}/><span>Rename</span></button><button type="button" role="menuitem" className="danger" onClick={()=>boxAction("delete",c)}><BoxIcon name="trash" size={16}/><span>Delete</span></button></div>}</div>)}</div>:<div className="pr-box-labels-empty">No boxes yet for this kit. {allowed?"Create one above to get started.":""}</div>}</div>}</section>;})}{!boxGroups.length&&<p className="pr-box-labels-empty">No kit groups available for this project.</p>}</div>
      </div>
     </section></div>}
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
