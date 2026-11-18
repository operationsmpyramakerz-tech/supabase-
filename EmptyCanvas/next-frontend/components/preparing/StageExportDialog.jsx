"use client";
import {useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";
import exportStyles from "./ProductionIntakeExport.module.css";

function ExportIcon({name,size=20}){
 const shapes={
  layers:<><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z"/><path d="m3.5 11 8.5 4.5 8.5-4.5M3.5 15.5 12 20l8.5-4.5"/></>,
  close:<path d="M5 5 19 19M19 5 5 19"/>,
  fileDownload:<><path d="M13 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6M13 2v6h6M13 2l6 6v3M7 10h5M7 14h4"/><circle cx="17.5" cy="17.5" r="5"/><path d="M17.5 14.8v5.2m-2-2 2 2 2-2"/></>,
  chevron:<path d="m6 9 6 6 6-6"/>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  document:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

// Reuse the approved Production Receiving appearance. Each stage owns its
// columns, kit selection and file generation; this component only coordinates UI.
export default function StageExportDialog({title,columnOptions,columns,groups,groupKeys,onSelectAllColumns,onToggleColumn,onSelectAllGroups,onToggleGroup,busy,onClose,onCSV,onPDF}){
 const id=useId();
 const [format,setFormat]=useState("pdf"),[sheet,setSheet]=useState("blank"),[kitsOpen,setKitsOpen]=useState(false);
 const [error,setError]=useState(""),[submitting,setSubmitting]=useState(false);
 const dialogRef=useRef(null),closeRef=useRef(null),submitLock=useRef(false);
 const selectedGroups=groups.filter(group=>!groupKeys.length||groupKeys.includes(group.key));
 const disabled=busy||submitting;
 const canExport=columns.includes("name")&&selectedGroups.length>0;
 useEffect(()=>{
  const previous=document.activeElement;
  closeRef.current?.focus({preventScroll:true});
  return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[]);
 function close(){if(!disabled&&!submitLock.current)onClose();}
 function handleKeyDown(event){
  // Stop Escape from also closing the parent stage through portal bubbling.
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key!=="Tab")return;
  const focusable=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(element=>!element.closest('[hidden]'));
  if(!focusable.length){event.preventDefault();dialogRef.current.focus();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&(document.activeElement===first||!focusable.includes(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!focusable.includes(document.activeElement))){event.preventDefault();first.focus();}
 }
 async function submit(){
  if(disabled||submitLock.current||!canExport)return;
  submitLock.current=true;setSubmitting(true);setError("");
  try{
   const blank=sheet==="blank";
   if(format==="pdf")await onPDF(blank);
   else await onCSV(blank);
  }catch(e){setError(e?.message||"Unable to export report.");}
  finally{submitLock.current=false;setSubmitting(false);}
 }
 if(typeof document==="undefined")return null;
 return createPortal(
  <div className={exportStyles.overlay} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
   <section ref={dialogRef} className={exportStyles.modal} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={`${id}-title`} aria-busy={disabled} onKeyDown={handleKeyDown}>
    <div className={exportStyles.emblem} aria-hidden="true"><ExportIcon name="fileDownload" size={32}/></div>
    <header className={exportStyles.header}>
     <h2 id={`${id}-title`}>{title}</h2>
     <button ref={closeRef} type="button" className={exportStyles.close} disabled={disabled} onClick={close} aria-label="Close export"><ExportIcon name="close" size={20}/></button>
    </header>
    <div className={exportStyles.body}>
     <div className={exportStyles.summary} aria-live="polite">{columns.length} columns selected <span aria-hidden="true">·</span> {selectedGroups.length} kit groups</div>
     <div className={exportStyles.block}>
      <div className={exportStyles.sectionHead}><h3>Columns</h3><button type="button" className={exportStyles.link} disabled={disabled} onClick={onSelectAllColumns}>Select all</button></div>
      <div className={exportStyles.checks}>{columnOptions.map(col=><label key={col.key} className={exportStyles.check}><input type="checkbox" checked={columns.includes(col.key)} disabled={disabled||col.fixed||col.key==="name"} onChange={()=>onToggleColumn(col.key)}/><span>{col.label}</span></label>)}</div>
     </div>
     <div className={exportStyles.block}>
      <div className={exportStyles.sectionHead}><h3>Kit groups</h3><button type="button" className={exportStyles.link} disabled={disabled} onClick={onSelectAllGroups}>All kits</button></div>
      <button type="button" className={exportStyles.kitTrigger} disabled={disabled} aria-expanded={kitsOpen} aria-controls={`${id}-kits`} aria-label={`${selectedGroups.length} kit groups selected; choose kit groups`} onClick={()=>setKitsOpen(value=>!value)}>
       <span className={exportStyles.chips}>{selectedGroups.slice(0,2).map(group=><span className={exportStyles.chip} key={group.key}><span className={exportStyles.chipCheck}><ExportIcon name="check" size={12}/></span><span>{group.name}</span></span>)}{selectedGroups.length>2&&<span className={exportStyles.more}>+ {selectedGroups.length-2} more</span>}{!selectedGroups.length&&<span>No kits</span>}</span>
       <span className={kitsOpen?exportStyles.chevronOpen:exportStyles.chevron}><ExportIcon name="chevron" size={20}/></span>
      </button>
      <div id={`${id}-kits`} hidden={!kitsOpen} className={exportStyles.kitOptions}>{groups.map(group=>{const checked=!groupKeys.length||groupKeys.includes(group.key);return <label key={group.key} className={exportStyles.check}><input type="checkbox" checked={checked} disabled={disabled||(selectedGroups.length===1&&checked)} onChange={()=>onToggleGroup(group.key)}/><span>{group.name}</span></label>;})}</div>
     </div>
     <div className={exportStyles.block}>
      <h3 id={`${id}-format`}>Report format</h3>
      <div className={exportStyles.segments} role="group" aria-labelledby={`${id}-format`}>{[["pdf","PDF"],["csv","CSV"]].map(([value,label])=><button key={value} type="button" aria-pressed={format===value} disabled={disabled} onClick={()=>setFormat(value)}><ExportIcon name="document" size={19}/>{label}</button>)}</div>
     </div>
     <div className={exportStyles.block}>
      <h3 id={`${id}-sheet`}>Sheet type</h3>
      <div className={exportStyles.segments} role="group" aria-labelledby={`${id}-sheet`}>{[["values","Values"],["blank","Blank sheet"]].map(([value,label])=><button key={value} type="button" aria-pressed={sheet===value} disabled={disabled} onClick={()=>setSheet(value)}><ExportIcon name="layers" size={19}/>{label}</button>)}</div>
     </div>
    </div>
    <footer className={exportStyles.footer}>
     {error&&<div role="alert" className={exportStyles.error}>{error}</div>}
     <button type="button" className={exportStyles.submit} disabled={disabled||!canExport} onClick={submit}><ExportIcon name="download" size={21}/>{disabled?"Exporting…":"Export"}</button>
    </footer>
   </section>
  </div>,document.body);
}
