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

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-b2c-forms-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "B2C Forms"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}
function Modal({ title, subtitle, badge = "FORM", wide = false, onClose, children }) {
  return (
    <div className="next-b2c-forms-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-b2c-forms-modal__card ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{badge}</span>
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-b2c-forms-modal__body">{children}</div>
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
    <Modal title="Edit Form Details" subtitle="Update the form name and description without changing its questions." badge="EDIT" onClose={onClose}>
      <form className="next-b2c-form-dialog" onSubmit={submit}>
        <label><span>Form name *</span><input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Description</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        {error ? <div className="next-b2c-forms-error">{error}</div> : null}
        <footer><button type="button" className="next-b2c-forms-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="next-b2c-forms-btn primary" disabled={busy}>{busy ? "Saving…" : "Save Details"}</button></footer>
      </form>
    </Modal>
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
    <Modal title="Create B2C Form" subtitle="Link the new form to one existing customer data table." badge="NEW" onClose={onClose}>
      <form className="next-b2c-form-dialog" onSubmit={submit}>
        <label><span>Form name *</span><input autoFocus maxLength={120} placeholder="e.g. Customer Update Form" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Linked table *</span><select value={databaseId} onChange={(event) => setDatabaseId(event.target.value)}><option value="">Choose a data table</option>{databases.map((database) => <option value={database.id} key={database.id}>{database.name}</option>)}</select></label>
        <label><span>Description</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        {!databases.length ? <div className="next-b2c-forms-note">Create a B2C data table before creating a form. <a href="/next/b2c/database">Open Database</a></div> : null}
        {error ? <div className="next-b2c-forms-error">{error}</div> : null}
        <footer><button type="button" className="next-b2c-forms-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="next-b2c-forms-btn primary" disabled={busy || !databases.length}>{busy ? "Creating…" : "Create Form"}</button></footer>
      </form>
    </Modal>
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
    <Modal title={`Edit ${form?.name || "Form"}`} subtitle="Reorder questions, set required rules, and add conditional visibility." badge="BUILD" wide onClose={onClose}>
      <form className="next-b2c-builder" onSubmit={submit}>
        <div className="next-b2c-builder-guide"><strong>Conditional visibility</strong><span>A question can depend on another answer. Required validation runs only while the question is visible.</span></div>
        <div className="next-b2c-builder-list">
          {draft.length ? draft.map((item, index) => {
            const condition = item.condition || {};
            const controlling = draft.filter((_, position) => position !== index);
            return (
              <article
                className={`next-b2c-builder-card ${dragIndex === index ? "is-dragging" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => drop(index)}
                key={item.fieldId || item.id || item.key}
              >
                <div className="next-b2c-builder-order" draggable onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(-1)} title="Drag to reorder"><span>{index + 1}</span><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1}>↓</button></div>
                <div className="next-b2c-builder-question"><small>Question</small><strong>{item.label}</strong><span>{TYPE_LABELS[item.type] || "Text"}</span></div>
                <label className="next-b2c-builder-required"><input type="checkbox" checked={Boolean(item.formRequired)} onChange={(event) => update(index, { formRequired: event.target.checked })} /><span>Required</span></label>
                <button type="button" className="next-b2c-builder-remove" onClick={() => remove(index)}>Remove</button>
                <label className="next-b2c-builder-condition-toggle"><input type="checkbox" checked={Boolean(condition.enabled)} onChange={(event) => updateCondition(index, event.target.checked ? { enabled: true } : { enabled: false, fieldKey: "", operator: "equals", value: "" })} /><span>Conditional visibility</span></label>
                <div className={`next-b2c-builder-condition ${condition.enabled ? "" : "is-disabled"}`}>
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
          }) : <div className="next-b2c-builder-empty">This form has no visible questions. Add or restore properties from the linked Database table.</div>}
        </div>
        {error ? <div className="next-b2c-forms-error">{error}</div> : null}
        <footer><button type="button" className="next-b2c-forms-btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="next-b2c-forms-btn primary" disabled={busy}>{busy ? "Saving…" : "Save Form Builder"}</button></footer>
      </form>
    </Modal>
  );
}
function DynamicField({ field, value, selectedFiles, visible, onChange, onFiles }) {
  if (!visible) return null;
  const required = Boolean(field.formRequired);
  const options = fieldOptions(field).options || [];
  if (field.type === "formula") {
    return <div className="next-b2c-customer-control"><span>{field.label}</span><div className="next-b2c-customer-readonly">This value is calculated automatically after the record is saved.</div></div>;
  }
  if (field.type === "files") {
    return (
      <label className="next-b2c-customer-control is-wide">
        <span>{field.label}{required ? " *" : ""}</span>
        <input type="file" multiple required={required && !selectedFiles.length} onChange={(event) => onFiles(Array.from(event.target.files || []).slice(0, 20))} />
        <small>Photos, PDFs, or files up to 10 MB each. Files upload directly to Supabase Storage when available.</small>
        {selectedFiles.length ? <div className="next-b2c-customer-files">{selectedFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><span><b>{file.name}</b><small>{fileSize(file.size)}</small></span><button type="button" onClick={() => onFiles(selectedFiles.filter((_, position) => position !== index))}>Remove</button></div>)}</div> : null}
      </label>
    );
  }
  if (field.type === "checkbox") {
    return <label className="next-b2c-customer-control next-b2c-customer-checkbox"><span>{field.label}{required ? " *" : ""}</span><input type="checkbox" checked={Boolean(value)} required={required} onChange={(event) => onChange(event.target.checked)} /><b>Yes</b></label>;
  }
  if (field.type === "select") {
    return <label className="next-b2c-customer-control"><span>{field.label}{required ? " *" : ""}</span><select required={required} value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
  }
  if (field.type === "multi_select") {
    return <label className="next-b2c-customer-control"><span>{field.label}{required ? " *" : ""}</span><select multiple required={required} value={Array.isArray(value) ? value : []} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select><small>Hold Ctrl or Command to select more than one option.</small></label>;
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";
  return (
    <label className="next-b2c-customer-control">
      <span>{field.label}{required ? " *" : ""}</span>
      <input type={inputType} step={field.type === "number" ? "any" : undefined} inputMode={field.type === "number" ? "decimal" : field.type === "phone" ? "tel" : undefined} required={required} value={value ?? ""} placeholder={field.type === "place" ? "Address or place" : undefined} onChange={(event) => onChange(event.target.value)} />
    </label>
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
    requestAnimationFrame(() => document.querySelector(".next-b2c-active-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      requestAnimationFrame(() => document.querySelector(".next-b2c-form-success")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch (error) {
      setSubmitError(error?.message || "The customer record could not be saved.");
    } finally {
      setUploadState(null);
      setBusy("");
    }
  };

  return (
    <section className="next-b2c-forms-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {bootstrapWarnings.length ? (
        <div className="next-b2c-forms-warning" role="status"><strong>Some B2C resources did not finish loading.</strong><span>Refresh the page or use the classic form library while the service recovers.</span><a href="/b2c/form">Open classic Forms</a></div>
      ) : null}

      <section className="next-b2c-forms-hero">
        <div>
          <span className="next-b2c-forms-eyebrow">B2C customer entry</span>
          <h2>Build controlled forms and save records into the correct customer table.</h2>
          <p>Every form uses the existing Supabase schema, validation rules, conditional questions, and protected file upload workflow.</p>
          <div className="next-b2c-forms-hero__actions">
            {canManage ? <button type="button" className="next-b2c-forms-btn primary" onClick={() => setDialog("new")}>+ New Form</button> : null}
            {canUseDatabase ? <a className="next-b2c-forms-btn secondary" href="/next/b2c/database">Open Database</a> : null}
            <button type="button" className="next-b2c-forms-btn secondary" onClick={() => refreshLibrary().catch(() => {})} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        <aside aria-hidden="true"><span>FORM</span><i /><i /><i /></aside>
      </section>

      <section className="next-b2c-forms-stats" aria-label="B2C forms summary">
        <article><span>Forms</span><strong>{formatNumber(stats.forms)}</strong><small>Available entry workflows</small></article>
        <article><span>Linked Tables</span><strong>{formatNumber(stats.tables)}</strong><small>Independent destinations</small></article>
        <article><span>Configured Questions</span><strong>{formatNumber(stats.questions)}</strong><small>Across all form layouts</small></article>
        <article><span>Default Forms</span><strong>{formatNumber(stats.defaultForms)}</strong><small>Created with data tables</small></article>
      </section>

      {!activeForm ? (
        <section className="next-b2c-forms-library">
          <header><div><span>Form library</span><h3>Choose a form to enter a record or edit its layout.</h3></div><small>{visibleForms.length} of {forms.length} forms</small></header>
          <div className="next-b2c-forms-toolbar">
            <label className="next-b2c-forms-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Form name, table, or description" /></label>
            <label><span>Data table</span><select value={databaseFilter} onChange={(event) => setDatabaseFilter(event.target.value)}><option value="all">All tables</option>{databases.map((database) => <option value={database.id} key={database.id}>{database.name}</option>)}</select></label>
            <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated-desc">Recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="fields-desc">Most questions</option></select></label>
            {(query || databaseFilter !== "all") ? <button type="button" onClick={() => { setQuery(""); setDatabaseFilter("all"); }}>Clear</button> : null}
          </div>
          {visibleForms.length ? (
            <div className="next-b2c-forms-grid">
              {visibleForms.map((form) => (
                <article className="next-b2c-form-card" key={form.id}>
                  <header><span>FORM</span><div>{form.isDefault ? <b>Default</b> : null}{form.isActive ? <em>Active</em> : <em className="is-muted">Inactive</em>}</div></header>
                  <div><small>{form.databaseName}</small><h3>{form.name}</h3><p>{form.description || "No description has been added to this form."}</p></div>
                  <dl><div><dt>Questions</dt><dd>{formatNumber(form.fieldCount)}</dd></div><div><dt>Updated</dt><dd>{formatDate(form.updatedAt || form.createdAt)}</dd></div></dl>
                  <footer>
                    <button type="button" className="next-b2c-forms-btn primary" onClick={() => openForm(form.id).catch(() => {})} disabled={busy === `open:${form.id}`}>{busy === `open:${form.id}` ? "Opening…" : canSubmit ? "Open Form" : "Preview Form"}</button>
                    {canManage ? <button type="button" className="next-b2c-forms-icon-btn" title="Open Form Builder" onClick={() => openForm(form.id, { openBuilder: true }).catch(() => {})}>Build</button> : null}
                  </footer>
                </article>
              ))}
            </div>
          ) : <div className="next-b2c-forms-empty"><strong>No forms match the current filters.</strong><span>{forms.length ? "Change the search or table filter." : "Create a B2C data table and then create its first form."}</span>{canManage ? <button type="button" className="next-b2c-forms-btn primary" onClick={() => setDialog("new")}>Create Form</button> : null}</div>}
        </section>
      ) : (
        <section className="next-b2c-active-form">
          <header className="next-b2c-active-form__head">
            <div><button type="button" onClick={closeActiveForm}>← All Forms</button><span>{activeForm.database?.name || activeForm.databaseName || "B2C Table"}</span><h3>{activeForm.name}</h3><p>{activeForm.description || `Complete the questions below to save a record in ${activeForm.database?.name || "the linked table"}.`}</p></div>
            <div>{canUseDatabase && activeForm.databaseId ? <a className="next-b2c-forms-btn secondary" href={`/next/b2c/database/${encodeURIComponent(activeForm.databaseId)}`}>Open Table</a> : null}{canManage ? <button type="button" className="next-b2c-forms-btn secondary" onClick={() => setDialog("details")}>Edit Details</button> : null}{canManage ? <button type="button" className="next-b2c-forms-btn primary" onClick={() => setDialog("builder")}>Form Builder</button> : null}</div>
          </header>

          <div className="next-b2c-active-form__summary"><span><b>{visibleQuestionCount}</b> visible questions</span><span><b>{requiredQuestionCount}</b> required</span><span><b>{fields.filter((field) => field.condition?.enabled).length}</b> conditional</span><span><b>{fields.filter((field) => field.type === "files").length}</b> upload fields</span></div>

          {submitted ? <div className="next-b2c-form-success"><div><strong>Record saved successfully.</strong><span>The record was added to {activeForm.database?.name || activeForm.databaseName || "the linked B2C table"}.</span></div><button type="button" onClick={() => setSubmitted(false)}>Add another record</button></div> : null}
          {!canSubmit ? <div className="next-b2c-forms-warning"><strong>Preview mode</strong><span>Your account can configure this form but Customer Form access is required to submit records.</span></div> : null}

          <form ref={formRef} className="next-b2c-customer-form" onSubmit={submitRecord} noValidate={false}>
            <div className="next-b2c-customer-grid">
              {fields.length ? fields.map((field) => <DynamicField key={field.id || field.key} field={field} value={values[field.key]} selectedFiles={selectedFiles[field.key] || []} visible={Boolean(fieldVisibility[field.key])} onChange={(value) => { setValues((current) => ({ ...current, [field.key]: value })); setSubmitted(false); setSubmitError(""); }} onFiles={(files) => { setSelectedFiles((current) => ({ ...current, [field.key]: files })); setSubmitted(false); setSubmitError(""); }} />) : <div className="next-b2c-forms-empty is-inline"><strong>This form has no visible questions.</strong><span>Configure properties in the linked Database table, then open Form Builder.</span></div>}
            </div>
            {uploadState ? <div className="next-b2c-upload-progress"><div><strong>Uploading {uploadState.file}</strong><span>{uploadState.field} · File {uploadState.current} of {uploadState.total}</span></div><progress max="100" value={uploadState.percent || 0} /><b>{Math.round(uploadState.percent || 0)}%</b></div> : null}
            {submitError ? <div className="next-b2c-forms-error">{submitError}</div> : null}
            <footer><button type="button" className="next-b2c-forms-btn secondary" onClick={clearForm} disabled={busy === "submit"}>Clear Form</button><button type="submit" className="next-b2c-forms-btn primary" disabled={busy === "submit" || !canSubmit || !fields.length}>{busy === "submit" ? (uploadState ? "Uploading…" : "Saving…") : "Save Record"}</button></footer>
          </form>
        </section>
      )}

      {dialog === "new" ? <NewFormDialog databases={databases} defaultDatabaseId={databaseFilter !== "all" ? databaseFilter : initialDatabaseId} busy={busy === "create"} onClose={() => setDialog(null)} onCreate={createForm} /> : null}
      {dialog === "details" && activeForm ? <FormDetailsEditor form={activeForm} busy={busy === "details"} onClose={() => setDialog(null)} onSave={updateFormDetails} /> : null}
      {dialog === "builder" && activeForm ? <BuilderDialog form={activeForm} fields={fields} busy={busy === "builder"} onClose={() => setDialog(null)} onSave={saveBuilder} /> : null}
    </section>
  );
}
