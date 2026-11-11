"use client";
import StageFilterTabs from "./StageFilterTabs";
import PreparingSelect from "./PreparingSelect";
import StageQuantityInput from "./StageQuantityInput";
import {useEffect,useMemo,useRef,useState} from "react";
import {warehouseGroups} from "../../lib/preparing-warehouse-view.mjs";
import {boxPackingTarget} from "../../lib/preparing-production-math.mjs";
import {filterBoxDistributionRows} from "../../lib/preparing-box-visibility.mjs";
import {groupBoxLabels} from "../../lib/preparing-box-labels.mjs";
import {schoolKitPackingProgress} from "../../lib/preparing-school-kit-packing.mjs";
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
export default function ProjectBoxDistribution({projectId,rows,kitGroups,request,allowed,editTabs={},mode="boxes",navigation,onChanged,filter,setFilter,onReturnToBoxes}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[opened,setOpened]=useState(null),[editing,setEditing]=useState(""),[cartonId,setCartonId]=useState(""),[quantity,setQuantity]=useState("0"),[rowError,setRowError]=useState("");
 const canEditTab=allowed && editTabs[filter] !== false;
 const canManageLabels=allowed && editTabs.all !== false;
 const [labelSchool,setLabelSchool]=useState(""),[labelKit,setLabelKit]=useState(""),[labelCount,setLabelCount]=useState("1");
 const [inspectBoxId,setInspectBoxId]=useState("");
 const [manifestEditId,setManifestEditId]=useState(""),[manifestQty,setManifestQty]=useState("0"),[manifestError,setManifestError]=useState("");
 const [legacyUnpackConfirm,setLegacyUnpackConfirm]=useState("");
 const [moveComponentId,setMoveComponentId]=useState(""),[moveToBox,setMoveToBox]=useState(""),[moveQty,setMoveQty]=useState("1");
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
 const labelSchoolKits=useMemo(()=>{
  const set=new Set();for(const c of data?.components||[])if(c.school_id===labelSchool){
   if(!Array.isArray(c.source_kits)||!c.source_kits.length)set.add("General");
   else for(const k of c.source_kits)if(k?.kitName)set.add(String(k.kitName));
  }return [...set].sort((a,b)=>a.localeCompare(b));
 },[data,labelSchool]);
 const inspectedBox=(data?.cartons||[]).find(c=>c.id===inspectBoxId);
 const inspectedLines=(data?.lines||[]).filter(l=>l.carton_id===inspectBoxId);
 const inspectedSchool=(data?.schools||[]).find(s=>s.id===inspectedBox?.school_id);
 const expectedSchoolItems=(data?.components||[]).filter(c=>c.school_id===inspectedBox?.school_id&&matchesKit(c,inspectedBox?.kit_name));
 const manifestTargets=(data?.kitTargets||[]).filter(t=>t.kit_box_id===inspectedBox?.id);
 const manifestProgress=schoolKitPackingProgress(inspectBoxId,data?.kitTargets||[],data?.lines||[]);
 const manifestReady=manifestProgress.complete;
 const manifestPacked=manifestProgress.packed;
 const manifestRequired=manifestProgress.required;
 const manifestPeers=(data?.cartons||[]).filter(c=>c.id!==inspectedBox?.id && c.generated_kit_label &&
  c.school_id===inspectedBox?.school_id && c.kit_name===inspectedBox?.kit_name && c.status==="draft");
 const groupPlanReady=(data?.kitTargets||[]).some(t=>{
   const c=(data?.cartons||[]).find(box=>box.id===t.kit_box_id);
   return c?.school_id===labelSchool&&c?.kit_name===labelKit;
 });

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
  {value:"packed",label:"Packed",hint:"Components with at least one unit in an active box",count:items.filter(r=>r.packedQty>0).length},
  {value:"all",label:"All Components",hint:"Including fully packed items",count:items.length},
 ],[items]);
 const totals=useMemo(()=>items.reduce((s,r)=>({production:s.production+count(r.productionReceived),packed:s.packed+r.packedQty,unpacked:s.unpacked+r.unpacked}),{production:0,packed:0,unpacked:0}),[items]);
 const currentRow=items.find(r=>r.id===editing);
 const choices=useMemo(()=>draftCartons.filter(c=>currentRow&& (data?.components||[]).some(s=>same(s,currentRow)&&matchesKit(s,c.kit_name)&&(!c.school_id||c.school_id===s.school_id))&&(!c.generated_kit_label||targetFor(currentRow,c.id))),[draftCartons,currentRow,data]);
 function storedLine(row,id){return (data?.lines||[]).find(l=>l.carton_id===id&&same(row,l));}
 function targetFor(row,id){return (data?.kitTargets||[]).find(t=>t.kit_box_id===id&&same(t,row));}
 function begin(row){const options=draftCartons.filter(c=>(data?.components||[]).some(s=>same(s,row)&&matchesKit(s,c.kit_name)&&(!c.school_id||c.school_id===s.school_id))&&(!c.generated_kit_label||targetFor(row,c.id)));const target=options.find(c=>!!storedLine(row,c.id))||options[0];setEditing(row.id);setCartonId(target?.id||"");setQuantity(String(target?count(storedLine(row,target.id)?.packed_qty):0));setRowError("");}
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
     await request("/project-cartons","PATCH",{action:"rename",projectId,scope:"boxes",editTab:"all",cartonId:box.id,cartonLabel:label,expectedUpdatedAt:box.updated_at});
     setNotice(`Box renamed to ${label}.`);
   }else if(boxActionType==="delete"){
     await request("/project-cartons","PATCH",{action:"cancel",projectId,scope:"boxes",editTab:"all",cartonId:box.id});
     setNotice(`Box ${box.carton_label} removed from active packing. History preserved.`);
     if(cartonId===box.id){setEditing("");setCartonId("");}
   }
   await refresh();if(boxActionType==="delete")await onChanged?.();setBoxDialog("");setBoxActionType("");
 }catch(e){setBoxError(e.message||"Could not update box.");}finally{setBusy(false);}}
 async function generateSchoolLabels(){
  const countValue=Number(labelCount);
  if(!labelSchool||!labelKit||!/^\d+$/.test(labelCount)||!Number.isSafeInteger(countValue)||countValue<1||countValue>100){
   setError("Choose a school, Kit group and a quantity between 1 and 100.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const response=await request("/project-cartons","POST",{action:"generate_school_kits",projectId,
     scope:"boxes",editTab:"all",schoolId:labelSchool,kitName:labelKit,count:countValue});
   await refresh();setExpandedBoxKit(labelKit);setLabelCount("1");
   setNotice(`${response?.result?.count||countValue} labels generated. Open a label and prepare its packing manifest before packing.`);
  }catch(e){setError(e.message||"Unable to generate school Kit labels.");}
  finally{setBusy(false);}
 }
 async function prepareKitPlan(){
  if(!inspectedBox?.school_id||busy)return;
  setBusy(true);setManifestError("");setError("");setNotice("");
  try{const res=await request("/project-cartons","POST",{action:"init_school_kit_plan",projectId,
    scope:"boxes",editTab:"all",schoolId:inspectedBox.school_id,kitName:inspectedBox.kit_name});
   await refresh();setNotice(`Packing plan created for ${res?.result?.labels||0} school Kit labels.`);
  }catch(e){setManifestError(e.message||"Could not prepare packing plan.");}
  finally{setBusy(false);}
 }
 async function clearPreplanLine(line){
  if(!inspectedBox||!canManageLabels||busy||inspectedBox.status!=="draft")return;
  const source=(data?.components||[]).find(c=>c.school_id===inspectedBox.school_id&&same(c,line)&&matchesKit(c,inspectedBox.kit_name));
  const masterRow=items.find(r=>same(r,line));
  if(!source||!masterRow){setManifestError("Cannot match this packed line to the school BOM. Contact an administrator.");return;}
  setBusy(true);setManifestError("");
  try{await request("/production","POST",{action:"pack",projectId,editTab:"all",
    cartonId:inspectedBox.id,sourceComponentId:source.id,itemId:masterRow.id,
    quantity:0,expectedUpdatedAt:inspectedBox.updated_at});
   await refresh();await onChanged?.();setLegacyUnpackConfirm("");
   setNotice(`Unpacked ${line.product_name} from ${inspectedBox.carton_label}.`);
  }catch(e){setManifestError(e.message||"Unable to unpack this Kit component.");}
  finally{setBusy(false);}
 }
 async function saveManifestLine(target){
  const n=Number(manifestQty);
  if(!inspectedBox||!Number.isSafeInteger(n)||n<0||n>count(target.expected_qty)){
    setManifestError(`Packed quantity must be between 0 and ${target.expected_qty}.`);return;}
  const masterRow=items.find(r=>same(r,target));
  if(!masterRow){setManifestError(`Master BOM component not found for ${target.product_name}.`);return;}
  setBusy(true);setManifestError("");setError("");
  try{await request("/production","POST",{action:"pack",projectId,editTab:"all",
    cartonId:inspectedBox.id,sourceComponentId:target.source_component_id,itemId:masterRow.id,
    quantity:n,expectedUpdatedAt:inspectedBox.updated_at});
   await refresh();await onChanged?.();setManifestEditId("");
  }catch(e){setManifestError(e.message||"Could not save Kit quantity.");}finally{setBusy(false);}
 }
 async function transferManifestTarget(){
  const n=Number(moveQty);
  if(!inspectedBox||!moveComponentId||!moveToBox||!Number.isSafeInteger(n)||n<1){
    setManifestError("Select a component, destination Kit and quantity.");return;}
  setBusy(true);setManifestError("");
  try{await request("/project-cartons","POST",{action:"transfer_school_kit_target",projectId,
    scope:"boxes",editTab:"all",cartonId:inspectedBox.id,toCartonId:moveToBox,
    sourceComponentId:moveComponentId,quantity:n});
   await refresh();setMoveComponentId("");setMoveToBox("");setMoveQty("1");
   setNotice("Kit contents plan updated. School total preserved.");
  }catch(e){setManifestError(e.message||"Could not transfer Kit requirement.");}finally{setBusy(false);}
 }
 async function completeManifestKit(){
  if(!inspectedBox||!manifestReady||busy)return;
  setBusy(true);setManifestError("");setError("");
  try{await request("/project-cartons","PATCH",{action:"complete_school_kit",projectId,
    scope:"boxes",editTab:"all",cartonId:inspectedBox.id,expectedUpdatedAt:inspectedBox.updated_at});
   await refresh();await onChanged?.();setNotice(`${inspectedBox.carton_label} completed and locked.`);
  }catch(e){setManifestError(e.message||"Could not complete Kit.");}finally{setBusy(false);}
 }
 async function save(row){const carton=draftCartons.find(c=>c.id===cartonId);if(!carton){setRowError("Generate a school Kit label and prepare its packing plan in Boxes Label, then choose the Kit.");return;}
  const source=(data?.components||[]).find(c=>same(c,row)&&matchesKit(c,carton.kit_name)&&(!carton.school_id||carton.school_id===c.school_id));if(!source){setRowError("This component is not available in the selected box Kit. Check captured school components.");return;}
  try{boxPackingTarget(row.productionReceived,row.packedQty,count(storedLine(row,carton.id)?.packed_qty),quantity);}catch(e){setRowError(e.message);return;}
  if(Number(quantity)===count(storedLine(row,carton.id)?.packed_qty)){setEditing("");return;}
  setBusy(true);setRowError("");setError("");setNotice("");try{
   await request("/production","POST",{action:"pack",projectId,editTab:filter,cartonId:carton.id,sourceComponentId:source.id,itemId:row.id,quantity:Number(quantity),expectedUpdatedAt:carton.updated_at});
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
   <div className="pr-production-summary pr-box-summary pr-pt-stat-grid" aria-label="Box Distribution summary">{[["Operations Received",totals.production,"required","inbox"],["Packed",totals.packed,"received","packed"],["Available to Pack / Unpacked",totals.unpacked,"available","box"]].map(([name,n,tone,icon])=><div className={`pr-pt-stat pr-pt-stat--${tone}`} key={tone}><span className="pr-pt-stat-icon"><BoxIcon name={icon} size={22}/></span><span className="pr-pt-stat-copy"><span>{name}</span><strong>{formatted(n)}</strong></span></div>)}</div>
   <StageFilterTabs label="Box component status" options={[...filterOptions].sort((a,b)=>Number(b.value==="all")-Number(a.value==="all"))} value={mode==="boxes"?filter:""} onChange={value=>{setFilter(value);setOpened(null);setEditing("");setRowError("");if(mode!=="boxes")onReturnToBoxes?.();}}/>
   {typeof navigation==="function"&&navigation(openBoxLabels,activeCartons.length,mode==="boxes"?<label className="pr-search pr-pt-search"><BoxIcon name="search" size={18}/><input type="search" aria-label="Search box distribution" placeholder="Search component or code…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="pr-pt-clear-search" aria-label="Clear box search" title="Clear search" onClick={()=>setSearch("")}><BoxIcon name="close" size={16}/></button>}</label>:<span className="pr-stage-history-label">Box History</span>)}
   {mode==="boxes"&&<>
    <div className="pr-pt-kits pr-pt-kit-list pr-box-kit-list">{groups.map(g=>{const appearance=boxKitAppearance(g.name),open=Boolean(search.trim())||opened===g.key;return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={g.key}><button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setOpened(open?"__none__":g.key)}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-pt-kit-title"><strong>{g.name}</strong><small>{g.items.length} components</small></span><span className="pr-pt-kit-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>{open&&<div className="pr-pt-kit-body">{g.items.map(row=><article className="pr-production-row" key={g.key+row.id}><div className="pr-production-item-head"><div><strong>{row.name}</strong></div><span className="pr-production-badge">Operations Received {formatted(row.productionReceived)}</span></div><div className="pr-production-metrics pr-box-metrics"><div><small>Available to Pack</small><strong>{formatted(row.unpacked)}</strong></div><div><small>Packed</small><strong className="pr-box-purple">{formatted(row.packedQty)}</strong></div><div><small>Unpacked</small><strong>{formatted(row.unpacked)}</strong></div><div className="pr-production-actions">{editing===row.id?<button className="pr-secondary" disabled={busy} onClick={()=>{setEditing("");setRowError("");}}>Cancel</button>:<button className="pr-secondary" disabled={!canEditTab||busy} onClick={()=>begin(row)}>Edit</button>}</div></div>{editing===row.id&&<div className="pr-box-editor"><label>Box<PreparingSelect aria-label={`Box for ${row.name}`} value={cartonId} onChange={e=>choose(e.target.value)}><option value="">Choose draft box</option>{choices.map(c=><option key={c.id} value={c.id}>{c.carton_label} · {c.kit_name}</option>)}</PreparingSelect></label><label>Packed in selected box<StageQuantityInput min="0" step="1" aria-label={`Packed ${row.name}`} value={quantity} onValueChange={value=>{setQuantity(value);setRowError("");}}/></label><div className="pr-box-preview"><small>Unpacked after saving</small><strong>{Number.isSafeInteger(Number(quantity))?formatted(Math.max(0,row.productionReceived-row.packedQty+count(storedLine(row,cartonId)?.packed_qty)-Number(quantity))):"—"}</strong></div><button className="pr-primary" disabled={busy||!cartonId} onClick={()=>save(row)}>Save</button>{rowError&&<p className="pr-wr-inline-error" role="alert">{rowError}</p>}</div>}</article>)}</div>}</section>;})}{!groups.length&&<p className="pr-wh-empty">No components match this filter. Try All Components to review previously packed stock.</p>}</div>
   </>}
   {boxesOpen&&<div className="pr-box-labels-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeBoxLabels();}}><section ref={boxesModalRef} className="pr-box-labels-sheet" role="dialog" aria-modal="true" aria-label="Boxes Label">
      <header className="pr-box-labels-head"><div className="pr-box-labels-head-icon"><BoxIcon name="box" size={23}/></div><div className="pr-box-labels-heading"><h4>Boxes Label</h4><p>School Kit labels, packing contents and verification</p></div><span className="pr-box-labels-total">{activeCartons.length} boxes</span><button type="button" ref={boxesCloseRef} className="pr-box-labels-close" aria-label="Close Boxes Label" onClick={closeBoxLabels}><BoxIcon name="close" size={19}/></button></header>
      <div className="pr-box-labels-body">
       {error&&<p className="pr-wr-inline-error" role="alert">{error}</p>}{notice&&<p className="pr-manifest-success" role="status">{notice}</p>}
       {canManageLabels&&<section className="pr-box-labels-create pr-school-kit-generator">
        <div className="pr-box-labels-section-title"><strong>Generate School Kit Labels</strong><small>Select a beneficiary school and the number of complete kits for that school.</small></div>
        <div className="pr-box-create pr-school-kit-create">
         <PreparingSelect aria-label="School for new Kit labels" value={labelSchool} onChange={e=>{setLabelSchool(e.target.value);setLabelKit("");}}><option value="">Select school</option>{labelSchoolOptions.map(s=><option value={s.id} key={s.id}>{s.beneficiary_name}</option>)}</PreparingSelect>
         <PreparingSelect aria-label="Kit group for new labels" value={labelKit} onChange={e=>setLabelKit(e.target.value)} disabled={!labelSchool}><option value="">Select kit group</option>{labelSchoolKits.map(kit=><option value={kit} key={kit}>{kit}</option>)}</PreparingSelect>
         <input aria-label="Number of kits for selected school" inputMode="numeric" type="number" min="1" max="100" step="1" placeholder="No. of kits" value={labelCount} onChange={e=>setLabelCount(e.target.value)}/>
         <button type="button" className="pr-primary" disabled={busy||groupPlanReady||!labelSchool||!labelKit||!/^\d+$/.test(labelCount)||Number(labelCount)<1||Number(labelCount)>100} onClick={generateSchoolLabels}>Generate Labels</button>
        </div>
        <small className="pr-school-kit-help">One label per physical Kit. Labels are uniquely numbered per school and Kit group. Create the full number of labels before preparing the packing plan. After planning or packing starts, label counts are locked. Generating labels does not mark components as packed.</small>
       </section>}
       <div className="pr-box-labels-section-title pr-box-labels-groups-label"><strong>Kit Groups</strong><small>{boxGroups.length} groups</small></div>
       <div className="pr-box-labels-groups">{boxGroups.map(group=>{const appearance=boxKitAppearance(group.name),open=expandedBoxKit===group.name;return <section key={group.name} className={`pr-box-labels-group pr-pt-kit--${appearance.tone}`}><button type="button" className="pr-box-labels-group-toggle" aria-expanded={open} onClick={()=>{setExpandedBoxKit(open?"":group.name);setBoxMenu("");}}><span className="pr-pt-kit-emblem" aria-hidden="true"><BoxIcon name={appearance.icon} size={21}/></span><span className="pr-box-labels-group-name"><strong>{group.name}</strong><small>{group.cartons.length} {group.cartons.length===1?"box":"boxes"}</small></span><span className={`pr-box-labels-chevron${open?" is-open":""}`} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>{open&&<div className="pr-box-labels-group-body">{group.cartons.length?<div className="pr-box-labels-box-grid">{group.cartons.map(c=><div key={c.id} className="pr-box-pill" onPointerDown={e=>canManageLabels&&startHold(e,c.id)} onPointerMove={moveHold} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold} onContextMenu={e=>{if(canManageLabels)showMenu(e,c.id);}}><button type="button" className="pr-box-labels-box-details pr-box-inspect-trigger" onClick={()=>setInspectBoxId(c.id)} aria-label={`View contents of ${c.carton_label}`}><span className="pr-box-labels-box-symbol"><BoxIcon name="box" size={19}/></span><span className="pr-box-labels-card-copy"><strong>{c.carton_label}</strong><small>{(data?.schools||[]).find(s=>s.id===c.school_id)?.beneficiary_name||"Legacy project box"}</small><small className={`pr-box-labels-status${c.status==="draft"?" is-draft":""}`}>{c.generated_kit_label?(c.status==="ready"?"Packed · Verified":"Packing pending"):c.status}</small></span></button>{canManageLabels&&<button type="button" className="pr-box-labels-box-menu" title={`Actions for ${c.carton_label}`} aria-label={`Actions for ${c.carton_label}`} aria-expanded={boxMenu===c.id} onClick={()=>{if(suppressBoxClick.current){suppressBoxClick.current=false;return;}setBoxMenu(v=>v===c.id?"":c.id);}}><BoxIcon name="more" size={19}/></button>}{canManageLabels&&boxMenu===c.id&&<div className="pr-box-context-menu" role="menu"><button type="button" role="menuitem" disabled={c.status!=="draft"||c.generated_kit_label} title={c.generated_kit_label?"Generated label IDs cannot be renamed":c.status!=="draft"?"Only draft boxes can be renamed":"Rename box"} onClick={()=>boxAction("rename",c)}><BoxIcon name="rename" size={16}/><span>Rename</span></button><button type="button" role="menuitem" className="danger" disabled={c.generated_kit_label&&c.status==="ready"} onClick={()=>boxAction("delete",c)}><BoxIcon name="trash" size={16}/><span>Delete</span></button></div>}</div>)}</div>:<div className="pr-box-labels-empty">No boxes yet for this kit. {canManageLabels?"Create one above to get started.":""}</div>}</div>}</section>;})}{!boxGroups.length&&<p className="pr-box-labels-empty">No kit groups available for this project.</p>}</div>
      </div>
     </section></div>}
   {inspectedBox&&boxesOpen&&<div className="pr-box-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setInspectBoxId("");}}><section className="pr-box-dialog pr-school-kit-inspection" role="dialog" aria-modal="true" aria-label={`Kit contents ${inspectedBox.carton_label}`}>
    <header><div><h4>{inspectedBox.carton_label}</h4><small>{inspectedSchool?.beneficiary_name||"Legacy project box"} · {inspectedBox.kit_name}</small></div><button type="button" className="pr-secondary" onClick={()=>setInspectBoxId("")} aria-label="Close kit contents">×</button></header>
    {inspectedBox.generated_kit_label ? <>
      <div className="pr-kit-progress-head"><span className={`pr-kit-status-pill${inspectedBox.status==="ready"?" is-complete":""}`}>{inspectedBox.status==="ready"?"Packed · Verified":"Pending Packing"}</span><strong>{manifestPacked} / {manifestRequired} units</strong></div>
      {manifestError&&<p role="alert" className="pr-wr-inline-error">{manifestError}</p>}
      {!manifestTargets.length ? <section className="pr-kit-plan-intro">
        <strong>Packing manifest not prepared</strong>
        <p>Before packing, create an expected-components snapshot for all labels in this school and Kit group. School BOM quantities are split across the existing labels, with remainder assigned in label order. Previously packed quantities are retained in the plan. Check quantities before continuing.</p>
        {inspectedLines.length>0&&<div className="pr-kit-preplan-lines"><p>Previously packed contents will be preserved in this plan. If an old quantity prevents planning, unpack it below and try again.</p>{inspectedLines.map(l=><div key={l.id} className="pr-kit-preplan-row"><span>{l.product_name} · {l.packed_qty} packed</span>{canManageLabels&&inspectedBox.status==="draft"&&(legacyUnpackConfirm===l.id?<span><button type="button" className="pr-danger-button" disabled={busy} onClick={()=>clearPreplanLine(l)}>Confirm Unpack</button><button type="button" className="pr-secondary" onClick={()=>setLegacyUnpackConfirm("")}>Cancel</button></span>:<button type="button" className="pr-secondary" disabled={busy} onClick={()=>setLegacyUnpackConfirm(l.id)}>Unpack</button>)}</div>)}</div>}
        {canManageLabels&&inspectedBox.status==="draft"&&<button type="button" disabled={busy} className="pr-primary" onClick={prepareKitPlan}>{busy?"Preparing…":"Prepare Kit Packing Plan"}</button>}
      </section> : <>
       <p className="pr-school-kit-help">Packing manifest · Required / Packed / Remaining</p>
       <div className="pr-school-kit-lines pr-kit-target-lines">{manifestTargets.map(t=>{const packed=count(inspectedLines.find(l=>same(l,t))?.packed_qty);return <div key={t.id} className="pr-kit-target-line">
         <span className="pr-kit-target-name"><strong>{t.product_name}</strong><small>{t.product_id||"Component"}</small></span>
         <span className="pr-kit-target-numbers"><span>Required <b>{t.expected_qty}</b></span><span>Packed <b>{packed}</b></span><span>Remaining <b>{Math.max(0,count(t.expected_qty)-packed)}</b></span></span>
         {canManageLabels&&inspectedBox.status==="draft"&&(manifestEditId===t.id?<span className="pr-kit-target-editor"><StageQuantityInput aria-label={`Packed quantity for ${t.product_name}`} min="0" max={t.expected_qty} step="1" value={manifestQty} onValueChange={setManifestQty}/><button type="button" className="pr-primary" disabled={busy} onClick={()=>saveManifestLine(t)}>Save</button><button type="button" className="pr-secondary" disabled={busy} onClick={()=>setManifestEditId("")}>Cancel</button></span>:<button type="button" className="pr-secondary" disabled={busy} onClick={()=>{setManifestEditId(t.id);setManifestQty(String(packed));setManifestError("");}}>Edit</button>)}
       </div>;})}</div>
       {canManageLabels&&inspectedBox.status==="draft"&&manifestPeers.length>0&&<details className="pr-kit-transfer"><summary>Adjust expected contents between school Kits</summary><p>Move part of a component's required quantity to another draft label in the same school and group. Packed quantities cannot be moved without unpacking first.</p><div className="pr-kit-transfer-grid"><PreparingSelect aria-label="Component to redistribute" value={moveComponentId} onChange={e=>setMoveComponentId(e.target.value)}><option value="">Choose component</option>{manifestTargets.map(t=><option key={t.id} value={t.source_component_id}>{t.product_name} ({t.expected_qty})</option>)}</PreparingSelect><PreparingSelect aria-label="Destination Kit label" value={moveToBox} onChange={e=>setMoveToBox(e.target.value)}><option value="">Destination label</option>{manifestPeers.map(b=><option key={b.id} value={b.id}>{b.carton_label}</option>)}</PreparingSelect><input aria-label="Units to transfer" type="number" inputMode="numeric" min="1" step="1" value={moveQty} onChange={e=>setMoveQty(e.target.value)}/><button type="button" className="pr-secondary" disabled={busy||!moveComponentId||!moveToBox} onClick={transferManifestTarget}>Move Required Units</button></div></details>}
       {inspectedLines.some(l=>!manifestTargets.some(t=>same(l,t)))&&<p className="pr-wr-inline-error">Unexpected packed component found. Unpack it before completing this Kit.</p>}
       {canManageLabels&&inspectedBox.status==="draft"&&<button type="button" className="pr-primary pr-kit-complete" disabled={busy||!manifestReady} onClick={completeManifestKit}>Mark Kit as Packed</button>}
       {inspectedBox.status==="ready"&&<p className="pr-manifest-success">Packing verified. This Kit is locked and eligible for school carton assembly in Phase 3.</p>}
      </>}
      <details className="pr-kit-reference"><summary>School Proposal components (reference only; not proof of packed contents)</summary><div className="pr-school-kit-lines">{expectedSchoolItems.map(c=><div key={c.id}><span>{c.product_name}</span><small>School required: {c.planned_qty}</small></div>)}</div></details>
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
