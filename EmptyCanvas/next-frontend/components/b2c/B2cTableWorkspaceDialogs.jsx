"use client";

import { useState } from "react";

const READ_ONLY_TYPES = new Set(["formula"]);

function text(value) { return String(value ?? "").trim(); }
function fieldOptions(field) { return field?.options && typeof field.options === "object" ? field.options : {}; }

function Modal({ title, subtitle, badge = "DB", wide = false, danger = false, onClose, children }) {
  return (
    <div className="b2c-overlay next-b2c-classic-overlay" role="presentation" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget || event.target.classList.contains("b2c-overlay__backdrop")) onClose(); }}>
      <div className="b2c-overlay__backdrop" />
      <section className={`b2c-dialog ${wide ? "next-b2c-classic-dialog-wide" : "b2c-dialog--customer"} ${danger ? "next-b2c-classic-dialog-danger" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <button className="b2c-dialog__close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="b2c-dialog__header">
          <span className="b2c-eyebrow">{badge}</span>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="next-b2c-table-modal__body">{children}</div>
      </section>
    </div>
  );
}

function preloadB2cUpload() {
  void import("../../lib/b2c-direct-upload");
}

async function uploadFiles(files, onProgress = () => {}) {
  const { uploadB2cFile } = await import("../../lib/b2c-direct-upload");
  const list = Array.from(files || []);
  const uploaded = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    const result = await uploadB2cFile(file, (progress) => onProgress({ index, total: list.length, file: file.name, ...progress }));
    if (result?.url) uploaded.push(result);
  }
  return uploaded;
}

export function RecordEditor({ record, fields, busy, onClose, onSave }) {
  const [values, setValues] = useState(() => ({ ...(record?.values || {}) }));
  const [files, setFiles] = useState(() => Object.fromEntries(fields.filter((field) => field.type === "files").map((field) => [field.key, Array.isArray(record?.values?.[field.key]) ? [...record.values[field.key]] : []])));
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const addFiles = async (field, selected) => {
    setError("");
    try {
      setUploading(field.key);
      const uploaded = await uploadFiles(selected, ({ file }) => setUploading(`${field.key}:${file}`));
      setFiles((current) => ({ ...current, [field.key]: [...(current[field.key] || []), ...uploaded].slice(0, 20) }));
    } catch (uploadError) { setError(uploadError?.message || "The files could not be uploaded."); }
    finally { setUploading(""); }
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const payload = {};
    for (const field of fields) {
      if (READ_ONLY_TYPES.has(field.type)) continue;
      if (field.type === "files") payload[field.key] = files[field.key] || [];
      else payload[field.key] = values[field.key] ?? (field.type === "checkbox" ? false : "");
    }
    try { await onSave(payload); }
    catch (saveError) { setError(saveError?.message || "The record could not be saved."); }
  };

  return (
    <Modal title={`Edit ${record.customerCode}`} subtitle="Update the saved values without changing the table schema." badge="REC" wide onClose={onClose}>
      <form className="next-b2c-record-form" onSubmit={submit}>
        <div className="next-b2c-record-form__grid">
          {fields.map((field) => {
            const value = values[field.key];
            if (field.type === "formula") return <div className="next-b2c-record-control" key={field.id || field.key}><span>{field.label}</span><div className="next-b2c-record-readonly">Calculated automatically by the table formula.</div></div>;
            if (field.type === "files") return (
              <label className="next-b2c-record-control is-wide" key={field.id || field.key}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                <input type="file" multiple onMouseEnter={preloadB2cUpload} onFocus={preloadB2cUpload} onChange={(event) => addFiles(field, event.target.files)} disabled={Boolean(uploading)} />
                <small>{uploading.startsWith(field.key) ? `Uploading ${uploading.split(":")[1] || "files"}…` : "Photos, PDFs, or files up to 10 MB each."}</small>
                <div className="next-b2c-record-file-list">
                  {(files[field.key] || []).map((file, index) => <div key={`${file?.url}-${index}`}><a href={file?.url || "#"} target="_blank" rel="noreferrer">{text(file?.name) || "Attachment"}</a><button type="button" onClick={() => setFiles((current) => ({ ...current, [field.key]: (current[field.key] || []).filter((_, position) => position !== index) }))}>Remove</button></div>)}
                </div>
              </label>
            );
            if (field.type === "checkbox") return <label className="next-b2c-record-control next-b2c-record-checkbox" key={field.id || field.key}><span>{field.label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => update(field.key, event.target.checked)} /><b>Yes</b></label>;
            if (field.type === "select") return <label className="next-b2c-record-control" key={field.id || field.key}><span>{field.label}{field.required ? " *" : ""}</span><select required={field.required} value={value ?? ""} onChange={(event) => update(field.key, event.target.value)}><option value="">Select…</option>{(fieldOptions(field).options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
            if (field.type === "multi_select") return <label className="next-b2c-record-control" key={field.id || field.key}><span>{field.label}{field.required ? " *" : ""}</span><select multiple required={field.required} value={Array.isArray(value) ? value : []} onChange={(event) => update(field.key, Array.from(event.target.selectedOptions).map((option) => option.value))}>{(fieldOptions(field).options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
            const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";
            return <label className="next-b2c-record-control" key={field.id || field.key}><span>{field.label}{field.required ? " *" : ""}</span><input type={inputType} step={field.type === "number" ? "any" : undefined} required={field.required} value={value ?? ""} onChange={(event) => update(field.key, event.target.value)} /></label>;
          })}
        </div>
        {error ? <div className="next-b2c-table-error">{error}</div> : null}
        <footer><button type="button" className="next-b2c-table-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="next-b2c-table-btn primary" disabled={busy || Boolean(uploading)}>{busy ? "Saving…" : "Save Record"}</button></footer>
      </form>
    </Modal>
  );
}

export function DeleteRecordModal({ record, busy, onClose, onConfirm }) {
  const [confirmation, setConfirmation] = useState("");
  const matches = text(confirmation).toLowerCase() === "delete";
  return (
    <Modal title={`Delete ${record.customerCode}?`} subtitle="This record and all of its saved values will be permanently removed." badge="!" danger onClose={onClose}>
      <div className="next-b2c-delete-record">
        <p>Type <strong>DELETE</strong> to confirm.</p>
        <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <footer><button type="button" className="next-b2c-table-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="next-b2c-table-btn danger" onClick={onConfirm} disabled={busy || !matches}>{busy ? "Deleting…" : "Delete Permanently"}</button></footer>
      </div>
    </Modal>
  );
}
