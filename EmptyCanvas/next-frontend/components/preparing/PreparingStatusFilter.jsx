"use client";
import {useEffect,useRef,useState} from "react";

/** Shared accessible filter menu for Production Receiving and Box Distribution. */
export default function PreparingStatusFilter({value,onChange,options,label="Filter components"}){
 const [open,setOpen]=useState(false);
 const wrapper=useRef(null),trigger=useRef(null),optionRefs=useRef([]);
 const selected=options.find(option=>option.value===value)||options[0];
 useEffect(()=>{
  if(!open)return;
  const onPointer=e=>{if(!wrapper.current?.contains(e.target))setOpen(false);};
  const onKey=e=>{if(e.key==="Escape"){setOpen(false);trigger.current?.focus();}};
  document.addEventListener("pointerdown",onPointer);
  document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("pointerdown",onPointer);document.removeEventListener("keydown",onKey);};
 },[open]);
 useEffect(()=>{if(open){const index=Math.max(0,options.findIndex(o=>o.value===value));optionRefs.current[index]?.focus();}},[open,value,options]);
 function onOptionKey(event,index){
  if(event.key==="ArrowDown"||event.key==="ArrowUp"||event.key==="Home"||event.key==="End"){
   event.preventDefault();
   const next=event.key==="Home"?0:event.key==="End"?options.length-1:(index+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;
   optionRefs.current[next]?.focus();
  }
 }
 return <div className={`pr-stage-filter${open?" is-open":""}`} ref={wrapper}>
  <button ref={trigger} type="button" className="pr-stage-filter-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(!open&&["ArrowDown","ArrowUp"].includes(e.key)){e.preventDefault();setOpen(true);}}}>
   <span className="pr-stage-filter-indicator" aria-hidden="true"/>
   <span className="pr-stage-filter-current">{selected?.label}</span>
   <svg className="pr-stage-filter-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  {open&&<div className="pr-stage-filter-menu" role="listbox" aria-label={label}>
   {options.map((option,index)=><button key={option.value} ref={el=>{optionRefs.current[index]=el;}} type="button" role="option" aria-selected={option.value===value} className={`pr-stage-filter-option${option.value===value?" is-selected":""}`} onKeyDown={e=>onOptionKey(e,index)} onClick={()=>{onChange(option.value);setOpen(false);trigger.current?.focus();}}>
    <span className="pr-stage-filter-option-symbol" aria-hidden="true">{option.value===value?"✓":""}</span>
    <span className="pr-stage-filter-option-copy"><strong>{option.label}</strong>{option.hint&&<small>{option.hint}</small>}</span>
    {typeof option.count==="number"&&<span className="pr-stage-filter-count">{option.count}</span>}
   </button>)}
  </div>}
 </div>;
}
