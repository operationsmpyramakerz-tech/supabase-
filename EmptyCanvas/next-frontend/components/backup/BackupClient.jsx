"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_CSV_SIZE = 25 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function fileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function filenameFromResponse(response, fallback) {
  const disposition = text(response.headers.get("Content-Disposition"));
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try { return decodeURIComponent(utf[1].replace(/["']/g, "")); } catch {}
  }
  const normal = disposition.match(/filename="?([^";]+)"?/i);
  return text(normal?.[1]) || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "database-export.csv";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1200);
}

async function readResponseError(response, fallback = "Request failed.") {
  const contentType = lower(response.headers.get("Content-Type"));
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return text(body?.error || body?.message || body?.details) || fallback;
  }
  const body = text(await response.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return body || `${fallback} (${response.status})`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body && !options.rawBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !lower(body?.error).includes("password")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok || body?.ok === false || body?.success === false) {
    throw new Error(text(body?.error || body?.message) || `Request failed with ${response.status}.`);
  }
  return body;
}

async function fetchDownload(url, fallbackName) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok) throw new Error(await readResponseError(response, "Export failed."));
  const blob = await response.blob();
  if (!blob?.size) throw new Error("The exported file is empty.");
  downloadBlob(blob, filenameFromResponse(response, fallbackName));
  return blob;
}

function initials(value) {
  return text(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "DB";
}

function moduleMark(value) {
  const clean = text(value);
  const marks = {
    Orders: "OR",
    Inventory: "IN",
    Events: "EV",
    Finance: "FI",
    B2B: "B2",
    B2C: "BC",
    Proposals: "PR",
    "Task Management": "TM",
    KPIs: "KP",
    "Users Center": "UC",
    System: "SY",
  };
  return marks[clean] || initials(clean);
}

function BackupIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    refresh: <><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18.5 9a7 7 0 0 0-11.8-2.6L4 9"/><path d="M5.5 15a7 7 0 0 0 11.8 2.6L20 15"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    chevron: <path d="m7 9 5 5 5-5"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg {...common}>{paths[name] || paths.database}</svg>;
}

function BackupSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    function pointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function keyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keyDown);
    };
  }, [open]);

  return (
    <div className={`next-backup-select ${open ? "is-open" : ""}`} ref={rootRef}>
      <span className="next-backup-select__label">{label}</span>
      <button type="button" className="next-backup-select__trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{selected?.label || "Select"}</span><BackupIcon name="chevron" />
      </button>
      {open ? (
        <div className="next-backup-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "is-selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
              <span>{option.label}</span>{option.value === value ? <BackupIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-backup-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Database Backup"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, footer = null, danger = false }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keyDown(event) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyDown);
    };
  }, [onClose]);

  return (
    <div className="next-backup-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-backup-modal__card ${danger ? "is-danger" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{danger ? "!" : "DB"}</span>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-backup-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function ImportModal({ table, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!file) return setError("Choose a CSV file first.");
    if (!/\.csv$/i.test(file.name || "") && lower(file.type) !== "text/csv") return setError("Only CSV files are allowed.");
    if (file.size > MAX_CSV_SIZE) return setError("CSV file is too large. Maximum size is 25 MB.");
    if (!text(password)) return setError("Admin password is required.");

    setBusy(true);
    try {
      setStage("Reading CSV…");
      const csvText = await file.text();
      if (!text(csvText)) throw new Error("CSV file is empty.");
      setStage("Validating schema…");
      const response = await fetch(`/api/backup/tables/${encodeURIComponent(table.key)}/import`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "X-Admin-Password": encodeURIComponent(text(password)),
          "X-CSV-Filename": encodeURIComponent(file.name || ""),
        },
        body: csvText,
      });
      if (response.status === 401) {
        const body = await response.json().catch(() => ({}));
        if (!lower(body?.error).includes("password")) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          throw new Error("Your session has expired.");
        }
        throw new Error(text(body?.error) || "Invalid admin password.");
      }
      if (!response.ok) throw new Error(await readResponseError(response, "CSV import failed."));
      const body = await response.json().catch(() => ({}));
      if (body?.ok === false) throw new Error(text(body?.error) || "CSV import failed.");
      onImported(body);
    } catch (submitError) {
      setError(submitError?.message || "CSV import failed.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <Modal
      title={`Import ${text(table.pageName) || "table"}`}
      subtitle={text(table.tableName)}
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <button type="button" className="next-backup-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="nextBackupImportForm" className="next-backup-btn primary" disabled={busy}>{busy ? stage || "Importing…" : "Import CSV"}</button>
        </>
      )}
    >
      <form id="nextBackupImportForm" className="next-backup-form" onSubmit={submit}>
        <div className="next-backup-safe-note">
          <strong>Schema validation is enabled</strong>
          <span>The CSV headers must match the actual Supabase table. Rows with IDs are upserted; rows without IDs are inserted.</span>
        </div>
        <label className="next-backup-file-picker">
          <span>CSV file</span>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} />
          <div>
            <b>{file ? file.name : "Choose CSV file"}</b>
            <small>{file ? `${fileSize(file.size)} • Ready to validate` : "Maximum file size: 25 MB"}</small>
          </div>
        </label>
        <label><span>Admin password *</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" placeholder="Enter admin password" /></label>
        {error ? <div className="next-backup-inline-error">{error}</div> : null}
      </form>
    </Modal>
  );
}

