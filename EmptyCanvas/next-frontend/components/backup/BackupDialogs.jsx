"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { confirmDelete as showDeleteConfirm } from "../../lib/client-confirm";

const MAX_CSV_SIZE = 25 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function Icon({ name = "upload" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const icons = {
    upload: <><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></>,
    "upload-cloud": <><path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.9 18.1A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 3 16.3"/></>,
    "trash-2": <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
    x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    "alert-triangle": <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    check: <path d="m20 6-11 11-5-5"/>,
  };
  return <svg {...common}>{icons[name] || icons.upload}</svg>;
}

function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function BackupToast({ toast }) {
  if (!toast) return null;
  return (
    <Portal>
      <div className={`backup-toast ${toast.variant === "danger" ? "backup-toast--danger" : ""} is-visible`} role="status" aria-live="polite">
        <Icon name={toast.variant === "danger" ? "alert-triangle" : "check"} />
        <span>{toast.message}</span>
      </div>
    </Portal>
  );
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
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "database-export.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch {}
    link.remove();
  }, 1200);
}

async function readResponseError(response, fallback = "Request failed.") {
  const contentType = lower(response.headers.get("Content-Type"));
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return text(body?.error || body?.message || body?.details) || fallback;
  }
  const body = text(await response.text().catch(() => ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return body || `${fallback} (${response.status})`;
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
  if (!response.ok) throw new Error(await readResponseError(response, "Export failed, so delete was stopped."));
  const blob = await response.blob();
  if (!blob?.size) throw new Error("Export file is empty, so delete was stopped.");
  downloadBlob(blob, filenameFromResponse(response, fallbackName));
  return blob;
}

export default function BackupDialogs({ mode, target, onClose, onSuccess, onToast }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    document.body.classList.add("backup-modal-open");
    function keyDown(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.body.classList.remove("backup-modal-open");
      document.removeEventListener("keydown", keyDown);
    };
  }, [busy, onClose]);

  async function confirmImport() {
    if (!target || busy) return;
    if (!file) return setError("Choose a CSV file first.");
    const fileName = lower(file.name);
    if (fileName && !fileName.endsWith(".csv")) return setError("Only CSV files are allowed.");
    if (file.size > MAX_CSV_SIZE) return setError("CSV file is too large. Maximum size is 25 MB.");
    if (!text(password)) return setError("Admin password is required.");

    setError("");
    setBusy(true);
    try {
      setStage("Preparing...");
      const ticket = await requestJson("/next/api/backup/import-ticket", {
        method: "POST",
        body: JSON.stringify({
          key: target.key,
          adminPassword: text(password),
          filename: file.name || "backup.csv",
          mime: file.type || "text/csv",
          size: Number(file.size || 0),
        }),
      });
      if (!ticket?.upload?.signedUrl || !ticket?.uploadPath) throw new Error("Could not prepare CSV upload.");

      setStage("Uploading...");
      const uploadResponse = await fetch(ticket.upload.signedUrl, {
        method: String(ticket.upload.method || "PUT").toUpperCase(),
        headers: ticket.upload.headers || {},
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`CSV upload failed with status ${uploadResponse.status}.`);

      setStage("Validating...");
      const body = await requestJson("/next/api/backup/mutations-direct", {
        method: "POST",
        body: JSON.stringify({
          action: "import",
          key: target.key,
          adminPassword: text(password),
          uploadPath: ticket.uploadPath,
        }),
      });
      const count = Number(body?.importedRows || 0);
      const message = `Imported ${count.toLocaleString()} row${count === 1 ? "" : "s"} into ${body?.tableName || target?.tableName}.`;
      setBusy(false);
      onClose?.();
      await onSuccess?.(message);
    } catch (err) {
      const message = err?.message || "Failed to import CSV data.";
      setError(message);
      onToast?.(message, "danger");
      setBusy(false);
      setStage("");
    }
  }

  async function confirmDelete() {
    if (!target || busy) return;
    const cleanPassword = text(password);
    if (!cleanPassword) return setError("Admin password is required.");

    const isAll = Boolean(target?.isAll);
    const confirmed = await showDeleteConfirm({
      title: isAll ? "Delete all system data?" : `Delete ${target?.pageName || "table data"}?`,
      itemType: isAll ? "system data" : "table data",
      itemName: isAll ? "all system data" : (target?.pageName || target?.tableName || "this table"),
      message: isAll
        ? "A complete ZIP backup will download first, then all rows from all database tables will be permanently deleted. This action cannot be undone."
        : `A CSV backup will download first, then every row from “${target?.tableName || "this table"}” will be permanently deleted. This action cannot be undone.`,
      cancelLabel: "No, keep it.",
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;

    setError("");
    setBusy(true);
    try {
      setStage("Exporting...");
      const exportUrl = isAll ? "/next/api/backup/export-direct?scope=all" : `/next/api/backup/export-direct?key=${encodeURIComponent(target.key)}`;
      const fallbackName = isAll ? `database-export-${Date.now()}.zip` : `${target?.tableName || "table"}-${Date.now()}.csv`;
      await fetchDownload(exportUrl, fallbackName);
      await new Promise((resolve) => window.setTimeout(resolve, 450));

      setStage("Deleting...");
      await requestJson("/next/api/backup/mutations-direct", {
        method: "POST",
        body: JSON.stringify({
          action: isAll ? "delete-all" : "delete-table",
          key: isAll ? "" : target.key,
          adminPassword: cleanPassword,
        }),
      });
      const message = isAll ? "Export downloaded and all data deleted." : "CSV downloaded and table data deleted.";
      setBusy(false);
      onClose?.();
      await onSuccess?.(message);
    } catch (err) {
      const message = err?.message || "Failed to delete data.";
      setError(message);
      onToast?.(message, "danger");
      setBusy(false);
      setStage("");
    }
  }

  if (!target || (mode !== "import" && mode !== "delete")) return null;

  if (mode === "delete") {
    return (
      <Portal>
        <div className="backup-delete-modal">
          <div className="backup-modal-backdrop" onMouseDown={() => { if (!busy) onClose?.(); }} />
          <section className="backup-delete-card" role="dialog" aria-modal="true" aria-labelledby="backupDeleteTitle">
            <button type="button" className="backup-modal-close" onClick={() => onClose?.()} aria-label="Close" disabled={busy}><Icon name="x" /></button>
            <div className="backup-delete-head">
              <span className="backup-delete-icon"><Icon name="trash-2" /></span>
              <div>
                <p className="backup-kicker">DELETE DATA</p>
                <h2 id="backupDeleteTitle">{target.isAll ? "Delete all data?" : `Delete ${target.pageName || target.tableName}?`}</h2>
              </div>
            </div>
            <p className="backup-delete-copy">
              {target.isAll
                ? "A ZIP export containing CSV files will download first, then all table rows will be deleted."
                : `A CSV export will download first, then all rows in “${target.tableName}” will be deleted.`}
            </p>
            <label className="backup-field">
              <span>Admin password</span>
              <input type="password" autoComplete="off" placeholder="Enter admin password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !busy) confirmDelete(); }} autoFocus />
            </label>
            {error ? <p className="backup-error">{error}</p> : null}
            <div className="backup-delete-actions">
              <button type="button" className="backup-cancel-btn" onClick={() => onClose?.()} disabled={busy}>Cancel</button>
              <button type="button" className={`backup-delete-next-btn ${busy ? "is-loading" : ""}`} onClick={confirmDelete} disabled={busy}>
                <Icon name="trash-2" /><span>{busy ? (stage || "Deleting...") : "Delete data"}</span>
              </button>
            </div>
          </section>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div className="backup-import-modal">
        <div className="backup-modal-backdrop" onMouseDown={() => { if (!busy) onClose?.(); }} />
        <section className="backup-import-card" role="dialog" aria-modal="true" aria-labelledby="backupImportTitle">
          <button type="button" className="backup-modal-close" onClick={() => onClose?.()} aria-label="Close" disabled={busy}><Icon name="x" /></button>
          <div className="backup-import-head">
            <span className="backup-import-icon"><Icon name="upload-cloud" /></span>
            <div>
              <p className="backup-kicker">IMPORT CSV</p>
              <h2 id="backupImportTitle">Import {target.pageName || target.tableName}</h2>
              <p className="backup-import-table">{target.tableName || ""}</p>
            </div>
          </div>
          <label className="backup-field backup-file-field">
            <span>CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} autoFocus />
          </label>
          <label className="backup-field">
            <span>Admin password</span>
            <input type="password" autoComplete="off" placeholder="Enter admin password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !busy) confirmImport(); }} />
          </label>
          <p className="backup-import-note"><Icon name="shield" /><span>The CSV header must match the selected Supabase table columns.</span></p>
          {error ? <p className="backup-error">{error}</p> : null}
          <div className="backup-import-actions">
            <button type="button" className="backup-cancel-btn" onClick={() => onClose?.()} disabled={busy}>Cancel</button>
            <button type="button" className={`backup-import-confirm-btn ${busy ? "is-loading" : ""}`} onClick={confirmImport} disabled={busy}>
              <Icon name="upload" /><span>{busy ? (stage || "Importing...") : "Import CSV"}</span>
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}
