"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const FIELD_TYPES = [
  ["text", "Text"], ["number", "Number"], ["select", "Select"], ["multi_select", "Multi-select"],
  ["date", "Date"], ["files", "Files & media"], ["checkbox", "Checkbox"], ["url", "URL"],
  ["email", "Email"], ["phone", "Phone"], ["formula", "Formula"], ["place", "Place"],
];
const TYPE_LABELS = Object.fromEntries(FIELD_TYPES);
const SELECT_TYPES = new Set(["select", "multi_select"]);
const READ_ONLY_TYPES = new Set(["formula"]);
const FORMULA_CATEGORIES = ["All", "Logic", "Math", "Text", "Date"];

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value) { return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 12 }).format(number(value)); }
function formatDate(value, withTime = false) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}
function isImage(file) { return /^image\//i.test(text(file?.type)) || /\.(png|jpe?g|gif|webp|svg)$/i.test(text(file?.name)); }
function fieldOptions(field) { return field?.options && typeof field.options === "object" ? field.options : {}; }
function normalizeField(field, index = 0) {
  const type = FIELD_TYPES.some(([key]) => key === field?.type) ? field.type : "text";
  return {
    id: text(field?.id), key: text(field?.key), label: text(field?.label) || "Untitled property", type,
    required: Boolean(field?.required), sortOrder: index + 1,
    options: { options: Array.isArray(fieldOptions(field).options) ? fieldOptions(field).options.map(text).filter(Boolean) : [], formula: text(fieldOptions(field).formula) || null },
  };
}
function normalizeRecord(record, index = 0) {
  return {
    id: text(record?.id) || `record-${index}`, customerCode: text(record?.customerCode) || `REC-${String(index + 1).padStart(5, "0")}`,
    values: record?.values && typeof record.values === "object" ? record.values : {},
    formulaValues: record?.formulaValues && typeof record.formulaValues === "object" ? record.formulaValues : {},
    formulaErrors: record?.formulaErrors && typeof record.formulaErrors === "object" ? record.formulaErrors : {},
    createdByName: text(record?.createdByName) || "—", createdAt: record?.createdAt || null, updatedAt: record?.updatedAt || null,
  };
}
function apiErrorMessage(body, fallback) { return text(body?.error || body?.message) || fallback; }
async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include", cache: "no-store", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, `Request failed (${response.status}).`));
  return body;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}
async function uploadFiles(files, onProgress = () => {}) {
  const list = Array.from(files || []);
  const uploaded = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
    onProgress({ index, total: list.length, file: file.name });
    const dataUrl = await fileToDataUrl(file);
    const payload = await requestJson("/api/b2c/upload", {
      method: "POST",
      body: JSON.stringify({ dataUrl, filename: file.name, mime: file.type, size: file.size }),
    });
    if (payload?.file?.url) uploaded.push(payload.file);
  }
  return uploaded;
}
function loadFormulaEngine() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.B2CFormulaEngine) return Promise.resolve(window.B2CFormulaEngine);
  const existing = document.querySelector('script[data-next-b2c-formula-engine="true"]');
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", () => resolve(window.B2CFormulaEngine || null), { once: true });
    existing.addEventListener("error", () => reject(new Error("Formula engine failed to load.")), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/js/b2c-formula-engine.js";
    script.async = true;
    script.dataset.nextB2cFormulaEngine = "true";
    script.onload = () => resolve(window.B2CFormulaEngine || null);
    script.onerror = () => reject(new Error("Formula engine failed to load."));
    document.head.appendChild(script);
  });
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-b2c-table-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "B2C Table"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}
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
function EmptyValue() { return <span className="b2c-cell-muted">—</span>; }
function FormulaValue({ record, field, engine }) {
  const expression = text(fieldOptions(field).formula);
  if (!expression) return <span className="b2c-cell-muted">No formula</span>;
  let value = record.formulaValues?.[field.key];
  let error = text(record.formulaErrors?.[field.key]);
  if (!Object.prototype.hasOwnProperty.call(record.formulaValues || {}, field.key) && engine?.calculateFormulaValues) {
    const calculated = engine.calculateFormulaValues([field], record.values || {});
    value = calculated?.values?.[field.key];
    error = text(calculated?.errors?.[field.key]);
  }
  if (error) return <span className="next-b2c-table-formula-error" title={error}>Formula error</span>;
  return <span className="next-b2c-table-formula" title={expression}>{engine?.display ? engine.display(value) : (value == null || value === "" ? "—" : String(value))}</span>;
}
function CellValue({ value, field, record, engine }) {
  if (field.type === "formula") return <FormulaValue record={record} field={field} engine={engine} />;
  if (field.type === "files") {
    const files = Array.isArray(value) ? value : [];
    if (!files.length) return <EmptyValue />;
    return <div className="b2c-file-pills next-b2c-table-files">{files.slice(0, 4).map((file, index) => <a key={`${file?.url}-${index}`} href={file?.url || "#"} target="_blank" rel="noreferrer"><span>{isImage(file) ? "IMG" : "FILE"}</span>{text(file?.name) || "Attachment"}</a>)}{files.length > 4 ? <em>+{files.length - 4}</em> : null}</div>;
  }
  if (field.type === "checkbox") return value ? <span className="b2c-check-yes">✓ Yes</span> : <EmptyValue />;
  if (field.type === "multi_select") {
    const list = Array.isArray(value) ? value : [];
    return list.length ? <div className="b2c-tag-list next-b2c-table-tags">{list.map((item) => <span className="b2c-tag" key={item}>{item}</span>)}</div> : <EmptyValue />;
  }
  if (value == null || value === "") return <EmptyValue />;
  if (field.type === "number") return <span>{formatNumber(value)}</span>;
  if (field.type === "email") return <a href={`mailto:${value}`}>{value}</a>;
  if (field.type === "phone") return <a href={`tel:${String(value).replace(/[^+0-9]/g, "")}`}>{value}</a>;
  if (field.type === "url") return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
  return <span title={String(value)}>{String(value)}</span>;
}

