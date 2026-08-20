"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

async function readError(response, fallback = "Request failed.") {
  const body = await response.json().catch(() => ({}));
  return text(body?.error || body?.message) || fallback;
}

function Icon({ name = "database" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    arrowLeft: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  };
  return <svg {...common}>{icons[name] || icons.database}</svg>;
}

function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function columnType(column = {}) {
  return lower(column?.type || column?.format || column?.raw?.format);
}

function displayValue(value) {
  if (value === null || typeof value === "undefined") return "NULL";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function editorValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function FieldEditor({ column, value, onChange }) {
  const type = columnType(column);
  const name = text(column?.name);
  if (/json|object|array/.test(type) || value.length > 160) {
    return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} spellCheck={false} />;
  }
  if (/boolean|bool/.test(type)) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">NULL</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  const inputType = /date|time/.test(type) && /date|time/.test(name.toLowerCase()) ? "text" : "text";
  return <input type={inputType} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />;
}

export default function BackupTableClient({ tableKey, initialTable }) {
  const [table, setTable] = useState(initialTable || null);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [accessLevel, setAccessLevel] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [draft, setDraft] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const pageSize = 50;

  async function loadRows(nextOffset = 0) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/backup/tables/${encodeURIComponent(tableKey)}/rows?limit=${pageSize}&offset=${Math.max(0, nextOffset)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!response.ok) throw new Error(await readError(response, "Failed to load table rows."));
      const body = await response.json();
      setTable(body?.table || initialTable || null);
      setColumns(Array.isArray(body?.columns) ? body.columns : []);
      setRows(Array.isArray(body?.rows) ? body.rows : []);
      setCanEdit(Boolean(body?.canEdit));
      setAccessLevel(text(body?.accessLevel));
      setOffset(Number(body?.offset || 0));
      setHasMore(Boolean(body?.hasMore));
    } catch (err) {
      setError(err?.message || "Failed to load table rows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows(0);
  }, [tableKey]);

  useEffect(() => {
    document.body.classList.toggle("backup-table-modal-open", Boolean(editRow));
    return () => document.body.classList.remove("backup-table-modal-open");
  }, [editRow]);

  const visibleColumns = useMemo(() => {
    const names = columns.map((column) => text(column?.name)).filter(Boolean);
    if (names.length) return columns;
    const found = [];
    const seen = new Set();
    rows.forEach((row) => Object.keys(row || {}).forEach((key) => {
      if (!seen.has(key)) { seen.add(key); found.push({ name: key }); }
    }));
    return found;
  }, [columns, rows]);

  const filteredRows = useMemo(() => {
    const needle = lower(query);
    if (!needle) return rows;
    return rows.filter((row) => visibleColumns.some((column) => lower(displayValue(row?.[column.name])).includes(needle)));
  }, [rows, visibleColumns, query]);

  function openEdit(row) {
    if (!canEdit) return;
    const next = {};
    visibleColumns.forEach((column) => { next[column.name] = editorValue(row?.[column.name]); });
    setEditRow(row);
    setDraft(next);
    setSaveError("");
  }

  function closeEdit() {
    if (saving) return;
    setEditRow(null);
    setDraft({});
    setSaveError("");
  }

  async function saveRow() {
    if (!editRow || !canEdit) return;
    const changes = {};
    visibleColumns.forEach((column) => {
      const key = column.name;
      const before = editorValue(editRow?.[key]);
      const after = String(draft?.[key] ?? "");
      if (before !== after) changes[key] = after;
    });
    if (!Object.keys(changes).length) return closeEdit();

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/backup/tables/${encodeURIComponent(tableKey)}/rows`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalRow: editRow, changes }),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to save row."));
      const body = await response.json();
      const updated = body?.row || { ...editRow, ...changes };
      setRows((current) => current.map((row) => row === editRow ? updated : row));
      setSaving(false);
      setEditRow(null);
      setDraft({});
    } catch (err) {
      setSaveError(err?.message || "Failed to save row.");
      setSaving(false);
    }
  }

  return (
    <main className="backup-table-page-shell">
      <section className="backup-table-toolbar card">
        <div className="backup-table-toolbar__title">
          <a className="backup-table-back" href="/next/backup" aria-label="Back to Database"><Icon name="arrowLeft" /></a>
          <span className="backup-table-title-icon"><Icon name="database" /></span>
          <div>
            <p className="backup-kicker">DATABASE TABLE</p>
            <h2>{table?.pageName || table?.tableName || "Table"}</h2>
            <p>{table?.tableName || ""}{table?.moduleName ? ` · ${table.moduleName}` : ""}</p>
          </div>
        </div>
        <div className="backup-table-toolbar__actions">
          <span className={`backup-table-access ${canEdit ? "is-admin" : ""}`}><Icon name="shield" />{canEdit ? "Admin editing enabled" : (accessLevel ? `${accessLevel} access` : "View only")}</span>
          <a className="backup-table-action" href={`/api/backup/tables/${encodeURIComponent(tableKey)}/download`} download><Icon name="download" /><span>Export</span></a>
          <button type="button" className="backup-table-action" onClick={() => loadRows(offset)} disabled={loading}><Icon name="refresh" /><span>Refresh</span></button>
        </div>
      </section>

      <section className="backup-table-workspace card">
        <div className="backup-table-workspace__head">
          <div className="backup-table-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loaded rows..." /></div>
          <div className="backup-table-page-meta">Rows {rows.length ? offset + 1 : 0}–{offset + rows.length}</div>
        </div>

        {error ? <div className="backup-table-state is-error">{error}<button type="button" onClick={() => loadRows(offset)}>Try again</button></div> : null}
        {!error && loading ? <div className="backup-table-state"><span className="backup-table-spinner" />Loading table rows...</div> : null}
        {!error && !loading && !rows.length ? <div className="backup-table-state"><Icon name="database" />This table has no rows.</div> : null}

        {!error && !loading && rows.length ? (
          <div className="backup-data-table-scroll">
            <table className="backup-data-table">
              <thead>
                <tr>
                  <th className="backup-data-row-number">#</th>
                  {visibleColumns.map((column) => <th key={column.name} title={columnType(column)}>{column.name}</th>)}
                  {canEdit ? <th className="backup-data-edit-head">Edit</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIndex) => (
                  <tr key={`${offset}-${rowIndex}-${String(row?.id ?? "")}`}>
                    <td className="backup-data-row-number">{offset + rowIndex + 1}</td>
                    {visibleColumns.map((column) => {
                      const value = row?.[column.name];
                      const display = displayValue(value);
                      return <td key={column.name} className={value === null || typeof value === "undefined" ? "is-null" : ""} title={display}>{display}</td>;
                    })}
                    {canEdit ? <td className="backup-data-edit-cell"><button type="button" onClick={() => openEdit(row)}><Icon name="edit" /><span>Edit</span></button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredRows.length ? <div className="backup-table-no-search">No rows on this page match your search.</div> : null}
          </div>
        ) : null}

        <div className="backup-table-pagination">
          <button type="button" onClick={() => loadRows(Math.max(0, offset - pageSize))} disabled={loading || offset <= 0}><Icon name="chevronLeft" /><span>Previous</span></button>
          <span>Page {Math.floor(offset / pageSize) + 1}</span>
          <button type="button" onClick={() => loadRows(offset + pageSize)} disabled={loading || !hasMore}><span>Next</span><Icon name="chevronRight" /></button>
        </div>
      </section>

      {editRow ? <Portal>
        <div className="backup-row-edit-modal">
          <div className="backup-modal-backdrop" onMouseDown={closeEdit} />
          <section className="backup-row-edit-card" role="dialog" aria-modal="true" aria-labelledby="backupRowEditTitle">
            <button type="button" className="backup-modal-close" onClick={closeEdit} disabled={saving} aria-label="Close"><Icon name="x" /></button>
            <div className="backup-row-edit-head">
              <span className="backup-table-title-icon"><Icon name="edit" /></span>
              <div><p className="backup-kicker">ADMIN EDIT</p><h2 id="backupRowEditTitle">Edit table row</h2><p>{table?.tableName || ""}</p></div>
            </div>
            <div className="backup-row-edit-grid">
              {visibleColumns.map((column) => (
                <label className="backup-row-field" key={column.name}>
                  <span><strong>{column.name}</strong>{columnType(column) ? <em>{columnType(column)}</em> : null}</span>
                  <FieldEditor column={column} value={String(draft?.[column.name] ?? "")} onChange={(value) => setDraft((current) => ({ ...current, [column.name]: value }))} />
                </label>
              ))}
            </div>
            {saveError ? <p className="backup-error">{saveError}</p> : null}
            <div className="backup-row-edit-actions">
              <button type="button" className="backup-cancel-btn" onClick={closeEdit} disabled={saving}>Cancel</button>
              <button type="button" className="backup-row-save-btn" onClick={saveRow} disabled={saving}><Icon name="save" /><span>{saving ? "Saving..." : "Save changes"}</span></button>
            </div>
          </section>
        </div>
      </Portal> : null}
    </main>
  );
}
