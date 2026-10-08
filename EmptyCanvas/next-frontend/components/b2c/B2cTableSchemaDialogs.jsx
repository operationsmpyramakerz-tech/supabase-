"use client";

import { useMemo, useRef, useState } from "react";
import B2CFormulaEngine from "../../lib/b2c-formula-engine";

const FIELD_TYPES = [
  ["text", "Text"], ["number", "Number"], ["select", "Select"], ["multi_select", "Multi-select"],
  ["date", "Date"], ["files", "Files & media"], ["checkbox", "Checkbox"], ["url", "URL"],
  ["email", "Email"], ["phone", "Phone"], ["formula", "Formula"], ["place", "Place"],
];
const TYPE_LABELS = Object.fromEntries(FIELD_TYPES);
const SELECT_TYPES = new Set(["select", "multi_select"]);
const FORMULA_CATEGORIES = ["All", "Logic", "Math", "Text", "Date"];

function text(value) { return String(value ?? "").trim(); }
function fieldOptions(field) { return field?.options && typeof field.options === "object" ? field.options : {}; }
function normalizeField(field, index = 0) {
  const type = FIELD_TYPES.some(([key]) => key === field?.type) ? field.type : "text";
  return {
    id: text(field?.id), key: text(field?.key), label: text(field?.label) || "Untitled property", type,
    required: Boolean(field?.required), sortOrder: index + 1,
    options: { options: Array.isArray(fieldOptions(field).options) ? fieldOptions(field).options.map(text).filter(Boolean) : [], formula: text(fieldOptions(field).formula) || null },
  };
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

export function SchemaBuilder({ fields, records, busy, onClose, onSave }) {
  const engine = B2CFormulaEngine;
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
