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

const profileCache = new Map();

const PROFILE_FIELD_ORDER = [
  { label: "Name", aliases: ["Name"], topLevel: (profile) => profile?.name || profile?.username },
  { label: "Department", aliases: ["Department"], topLevel: (profile) => profile?.department },
  { label: "Position", aliases: ["Position"], topLevel: (profile) => profile?.position },
  { label: "Phone", aliases: ["Phone", "Mobile", "Phone Number"], topLevel: (profile) => profile?.phone },
  { label: "Email", aliases: ["Email", "E-mail"], topLevel: (profile) => profile?.email },
  { label: "Employee Code", aliases: ["Employee Code", "Employee ID", "Code"], topLevel: (profile) => profile?.employeeCode },
];

function profileFieldKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function profileFieldValue(profile, definition) {
  const direct = text(definition?.topLevel?.(profile || {}));
  if (direct) return direct;
  const wanted = new Set((definition?.aliases || []).map(profileFieldKey));
  const fields = Array.isArray(profile?.fields) ? profile.fields : [];
  const found = fields.find((field) => field?.type !== "files" && wanted.has(profileFieldKey(field?.label)) && text(field?.value));
  return text(found?.value);
}

function profileFieldRows(profile) {
  return PROFILE_FIELD_ORDER.map((definition) => ({ label: definition.label, value: profileFieldValue(profile, definition) }))
    .filter((field) => field.value);
}

