"use client";

import { Children, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Accessible, consistent select for Projects Preparing screens and bottom sheets.
 * Keeps the normal select onChange({ target: { value } }) contract used by pages.
 */
export default function PreparingSelect({value = "", onChange, children, disabled = false, required = false, className = "", name, id, ...props}) {
  const items = Children.toArray(children).filter(item => item?.type === "option").map(item => ({
    value: String(item.props.value ?? ""),
    label: item.props.children,
    disabled: Boolean(item.props.disabled),
  }));
  const active = items.find(item => item.value === String(value)) || items[0];
  const [open, setOpen] = useState(false);
  const [bounds, setBounds] = useState({left:0,top:0,width:240,maxHeight:300,above:false});
  const trigger = useRef(null);
  const optionRefs = useRef([]);
  const listId = useId();

  const reposition = () => {
    if (!trigger.current || typeof window === "undefined") return;
    const r = trigger.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom - 14;
    const roomAbove = r.top - 14;
    const above = roomBelow < 185 && roomAbove > roomBelow;
    const maxHeight = Math.min(330, Math.max(125, above ? roomAbove : roomBelow));
    const width = Math.min(Math.max(220,r.width), window.innerWidth - 24);
    setBounds({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:above?r.top-7:r.bottom+7,width,maxHeight,above});
  };
  useEffect(() => {
    if (!open) return;
    reposition();
    const handleKey = e => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const handleView = () => reposition();
    document.addEventListener("keydown",handleKey);
    window.addEventListener("resize",handleView);
    window.addEventListener("scroll",handleView,true);
    return () => {document.removeEventListener("keydown",handleKey);window.removeEventListener("resize",handleView);window.removeEventListener("scroll",handleView,true);};
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, items.findIndex(item=>item.value === String(value) && !item.disabled));
    optionRefs.current[idx]?.focus();
  }, [open]);
  const choose = item => {
    if (item.disabled) return;
    if (item.value !== String(value)) onChange?.({target:{value:item.value,name}});
    setOpen(false); trigger.current?.focus();
  };
  const keyOption = (event,index) => {
    if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = items.map((item,i)=>!item.disabled?i:-1).filter(i=>i>=0);
    if (!enabled.length) return;
    const pos = enabled.indexOf(index);
    const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length-1] : enabled[(pos+(event.key === "ArrowDown"?1:-1)+enabled.length)%enabled.length];
    optionRefs.current[next]?.focus();
  };
  return <span className={`pr-modern-select ${className}${open?" is-open":""}${disabled?" is-disabled":""}`}>
    <button type="button" ref={trigger} id={id} disabled={disabled} aria-label={props["aria-label"]} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} aria-required={required} className="pr-modern-select-trigger" onClick={e=>{e.preventDefault();if(!open)reposition();setOpen(!open);}} onKeyDown={e=>{if(!open && ["ArrowDown","ArrowUp"," "].includes(e.key)){e.preventDefault();reposition();setOpen(true);}}}>
      <span className="pr-modern-select-value">{active?.label || "Select…"}</span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open && typeof document !== "undefined" && createPortal(<div className="pr-modern-select-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <div className={`pr-modern-select-menu${bounds.above?" is-above":""}`} style={{left:bounds.left,top:bounds.top,width:bounds.width,maxHeight:bounds.maxHeight}} id={listId} role="listbox" aria-label={props["aria-label"] || name || "Choose option"}>
        {items.map((item,index)=><button key={`${item.value}:${index}`} ref={el=>{optionRefs.current[index]=el;}} type="button" role="option" aria-selected={String(value)===item.value} disabled={item.disabled} className={`pr-modern-select-option${String(value)===item.value?" is-selected":""}`} onClick={()=>choose(item)} onKeyDown={e=>keyOption(e,index)}>
          <span>{item.label}</span><svg className="pr-modern-select-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>
        </button>)}
      </div>
    </div>,document.body)}
  </span>;
}
