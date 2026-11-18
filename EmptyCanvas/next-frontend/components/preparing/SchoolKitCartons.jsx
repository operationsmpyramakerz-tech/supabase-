"use client";
import {preparingDisplayCode} from "../../lib/preparing-display-code.mjs";

import {useEffect,useMemo,useRef,useState} from "react";
import StageFilterTabs from "./StageFilterTabs";
import PreparingSelect from "./PreparingSelect";
import ProjectKitCartonsLegacy from "./ProjectKitCartons";
import {availableSchoolKits,validSchoolCartonSelection,schoolCartonContents} from "../../lib/preparing-school-cartons.mjs";

const asNumber=value=>Number(value)||0;
const schoolName=school=>school?.beneficiary_name||school?.name||"School";
const itemKey=item=>`${String(item.product_id||"").trim().toLowerCase()}\u0000${String(item.product_name||"").trim().toLowerCase()}`;

// Stage 6 uses the same solid-colour Kit folders and compact icon controls as Stages 1–5.
function cartonKitAppearance(name){
  const label=String(name||"").toLowerCase();
  if(/electronic|arduino|sensor|circuit|robot/.test(label))return {icon:"cpu",tone:"blue"};
  if(/stationary|stationery|writing/.test(label))return {icon:"pencil",tone:"green"};
  if(/laser|cutter/.test(label))return {icon:"laser",tone:"red"};
  if(/filament|printer/.test(label))return {icon:"spool",tone:"amber"};
  if(/addon|add.on/.test(label))return {icon:"puzzle",tone:"purple"};
  if(/tool|hand.held/.test(label))return {icon:"wrench",tone:"sky"};
  return {icon:"box",tone:"orange"};
}
function CartonIcon({name="box",size=20}){
  const shapes={
    box:<><path d="m12 2-9 5 9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></>,
    layers:<><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="10" y="10" width="4" height="4"/></>,
    pencil:<><path d="m4 20 4-1 12-12a2.1 2.1 0 0 0-3-3L5 16 4 20ZM14 7l3 3"/></>,
    laser:<><circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3.5 3.5m7 7L19 19M19 5l-3.5 3.5m-7 7L5 19"/></>,
    spool:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 7h14M5 17h14M9 11c2-1 4-1 6 0m-6 3c2-1 4-1 6 0"/></>,
    puzzle:<path d="M10 3H4a1 1 0 0 0-1 1v6h2a3 3 0 0 1 0 6H3v4a1 1 0 0 0 1 1h6v-2a3 3 0 0 1 6 0v2h4a1 1 0 0 0 1-1v-6h-2a3 3 0 0 1-6 0V3Z"/>,
    wrench:<path d="M21 7a6 6 0 0 1-8 6L6.5 20a2 2 0 0 1-3-3L10 10a6 6 0 0 1 7-8l-4 4 4 4 4-3Z"/>,
    search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
    close:<path d="M5 5 19 19M19 5 5 19"/>,
    chevron:<path d="m6 9 6 6 6-6"/>,
    check:<path d="m5 12 4 4L19 6"/>,
    archive:<><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v12h14V9M10 14h4"/></>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.box}</svg>;
}

// Physical Kits are verified by the v396 SQL completion RPC. This page does
// not mark a Kit ready, adjust its contents, or change another school's Kits.
export default function SchoolKitCartons({projectId,projectName,stageRecords=[],request,allowed,editTabs={},onClose,closurePanel}) {
  const [data,setData]=useState(null);
  const [schoolId,setSchoolId]=useState("");
  const [selectedIds,setSelectedIds]=useState([]);
  const [activeCartonId,setActiveCartonId]=useState("");
  const [tab,setTab]=useState("kits");
  const [showLegacy,setShowLegacy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [search,setSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false),searchInputRef=useRef(null);
  const [openKit,setOpenKit]=useState("");
  const closeSearch=()=>{setSearchOpen(false);setSearch("");};
  useEffect(()=>{if(searchOpen)searchInputRef.current?.focus();},[searchOpen,tab]);
  const editTab=allowed && editTabs.all!==false?"all":allowed && editTabs.draft!==false?"draft":null;

  const schools=data?.schools||[];
  const allKits=data?.readyKits||[];
  const cartonRows=data?.schoolCartons||[];
  const links=data?.schoolCartonKits||[];
  const schoolKits=allKits.filter(k=>k.school_id===schoolId);
  const availableKits=availableSchoolKits(schoolId,allKits,links);
  const schoolCartons=cartonRows.filter(c=>c.school_id===schoolId);
  const selected=availableKits.filter(k=>selectedIds.includes(k.id));
  const active=schoolCartons.find(c=>c.id===activeCartonId);
  const cartonKits=schoolCartonContents(activeCartonId,links,allKits);
  const filteredKits=availableKits.filter(k=>`${k.kit_name} ${k.carton_label}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredCartons=schoolCartons.filter(c=>`${c.carton_label} ${schoolCartonContents(c.id,links,allKits).map(k=>k.kit_name+" "+k.carton_label).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const linkedKitIds=new Set(links.map(k=>String(k.kit_box_id)));
  // Match the dashboard's Stage 6 principle: only ready Kits INSIDE outer
  // cartons plus ready legacy cartons count as delivered carton contents.
  const packedUnitCount=(data?.readyKitLines||[]).filter(l=>linkedKitIds.has(String(l.carton_id)))
    .reduce((total,l)=>total+asNumber(l.packed_qty),0);
  const legacyReadyIds=new Set((data?.cartons||[]).filter(c=>c.status==="ready").map(c=>String(c.id)));
  const legacyPackedUnits=(data?.lines||[]).filter(l=>legacyReadyIds.has(String(l.carton_id)))
    .reduce((total,l)=>total+asNumber(l.packed_qty),0);
  const requiredUnits=(data?.components||[]).reduce((total,c)=>total+asNumber(c.planned_qty),0);
  const completedUnits=packedUnitCount+legacyPackedUnits;
  const progress=requiredUnits>0?Math.min(100,Math.max(0,completedUnits/requiredUnits*100)):0;
  const groupedKits=useMemo(()=>{
    const groups=new Map();
    for(const kit of filteredKits){
      if(!groups.has(kit.kit_name))groups.set(kit.kit_name,[]);
      groups.get(kit.kit_name).push(kit);
    }
    return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[filteredKits]);

  async function load(initial=false){
    const result=await request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=cartons`);
    setData(result);
    setSchoolId(current=>result.schools.some(s=>s.id===current)?current:(result.schools[0]?.id||""));
    if(initial)setActiveCartonId("");
    return result;
  }
  useEffect(()=>{
    let live=true;
    request(`/project-cartons?projectId=${encodeURIComponent(projectId)}&scope=cartons`)
      .then(result=>{if(!live)return;setData(result);setSchoolId(result.schools[0]?.id||"");})
      .catch(err=>{if(live)setError(err?.message||"Unable to load school cartons.");});
    return()=>{live=false;};
  },[projectId]);
  function chooseSchool(id){setSchoolId(id);setSelectedIds([]);setActiveCartonId("");setOpenKit("");setError("");setSuccess("");closeSearch();}
  function toggleKit(id){setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  function toggleGroup(kits){
    setSelectedIds(prev=>{
      const others=prev.filter(id=>!kits.some(k=>k.id===id));
      return kits.every(k=>prev.includes(k.id))?others:[...others,...kits.map(k=>k.id)];
    });
  }
  async function packCarton(){
    if(!editTab||busy)return;
    if(!validSchoolCartonSelection(schoolId,selectedIds,allKits,links)){setError("Choose 1–80 unassigned, verified Kits from this school.");return;}
    if(!window.confirm(`Pack ${selected.length} completed Kit(s) into ONE immutable carton for ${schoolName(schools.find(s=>s.id===schoolId))}?`))return;
    setBusy(true);setError("");setSuccess("");
    try{
      const packed=await request("/project-cartons","POST",{
        action:"pack_school_carton",scope:"cartons",editTab,projectId,schoolId,
        kitBoxIds:selected.map(k=>k.id),
      });
      const result=packed?.result||{};
      const updated=await load();
      setSelectedIds([]);setTab("cartons");
      setActiveCartonId(result.carton_id||updated.schoolCartons.find(c=>c.school_id===schoolId)?.id||"");
      setSuccess(`${result.carton_label||"School carton"} packed successfully with ${selected.length} verified Kit(s).`);
    }catch(err){setError(err?.message||"Could not pack the selected Kits.");}
    finally{setBusy(false);}
  }

  const kitContents=kit=>{
    const targets=(data?.readyKitTargets||[]).filter(t=>t.kit_box_id===kit.id);
    const lines=(data?.readyKitLines||[]).filter(l=>l.carton_id===kit.id);
    const lineByKey=new Map(lines.map(l=>[itemKey(l),l]));
    return targets.map(t=>({...t,packed_qty:asNumber(lineByKey.get(itemKey(t))?.packed_qty)}));
  };

  if(showLegacy)return <div className="pr-pool pr-carton-v410-legacy">
    <div className="pr-school-cartons-legacy-nav"><button type="button" className="pr-secondary" onClick={()=>{setShowLegacy(false);load().catch(e=>setError(e.message));}}>← Back to School Cartons</button><span>Legacy project-wide cartons are unchanged.</span></div>
    <ProjectKitCartonsLegacy projectId={projectId} projectName={projectName} stageRecords={stageRecords} request={request} allowed={allowed} editTabs={editTabs} onClose={()=>setShowLegacy(false)} closurePanel={null}/>
  </div>;

  const tabOptions=[{value:"kits",label:`Available Kits (${availableKits.length})`},{value:"cartons",label:`Packed Cartons (${schoolCartons.length})`}];
  return <div className="pr-delivery pr-production pr-pt pr-pt-modern pr-intake-v401 pr-school-cartons pr-carton-v410">
    <header className="pr-manifest-title pr-pt-title">
      <div className="pr-intake-heading"><CartonIcon name="box" size={48}/><div><h3>Project Kit Cartons</h3></div></div>
      <button type="button" className="pr-pt-close" aria-label="Close Project Kit Cartons" title="Close" onClick={onClose}><CartonIcon name="close" size={19}/></button>
    </header>
    {error&&<div className="pr-alert" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError("")}>×</button></div>}
    {success&&<div className="pr-manifest-success" role="status">{success}</div>}
    {!data?<p className="pr-muted">Loading school Kits and cartons…</p>:<>
      <div className="pr-intake-summary">
        <div className="pr-intake-progress" aria-label={`Project carton progress ${progress.toFixed(2)}%`}>
          <div className="pr-intake-progress-title"><span>Project Progress</span><strong>{progress.toFixed(2)}%</strong></div>
          <div className="pr-intake-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(progress.toFixed(2))} aria-label="Units assigned to project cartons"><span style={{width:`${progress}%`}}/></div>
          <strong className="pr-intake-progress-numbers">{completedUnits.toLocaleString("en-US")} / {requiredUnits.toLocaleString("en-US")}</strong>
        </div>
        <div className="pr-intake-signoff">{closurePanel}</div>
      </div>
      <div className="pr-carton-v410-schoolbar">
        <label className="pr-field"><span>School / Organization</span>
          <PreparingSelect value={schoolId} onChange={event=>chooseSchool(event.target.value)}>
            <option value="">Select School</option>{schools.map(s=><option key={s.id} value={s.id}>{schoolName(s)}</option>)}
          </PreparingSelect>
        </label>
        <div className="pr-carton-v410-stat"><small>Available Kits</small><strong>{availableKits.length}</strong></div>
        <div className="pr-carton-v410-stat"><small>School Cartons</small><strong>{schoolCartons.length}</strong></div>
        <div className="pr-carton-v410-stat"><small>Kits in Cartons</small><strong>{schoolKits.length-availableKits.length}</strong></div>
      </div>
      <div className="pr-intake-tabs-toolbar">
        <StageFilterTabs label="Project Kit Cartons status" options={tabOptions} value={tab} onChange={value=>{setTab(value);setOpenKit("");closeSearch();}}/>
        <div className="pr-intake-tabs-actions" aria-label="Project Kit Cartons toolbar">
          <div className="pr-intake-search-slot"><div className={`pr-intake-search-control${searchOpen?" is-open":""}`} role="search">
            <button type="button" className="pr-intake-search-toggle" aria-label={searchOpen?"Close carton search":"Search carton Kits"} aria-expanded={searchOpen} aria-controls="pr-cartons-component-search" title={searchOpen?"Close search":"Search Kits and cartons"} onClick={()=>{if(searchOpen)closeSearch();else setSearchOpen(true);}}><CartonIcon name="search" size={17}/></button>
            <div className="pr-intake-search-expand"><input id="pr-cartons-component-search" ref={searchInputRef} type="search" aria-label="Search Kits or carton labels" placeholder="Search Kit or label…" disabled={!searchOpen} tabIndex={searchOpen?0:-1} value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closeSearch();}}}/><button type="button" className="pr-intake-search-clear" aria-label="Close carton search" title="Close search" disabled={!searchOpen} tabIndex={searchOpen?0:-1} onClick={closeSearch}><CartonIcon name="close" size={17}/></button></div>
          </div></div>
          <button type="button" className="pr-carton-v410-legacy-button" aria-label="Legacy Cartons" title="Legacy Cartons" onClick={()=>{closeSearch();setShowLegacy(true);}}><CartonIcon name="archive" size={19}/><span>Legacy</span></button>
          {tab==="cartons"&&active&&filteredCartons.some(c=>c.id===active.id)&&<a className="pr-pt-download-button pr-carton-v410-print" aria-label={`Download carton QR label for ${active.carton_label}`} title="Download Carton Label + QR" href={`/next/api/projects-preparing/label-print?kind=carton&id=${encodeURIComponent(active.id)}&projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer"><CartonIcon name="download" size={19}/></a>}
        </div>
      </div>
      {!schoolId?<p className="pr-wh-empty">Select a school to see its completed Kits and cartons.</p>:tab==="kits"?<>
        <div className="pr-carton-v410-available-heading"><span>Completed, verified Kits ready for outer cartons</span><strong>{selected.length} selected</strong></div>
        <div className="pr-pt-kits pr-pt-kit-list pr-carton-v410-kit-list">{groupedKits.map(([name,kits])=>{const appearance=cartonKitAppearance(name),open=!!search.trim()||openKit===name;
          return <section className={`pr-pt-kit-group pr-pt-kit--${appearance.tone}${open?" is-open":""}`} key={name}>
            <div className="pr-carton-v410-group-top"><button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setOpenKit(open?"__none__":name)}>
              <span className="pr-pt-kit-emblem"><CartonIcon name={appearance.icon} size={23}/></span>
              <span className="pr-pt-kit-title"><strong>{name}</strong><small>{kits.length} verified physical Kits</small></span>
              <span className="pr-pt-kit-arrow"><CartonIcon name="chevron" size={17}/></span>
            </button>{editTab&&<button type="button" className="pr-carton-v410-group-select" disabled={busy} onClick={()=>toggleGroup(kits)}>{kits.every(k=>selectedIds.includes(k.id))?"Deselect group":"Select group"}</button>}</div>
            {open&&<div className="pr-pt-kit-body">{kits.map(kit=><label className={`pr-pt-row pr-carton-v410-kit-row${selectedIds.includes(kit.id)?" is-selected":""}`} key={kit.id}>
              <input type="checkbox" disabled={!editTab||busy} checked={selectedIds.includes(kit.id)} onChange={()=>toggleKit(kit.id)} aria-label={`Select ${kit.carton_label}`}/>
              <span className="pr-intake-thumb pr-intake-thumb-empty" aria-hidden="true"><CartonIcon name="box" size={20}/></span>
              <span className="pr-carton-v410-item-name"><strong>{kit.carton_label}</strong><small>{kitContents(kit).length} component types · Manifest verified</small></span>
              <span className="pr-carton-v410-status"><CartonIcon name="check" size={15}/>Ready to Pack</span>
            </label>)}</div>}
          </section>;})}</div>
        {!availableKits.length&&<p className="pr-school-cartons-empty">No eligible Kits for this school. First complete Kit Packing in Box Distribution; already assigned Kits will be listed under Packed Cartons.</p>}
        {!!availableKits.length&&!filteredKits.length&&<p className="pr-wh-empty">No matching Kit labels.</p>}
        <div className="pr-school-cartons-action pr-carton-v410-pack-action">
          <div><strong>{selected.length} Kit{selected.length===1?"":"s"} selected</strong><small>Selected verified Kits will be placed into one locked, school-specific carton.</small></div>
          <button type="button" className="pr-primary" disabled={!editTab||!selected.length||busy} onClick={packCarton}>{busy?"Packing…":`Pack Carton (${selected.length})`}</button>
        </div>
        {!editTab&&<p className="pr-hint">You can view cartons, but packing requires Edit All Cartons or Edit Draft permission.</p>}
      </>:<>
        <div className="pr-pt-kits pr-pt-kit-list pr-carton-v410-carton-list">{filteredCartons.map(c=>{const cKits=schoolCartonContents(c.id,links,allKits),open=activeCartonId===c.id;
          return <section key={c.id} className={`pr-pt-kit-group pr-pt-kit--orange${open?" is-open":""}`}>
            <button type="button" className="pr-pt-kit-heading" aria-expanded={open} onClick={()=>setActiveCartonId(current=>current===c.id?"":c.id)}>
              <span className="pr-pt-kit-emblem"><CartonIcon name="box" size={23}/></span>
              <span className="pr-pt-kit-title"><strong>{c.carton_label}</strong><small>{cKits.length} verified Kits · {schoolName(schools.find(s=>s.id===c.school_id))}</small></span>
              <span className="pr-carton-v410-packed-badge">Packed &amp; locked</span>
              <span className="pr-pt-kit-arrow"><CartonIcon name="chevron" size={17}/></span>
            </button>
            {open&&<div className="pr-carton-v410-carton-body">
              <div className="pr-carton-v410-manifest-head"><strong>Carton contents</strong><a className="pr-primary" href={`/next/api/projects-preparing/label-print?kind=carton&id=${encodeURIComponent(c.id)}&projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer" title="Download printable carton QR label"><CartonIcon name="download" size={15}/>Download Carton Label + QR</a></div>
              {cKits.map(kit=><details key={kit.id} className="pr-school-cartons-kit-details">
                <summary><strong>{kit.carton_label}</strong><small>{kit.kit_name} · {kitContents(kit).length} component types</small></summary>
                <div className="pr-school-cartons-components"><div className="pr-school-cartons-components-head"><span>Component</span><span>Quantity</span></div>
                  {kitContents(kit).map(item=><div className="pr-school-cartons-component" key={item.id}><span>{item.product_name}{preparingDisplayCode(item)&&<small style={{display:"block",overflowWrap:"anywhere"}}>{preparingDisplayCode(item)}</small>}</span><strong>{item.packed_qty} / {item.expected_qty}</strong></div>)}
                </div>
              </details>)}
              <p className="pr-carton-v410-qr-note">Kit content is verified and locked. Anyone with the printed carton QR link can view its packing list without signing in; protect the physical label.</p>
            </div>}
          </section>;})}</div>
        {!schoolCartons.length&&<p className="pr-school-cartons-empty">No cartons packed yet. Select completed Kits to generate the first one.</p>}
        {!!schoolCartons.length&&!filteredCartons.length&&<p className="pr-wh-empty">No matching carton labels.</p>}
      </>}
    </>}
  </div>;
}
