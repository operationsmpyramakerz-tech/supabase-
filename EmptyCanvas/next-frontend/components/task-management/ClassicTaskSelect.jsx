"use client";

import { Children, useEffect, useMemo, useRef, useState } from "react";

function clean(value){ return String(value ?? "").trim(); }
function nodeText(node){ if(node==null||typeof node==="boolean") return ""; if(typeof node==="string"||typeof node==="number") return String(node); if(Array.isArray(node)) return node.map(nodeText).join(""); if(node?.props) return nodeText(node.props.children); return ""; }
function priorityKey(value){ const key=clean(value).toLowerCase(); return ["urgent","high","low"].includes(key)?key:"normal"; }
function statusKey(value){ const key=clean(value).toLowerCase(); return ["not_started","in_progress","rejected","completed","cancelled"].includes(key)?key:"not_started"; }
function Chevron(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>}
function Check(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}

export default function ClassicTaskSelect({ value, onChange, children, kind="", disabled=false, className="" }){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  const options=useMemo(()=>Children.toArray(children).filter(Boolean).map((child,index)=>({
    value: clean(child?.props?.value ?? child?.props?.children ?? ""),
    label: clean(nodeText(child?.props?.children)),
    disabled: !!child?.props?.disabled,
    index,
  })),[children]);
  const selected=options.find(o=>o.value===clean(value))||options[0]||{value:"",label:"Select"};
  const isAll=selected.value.toLowerCase()==="all"; const p=priorityKey(selected.value||selected.label), s=statusKey(selected.value||selected.label);
  useEffect(()=>{const close=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("pointerdown",close,true);return()=>document.removeEventListener("pointerdown",close,true)},[]);
  return <div ref={ref} className={`tm-select${kind==="priority"?" tm-select--priority":""}${kind==="status"?" tm-select--status":""}${open?" is-open":""}${className?` ${className}`:""}`}>
    <select className="tm-select__native" aria-hidden="true" tabIndex={-1} value={value} onChange={()=>{}} disabled={disabled}>{children}</select>
    <button type="button" className={`tm-select__button${!selected.value?" is-placeholder":""}`} data-priority={kind==="priority"&&!isAll?p:""} data-status={kind==="status"&&!isAll?s:""} aria-haspopup="listbox" aria-expanded={open} aria-disabled={disabled} disabled={disabled} onClick={()=>setOpen(v=>!v)}>
      <span className="tm-select__value">{kind==="priority"&&!isAll?<><span className={`tm-priority-marker tm-priority-marker--${p}`} aria-hidden="true"/><span>{selected.label}</span></>:kind==="status"&&!isAll?<><span className={`tm-work-status-marker tm-work-status-marker--${s}`} aria-hidden="true"/><span>{selected.label}</span></>:selected.label}</span><span className="tm-select__chevron"><Chevron/></span>
    </button>
    <div className="tm-select__menu" role="listbox" hidden={!open}>{options.map(option=>{const op=priorityKey(option.value||option.label), os=statusKey(option.value||option.label), all=option.value.toLowerCase()==="all", chosen=option.value===clean(value); return <div role="option" tabIndex={option.disabled?-1:0} aria-selected={chosen} aria-disabled={option.disabled} className={`tm-select__option${chosen?" is-selected":""}${option.disabled?" is-disabled":""}${kind==="priority"&&!all?` tm-select__option--priority tm-select__option--${op}`:""}${kind==="status"&&!all?` tm-select__option--status tm-select__option--status-${os}`:""}`} key={`${option.value}-${option.index}`} onClick={()=>{if(option.disabled)return;onChange?.({target:{value:option.value}});setOpen(false)}} onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&!option.disabled){e.preventDefault();onChange?.({target:{value:option.value}});setOpen(false)}}}><span className="tm-select__option-main">{kind==="priority"&&!all?<span className={`tm-priority-marker tm-priority-marker--${op}`} aria-hidden="true"/>:kind==="status"&&!all?<span className={`tm-work-status-marker tm-work-status-marker--${os}`} aria-hidden="true"/>:null}<span>{option.label}</span></span>{chosen?<Check/>:<span/>}</div>})}</div>
  </div>;
}
