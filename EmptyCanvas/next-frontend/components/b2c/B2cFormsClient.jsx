"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const TYPE_LABELS = {
  text: "Text", number: "Number", select: "Select", multi_select: "Multi-select",
  date: "Date", files: "Files & media", checkbox: "Checkbox", url: "URL",
  email: "Email", phone: "Phone", formula: "Formula", place: "Place",
};
const VALUELESS_OPERATORS = new Set(["has_value", "is_empty", "is_checked", "not_checked"]);
const FORM_ACCESS_ALIASES = ["customer form", "b2c customer form", "b2c", "/b2c", "/b2c/form"];
const DATABASE_ACCESS_ALIASES = ["customer database", "b2c customer database", "b2c", "/b2c", "/b2c/database"];
let directStorageLoader = null;

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function formatNumber(value) { return new Intl.NumberFormat("en-EG").format(Number(value) || 0); }
function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}
function fileSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fieldOptions(field) { return field?.options && typeof field.options === "object" ? field.options : {}; }
function normalizeDatabase(database, index = 0) {
  return {
    id: text(database?.id) || `database-${index}`,
    key: text(database?.key),
    name: text(database?.name) || "Untitled Table",
    description: text(database?.description),
    createdAt: database?.createdAt || null,
    updatedAt: database?.updatedAt || null,
  };
}
function normalizeForm(form, index = 0) {
  return {
    id: text(form?.id) || `form-${index}`,
    databaseId: text(form?.databaseId),
    databaseName: text(form?.databaseName || form?.database?.name) || "B2C Table",
    name: text(form?.name) || "Untitled Form",
    description: text(form?.description),
    fieldCount: Math.max(0, Number(form?.fieldCount) || 0),
    isDefault: Boolean(form?.isDefault),
    isActive: form?.isActive !== false,
    createdAt: form?.createdAt || null,
    updatedAt: form?.updatedAt || null,
    database: form?.database || null,
  };
}
function normalizeField(field, index = 0) {
  const type = TYPE_LABELS[field?.type] ? field.type : "text";
  return {
    id: text(field?.id) || text(field?.fieldId) || `field-${index}`,
    fieldId: text(field?.fieldId || field?.id),
    key: text(field?.key) || `field_${index + 1}`,
    label: text(field?.label) || "Untitled question",
    type,
    required: Boolean(field?.required),
    formRequired: typeof field?.formRequired === "boolean" ? field.formRequired : Boolean(field?.required),
    sortOrder: Number(field?.sortOrder) || index + 1,
    options: {
      ...fieldOptions(field),
      options: Array.isArray(fieldOptions(field).options) ? fieldOptions(field).options.map(text).filter(Boolean) : [],
    },
    condition: field?.condition && typeof field.condition === "object"
      ? {
          enabled: Boolean(field.condition.enabled),
          fieldKey: text(field.condition.fieldKey || field.condition.field_key),
          operator: text(field.condition.operator) || "equals",
          value: field.condition.value ?? "",
        }
      : { enabled: false, fieldKey: "", operator: "equals", value: "" },
  };
}
function apiErrorMessage(body, fallback) { return text(body?.error || body?.message) || fallback; }
async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
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
function ensureDirectStorage() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.ERPDirectStorage?.uploadFile) return Promise.resolve(window.ERPDirectStorage);
  if (directStorageLoader) return directStorageLoader;
  directStorageLoader = new Promise((resolve) => {
    const existing = document.querySelector('script[data-next-direct-storage="true"]');
    const finish = () => resolve(window.ERPDirectStorage || null);
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/js/direct-storage-upload.js";
    script.async = true;
    script.dataset.nextDirectStorage = "true";
    script.onload = finish;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return directStorageLoader;
}
async function uploadFile(file, onProgress = () => {}) {
  if (!file || !file.size) throw new Error("Choose a valid file first.");
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  const fallback = async () => {
    onProgress({ percent: 5, stage: "fallback" });
    const dataUrl = await fileToDataUrl(file);
    const payload = await requestJson("/api/b2c/upload", {
      method: "POST",
      body: JSON.stringify({ dataUrl, filename: file.name, mime: file.type, size: file.size }),
    });
    onProgress({ percent: 100, stage: "complete" });
    return payload?.file || null;
  };
  const direct = await ensureDirectStorage();
  if (!direct?.uploadFile) return fallback();
  return direct.uploadFile({ scope: "b2c", file, fallback, onProgress });
}
function emptyValues(fields) {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === "checkbox" ? false : field.type === "multi_select" ? [] : ""]));
}
function conditionPass(condition, values) {
  if (!condition?.enabled) return true;
  const value = values?.[condition.fieldKey];
  const list = Array.isArray(value) ? value : [];
  const source = String(value ?? "");
  const target = String(condition.value ?? "");
  if (condition.operator === "equals") return source === target;
  if (condition.operator === "not_equals") return source !== target;
  if (condition.operator === "contains") return list.includes(target) || source.includes(target);
  if (condition.operator === "has_value") return Array.isArray(value) ? value.length > 0 : text(value) !== "";
  if (condition.operator === "is_empty") return Array.isArray(value) ? value.length === 0 : text(value) === "";
  if (condition.operator === "is_checked") return value === true || source.toLowerCase() === "true";
  if (condition.operator === "not_checked") return !(value === true || source.toLowerCase() === "true");
  return true;
}
function accessSet(account) { return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(lower)); }
function hasAnyAccess(allowed, aliases) { return aliases.some((alias) => allowed.has(alias)); }
function updateQueryString(formId = "") {
  const url = new URL(window.location.href);
  if (formId) url.searchParams.set("form", formId);
  else url.searchParams.delete("form");
  url.searchParams.delete("database");
  window.history.replaceState({}, "", url);
}


