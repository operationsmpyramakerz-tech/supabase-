"use client";
import {useRef} from "react";

function TabIcon({value}) {
 const shape=value==="all"?<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>: ["done","ready"].includes(value)?<><path d="M21 11.1V12a9 9 0 1 1-5.3-8.2"/><path d="m8 11 4 4 9-9"/></>:value==="available"?<><path d="M4 5h16l2 10v4H2v-4L4 5Z"/><path d="M2 15h6l2 3h4l2-3h6"/></>:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>;
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}
export default function StageFilterTabs({options,value,onChange,label,disabled=false}) {
 const buttons=useRef([]);
 function keyDown(event,index){
  const offsets={ArrowRight:1,ArrowLeft:-1};
  let next;
  if(event.key in offsets)next=(index+offsets[event.key]+options.length)%options.length;
  else if(event.key==="Home")next=0;
  else if(event.key==="End")next=options.length-1;
  else return;
  event.preventDefault();onChange(options[next].value);buttons.current[next]?.focus();
 }
 return <div className="pr-stage-filter-tabs" role="tablist" aria-label={label}>{options.map((option,index)=><button key={option.value} ref={node=>{buttons.current[index]=node;}} type="button" role="tab" aria-selected={value===option.value} tabIndex={value===option.value||(!options.some(o=>o.value===value)&&index===0)?0:-1} disabled={disabled} className={value===option.value?"is-active":""} onClick={()=>onChange(option.value)} onKeyDown={event=>keyDown(event,index)}><TabIcon value={option.value}/><span>{option.label}</span></button>)}</div>;
}
