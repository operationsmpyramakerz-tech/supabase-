"use client";
import { useEffect, useRef, useState } from 'react';

const STAGE_NAMES = {
  testing: 'Project Testing',
  warehouse: 'Warehouse Receiving',
  production: 'Production Receiving',
  boxes: 'Box Distribution',
  cartons: 'Project Kit Cartons',
};

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
const MAX_FILES = 10;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  return url ? <img src={url} alt={file.name} /> : null;
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
  const [confirmed, setConfirmed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dialog = useRef(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open, loading, loadFailed]);

  function dismiss() {
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
    if (!added.length) return;
    if (files.length + added.length > MAX_FILES) {
      setError('Choose up to 10 document images.');
      return;
    }
    if (added.some((f) => !TYPES.includes(f.type) || !f.size)) {
      setError('Choose JPG, PNG or WEBP images.');
      return;
    }
    setPreparing(true);
    setError('');
    setConfirmed(false);
    try {
      const all = [...files, ...added];
      const next = all.reduce((s, f) => s + f.size, 0) <= MAX_BYTES
        ? all
        : await Promise.all(all.map((f) => fitImage(f, Math.floor(MAX_BYTES / all.length))));
      if (mounted.current) setFiles(next);
    } catch (e) {
      if (mounted.current) setError(e.message || 'Unable to prepare images.');
    } finally {
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
    if (inFlight.current || !allowed || !confirmed || !files.length || record || preparing) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('documents', f, f.name));
      const response = await fetch(endpoint, { method: 'POST', body: form, cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        if (response.status === 409) setRetry((v) => v + 1);
        throw new Error(json.error || `Closure failed (${response.status}).`);
      }
      if (mounted.current) { setRecord(json.closure);setFiles([]);setConfirmed(false);setOpen(false); }
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
        aria-label={record ? 'Signed documents' : 'Close stage'}
        onCancel={(e) => { e.preventDefault(); dismiss(); }}
        onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      >
        <div className="pr-sc-modal-shell">
          <header className="pr-sc-modal-head pr-sc-upload-head">
            <div className="pr-sc-modal-heading pr-sc-upload-title-wrap">
              <div>
                {!record && <h2>Upload Files</h2>}
                {!!record && <h2>Uploaded Files</h2>}
                <p className="pr-sc-subtitle">{STAGE_NAMES[stage] || 'Project stage'}{record ? ' · Stage closed' : ' · Close Stage'}</p>
              </div>
            </div>
            <button type="button" className="pr-sc-icon-button" onClick={dismiss} disabled={busy || preparing} aria-label="Close dialog"><Icon name="close" size={20} /></button>
          </header>

          <div className="pr-sc-modal-body pr-sc-upload-body">
            {!record && allowed ? (
              <>
                <div className="pr-sc-upload-card">
                  <label
                    className={`pr-sc-upload-box${dragging ? ' is-dragging' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
                    onDrop={onDrop}
                  >
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || preparing} onChange={addFiles} />
                    <span className="pr-sc-plus-circle"><Icon name="plus" size={26} /></span>
                    <strong>{preparing ? 'Preparing files…' : 'Drag & Drop or click to choose files'}</strong>
                    <small>JPG, PNG, WEBP · Up to 10 photos · 3.5 MB total</small>
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
                              <div className="pr-sc-upload-thumb"><Preview file={f} /></div>
                              <button type="button" className="pr-sc-upload-action" aria-label={`Remove ${f.name}`} disabled={busy || preparing} onClick={() => { setFiles((v) => v.filter((_, index) => index !== i)); setConfirmed(false); }}><Icon name="trash" size={16} /></button>
                            </div>
                          </article>
                        ))}
                      </div>

                      <button type="button" className="pr-sc-remove-all" disabled={busy || preparing} onClick={() => { setFiles([]); setConfirmed(false); }}>Remove all selected files</button>
                    </>
                  )}
                </div>

                <div className="pr-sc-upload-summary">
                  <span>{files.length} / {MAX_FILES} files</span>
                  <span>{formatBytes(totalSize)} / {formatBytes(MAX_BYTES)}</span>
                </div>

                <label className="pr-sc-confirm pr-sc-confirm-upload">
                  <input type="checkbox" checked={confirmed} disabled={busy || preparing || !files.length} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>I confirm these signed documents are correct and this stage is ready to close.</span>
                </label>
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
            <button type="button" className="pr-sc-cancel" disabled={busy || preparing} onClick={dismiss}>{record ? 'Done' : 'Cancel'}</button>
            {!record && allowed && <button type="button" className="pr-sc-submit" disabled={!files.length || !confirmed || busy || preparing} onClick={closeStage}><Icon name="lock" size={16} />{busy ? 'Closing…' : 'Confirm & Close Stage'}</button>}
          </footer>
        </div>
      </dialog>
    </section>
  );
}