function Icon({ name, size = 16 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "clipboard") return <svg {...common}><path d="M9 5h6"/><path d="M9 3h6a2 2 0 0 1 2 2v1h2v15H5V6h2V5a2 2 0 0 1 2-2Z"/><path d="M9 12h6M9 16h6"/></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.4-2.5L20 11M4 13l2.5 4.5A7 7 0 0 0 17.9 15"/></svg>;
  if (name === "arrow-left") return <svg {...common}><path d="M19 12H5M11 18l-6-6 6-6"/></svg>;
  if (name === "sliders") return <svg {...common}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></svg>;
  if (name === "save") return <svg {...common}><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>;
  if (name === "rotate") return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>;
  if (name === "play") return <svg {...common}><path d="m8 5 11 7-11 7Z"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>;
  if (name === "paperclip") return <svg {...common}><path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.8-2.8l8.3-8.3"/></svg>;
  if (name === "check") return <svg {...common}><path d="m20 6-11 11-5-5"/></svg>;
  if (name === "branch") return <svg {...common}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 10h4a6 6 0 0 0 6-2"/></svg>;
  return null;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-b2c-forms-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "B2C Forms"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function ClassicModal({ title, subtitle, eyebrow = "B2C form", builder = false, onClose, children }) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, []);
  return (
    <div className="b2c-overlay next-b2c-classic-form-overlay" aria-hidden="false" onMouseDown={(event) => {
      if (event.target === event.currentTarget || event.target.classList.contains("b2c-overlay__backdrop")) onClose();
    }}>
      <div className="b2c-overlay__backdrop" />
      <section className={`b2c-dialog ${builder ? "b2c-dialog--builder" : "b2c-dialog--small"}`} role="dialog" aria-modal="true" aria-label={title}>
        <button className="b2c-dialog__close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className={`b2c-dialog__header ${builder ? "b2c-dialog__header--builder" : ""}`}>
          <div><span className="b2c-eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        {children}
      </section>
    </div>
  );
}

function FormDetailsEditor({ form, busy, onClose, onSave }) {
  const [name, setName] = useState(form?.name || "");
  const [description, setDescription] = useState(form?.description || "");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!text(name)) return setError("Form name is required.");
    try { await onSave({ name: text(name), description: text(description) }); }
    catch (saveError) { setError(saveError?.message || "The form could not be updated."); }
  };
  return (
    <ClassicModal title="Edit Form Details" subtitle="Update the form name and description without changing its questions." eyebrow="Form details" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="b2c-form-grid">
          <label className="b2c-form-control b2c-form-control--wide"><span>Form name <em>*</em></span><input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="b2c-form-control b2c-form-control--wide"><span>Description</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        {error ? <div className="b2c-dialog__error">{error}</div> : null}
        <div className="b2c-dialog__actions">
          <button type="button" className="b2c-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="b2c-primary-btn" disabled={busy}>{busy ? "Saving…" : "Save Details"}</button>
        </div>
      </form>
    </ClassicModal>
  );
}

