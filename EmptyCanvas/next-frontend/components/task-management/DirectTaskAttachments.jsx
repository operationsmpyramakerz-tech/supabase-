"use client";

import { useRef } from "react";

function FileIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "upload" ? <><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></> : name === "close" ? <path d="m6 6 12 12M18 6 6 18"/> : name === "download" ? <><path d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/></> : <><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/></>}</svg>;
}
function sizeLabel(size) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(Number(size) / 1024) || 1)} KB`;
}

export function DirectTaskFiles({ files = [], disabled = false, onRemove = null }) {
  if (!files.length) return null;
  return <div className="tm-upload-field tm-direct-attachment-list">
    {files.map(file => <div className="tm-upload-file" key={file.url}>
      <span className="tm-upload-file__icon"><FileIcon name="file"/></span>
      <span className="tm-upload-file__info"><b title={file.name}>{file.name || "Attachment"}</b><small>{sizeLabel(file.size)}</small></span>
      {onRemove ? <button type="button" className="tm-upload-file__remove" disabled={disabled} onClick={() => onRemove(file.url)} aria-label={`Remove ${file.name}`}><FileIcon name="close"/></button> : <a className="tm-upload-file__open" href={`${file.url}${file.url.includes("?") ? "&" : "?"}download=1`} target="_blank" rel="noopener noreferrer" aria-label={`Download ${file.name}`}><FileIcon name="download"/></a>}
    </div>)}
  </div>;
}

// Keep the Workflow upload field visual, with a real keyboard-accessible
// button and a native multi-file picker.
export function DirectTaskAttachmentPicker({ files, uploading, progress, disabled, onChoose, onRemove, error }) {
  const input = useRef(null);
  return <div className="tm-create-select-field tm-direct-attachments">
    <span>Attachments</span>
    <div className="tm-upload-field">
      <input ref={input} type="file" multiple hidden aria-label="Task attachment files" disabled={disabled || uploading} onChange={event => { const chosen = Array.from(event.target.files || []); event.target.value = ""; onChoose(chosen); }}/>
      <button type="button" className="tm-upload-field__picker" disabled={disabled || uploading || files.length >= 20} onClick={() => input.current?.click()}>
        <span className="tm-upload-field__icon"><FileIcon name="upload"/></span>
        <span className="tm-upload-field__copy"><b>{uploading ? "Uploading…" : "Upload files"}</b><small>Maximum 10 MB per file</small></span>
        <span className="tm-upload-field__action">Choose files</span>
      </button>
      {uploading && <div className="tm-upload-progress" role="status"><span aria-hidden="true"/>{progress}</div>}
      <DirectTaskFiles files={files} disabled={disabled || uploading} onRemove={onRemove}/>
      {error && <p className="tm-direct-error" role="alert">{error}</p>}
    </div>
  </div>;
}
