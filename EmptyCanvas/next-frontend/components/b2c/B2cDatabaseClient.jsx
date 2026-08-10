"use client";

import { useEffect, useMemo, useState } from "react";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value) { return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(number(value)); }
function normalizeDatabase(database, index = 0) {
  return {
    id: text(database?.id) || `database-${index}`,
    key: text(database?.key),
    name: text(database?.name) || "Untitled Table",
    description: text(database?.description),
    fieldCount: Math.max(0, number(database?.fieldCount)),
    recordCount: Math.max(0, number(database?.recordCount)),
    defaultFormId: text(database?.defaultFormId),
    createdAt: text(database?.createdAt),
    updatedAt: text(database?.updatedAt),
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
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-b2c-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "B2C Database"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function ClassicModal({ title, subtitle, eyebrow = "B2C data table", children, onClose, wide = false }) {
  return (
    <div className="b2c-overlay next-b2c-classic-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget || event.target.classList.contains("b2c-overlay__backdrop")) onClose(); }}>
      <div className="b2c-overlay__backdrop" />
      <section className={`b2c-dialog ${wide ? "" : "b2c-dialog--small"}`} role="dialog" aria-modal="true" aria-label={title}>
        <button className="b2c-dialog__close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="b2c-dialog__header">
          <div><span className="b2c-eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        {children}
      </section>
    </div>
  );
}

function DatabaseFormModal({ dialog, busy, onClose, onSubmit }) {
  const database = dialog?.database || null;
  const [name, setName] = useState(database?.name || "");
  const [description, setDescription] = useState(database?.description || "");
  const [error, setError] = useState("");
  const isEdit = dialog?.mode === "edit";
  const submit = async (event) => {
    event.preventDefault();
    const cleanName = text(name);
    if (!cleanName) return setError("Table name is required.");
    setError("");
    try { await onSubmit({ name: cleanName, description: text(description) }); }
    catch (submitError) { setError(submitError?.message || "The table could not be saved."); }
  };
  return (
    <ClassicModal
      title={isEdit ? "Edit B2C Table" : "Create B2C Table"}
      subtitle={isEdit ? "Update the table name and description without changing its records." : "Each table has a separate schema, record numbering, records, and linked forms."}
      eyebrow={isEdit ? "Table settings" : "New data table"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="b2c-form-grid">
          <label className="b2c-form-control b2c-form-control--wide"><span>Table name <em>*</em></span><input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Customers Data" /></label>
          <label className="b2c-form-control b2c-form-control--wide"><span>Description</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What information will this table store?" /></label>
        </div>
        {error ? <div className="b2c-dialog__error">{error}</div> : null}
        <div className="b2c-dialog__actions">
          <button type="button" className="b2c-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="b2c-primary-btn" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save Changes" : "Create Table"}</button>
        </div>
      </form>
    </ClassicModal>
  );
}

function DeleteModal({ database, busy, onClose, onConfirm }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const matches = text(confirmation) === database.name;
  const submit = async (event) => {
    event.preventDefault();
    if (!matches) return setError("Type the exact table name to confirm deletion.");
    setError("");
    try { await onConfirm(); }
    catch (submitError) { setError(submitError?.message || "The table could not be deleted."); }
  };
  return (
    <ClassicModal title="Delete database?" subtitle={`You’re going to permanently delete “${database.name}”, including all properties, forms, and records.`} eyebrow="Permanent action" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="next-b2c-classic-delete-summary"><strong>{database.name}</strong><span>{formatNumber(database.fieldCount)} properties · {formatNumber(database.recordCount)} records</span></div>
        <div className="b2c-form-grid"><label className="b2c-form-control b2c-form-control--wide"><span>Type “{database.name}” to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label></div>
        {error ? <div className="b2c-dialog__error">{error}</div> : null}
        <div className="b2c-dialog__actions"><button type="button" className="b2c-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="b2c-primary-btn next-b2c-danger-btn" disabled={busy || !matches}>{busy ? "Deleting…" : "Delete Permanently"}</button></div>
      </form>
    </ClassicModal>
  );
}

function DatabaseCard({ database, busy, menuOpen, onToggleMenu, onEdit, onCopy, onDelete }) {
  const openUrl = `/next/b2c/database/${encodeURIComponent(database.id)}`;
  const exportUrl = `/api/b2c/databases/${encodeURIComponent(database.id)}/export.xlsx`;
  const caption = `${formatNumber(database.fieldCount)} ${database.fieldCount === 1 ? "property" : "properties"} · ${formatNumber(database.recordCount)} ${database.recordCount === 1 ? "record" : "records"}`;
  return (
    <div className={`b2c-folder-card ${menuOpen ? "is-actions-open" : ""}`}>
      <a className="b2c-folder" href={openUrl} aria-label={`Open ${database.name}`} title={database.description || database.name}>
        <div className="b2c-folder__figure" aria-hidden="true"><span className="b2c-folder__paper b2c-folder__paper--left" /><span className="b2c-folder__paper b2c-folder__paper--middle" /><span className="b2c-folder__paper b2c-folder__paper--right" /></div>
        <div className="b2c-folder__name" title={database.name}>{database.name}</div>
        <div className="b2c-folder__caption">{caption}</div>
      </a>
      <div className="b2c-folder-actions">
        <button className="b2c-folder__menu-btn" type="button" aria-label="Table actions" aria-expanded={menuOpen} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleMenu(); }}><span className="b2c-folder__menu-dots" aria-hidden="true">•••</span></button>
        <div className="b2c-folder__actions-menu">
          <button type="button" onClick={() => onEdit(database)} disabled={Boolean(busy)}><span>Edit</span></button>
          <button type="button" onClick={() => onCopy(database)} disabled={Boolean(busy)}><span>{busy === `copy:${database.id}` ? "Copying…" : "Make a copy"}</span></button>
          <a href={exportUrl} download><span>Download Excel</span></a>
          <button type="button" className="is-danger" onClick={() => onDelete(database)} disabled={Boolean(busy)}><span>Delete</span></button>
        </div>
      </div>
    </div>
  );
}

