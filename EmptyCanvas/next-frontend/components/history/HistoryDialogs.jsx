"use client";

import { useEffect, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
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

function HistoryIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    filter: <><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
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

export function HistoryProfilePopover({ state, onClose }) {
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
          const { loadTeamMemberPublicProfile } = await import("../../lib/team-member-public-client");
          body = await loadTeamMemberPublicProfile(id);
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

export function HistoryDetailsModal({ row, onClose, onProfile, loadingDetails = false, detailsError = "" }) {
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
        {loadingDetails ? <div className="next-history-inline-error" style={{ borderColor: "#dbeafe", background: "#eff6ff", color: "#1d4ed8" }}>Loading full request details…</div> : null}
        {detailsError ? <div className="next-history-inline-error">{detailsError}</div> : null}
        <section className="next-history-json-grid">
          <details><summary>Request query</summary><pre>{safeJson(row?.requestQuery)}</pre></details>
          <details><summary>Request body</summary><pre>{safeJson(row?.requestBody)}</pre></details>
          <details><summary>Extra details</summary><pre>{safeJson(row?.details)}</pre></details>
        </section>
      </div>
    </Modal>
  );
}

export function HistoryClearModal({ onClose, onCleared }) {
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clearHistory() {
    if (!text(password)) return setError("Admin password is required.");
    setBusy(true);
    setError("");
    try {
      await requestJson("/next/api/history", {
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

export function HistoryFilterModal({
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