function urlHost(value) {
  const url = safeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function formatShortDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return text(value) || "—";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCardDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return text(value) || "—";
  const datePart = parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} - ${timePart}`;
}

function HistoryIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    refresh: <><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18.5 9a7 7 0 0 0-11.8-2.6L4 9"/><path d="M5.5 15a7 7 0 0 0 11.8 2.6L20 15"/></>,
    filter: <><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  };
  return <svg {...common}>{paths[name] || paths.filter}</svg>;
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

function ProfilePopover({ state, onClose }) {
  const actor = state?.row;
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
        let body = profileCache.get(id);
        if (!body) {
          body = await requestJson(`/api/team-members/${encodeURIComponent(id)}/public`);
          profileCache.set(id, body);
        }
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

  if (!state) return null;

  const files = (Array.isArray(profile?.filesMedia) ? profile.filesMedia : [])
    .map((file, index) => ({ name: text(file?.name) || `File ${index + 1}`, url: safeUrl(file?.url) }))
    .filter((file) => file.name || file.url);
  const photo = safeUrl(profile?.photoUrl);
  const fields = profileFieldRows(profile);
  const name = profileFieldValue(profile, PROFILE_FIELD_ORDER[0]) || text(actor?.actorName) || "System user";
  const position = profileFieldValue(profile, PROFILE_FIELD_ORDER[2]);
  const department = profileFieldValue(profile, PROFILE_FIELD_ORDER[1]);
  const subtitle = [position, department].filter(Boolean).join(" • ") || "Team member";

  return (
    <div className="creator-profile-popover history-created-by-popover is-open" style={{ left: state.left, top: state.top }} aria-hidden="false">
      <div className="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
        <button type="button" className="creator-profile-close" onClick={onClose} aria-label="Close"><span className="creator-profile-close-x">×</span></button>
        <div className="creator-profile-head">
          <div className={`creator-profile-avatar ${photo ? "has-image" : ""}`}>{photo ? <img src={photo} alt={name} /> : <span>{initials(name)}</span>}</div>
          <div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{name}</div><div className="creator-profile-subtitle">{subtitle}</div></div>
        </div>
        {loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : error ? <div className="creator-profile-state creator-profile-state--error"><span>{error}</span></div> : (
          <>
            <div className="creator-profile-section-title">Profile details</div>
            <div className="next-classic-creator-fields history-created-by-fields">
              {fields.length ? fields.map((field) => <div key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>) : <div className="history-created-by-empty"><span>Profile</span><strong>No profile details available.</strong></div>}
            </div>
            {files.length ? <><div className="creator-profile-section-title">Files &amp; media</div><div className="history-created-by-files">{files.map((file, index) => file.url ? <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}><span>FL</span><strong>{file.name}</strong><b>↗</b></a> : <div key={`${file.name}-${index}`}><span>FL</span><strong>{file.name}</strong></div>)}</div></> : null}
          </>
        )}
      </div>
    </div>
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

function ModernSelect({ label, value, options, isOpen, onToggle, onChange }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className={`next-history-modern-select ${isOpen ? "is-open" : ""}`}>
      <span className="next-history-modern-select__label">{label}</span>
      <button type="button" className="next-history-modern-select__trigger" onClick={onToggle} aria-label={label} aria-haspopup="listbox" aria-expanded={isOpen}>
        <span>{selected?.label || "Select"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
      </button>
      {isOpen ? <div className="next-history-modern-select__menu" role="listbox" aria-label={label}>
        {options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "is-selected" : ""} onClick={() => onChange(option.value)} key={`${label}-${option.value || "all"}`}><span>{option.label}</span>{option.value === value ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> : null}</button>)}
      </div> : null}
    </div>
  );
}

function FilterModal({
  current,
  pages,
  actors,
  actions,
  onApply,
  onClear,
  onClose,
}) {
  const [draft, setDraft] = useState(current);
  const [openSelect, setOpenSelect] = useState("");

  useEffect(() => {
    function pointerdown(event) {
      if (!openSelect || event.target.closest?.(".next-history-modern-select")) return;
      setOpenSelect("");
    }
    function keydown(event) {
      if (event.key === "Escape" && openSelect) {
        event.stopPropagation();
        setOpenSelect("");
      }
    }
    document.addEventListener("pointerdown", pointerdown, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("pointerdown", pointerdown, true);
      document.removeEventListener("keydown", keydown, true);
    };
  }, [openSelect]);

  function update(key, value) {
    setDraft((existing) => ({ ...existing, [key]: value }));
  }

  function dropdown(key, label, value, options) {
    return <ModernSelect label={label} value={value} options={options} isOpen={openSelect === key} onToggle={() => setOpenSelect((currentKey) => currentKey === key ? "" : key)} onChange={(nextValue) => { update(key, nextValue); setOpenSelect(""); }} />;
  }

  const pageOptions = [{ value: "", label: "All pages" }, ...pages.map((item) => ({ value: item, label: item }))];
  const actorOptions = [{ value: "", label: "All users" }, ...actors.map((item) => ({ value: item, label: item }))];
  const actionOptions = [{ value: "", label: "All actions" }, ...actions.map((item) => ({ value: item, label: item }))];
  const resultOptions = [{ value: "all", label: "All results" }, { value: "success", label: "Successful" }, { value: "error", label: "Failed" }];
  const orderOptions = [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }];

  return (
    <Modal title="History filters" subtitle="Filter the audit trail without changing the saved records." onClose={onClose}>
      <div className="next-history-filter-modal-content">
        <label className="next-history-filter-search">
          <span>Search</span>
          <div><HistoryIcon name="search"/><input value={draft.search} onChange={(event) => update("search", event.target.value)} placeholder="Action, entity, user, path…" /></div>
        </label>
        <div className="next-history-filter-grid">
          {dropdown("page", "Page name", draft.page, pageOptions)}
          {dropdown("actor", "User name", draft.actor, actorOptions)}
          <label className="next-history-filter-date"><span>Date</span><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch {} }} /></label>
          {dropdown("action", "Action", draft.action, actionOptions)}
          {dropdown("status", "Result", draft.status, resultOptions)}
          {dropdown("sort", "Order", draft.sort, orderOptions)}
        </div>
        <div className="next-history-filter-actions">
          <button type="button" className="secondary" onClick={onClear}>Clear</button>
          <button type="button" className="primary" onClick={() => onApply(draft)}><HistoryIcon name="filter"/><span>Apply</span></button>
        </div>
      </div>
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
  const [profilePopover, setProfilePopover] = useState(null);
  const [showClear, setShowClear] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [search, page, actor, action, date, status, sort]);

  useEffect(() => {
    const modalOpen = !!selected || showClear || showFilters;
    if (!modalOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event) {
      if (event.key !== "Escape") return;
      if (selected) setSelected(null);
      else if (showFilters) setShowFilters(false);
      else setShowClear(false);
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keydown);
    };
  }, [selected, showClear, showFilters]);

  useEffect(() => {
    if (!profilePopover) return undefined;
    function close(event) {
      if (event?.target?.closest?.(".history-created-by-popover") || event?.target?.closest?.(".next-history-actor")) return;
      setProfilePopover(null);
    }
    function keydown(event) { if (event.key === "Escape") setProfilePopover(null); }
    function viewportChange() { setProfilePopover(null); }
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", viewportChange);
    window.addEventListener("scroll", viewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", viewportChange);
      window.removeEventListener("scroll", viewportChange, true);
    };
  }, [profilePopover]);

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
      const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows(nextRows);
      const nextPages = new Set(nextRows.map((row) => text(row?.pageName)).filter(Boolean));
      const nextActors = new Set(nextRows.map((row) => text(row?.actorName)).filter(Boolean));
      const nextActions = new Set(nextRows.map((row) => text(row?.actionLabel)).filter(Boolean));
      if (page && !nextPages.has(page)) setPage("");
      if (actor && !nextActors.has(actor)) setActor("");
      if (action && !nextActions.has(action)) setAction("");
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

  function applyFilters(next) {
    setSearch(text(next?.search));
    setPage(text(next?.page));
    setActor(text(next?.actor));
    setAction(text(next?.action));
    setDate(text(next?.date));
    setStatus(text(next?.status) || "all");
    setSort(text(next?.sort) || "newest");
    setShowFilters(false);
  }

  function openProfilePopover(anchor, row) {
    if (!text(row?.actorId)) {
      setSelected(row);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 28);
    const estimatedHeight = Math.min(520, window.innerHeight - 28);
    const left = Math.min(Math.max(14, rect.right - width), Math.max(14, window.innerWidth - width - 14));
    const below = rect.bottom + 10;
    const top = below + Math.min(360, estimatedHeight) <= window.innerHeight
      ? below
      : Math.max(14, rect.top - estimatedHeight - 10);
    setProfilePopover({ row, left, top });
  }

  const currentFilters = { search, page, actor, action, date, status, sort };
  const hasFilters = !!(search || page || actor || action || date || status !== "all" || sort !== "newest");
  const activeFilterText = useMemo(() => {
    const parts = [];
    if (page) parts.push(`Page: ${page}`);
    if (actor) parts.push(`User: ${actor}`);
    if (date) parts.push(`Date: ${formatShortDate(date)}`);
    if (action) parts.push(`Action: ${action}`);
    if (status !== "all") parts.push(`Result: ${status === "error" ? "Failed" : "Successful"}`);
    if (sort !== "newest") parts.push("Oldest first");
    if (search) parts.push(`Search: ${search}`);
    return parts.length ? parts.join(" • ") : "No filters applied";
  }, [search, page, actor, action, date, status, sort]);
  const visibleRows = filtered.slice(0, visibleLimit);

  return (
    <main className="next-history-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="next-history-hero next-history-parity-hidden" aria-hidden="true">
        <div>
          <span className="next-history-kicker">AUDIT CONTROL</span>
          <h2>Trace every important system action.</h2>
          <p>Review who changed what, where the action happened, and whether the request completed successfully.</p>
          <div className="next-history-hero-tags"><span>{text(account?.name || account?.username) || "Current user"}</span><span>Up to 1,000 recent records</span>{bootstrapWarnings.length ? <span>{bootstrapWarnings.length} bootstrap warning{bootstrapWarnings.length === 1 ? "" : "s"}</span> : null}</div>
        </div>
        <div className="next-history-hero-actions">
          <a href="/history?classic=1">Classic History</a>
          <button type="button" className="danger" onClick={() => setShowClear(true)}>Clear all</button>
        </div>
      </section>

      <section className="next-history-summary next-history-parity-hidden" aria-hidden="true">
        <article><small>Total records</small><strong>{summary.total}</strong><span>Loaded audit entries</span></article>
        <article><small>Today</small><strong>{summary.today}</strong><span>Actions recorded today</span></article>
        <article><small>Users</small><strong>{summary.users}</strong><span>Distinct actors</span></article>
        <article><small>Pages</small><strong>{summary.pages}</strong><span>Active system areas</span></article>
        <article className={summary.errors ? "is-alert" : ""}><small>Failed actions</small><strong>{summary.errors}</strong><span>Status code 400 or higher</span></article>
      </section>

      <section className="next-history-toolbar next-history-parity-hidden" aria-hidden="true">
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

      <section className="next-history-list-card next-history-list-card--parity">
        <header className="next-history-list-head--parity">
          <div className="next-history-list-heading">
            <span className="next-history-kicker">RECENT ACTIVITY</span>
            <h3>System actions</h3>
            <p title={activeFilterText}>{activeFilterText}</p>
          </div>
          <div className="next-history-list-actions--parity">
            <button type="button" className={`next-history-filter-button ${hasFilters ? "is-active" : ""}`} onClick={() => setShowFilters(true)}>
              <HistoryIcon name="filter"/><span>Filter by</span>{hasFilters ? <b aria-label="Filters active">•</b> : null}
            </button>
            <strong className="next-history-count-badge">{filtered.length} record{filtered.length === 1 ? "" : "s"}</strong>
            <button type="button" className="next-history-delete-button" onClick={() => setShowClear(true)} aria-label="Delete all history" title="Delete all history">
              <HistoryIcon name="trash"/>
            </button>
          </div>
          {bootstrapWarnings.length ? <div className="next-history-bootstrap-warning">{bootstrapWarnings.length} bootstrap warning{bootstrapWarnings.length === 1 ? "" : "s"}</div> : null}
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
                <button type="button" className="next-history-actor co-right-ico co-creator-btn" onClick={(event) => openProfilePopover(event.currentTarget, row)} aria-label={`Created by ${text(row?.actorName) || "System"}`} title={`Created by ${text(row?.actorName) || "System"}`}>
                  <span className="next-history-actor-initials">{initials(row?.actorName)}</span>
                  <span className="next-history-actor-icon"><HistoryIcon name="user"/></span>
                  <div><strong>{text(row?.actorName) || "System"}</strong><small>{text(row?.actorDepartment || row?.actorPosition) || "System activity"}</small></div>
                </button>
                <time>{formatCardDateTime(row?.createdAt)}</time>
                <button type="button" className="next-history-open" onClick={() => setSelected(row)}>View</button>
              </article>
            );
          }) : (
            <div className="next-history-empty"><span>0</span><strong>No history records found</strong><p>Change the filters to find the records you need.</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
          )}
        </div>

        {visibleLimit < filtered.length ? <button type="button" className="next-history-show-more" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - visibleLimit)} more records</button> : null}
      </section>

      {showFilters ? <FilterModal
        current={currentFilters}
        pages={pages}
        actors={actors}
        actions={actions}
        onClose={() => setShowFilters(false)}
        onClear={() => { clearFilters(); setShowFilters(false); }}
        onApply={applyFilters}
      /> : null}
      {selected ? <DetailsModal row={selected} onClose={() => setSelected(null)} onProfile={() => { const current = selected; setSelected(null); const width = Math.min(380, window.innerWidth - 28); setProfilePopover({ row: current, left: Math.max(14, window.innerWidth - width - 24), top: 90 }); }} /> : null}
      {profilePopover ? <ProfilePopover state={profilePopover} onClose={() => setProfilePopover(null)} /> : null}
      {showClear ? <ClearHistoryModal onClose={() => setShowClear(false)} onCleared={() => {
        setRows([]);
        clearFilters();
        setToast({ type: "success", title: "History deleted", message: "All system-history records were removed successfully." });
      }} /> : null}
    </main>
  );
}
