"use client";
import { useEffect, useRef, useState } from 'react';
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
  const fileInput=useRef(null),mounted=useRef(true),inFlight=useRef(false);
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
      if(mounted.current){setRecord(json.closure);setFiles([]);setConfirmed(false);setOpen(true);}
      onClosed?.();
    }catch(e){if(mounted.current)setError(e.message);}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  if(loading)return <div className="pr-stage-closure" role="status">Checking stage status…</div>;
  if(loadFailed)return <div className="pr-stage-closure" role="alert">{error} <button type="button" className="pr-secondary" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>;
  return <section className={`pr-stage-closure${record?' is-closed':''}`} aria-label="Stage closure">
    <div className="pr-sc-header"><div className="pr-sc-state"><span className="pr-sc-symbol" aria-hidden="true">{record?'✓':'▤'}</span><div><strong>{record?'Stage Closed':'Stage Sign-off'}</strong><small>{record?`Closed by ${record.closedBy} · ${new Date(record.closedAt).toLocaleString('en-GB',{timeZone:'Africa/Cairo'})}`:'Signed documents & closure record'}</small></div></div>
      {record?<button type="button" className="pr-secondary" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Hide documents':`View documents (${record.documents.length})`}</button>:allowed?<button type="button" className="pr-primary" disabled={busy||preparing} onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Cancel':'Close Stage'}</button>:<span className="pr-sc-readonly">Open · Read only</span>}
    </div>
    {error&&<div className="pr-sc-error" role="alert">{error} <button type="button" className="pr-secondary" onClick={()=>setRetry(v=>v+1)} disabled={busy}>Refresh status</button></div>}
    {open&&record&&<div className="pr-sc-documents">{record.documents.map(d=><a className="pr-sc-document" key={d.index} href={`${endpoint}&document=${d.index}`} target="_blank" rel="noopener noreferrer"><span className="pr-sc-doc-icon">▧</span><span><strong>{d.name}</strong><small>Signed document {d.index+1} · Open image</small></span><span aria-hidden="true">↗</span></a>)}</div>}
    {open&&!record&&allowed&&<div className="pr-sc-form">
      <label className="pr-sc-upload"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||preparing} onChange={addFiles}/><span className="pr-sc-symbol">↑</span><strong>{preparing?'Preparing photos…':'Upload signed documents'}</strong><small>JPG, PNG, WEBP · Up to 10 photos · 3.5 MB total</small></label>
      {!!files.length&&<><div className="pr-sc-files">{files.map((f,i)=><div className="pr-sc-preview" key={`${i}-${f.name}`}><Preview file={f}/><span title={f.name}>{f.name}</span><button type="button" aria-label={`Remove ${f.name}`} disabled={busy||preparing} onClick={()=>{setFiles(v=>v.filter((_,index)=>index!==i));setConfirmed(false);}}>×</button></div>)}</div><label className="pr-sc-confirm"><input type="checkbox" checked={confirmed} disabled={busy||preparing} onChange={e=>setConfirmed(e.target.checked)}/> I confirm these signed documents are correct and this stage is ready to close.</label></>}
      <div className="pr-sc-footer"><span>{files.length} / {MAX_FILES} images</span><button type="button" className="pr-primary" disabled={!files.length||!confirmed||busy||preparing} onClick={closeStage}>{busy?'Closing…':'Confirm & Close Stage'}</button></div>
    </div>}
  </section>;
}