function DeleteModal({ target, onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const isAll = target?.isAll;
  const label = isAll ? "all system data" : (text(target?.pageName) || text(target?.tableName) || "table data");
  const confirmationText = isAll ? "DELETE ALL DATA" : "DELETE TABLE DATA";

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!text(password)) return setError("Admin password is required.");
    if (text(confirmed).toUpperCase() !== confirmationText) return setError(`Type ${confirmationText} exactly to continue.`);

    setBusy(true);
    try {
      setStage(isAll ? "Exporting full ZIP…" : "Exporting CSV…");
      const exportUrl = isAll ? "/api/backup/export-all" : `/api/backup/tables/${encodeURIComponent(target.key)}/download`;
      const fallbackName = isAll ? `database-export-${Date.now()}.zip` : `${text(target.tableName) || "table"}-${Date.now()}.csv`;
      await fetchDownload(exportUrl, fallbackName);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setStage("Deleting data…");
      const deleteUrl = isAll ? "/api/backup/delete-all" : `/api/backup/tables/${encodeURIComponent(target.key)}`;
      const result = await requestJson(deleteUrl, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: text(password) }),
      });
      onDeleted(result);
    } catch (submitError) {
      setError(submitError?.message || "The data could not be deleted.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <Modal
      title={isAll ? "Delete all database data?" : `Delete ${label}?`}
      subtitle="The export must finish successfully before deletion begins."
      danger
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <button type="button" className="next-backup-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="nextBackupDeleteForm" className="next-backup-btn danger" disabled={busy}>{busy ? stage || "Deleting…" : "Export then delete"}</button>
        </>
      )}
    >
      <form id="nextBackupDeleteForm" className="next-backup-form" onSubmit={submit}>
        <div className="next-backup-danger-note">
          <strong>This action cannot be undone</strong>
          <span>{isAll ? "A ZIP backup will be downloaded, then rows from every configured database table will be permanently deleted." : `A CSV backup will be downloaded, then every row from “${text(target.tableName)}” will be permanently deleted.`}</span>
        </div>
        <label><span>Admin password *</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" placeholder="Enter admin password" /></label>
        <label><span>Type {confirmationText} *</span><input type="text" value={confirmed === false ? "" : confirmed} onChange={(event) => setConfirmed(event.target.value)} autoComplete="off" placeholder={confirmationText} /></label>
        {error ? <div className="next-backup-inline-error">{error}</div> : null}
      </form>
    </Modal>
  );
}

