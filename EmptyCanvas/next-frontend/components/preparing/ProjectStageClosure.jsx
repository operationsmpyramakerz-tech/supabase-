"use client";
import { useEffect, useRef, useState } from 'react';
const STAGE_NAMES={testing:'Project Testing',warehouse:'Warehouse Receiving',production:'Production Receiving',boxes:'Box Distribution',cartons:'Project Kit Cartons'};
function Icon({name,size=22}) {
  const paths={file:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/></>,check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,upload:<><path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,arrow:<path d="M7 17 17 7M7 7h10v10"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const MAX_BYTES=3500000, MAX_FILES=10;
const TYPES=['image/jpeg','image/png','image/webp'];
function Preview({file}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return url?<img src={url} alt={file.name}/>:null;
}
// Keep originals when they fit. Large camera photos are resized only as needed,
// with a preview before confirmation. Never upload the user's original silently.
async function fitImage(file,budget) {
  if(file.size<=budget)return file;
  const url=URL.createObjectURL(file);
  try {
    const image=new Image(); image.src=url; await image.decode();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    for(const max of [2400,2000,1600,1280]) {
      const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.88,.76,.64]) {
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob&&blob.size<=budget)return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
      }
    }
    throw new Error('These images are too large. Choose smaller images or fewer pages.');
  }finally{URL.revokeObjectURL(url);}
}
export default function ProjectStageClosure({projectId,stage,allowed,onClosed}) {
  const endpoint=`/next/api/projects-preparing/stage-closures?projectId=${encodeURIComponent(projectId)}&stage=${encodeURIComponent(stage)}`;
  const [record,setRecord]=useState(null),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[error,setError]=useState('');
  const [open,setOpen]=useState(false),[files,setFiles]=useState([]),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[confirmed,setConfirmed]=useState(false),[retry,setRetry]=useState(0);
  const dialog=useRef(null),mounted=useRef(true),inFlight=useRef(false);
  useEffect(()=>{const el=dialog.current;if(!el)return;if(open&&!el.open)el.showModal();else if(!open&&el.open)el.close();},[open,loading,loadFailed]);
  function dismiss(){if(busy||preparing)return;setOpen(false);setError('');}
  function openDialog(){setError('');setOpen(true);}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{let active=true;setLoading(true);setLoadFailed(false);setError('');fetch(endpoint,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Unable to load stage status.');return j.closure;}).then(v=>{if(active)setRecord(v);}).catch(e=>{if(active){setLoadFailed(true);setError(e.message);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[endpoint,retry]);
  async function addFiles(event) {
    const added=Array.from(event.target.files||[]);event.target.value='';
    if(!added.length)return;
    if(files.length+added.length>MAX_FILES){setError('Choose up to 10 document images.');return;}
    if(added.some(f=>!TYPES.includes(f.type)||!f.size)){setError('Choose JPG, PNG or WEBP images.');return;}
    setPreparing(true);setError('');setConfirmed(false);
    try {
      const all=[...files,...added];
      const next=all.reduce((s,f)=>s+f.size,0)<=MAX_BYTES?all:await Promise.all(all.map(f=>fitImage(f,Math.floor(MAX_BYTES/all.length))));
      if(mounted.current)setFiles(next);
    }catch(e){if(mounted.current)setError(e.message||'Unable to prepare images.');}
    finally{if(mounted.current)setPreparing(false);}
  }
  async function closeStage(){
    if(inFlight.current||!allowed||!confirmed||!files.length||record||preparing)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
      const form=new FormData();files.forEach(f=>form.append('documents',f,f.name));
      const response=await fetch(endpoint,{method:'POST',body:form,cache:'no-store'});
      const json=await response.json().catch(()=>({}));
      if(!response.ok||!json.ok){if(response.status===409)setRetry(v=>v+1);throw new Error(json.error||`Closure failed (${response.status}).`);}
      if(mounted.current){setRecord(json.closure);setFiles([]);setConfirmed(false);setOpen(false);}
      onClosed?.();
    }catch(e){if(mounted.current)setError(e.message);}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  if(loading)return <div className="pr-stage-closure" role="status">Checking stage status…</div>;
  if(loadFailed)return <div className="pr-stage-closure" role="alert">{error} <button type="button" className="pr-secondary" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>;
  return <section className={`pr-stage-closure${record?' is-closed':''}`} aria-label="Stage closure">
    <div className="pr-sc-header">
      <div className="pr-sc-state"><span className="pr-sc-symbol"><Icon name={record?'check':'file'}/></span><div><strong>{record?'Stage Closed':'Stage Sign-off'}</strong><small>{record?`Closed by ${record.closedBy} · ${new Date(record.closedAt).toLocaleString('en-GB',{timeZone:'Africa/Cairo'})}`:'Signed documents & closure record'}</small></div></div>
      {record?<button type="button" className="pr-sc-card-action" onClick={openDialog} aria-haspopup="dialog">View documents ({record.documents.length}) <Icon name="arrow" size={15}/></button>:allowed?<button type="button" className="pr-sc-card-action" onClick={openDialog} aria-haspopup="dialog"><Icon name="lock" size={16}/> Close Stage</button>:<span className="pr-sc-readonly">Open · Read only</span>}
    </div>
    {!open&&error&&<div className="pr-sc-error" role="alert">{error}</div>}
    <dialog ref={dialog} className="pr-sc-dialog" aria-label={record?'Signed documents':'Close stage'} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
      <div className="pr-sc-modal-shell">
        <header className="pr-sc-modal-head"><div className="pr-sc-modal-heading"><span className="pr-sc-modal-icon"><Icon name={record?'check':'file'} size={25}/></span><div><span className="pr-sc-eyebrow">{STAGE_NAMES[stage]||'Project stage'}</span><h2>{record?'Signed documents':'Close Stage'}</h2></div></div><button type="button" className="pr-sc-icon-button" onClick={dismiss} disabled={busy||preparing} aria-label="Close dialog"><Icon name="close" size={20}/></button></header>
        <div className="pr-sc-modal-body">
          {record?<><div className="pr-sc-record"><Icon name="check"/><div><strong>Stage Closed · 100%</strong><small>Closed by {record.closedBy} · {new Date(record.closedAt).toLocaleString('en-GB',{timeZone:'Africa/Cairo'})}</small></div></div><div className="pr-sc-documents">{record.documents.map(d=><a className="pr-sc-document" key={d.index} href={`${endpoint}&document=${d.index}`} target="_blank" rel="noopener noreferrer"><span className="pr-sc-doc-icon"><Icon name="file"/></span><span><strong>{d.name}</strong><small>Signed document {d.index+1} · Open image</small></span><Icon name="arrow" size={17}/></a>)}</div></>:allowed?<>
            <label className="pr-sc-upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||preparing} onChange={addFiles}/><span className="pr-sc-upload-icon"><Icon name="upload" size={26}/></span><strong>{preparing?'Preparing photos…':'Upload signed documents'}</strong><small>JPG, PNG, WEBP · Up to 10 photos · 3.5 MB total</small></label>
            <div className="pr-sc-file-heading"><strong>Selected documents</strong><span>{files.length} / {MAX_FILES}</span></div>
            {!!files.length?<div className="pr-sc-files">{files.map((f,i)=><div className="pr-sc-preview" key={`${i}-${f.name}`}><Preview file={f}/><span title={f.name}>{f.name}</span><button type="button" className="pr-sc-remove" aria-label={`Remove ${f.name}`} disabled={busy||preparing} onClick={()=>{setFiles(v=>v.filter((_,index)=>index!==i));setConfirmed(false);}}><Icon name="close" size={14}/></button></div>)}</div>:<p className="pr-sc-empty">No documents selected yet.</p>}
            <label className="pr-sc-confirm"><input type="checkbox" checked={confirmed} disabled={busy||preparing||!files.length} onChange={e=>setConfirmed(e.target.checked)}/> <span>I confirm these signed documents are correct and this stage is ready to close.</span></label>
          </>:null}
          {error&&<div className="pr-sc-error" role="alert">{error}</div>}
        </div>
        <footer className="pr-sc-modal-footer"><button type="button" className="pr-sc-cancel" disabled={busy||preparing} onClick={dismiss}>{record?'Done':'Cancel'}</button>{!record&&allowed&&<button type="button" className="pr-sc-submit" disabled={!files.length||!confirmed||busy||preparing} onClick={closeStage}><Icon name="lock" size={16}/>{busy?'Closing…':'Confirm & Close Stage'}</button>}</footer>
      </div>
    </dialog>
  </section>;
}
