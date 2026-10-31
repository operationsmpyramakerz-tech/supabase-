"use client";

import { Children, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Accessible, consistent select for Projects Preparing screens and bottom sheets.
 * Keeps the normal select onChange({ target: { value } }) contract used by pages.
 */
export default function PreparingSelect({value = "", onChange, children, disabled = false, required = false, className = "", iconOnly = false, name, id, ...props}) {
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
    // Keep icon-only menus within the current project sheet, rather than
    // allowing a right-edge filter to overlap the dimmed area outside it.
    const sheet = iconOnly ? trigger.current.closest(".pr-components-sheet") : null;
    const sheetBounds = sheet?.getBoundingClientRect();
    const minLeft = Math.max(12, sheetBounds ? sheetBounds.left + 16 : 12);
    const maxRight = Math.min(window.innerWidth - 12, sheetBounds ? sheetBounds.right - 16 : window.innerWidth - 12);
    const availableWidth = Math.max(120, maxRight - minLeft);
    const width = Math.min(iconOnly ? 280 : Math.max(220, r.width), availableWidth);
    // An icon-only filter opens from the right edge of its trigger; text
    // selects continue to start at the left edge as before.
    const desiredLeft = iconOnly ? r.right - width : r.left;
    const left = Math.max(minLeft, Math.min(desiredLeft, maxRight - width));
    const roomBelow = window.innerHeight - r.bottom - 14;
    const roomAbove = r.top - 14;
    const wantedHeight = Math.min(340, items.length * 49 + (iconOnly ? 74 : 14));
    const above = roomBelow < wantedHeight && roomAbove > roomBelow;
    const maxHeight = Math.max(100, Math.min(wantedHeight, above ? roomAbove - 8 : roomBelow - 8));
    setBounds({left,top:above?r.top-9:r.bottom+9,width,maxHeight,above});
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
  return <span className={`pr-modern-select ${className}${iconOnly?" pr-modern-select--icon-only":""}${open?" is-open":""}${disabled?" is-disabled":""}`}>
    <button type="button" ref={trigger} id={id} disabled={disabled} aria-label={props["aria-label"]} title={iconOnly?String(active?.label||"Select filter"):undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} aria-required={required} className="pr-modern-select-trigger" onClick={e=>{e.preventDefault();if(!open)reposition();setOpen(!open);}} onKeyDown={e=>{if(!open && ["ArrowDown","ArrowUp"," "].includes(e.key)){e.preventDefault();reposition();setOpen(true);}}}>
      {iconOnly ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16l-6.5 7.5v5l-3 1.5v-6.5L4 6Z"/></svg> : <><span className="pr-modern-select-value">{active?.label || "Select…"}</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></>}
    </button>
    {open && typeof document !== "undefined" && createPortal(<div className="pr-modern-select-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <div className={`pr-modern-select-menu${bounds.above?" is-above":""}${iconOnly?" pr-modern-select-menu--filter":""}`} style={{left:bounds.left,top:bounds.top,width:bounds.width,maxHeight:bounds.maxHeight}} id={listId} role="listbox" aria-label={props["aria-label"] || name || "Choose option"}>
        {iconOnly && <div className="pr-modern-select-filter-heading" role="presentation"><strong>Filter components</strong><small>Choose a view</small></div>}
        {items.map((item,index)=><button key={`${item.value}:${index}`} ref={el=>{optionRefs.current[index]=el;}} type="button" role="option" aria-selected={String(value)===item.value} disabled={item.disabled} className={`pr-modern-select-option${String(value)===item.value?" is-selected":""}`} onClick={()=>choose(item)} onKeyDown={e=>keyOption(e,index)}>
          <span>{item.label}</span><svg className="pr-modern-select-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>
        </button>)}
      </div>
    </div>,document.body)}
  </span>;
}