export default function BackupClient({ initialTables = [], bootstrapWarnings = [] }) {
  const [tables, setTables] = useState(() => Array.isArray(initialTables) ? initialTables : []);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [sensitivityFilter, setSensitivityFilter] = useState("all");
  const [sort, setSort] = useState("module-name");
  const [busyAction, setBusyAction] = useState("");
  const [importTarget, setImportTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const modules = useMemo(() => unique(tables.map((item) => item?.moduleName)).sort((a, b) => a.localeCompare(b)), [tables]);
  const sensitiveCount = useMemo(() => tables.filter((item) => item?.sensitive).length, [tables]);
  const moduleOptions = useMemo(() => [{ value: "all", label: "All modules" }, ...modules.map((module) => ({ value: module, label: module }))], [modules]);
  const sensitivityOptions = [
    { value: "all", label: "All tables" },
    { value: "standard", label: "Standard tables" },
    { value: "sensitive", label: "Sensitive tables" },
  ];
  const sortOptions = [
    { value: "module-name", label: "Module then name" },
    { value: "name", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
    { value: "table", label: "Table name" },
    { value: "sensitive", label: "Sensitive first" },
  ];

  const filteredTables = useMemo(() => {
    const needle = lower(query);
    const rows = tables.filter((item) => {
      if (moduleFilter !== "all" && text(item?.moduleName) !== moduleFilter) return false;
      if (sensitivityFilter === "sensitive" && !item?.sensitive) return false;
      if (sensitivityFilter === "standard" && item?.sensitive) return false;
      if (!needle) return true;
      return [item?.pageName, item?.tableName, item?.moduleName, item?.description, item?.key].some((value) => lower(value).includes(needle));
    });
    rows.sort((a, b) => {
      if (sort === "name-desc") return text(b?.pageName).localeCompare(text(a?.pageName));
      if (sort === "table") return text(a?.tableName).localeCompare(text(b?.tableName));
      if (sort === "sensitive") return Number(Boolean(b?.sensitive)) - Number(Boolean(a?.sensitive)) || text(a?.pageName).localeCompare(text(b?.pageName));
      if (sort === "name") return text(a?.pageName).localeCompare(text(b?.pageName));
      return text(a?.moduleName).localeCompare(text(b?.moduleName)) || text(a?.pageName).localeCompare(text(b?.pageName));
    });
    return rows;
  }, [tables, query, moduleFilter, sensitivityFilter, sort]);

  function showToast(type, title, message) {
    setToast({ type, title, message });
  }

  async function refresh() {
    setBusyAction("refresh");
    try {
      const body = await requestJson("/api/backup/tables");
      setTables(Array.isArray(body?.tables) ? body.tables : []);
      showToast("success", "Catalogue refreshed", "The configured Supabase table catalogue is up to date.");
    } catch (error) {
      showToast("error", "Refresh failed", error?.message || "Database tables could not be loaded.");
    } finally {
      setBusyAction("");
    }
  }

  async function exportOne(table) {
    const key = text(table?.key);
    if (!key) return;
    setBusyAction(`export-${key}`);
    try {
      await fetchDownload(`/api/backup/tables/${encodeURIComponent(key)}/download`, `${text(table.tableName) || "table"}-${Date.now()}.csv`);
      showToast("success", "CSV exported", `${text(table.pageName) || "Table"} was downloaded successfully.`);
    } catch (error) {
      showToast("error", "Export failed", error?.message || "The CSV could not be downloaded.");
    } finally {
      setBusyAction("");
    }
  }

  async function exportAll() {
    setBusyAction("export-all");
    try {
      await fetchDownload("/api/backup/export-all", `database-export-${Date.now()}.zip`);
      showToast("success", "Full backup exported", "The ZIP archive was downloaded successfully.");
    } catch (error) {
      showToast("error", "Export failed", error?.message || "The full backup could not be downloaded.");
    } finally {
      setBusyAction("");
    }
  }

  function clearFilters() {
    setQuery("");
    setModuleFilter("all");
    setSensitivityFilter("all");
    setSort("module-name");
  }

  return (
    <section className="next-backup-page next-backup-page--refined">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <article className="next-backup-hero next-backup-hero--refined">
        <div className="next-backup-hero__copy">
          <span className="next-backup-kicker">SYSTEM DATA</span>
          <h2>Database</h2>
          <p>Export, import and clear Supabase table data from one protected workspace.</p>
          {Array.isArray(bootstrapWarnings) && bootstrapWarnings.length ? <small>Some resources were unavailable during page load. Refresh the catalogue before making a destructive change.</small> : null}
        </div>
        <div className="next-backup-hero__actions">
          <button type="button" className="next-backup-btn secondary" onClick={refresh} disabled={Boolean(busyAction)}><BackupIcon name="refresh" /><span>{busyAction === "refresh" ? "Refreshing…" : "Refresh"}</span></button>
          <button type="button" className="next-backup-btn primary" onClick={exportAll} disabled={Boolean(busyAction)}><BackupIcon name="download" /><span>{busyAction === "export-all" ? "Preparing ZIP…" : "Export all"}</span></button>
          <button type="button" className="next-backup-btn danger-outline" onClick={() => setDeleteTarget({ isAll: true })} disabled={Boolean(busyAction)}><BackupIcon name="trash" /><span>Delete all</span></button>
        </div>
      </article>

      <div className="next-backup-summary">
        <article><span>DB</span><div><small>Configured tables</small><strong>{tables.length.toLocaleString()}</strong><p>Available for controlled backup</p></div></article>
        <article><span>MD</span><div><small>System modules</small><strong>{modules.length.toLocaleString()}</strong><p>Grouped by ERP workspace</p></div></article>
        <article><span>SC</span><div><small>Sensitive tables</small><strong>{sensitiveCount.toLocaleString()}</strong><p>Identity, access or audit data</p></div></article>
        <article><span>FM</span><div><small>Backup formats</small><strong>2</strong><p>CSV per table and full ZIP</p></div></article>
      </div>

      <article className="next-backup-toolbar next-backup-toolbar--modern">
        <label className="next-backup-search">
          <span>Search tables</span>
          <div className="next-backup-search__field"><BackupIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Page, table, module…" /></div>
        </label>
        <BackupSelect label="Module" value={moduleFilter} options={moduleOptions} onChange={setModuleFilter} />
        <BackupSelect label="Sensitivity" value={sensitivityFilter} options={sensitivityOptions} onChange={setSensitivityFilter} />
        <BackupSelect label="Sort by" value={sort} options={sortOptions} onChange={setSort} />
        <div className="next-backup-toolbar__result"><strong>{filteredTables.length}</strong><span>of {tables.length} tables</span></div>
        <button type="button" className="next-backup-clear" onClick={clearFilters}>Clear filters</button>
      </article>

      <article className="next-backup-list-card">
        <header>
          <div><span className="next-backup-kicker">DATABASE TABLES</span><h2>Tables</h2></div>
          <p><strong>{filteredTables.length}</strong> visible · Imports and deletes require the admin password.</p>
        </header>
        {filteredTables.length ? (
          <div className="next-backup-grid">
            {filteredTables.map((table) => {
              const key = text(table?.key);
              const exporting = busyAction === `export-${key}`;
              return (
                <article className={`next-backup-table-card ${table?.sensitive ? "is-sensitive" : ""}`} key={key || table.tableName}>
                  <header>
                    <span className="next-backup-module-mark">{moduleMark(table?.moduleName)}</span>
                    <div><small>{text(table?.moduleName) || "System"}</small><h3>{text(table?.pageName) || "Database table"}</h3></div>
                    {table?.sensitive ? <em>Sensitive</em> : null}
                  </header>
                  <div className="next-backup-table-name"><span>Supabase table</span><code>{text(table?.tableName) || "table"}</code></div>
                  <p>{text(table?.description) || "System data stored in Supabase."}</p>
                  <footer>
                    <button type="button" className="next-backup-card-btn export" onClick={() => exportOne(table)} disabled={Boolean(busyAction)}><BackupIcon name="download" /><span>{exporting ? "Exporting…" : "Export"}</span></button>
                    <button type="button" className="next-backup-card-btn import" onClick={() => setImportTarget(table)} disabled={Boolean(busyAction)}><BackupIcon name="upload" /><span>Import</span></button>
                    <button type="button" className="next-backup-card-btn delete" onClick={() => setDeleteTarget(table)} disabled={Boolean(busyAction)}><BackupIcon name="trash" /><span>Delete</span></button>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="next-backup-empty"><span>DB</span><h3>No tables match the current filters</h3><p>Clear the search and filters to show the full backup catalogue.</p><button type="button" onClick={clearFilters}>Clear filters</button></div>
        )}
      </article>

      <article className="next-backup-guidance">
        <div><span>1</span><strong>Export</strong><p>Create a CSV or full ZIP before changing database content.</p></div>
        <div><span>2</span><strong>Validate</strong><p>Imports are checked against the real Supabase table schema.</p></div>
        <div><span>3</span><strong>Protect</strong><p>Restore and delete operations require the Backup admin password.</p></div>
        <div><span>4</span><strong>Audit</strong><p>Imports and deletions are recorded in System History.</p></div>
      </article>

      {importTarget ? <ImportModal table={importTarget} onClose={() => setImportTarget(null)} onImported={(body) => { setImportTarget(null); showToast("success", "CSV imported", `${Number(body?.importedRows || 0).toLocaleString()} row${Number(body?.importedRows || 0) === 1 ? "" : "s"} imported into ${text(body?.tableName) || text(importTarget?.tableName)}.`); refresh(); }} /> : null}
      {deleteTarget ? <DeleteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={(body) => { const wasAll = Boolean(deleteTarget?.isAll); setDeleteTarget(null); showToast("success", wasAll ? "Database cleared" : "Table cleared", wasAll ? `The export was downloaded and ${Number(body?.deletedTables?.length || 0).toLocaleString()} configured tables were cleared.` : "The CSV was downloaded and all rows were deleted from the selected table."); refresh(); }} /> : null}
    </section>
  );
}
