"use client";

import { useMemo, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(number(value));
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

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

function apiErrorMessage(body, fallback) {
  return text(body?.error || body?.message) || fallback;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
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
      <div>
        <strong>{toast.title || "B2C Database"}</strong>
        <span>{toast.message}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose, danger = false }) {
  return (
    <div className="next-b2c-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-b2c-modal__card ${danger ? "is-danger" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{danger ? "!" : "DB"}</span>
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-b2c-modal__body">{children}</div>
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
    try {
      await onSubmit({ name: cleanName, description: text(description) });
    } catch (submitError) {
      setError(submitError?.message || "The table could not be saved.");
    }
  };

  return (
    <Modal
      title={isEdit ? "Edit B2C Table" : "Create B2C Table"}
      subtitle={isEdit ? "Update the folder name and description without changing its records." : "Create an independent customer database with its own properties, forms, and record sequence."}
      onClose={onClose}
    >
      <form className="next-b2c-form" onSubmit={submit}>
        <label>
          <span>Table Name *</span>
          <input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Customers Data" />
        </label>
        <label>
          <span>Description</span>
          <textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What information will this table store?" />
        </label>
        {error ? <div className="next-b2c-error">{error}</div> : null}
        <div className="next-b2c-form__actions">
          <button type="button" className="next-b2c-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-b2c-btn primary" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save Changes" : "Create Table"}</button>
        </div>
      </form>
    </Modal>
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
    try {
      await onConfirm();
    } catch (submitError) {
      setError(submitError?.message || "The table could not be deleted.");
    }
  };

  return (
    <Modal title="Delete B2C Table?" subtitle="This action permanently removes the table, properties, forms, and all customer records." onClose={onClose} danger>
      <form className="next-b2c-form" onSubmit={submit}>
        <div className="next-b2c-delete-warning">
          <strong>{database.name}</strong>
          <span>{formatNumber(database.fieldCount)} properties · {formatNumber(database.recordCount)} records</span>
        </div>
        <label>
          <span>Type “{database.name}” to confirm</span>
          <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        {error ? <div className="next-b2c-error">{error}</div> : null}
        <div className="next-b2c-form__actions">
          <button type="button" className="next-b2c-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-b2c-btn danger" disabled={busy || !matches}>{busy ? "Deleting…" : "Delete Permanently"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DatabaseCard({ database, busy, onEdit, onCopy, onDelete }) {
  const openUrl = `/b2c/database/${encodeURIComponent(database.id)}`;
  const exportUrl = `/api/b2c/databases/${encodeURIComponent(database.id)}/export.xlsx`;

  return (
    <article className="next-b2c-card">
      <div className="next-b2c-card__folder" aria-hidden="true">
        <span /><span /><span />
        <b>DB</b>
      </div>
      <div className="next-b2c-card__body">
        <div className="next-b2c-card__heading">
          <div>
            <span className="next-b2c-chip">Customer Database</span>
            <h3>{database.name}</h3>
          </div>
          <em>{database.key || "Independent table"}</em>
        </div>
        <p>{database.description || "No description has been added to this database table."}</p>
        <div className="next-b2c-card__metrics">
          <span><strong>{formatNumber(database.fieldCount)}</strong><small>Properties</small></span>
          <span><strong>{formatNumber(database.recordCount)}</strong><small>Records</small></span>
          <span><strong>{database.defaultFormId ? "Ready" : "—"}</strong><small>Default Form</small></span>
        </div>
        <div className="next-b2c-card__dates">
          <span>Created <strong>{formatDate(database.createdAt)}</strong></span>
          <span>Updated <strong>{formatDate(database.updatedAt || database.createdAt)}</strong></span>
        </div>
      </div>
      <footer>
        <a className="next-b2c-btn primary" href={openUrl}>Open Workspace</a>
        <div className="next-b2c-card__actions">
          <button type="button" onClick={() => onEdit(database)} disabled={busy}>Edit</button>
          <button type="button" onClick={() => onCopy(database)} disabled={busy}>{busy === `copy:${database.id}` ? "Copying…" : "Copy"}</button>
          <a href={exportUrl} download>Excel</a>
          <button type="button" className="danger" onClick={() => onDelete(database)} disabled={busy}>Delete</button>
        </div>
      </footer>
    </article>
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

  const stats = useMemo(() => {
    const totalFields = databases.reduce((sum, database) => sum + database.fieldCount, 0);
    const totalRecords = databases.reduce((sum, database) => sum + database.recordCount, 0);
    const readyForms = databases.filter((database) => database.defaultFormId).length;
    return {
      tables: databases.length,
      fields: totalFields,
      records: totalRecords,
      average: databases.length ? totalRecords / databases.length : 0,
      readyForms,
    };
  }, [databases]);

  const visibleDatabases = useMemo(() => {
    const needle = lower(query);
    const list = databases.filter((database) => {
      if (!needle) return true;
      return [database.name, database.description, database.key].some((value) => lower(value).includes(needle));
    });

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
    } catch (error) {
      notify(error?.message || "Unable to refresh B2C databases.", "error");
      throw error;
    } finally {
      if (!silent) setBusy("");
    }
  };

  const saveDatabase = async ({ name, description }) => {
    const isEdit = dialog?.mode === "edit";
    const database = dialog?.database;
    const actionKey = isEdit ? `edit:${database?.id}` : "create";
    setBusy(actionKey);
    try {
      const payload = await requestJson(isEdit ? `/api/b2c/databases/${encodeURIComponent(database.id)}` : "/api/b2c/databases", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({ name, description }),
      });
      setDialog(null);
      await refresh({ silent: true });
      notify(isEdit ? `“${name}” was updated.` : `“${name}” was created.`);
      if (!isEdit && payload?.database?.id) {
        window.location.href = `/b2c/database/${encodeURIComponent(payload.database.id)}`;
      }
    } finally {
      setBusy("");
    }
  };

  const copyDatabase = async (database) => {
    if (!window.confirm(`Make a copy of “${database.name}”? The copy keeps properties and form layouts without copying customer records.`)) return;
    setBusy(`copy:${database.id}`);
    try {
      const payload = await requestJson(`/api/b2c/databases/${encodeURIComponent(database.id)}/copy`, { method: "POST" });
      await refresh({ silent: true });
      notify(`“${payload?.database?.name || `${database.name} Copy`}” was created.`);
    } catch (error) {
      notify(error?.message || "The database table could not be copied.", "error");
    } finally {
      setBusy("");
    }
  };

  const deleteDatabase = async () => {
    if (!deleteTarget) return;
    setBusy(`delete:${deleteTarget.id}`);
    try {
      await requestJson(`/api/b2c/databases/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const deletedName = deleteTarget.name;
      setDeleteTarget(null);
      setDatabases((current) => current.filter((database) => database.id !== deleteTarget.id));
      notify(`“${deletedName}” was permanently deleted.`);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="next-b2c-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {bootstrapWarnings.length ? (
        <div className="next-b2c-warning" role="status">
          <strong>Some B2C resources did not finish loading.</strong>
          <span>Refresh this page or open the classic interface while the service recovers.</span>
          <a href="/b2c/database">Open classic Database</a>
        </div>
      ) : null}

      <section className="next-b2c-hero">
        <div>
          <span className="next-b2c-eyebrow">B2C data workspace</span>
          <h2>Independent customer databases, organized like folders.</h2>
          <p>Each table keeps its own schema, records, linked forms, and record-number sequence while the current Express APIs remain responsible for all business rules.</p>
          <div className="next-b2c-hero__actions">
            <button type="button" className="next-b2c-btn primary" onClick={() => setDialog({ mode: "create" })}>+ New Table</button>
            <a className="next-b2c-btn secondary" href="/b2c/form">Open Forms</a>
            <button type="button" className="next-b2c-btn secondary" onClick={() => refresh()} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        <aside aria-hidden="true">
          <span className="next-b2c-hero__database">DB</span>
          <i /><i /><i />
        </aside>
      </section>

      <section className="next-b2c-stats" aria-label="B2C database summary">
        <article><span>Database Tables</span><strong>{formatNumber(stats.tables)}</strong><small>Independent workspaces</small></article>
        <article><span>Properties</span><strong>{formatNumber(stats.fields)}</strong><small>Configured fields</small></article>
        <article><span>Customer Records</span><strong>{formatNumber(stats.records)}</strong><small>Across all tables</small></article>
        <article><span>Average Records</span><strong>{formatNumber(stats.average)}</strong><small>{formatNumber(stats.readyForms)} default forms ready</small></article>
      </section>

      <section className="next-b2c-library">
        <header>
          <div>
            <span>Database folders</span>
            <h3>Your B2C Tables</h3>
            <p>Open a folder to manage properties, records, Excel exports, and linked forms.</p>
          </div>
          <em>{visibleDatabases.length} of {databases.length} tables</em>
        </header>

        <div className="next-b2c-toolbar">
          <label className="next-b2c-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by table name, description, or key…" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button> : null}
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="updated-desc">Recently updated</option>
              <option value="created-desc">Recently created</option>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="records-desc">Most records</option>
              <option value="fields-desc">Most properties</option>
            </select>
          </label>
        </div>

        {visibleDatabases.length ? (
          <div className="next-b2c-grid">
            {visibleDatabases.map((database) => (
              <DatabaseCard
                key={database.id}
                database={database}
                busy={busy}
                onEdit={(item) => setDialog({ mode: "edit", database: item })}
                onCopy={copyDatabase}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <div className="next-b2c-empty">
            <span>{databases.length ? "⌕" : "DB"}</span>
            <h3>{databases.length ? "No matching tables" : "No B2C database tables yet"}</h3>
            <p>{databases.length ? "Change the search phrase or sorting option." : "Create the first independent customer database to begin adding properties, records, and forms."}</p>
            {!databases.length ? <button type="button" className="next-b2c-btn primary" onClick={() => setDialog({ mode: "create" })}>Create First Table</button> : null}
          </div>
        )}
      </section>

      <section className="next-b2c-rollout-note">
        <div><strong>Incremental migration</strong><span>The database folder library now runs in Next.js. Individual table workspaces and the form builder remain on the classic interface until their dedicated migration stages.</span></div>
        <a href="/b2c/database">Classic Database</a>
      </section>

      {dialog ? <DatabaseFormModal dialog={dialog} busy={Boolean(busy)} onClose={() => setDialog(null)} onSubmit={saveDatabase} /> : null}
      {deleteTarget ? <DeleteModal database={deleteTarget} busy={Boolean(busy)} onClose={() => setDeleteTarget(null)} onConfirm={deleteDatabase} /> : null}
    </section>
  );
}