function NewFormDialog({ databases, busy, defaultDatabaseId, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [databaseId, setDatabaseId] = useState(defaultDatabaseId || "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!text(name) || !text(databaseId)) return setError("Form name and linked table are required.");
    try { await onCreate({ name: text(name), databaseId: text(databaseId), description: text(description) }); }
    catch (createError) { setError(createError?.message || "The form could not be created."); }
  };
  return (
    <ClassicModal title="Create B2C Form" subtitle="Link this form to one existing data table." eyebrow="New form" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="b2c-form-grid">
          <label className="b2c-form-control b2c-form-control--wide"><span>Form name <em>*</em></span><input autoFocus maxLength={120} placeholder="e.g. Customer Update Form" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="b2c-form-control b2c-form-control--wide"><span>Linked table <em>*</em></span><select value={databaseId} onChange={(event) => setDatabaseId(event.target.value)}><option value="">Choose a data table</option>{databases.map((database) => <option value={database.id} key={database.id}>{database.name}</option>)}</select></label>
          <label className="b2c-form-control b2c-form-control--wide"><span>Description</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        {!databases.length ? <div className="next-b2c-classic-form-note">Create a B2C data table before creating a form. <a href="/next/b2c/database">Open Database</a></div> : null}
        {error ? <div className="b2c-dialog__error">{error}</div> : null}
        <div className="b2c-dialog__actions">
          <button type="button" className="b2c-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="b2c-primary-btn" disabled={busy || !databases.length}><Icon name="plus" />{busy ? "Creating…" : "Create Form"}</button>
        </div>
      </form>
    </ClassicModal>
  );
}

function BuilderDialog({ form, fields, busy, onClose, onSave }) {
  const [draft, setDraft] = useState(() => fields.map((field, index) => ({ ...normalizeField(field, index), sortOrder: index + 1 })));
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState(-1);
  const update = (index, patch) => setDraft((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  const updateCondition = (index, patch) => setDraft((current) => current.map((item, position) => position === index ? { ...item, condition: { ...(item.condition || {}), ...patch } } : item));
  const move = (index, direction) => setDraft((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const copy = [...current];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    return copy;
  });
  const drop = (targetIndex) => {
    if (dragIndex < 0 || targetIndex < 0 || dragIndex === targetIndex) return setDragIndex(-1);
    setDraft((current) => {
      const copy = [...current];
      const [item] = copy.splice(dragIndex, 1);
      copy.splice(targetIndex, 0, item);
      return copy;
    });
    setDragIndex(-1);
  };
  const remove = (index) => {
    const removed = draft[index];
    if (!removed || !window.confirm(`Remove “${removed.label}” from this form? The original database property and historical values will remain.`)) return;
    setDraft((current) => current
      .filter((_, position) => position !== index)
      .map((item) => item.condition?.fieldKey === removed.key ? { ...item, condition: { enabled: false, fieldKey: "", operator: "equals", value: "" } } : item));
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const invalid = draft.find((item) => item.condition?.enabled && !text(item.condition.fieldKey));
    if (invalid) return setError(`Choose the controlling question for ${invalid.label}.`);
    try {
      await onSave(draft.map((item, index) => ({
        fieldId: item.fieldId || item.id,
        formRequired: Boolean(item.formRequired),
        sortOrder: index + 1,
        condition: item.condition?.enabled
          ? { enabled: true, fieldKey: text(item.condition.fieldKey), operator: text(item.condition.operator) || "equals", value: item.condition.value ?? "" }
          : { enabled: false, fieldKey: "", operator: "equals", value: "" },
      })));
    } catch (saveError) { setError(saveError?.message || "The form builder could not be saved."); }
  };
  return (
    <ClassicModal title={`Edit ${form?.name || "Form"}`} subtitle="Reorder questions, decide which fields are required, and add conditional visibility." eyebrow="Form builder" builder onClose={onClose}>
      <form className="next-b2c-classic-builder-form" onSubmit={submit}>
        <div className="b2c-builder-guide"><Icon name="branch" /><span>Conditions use answers from other fields. Required validation is applied only while the question is visible.</span></div>
        <div className="b2c-form-builder-list">
          {draft.length ? draft.map((item, index) => {
            const condition = item.condition || {};
            const controlling = draft.filter((_, position) => position !== index);
            return (
              <article
                className={`b2c-column-card b2c-form-builder-card ${dragIndex === index ? "is-dragging" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => drop(index)}
                tabIndex={0}
                aria-label={`Form question ${index + 1}`}
                key={item.fieldId || item.id || item.key}
              >
                <span className="b2c-column-order" aria-hidden="true">{index + 1}</span>
                <div className="b2c-field-control b2c-form-builder-question"><label>Question</label><strong>{item.label}</strong><small>{TYPE_LABELS[item.type] || "Text"}</small></div>
                <label className="b2c-field-required">
                  <input className="b2c-switch-input" type="checkbox" checked={Boolean(item.formRequired)} onChange={(event) => update(index, { formRequired: event.target.checked })} />
                  <span className="b2c-switch-ui" aria-hidden="true" /><span className="b2c-field-required__label">Required</span>
                </label>
                <div className="b2c-column-actions">
                  <button type="button" className="b2c-column-drag-handle" draggable onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(-1)} title="Drag to reorder" aria-label={`Drag question ${index + 1} to reorder`}><span className="b2c-drag-dots" aria-hidden="true" /></button>
                  <button type="button" onClick={() => remove(index)} title="Delete question from this form" aria-label="Delete question from this form"><Icon name="trash" size={14} /></button>
                </div>
                <label className="b2c-form-builder-toggle b2c-form-builder-condition-toggle"><input type="checkbox" checked={Boolean(condition.enabled)} onChange={(event) => updateCondition(index, event.target.checked ? { enabled: true } : { enabled: false, fieldKey: "", operator: "equals", value: "" })} /> Conditional visibility</label>
                <div className={`b2c-form-builder-condition ${condition.enabled ? "" : "is-disabled"}`}>
                  <select disabled={!condition.enabled} value={condition.fieldKey || ""} onChange={(event) => updateCondition(index, { fieldKey: event.target.value })}>
                    <option value="">Show when…</option>
                    {controlling.map((field) => <option value={field.key} key={field.key}>{field.label}</option>)}
                  </select>
                  <select disabled={!condition.enabled} value={condition.operator || "equals"} onChange={(event) => updateCondition(index, { operator: event.target.value })}>
                    <option value="equals">equals</option><option value="not_equals">does not equal</option><option value="contains">contains</option>
                    <option value="has_value">has value</option><option value="is_empty">is empty</option><option value="is_checked">is checked</option><option value="not_checked">is not checked</option>
                  </select>
                  <input disabled={!condition.enabled || VALUELESS_OPERATORS.has(condition.operator)} value={condition.value ?? ""} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder={VALUELESS_OPERATORS.has(condition.operator) ? "No value required" : "Value"} />
                </div>
              </article>
            );
          }) : <div className="b2c-builder-empty">This form has no visible questions. Add properties from the Database table, or reopen the table builder to restore questions.</div>}
        </div>
        {error ? <div className="b2c-dialog__error">{error}</div> : null}
        <div className="b2c-dialog__actions">
          <button type="button" className="b2c-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="b2c-primary-btn" disabled={busy}><Icon name="save" />{busy ? "Saving…" : "Save Form Builder"}</button>
        </div>
      </form>
    </ClassicModal>
  );
}

function DynamicField({ field, value, selectedFiles, visible, onChange, onFiles }) {
  if (!visible) return null;
  const required = Boolean(field.formRequired);
  const options = fieldOptions(field).options || [];
  if (field.type === "formula") {
    return <div className="b2c-form-control b2c-dynamic-field"><label>{field.label}</label><div className="b2c-readonly-field">This field is generated by the database.</div></div>;
  }
  if (field.type === "files") {
    return (
      <div className="b2c-form-control b2c-form-control--wide b2c-dynamic-field">
        <label>{field.label}{required ? <em>*</em> : null}</label>
        <input className="b2c-file-input" type="file" multiple required={required && !selectedFiles.length} onChange={(event) => onFiles(Array.from(event.target.files || []).slice(0, 20))} />
        <small>Upload photos, PDFs, or files up to 10 MB each.</small>
        {selectedFiles.length ? <div className="b2c-current-files">{selectedFiles.map((file, index) => <span className="b2c-file-pill next-b2c-selected-file-pill" key={`${file.name}-${file.lastModified}-${index}`}><Icon name="paperclip" size={12} /><span>{file.name}</span><small>{fileSize(file.size)}</small><button type="button" onClick={() => onFiles(selectedFiles.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`}>×</button></span>)}</div> : null}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return <div className="b2c-form-control b2c-dynamic-field"><label>{field.label}{required ? <em>*</em> : null}</label><label className="b2c-checkbox-control"><input type="checkbox" checked={Boolean(value)} required={required} onChange={(event) => onChange(event.target.checked)} /><span>Yes</span></label></div>;
  }
  if (field.type === "select") {
    return <div className="b2c-form-control b2c-dynamic-field"><label>{field.label}{required ? <em>*</em> : null}</label><select required={required} value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></div>;
  }
  if (field.type === "multi_select") {
    return <div className="b2c-form-control b2c-dynamic-field"><label>{field.label}{required ? <em>*</em> : null}</label><select className="b2c-multi-select" multiple required={required} value={Array.isArray(value) ? value : []} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></div>;
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";
  return (
    <div className="b2c-form-control b2c-dynamic-field">
      <label>{field.label}{required ? <em>*</em> : null}</label>
      <input type={inputType} step={field.type === "number" ? "any" : undefined} inputMode={field.type === "number" ? "decimal" : field.type === "phone" ? "tel" : undefined} required={required} value={value ?? ""} placeholder={field.type === "place" ? "Address or place" : undefined} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export default function B2cFormsClient({ account, initialPayload, initialSelectedPayload, initialFormId = "", initialDatabaseId = "", bootstrapWarnings = [] }) {
  const [forms, setForms] = useState(() => (Array.isArray(initialPayload?.forms) ? initialPayload.forms : []).map(normalizeForm));
  const [databases, setDatabases] = useState(() => (Array.isArray(initialPayload?.databases) ? initialPayload.databases : []).map(normalizeDatabase));
  const [activeForm, setActiveForm] = useState(() => initialSelectedPayload?.form ? normalizeForm(initialSelectedPayload.form) : null);
  const [fields, setFields] = useState(() => (Array.isArray(initialSelectedPayload?.fields) ? initialSelectedPayload.fields : []).map(normalizeField));
  const [values, setValues] = useState(() => emptyValues((Array.isArray(initialSelectedPayload?.fields) ? initialSelectedPayload.fields : []).map(normalizeField)));
  const [selectedFiles, setSelectedFiles] = useState({});
  const [query, setQuery] = useState("");
  const [databaseFilter, setDatabaseFilter] = useState(initialDatabaseId || "all");
  const [sort, setSort] = useState("updated-desc");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const initialized = useRef(false);
  const formRef = useRef(null);
  const allowed = useMemo(() => accessSet(account), [account]);
  const canSubmit = useMemo(() => hasAnyAccess(allowed, FORM_ACCESS_ALIASES), [allowed]);
  const canUseDatabase = useMemo(() => hasAnyAccess(allowed, DATABASE_ACCESS_ALIASES), [allowed]);
  const canManage = canSubmit || canUseDatabase;

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search B2C forms...";
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => { input.removeEventListener("input", handle); input.value = ""; input.placeholder = "Search"; };
  }, []);

  const stats = useMemo(() => ({
    forms: forms.length,
    tables: new Set(forms.map((form) => form.databaseId).filter(Boolean)).size,
    questions: forms.reduce((sum, form) => sum + form.fieldCount, 0),
    defaultForms: forms.filter((form) => form.isDefault).length,
  }), [forms]);

  const visibleForms = useMemo(() => {
    const needle = lower(query);
    const list = forms.filter((form) => {
      if (databaseFilter !== "all" && form.databaseId !== databaseFilter) return false;
      if (!needle) return true;
      return [form.name, form.description, form.databaseName].some((value) => lower(value).includes(needle));
    });
    return [...list].sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sort === "name-desc") return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      if (sort === "fields-desc") return b.fieldCount - a.fieldCount || a.name.localeCompare(b.name);
      if (sort === "created-desc") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });
  }, [forms, query, databaseFilter, sort]);

  const fieldVisibility = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, conditionPass(field.condition, values)])), [fields, values]);
  const visibleQuestionCount = useMemo(() => fields.filter((field) => fieldVisibility[field.key]).length, [fields, fieldVisibility]);
  const requiredQuestionCount = useMemo(() => fields.filter((field) => fieldVisibility[field.key] && field.formRequired && field.type !== "formula").length, [fields, fieldVisibility]);

  const notify = (message, type = "success", title = "B2C Forms") => setToast({ message, type, title });
  const applyFormPayload = (payload, { updateUrl = true } = {}) => {
    const nextForm = payload?.form ? normalizeForm(payload.form) : null;
    const nextFields = (Array.isArray(payload?.fields) ? payload.fields : []).map(normalizeField);
    setActiveForm(nextForm);
    setFields(nextFields);
    setValues(emptyValues(nextFields));
    setSelectedFiles({});
    setSubmitted(false);
    setSubmitError("");
    if (updateUrl && nextForm?.id) updateQueryString(nextForm.id);
    requestAnimationFrame(() => document.querySelector(".b2c-active-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const refreshLibrary = async ({ silent = false } = {}) => {
    if (!silent) setBusy("refresh");
    try {
      const payload = await requestJson("/api/b2c/forms");
      setForms((Array.isArray(payload?.forms) ? payload.forms : []).map(normalizeForm));
      setDatabases((Array.isArray(payload?.databases) ? payload.databases : []).map(normalizeDatabase));
      if (!silent) notify("Forms library was refreshed.");
      return payload;
    } catch (error) {
      if (!silent) notify(error?.message || "The forms library could not be refreshed.", "error");
      throw error;
    } finally { if (!silent) setBusy(""); }
  };
  const openForm = async (formId, { silent = false, openBuilder = false } = {}) => {
    if (!formId) return;
    if (!silent) setBusy(`open:${formId}`);
    try {
      const payload = await requestJson(`/api/b2c/forms/${encodeURIComponent(formId)}`);
      applyFormPayload(payload);
      if (openBuilder) setDialog("builder");
      return payload;
    } catch (error) {
      notify(error?.message || "The form could not be opened.", "error");
      throw error;
    } finally { if (!silent) setBusy(""); }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initialSelectedPayload?.form) {
      applyFormPayload(initialSelectedPayload, { updateUrl: false });
      return;
    }
    if (initialFormId) {
      openForm(initialFormId, { silent: true }).catch(() => {});
      return;
    }
    if (initialDatabaseId) {
      const candidates = forms.filter((form) => form.databaseId === initialDatabaseId);
      const match = candidates.find((form) => form.isDefault) || candidates[0];
      if (match) openForm(match.id, { silent: true }).catch(() => {});
    }
  }, []);

  const closeActiveForm = () => {
    setActiveForm(null);
    setFields([]);
    setValues({});
    setSelectedFiles({});
    setSubmitted(false);
    setSubmitError("");
    updateQueryString("");
  };
  const createForm = async (data) => {
    setBusy("create");
    try {
      const payload = await requestJson("/api/b2c/forms", { method: "POST", body: JSON.stringify(data) });
      setDialog(null);
      await refreshLibrary({ silent: true });
      if (payload?.form?.id) await openForm(payload.form.id, { silent: true });
      notify(`“${data.name}” was created.`);
    } finally { setBusy(""); }
  };
  const updateFormDetails = async (data) => {
    if (!activeForm?.id) return;
    setBusy("details");
    try {
      const payload = await requestJson(`/api/b2c/forms/${encodeURIComponent(activeForm.id)}`, { method: "PATCH", body: JSON.stringify(data) });
      const updated = normalizeForm({ ...activeForm, ...(payload?.form || data), database: activeForm.database });
      setActiveForm(updated);
      setForms((current) => current.map((form) => form.id === activeForm.id ? { ...form, ...updated, databaseName: form.databaseName } : form));
      setDialog(null);
      notify("Form details were updated.");
    } finally { setBusy(""); }
  };
  const saveBuilder = async (nextFields) => {
    if (!activeForm?.id) return;
    setBusy("builder");
    try {
      await requestJson(`/api/b2c/forms/${encodeURIComponent(activeForm.id)}/builder`, { method: "PUT", body: JSON.stringify({ fields: nextFields }) });
      setDialog(null);
      await openForm(activeForm.id, { silent: true });
      await refreshLibrary({ silent: true });
      notify("Form builder was saved.");
    } finally { setBusy(""); }
  };
  const clearForm = () => {
    setValues(emptyValues(fields));
    setSelectedFiles({});
    setSubmitted(false);
    setSubmitError("");
    formRef.current?.reset?.();
  };
  const submitRecord = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitted(false);
    if (!canSubmit) return setSubmitError("Customer Form access is required to submit customer records.");
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    const missing = fields.filter((field) => fieldVisibility[field.key] && field.formRequired && field.type !== "formula").filter((field) => {
      if (field.type === "files") return !(selectedFiles[field.key] || []).length;
      if (field.type === "checkbox") return !values[field.key];
      if (field.type === "multi_select") return !Array.isArray(values[field.key]) || !values[field.key].length;
      return text(values[field.key]) === "";
    });
    if (missing.length) return setSubmitError(`Complete the required field${missing.length > 1 ? "s" : ""}: ${missing.map((field) => field.label).join(", ")}.`);
    setBusy("submit");
    try {
      const payloadValues = {};
      for (const field of fields) {
        if (!fieldVisibility[field.key] || field.type === "formula") continue;
        if (field.type === "files") {
          const files = selectedFiles[field.key] || [];
          const uploaded = [];
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            setUploadState({ field: field.label, file: file.name, current: index + 1, total: files.length, percent: 0 });
            const result = await uploadFile(file, ({ percent = 0 }) => setUploadState({ field: field.label, file: file.name, current: index + 1, total: files.length, percent }));
            if (result?.url) uploaded.push(result);
          }
          payloadValues[field.key] = uploaded;
        } else payloadValues[field.key] = values[field.key] ?? (field.type === "checkbox" ? false : "");
      }
      await requestJson(`/api/b2c/forms/${encodeURIComponent(activeForm.id)}/submit`, { method: "POST", body: JSON.stringify({ values: payloadValues }) });
      clearForm();
      setSubmitted(true);
      notify("Customer record was saved successfully.");
      requestAnimationFrame(() => document.querySelector(".b2c-form-progress")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch (error) {
      setSubmitError(error?.message || "The customer record could not be saved.");
    } finally {
      setUploadState(null);
      setBusy("");
    }
  };


  return (
    <main className="b2c-shell b2c-form-shell next-b2c-classic-forms">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? (
        <div className="next-b2c-classic-warning" role="status">
          <strong>Some B2C resources did not finish loading.</strong>
          <span>Refresh this page or use the Classic interface while the service recovers.</span>
          <a href="/b2c/form?classic=1">Classic Forms</a>
        </div>
      ) : null}

      <section className="b2c-form-workspace" aria-labelledby="b2cFormTitle">
        {!activeForm ? (
          <>
            <div className="b2c-form-workspace__intro">
              <div>
                <span className="b2c-eyebrow"><Icon name="clipboard" /> Form library</span>
                <h2 id="b2cFormTitle">B2C Forms</h2>
                <p>Each form is linked to one B2C data table. Open a form to submit records or edit its order, required fields, and visibility conditions.</p>
              </div>
              <div className="b2c-top-actions">
                {canUseDatabase ? <a className="b2c-secondary-btn" href="/next/b2c/database"><Icon name="database" /><span>Database</span></a> : null}
                <button className="b2c-secondary-btn b2c-compact-btn" type="button" onClick={() => refreshLibrary().catch(() => {})} disabled={busy === "refresh"}><Icon name="refresh" />{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
                {canManage ? <button className="b2c-primary-btn" type="button" onClick={() => setDialog("new")}><Icon name="plus" /><span>New Form</span></button> : null}
              </div>
            </div>

            <div className="next-b2c-classic-forms-toolbar">
              <label><span>Data table</span><select value={databaseFilter} onChange={(event) => setDatabaseFilter(event.target.value)}><option value="all">All tables</option>{databases.map((database) => <option value={database.id} key={database.id}>{database.name}</option>)}</select></label>
              <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated-desc">Recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="fields-desc">Most questions</option></select></label>
              <span>{visibleForms.length} of {forms.length} forms</span>
              {(query || databaseFilter !== "all") ? <button type="button" onClick={() => { setQuery(""); setDatabaseFilter("all"); const input = document.querySelector(".classic-app-shell .main-header .searchbar input"); if (input) input.value = ""; }}>Clear filters</button> : null}
            </div>

            <section className="b2c-forms-library">
              {visibleForms.length ? visibleForms.map((form) => (
                <article className="b2c-form-card" key={form.id}>
                  <div className="b2c-form-card__head"><span className="b2c-form-card__icon"><Icon name="clipboard" size={19} /></span><span className="b2c-form-card__table">{form.databaseName || "B2C Table"}</span></div>
                  <h3>{form.name}</h3>
                  <p>{form.description || "No description"}</p>
                  <div className="b2c-form-card__footer">
                    <span className="b2c-form-card__fields">{formatNumber(form.fieldCount)} field{form.fieldCount === 1 ? "" : "s"}</span>
                    <div className="b2c-form-card__actions">
                      <button type="button" onClick={() => openForm(form.id).catch(() => {})} disabled={busy === `open:${form.id}`}><Icon name="play" size={14} />{busy === `open:${form.id}` ? "Opening…" : canSubmit ? "Open" : "Preview"}</button>
                      {canManage ? <button type="button" title="Edit form" aria-label={`Edit ${form.name}`} onClick={() => openForm(form.id, { openBuilder: true }).catch(() => {})}><Icon name="sliders" size={14} /></button> : null}
                    </div>
                  </div>
                </article>
              )) : (
                <div className="b2c-database-empty">
                  {forms.length ? "No forms match the current filters." : <>No B2C forms yet. Create a data table first, or select <strong>New Form</strong> to link a form to an existing table.</>}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="b2c-active-form-panel next-b2c-active-form-panel-static">
            <div className="b2c-active-form-heading">
              <div>
                <button className="b2c-back-link" type="button" onClick={closeActiveForm}><Icon name="arrow-left" size={15} /> All Forms</button>
                <span className="b2c-eyebrow"><Icon name="clipboard" /> Linked form</span>
                <h2>{activeForm.name}</h2>
                <p>{activeForm.description || `Complete the available fields below to save a record in ${activeForm.database?.name || activeForm.databaseName || "the linked table"}.`}</p>
              </div>
              <div className="b2c-top-actions">
                {canUseDatabase && activeForm.databaseId ? <a className="b2c-secondary-btn b2c-compact-btn" href={`/next/b2c/database/${encodeURIComponent(activeForm.databaseId)}`}><Icon name="database" /> Open Table</a> : null}
                {canManage ? <button className="b2c-secondary-btn b2c-compact-btn" type="button" onClick={() => setDialog("details")}>Edit Details</button> : null}
                {canManage ? <button className="b2c-secondary-btn" type="button" onClick={() => setDialog("builder")}><Icon name="sliders" /><span>Edit Form</span></button> : null}
              </div>
            </div>

            <div className="next-b2c-classic-form-summary" aria-label="Form summary">
              <span><b>{visibleQuestionCount}</b> visible</span>
              <span><b>{requiredQuestionCount}</b> required</span>
              <span><b>{fields.filter((field) => field.condition?.enabled).length}</b> conditional</span>
              <span><b>{fields.filter((field) => field.type === "files").length}</b> upload fields</span>
            </div>

            {submitted ? <div className="b2c-form-progress"><span><Icon name="check" size={18} /> Record saved successfully.</span><button type="button" onClick={() => setSubmitted(false)}>Add another record</button></div> : null}
            {!canSubmit ? <div className="next-b2c-classic-form-note"><strong>Preview mode.</strong> Customer Form access is required to submit records.</div> : null}

            <form ref={formRef} className="b2c-customer-form" onSubmit={submitRecord} noValidate={false}>
              <div className="b2c-form-grid">
                {fields.length ? fields.map((field) => <DynamicField key={field.id || field.key} field={field} value={values[field.key]} selectedFiles={selectedFiles[field.key] || []} visible={Boolean(fieldVisibility[field.key])} onChange={(value) => { setValues((current) => ({ ...current, [field.key]: value })); setSubmitted(false); setSubmitError(""); }} onFiles={(files) => { setSelectedFiles((current) => ({ ...current, [field.key]: files })); setSubmitted(false); setSubmitError(""); }} />) : <div className="b2c-conditional-note">This form has no fields yet. Configure properties in Database, then open Form Builder.</div>}
              </div>
              {uploadState ? <div className="next-b2c-classic-upload-progress"><div><strong>Uploading {uploadState.file}</strong><span>{uploadState.field} · File {uploadState.current} of {uploadState.total}</span></div><progress max="100" value={uploadState.percent || 0} /><b>{Math.round(uploadState.percent || 0)}%</b></div> : null}
              {submitError ? <div className="b2c-form-error">{submitError}</div> : null}
              <div className="b2c-customer-form__actions">
                <button type="button" className="b2c-secondary-btn" onClick={clearForm} disabled={busy === "submit"}><Icon name="rotate" /><span>Clear Form</span></button>
                <button type="submit" className="b2c-primary-btn" disabled={busy === "submit" || !canSubmit || !fields.length}><Icon name="save" /><span>{busy === "submit" ? (uploadState ? "Uploading…" : "Saving…") : "Save Record"}</span></button>
              </div>
            </form>
          </section>
        )}

        {dialog === "new" ? <NewFormDialog databases={databases} defaultDatabaseId={databaseFilter !== "all" ? databaseFilter : initialDatabaseId} busy={busy === "create"} onClose={() => setDialog(null)} onCreate={createForm} /> : null}
        {dialog === "details" && activeForm ? <FormDetailsEditor form={activeForm} busy={busy === "details"} onClose={() => setDialog(null)} onSave={updateFormDetails} /> : null}
        {dialog === "builder" && activeForm ? <BuilderDialog form={activeForm} fields={fields} busy={busy === "builder"} onClose={() => setDialog(null)} onSave={saveBuilder} /> : null}
      </section>
    </main>
  );
}
