"use client";

import {useEffect,useMemo,useState} from "react";
import PreparingSelect from "./PreparingSelect";
import ProjectKitCartonsLegacy from "./ProjectKitCartons";
import {availableSchoolKits,validSchoolCartonSelection,schoolCartonContents} from "../../lib/preparing-school-cartons.mjs";

const asNumber=value=>Number(value)||0;
const schoolName=school=>school?.beneficiary_name||school?.name||"School";
const itemKey=item=>`${String(item.product_id||"").trim().toLowerCase()}\u0000${String(item.product_name||"").trim().toLowerCase()}`;

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
  const filteredKits=availableKits.filter(k=>`${k.kit_name} ${k.carton_label}`.toLowerCase().includes(search.toLowerCase()));
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
  function chooseSchool(id){setSchoolId(id);setSelectedIds([]);setActiveCartonId("");setError("");setSuccess("");setSearch("");}
  function toggleKit(id){setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  function toggleGroup(kits){
    setSelectedIds(prev=>{
      const others=prev.filter(id=>!kits.some(k=>k.id===id));
      return kits.every(k=>prev.includes(k.id))?others:[...others,...kits.map(k=>k.id)];
    });
  }
  async function packCarton(){
    if(!editTab||!validSchoolCartonSelection(schoolId,selectedIds,allKits,links)||busy)return;
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

  if(showLegacy)return <div className="pr-pool">
    <div className="pr-school-cartons-legacy-nav"><button type="button" className="pr-secondary" onClick={()=>{setShowLegacy(false);load().catch(e=>setError(e.message));}}>← Back to School Cartons</button><span>Legacy project-wide cartons are unchanged.</span></div>
    <ProjectKitCartonsLegacy projectId={projectId} projectName={projectName} stageRecords={stageRecords} request={request} allowed={allowed} editTabs={editTabs} onClose={()=>setShowLegacy(false)} closurePanel={null}/>
  </div>;

  return <div className="pr-pool pr-school-cartons">
    <div className="pr-manifest-title">
      <div><h3>Project Kit Cartons</h3><p className="pr-muted">Pack completed physical Kit labels into school-specific cartons.</p></div>
      <div className="pr-school-cartons-head-actions"><button type="button" className="pr-secondary" onClick={()=>setShowLegacy(true)}>Legacy Cartons</button><button type="button" className="pr-secondary" onClick={onClose}>Close</button></div>
    </div>
    {closurePanel}
    {error&&<div className="pr-alert" role="alert">{error}</div>}
    {success&&<div className="pr-manifest-success" role="status">{success}</div>}
    {!data?<p className="pr-muted">Loading school Kits and cartons…</p>:<>
      <div className="pr-school-cartons-toolbar">
        <label className="pr-field"><span>School / Organization</span>
          <PreparingSelect value={schoolId} onChange={event=>chooseSchool(event.target.value)}>
            <option value="">Select School</option>{schools.map(s=><option key={s.id} value={s.id}>{schoolName(s)}</option>)}
          </PreparingSelect>
        </label>
        <div className="pr-school-cartons-count"><small>Available packed Kits</small><strong>{availableKits.length}</strong></div>
        <div className="pr-school-cartons-count"><small>School Cartons</small><strong>{schoolCartons.length}</strong></div>
        <div className="pr-school-cartons-count"><small>Kits in Cartons</small><strong>{schoolKits.length-availableKits.length}</strong></div>
      </div>
      <div className="pr-school-cartons-switch" role="tablist" aria-label="School carton workspace">
        <button type="button" role="tab" aria-selected={tab==="kits"} className={tab==="kits"?"is-active":""} onClick={()=>setTab("kits")}>Available Kits ({availableKits.length})</button>
        <button type="button" role="tab" aria-selected={tab==="cartons"} className={tab==="cartons"?"is-active":""} onClick={()=>setTab("cartons")}>Packed Cartons ({schoolCartons.length})</button>
      </div>
      {!schoolId?<p className="pr-muted">Select a school to see its completed Kits.</p>:tab==="kits"?<>
        <div className="pr-school-cartons-selection"><input type="search" aria-label="Search packed Kit labels" placeholder="Search Kit group or label…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{selected.length} selected</span></div>
        {groupedKits.map(([name,kits])=><section className="pr-school-kit-group" key={name}>
          <div className="pr-school-kit-group-header"><div><strong>{name}</strong><small>{kits.length} packed Kits ready for cartons</small></div>
            {editTab&&<button type="button" className="pr-secondary" onClick={()=>toggleGroup(kits)} disabled={busy}>{kits.every(k=>selectedIds.includes(k.id))?"Deselect group":"Select group"}</button>}
          </div>
          {kits.map(kit=><label className={`pr-school-kit-option ${selectedIds.includes(kit.id)?"is-selected":""}`} key={kit.id}>
            <input type="checkbox" disabled={!editTab||busy} checked={selectedIds.includes(kit.id)} onChange={()=>toggleKit(kit.id)}/>
            <span className="pr-school-kit-icon" aria-hidden="true">▣</span><span className="pr-school-kit-option-name"><strong>{kit.carton_label}</strong><small>{kitContents(kit).length} component types · Manifest verified</small></span><span className="pr-school-kit-status">Packed Kit</span>
          </label>)}
        </section>)}
        {!availableKits.length&&<p className="pr-school-cartons-empty">No eligible Kits for this school. First complete Kit Packing in Box Distribution; already assigned Kits will be listed under Packed Cartons.</p>}
        {!!availableKits.length&&!filteredKits.length&&<p className="pr-muted">No matching Kit labels.</p>}
        <div className="pr-school-cartons-action">
          <div><strong>{selected.length} Kit{selected.length===1?"":"s"} selected</strong><small>One carton will be generated automatically with a school-specific ID (e.g. CITY-01).</small></div>
          <button type="button" className="pr-primary" disabled={!editTab||!selected.length||busy} onClick={packCarton}>{busy?"Packing…":`Pack Carton (${selected.length})`}</button>
        </div>
        {!editTab&&<p className="pr-hint">You can view cartons, but packing requires Edit All Cartons or Edit Draft permission.</p>}
      </>:<>
        <div className="pr-school-cartons-list">
          {schoolCartons.map(c=><button type="button" key={c.id} onClick={()=>setActiveCartonId(current=>current===c.id?"":c.id)} className={`pr-school-carton-row ${c.id===activeCartonId?"is-active":""}`} aria-expanded={c.id===activeCartonId}>
            <span className="pr-school-carton-mark">▣</span><span><strong>{c.carton_label}</strong><small>{links.filter(l=>l.carton_id===c.id).length} Kits · {new Date(c.created_at).toLocaleDateString("en-GB")}</small></span><span className="pr-school-kit-status">Packed</span><span aria-hidden="true">{c.id===activeCartonId?"⌃":"⌄"}</span>
          </button>)}
          {!schoolCartons.length&&<p className="pr-school-cartons-empty">No cartons packed yet. Select completed Kits to generate the first one.</p>}
        </div>
        {active&&<div className="pr-school-cartons-manifest">
          <div className="pr-school-cartons-manifest-title"><div><h4>{active.carton_label}</h4><p className="pr-muted">{schoolName(schools.find(s=>s.id===active.school_id))} · {cartonKits.length} verified Kits</p></div><div className="pr-label-print-actions"><span className="pr-school-kit-status">Packed &amp; locked</span><a className="pr-primary" href={`/next/api/projects-preparing/label-print?kind=carton&id=${encodeURIComponent(active.id)}&projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer" title="Download printable carton QR label">↓ Download Carton Label + QR</a></div></div>
          {cartonKits.map(kit=><details key={kit.id} className="pr-school-cartons-kit-details">
            <summary><strong>{kit.carton_label}</strong><small>{kit.kit_name} · {kitContents(kit).length} component types</small></summary>
            <div className="pr-school-cartons-components"><div className="pr-school-cartons-components-head"><span>Component</span><span>Quantity</span></div>
              {kitContents(kit).map(item=><div className="pr-school-cartons-component" key={item.id}><span>{item.product_name}</span><strong>{item.packed_qty} / {item.expected_qty}</strong></div>)}
            </div>
          </details>)}
          <p className="pr-hint">Kit content is verified and locked. Scan the QR on the printed carton label to view this packing list. Anyone possessing the QR link can view the contents without signing in. Protect physical labels accordingly.</p>
        </div>}
      </>}
    </>}
  </div>;
}
