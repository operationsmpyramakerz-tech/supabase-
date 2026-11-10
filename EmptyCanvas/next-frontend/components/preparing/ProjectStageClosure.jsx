"use client";
import { useEffect, useRef, useState } from 'react';

function Icon({ name, size = 22 }) {
  const paths = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
    arrow: <path d="M7 17 17 7M7 7h10v10"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3.2"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const MAX_BYTES = 3500000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const sized = value / (1024 ** index);
  return `${sized >= 10 || index === 0 ? Math.round(sized) : sized.toFixed(1)} ${units[index]}`;
}

function Preview({ file }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (file.type === 'application/pdf' ? <div className="pr-sc-pdf-preview"><iframe src={url} title={file.name} /><a href={url} target="_blank" rel="noopener noreferrer">Open PDF in new tab</a></div> : <img src={url} alt={file.name} />) : null;
}

async function fitImage(file, budget) {
  if (file.size <= budget) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (const max of [2400, 2000, 1600, 1280]) {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.76, 0.64]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= budget) {
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        }
      }
    }
    throw new Error('These images are too large. Choose smaller images or fewer pages.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProjectStageClosure({ projectId, stage, allowed, onClosed }) {
  const endpoint = `/next/api/projects-preparing/stage-closures?projectId=${encodeURIComponent(projectId)}&stage=${encodeURIComponent(stage)}`;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const dialog = useRef(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const preparingRef = useRef(false);
  const receipts = useRef(new Map());

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open, loading, loadFailed]);

  function dismiss() {
    if (previewFile) { setPreviewFile(null); return; }
    if (busy || preparing) return;
    setOpen(false);
    setDragging(false);
    setError('');
  }

  function openDialog() {
    setError('');
    setOpen(true);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    setError('');
    fetch(endpoint, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'Unable to load stage status.');
        return j.closure;
      })
      .then((v) => {
        if (active) setRecord(v);
      })
      .catch((e) => {
        if (active) {
          setLoadFailed(true);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, retry]);

  async function stageFiles(added) {
    if (!added.length || inFlight.current || preparingRef.current) return;
    if (added.some(f => !TYPES.includes(f.type) || !f.size)) {
      setError('Choose JPG, PNG, WEBP or PDF files.');
      return;
    }
    if (added.some(f => f.type === 'application/pdf' && f.size > MAX_BYTES)) {
      setError('Each PDF must be 3.5 MB or less.');
      return;
    }
    preparingRef.current = true;
    setPreparing(true);
    setError('');
    try {
      const next=[];
      for (const file of added) next.push(file.type === 'application/pdf' ? file : await fitImage(file, MAX_BYTES));
      if (mounted.current) setFiles(v => [...v, ...next]);
    } catch (e) {
      if (mounted.current) setError(e.message || 'Unable to prepare files.');
    } finally {
      preparingRef.current=false;
      if (mounted.current) setPreparing(false);
    }
  }

  async function addFiles(event) {
    const added = Array.from(event.target.files || []);
    event.target.value = '';
    stageFiles(added);
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    const added = Array.from(event.dataTransfer?.files || []);
    stageFiles(added);
  }

  async function closeStage() {
    if (inFlight.current || !allowed || !files.length || record || preparing) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      setUploadCount(0);
      const tokens=[];
      for(const file of files){
        let cached=receipts.current.get(file);
        if(!cached || cached.expires < Date.now()){
          const form=new FormData();form.append('documents',file,file.name);
          const response=await fetch(`${endpoint}&action=upload`,{method:'POST',body:form,cache:'no-store'});
          const json=await response.json().catch(()=>({}));
          if(!response.ok||!json.ok){if(response.status===409)setRetry(v=>v+1);throw new Error(json.error||`Upload failed (${response.status}).`);}
          cached={token:json.receipt,expires:Date.now()+23*60*60*1000};receipts.current.set(file,cached);
        }
        tokens.push(cached.token);
        if(mounted.current)setUploadCount(tokens.length);
      }
      const response=await fetch(`${endpoint}&action=finalize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipts:tokens}),cache:'no-store'});
      const json=await response.json().catch(()=>({}));
      if(!response.ok||!json.ok){if(response.status===409)setRetry(v=>v+1);throw new Error(json.error||`Closure failed (${response.status}).`);}
      if (mounted.current) { setRecord(json.closure);setFiles([]);setOpen(false);receipts.current.clear(); }
      onClosed?.();
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const totalSize = files.reduce((sum, item) => sum + item.size, 0);

  if (loading) return <div className="pr-stage-closure" role="status">Checking stage status…</div>;
  if (loadFailed) return <div className="pr-stage-closure" role="alert">{error} <button type="button" className="pr-secondary" onClick={() => setRetry((v) => v + 1)}>Retry</button></div>;

  return (
    <section className={`pr-stage-closure${record ? ' is-closed' : ''}`} aria-label="Stage closure">
      <div className="pr-sc-header">
        <div className="pr-sc-state">
          <span className="pr-sc-symbol"><Icon name={record ? 'check' : 'file'} /></span>
          <div>
            <strong>{record ? 'Stage Closed' : 'Stage Sign-off'}</strong>
            <small>{record ? `Closed by ${record.closedBy} · ${new Date(record.closedAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })}` : 'Signed documents & closure record'}</small>
          </div>
        </div>
        {record ? (
          <button type="button" className="pr-sc-card-action" onClick={openDialog} aria-haspopup="dialog">View documents ({record.documents.length}) <Icon name="arrow" size={15} /></button>
        ) : allowed ? (
          <button type="button" className="pr-sc-card-action" onClick={openDialog} aria-haspopup="dialog"><Icon name="lock" size={16} /> Close Stage</button>
        ) : (
          <span className="pr-sc-readonly">Open · Read only</span>
        )}
      </div>
      {!open && error && <div className="pr-sc-error" role="alert">{error}</div>}

      <dialog ref={dialog}
        className="pr-sc-dialog"
        aria-label={previewFile ? 'Document preview' : record ? 'Signed documents' : 'Close stage'}
        onCancel={(e) => { e.preventDefault(); dismiss(); }}
        onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      >
        <div className="pr-sc-modal-shell">
          <header className="pr-sc-modal-head pr-sc-upload-head">
            <div className="pr-sc-modal-heading pr-sc-upload-title-wrap">
              <span className="pr-sc-header-upload-icon"><Icon name={previewFile ? 'eye' : 'upload'} size={24} /></span>
              <h2 title={previewFile?.name}>{previewFile ? previewFile.name : record ? 'Uploaded Files' : 'Upload Files'}</h2>
            </div>
            <button type="button" className="pr-sc-icon-button" onClick={dismiss} disabled={busy || preparing} aria-label="Close dialog"><Icon name="close" size={20} /></button>
          </header>

          <div className="pr-sc-modal-body pr-sc-upload-body">
            {previewFile ? (
              <div className="pr-sc-full-preview"><Preview file={previewFile} /></div>
            ) : !record && allowed ? (
              <>
                <div className="pr-sc-upload-card">
                  <label
                    className={`pr-sc-upload-box${dragging ? ' is-dragging' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
                    onDrop={onDrop}
                  >
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple disabled={busy || preparing} onChange={addFiles} />
                    <span className="pr-sc-plus-circle"><Icon name="plus" size={26} /></span>
                    <strong>{preparing ? 'Preparing files…' : 'Drag & Drop or click to choose files'}</strong>
                    <small>JPG, PNG, WEBP, PDF · 3.5 MB per file</small>
                  </label>

                  {!!files.length && (
                    <>
                      <div className="pr-sc-upload-list">
                        {files.map((f, i) => (
                          <article className="pr-sc-upload-item" key={`${i}-${f.name}`}>
                            <div className="pr-sc-upload-fileinfo">
                              <span className="pr-sc-upload-fileicon"><Icon name="file" size={22} /></span>
                              <div className="pr-sc-upload-meta">
                                <strong title={f.name}>{f.name}</strong>
                                <small>{formatBytes(f.size)}</small>
                              </div>
                            </div>
                            <div className="pr-sc-upload-actions">
                              <button type="button" className="pr-sc-upload-action pr-sc-open-file" aria-label={`Open ${f.name}`} disabled={busy || preparing} onClick={() => setPreviewFile(f)}><Icon name="eye" size={17} /></button>
                              <button type="button" className="pr-sc-upload-action pr-sc-delete-file" aria-label={`Remove ${f.name}`} disabled={busy || preparing} onClick={() => { setFiles((v) => v.filter((_, index) => index !== i)); setError(''); }}><Icon name="trash" size={19} /></button>
                            </div>
                          </article>
                        ))}
                      </div>

                      <button type="button" className="pr-sc-remove-all" disabled={busy || preparing} onClick={() => { setFiles([]); setError(''); }}><Icon name="trash" size={17} /> <span>Remove all selected files</span></button>
                    </>
                  )}
                </div>

                <div className="pr-sc-upload-summary">
                  <span>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
                  <span>{formatBytes(totalSize)} total</span>
                </div>


              </>
            ) : record ? (
              <>
                <div className="pr-sc-record pr-sc-record-simple">
                  <Icon name="check" />
                  <div>
                    <strong>Stage closed successfully</strong>
                    <small>Closed by {record.closedBy} · {new Date(record.closedAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })}</small>
                  </div>
                </div>
                <div className="pr-sc-upload-list is-view-mode">
                  {record.documents.map((d) => (
                    <a className="pr-sc-upload-item pr-sc-document-row" key={d.index} href={`${endpoint}&document=${d.index}`} target="_blank" rel="noopener noreferrer">
                      <div className="pr-sc-upload-fileinfo">
                        <span className="pr-sc-upload-fileicon"><Icon name="file" size={22} /></span>
                        <div className="pr-sc-upload-meta">
                          <strong title={d.name}>{d.name}</strong>
                          <small>Signed document {d.index + 1}</small>
                        </div>
                      </div>
                      <span className="pr-sc-upload-action"><Icon name="arrow" size={16} /></span>
                    </a>
                  ))}
                </div>
              </>
            ) : null}

            {error && <div className="pr-sc-error" role="alert">{error}</div>}
          </div>

          <footer className="pr-sc-modal-footer pr-sc-upload-footer">
            <button type="button" className="pr-sc-cancel" disabled={busy || preparing} onClick={dismiss}>{previewFile ? 'Back to files' : record ? 'Done' : 'Cancel'}</button>
            {!previewFile && !record && allowed && <button type="button" className="pr-sc-submit" disabled={!files.length || busy || preparing} onClick={closeStage}><Icon name="lock" size={16} />{busy ? `Uploading ${uploadCount}/${files.length}…` : 'Close Stage'}</button>}
          </footer>
        </div>
      </dialog>
    </section>
  );
}
