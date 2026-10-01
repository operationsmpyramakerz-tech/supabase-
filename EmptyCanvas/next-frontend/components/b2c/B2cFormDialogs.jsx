"use client";

import { useEffect, useState } from "react";

const TYPE_LABELS = {
  text: "Text", number: "Number", select: "Select", multi_select: "Multi-select",
  date: "Date", files: "Files & media", checkbox: "Checkbox", url: "URL",
  email: "Email", phone: "Phone", formula: "Formula", place: "Place",
};
const VALUELESS_OPERATORS = new Set(["has_value", "is_empty", "is_checked", "not_checked"]);

function text(value) { return String(value ?? "").trim(); }
function fieldOptions(field) { return field?.options && typeof field.options === "object" ? field.options : {}; }
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

function Icon({ name, size = 16 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "save") return <svg {...common}><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>;
  if (name === "branch") return <svg {...common}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 10h4a6 6 0 0 0 6-2"/></svg>;
  return null;
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

export function FormDetailsEditor({ form, busy, onClose, onSave }) {
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

export function NewFormDialog({ databases, busy, defaultDatabaseId, onClose, onCreate }) {
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

export function BuilderDialog({ form, fields, busy, onClose, onSave }) {
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

