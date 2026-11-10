"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ClassicOrderIcon from './ClassicOrderIcon';
import { FILTER_STATUS_ORDER, OPERATIONS_SHORTCUTS, summarizeOperationsFacets, toggleOperationsShortcut } from '../../lib/operations-filter-preferences.mjs';

const SORTS = [
  ['latest','Newest first','sort-desc'], ['oldest','Oldest first','sort-asc'],
  ['number-desc','Order number: high to low','sort-numeric-desc'], ['number-asc','Order number: low to high','sort-numeric-asc'], ['creator','Creator A–Z','sort-alpha'],
];
const TYPES = [
  {key:'all',label:'All order types',icon:'layers'},
  {key:'requestmaintenance',label:'Request Maintenance',icon:'tool'},
  {key:'requestproducts',label:'Request Products',icon:'shopping-cart'},
  {key:'withdrawproducts',label:'Withdraw Products',icon:'log-out'},
];
function Symbol({name}) {
  if (name==='play') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 4 13 8-13 8z" strokeLinejoin="round"/></svg>;
  if (name==='alert') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1" strokeLinecap="round"/></svg>;
  if (name==='bolt') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7z" strokeLinejoin="round"/></svg>;
  return <ClassicOrderIcon name={name}/>;
}
export default function OperationsFilterControl({statusOptions, statusValues, filterValue, sortMode, onApply, loadGroups, onOpenChange, filterOptions=[]}) {
  const [open,setOpen]=useState(false), [section,setSection]=useState('filter');
  const [draftStatuses,setDraftStatuses]=useState([]), [draftType,setDraftType]=useState('all'), [draftSort,setDraftSort]=useState('latest');
  const [statusExpanded,setStatusExpanded]=useState(true),[typeExpanded,setTypeExpanded]=useState(true);
  const [groups,setGroups]=useState(null),[countError,setCountError]=useState(false),[resetRequested,setResetRequested]=useState(false);
  const root=useRef(null),trigger=useRef(null),closeButton=useRef(null),id=useId();
  const active=statusValues.length>0 || filterValue!=='all' || sortMode!=='latest';
  const counts=useMemo(()=>groups===null?null:summarizeOperationsFacets(groups,draftType),[groups,draftType]);
  const orderedStatuses=FILTER_STATUS_ORDER.map(key=>statusOptions.find(option=>option.key===key)).filter(Boolean);
  const extraTypes=new Map(filterOptions.map(option=>[option.key,option]));
  for(const group of groups||[]){const key=String(group.orderType||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(key&&!extraTypes.has(key))extraTypes.set(key,{key,label:group.orderType,icon:'package'});}
  const types=[...TYPES,...[...extraTypes.values()].filter(option=>!TYPES.some(type=>type.key===option.key))];
  function close() {setOpen(false);onOpenChange?.(false);requestAnimationFrame(()=>trigger.current?.focus());}
  function show() {
    if(open){close();return;}
    setResetRequested(false);setDraftStatuses([...statusValues]);setDraftType(filterValue);setDraftSort(sortMode);setSection('filter');setStatusExpanded(true);setTypeExpanded(true);
    setOpen(true);onOpenChange?.(true);
  }
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!root.current?.contains(e.target)){setOpen(false);onOpenChange?.(false);}};
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);closeButton.current?.focus({preventScroll:true});
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open,onOpenChange]);
  // Position within the actual viewport, including the fixed bottom dock.
  // A narrow device may have a larger page gutter than the panel's own gutter.
  useLayoutEffect(()=>{
    if(!open)return;
    const update=()=>{
      const el=root.current;if(!el)return;
      const rect=el.getBoundingClientRect(), wide=window.innerWidth>=1100;
      const width=Math.min(425,window.innerWidth-24);
      const top=wide?rect.top-18:rect.bottom+10;
      el.style.setProperty('--ops-panel-height',`${Math.max(160,window.innerHeight-top-96)}px`);
      el.style.setProperty('--ops-panel-right',`${-Math.max(0,12-(rect.right-width))}px`);
    };
    update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setGroups(null);setCountError(false);
    loadGroups(controller.signal).then(result=>{if(!controller.signal.aborted)setGroups(result);}).catch(()=>{if(!controller.signal.aborted)setCountError(true);});
    return()=>controller.abort();
  },[open,loadGroups]);
  function reset(){setResetRequested(true);setDraftStatuses([]);setDraftType('all');setDraftSort('latest');}
  function apply(){onApply({statuses:draftStatuses,type:draftType,sort:draftSort,reset:resetRequested});close();}
  function count(value){return <span className="ops-filter-count" title={countError?'Counts unavailable':counts?'Matching orders':'Loading counts'}>{value??(countError?'—':'…')}</span>;}
  return <div ref={root} className={`orders-preferences ops-filter-control${open?' is-open':''}${active?' has-preferences':''}`}>
    <button ref={trigger} type="button" className="orders-preferences__trigger" onClick={show} aria-label="Filters and sort" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined}><ClassicOrderIcon name="preferences"/>{active&&<span className="orders-preferences__active-dot"/>}</button>
    {open&&<div className="orders-preferences__panel ops-filter-panel" id={id} role="dialog" aria-label="Filters">
      <header className="ops-filter-header"><div className="ops-filter-title"><span><ClassicOrderIcon name="filter"/></span><strong>Filters</strong></div><button ref={closeButton} type="button" className="orders-preferences__close" aria-label="Close filters" onClick={close}><ClassicOrderIcon name="x"/></button></header>
      <div className="orders-preferences__tabs" role="tablist" aria-label="Filter or sort" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=section==='filter'?'sort':'filter';setSection(next);document.getElementById(`${id}-${next}`)?.focus();}}}>
        {['filter','sort'].map(tab=><button key={tab} id={`${id}-${tab}`} type="button" role="tab" aria-selected={section===tab} aria-controls={`${id}-body`} className={section===tab?'is-selected':''} onClick={()=>setSection(tab)}><ClassicOrderIcon name={tab==='filter'?'filter':'sort-desc'}/>{tab==='filter'?'Filter':'Sort'}</button>)}
      </div>
      <div className="ops-filter-body" id={`${id}-body`} role="tabpanel" aria-labelledby={`${id}-${section}`}>
        {section==='filter'?<>
          <button type="button" className="ops-filter-section" aria-expanded={statusExpanded} onClick={()=>setStatusExpanded(v=>!v)}><strong>Status</strong><span className="ops-filter-selection">{draftStatuses.length} selected</span><ClassicOrderIcon name="chevron-down" className={statusExpanded?'expanded':''}/></button>
          {statusExpanded&&<div className="ops-filter-status-grid" role="group" aria-label="Status">
            {orderedStatuses.map(option=>{const checked=draftStatuses.includes(option.key);return <button type="button" key={option.key} className={`ops-filter-status${checked?' is-selected':''}`} aria-pressed={checked} onClick={()=>setDraftStatuses(values=>checked?values.filter(key=>key!==option.key):[...values,option.key])}><span className="ops-filter-check">{checked&&<ClassicOrderIcon name="check"/>}</span><span className="ops-filter-label">{option.label}</span>{count(counts?.statuses[option.key])}</button>;})}
          </div>}
          <div className="ops-filter-shortcut-heading"><Symbol name="bolt"/><strong>Smart shortcuts</strong><span title="In Progress: Under Supervision, Approved, Shipping. Completed: Delivered. Exception: Rejected, Remaining, Partially Delivered." aria-label="Shortcut definitions">ⓘ</span></div>
          <div className="ops-filter-shortcuts" role="group" aria-label="Smart shortcuts">{OPERATIONS_SHORTCUTS.map(shortcut=>{const selected=shortcut.statuses.every(key=>draftStatuses.includes(key));return <button key={shortcut.key} type="button" aria-pressed={selected} className={`ops-filter-shortcut ${shortcut.key}${selected?' is-selected':''}`} onClick={()=>setDraftStatuses(values=>toggleOperationsShortcut(values,shortcut))}><Symbol name={shortcut.icon}/><span>{shortcut.label}</span>{count(counts?.shortcuts[shortcut.key])}</button>;})}</div>
          <div className="ops-filter-divider"/>
          <button type="button" className="ops-filter-section" aria-expanded={typeExpanded} onClick={()=>setTypeExpanded(v=>!v)}><strong>Order Type</strong><span className="ops-filter-selection">{draftType==='all'?0:1} selected</span><ClassicOrderIcon name="chevron-down" className={typeExpanded?'expanded':''}/></button>
          {typeExpanded&&<div className="ops-filter-type-grid" role="group" aria-label="Order type">{types.map(option=><button key={option.key} type="button" aria-pressed={draftType===option.key} className={`ops-filter-type${draftType===option.key?' is-selected':''}`} onClick={()=>setDraftType(option.key)}><span className="ops-filter-type-icon"><ClassicOrderIcon name={option.icon}/></span><strong>{option.label}</strong>{draftType===option.key&&<ClassicOrderIcon name="check"/>}</button>)}</div>}
        </>:<><div className="ops-filter-section"><strong>Sort by</strong></div><div className="ops-filter-sort-list">{SORTS.map(([value,label,icon])=><button type="button" key={value} className={`ops-filter-type${draftSort===value?' is-selected':''}`} aria-pressed={draftSort===value} onClick={()=>setDraftSort(value)}><span className="ops-filter-type-icon"><ClassicOrderIcon name={icon}/></span><strong>{label}</strong>{draftSort===value&&<ClassicOrderIcon name="check"/>}</button>)}</div></>}
      </div>
      <footer className="ops-filter-footer"><button type="button" onClick={reset}><ClassicOrderIcon name="rotate-ccw"/>Reset</button><button type="button" className="ops-filter-apply" onClick={apply}><ClassicOrderIcon name="filter"/>Apply Filters</button></footer>
    </div>}
  </div>;
}