function RecordEditor({ record, fields, busy, onClose, onSave }) {
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
                <input type="file" multiple onChange={(event) => addFiles(field, event.target.files)} disabled={Boolean(uploading)} />
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

function FormulaBuilder({ fieldIndex, draft, records, engine, onClose, onApply }) {
  const active = draft[fieldIndex];
  const [expression, setExpression] = useState(text(active?.options?.formula));
  const [category, setCategory] = useState("All");
  const [recordId, setRecordId] = useState(records[0]?.id || "");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const available = draft.filter((_, index) => index !== fieldIndex);
  const functions = Array.isArray(engine?.FUNCTIONS) ? engine.FUNCTIONS.filter((item) => category === "All" || item.category === category) : [];
  const recipes = Array.isArray(engine?.RECIPES) ? engine.RECIPES : [];
  const selectedRecord = records.find((record) => record.id === recordId) || records[0];

  const preview = useMemo(() => {
    if (!expression) return { value: "—", message: "Add a formula to see a live preview.", valid: true };
    if (!engine?.calculateFormulaValues) return { value: "—", message: "The formula engine is loading. The server will validate the expression when saved.", valid: true };
    const fields = draft.map((item, index) => ({ ...item, key: item.key || `draft_property_${index + 1}`, options: { ...(item.options || {}) } }));
    fields[fieldIndex].options.formula = expression;
    const sample = {};
    fields.forEach((field, index) => {
      if (field.type === "number") sample[field.key] = (index + 1) * 10;
      else if (field.type === "checkbox") sample[field.key] = true;
      else if (field.type === "date") sample[field.key] = new Date().toISOString().slice(0, 10);
      else if (field.type === "select") sample[field.key] = fieldOptions(field).options?.[0] || "Sample";
      else if (field.type === "multi_select") sample[field.key] = fieldOptions(field).options?.slice(0, 1) || ["Sample"];
      else sample[field.key] = `Sample ${field.label}`;
    });
    const calculated = engine.calculateFormulaValues(fields, selectedRecord?.values || sample);
    const key = fields[fieldIndex].key;
    const formulaError = text(calculated?.errors?.[key]);
    return formulaError ? { value: "Formula error", message: formulaError, valid: false } : { value: engine.display(calculated?.values?.[key]), message: selectedRecord ? `Preview uses ${selectedRecord.customerCode}.` : "Preview uses sample values.", valid: true };
  }, [draft, engine, expression, fieldIndex, selectedRecord]);

  const insert = (token) => {
    const input = inputRef.current;
    if (!input) return setExpression((current) => `${current}${token}`);
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = `${expression.slice(0, start)}${token}${expression.slice(end)}`;
    setExpression(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + token.length, start + token.length); });
  };
  const apply = () => {
    const validation = engine?.expressionInfo ? engine.expressionInfo(expression) : { ok: true };
    if (expression && !validation?.ok) return setError(validation?.error || "Check the formula expression.");
    onApply(expression);
  };

  return (
    <Modal title={`Formula: ${active?.label || "Property"}`} subtitle="Build a safe calculation from properties, operators, functions, and recipes." badge="ƒx" wide onClose={onClose}>
      <div className="next-b2c-formula-builder">
        <section className="next-b2c-formula-recipes"><header><strong>Recipes</strong><span>Start with a common calculation.</span></header><div>{recipes.map((recipe) => <button type="button" key={recipe.id} onClick={() => setExpression(recipe.expression)}><b>{recipe.label}</b><small>{recipe.hint}</small></button>)}</div></section>
        <div className="next-b2c-formula-layout">
          <section className="next-b2c-formula-editor">
            <div className="next-b2c-formula-toolbar">{[" + ", " - ", " * ", " / ", "(", ")", " == ", " != ", " > ", " < "].map((token) => <button type="button" key={token} onClick={() => insert(token)}>{token.trim()}</button>)}</div>
            <textarea ref={inputRef} value={expression} onChange={(event) => setExpression(event.target.value)} placeholder={'Example: prop("Quantity") * prop("Unit price")'} spellCheck={false} />
            <div className={`next-b2c-formula-result ${preview.valid ? "is-valid" : "is-error"}`}><span>Live result</span><strong>{preview.value}</strong><small>{preview.message}</small></div>
            {records.length ? <label className="next-b2c-formula-test"><span>Test with saved record</span><select value={recordId} onChange={(event) => setRecordId(event.target.value)}>{records.map((record) => <option key={record.id} value={record.id}>{record.customerCode}</option>)}</select></label> : null}
          </section>
          <aside className="next-b2c-formula-palette">
            <section><header><strong>Properties</strong></header><div>{available.length ? available.map((field) => <button type="button" key={field.id || field.label} onClick={() => insert(`prop(${JSON.stringify(field.label)})`)}><b>{field.label}</b><small>{TYPE_LABELS[field.type] || field.type}</small></button>) : <p>Add another property first.</p>}</div></section>
            <section><header><strong>Functions</strong><nav>{FORMULA_CATEGORIES.map((item) => <button type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</nav></header><div>{functions.map((item) => <button type="button" key={item.id} onClick={() => insert(item.insert)}><b>{item.label}</b><small>{item.hint}</small></button>)}</div></section>
          </aside>
        </div>
        {error ? <div className="next-b2c-table-error">{error}</div> : null}
        <footer><button type="button" className="next-b2c-table-btn secondary" onClick={onClose}>Cancel</button><button type="button" className="next-b2c-table-btn primary" onClick={apply}>Apply Formula</button></footer>
      </div>
    </Modal>
  );
}

function SchemaBuilder({ fields, records, engine, busy, onClose, onSave }) {
  const [draft, setDraft] = useState(() => fields.map(normalizeField));
  const [formulaIndex, setFormulaIndex] = useState(-1);
  const [error, setError] = useState("");
  const dragIndex = useRef(-1);

  const update = (index, patch) => setDraft((current) => current.map((field, position) => position === index ? { ...field, ...patch } : field));
  const updateOptions = (index, patch) => setDraft((current) => current.map((field, position) => position === index ? { ...field, options: { ...(field.options || {}), ...patch } } : field));
  const add = () => setDraft((current) => [...current, normalizeField({ label: "New property", type: "text", required: false }, current.length)]);
  const remove = (index) => {
    const field = draft[index];
    if (!window.confirm(`Remove “${field.label}” from this table schema? Existing values for this property may be removed after saving.`)) return;
    setDraft((current) => current.filter((_, position) => position !== index));
  };
  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
    setDraft((current) => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  };
  const save = async () => {
    const normalized = draft.map((field, index) => ({ ...field, label: text(field.label), sortOrder: index + 1, options: { options: SELECT_TYPES.has(field.type) ? [...new Set((field.options?.options || []).map(text).filter(Boolean))].slice(0, 100) : [], formula: field.type === "formula" ? text(field.options?.formula) || null : null } }));
    if (normalized.some((field) => !field.label)) return setError("Every property needs a name.");
    const removed = fields.filter((field) => !normalized.some((item) => item.id && item.id === field.id));
    if (removed.length && !window.confirm(`${removed.length} saved propert${removed.length === 1 ? "y is" : "ies are"} being removed. Existing values may be lost. Continue?`)) return;
    if (engine?.expressionInfo) {
      for (const field of normalized) {
        if (field.type === "formula" && field.options?.formula) {
          const result = engine.expressionInfo(field.options.formula);
          if (!result?.ok) return setError(`Formula in “${field.label}” is invalid: ${result?.error || "check the expression."}`);
        }
      }
    }
    setError("");
    try { await onSave(normalized); }
    catch (saveError) { setError(saveError?.message || "The table properties could not be saved."); }
  };

  return (
    <>
      <Modal title="Configure Table Properties" subtitle="Create, reorder, and configure the schema used by this database and its linked forms." badge="COL" wide onClose={onClose}>
        <div className="next-b2c-schema-builder">
          <div className="next-b2c-schema-list">
            {draft.length ? draft.map((field, index) => (
              <article className="next-b2c-schema-card" key={field.id || `draft-${index}`} draggable onDragStart={() => { dragIndex.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { move(dragIndex.current, index); dragIndex.current = -1; }}>
                <div className="next-b2c-schema-order"><span>{index + 1}</span><button type="button" title="Move up" onClick={() => move(index, index - 1)} disabled={index === 0}>↑</button><button type="button" title="Move down" onClick={() => move(index, index + 1)} disabled={index === draft.length - 1}>↓</button></div>
                <label><span>Property name</span><input value={field.label} onChange={(event) => update(index, { label: event.target.value })} maxLength={120} /></label>
                <label><span>Type</span><select value={field.type} onChange={(event) => { const type = event.target.value; update(index, { type, options: { ...(field.options || {}), options: SELECT_TYPES.has(type) ? field.options?.options || [] : [], formula: type === "formula" ? field.options?.formula || null : null } }); }}>{FIELD_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="next-b2c-schema-required"><input type="checkbox" checked={field.required} onChange={(event) => update(index, { required: event.target.checked })} /><span>Required</span></label>
                <button type="button" className="next-b2c-schema-delete" onClick={() => remove(index)}>Delete</button>
                {SELECT_TYPES.has(field.type) ? <label className="next-b2c-schema-options"><span>Choices — one per line</span><textarea value={(field.options?.options || []).join("\n")} onChange={(event) => updateOptions(index, { options: event.target.value.split(/\r?\n/) })} placeholder={'Option 1\nOption 2'} /></label> : null}
                {field.type === "formula" ? <div className="next-b2c-schema-formula"><div><strong>Formula</strong><span>{text(field.options?.formula) || "No formula configured."}</span></div><button type="button" onClick={() => setFormulaIndex(index)}>Open Builder</button></div> : null}
              </article>
            )) : <div className="next-b2c-schema-empty">No properties yet. Add the first property below.</div>}
          </div>
          <button type="button" className="next-b2c-schema-add" onClick={add}>+ Add Property</button>
          {error ? <div className="next-b2c-table-error">{error}</div> : null}
          <footer><button type="button" className="next-b2c-table-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="next-b2c-table-btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Table Properties"}</button></footer>
        </div>
      </Modal>
      {formulaIndex >= 0 ? <FormulaBuilder fieldIndex={formulaIndex} draft={draft} records={records} engine={engine} onClose={() => setFormulaIndex(-1)} onApply={(formula) => { updateOptions(formulaIndex, { formula }); setFormulaIndex(-1); }} /> : null}
    </>
  );
}

function DeleteRecordModal({ record, busy, onClose, onConfirm }) {
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

export default function B2cTableWorkspaceClient({ databaseId, initialPayload, bootstrapWarnings = [] }) {
  const [database, setDatabase] = useState(initialPayload?.database || null);
  const [fields, setFields] = useState(() => (Array.isArray(initialPayload?.fields) ? initialPayload.fields : []).map(normalizeField));
  const [records, setRecords] = useState(() => (Array.isArray(initialPayload?.records) ? initialPayload.records : []).map(normalizeRecord));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [formulaEngine, setFormulaEngine] = useState(null);

  useEffect(() => { loadFormulaEngine().then(setFormulaEngine).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [query, sort, pageSize]);
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search B2C records...";
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => { input.removeEventListener("input", handle); input.value = ""; input.placeholder = "Search"; };
  }, []);

  const stats = useMemo(() => ({
    fields: fields.length,
    records: records.length,
    forms: database?.defaultFormId ? 1 : 0,
    formulas: fields.filter((field) => field.type === "formula").length,
    required: fields.filter((field) => field.required).length,
  }), [database, fields, records]);

  const filteredRecords = useMemo(() => {
    const needle = lower(query);
    const list = records.filter((record) => {
      if (!needle) return true;
      const parts = [record.customerCode, record.createdByName];
      for (const field of fields) {
        const value = field.type === "formula" ? record.formulaValues?.[field.key] : record.values?.[field.key];
        if (Array.isArray(value)) parts.push(value.map((item) => item?.name || item?.url || item).join(" "));
        else parts.push(value);
      }
      return lower(parts.join(" ")).includes(needle);
    });
    return [...list].sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (sort === "id-asc") return a.customerCode.localeCompare(b.customerCode, undefined, { numeric: true });
      if (sort === "id-desc") return b.customerCode.localeCompare(a.customerCode, undefined, { numeric: true });
      if (sort === "updated") return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [fields, query, records, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRecords = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);
  const notify = (message, type = "success", title = "B2C Table") => setToast({ message, type, title });

  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setBusy("refresh");
    try {
      const payload = await requestJson(`/api/b2c/databases/${encodeURIComponent(databaseId)}/records`);
      setDatabase(payload.database || null);
      setFields((Array.isArray(payload.fields) ? payload.fields : []).map(normalizeField));
      setRecords((Array.isArray(payload.records) ? payload.records : []).map(normalizeRecord));
      if (!silent) notify("Table records and properties were refreshed.");
    } catch (error) { notify(error?.message || "The table could not be refreshed.", "error"); throw error; }
    finally { if (!silent) setBusy(""); }
  };
  const saveRecord = async (values) => {
    if (!editor) return;
    setBusy("record");
    try {
      await requestJson(`/api/b2c/records/${encodeURIComponent(editor.id)}`, { method: "PATCH", body: JSON.stringify({ databaseId, values }) });
      setEditor(null);
      await refresh({ silent: true });
      notify(`${editor.customerCode} was updated.`);
    } finally { setBusy(""); }
  };
  const deleteRecord = async () => {
    if (!deleteTarget) return;
    setBusy("delete-record");
    try {
      await requestJson(`/api/b2c/records/${encodeURIComponent(deleteTarget.id)}?databaseId=${encodeURIComponent(databaseId)}`, { method: "DELETE" });
      const code = deleteTarget.customerCode;
      setRecords((current) => current.filter((record) => record.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify(`${code} was permanently deleted.`);
    } catch (error) { notify(error?.message || "The record could not be deleted.", "error"); }
    finally { setBusy(""); }
  };
  const saveSchema = async (nextFields) => {
    setBusy("schema");
    try {
      await requestJson(`/api/b2c/databases/${encodeURIComponent(databaseId)}/fields`, { method: "PUT", body: JSON.stringify({ fields: nextFields }) });
      setSchemaOpen(false);
      await refresh({ silent: true });
      notify("Table properties were saved and linked forms were synchronized.");
    } finally { setBusy(""); }
  };

  const formHref = database?.defaultFormId ? `/next/b2c/forms?form=${encodeURIComponent(database.defaultFormId)}` : `/next/b2c/forms?database=${encodeURIComponent(databaseId)}`;
  const exportHref = `/api/b2c/databases/${encodeURIComponent(databaseId)}/export.xlsx`;

  return (
    <main className="b2c-shell next-b2c-table-classic-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="next-b2c-classic-warning"><strong>Some workspace resources were delayed.</strong><span>Refresh the table or use the Classic workspace while the service recovers.</span><a href={`/b2c/database/${encodeURIComponent(databaseId)}?classic=1`}>Classic workspace</a></div> : null}

      <section className="b2c-table-workspace" aria-label={database?.name || "B2C Table"}>
        <div className="b2c-table-view-head b2c-table-view-head--compact">
          <a className="b2c-back-to-library" href="/next/b2c/database"><span aria-hidden="true">←</span><span>All Databases</span></a>
          <div className="b2c-top-actions">
            <a className="b2c-secondary-btn" href={formHref}>Open Linked Form</a>
            <button type="button" className="b2c-secondary-btn" onClick={() => refresh()} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
            <a className="b2c-secondary-btn" href={exportHref}>Download Excel</a>
            <button type="button" className="b2c-primary-btn" onClick={() => setSchemaOpen(true)}>Configure Table</button>
          </div>
        </div>

        <div className="next-b2c-table-classic-title">
          <div><span className="b2c-eyebrow">B2C data table</span><h2>{database?.name || "B2C Table"}</h2><p>{database?.description || "Manage this table’s properties, customer records, linked form, formulas, and Excel export."}</p></div>
          <span className="next-b2c-table-classic-key">{database?.key || "Independent table"}</span>
        </div>

        <div className="b2c-table-insights">
          <article><span className="next-b2c-insight-icon">P</span><div><small>Properties</small><strong>{stats.fields}</strong></div></article>
          <article><span className="is-green next-b2c-insight-icon">R</span><div><small>Records</small><strong>{stats.records}</strong></div></article>
          <article><span className="is-orange next-b2c-insight-icon">F</span><div><small>Linked form</small><strong>{stats.forms ? "Available" : "—"}</strong></div></article>
        </div>

        <section className="b2c-detail-table-panel">
          <div className="next-b2c-table-classic-controls">
            <div><span>{filteredRecords.length} of {records.length} records</span>{query ? <button type="button" onClick={() => { setQuery(""); const input = document.querySelector(".classic-app-shell .main-header .searchbar input"); if (input) input.value = ""; }}>Clear search</button> : null}</div>
            <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest created</option><option value="oldest">Oldest created</option><option value="updated">Recently updated</option><option value="id-asc">Record ID A–Z</option><option value="id-desc">Record ID Z–A</option></select></label>
            <label><span>Rows</span><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
          </div>
          <div className="b2c-table-scroll b2c-table-scroll--wide">
            <table className="b2c-customer-table b2c-customer-table--wide">
              <thead><tr><th>Record ID</th>{fields.map((field) => <th key={field.id || field.key}>{field.label}</th>)}<th>Submitted by</th><th>Created</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {!fields.length ? <tr><td colSpan={5} className="b2c-table-empty">This table has no properties yet. Select <strong>Configure Table</strong> to build its schema.</td></tr> : null}
                {fields.length && !visibleRecords.length ? <tr><td colSpan={fields.length + 4} className="b2c-table-empty">{query ? "No records match this search." : "No records yet. Open the linked form to create the first record."}</td></tr> : null}
                {visibleRecords.map((record) => <tr key={record.id}><td><span className="b2c-customer-code">{record.customerCode}</span></td>{fields.map((field) => <td key={`${record.id}-${field.id || field.key}`}><CellValue value={record.values?.[field.key]} field={field} record={record} engine={formulaEngine} /></td>)}<td>{record.createdByName}</td><td className="b2c-cell-muted">{formatDate(record.createdAt, true)}</td><td><div className="b2c-table-actions"><button type="button" className="b2c-icon-btn" title="Edit record" onClick={() => setEditor(record)}>Edit</button><button type="button" className="b2c-icon-btn b2c-icon-btn--danger" title="Delete record" onClick={() => setDeleteTarget(record)}>Delete</button></div></td></tr>)}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? <footer className="next-b2c-table-pagination next-b2c-classic-pagination"><span>Page {safePage} of {pageCount}</span><div><button type="button" onClick={() => setPage(1)} disabled={safePage === 1}>First</button><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>Previous</button><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={safePage === pageCount}>Next</button><button type="button" onClick={() => setPage(pageCount)} disabled={safePage === pageCount}>Last</button></div></footer> : null}
        </section>
      </section>

      {editor ? <RecordEditor record={editor} fields={fields} busy={busy === "record"} onClose={() => setEditor(null)} onSave={saveRecord} /> : null}
      {deleteTarget ? <DeleteRecordModal record={deleteTarget} busy={busy === "delete-record"} onClose={() => setDeleteTarget(null)} onConfirm={deleteRecord} /> : null}
      {schemaOpen ? <SchemaBuilder fields={fields} records={records} engine={formulaEngine} busy={busy === "schema"} onClose={() => setSchemaOpen(false)} onSave={saveSchema} /> : null}
    </main>
  );
}
