"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const RecordEditor = dynamic(() => import("./B2cTableWorkspaceDialogs").then((module) => module.RecordEditor), { ssr: false });
const DeleteRecordModal = dynamic(() => import("./B2cTableWorkspaceDialogs").then((module) => module.DeleteRecordModal), { ssr: false });
const SchemaBuilder = dynamic(() => import("./B2cTableSchemaDialogs").then((module) => module.SchemaBuilder), { ssr: false });

function preloadRecordDialogs() { void import("./B2cTableWorkspaceDialogs"); }
function preloadSchemaDialogs() { void import("./B2cTableSchemaDialogs"); }

const FIELD_TYPES = [
  ["text", "Text"], ["number", "Number"], ["select", "Select"], ["multi_select", "Multi-select"],
  ["date", "Date"], ["files", "Files & media"], ["checkbox", "Checkbox"], ["url", "URL"],
  ["email", "Email"], ["phone", "Phone"], ["formula", "Formula"], ["place", "Place"],
];

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
  if (!response.ok || body?.ok === false) {
    const error = new Error(apiErrorMessage(body, `Request failed (${response.status}).`));
    error.status = response.status;
    throw error;
  }
  return body;
}
async function requestReadJson(directUrl) {
  return await requestJson(directUrl);
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
function EmptyValue() { return <span className="b2c-cell-muted">—</span>; }
function displayFormulaValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 12 }).format(value);
  if (Array.isArray(value)) return value.map(text).join(", ") || "—";
  return text(value);
}
function FormulaValue({ record, field }) {
  const expression = text(fieldOptions(field).formula);
  const hasStoredValue = Object.prototype.hasOwnProperty.call(record.formulaValues || {}, field.key);
  const [fallback, setFallback] = useState({ ready: false, value: null, error: "" });

  useEffect(() => {
    if (!expression || hasStoredValue) {
      setFallback({ ready: false, value: null, error: "" });
      return undefined;
    }
    let active = true;
    void import("../../lib/b2c-formula-engine")
      .then(({ default: engine }) => {
        if (!active) return;
        const calculated = engine?.calculateFormulaValues?.([field], record.values || {});
        setFallback({
          ready: true,
          value: calculated?.values?.[field.key],
          error: text(calculated?.errors?.[field.key]),
        });
      })
      .catch(() => {
        if (active) setFallback({ ready: true, value: null, error: "Formula could not be calculated." });
      });
    return () => { active = false; };
  }, [expression, field, hasStoredValue, record.values]);

  if (!expression) return <span className="b2c-cell-muted">No formula</span>;
  const error = hasStoredValue ? text(record.formulaErrors?.[field.key]) : fallback.error;
  const value = hasStoredValue ? record.formulaValues?.[field.key] : fallback.value;
  if (error) return <span className="next-b2c-table-formula-error" title={error}>Formula error</span>;
  return <span className="next-b2c-table-formula" title={expression}>{displayFormulaValue(value)}</span>;
}
function CellValue({ value, field, record }) {
  if (field.type === "formula") return <FormulaValue record={record} field={field} />;
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
      const payload = await requestReadJson(`/next/api/b2c/databases/${encodeURIComponent(databaseId)}/records?_fresh=1`);
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
      await requestJson("/next/api/b2c/mutations-direct", { method: "POST", body: JSON.stringify({ action: "record-update", recordId: editor.id, databaseId, values }) });
      setEditor(null);
      await refresh({ silent: true });
      notify(`${editor.customerCode} was updated.`);
    } finally { setBusy(""); }
  };
  const deleteRecord = async () => {
    if (!deleteTarget) return;
    setBusy("delete-record");
    try {
      await requestJson("/next/api/b2c/mutations-direct", { method: "POST", body: JSON.stringify({ action: "record-delete", recordId: deleteTarget.id, databaseId }) });
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
      await requestJson("/next/api/b2c/mutations-direct", { method: "POST", body: JSON.stringify({ action: "fields-save", databaseId, fields: nextFields }) });
      setSchemaOpen(false);
      await refresh({ silent: true });
      notify("Table properties were saved and linked forms were synchronized.");
    } finally { setBusy(""); }
  };

  const formHref = database?.defaultFormId ? `/next/b2c/forms?form=${encodeURIComponent(database.defaultFormId)}` : `/next/b2c/forms?database=${encodeURIComponent(databaseId)}`;
  const exportHref = `/next/api/b2c/export-direct?id=${encodeURIComponent(databaseId)}`;

  return (
    <main className="b2c-shell next-b2c-table-classic-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="next-b2c-classic-warning"><strong>Some workspace resources were delayed.</strong><span>Refresh the table while the service recovers.</span></div> : null}

      <section className="b2c-table-workspace" aria-label={database?.name || "B2C Table"}>
        <div className="b2c-table-view-head b2c-table-view-head--compact">
          <a className="b2c-back-to-library" href="/next/b2c/database"><span aria-hidden="true">←</span><span>All Databases</span></a>
          <div className="b2c-top-actions">
            <a className="b2c-secondary-btn" href={formHref}>Open Linked Form</a>
            <button type="button" className="b2c-secondary-btn" onClick={() => refresh()} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
            <a className="b2c-secondary-btn" href={exportHref}>Download Excel</a>
            <button type="button" className="b2c-primary-btn" onMouseEnter={preloadSchemaDialogs} onFocus={preloadSchemaDialogs} onClick={() => { preloadSchemaDialogs(); setSchemaOpen(true); }}>Configure Table</button>
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
                {visibleRecords.map((record) => <tr key={record.id}><td><span className="b2c-customer-code">{record.customerCode}</span></td>{fields.map((field) => <td key={`${record.id}-${field.id || field.key}`}><CellValue value={record.values?.[field.key]} field={field} record={record} /></td>)}<td>{record.createdByName}</td><td className="b2c-cell-muted">{formatDate(record.createdAt, true)}</td><td><div className="b2c-table-actions"><button type="button" className="b2c-icon-btn" title="Edit record" onMouseEnter={preloadRecordDialogs} onFocus={preloadRecordDialogs} onClick={() => { preloadRecordDialogs(); setEditor(record); }}>Edit</button><button type="button" className="b2c-icon-btn b2c-icon-btn--danger" title="Delete record" onMouseEnter={preloadRecordDialogs} onFocus={preloadRecordDialogs} onClick={() => { preloadRecordDialogs(); setDeleteTarget(record); }}>Delete</button></div></td></tr>)}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? <footer className="next-b2c-table-pagination next-b2c-classic-pagination"><span>Page {safePage} of {pageCount}</span><div><button type="button" onClick={() => setPage(1)} disabled={safePage === 1}>First</button><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>Previous</button><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={safePage === pageCount}>Next</button><button type="button" onClick={() => setPage(pageCount)} disabled={safePage === pageCount}>Last</button></div></footer> : null}
        </section>
      </section>

      {editor ? <RecordEditor record={editor} fields={fields} busy={busy === "record"} onClose={() => setEditor(null)} onSave={saveRecord} /> : null}
      {deleteTarget ? <DeleteRecordModal record={deleteTarget} busy={busy === "delete-record"} onClose={() => setDeleteTarget(null)} onConfirm={deleteRecord} /> : null}
      {schemaOpen ? <SchemaBuilder fields={fields} records={records} busy={busy === "schema"} onClose={() => setSchemaOpen(false)} onSave={saveSchema} /> : null}
    </main>
  );
}
