"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const RESOURCE_TYPES = {
  book: { label: "Book", short: "BK" },
  teacher_guide: { label: "Teacher Guide", short: "TG" },
  lesson_plan: { label: "Lesson Plan", short: "LP" },
  presentation: { label: "Presentation", short: "PR" },
  materials: { label: "Materials", short: "MT" },
  exam: { label: "Exam", short: "EX" },
};
const MAX_FILE_BYTES = 500 * 1024 * 1024;
const PDF_MIN_ZOOM = 0.7;
const PDF_MAX_ZOOM = 2.2;
const PDF_ZOOM_STEP = 0.15;
let pdfJsPromise = null;
let tusPromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(bytes) {
  const value = number(bytes);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "Recently updated" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fileExtension(value) {
  const match = text(value).match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toUpperCase() : "FILE";
}

function accessLevel(access) {
  const page = (Array.isArray(access?.pages) ? access.pages : []).find((item) => lower(item?.pageKey || item?.page_key) === "lms-curriculum");
  return lower(page?.accessLevel || page?.access_level || "view");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.error || body?.details) || "The request could not be completed.");
  return body;
}

function loadScript(src, test) {
  if (test()) return Promise.resolve();
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", resolve, { once: true });
    existing.addEventListener("error", reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}.`));
    document.head.appendChild(script);
  });
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    const runtimeImport = new Function("url", "return import(url)");
    pdfJsPromise = runtimeImport("/js/vendor/pdfjs/pdf.min.mjs").then((pdfjs) => {
      if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "/js/vendor/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function loadTus() {
  if (!tusPromise) {
    tusPromise = loadScript("/js/vendor/tus/tus.min.js", () => !!window.tus?.Upload).then(() => window.tus);
  }
  return tusPromise;
}

function uploadWithXhr(signedUrl, file, onProgress, { upsert = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!signedUrl) return reject(new Error("The signed upload URL is missing."));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    if (upsert) xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}.`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error while uploading the file.")));
    xhr.addEventListener("abort", () => reject(new Error("File upload was cancelled.")));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

async function uploadWithTus(ticket, file, onProgress) {
  const tus = await loadTus();
  return new Promise((resolve, reject) => {
    const headers = { "x-signature": text(ticket?.token), "x-upsert": "false" };
    if (ticket?.resumableApiKey) headers.apikey = ticket.resumableApiKey;
    const upload = new tus.Upload(file, {
      endpoint: ticket.resumableUrl,
      headers,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: text(ticket?.bucket),
        objectName: text(ticket?.path),
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onProgress(uploaded, total) { onProgress(total ? Math.round((uploaded / total) * 100) : 0); },
      onError(error) { reject(new Error(text(error?.message) || "The resumable upload failed.")); },
      onSuccess() { onProgress(100); resolve(); },
    });
    upload.start();
  });
}

async function uploadResourceFile(ticket, file, onProgress) {
  if (ticket?.mode === "resumable" && ticket?.resumableUrl && ticket?.token) {
    try {
      await uploadWithTus(ticket, file, onProgress);
      return;
    } catch (error) {
      if (!ticket?.signedUrl) throw error;
    }
  }
  await uploadWithXhr(ticket?.signedUrl, file, onProgress);
}

function canvasJpeg(canvas, pageNumber) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error("Could not create a fast PDF preview."));
    resolve(new File([blob], `page-${pageNumber}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
  }, "image/jpeg", 0.78));
}

async function createPdfPreviewFiles(file) {
  if ((file.type !== "application/pdf" && fileExtension(file.name) !== "PDF") || file.size > 250 * 1024 * 1024) return [];
  const pdfjs = await loadPdfJs();
  const objectUrl = URL.createObjectURL(file);
  let task;
  try {
    task = pdfjs.getDocument({ url: objectUrl, disableAutoFetch: true, disableRange: false, disableStream: false, isEvalSupported: false });
    const documentRef = await task.promise;
    const previews = [];
    for (let pageNumber = 1; pageNumber <= Math.min(2, documentRef.numPages); pageNumber += 1) {
      const page = await documentRef.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.max(0.25, Math.min(1.45, 1000 / natural.width, 1400 / natural.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      previews.push({ pageNumber, file: await canvasJpeg(canvas, pageNumber) });
      page.cleanup?.();
    }
    return previews;
  } finally {
    try { await task?.destroy?.(); } catch {}
    URL.revokeObjectURL(objectUrl);
  }
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-lms-curriculum-toast ${toast.type === "error" ? "is-error" : ""}`} role="status">
      <div><strong>{toast.title || "LMS Curriculum"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function EmptyState({ title, message, action }) {
  return <div className="next-lms-curriculum-empty"><span>F</span><strong>{title}</strong><p>{message}</p>{action}</div>;
}

function EntityModal({ kind, item, group, themeId, onClose, onSaved }) {
  const labels = {
    group: { title: item ? "Edit Curriculum" : "Add New Curriculum", name: "Curriculum Name", noun: "curriculum" },
    theme: { title: item ? "Edit Theme" : "Add New Theme", name: "Theme Name", noun: "theme" },
    grade: { title: item ? "Edit Grade" : "Add New Grade", name: "Grade Name", noun: "grade" },
  };
  const config = labels[kind];
  const [name, setName] = useState(text(item?.name));
  const [description, setDescription] = useState(text(item?.description));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    if (!text(name)) return setError(`${config.name} is required.`);
    setBusy(true);
    setError("");
    try {
      let url = "";
      let method = item ? "PATCH" : "POST";
      if (kind === "group") url = item ? `/api/lms/curriculum/groups/${encodeURIComponent(item.id)}` : "/api/lms/curriculum/groups";
      if (kind === "theme") url = item ? `/api/lms/curriculum/${encodeURIComponent(item.id)}` : `/api/lms/curriculum/groups/${encodeURIComponent(group?.id)}/themes`;
      if (kind === "grade") url = item ? `/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(item.id)}` : `/api/lms/curriculum/${encodeURIComponent(themeId)}/grades`;
      const result = await requestJson(url, { method, body: JSON.stringify({ name: text(name), description: text(description) }) });
      onSaved(result, kind, !!item);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || `Unable to save the ${config.noun}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="next-lms-curriculum-modal" role="dialog" aria-modal="true" aria-label={config.title}>
      <button className="next-lms-curriculum-modal-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <form className="next-lms-curriculum-modal-card" onSubmit={save}>
        <button className="next-lms-curriculum-modal-x" type="button" onClick={onClose}>×</button>
        <span className="next-lms-kicker">CURRICULUM STRUCTURE</span>
        <h3>{config.title}</h3>
        {kind === "theme" && group ? <p className="next-lms-curriculum-context">Inside {group.name}</p> : null}
        <label><span>{config.name} *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} autoFocus /></label>
        <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={2000} /></label>
        {error ? <div className="next-lms-curriculum-error">{error}</div> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Saving…" : item ? "Save Changes" : `Create ${config.noun}`}</button></footer>
      </form>
    </div>
  );
}

function ResourceModal({ themeId, gradeId, type, item, onClose, onSaved }) {
  const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.book;
  const [name, setName] = useState(text(item?.name || item?.file_name));
  const [notes, setNotes] = useState(text(item?.notes));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    if (!text(name)) return setError("File name is required.");
    if (!item && !file) return setError("Choose a file to upload.");
    if (file && file.size > MAX_FILE_BYTES) return setError("The file must be 500 MB or less.");
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      let upload = null;
      let previewPromise = Promise.resolve([]);
      if (file) {
        setStatus("Preparing secure upload…");
        const ticket = await requestJson(`/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(gradeId)}/upload-ticket`, {
          method: "POST",
          body: JSON.stringify({ resourceType: type, fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" }),
        });
        upload = ticket.upload || {};
        previewPromise = createPdfPreviewFiles(file).catch(() => []);
        setStatus(`Uploading ${file.name}`);
        await uploadResourceFile(upload, file, setProgress);
        const previews = await previewPromise;
        const previewTickets = Array.isArray(upload.previewUploads) ? upload.previewUploads : [];
        await Promise.allSettled(previews.map((preview) => {
          const target = previewTickets.find((entry) => Number(entry?.pageNumber) === preview.pageNumber);
          return target?.signedUrl ? uploadWithXhr(target.signedUrl, preview.file, () => {}, { upsert: false }) : Promise.resolve();
        }));
      }

      setStatus("Saving file record…");
      const payload = {
        name: text(name),
        notes: text(notes),
        ...(upload ? {
          storagePath: upload.path,
          storageBucket: upload.bucket,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          resourceType: type,
        } : {}),
      };
      const result = await requestJson(item
        ? `/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(gradeId)}/resources/${encodeURIComponent(item.id)}`
        : `/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(gradeId)}/resources`, {
        method: item ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved(result.resource, !!item);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save the curriculum file.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="next-lms-curriculum-modal" role="dialog" aria-modal="true" aria-label={`${item ? "Edit" : "Add"} ${config.label}`}>
      <button className="next-lms-curriculum-modal-backdrop" type="button" onClick={busy ? undefined : onClose} aria-label="Close" />
      <form className="next-lms-curriculum-modal-card next-lms-curriculum-resource-form" onSubmit={save}>
        <button className="next-lms-curriculum-modal-x" type="button" onClick={onClose} disabled={busy}>×</button>
        <span className="next-lms-kicker">{config.label.toUpperCase()}</span>
        <h3>{item ? `Edit ${config.label}` : `Add ${config.label}`}</h3>
        <label><span>File Name *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} autoFocus /></label>
        <label className="next-lms-curriculum-file-picker">
          <span>{item ? "Replace file (optional)" : "Upload file *"}</span>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={busy} />
          <div><b>{file ? file.name : item?.file_name || "Choose a file"}</b><small>{file ? formatBytes(file.size) : "Up to 500 MB. Large files use direct resumable Storage upload."}</small></div>
        </label>
        <label><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={4000} /></label>
        {busy && file ? <div className="next-lms-curriculum-progress"><div><span style={{ width: `${Math.max(2, progress)}%` }} /></div><p><b>{status || "Uploading…"}</b><strong>{progress}%</strong></p></div> : null}
        {error ? <div className="next-lms-curriculum-error">{error}</div> : null}
        <footer><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" disabled={busy}>{busy ? status || "Saving…" : item ? "Save Changes" : "Upload and Save"}</button></footer>
      </form>
    </div>
  );
}

function PdfCanvas({ documentRef, pageNumber, zoom, renderToken }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    let task;
    async function render() {
      if (!documentRef || !pageNumber || !canvasRef.current) return;
      setState("loading");
      try {
        const page = await documentRef.getPage(pageNumber);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        const targetWidth = Math.min(900, Math.max(420, window.innerWidth * 0.34));
        const scale = Math.max(0.35, Math.min(2.2, (targetWidth / natural.width) * zoom * (window.devicePixelRatio || 1)));
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        task = page.render({ canvas, canvasContext: context, viewport });
        await task.promise;
        if (!cancelled) setState("ready");
        page.cleanup?.();
      } catch (error) {
        if (!cancelled && error?.name !== "RenderingCancelledException") setState("error");
      }
    }
    render();
    return () => { cancelled = true; try { task?.cancel?.(); } catch {} };
  }, [documentRef, pageNumber, zoom, renderToken]);

  return (
    <div className={`next-lms-pdf-page ${state}`}>
      <canvas ref={canvasRef} />
      {state === "loading" ? <span>Rendering page {pageNumber}…</span> : null}
      {state === "error" ? <span>Page {pageNumber} could not render.</span> : null}
    </div>
  );
}

function PdfViewer({ ticket }) {
  const [documentRef, setDocumentRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [spreadStart, setSpreadStart] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState("");
  const [renderToken, setRenderToken] = useState(0);
  const pointer = useRef(null);
  const rootRef = useRef(null);
  const previewUrls = Array.isArray(ticket?.previewUrls) ? ticket.previewUrls : [];

  useEffect(() => {
    let cancelled = false;
    let task;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const pdfjs = await loadPdfJs();
        const options = { url: ticket.streamUrl, withCredentials: String(ticket.streamUrl || "").startsWith("/"), disableRange: false, disableStream: false, disableAutoFetch: false, isEvalSupported: false };
        try {
          task = pdfjs.getDocument(options);
          const document = await task.promise;
          if (!cancelled) setDocumentRef(document);
        } catch (primaryError) {
          if (!ticket.fallbackStreamUrl || ticket.fallbackStreamUrl === ticket.streamUrl) throw primaryError;
          task = pdfjs.getDocument({ ...options, url: ticket.fallbackStreamUrl, withCredentials: true });
          const document = await task.promise;
          if (!cancelled) setDocumentRef(document);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "The PDF could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; try { task?.destroy?.(); } catch {} };
  }, [ticket?.streamUrl, ticket?.fallbackStreamUrl]);

  useEffect(() => () => { try { documentRef?.destroy?.(); } catch {} }, [documentRef]);

  const total = number(documentRef?.numPages) || number(ticket?.pageCount);
  const normalized = Math.max(1, Math.min(spreadStart, Math.max(1, total % 2 === 0 ? total - 1 : total)));
  const leftPage = normalized;
  const rightPage = total && normalized + 1 <= total ? normalized + 1 : 0;

  function changePage(direction) {
    if (turn || !total) return;
    const next = direction > 0 ? Math.min(normalized + 2, total % 2 === 0 ? Math.max(1, total - 1) : total) : Math.max(1, normalized - 2);
    if (next === normalized) return;
    setTurn(direction > 0 ? "next" : "prev");
    window.setTimeout(() => {
      setSpreadStart(next);
      setRenderToken((value) => value + 1);
      window.setTimeout(() => setTurn(""), 240);
    }, 300);
  }

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.requestFullscreen?.();
  }

  function pointerDown(event) {
    pointer.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function pointerUp(event) {
    if (!pointer.current) return;
    const dx = event.clientX - pointer.current.x;
    const dy = event.clientY - pointer.current.y;
    pointer.current = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) changePage(dx < 0 ? 1 : -1);
  }

  const showPreview = loading && previewUrls.length > 0;
  return (
    <div className="next-lms-pdf-root" ref={rootRef}>
      <div className="next-lms-pdf-toolbar">
        <button type="button" onClick={() => changePage(-1)} disabled={normalized <= 1}>←</button>
        <span>{total ? `Pages ${leftPage}${rightPage ? `–${rightPage}` : ""} of ${total}` : "Preparing book…"}</span>
        <button type="button" onClick={() => changePage(1)} disabled={!total || normalized + 1 >= total}>→</button>
        <i />
        <button type="button" onClick={() => setZoom((value) => Math.max(PDF_MIN_ZOOM, value - PDF_ZOOM_STEP))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(PDF_MAX_ZOOM, value + PDF_ZOOM_STEP))}>+</button>
        <button type="button" onClick={toggleFullscreen}>Full screen</button>
      </div>
      <div className={`next-lms-pdf-stage ${turn ? `turn-${turn}` : ""}`} onPointerDown={pointerDown} onPointerUp={pointerUp}>
        <button type="button" className="next-lms-pdf-edge left" onClick={() => changePage(-1)} aria-label="Previous pages" />
        <div className="next-lms-pdf-book">
          {showPreview ? previewUrls.slice(0, 2).map((url, index) => <div className="next-lms-pdf-page preview" key={url || index}><img src={url} alt={`Fast preview page ${index + 1}`} /></div>) : null}
          {!loading && documentRef ? <PdfCanvas documentRef={documentRef} pageNumber={leftPage} zoom={zoom} renderToken={renderToken} /> : null}
          {!loading && documentRef && rightPage ? <PdfCanvas documentRef={documentRef} pageNumber={rightPage} zoom={zoom} renderToken={renderToken} /> : null}
          {!loading && documentRef && !rightPage ? <div className="next-lms-pdf-page blank"><span>End of book</span></div> : null}
          {loading && !showPreview ? <div className="next-lms-pdf-loading"><span /><strong>Opening the first pages…</strong><small>The rest of the book continues loading in the background.</small></div> : null}
          {error ? <div className="next-lms-pdf-loading is-error"><strong>PDF preview unavailable</strong><small>{error}</small><a href={ticket.fallbackStreamUrl || ticket.streamUrl} target="_blank" rel="noreferrer">Open protected stream</a></div> : null}
        </div>
        <button type="button" className="next-lms-pdf-edge right" onClick={() => changePage(1)} aria-label="Next pages" />
      </div>
      <p className="next-lms-pdf-help">Click the page edges, use the arrows, or drag horizontally to turn pages.</p>
    </div>
  );
}

function ResourceViewer({ themeId, gradeId, resource, onClose }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await requestJson(`/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(gradeId)}/resources/${encodeURIComponent(resource.id)}/view-ticket`);
        if (!cancelled) setTicket(result.preview || result);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "The protected preview could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [themeId, gradeId, resource?.id]);

  useEffect(() => {
    function keydown(event) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);

  const kind = text(ticket?.previewKind);
  const stream = ticket?.streamUrl || ticket?.fallbackStreamUrl;
  return (
    <div className="next-lms-resource-viewer" role="dialog" aria-modal="true" aria-label={`Preview ${resource.name || resource.file_name}`}>
      <div className="next-lms-resource-viewer-head">
        <div><span className="next-lms-kicker">PROTECTED CURRICULUM VIEWER</span><h3>{ticket?.name || resource.name || resource.file_name}</h3><p>{[fileExtension(ticket?.fileName || resource.file_name), formatBytes(ticket?.fileSize || resource.file_size)].filter(Boolean).join(" • ")}</p></div>
        <button type="button" onClick={onClose}>×</button>
      </div>
      <div className="next-lms-resource-viewer-body" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
        <div className="next-lms-resource-watermark" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <span key={index}>{ticket?.viewerName || "Authorized user"}</span>)}</div>
        {loading ? <div className="next-lms-resource-loading"><span /><strong>Preparing secure preview…</strong></div> : null}
        {error ? <div className="next-lms-resource-loading is-error"><strong>Preview unavailable</strong><p>{error}</p></div> : null}
        {!loading && !error && kind === "pdf" ? <PdfViewer ticket={ticket} /> : null}
        {!loading && !error && kind === "image" ? <div className="next-lms-native-preview"><img src={stream} alt={ticket?.name || "Curriculum resource"} /></div> : null}
        {!loading && !error && kind === "video" ? <div className="next-lms-native-preview"><video src={stream} controls controlsList="nodownload" disablePictureInPicture /></div> : null}
        {!loading && !error && kind === "audio" ? <div className="next-lms-native-preview audio"><audio src={stream} controls controlsList="nodownload" /></div> : null}
        {!loading && !error && kind === "text" ? <div className="next-lms-native-preview text"><iframe src={stream} title={ticket?.name || "Text preview"} sandbox="allow-same-origin" /></div> : null}
        {!loading && !error && (!kind || kind === "unsupported") ? <div className="next-lms-resource-loading is-error"><strong>This file has no safe browser preview</strong><p>{ticket?.message || "Convert the file to PDF, image, video, audio, or text for protected in-system viewing."}</p></div> : null}
      </div>
    </div>
  );
}

function FolderCard({ item, kind, onOpen, onEdit, onDelete, canManage }) {
  const caption = text(item?.description) || (kind === "theme" ? "Theme folder" : "Grade folder");
  return (
    <article className="next-lms-curriculum-folder">
      <button className="next-lms-curriculum-folder-open" type="button" onClick={() => onOpen(item)}>
        <span className="next-lms-curriculum-folder-art"><i /><i /><i /></span>
        <strong>{text(item?.name) || `Untitled ${kind}`}</strong>
        <small>{caption}</small>
      </button>
      {canManage ? <div className="next-lms-curriculum-folder-actions"><button type="button" onClick={() => onEdit(item)}>Edit</button><button type="button" onClick={() => onDelete(item)}>Delete</button></div> : null}
    </article>
  );
}

function ResourceCard({ resource, type, canManage, onView, onEdit, onDelete }) {
  const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.book;
  return (
    <article className={`next-lms-resource-card type-${type}`}>
      <button type="button" className="next-lms-resource-card-open" onClick={() => onView(resource)}>
        <span className="next-lms-resource-card-icon"><b>{config.short}</b><em>{fileExtension(resource.file_name || resource.name)}</em></span>
        <div><h4>{text(resource.name || resource.file_name) || `Untitled ${config.label}`}</h4><p>{formatBytes(resource.file_size)} • {formatDate(resource.updated_at || resource.created_at)}</p>{resource.notes ? <small>{resource.notes}</small> : null}</div>
      </button>
      {canManage ? <footer><button type="button" onClick={() => onEdit(resource)}>Edit</button><button type="button" onClick={() => onDelete(resource)}>Delete</button></footer> : null}
    </article>
  );
}

export default function LmsCurriculumClient({ initialCatalog, access, initialThemeId = "", initialGradeId = "", bootstrapWarnings = [] }) {
  const [groups, setGroups] = useState(() => Array.isArray(initialCatalog?.groups) ? initialCatalog.groups : []);
  const [themeId, setThemeId] = useState(text(initialThemeId));
  const [gradeId, setGradeId] = useState(text(initialGradeId));
  const [themeData, setThemeData] = useState(null);
  const [gradeData, setGradeData] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [entityModal, setEntityModal] = useState(null);
  const [resourceModal, setResourceModal] = useState(null);
  const [viewerResource, setViewerResource] = useState(null);
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState("");
  const canManage = !!access?.isBuiltInAdmin || ["edit", "admin"].includes(accessLevel(access));

  const allThemes = useMemo(() => groups.flatMap((group) => (Array.isArray(group?.themes) ? group.themes : []).map((theme) => ({ ...theme, groupId: group.id, groupName: group.name }))), [groups]);
  const selectedTheme = themeData?.curriculum || allThemes.find((theme) => text(theme.id) === themeId) || null;
  const selectedGrade = gradeData?.grade || (Array.isArray(themeData?.grades) ? themeData.grades.find((grade) => text(grade.id) === gradeId) : null) || null;
  const resources = Array.isArray(gradeData?.resources) ? gradeData.resources : [];

  function notify(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  function route(theme = "", grade = "", { replace = false } = {}) {
    const params = new URLSearchParams();
    if (theme) params.set("theme", theme);
    if (grade) params.set("grade", grade);
    const queryString = params.toString();
    const url = `/next/lms/curriculum${queryString ? `?${queryString}` : ""}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setThemeId(theme);
    setGradeId(grade);
    setQuery("");
  }

  async function loadCatalog({ silent = false } = {}) {
    if (!silent) setRefreshing(true);
    try {
      const result = await requestJson(`/api/lms/curriculum?t=${Date.now()}`);
      setGroups(Array.isArray(result.groups) ? result.groups : []);
      setLoadError("");
      return result;
    } catch (error) {
      setLoadError(error?.message || "Unable to load curricula.");
      if (!silent) notify(error?.message || "Unable to refresh curricula.", "error");
      return null;
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  async function loadTheme(id = themeId, { silent = false } = {}) {
    if (!id) return;
    if (!silent) setBusy(true);
    try {
      const result = await requestJson(`/api/lms/curriculum/${encodeURIComponent(id)}?t=${Date.now()}`);
      setThemeData(result);
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "Unable to load the theme.");
      notify(error?.message || "Unable to load the theme.", "error");
    } finally {
      if (!silent) setBusy(false);
    }
  }

  async function loadGrade(currentThemeId = themeId, currentGradeId = gradeId, { silent = false } = {}) {
    if (!currentThemeId || !currentGradeId) return;
    if (!silent) setBusy(true);
    try {
      const result = await requestJson(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}?t=${Date.now()}`);
      setGradeData(result);
      setThemeData((current) => current ? { ...current, curriculum: result.curriculum } : { curriculum: result.curriculum, grades: [] });
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "Unable to load the grade.");
      notify(error?.message || "Unable to load the grade.", "error");
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    if (themeId && gradeId) loadGrade(themeId, gradeId);
    else if (themeId) loadTheme(themeId);
  }, []);

  useEffect(() => {
    function popstate() {
      const params = new URLSearchParams(window.location.search);
      const nextTheme = text(params.get("theme"));
      const nextGrade = text(params.get("grade"));
      setThemeId(nextTheme);
      setGradeId(nextGrade);
      setQuery("");
      if (nextTheme && nextGrade) loadGrade(nextTheme, nextGrade);
      else if (nextTheme) loadTheme(nextTheme);
    }
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);

  async function openTheme(theme) {
    route(text(theme.id), "");
    await loadTheme(text(theme.id));
  }

  async function openGrade(grade) {
    route(themeId, text(grade.id));
    await loadGrade(themeId, text(grade.id));
  }

  async function refreshCurrent() {
    setRefreshing(true);
    try {
      await loadCatalog({ silent: true });
      if (themeId && gradeId) await loadGrade(themeId, gradeId, { silent: true });
      else if (themeId) await loadTheme(themeId, { silent: true });
      notify("Curriculum data was refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  function currentGroupForTheme(item = selectedTheme) {
    return groups.find((group) => text(group.id) === text(item?.curriculum_group_id || item?.groupId));
  }

  async function handleEntitySaved(result, kind, editing) {
    await loadCatalog({ silent: true });
    if (kind === "theme" && themeId) await loadTheme(themeId, { silent: true });
    if (kind === "grade" && themeId) await loadTheme(themeId, { silent: true });
    notify(`${kind[0].toUpperCase()}${kind.slice(1)} ${editing ? "updated" : "created"} successfully.`);
    const created = result?.theme || result?.curriculum || result?.grade;
    if (!editing && kind === "theme" && created?.id) openTheme(created);
    if (!editing && kind === "grade" && created?.id) openGrade(created);
  }

  async function deleteEntity(kind, item) {
    const names = { group: "curriculum and every theme, grade, and file inside it", theme: "theme and every grade and file inside it", grade: "grade and every file inside it" };
    if (!window.confirm(`Delete ${text(item?.name)}? This deletes the ${names[kind]} permanently.`)) return;
    setBusy(true);
    try {
      let url = "";
      if (kind === "group") url = `/api/lms/curriculum/groups/${encodeURIComponent(item.id)}`;
      if (kind === "theme") url = `/api/lms/curriculum/${encodeURIComponent(item.id)}`;
      if (kind === "grade") url = `/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(item.id)}`;
      await requestJson(url, { method: "DELETE" });
      if (kind === "theme" && text(item.id) === themeId) route("", "", { replace: true });
      if (kind === "grade" && text(item.id) === gradeId) route(themeId, "", { replace: true });
      await loadCatalog({ silent: true });
      if (kind === "grade" && themeId) await loadTheme(themeId, { silent: true });
      notify(`${kind[0].toUpperCase()}${kind.slice(1)} deleted.`);
    } catch (error) {
      notify(error?.message || `Unable to delete the ${kind}.`, "error");
    } finally {
      setBusy(false);
    }
  }

  function upsertResource(resource, editing) {
    setGradeData((current) => ({
      ...current,
      resources: editing
        ? (current?.resources || []).map((item) => text(item.id) === text(resource.id) ? resource : item)
        : [resource, ...(current?.resources || [])],
    }));
    notify(editing ? "Curriculum file updated." : "Curriculum file uploaded.");
  }

  async function deleteResource(resource) {
    if (!window.confirm(`Delete ${resource.name || resource.file_name}? The stored file will also be removed.`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/lms/curriculum/${encodeURIComponent(themeId)}/grades/${encodeURIComponent(gradeId)}/resources/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
      setGradeData((current) => ({ ...current, resources: (current?.resources || []).filter((item) => text(item.id) !== text(resource.id)) }));
      notify("Curriculum file deleted.");
    } catch (error) {
      notify(error?.message || "Unable to delete the file.", "error");
    } finally {
      setBusy(false);
    }
  }

  const filteredGroups = useMemo(() => {
    const token = lower(query);
    if (!token) return groups;
    return groups.map((group) => ({
      ...group,
      themes: (Array.isArray(group.themes) ? group.themes : []).filter((theme) => lower(`${theme.name} ${theme.description}`).includes(token)),
    })).filter((group) => lower(`${group.name} ${group.description}`).includes(token) || group.themes.length);
  }, [groups, query]);

  const filteredGrades = useMemo(() => {
    const token = lower(query);
    const rows = Array.isArray(themeData?.grades) ? themeData.grades : [];
    return token ? rows.filter((grade) => lower(`${grade.name} ${grade.description}`).includes(token)) : rows;
  }, [themeData, query]);

  const groupedResources = useMemo(() => {
    const token = lower(query);
    const map = Object.fromEntries(Object.keys(RESOURCE_TYPES).map((key) => [key, []]));
    resources.forEach((resource) => {
      if (!map[resource.resource_type]) return;
      if (token && !lower(`${resource.name} ${resource.file_name} ${resource.notes} ${resource.mime_type}`).includes(token)) return;
      map[resource.resource_type].push(resource);
    });
    return map;
  }, [resources, query]);

  const totalThemes = allThemes.length;
  const currentView = gradeId ? "grade" : themeId ? "theme" : "catalog";
  const currentGroup = currentGroupForTheme();

  return (
    <main className="next-lms-curriculum-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some Curriculum support data could not load.</strong><span>The available folders are shown below.</span><a href="/lms/curriculum">Open classic Curriculum</a></div> : null}
      {loadError ? <div className="dashboard-notice is-warning" role="alert"><strong>Curriculum data needs attention.</strong><span>{loadError}</span><button type="button" onClick={refreshCurrent}>Try again</button></div> : null}

      <section className="next-lms-curriculum-hero">
        <div>
          <span className="next-lms-kicker">LMS CONTENT LIBRARY</span>
          <h2>{currentView === "catalog" ? "Curriculum workspace" : currentView === "theme" ? selectedTheme?.name || "Theme" : selectedGrade?.name || "Grade"}</h2>
          <p>{currentView === "catalog" ? "Organize curricula into themes and grades, then securely publish books, guides, lesson plans, presentations, materials, and exams." : currentView === "theme" ? text(selectedTheme?.description) || "Choose a grade to open its protected learning resources." : text(selectedGrade?.description) || `Resources inside ${selectedTheme?.name || "this theme"}.`}</p>
          <nav className="next-lms-curriculum-breadcrumbs" aria-label="Curriculum breadcrumbs">
            <button type="button" onClick={() => route("", "")}>Curriculum</button>
            {selectedTheme ? <><span>›</span><button type="button" onClick={() => route(themeId, "")}>{selectedTheme.name}</button></> : null}
            {selectedGrade ? <><span>›</span><strong>{selectedGrade.name}</strong></> : null}
          </nav>
        </div>
        <div className="next-lms-curriculum-hero-actions">
          <a href="/next/lms">LMS Overview</a>
          <a href="/lms/curriculum">Classic Curriculum</a>
          <button type="button" onClick={refreshCurrent} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
          {canManage && currentView === "catalog" ? <button type="button" onClick={() => setEntityModal({ kind: "group" })}>+ Add Curriculum</button> : null}
          {canManage && currentView === "theme" ? <button type="button" onClick={() => setEntityModal({ kind: "grade" })}>+ Add Grade</button> : null}
        </div>
      </section>

      {currentView === "catalog" ? (
        <>
          <section className="next-lms-curriculum-summary" aria-label="Curriculum summary">
            <article><small>Curricula</small><strong>{groups.length}</strong><span>Top-level groups</span></article>
            <article><small>Themes</small><strong>{totalThemes}</strong><span>Learning themes</span></article>
            <article><small>Visible folders</small><strong>{filteredGroups.reduce((sum, group) => sum + (group.themes?.length || 0), 0)}</strong><span>Under current search</span></article>
            <article><small>Access</small><strong>{access?.isBuiltInAdmin ? "Admin" : accessLevel(access) || "View"}</strong><span>{canManage ? "Create and manage" : "View only"}</span></article>
          </section>
          <section className="next-lms-curriculum-toolbar">
            <label><span>Search curricula and themes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Curriculum name, theme, description…" /></label>
            <div><strong>{filteredGroups.length}</strong><span>curricula shown</span></div>
          </section>
          <section className="next-lms-curriculum-catalog">
            {filteredGroups.length ? filteredGroups.map((group) => (
              <article className="next-lms-curriculum-group" key={group.id}>
                <header>
                  <div><span className="next-lms-curriculum-group-icon">CR</span><div><h3>{group.name || "Untitled Curriculum"}</h3><p>{group.description || `${group.themes?.length || 0} theme folders`}</p></div></div>
                  {canManage ? <div><button type="button" onClick={() => setEntityModal({ kind: "theme", group })}>+ Add Theme</button><button type="button" onClick={() => setEntityModal({ kind: "group", item: group })}>Edit</button><button type="button" onClick={() => deleteEntity("group", group)}>Delete</button></div> : null}
                </header>
                <div className="next-lms-curriculum-folder-grid">
                  {group.themes?.length ? group.themes.map((theme) => <FolderCard key={theme.id} item={theme} kind="theme" onOpen={openTheme} onEdit={(item) => setEntityModal({ kind: "theme", item, group })} onDelete={(item) => deleteEntity("theme", item)} canManage={canManage} />) : <EmptyState title="No themes yet" message="Create the first theme inside this curriculum." action={canManage ? <button type="button" onClick={() => setEntityModal({ kind: "theme", group })}>Add Theme</button> : null} />}
                </div>
              </article>
            )) : <EmptyState title="No curricula match your search" message="Try another keyword or clear the search field." action={<button type="button" onClick={() => setQuery("")}>Clear search</button>} />}
          </section>
        </>
      ) : null}

      {currentView === "theme" ? (
        <>
          <section className="next-lms-curriculum-detail-summary">
            <article><small>Curriculum</small><strong>{currentGroup?.name || "General"}</strong><span>Parent group</span></article>
            <article><small>Grades</small><strong>{themeData?.grades?.length || 0}</strong><span>Folders in this theme</span></article>
            <article><small>Created</small><strong>{formatDate(selectedTheme?.created_at)}</strong><span>Theme record date</span></article>
          </section>
          <section className="next-lms-curriculum-toolbar">
            <label><span>Search grades</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Grade name or description…" /></label>
            <div><strong>{filteredGrades.length}</strong><span>grades shown</span></div>
          </section>
          {busy && !themeData ? <div className="next-lms-curriculum-inline-loading"><span /><strong>Loading grades…</strong></div> : null}
          <section className="next-lms-curriculum-folder-grid next-lms-curriculum-grade-grid">
            {filteredGrades.length ? filteredGrades.map((grade) => <FolderCard key={grade.id} item={grade} kind="grade" onOpen={openGrade} onEdit={(item) => setEntityModal({ kind: "grade", item })} onDelete={(item) => deleteEntity("grade", item)} canManage={canManage} />) : !busy ? <EmptyState title="No grades found" message={query ? "Clear the search or try another grade name." : "Create the first grade inside this theme."} action={canManage ? <button type="button" onClick={() => setEntityModal({ kind: "grade" })}>Add Grade</button> : null} /> : null}
          </section>
        </>
      ) : null}

      {currentView === "grade" ? (
        <>
          <section className="next-lms-curriculum-detail-summary next-lms-curriculum-resource-summary">
            <article><small>Files</small><strong>{resources.length}</strong><span>Protected resources</span></article>
            <article><small>Storage</small><strong>{formatBytes(resources.reduce((sum, item) => sum + number(item.file_size), 0))}</strong><span>Total recorded size</span></article>
            <article><small>Resource types</small><strong>{Object.values(groupedResources).filter((items) => items.length).length}</strong><span>Populated categories</span></article>
            <article><small>Theme</small><strong>{selectedTheme?.name || "Theme"}</strong><span>Parent folder</span></article>
          </section>
          <section className="next-lms-curriculum-toolbar">
            <label><span>Search files</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="File name, notes, format…" /></label>
            <div><strong>{Object.values(groupedResources).reduce((sum, items) => sum + items.length, 0)}</strong><span>files shown</span></div>
          </section>
          {busy && !gradeData ? <div className="next-lms-curriculum-inline-loading"><span /><strong>Loading resources…</strong></div> : null}
          <section className="next-lms-resource-sections">
            {Object.entries(RESOURCE_TYPES).map(([type, config]) => (
              <article className="next-lms-resource-section" key={type}>
                <header><div><span>{config.short}</span><div><h3>{config.label}</h3><p>{groupedResources[type].length} file{groupedResources[type].length === 1 ? "" : "s"}</p></div></div>{canManage ? <button type="button" onClick={() => setResourceModal({ type })}>+ Add {config.label}</button> : null}</header>
                <div className="next-lms-resource-grid">
                  {groupedResources[type].length ? groupedResources[type].map((resource) => <ResourceCard key={resource.id} resource={resource} type={type} canManage={canManage} onView={setViewerResource} onEdit={(item) => setResourceModal({ type, item })} onDelete={deleteResource} />) : <EmptyState title={`No ${config.label.toLowerCase()} files`} message={query ? "No files in this category match the current search." : `Upload the first ${config.label.toLowerCase()} file for this grade.`} action={canManage && !query ? <button type="button" onClick={() => setResourceModal({ type })}>Add {config.label}</button> : null} />}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {entityModal ? <EntityModal {...entityModal} themeId={themeId} onClose={() => setEntityModal(null)} onSaved={handleEntitySaved} /> : null}
      {resourceModal ? <ResourceModal themeId={themeId} gradeId={gradeId} {...resourceModal} onClose={() => setResourceModal(null)} onSaved={upsertResource} /> : null}
      {viewerResource ? <ResourceViewer themeId={themeId} gradeId={gradeId} resource={viewerResource} onClose={() => setViewerResource(null)} /> : null}
      {busy ? <div className="next-lms-curriculum-busy" aria-hidden="true"><span /></div> : null}
    </main>
  );
}
