"use client";

import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function dateValue(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return text(value) || "—";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "—";
  if (amount < 1000) return `${Math.round(amount)} ms`;
  return `${(amount / 1000).toFixed(amount >= 10000 ? 1 : 2)} s`;
}

function initials(value) {
  return text(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SY";
}

function entityLabel(row) {
  const explicit = text(row?.entityLabel || row?.entityId);
  if (explicit) return explicit;
  const action = lower(row?.actionLabel);
  if ((action.includes("signed in") || action.includes("signed out")) && text(row?.actorName)) return text(row.actorName);
  return "No linked entity";
}

function actionTone(row) {
  const action = lower(row?.actionLabel);
  const method = text(row?.method).toUpperCase();
  const status = Number(row?.statusCode || 0);
  if (status >= 400 || action.includes("reject") || action.includes("delete")) return "danger";
  if (action.includes("approve") || action.includes("complete") || action.includes("deliver")) return "success";
  if (action.includes("archive") || method === "PATCH" || method === "PUT") return "warning";
  if (method === "POST" || action.includes("create") || action.includes("upload")) return "primary";
  return "neutral";
}

function actionMark(row) {
  const action = lower(row?.actionLabel);
  const method = text(row?.method).toUpperCase();
  if (action.includes("delete")) return "DL";
  if (action.includes("reject")) return "RJ";
  if (action.includes("approve")) return "AP";
  if (action.includes("archive")) return "AR";
  if (action.includes("upload")) return "UP";
  if (method === "POST") return "+";
  if (method === "PATCH" || method === "PUT") return "ED";
  if (method === "DELETE") return "DL";
  return "AC";
}

function safeJson(value) {
  try {
    const serialized = JSON.stringify(value ?? {}, null, 2);
    return serialized === "{}" || serialized === "[]" ? "No additional data." : serialized;
  } catch {
    return text(value) || "No additional data.";
  }
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
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
    const error = new Error(text(body?.error || body?.message) || `Request failed with ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-history-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "System History"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false, footer = null }) {
  return (
    <div className="next-history-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-history-modal__card ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>HI</span>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-history-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function DetailItem({ label, value, wide = false }) {
  return <div className={`next-history-detail-item ${wide ? "is-wide" : ""}`}><span>{label}</span><strong>{text(value) || "—"}</strong></div>;
}

function ProfileModal({ actor, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const id = text(actor?.actorId);
      if (!id) {
        setError("This history record is not linked to a team-member profile.");
        setLoading(false);
        return;
      }
      try {
        const body = await requestJson(`/api/team-members/${encodeURIComponent(id)}/public`);
        if (!cancelled) setProfile(body);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "The profile could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [actor]);

  const files = (Array.isArray(profile?.filesMedia) ? profile.filesMedia : [])
    .map((file, index) => ({ name: text(file?.name) || `File ${index + 1}`, url: safeUrl(file?.url) }))
    .filter((file) => file.name || file.url);
  const photo = safeUrl(profile?.photoUrl);
  const name = text(profile?.name || actor?.actorName) || "System user";

  return (
    <Modal title="Team member profile" subtitle="The user attached to this audit record." onClose={onClose}>
      {loading ? <div className="next-history-profile-state">Loading profile…</div> : error ? <div className="next-history-inline-error">{error}</div> : (
        <div className="next-history-profile">
          <section className="next-history-profile__identity">
            {photo ? <img src={photo} alt="" /> : <span>{initials(name)}</span>}
            <div><h3>{name}</h3><p>{[text(profile?.position), text(profile?.department)].filter(Boolean).join(" • ") || "Team member"}</p></div>
          </section>
          <section className="next-history-profile__fields">
            <DetailItem label="Department" value={profile?.department} />
            <DetailItem label="Position" value={profile?.position} />
            <DetailItem label="Phone" value={profile?.phone} />
            <DetailItem label="Email" value={profile?.email} />
            <DetailItem label="Employee Code" value={profile?.employeeCode} />
          </section>
          <section className="next-history-profile__files">
            <h4>Files &amp; media</h4>
            {files.length ? files.map((file, index) => file.url ? (
              <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}><span>FL</span><div><strong>{file.name}</strong><small>Open file</small></div><b>↗</b></a>
            ) : (
              <div className="is-disabled" key={`${file.name}-${index}`}><span>FL</span><div><strong>{file.name}</strong><small>Link unavailable</small></div></div>
            )) : <p>No files or media are attached to this profile.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

function DetailsModal({ row, onClose, onProfile }) {
  const status = Number(row?.statusCode || 0);
  return (
    <Modal title={text(row?.actionLabel) || "History details"} subtitle={formatDateTime(row?.createdAt)} onClose={onClose} wide>
      <div className="next-history-details">
        <section className="next-history-details__headline">
          <span className={`next-history-action-mark is-${actionTone(row)}`}>{actionMark(row)}</span>
          <div><small>{text(row?.pageName) || "System"}</small><h3>{entityLabel(row)}</h3><p>{text(row?.actorName) || "System"}</p></div>
          <span className={`next-history-status-code ${status >= 400 ? "is-error" : ""}`}>{status || "—"}</span>
        </section>
        <section className="next-history-detail-grid">
          <DetailItem label="User" value={row?.actorName} />
          <DetailItem label="Page" value={row?.pageName} />
          <DetailItem label="Department" value={row?.actorDepartment} />
          <DetailItem label="Position" value={row?.actorPosition} />
          <DetailItem label="Action" value={row?.actionLabel} />
          <DetailItem label="Entity type" value={row?.entityType} />
          <DetailItem label="Entity ID" value={row?.entityId} />
          <DetailItem label="Entity label" value={row?.entityLabel} />
          <DetailItem label="Method" value={row?.method} />
          <DetailItem label="Status code" value={row?.statusCode} />
          <DetailItem label="Duration" value={formatDuration(row?.durationMs)} />
          <DetailItem label="IP address" value={row?.ipAddress} />
          <DetailItem label="Path" value={row?.path} wide />
          <DetailItem label="User agent" value={row?.userAgent} wide />
        </section>
        {text(row?.actorId) ? <button type="button" className="next-history-profile-button" onClick={onProfile}>Open team member profile</button> : null}
        <section className="next-history-json-grid">
          <details><summary>Request query</summary><pre>{safeJson(row?.requestQuery)}</pre></details>
          <details><summary>Request body</summary><pre>{safeJson(row?.requestBody)}</pre></details>
          <details><summary>Extra details</summary><pre>{safeJson(row?.details)}</pre></details>
        </section>
      </div>
    </Modal>
  );
}

function ClearHistoryModal({ onClose, onCleared }) {
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clearHistory() {
    if (!text(password)) return setError("Admin password is required.");
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/history/clear", {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: password }),
      });
      onCleared();
      onClose();
    } catch (clearError) {
      setStage("password");
      setError(clearError?.status === 401 ? "Invalid admin password." : (clearError.message || "History could not be deleted."));
    } finally {
      setBusy(false);
    }
  }

  const footer = stage === "password" ? (
    <>
      <button type="button" className="next-history-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="next-history-btn danger" onClick={() => {
        if (!text(password)) return setError("Admin password is required.");
        setError("");
        setStage("confirm");
      }} disabled={busy}>Continue</button>
    </>
  ) : (
    <>
      <button type="button" className="next-history-btn secondary" onClick={() => setStage("password")} disabled={busy}>Back</button>
      <button type="button" className="next-history-btn danger" onClick={clearHistory} disabled={busy}>{busy ? "Deleting…" : "Delete all history"}</button>
    </>
  );

  return (
    <Modal
      title={stage === "password" ? "Clear system history" : "Final confirmation"}
      subtitle={stage === "password" ? "Admin authorization is required." : "This action cannot be undone."}
      onClose={onClose}
      footer={footer}
    >
      {stage === "password" ? (
        <div className="next-history-clear-form">
          <div className="next-history-danger-note"><strong>Permanent deletion</strong><span>Every saved system-action record will be removed from the audit table.</span></div>
          <label><span>Admin password</span><input autoFocus type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (text(password)) setStage("confirm"); } }} placeholder="Enter admin password" /></label>
          {error ? <div className="next-history-inline-error">{error}</div> : null}
        </div>
      ) : (
        <div className="next-history-final-warning">
          <span>!</span>
          <h3>Delete every history record?</h3>
          <p>The audit trail will become empty immediately. The deleted records cannot be recovered from this page.</p>
        </div>
      )}
    </Modal>
  );
}

export default function HistoryClient({ account, initialRows, bootstrapWarnings = [] }) {
  const [rows, setRows] = useState(Array.isArray(initialRows) ? initialRows : []);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [profileActor, setProfileActor] = useState(null);
  const [showClear, setShowClear] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [search, page, actor, action, date, status, sort]);

  useEffect(() => {
    const modalOpen = !!selected || !!profileActor || showClear;
    if (!modalOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event) {
      if (event.key !== "Escape") return;
      if (profileActor) setProfileActor(null);
      else if (selected) setSelected(null);
      else setShowClear(false);
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keydown);
    };
  }, [selected, profileActor, showClear]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pages = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.pageName)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const actors = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.actorName)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.actionLabel)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => {
    const needle = lower(search);
    const result = rows.filter((row) => {
      if (page && text(row?.pageName) !== page) return false;
      if (actor && text(row?.actorName) !== actor) return false;
      if (action && text(row?.actionLabel) !== action) return false;
      if (date && dateKey(row?.createdAt) !== date) return false;
      const code = Number(row?.statusCode || 0);
      if (status === "success" && code >= 400) return false;
      if (status === "error" && code < 400) return false;
      if (!needle) return true;
      return [
        row?.actionLabel,
        row?.entityLabel,
        row?.entityId,
        row?.entityType,
        row?.pageName,
        row?.actorName,
        row?.actorDepartment,
        row?.actorPosition,
        row?.method,
        row?.path,
        row?.statusCode,
      ].some((value) => lower(value).includes(needle));
    });
    result.sort((a, b) => sort === "oldest" ? dateValue(a?.createdAt) - dateValue(b?.createdAt) : dateValue(b?.createdAt) - dateValue(a?.createdAt));
    return result;
  }, [rows, search, page, actor, action, date, status, sort]);

  const today = dateKey(new Date());
  const summary = useMemo(() => ({
    total: rows.length,
    today: rows.filter((row) => dateKey(row?.createdAt) === today).length,
    users: new Set(rows.map((row) => text(row?.actorName)).filter(Boolean)).size,
    pages: new Set(rows.map((row) => text(row?.pageName)).filter(Boolean)).size,
    errors: rows.filter((row) => Number(row?.statusCode || 0) >= 400).length,
  }), [rows, today]);

  async function refresh() {
    setLoading(true);
    try {
      const payload = await requestJson(`/api/history?limit=1000&_=${Date.now()}`);
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setToast({ type: "success", title: "History refreshed", message: "The latest audit records are now visible." });
    } catch (error) {
      setToast({ type: "error", title: "Refresh failed", message: error.message || "History could not be refreshed." });
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setPage("");
    setActor("");
    setAction("");
    setDate("");
    setStatus("all");
    setSort("newest");
  }

  const hasFilters = !!(search || page || actor || action || date || status !== "all" || sort !== "newest");
  const visibleRows = filtered.slice(0, visibleLimit);

  return (
    <main className="next-history-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="next-history-hero">
        <div>
          <span className="next-history-kicker">AUDIT CONTROL</span>
          <h2>Trace every important system action.</h2>
          <p>Review who changed what, where the action happened, and whether the request completed successfully.</p>
          <div className="next-history-hero-tags"><span>{text(account?.name || account?.username) || "Current user"}</span><span>Up to 1,000 recent records</span>{bootstrapWarnings.length ? <span>{bootstrapWarnings.length} bootstrap warning{bootstrapWarnings.length === 1 ? "" : "s"}</span> : null}</div>
        </div>
        <div className="next-history-hero-actions">
          <button type="button" className="secondary" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          <a href="/history">Classic History</a>
          <button type="button" className="danger" onClick={() => setShowClear(true)}>Clear all</button>
        </div>
      </section>

      <section className="next-history-summary">
        <article><small>Total records</small><strong>{summary.total}</strong><span>Loaded audit entries</span></article>
        <article><small>Today</small><strong>{summary.today}</strong><span>Actions recorded today</span></article>
        <article><small>Users</small><strong>{summary.users}</strong><span>Distinct actors</span></article>
        <article><small>Pages</small><strong>{summary.pages}</strong><span>Active system areas</span></article>
        <article className={summary.errors ? "is-alert" : ""}><small>Failed actions</small><strong>{summary.errors}</strong><span>Status code 400 or higher</span></article>
      </section>

      <section className="next-history-toolbar">
        <label className="next-history-search"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action, entity, user, path…" /></label>
        <label><span>Page</span><select value={page} onChange={(event) => setPage(event.target.value)}><option value="">All pages</option>{pages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>User</span><select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">All users</option>{actors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Action</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option>{actions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>Result</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All results</option><option value="success">Successful</option><option value="error">Failed</option></select></label>
        <label><span>Order</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <div className="next-history-toolbar-result"><strong>{filtered.length}</strong><span>records</span></div>
        {hasFilters ? <button type="button" className="next-history-clear-filters" onClick={clearFilters}>Clear filters</button> : null}
      </section>

      <section className="next-history-list-card">
        <header>
          <div><span className="next-history-kicker">RECENT ACTIVITY</span><h3>System actions</h3><p>{hasFilters ? "The list reflects the active search and filters." : "No filters are applied."}</p></div>
          <strong>{filtered.length} record{filtered.length === 1 ? "" : "s"}</strong>
        </header>

        <div className="next-history-list">
          {visibleRows.length ? visibleRows.map((row, index) => {
            const statusCode = Number(row?.statusCode || 0);
            return (
              <article className="next-history-row" key={text(row?.id) || `${row?.createdAt}-${index}`}>
                <button type="button" className={`next-history-action-mark is-${actionTone(row)}`} onClick={() => setSelected(row)} aria-label={`Open ${text(row?.actionLabel) || "history"} details`}>{actionMark(row)}</button>
                <button type="button" className="next-history-row-main" onClick={() => setSelected(row)}>
                  <strong>{text(row?.actionLabel) || "System action"}</strong>
                  <span>{entityLabel(row)}</span>
                </button>
                <div className="next-history-row-context">
                  <span>{text(row?.pageName) || "System"}</span>
                  <small>{text(row?.method) || "—"} {statusCode ? `• ${statusCode}` : ""}</small>
                </div>
                <button type="button" className="next-history-actor" onClick={() => text(row?.actorId) ? setProfileActor(row) : setSelected(row)}>
                  <span>{initials(row?.actorName)}</span>
                  <div><strong>{text(row?.actorName) || "System"}</strong><small>{text(row?.actorDepartment || row?.actorPosition) || "System activity"}</small></div>
                </button>
                <time>{formatDateTime(row?.createdAt)}</time>
                <button type="button" className="next-history-open" onClick={() => setSelected(row)}>View</button>
              </article>
            );
          }) : (
            <div className="next-history-empty"><span>0</span><strong>No history records found</strong><p>Change the filters or refresh the audit trail.</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
          )}
        </div>

        {visibleLimit < filtered.length ? <button type="button" className="next-history-show-more" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - visibleLimit)} more records</button> : null}
      </section>

      {selected ? <DetailsModal row={selected} onClose={() => setSelected(null)} onProfile={() => setProfileActor(selected)} /> : null}
      {profileActor ? <ProfileModal actor={profileActor} onClose={() => setProfileActor(null)} /> : null}
      {showClear ? <ClearHistoryModal onClose={() => setShowClear(false)} onCleared={() => {
        setRows([]);
        clearFilters();
        setToast({ type: "success", title: "History deleted", message: "All system-history records were removed successfully." });
      }} /> : null}
    </main>
  );
}
