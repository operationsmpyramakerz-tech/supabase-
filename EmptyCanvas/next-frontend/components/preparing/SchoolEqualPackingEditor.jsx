"use client";
import {useMemo,useState} from "react";
import StageQuantityInput from "./StageQuantityInput";
import {schoolKitPackingPreview,schoolKitPackingSchools} from "../../lib/preparing-equal-kit-packing.mjs";

const fmt=n=>Number(n||0).toLocaleString("en-US");
export default function SchoolEqualPackingEditor({row,kitName,data,busy,error,onSave,onCancel}){
 const schools=useMemo(()=>schoolKitPackingSchools(row,kitName,data?.schools||[],data?.components||[],data?.cartons||[],data?.lines||[]),[row,kitName,data]);
 const [selected,setSelected]=useState([]);
 const [quantities,setQuantities]=useState({});
 const eligible=schools.filter(s=>s.sources===1&&s.boxes>0&&!s.locked&&s.required%s.boxes===0&&!s.groupIssue);
 const chosen=schools.filter(s=>selected.includes(s.schoolId));
 const isEligible=s=>eligible.some(e=>e.schoolId===s.schoolId);
 const wanted=s=>Object.hasOwn(quantities,s.schoolId)?quantities[s.schoolId]:String(s.required);
 const previews=chosen.map(s=>({...s,total:wanted(s),preview:schoolKitPackingPreview({requested:s.required,boxes:s.boxes,packed:s.packed,total:wanted(s)})}));
 const delta=previews.reduce((sum,s)=>sum+(s.preview.ok?s.preview.delta:0),0);
 const available=Number(row.productionReceived||0)-Number(row.packedQty||0);
 const problems=previews.filter(s=>!s.preview.ok);
 const shortage=previews.length>0&&!problems.length&&delta>available;
 const valid=previews.length>0&&!problems.length&&!shortage;
 const toggle=id=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
 const toggleAll=()=>setSelected(old=>eligible.length>0&&eligible.every(s=>old.includes(s.schoolId))?[]:eligible.map(s=>s.schoolId));
 async function submit(){if(!valid||busy)return;await onSave(previews.map(s=>({schoolId:s.schoolId,totalQuantity:Number(s.total)})));}
 return <div className="pr-equal-packing-editor">
  <div className="pr-equal-packing-heading"><div><strong>Pack by School</strong><p>Select one or more schools. The total is distributed equally across every Kit label for that school.</p></div><span className="pr-equal-packing-counter">{chosen.length} selected</span></div>
  <div className="pr-equal-packing-actions"><button type="button" className="pr-secondary" disabled={!eligible.length||busy} onClick={toggleAll}>{eligible.length&&eligible.every(s=>selected.includes(s.schoolId))?"Clear Selection":"Select All Schools"}</button><span>{eligible.length} schools available · {fmt(available)} units currently unpacked</span></div>
  {schools.length?<div className="pr-equal-school-list">{schools.map(s=>{
   const active=selected.includes(s.schoolId),preview=schoolKitPackingPreview({requested:s.required,boxes:s.boxes,packed:s.packed,total:wanted(s)});
   const reason=s.groupIssue?s.groupIssue:s.sources!==1?"Duplicate source components in this school":s.boxes<1?"Generate labels in Boxes Label first":s.locked?"This school's Kit labels are completed and locked":s.required%s.boxes!==0?`${s.required} requested units cannot be divided equally across ${s.boxes} labels`:"";
   return <div key={s.schoolId} className={`pr-equal-school-row${active?" is-selected":""}${reason?" is-unavailable":""}`}>
    <label className="pr-equal-school-choice"><input type="checkbox" checked={active} disabled={Boolean(reason)||busy} onChange={()=>toggle(s.schoolId)}/><span><strong>{s.schoolName}</strong><small>{s.boxes} Kit labels · School requested {fmt(s.required)} · Already packed {fmt(s.packed)}</small></span></label>
    {reason?<p className="pr-equal-row-warning">{reason}</p>:active?<div className="pr-equal-school-quantity"><label>Total to pack for this school<StageQuantityInput inputMode="numeric" min="0" max={s.required} step="1" value={wanted(s)} onValueChange={value=>setQuantities(old=>({...old,[s.schoolId]:value}))} aria-label={`Total packed quantity for ${s.schoolName}`}/></label><div className="pr-equal-kit-result"><small>Automatically in each Box</small><strong>{preview.ok?fmt(preview.perBox):"—"}</strong><small>of {fmt(s.required/s.boxes)} required</small></div>{!preview.ok&&<p role="alert" className="pr-equal-row-warning">{preview.error}</p>}</div>:<span className="pr-equal-school-ready">{fmt(s.required/s.boxes)} per Kit when full</span>}
   </div>;
  })}</div>:<p className="pr-equal-row-warning">No school has this component in the selected Kit group. Check the captured Proposal.</p>}
  <div className="pr-equal-packing-footer"><div><small>Estimated change to project stock</small><strong>{delta>0?"+":""}{fmt(delta)} units · Available after: {fmt(available-delta)}</strong></div><button type="button" className="pr-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="pr-primary" disabled={!valid||busy} onClick={submit}>{busy?"Distributing…":"Save & Distribute"}</button></div>
  {shortage&&<p role="alert" className="pr-equal-row-warning">Insufficient Operations Received stock. Only {fmt(available)} unpacked units are available for a net change of {fmt(delta)}.</p>}
  {error&&<p className="pr-wr-inline-error" role="alert">{error}</p>}
 </div>;
}
