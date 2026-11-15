"use client";
import StageFilterTabs from "./StageFilterTabs";
import PreparingSelect from "./PreparingSelect";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {warehouseGroups} from "../../lib/preparing-warehouse-view.mjs";
import SchoolEqualPackingEditor from "./SchoolEqualPackingEditor";
import {filterBoxDistributionRows} from "../../lib/preparing-box-visibility.mjs";
import {groupBoxLabels} from "../../lib/preparing-box-labels.mjs";
import {schoolKitPackingProgress} from "../../lib/preparing-school-kit-packing.mjs";
import {schoolKitGroupsForSelection,kitLabelGroupHasPlan} from "../../lib/preparing-kit-label-schools.mjs";
// The same solid Kit icons as Operations Receiving, without coupling its
// independent Box Distribution step to the Operations Receiving component.
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
  history:<><path d="M3 12a9 9 0 1 0 2.3-6"/><path d="M3 4v5h5M12 7v5l3.5 2"/></>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  edit:<><path d="m4 20 4.5-1.1L20 7.4a2.2 2.2 0 0 0-3.1-3.1L5.4 15.8 4 20ZM14.6 6.6l2.8 2.8"/></>,
  expand:<><path d="M14 4h6v6M20 4l-8 8M20 14v6H4V4h6"/></>,
  previous:<path d="m14 5-7 7 7 7"/>,
  next:<path d="m10 5 7 7-7 7"/>,
  more:<><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></>,
  rename:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z"/></>,
  trash:<><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}
