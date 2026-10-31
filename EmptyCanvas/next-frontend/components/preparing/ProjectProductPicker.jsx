"use client";

import {useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";

const formatProduct = product => product?.displayId || "No ID Code";
const RECENT_SEARCH_DELAY = 200;

/** Searchable Products catalog picker for project-kit additions.
 * The selected value is the actual catalog record, never free-form text.
 */
export default function ProjectProductPicker({value,onChange,disabled=false,label="Component"}) {
 const [open,setOpen]=useState(false),[term,setTerm]=useState("");
 const [results,setResults]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [highlight,setHighlight]=useState(0);
 const [bounds,setBounds]=useState({left:0,top:0,width:320,above:false,maxHeight:310});
 const triggerRef=useRef(null),searchRef=useRef(null),controllerRef=useRef(null);
 const listId=useId();
 const labelText=value?.name?`${value.name} · ${formatProduct(value)}`:"Select a product…";
 const position=()=>{
  if(typeof window==="undefined"||!triggerRef.current)return;
  const r=triggerRef.current.getBoundingClientRect();
  const width=Math.min(Math.max(320,r.width),window.innerWidth-24);
  const below=window.innerHeight-r.bottom-15,above=r.top-16;
  const placeAbove=below<230&&above>below;
  setBounds({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:placeAbove?r.top-8:r.bottom+8,width,above:placeAbove,maxHeight:Math.min(370,Math.max(170,placeAbove?above:below))});
 };
 useEffect(()=>{
  if(!open)return;
  position();
  const scroll=()=>position();
  const key=e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);triggerRef.current?.focus();}};
  window.addEventListener("resize",scroll);
  window.addEventListener("scroll",scroll,true);
  document.addEventListener("keydown",key);
  return()=>{window.removeEventListener("resize",scroll);window.removeEventListener("scroll",scroll,true);document.removeEventListener("keydown",key);};
 },[open]);
 useEffect(()=>{
  if(!open||disabled)return;
  const controller=new AbortController();
  controllerRef.current?.abort();
  controllerRef.current=controller;
  const timer=setTimeout(async()=>{
   setLoading(true);setError("");
   try{
    const res=await fetch(`/next/api/projects-preparing/product-options?q=${encodeURIComponent(term.trim())}`,{credentials:"same-origin",cache:"no-store",signal:controller.signal});
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.error||"Unable to load Products.");
    if(!controller.signal.aborted){setResults(json.products||[]);setHighlight(0);}
   }catch(e){if(!controller.signal.aborted){setResults([]);setError(e.message||"Unable to search Products.");}}
   finally{if(!controller.signal.aborted)setLoading(false);}
  },term?RECENT_SEARCH_DELAY:0);
  return()=>{clearTimeout(timer);controller.abort();};
 },[open,term,disabled]);
 useEffect(()=>{if(open){const id=requestAnimationFrame(()=>searchRef.current?.focus());return()=>cancelAnimationFrame(id);}},[open]);
 const choose=product=>{if(!product?.displayId)return;onChange(product);setOpen(false);setTerm("");triggerRef.current?.focus();};
 const keySearch=e=>{
  if(e.key==="ArrowDown"){e.preventDefault();setHighlight(v=>Math.min(results.length-1,v+1));}
  if(e.key==="ArrowUp"){e.preventDefault();setHighlight(v=>Math.max(0,v-1));}
  if(e.key==="Enter"&&results[highlight]){e.preventDefault();choose(results[highlight]);}
 };
 return <div className="pr-product-picker">
  <button ref={triggerRef} type="button" className={`pr-product-picker-trigger${open?" is-open":""}${value?" is-selected":""}`} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} disabled={disabled} onClick={()=>{if(!open){position();setTerm("");}setOpen(!open);}}>
   <span className="pr-product-picker-name">{labelText}</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  {open&&typeof document!=="undefined"&&createPortal(<div className="pr-product-picker-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <div className={`pr-product-picker-menu${bounds.above?" is-above":""}`} style={{left:bounds.left,top:bounds.top,width:bounds.width,maxHeight:bounds.maxHeight}}>
    <label className="pr-product-picker-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input ref={searchRef} type="search" value={term} placeholder="Search name or ID Code…" aria-label="Search Products" onChange={e=>setTerm(e.target.value)} onKeyDown={keySearch} autoComplete="off"/></label>
    <div className="pr-product-picker-results" id={listId} role="listbox" aria-label="Products catalog">
     {loading?<div className="pr-product-picker-message" role="status">Searching Products…</div>:error?<div className="pr-product-picker-message is-error" role="alert">{error}</div>:results.length?results.map((product,index)=><button type="button" key={product.id} role="option" aria-selected={value?.id===product.id} disabled={!product.displayId} title={!product.displayId?"Add an ID Code to this record in Products first":undefined} className={`pr-product-picker-option${index===highlight?" is-highlighted":""}`} onMouseEnter={()=>setHighlight(index)} onClick={()=>choose(product)}><span className="pr-product-picker-option-main"><strong>{product.name}</strong><small>{formatProduct(product)}</small></span>{value?.id===product.id&&<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>}</button>):<div className="pr-product-picker-message">No matching products. Try a different name or code.</div>}
    </div>
    <div className="pr-product-picker-footer">Showing up to 60 products · Type to refine results</div>
   </div>
  </div>,document.body)}
 </div>;
}