export default function B2cDatabaseClient({ initialPayload, bootstrapWarnings = [] }) {
  const [databases, setDatabases] = useState(() => (Array.isArray(initialPayload?.databases) ? initialPayload.databases : []).map(normalizeDatabase));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated-desc");
  const [dialog, setDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState("");

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search B2C databases...";
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => { input.removeEventListener("input", handle); input.value = ""; input.placeholder = "Search"; };
  }, []);

  useEffect(() => {
    const close = (event) => { if (!event.target.closest(".b2c-folder-actions")) setMenuOpen(""); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const visibleDatabases = useMemo(() => {
    const needle = lower(query);
    const list = databases.filter((database) => !needle || [database.name, database.description, database.key].some((value) => lower(value).includes(needle)));
    return [...list].sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sort === "name-desc") return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      if (sort === "records-desc") return b.recordCount - a.recordCount || a.name.localeCompare(b.name);
      if (sort === "fields-desc") return b.fieldCount - a.fieldCount || a.name.localeCompare(b.name);
      if (sort === "created-desc") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });
  }, [databases, query, sort]);

  const notify = (message, type = "success", title = "B2C Database") => setToast({ message, type, title });
  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setBusy("refresh");
    try {
      const payload = await requestJson("/api/b2c/databases");
      setDatabases((Array.isArray(payload?.databases) ? payload.databases : []).map(normalizeDatabase));
      if (!silent) notify("Database folders were refreshed.");
    } catch (error) { notify(error?.message || "Unable to refresh B2C databases.", "error"); throw error; }
    finally { if (!silent) setBusy(""); }
  };
  const saveDatabase = async ({ name, description }) => {
    const isEdit = dialog?.mode === "edit";
    const database = dialog?.database;
    setBusy(isEdit ? `edit:${database?.id}` : "create");
    try {
      const payload = await requestJson(isEdit ? `/api/b2c/databases/${encodeURIComponent(database.id)}` : "/api/b2c/databases", { method: isEdit ? "PATCH" : "POST", body: JSON.stringify({ name, description }) });
      setDialog(null);
      await refresh({ silent: true });
      notify(isEdit ? `“${name}” was updated.` : `“${name}” was created.`);
      if (!isEdit && payload?.database?.id) window.location.href = `/next/b2c/database/${encodeURIComponent(payload.database.id)}`;
    } finally { setBusy(""); }
  };
  const copyDatabase = async (database) => {
    setMenuOpen("");
    if (!window.confirm(`Make a copy of “${database.name}”? The copy keeps properties and form layouts without copying customer records.`)) return;
    setBusy(`copy:${database.id}`);
    try { const payload = await requestJson(`/api/b2c/databases/${encodeURIComponent(database.id)}/copy`, { method: "POST" }); await refresh({ silent: true }); notify(`“${payload?.database?.name || `${database.name} Copy`}” was created.`); }
    catch (error) { notify(error?.message || "The database table could not be copied.", "error"); }
    finally { setBusy(""); }
  };
  const deleteDatabase = async () => {
    if (!deleteTarget) return;
    setBusy(`delete:${deleteTarget.id}`);
    try {
      await requestJson(`/api/b2c/databases/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const id = deleteTarget.id; const deletedName = deleteTarget.name;
      setDeleteTarget(null); setDatabases((current) => current.filter((database) => database.id !== id)); notify(`“${deletedName}” was permanently deleted.`);
    } finally { setBusy(""); }
  };

  return (
    <main className="b2c-shell next-b2c-classic-library">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="next-b2c-classic-warning"><strong>Some B2C resources did not finish loading.</strong><span>Refresh this page or use the Classic interface while the service recovers.</span><a href="/b2c/database?classic=1">Classic Database</a></div> : null}
      <section className="b2c-library-workspace" aria-labelledby="b2cDatabaseTitle">
        <div className="b2c-library-workspace__head">
          <div><span className="b2c-eyebrow">B2C data workspace</span><h2 id="b2cDatabaseTitle">Your databases</h2><p>Create independent customer data tables. Every table keeps its own properties, records, forms, and record-ID sequence.</p></div>
          <div className="b2c-top-actions">
            <label className="b2c-library-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated-desc">Recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="records-desc">Most records</option><option value="fields-desc">Most properties</option></select></label>
            <button className="b2c-secondary-btn b2c-compact-btn" type="button" onClick={() => refresh().catch(() => {})} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
            <a className="b2c-secondary-btn b2c-compact-btn" href="/next/b2c/forms">Forms</a>
            <button className="b2c-primary-btn" type="button" onClick={() => setDialog({ mode: "create" })}>+ New Table</button>
          </div>
        </div>
        <div className="b2c-library-summary"><div><div><small>Data tables</small><strong>{databases.length}</strong></div></div><p>{databases.length ? "Choose a folder to open its dedicated table page." : "Create your first B2C database table to begin."}</p></div>
        <section className="b2c-folders-panel">
          <div className="b2c-folders-panel__head"><div><h3>Database folders</h3><p>Open a folder to manage its properties, records, Excel export, and linked forms.</p></div><span>{visibleDatabases.length} table{visibleDatabases.length === 1 ? "" : "s"}</span></div>
          <div className="b2c-folders-grid">
            {visibleDatabases.length ? visibleDatabases.map((database) => <DatabaseCard key={database.id} database={database} busy={busy} menuOpen={menuOpen === database.id} onToggleMenu={() => setMenuOpen((current) => current === database.id ? "" : database.id)} onEdit={(item) => { setMenuOpen(""); setDialog({ mode: "edit", database: item }); }} onCopy={copyDatabase} onDelete={(item) => { setMenuOpen(""); setDeleteTarget(item); }} />) : <div className="b2c-folder-empty"><strong>{databases.length ? "No matching tables" : "No data tables yet"}</strong><span>{databases.length ? "Try another phrase in the page search." : "Create the first B2C table to add independent records and forms."}</span></div>}
          </div>
        </section>
      </section>
      {dialog ? <DatabaseFormModal dialog={dialog} busy={Boolean(busy)} onClose={() => setDialog(null)} onSubmit={saveDatabase} /> : null}
      {deleteTarget ? <DeleteModal database={deleteTarget} busy={Boolean(busy)} onClose={() => setDeleteTarget(null)} onConfirm={deleteDatabase} /> : null}
    </main>
  );
}