function BoxComponentPhoto({row,onOpen}){
 const url=row.imageUrls?.[0];
 return url?<button type="button" className="pr-intake-thumb" aria-label={`View image of ${row.name}`} title={`View photo: ${row.name}`} onClick={onOpen}><img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("is-broken");}}/><span className="pr-intake-thumb-expand"><BoxIcon name="expand" size={12}/></span></button>:<span className="pr-intake-thumb pr-intake-thumb-empty" aria-label="No component photo available"><BoxIcon name="box" size={18}/></span>;
}
// Multi-select is local to the Labels modal; it does not change the shared
// single-choice PreparingSelect used throughout the other project stages.
function LabelSchoolsPicker({schools,selected,onChange,disabled}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState("");
 const root=useRef(null),searchRef=useRef(null);
 const close=()=>{setOpen(false);setQuery("");};
 useEffect(()=>{if(!open)return;
  searchRef.current?.focus();
  const outside=e=>{if(!root.current?.contains(e.target))close();};
  const escape=e=>{if(e.key==="Escape"){e.stopPropagation();close();}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[open]);
 const available=schools.filter(s=>s.beneficiary_name?.toLowerCase().includes(query.trim().toLowerCase()));
 const allSelected=schools.length>0&&schools.every(s=>selected.includes(s.id));
 const toggle=id=>onChange(selected.includes(id)?selected.filter(v=>v!==id):[...selected,id]);
 return <div ref={root} className="pr-label-schools-picker">
  <button type="button" className="pr-label-schools-trigger" aria-label="Schools for new Kit labels" aria-haspopup="true" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}>
   <span>{selected.length?`${selected.length} ${selected.length===1?"school":"schools"} selected`:"Select schools"}</span>
   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  {open&&<div className="pr-label-schools-popover" role="group" aria-label="Select beneficiary schools">
   <input ref={searchRef} type="text" aria-label="Search beneficiary schools" placeholder="Search schools…" value={query} onChange={e=>setQuery(e.target.value)}/>
   <div className="pr-label-schools-all"><button type="button" disabled={disabled||!schools.length} onClick={()=>onChange(allSelected?[]:schools.slice(0,50).map(s=>s.id))}>{allSelected?"Clear all":"Select all"}</button><small>{selected.length} / {schools.length} selected</small></div>
   <div className="pr-label-schools-options">{available.map(s=><label key={s.id} className="pr-label-schools-option"><input type="checkbox" checked={selected.includes(s.id)} disabled={disabled||(!selected.includes(s.id)&&selected.length>=50)} onChange={()=>toggle(s.id)}/><span>{s.beneficiary_name}</span></label>)}{!available.length&&<p>No matching schools.</p>}</div>
   <button type="button" className="pr-label-schools-done" onClick={close}>Done</button>
  </div>}
 </div>;
}
const count=x=>Number(x)||0;
const formatted=x=>count(x).toLocaleString("en-US");
const norm=x=>String(x??"").trim().toLowerCase();
const same=(a,b)=>norm(a.product_id)===norm(b.product_id)&&norm(a.product_name)===norm(b.product_name);
const readableDate=x=>{try{return new Date(x).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});}catch{return "—";}};
export default function ProjectBoxDistribution({projectId,rows,kitGroups,request,allowed,editTabs={},mode="boxes",historyActive=false,onHistoryToggle,onDownload,downloadDisabled=false,onChanged,filter,setFilter,onReturnToBoxes}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[searchOpen,setSearchOpen]=useState(false),searchInputRef=useRef(null),[opened,setOpened]=useState(null),[editing,setEditing]=useState(""),[rowError,setRowError]=useState("");
 const closeSearch=()=>{setSearchOpen(false);setSearch("");};
 useEffect(()=>{if(searchOpen&&mode==="boxes")searchInputRef.current?.focus();},[searchOpen,mode]);
 useEffect(()=>{if(mode!=="boxes")closeSearch();},[mode]);
 const [preview,setPreview]=useState(null),[previewIndex,setPreviewIndex]=useState(0);
 useEffect(()=>{if(!preview)return;const key=event=>{if(event.key==="Escape")setPreview(null);else if(event.key==="ArrowRight")setPreviewIndex(v=>(v+1)%(preview.imageUrls?.length||1));else if(event.key==="ArrowLeft")setPreviewIndex(v=>(v+(preview.imageUrls?.length||1)-1)%(preview.imageUrls?.length||1));};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[preview]);
 const canEditTab=allowed && editTabs[filter] !== false;
 const canManageLabels=allowed && editTabs.all !== false;
 const [labelSchools,setLabelSchools]=useState([]),[labelKit,setLabelKit]=useState(""),[labelCount,setLabelCount]=useState("1");
 const [inspectBoxId,setInspectBoxId]=useState("");
 const [boxesOpen,setBoxesOpen]=useState(false),[expandedBoxKit,setExpandedBoxKit]=useState("");
 const closeBoxLabels=()=>{if(!busy&&!boxDialog){setBoxesOpen(false);setBoxMenu("");setInspectBoxId("");}};
 const boxesCloseRef=useRef(null),boxesModalRef=useRef(null);
 const [boxMenu,setBoxMenu]=useState(""),[boxDialog,setBoxDialog]=useState(""),[boxName,setBoxName]=useState(""),[boxError,setBoxError]=useState("");
 const boxDialogRef=useRef("");boxDialogRef.current=boxDialog;
 useEffect(()=>{
  if(!boxesOpen)return undefined;
  const previous=document.activeElement;
  boxesCloseRef.current?.focus();
  const onKey=e=>{
   if(boxDialogRef.current)return;
   if(e.key==="Escape"){e.preventDefault();setBoxesOpen(false);setBoxMenu("");setInspectBoxId("");return;}
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
 const labelSchoolOptions=useMemo(()=>(data?.schools||[]).filter(s=>(data?.components||[]).some(c=>c.school_id===s.id)),[data]);
 const labelSchoolKits=useMemo(()=>schoolKitGroupsForSelection(data?.components||[],labelSchools),[data,labelSchools]);
 function changeLabelSchools(next){
  setLabelSchools(next);
  if(labelKit&&!schoolKitGroupsForSelection(data?.components||[],next).includes(labelKit))setLabelKit("");
 }
 const inspectedBox=(data?.cartons||[]).find(c=>c.id===inspectBoxId);
 const inspectedLines=(data?.lines||[]).filter(l=>l.carton_id===inspectBoxId);
 const inspectedSchool=(data?.schools||[]).find(s=>s.id===inspectedBox?.school_id);
 const manifestTargets=(data?.kitTargets||[]).filter(t=>t.kit_box_id===inspectedBox?.id);
 const manifestProgress=schoolKitPackingProgress(inspectBoxId,data?.kitTargets||[],data?.lines||[]);
 const manifestPacked=manifestProgress.packed;
 const manifestRequired=manifestProgress.required;
 const groupPlanReady=kitLabelGroupHasPlan(data,labelSchools,labelKit);


 const openBoxLabels=()=>{setExpandedBoxKit(boxGroups.find(g=>g.cartons.length)?.name||boxGroups[0]?.name||"");setBoxesOpen(true);};
 const liveCartons=useMemo(()=>new Map((data?.cartons||[]).filter(c=>c.status!=="cancelled").map(c=>[c.id,c])),[data]);
 const packedByComponent=useMemo(()=>{const map=new Map();for(const line of data?.lines||[]){if(!liveCartons.has(line.carton_id))continue;const k=`${norm(line.product_id)}\u0000${norm(line.product_name)}`;map.set(k,(map.get(k)||0)+count(line.packed_qty));}return map;},[data,liveCartons]);
 const items=useMemo(()=>rows.map(r=>({...r,packedQty:packedByComponent.get(`${norm(r.product_id)}\u0000${norm(r.product_name)}`)||0})).map(r=>({...r,unpacked:Math.max(0,count(r.productionReceived)-r.packedQty),name:r.product_name,code:r.product_id})),[rows,packedByComponent]);
 // Only items with real unpacked Production stock belong in the packing queue.
 // Fully packed items remain in the carton records and Box History.
 const filteredItems=useMemo(()=>filterBoxDistributionRows(items,filter),[items,filter]);
 const groups=useMemo(()=>warehouseGroups(filteredItems.filter(r=>`${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())),kitGroups),[filteredItems,kitGroups,search]);
 const filterOptions=useMemo(()=>[
  {value:"available",label:"Available to Pack",hint:"Units waiting to be boxed",count:items.filter(r=>r.unpacked>0&&r.productionReceived>0).length},
  {value:"packed",label:"Packed",hint:"Components with at least one unit in an active box",count:items.filter(r=>r.packedQty>0).length},
  {value:"all",label:"All Components",hint:"Including fully packed items",count:items.length},
 ],[items]);
 const totals=useMemo(()=>items.reduce((s,r)=>({production:s.production+count(r.productionReceived),packed:s.packed+r.packedQty,unpacked:s.unpacked+r.unpacked}),{production:0,packed:0,unpacked:0}),[items]);
 function begin(row,kitName){setEditing(`${kitName}::${row.id}`);setRowError("");}
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
     await request("/project-cartons","PATCH",{action:"rename",projectId,scope:"boxes",editTab:"all",cartonId:box.id,cartonLabel:label,expectedUpdatedAt:box.updated_at});
     setNotice(`Box renamed to ${label}.`);
   }else if(boxActionType==="delete"){
     await request("/project-cartons","PATCH",{action:"cancel",projectId,scope:"boxes",editTab:"all",cartonId:box.id});
     setNotice(`Box ${box.carton_label} removed from active packing. History preserved.`);
   }
   await refresh();if(boxActionType==="delete")await onChanged?.();setBoxDialog("");setBoxActionType("");
 }catch(e){setBoxError(e.message||"Could not update box.");}finally{setBusy(false);}}
 async function generateSchoolLabels(){
  const countValue=Number(labelCount);
  if(!labelSchools.length||!labelKit||!/^[0-9]+$/.test(labelCount)||!Number.isSafeInteger(countValue)||countValue<1||countValue>100||groupPlanReady){
   setError("Choose one or more schools, a common Kit group and 1–100 labels per school. Already-planned school groups cannot be expanded.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const response=await request("/project-cartons","POST",{action:"generate_school_kits",projectId,
     scope:"boxes",editTab:"all",schoolIds:labelSchools,kitName:labelKit,count:countValue});
   await refresh();setExpandedBoxKit(labelKit);setLabelCount("1");
   setNotice(`${response?.result?.count||countValue*labelSchools.length} labels generated for ${labelSchools.length} school(s). Each school has ${countValue} new physical Kit label(s).`);
  }catch(e){setError(e.message||"Unable to generate school Kit labels. No labels were generated if the batch was rejected.");}
  finally{setBusy(false);}
 }
 async function saveSchoolPacking(row,kitName,schoolPacks){
  setBusy(true);setRowError("");setError("");setNotice("");
  try{
   const result=await request("/production","POST",{action:"pack_schools",projectId,editTab:filter,itemId:row.id,kitName,schools:schoolPacks});
   await refresh();await onChanged?.();setEditing("");
   setNotice(`Saved ${row.name} across ${result?.result?.schools||schoolPacks.length} school(s). ${result?.result?.auto_closed?`${result.result.auto_closed} fully packed Kit(s) closed and locked automatically.`:"Fully packed Kits close automatically."}`);
  }catch(e){setRowError(e.message||"Could not distribute school Kit quantities.");}finally{setBusy(false);}
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
 const packActors=useMemo(()=>{const map=new Map();for(const event of data?.audit||[]){if(event.action!=="set_line"||!event.changed_by_name||!event.details?.component)continue;const name=norm(event.details.component);if(!map.has(name))map.set(name,[]);const list=map.get(name);if(!list.includes(event.changed_by_name))list.push(event.changed_by_name);}return map;},[data]);
 return <div className="pr-box-distribution">
  {error&&<div className="pr-alert" role="alert">{error}</div>}{notice&&<div className="pr-manifest-success" role="status">{notice}</div>}
  {loading?<p className="pr-muted">Loading box distribution…</p>:<>
   <div className="pr-intake-tabs-toolbar">
    <StageFilterTabs label="Box component status" options={[{value:"all",label:"All Components"},{value:"available",label:"Remaining to Pack"},{value:"packed",label:"Packed"}]} value={mode==="boxes"?filter:""} onChange={value=>{setFilter(value);setOpened(null);setEditing("");setRowError("");if(mode!=="boxes")onReturnToBoxes?.();}}/>
    <div className="pr-intake-tabs-actions" aria-label="Box Distribution toolbar">
     <div className="pr-intake-search-slot"><div className={`pr-intake-search-control${searchOpen?" is-open":""}`} role="search">
      <button type="button" className="pr-intake-search-toggle" aria-label={searchOpen?"Close box search":"Search box distribution"} aria-expanded={searchOpen} aria-controls="pr-box-distribution-search" title={searchOpen?"Close search":"Search components"} onClick={()=>{if(searchOpen)closeSearch();else{onReturnToBoxes?.();setSearchOpen(true);}}}><BoxIcon name="search" size={17}/></button>
      <div className="pr-intake-search-expand"><input ref={searchInputRef} id="pr-box-distribution-search" type="search" aria-label="Search box distribution" placeholder="Search component or code…" disabled={!searchOpen} tabIndex={searchOpen?0:-1} value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closeSearch();}}}/><button type="button" className="pr-intake-search-clear" aria-label="Close box search" title="Close search" disabled={!searchOpen} tabIndex={searchOpen?0:-1} onClick={closeSearch}><BoxIcon name="close" size={17}/></button></div>
     </div></div>
     <button type="button" className="pr-box-v409-label-button" aria-label="Boxes Label" title="Manage box labels" onClick={openBoxLabels}><BoxIcon name="box" size={20}/>{activeCartons.length>0&&<span className="pr-box-v409-label-count">{activeCartons.length}</span>}</button>
     <button type="button" aria-label="Box History" aria-pressed={historyActive} title="Box History" className={`pr-pt-history-button${historyActive?" is-active":""}`} onClick={()=>{closeSearch();onHistoryToggle?.();}}><BoxIcon name="history" size={20}/></button>
     <button type="button" className="pr-pt-download-button" aria-label="Download Box Distribution report" title="Download Box Distribution report" onClick={onDownload} disabled={downloadDisabled}><BoxIcon name="download" size={20}/></button>
    </div>
   </div>
   {mode==="boxes"&&<>
    <div className="pr-pt-kits pr-pt-kit-list pr-box-kit-list">{groups.map(g=>{const appearance=boxKitAppearance(g.name),open=Boolean(search.trim())||opened===g.key;return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={g.key}>
     <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setOpened(open?"__none__":g.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{g.name}</strong><small>{g.items.length} components</small></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
     {open&&<div className="pr-pt-kit-body">{g.items.map(row=>{const active=editing===`${g.name}::${row.id}`,actors=packActors.get(norm(row.name))||[];return <article className={`pr-pt-row pr-intake-component pr-box-v409-row${active?" is-editing":""}`} key={`${g.key}-${row.id}`}>
      <div className="pr-intake-component-main">
       <div className="pr-intake-component-product"><BoxComponentPhoto row={row} onOpen={()=>{setPreview(row);setPreviewIndex(0);}}/><div className="pr-pt-name"><strong>{row.name}</strong>{row.code&&<small>{row.code}</small>}</div></div>
       <div className="pr-intake-cell"><span>Operations Received</span><strong>{formatted(row.productionReceived)}</strong></div>
       <div className="pr-intake-cell pr-intake-cell--received"><span>Packed</span><strong>{formatted(row.packedQty)}</strong></div>
       <div className="pr-intake-cell"><span>Remaining</span><strong>{formatted(row.unpacked)}</strong></div>
       <div className="pr-intake-editors" aria-label={actors.length?`Packed by ${actors.join(", ")}`:"No recorded packers"}>{actors.length?actors.slice(0,3).map(person=><span className="pr-intake-avatar" key={person} title={person}>{String(person).slice(0,1).toUpperCase()}</span>):<span className="pr-intake-no-editors">—</span>}</div>
       <div className="pr-intake-row-actions">{canEditTab&&(active?<button type="button" className="pr-intake-action pr-intake-action--cancel" aria-label={`Cancel packing edit for ${row.name}`} disabled={busy} title="Cancel" onClick={()=>{setEditing("");setRowError("");}}><BoxIcon name="close" size={17}/></button>:<button type="button" className="pr-intake-edit-icon" disabled={busy} aria-label={`Edit packing for ${row.name}`} title="Pack by School" onClick={()=>begin(row,g.name)}><BoxIcon name="edit" size={18}/></button>)}</div>
      </div>
      {active&&<div className="pr-box-v409-equal-editor"><SchoolEqualPackingEditor key={`${g.name}-${row.id}`} row={row} kitName={g.name} data={data} busy={busy} error={rowError} onCancel={()=>{setEditing("");setRowError("");}} onSave={selections=>saveSchoolPacking(row,g.name,selections)}/></div>}
     </article>;})}</div>}
    </section>;})}{!groups.length&&<p className="pr-wh-empty">No components match this filter. Try All Components to review previously packed stock.</p>}</div>
   </>}
   {preview&&typeof document!=="undefined"&&createPortal(<div className="pr-intake-image-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPreview(null);}}><section className="pr-intake-image-modal" role="dialog" aria-modal="true" aria-label={`Component image: ${preview.name}`}><header className="pr-intake-image-header"><div><strong>{preview.name}</strong>{(preview.imageUrls?.length||0)>1&&<small>{previewIndex+1} / {preview.imageUrls.length}</small>}</div><button type="button" autoFocus aria-label="Close image preview" onClick={()=>setPreview(null)}><BoxIcon name="close" size={20}/></button></header><div className="pr-intake-image-content">{(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Previous image" onClick={()=>setPreviewIndex(i=>(i+preview.imageUrls.length-1)%preview.imageUrls.length)}><BoxIcon name="previous" size={22}/></button>}<img src={preview.imageUrls[previewIndex]} alt={preview.name}/>{(preview.imageUrls?.length||0)>1&&<button type="button" aria-label="Next image" onClick={()=>setPreviewIndex(i=>(i+1)%preview.imageUrls.length)}><BoxIcon name="next" size={22}/></button>}</div></section></div>,document.body)}
   {boxesOpen&&<div className="pr-box-labels-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeBoxLabels();}}><section ref={boxesModalRef} className="pr-box-labels-sheet" role="dialog" aria-modal="true" aria-label="Boxes Label">
      <header className="pr-box-labels-head"><div className="pr-box-labels-head-icon"><BoxIcon name="box" size={23}/></div><div className="pr-box-labels-heading"><h4>Boxes Label</h4><p>School Kit labels, packing contents and verification</p></div><span className="pr-box-labels-total">{activeCartons.length} boxes</span><button type="button" ref={boxesCloseRef} className="pr-box-labels-close" aria-label="Close Boxes Label" onClick={closeBoxLabels}><BoxIcon name="close" size={19}/></button></header>
      <div className="pr-box-labels-body">
       {error&&<p className="pr-wr-inline-error" role="alert">{error}</p>}{notice&&<p className="pr-manifest-success" role="status">{notice}</p>}
       {canManageLabels&&<section className="pr-box-labels-create pr-school-kit-generator">
        <div className="pr-box-labels-section-title"><strong>Generate School Kit Labels</strong><small>Select one or more schools and create the same number of Kit labels for each school.</small></div>
        <div className="pr-box-create pr-school-kit-create">
         <LabelSchoolsPicker schools={labelSchoolOptions} selected={labelSchools} onChange={changeLabelSchools} disabled={busy}/>
         <PreparingSelect aria-label="Kit group for new labels" value={labelKit} onChange={e=>setLabelKit(e.target.value)} disabled={!labelSchools.length}><option value="">Select kit group</option>{labelSchoolKits.map(kit=><option value={kit} key={kit}>{kit}</option>)}</PreparingSelect>
         <input aria-label="Number of kits per selected school" inputMode="numeric" type="number" min="1" max="100" step="1" placeholder="No. of kits" value={labelCount} onChange={e=>setLabelCount(e.target.value)}/>
         <button type="button" className="pr-primary" disabled={busy||groupPlanReady||!labelSchools.length||!labelKit||!/^\d+$/.test(labelCount)||Number(labelCount)<1||Number(labelCount)>100} onClick={generateSchoolLabels}>Generate Labels</button>
        </div>
        {groupPlanReady&&<small className="pr-wr-inline-error">Packing or planning has already started for at least one selected school in this Kit group. Remove that school to generate additional labels.</small>}
        <small className="pr-school-kit-help">The selected schools must share the chosen Kit group. The count applies to each school. Generate all labels before packing. In Available to Pack, select schools and enter a school total: it is divided equally among the school’s labels (whole numbers only). Once packing starts, label counts are locked.</small>
       </section>}
       <div className="pr-box-labels-section-title pr-box-labels-groups-label"><strong>Kit Groups</strong><small>{boxGroups.length} groups</small></div>
       <div className="pr-box-labels-groups">{boxGroups.map(group=>{const appearance=boxKitAppearance(group.name),open=expandedBoxKit===group.name;return <section key={group.name} className={`pr-box-labels-group pr-pt-kit--${appearance.tone}`}><button type="button" className="pr-box-labels-group-toggle" aria-expanded={open} onClick={()=>{setExpandedBoxKit(open?"":group.name);setBoxMenu("");}}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-box-labels-group-name"><strong>{group.name}</strong><small>{group.cartons.length} {group.cartons.length===1?"box":"boxes"}</small></span><span className={`pr-box-labels-chevron${open?" is-open":""}`} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>{open&&<div className="pr-box-labels-group-body">{group.cartons.length?<div className="pr-box-labels-box-grid">{group.cartons.map(c=><div key={c.id} className="pr-box-pill" onPointerDown={e=>canManageLabels&&startHold(e,c.id)} onPointerMove={moveHold} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold} onContextMenu={e=>{if(canManageLabels)showMenu(e,c.id);}}><button type="button" className="pr-box-labels-box-details pr-box-inspect-trigger" onClick={()=>setInspectBoxId(c.id)} aria-label={`View contents of ${c.carton_label}`}><span className="pr-box-labels-box-symbol"><BoxIcon name="box" size={19}/></span><span className="pr-box-labels-card-copy"><strong>{c.carton_label}</strong><small>{(data?.schools||[]).find(s=>s.id===c.school_id)?.beneficiary_name||"Legacy project box"}</small><small className={`pr-box-labels-status${c.status==="draft"?" is-draft":""}`}>{c.generated_kit_label?(c.status==="ready"?"Packed · Verified":"Packing pending"):c.status}</small></span></button>{canManageLabels&&<button type="button" className="pr-box-labels-box-menu" title={`Actions for ${c.carton_label}`} aria-label={`Actions for ${c.carton_label}`} aria-expanded={boxMenu===c.id} onClick={()=>{if(suppressBoxClick.current){suppressBoxClick.current=false;return;}setBoxMenu(v=>v===c.id?"":c.id);}}><BoxIcon name="more" size={19}/></button>}{canManageLabels&&boxMenu===c.id&&<div className="pr-box-context-menu" role="menu"><button type="button" role="menuitem" disabled={c.status!=="draft"||c.generated_kit_label} title={c.generated_kit_label?"Generated label IDs cannot be renamed":c.status!=="draft"?"Only draft boxes can be renamed":"Rename box"} onClick={()=>boxAction("rename",c)}><BoxIcon name="rename" size={16}/><span>Rename</span></button><button type="button" role="menuitem" className="danger" disabled={c.generated_kit_label&&c.status==="ready"} onClick={()=>boxAction("delete",c)}><BoxIcon name="trash" size={16}/><span>Delete</span></button></div>}</div>)}</div>:<div className="pr-box-labels-empty">No boxes yet for this kit. {canManageLabels?"Create one above to get started.":""}</div>}</div>}</section>;})}{!boxGroups.length&&<p className="pr-box-labels-empty">No kit groups available for this project.</p>}</div>
      </div>
     </section></div>}
   {inspectedBox&&boxesOpen&&<div className="pr-box-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setInspectBoxId("");}}><section className="pr-box-dialog pr-school-kit-inspection" role="dialog" aria-modal="true" aria-label={`Kit contents ${inspectedBox.carton_label}`}>
    <header><div><h4>{inspectedBox.carton_label}</h4><small>{inspectedSchool?.beneficiary_name||"Legacy project box"} · {inspectedBox.kit_name}</small></div><button type="button" className="pr-secondary" onClick={()=>setInspectBoxId("")} aria-label="Close kit contents">×</button></header>
    {inspectedBox.generated_kit_label ? <>
      <div className="pr-kit-progress-head"><span className={`pr-kit-status-pill${inspectedBox.status==="ready"?" is-complete":""}`}>{inspectedBox.status==="ready"?"Packed · Verified":"Pending Packing"}</span><strong>{manifestPacked} / {manifestRequired} units</strong></div>
      {!manifestTargets.length ? <section className="pr-kit-plan-intro">
        <strong>Packing plan not started</strong>
        <p>Open Box Distribution, choose a component and select one or more schools. The system will create identical requirements for each Kit label automatically and distribute your saved quantity equally. Individual Box editing has been disabled.</p>
        {inspectedLines.length>0&&<div className="pr-school-kit-lines">{inspectedLines.map(l=><div key={l.id}><span>{l.product_name}</span><strong>{l.packed_qty} packed</strong></div>)}</div>}
      </section> : <>
       <p className="pr-school-kit-help">Equal school Kit manifest · Required / Packed / Remaining (read-only)</p>
       <div className="pr-school-kit-lines pr-kit-target-lines">{manifestTargets.map(t=>{const packed=count(inspectedLines.find(l=>same(l,t))?.packed_qty);return <div key={t.id} className="pr-kit-target-line">
         <span className="pr-kit-target-name"><strong>{t.product_name}</strong><small>{t.product_id||"Component"}</small></span>
         <span className="pr-kit-target-numbers"><span>Required <b>{t.expected_qty}</b></span><span>Packed <b>{packed}</b></span><span>Remaining <b>{Math.max(0,count(t.expected_qty)-packed)}</b></span></span>
       </div>;})}</div>
       {inspectedLines.some(l=>!manifestTargets.some(t=>same(l,t)))&&<p className="pr-wr-inline-error">Unexpected packed component found. Unpack it before completing this Kit.</p>}
       {inspectedBox.status==="draft"&&manifestProgress.complete&&<p className="pr-school-kit-help">All units are packed. Automatic closure will finalize this Kit when the v413 database migration is applied.</p>}
       {inspectedBox.status==="ready"&&<p className="pr-manifest-success">Packing verified. This Kit is locked and eligible for Project Kit Cartons.</p>}
      </>}
    </> : <>
      <p className="pr-school-kit-help">Packed contents ({inspectedLines.length} item types)</p>
      {inspectedLines.length?<div className="pr-school-kit-lines">{inspectedLines.map(l=><div key={l.id}><span>{l.product_name}</span><strong>{l.packed_qty}</strong></div>)}</div>:<p className="pr-box-labels-empty">No components have been packed into this Kit yet.</p>}
    </>}
    <footer className="pr-label-print-actions">{inspectedBox.generated_kit_label&&<a className="pr-primary" href={`/next/api/projects-preparing/label-print?kind=kit&id=${encodeURIComponent(inspectedBox.id)}&projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer" title="Download a printable PDF with the permanent QR code">↓ Download Kit Label + QR</a>}<button type="button" className="pr-secondary" onClick={()=>setInspectBoxId("")}>Close</button></footer>
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
