"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function rank(level) { return ({ view: 1, edit: 2, admin: 3 })[lower(level)] || 0; }
function unique(values) { return [...new Set((values || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function makeId(prefix = "id") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function monthKey(value) { const match = text(value).match(/^(\d{4})-(\d{2})/); return match ? `${match[1]}-${match[2]}-01` : ""; }
function currentMonthKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
function currentMonthInput() { return currentMonthKey().slice(0, 7); }
function fmtMonth(value) {
  const key = monthKey(value);
  if (!key) return text(value) || "—";
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value) || "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}
function fmtDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value) || "—";
  return date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function scoreToPercentage(score, weight) {
  const weightValue = number(weight);
  if (weightValue <= 0) return 0;
  return Math.max(0, Math.min(100, (number(score) / weightValue) * 100));
}
function standardOptionLabel(standard) {
  const title = text(standard?.title) || "Untitled KPI";
  const meta = [standard?.department, standard?.rolePosition].filter(Boolean).join(" / ");
  return meta ? `${title} — ${meta}` : title;
}
function positionsForDepartment(meta, department) {
  const key = lower(department);
  if (!key) return [];
  const direct = meta?.positionsByDepartment?.[key] || meta?.positionsByDepartment?.[text(department)] || [];
  if (Array.isArray(direct) && direct.length) return unique(direct);
  return unique((meta?.users || []).filter((user) => lower(user.department) === key).map((user) => user.position));
}
function matchingStandards(meta, user) {
  if (!user) return meta?.standards || [];
  const department = lower(user.department);
  const position = lower(user.position);
  const exact = (meta?.standards || []).filter((standard) => lower(standard.department) === department && lower(standard.rolePosition) === position);
  return exact.length ? exact : (meta?.standards || []).filter((standard) => lower(standard.department) === department || lower(standard.rolePosition) === position);
}
function isUrlEvidence(value) { return /^https?:\/\//i.test(text(value)) || /^\/api\/storage\/file\//i.test(text(value)); }
function evidenceFileName(value) {
  const raw = text(value);
  if (!raw) return "No evidence uploaded";
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const explicitName = text(url.searchParams.get("name"));
    if (explicitName) return explicitName;
    if (/^\/api\/storage\/file\//i.test(url.pathname || "")) return "Evidence file";
    return decodeURIComponent((url.pathname || "").split("/").filter(Boolean).pop() || "Evidence file") || "Evidence file";
  } catch { return raw; }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.message || body?.error) || "The request failed.");
  return body;
}

const ICON_PATHS = {
  x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  "edit-3": <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
  sliders: <><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
  "folder-plus": <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></>,
  "plus-square": <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
  "trash-2": <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
  "user-check": <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></>,
  "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
  "trending-up": <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  "upload-cloud": <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></>,
  paperclip: <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  award: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  "check-circle": <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  "alert-triangle": <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  "chevron-down": <polyline points="6 9 12 15 18 9"/>,
};
function Icon({ name, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name] || ICON_PATHS.info}</svg>;
}

function usePortalReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return ready;
}

function Toast({ value, onClose }) {
  useEffect(() => {
    if (!value) return undefined;
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [value, onClose]);
  if (!value) return null;
  const icon = value.type === "error" ? "alert-triangle" : value.type === "success" ? "check-circle" : "info";
  const title = value.title || (value.type === "error" ? "Action needed" : value.type === "success" ? "Done" : "Notice");
  return (
    <div className="kpis-toast-stack" aria-live="polite">
      <div className={`kpis-toast kpis-toast--${value.type || "info"} is-visible`}>
        <div className="kpis-toast__icon"><Icon name={icon} /></div>
        <div className="kpis-toast__body"><strong>{title}</strong><p>{value.message}</p></div>
        <button type="button" className="kpis-toast__close" onClick={onClose} aria-label="Close message"><Icon name="x" /></button>
      </div>
    </div>
  );
}

function ModernSelect({ value, onChange, options = [], placeholder = "Choose", disabled = false, ariaLabel = "Choose option" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selected = normalized.find((option) => String(option.value) === String(value));
  return (
    <div ref={ref} className={`kpis-modern-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}>
      <button className="kpis-modern-select__button" type="button" disabled={disabled} onClick={() => !disabled && setOpen((current) => !current)} aria-label={ariaLabel} aria-expanded={open}>
        <span>{selected?.label || placeholder}</span><Icon name="chevron-down" />
      </button>
      <div className="kpis-modern-select__menu" role="listbox">
        {normalized.map((option) => (
          <button type="button" key={`${option.value}-${option.label}`} className={`kpis-modern-select__option ${String(option.value) === String(value) ? "is-selected" : ""}`} disabled={option.disabled} onClick={() => { onChange?.(option.value); setOpen(false); }}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Modal({ onClose, size = "", panelClass = "", icon = "info", kicker = "", title = "", subtitle = "", children }) {
  const ready = usePortalReady();
  useEffect(() => {
    document.body.classList.add("kpis-modal-open");
    return () => document.body.classList.remove("kpis-modal-open");
  }, []);
  if (!ready) return null;
  const sizeClass = size === "wide" ? "kpis-modal-panel--wide" : size === "small" ? "kpis-modal-panel--small" : "";
  return createPortal(
    <div className="kpis-modal" aria-hidden="false">
      <div className="kpis-modal-backdrop" onClick={onClose} />
      <section className={`kpis-modal-panel ${sizeClass} ${panelClass}`.trim()} role="dialog" aria-modal="true">
        <button className="kpis-close" type="button" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        <div className="kpis-modal-head">
          <span className="kpis-modal-icon"><Icon name={icon} /></span>
          <div>{kicker ? <span className="kpis-kicker">{kicker}</span> : null}{title ? <h2>{title}</h2> : null}{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        {children}
      </section>
    </div>, document.body,
  );
}

function InlineDialog({ className = "", title, message = "", onClose, children, actions }) {
  const ready = usePortalReady();
  if (!ready) return null;
  return createPortal(
    <div className={`kpis-inline-dialog ${className}`.trim()} aria-hidden="false">
      <div className="kpis-inline-dialog__backdrop" onClick={onClose} />
      <section className="kpis-inline-dialog__panel" role="dialog" aria-modal="true">
        <h3>{title}</h3>{message ? <p>{message}</p> : null}{children}<div className="kpis-inline-dialog__actions">{actions}</div>
      </section>
    </div>, document.body,
  );
}

function AdminPasswordDialog({ kind, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = "Admin password required";
  const message = kind === "standard"
    ? "Only KPI admins can create KPI standards directly. Enter the admin password to continue."
    : "Create review is available for Edit/Admin access. Enter the admin password to continue.";
  const verify = async () => {
    const clean = text(password);
    if (!clean) return setError("Admin password is required.");
    setBusy(true); setError("");
    try {
      await requestJson("/api/kpis/admin/verify", { method: "POST", body: JSON.stringify({ password: clean }) });
      onVerified(clean);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <InlineDialog className="kpis-admin-password-dialog" title={title} message={message} onClose={onClose} actions={<><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClose}>Cancel</button><button className="kpis-btn kpis-btn--dark" type="button" onClick={verify} disabled={busy}>{busy ? "Verifying..." : "Continue"}</button></>}>
      <label className="kpis-dialog-field">Admin password<input className="kpis-input" type="password" placeholder="Enter admin password" autoComplete="current-password" value={password} autoFocus onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); verify(); } }} /></label>
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
    </InlineDialog>
  );
}

function SectionTitleDialog({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <InlineDialog title="Add section" onClose={onClose} actions={<><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClose}>Cancel</button><button className="kpis-btn kpis-btn--dark" type="button" onClick={() => onAdd({ title, description })}>Add section</button></>}>
      <label className="kpis-dialog-field">Section title<input className="kpis-input" type="text" placeholder="Example: Key Behavioral Indicators" value={title} autoFocus onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAdd({ title, description }); } }} /></label>
      <label className="kpis-dialog-field">Section description<textarea className="kpis-textarea" rows="3" placeholder="Write a short description for this section" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </InlineDialog>
  );
}

function Graph({ points, activeMonth, onSelect }) {
  const rows = Array.isArray(points) ? points : [];
  if (!rows.length) return <div className="kpis-chart"><div className="kpis-chart-empty">No KPI graph data yet. Create a monthly review first.</div></div>;
  const pointByMonth = new Map(rows.map((point) => [monthKey(point.reviewMonth), point]));
  const baseYear = Number((activeMonth || currentMonthKey()).slice(0, 4)) || new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `${baseYear}-${String(index + 1).padStart(2, "0")}-01`;
    const point = pointByMonth.get(key) || null;
    const value = point ? Math.max(0, Math.min(100, number(point.finalPercentage))) : 0;
    return { key, point, value, label: new Date(baseYear, index, 1).toLocaleDateString("en-US", { month: "short" }) };
  });
  return (
    <div className="kpis-chart" aria-label="KPI monthly graph">
      <div className="kpis-modern-chart" role="group" aria-label="Monthly KPI bar chart">
        <div className="kpis-chart-y-axis" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
        <div className="kpis-chart-stage">
          <div className="kpis-chart-grid-lines" aria-hidden="true"><span/><span/><span/><span/><span/></div>
          <div className="kpis-month-bars">
            {months.map((month) => (
              <button type="button" key={month.key} className={`kpis-month-bar ${month.key === activeMonth ? "is-active" : ""} ${month.point ? "has-data" : "is-empty"}`} onClick={() => onSelect(month.key)} title={`${month.label}: ${month.point ? `${month.value.toFixed(1)}%` : "No review"}`}>
                <span className="kpis-month-bar__bubble">{month.point ? `${month.value.toFixed(1)}%` : "—"}</span>
                <span className="kpis-month-bar__track"><span className="kpis-month-bar__fill" style={{ "--value": month.point ? Math.max(month.value, 4) : 10 }} /></span>
                <span className="kpis-month-bar__label">{month.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ summary }) {
  const score = Math.max(0, Math.min(100, number(summary?.finalPercentage)));
  return (
    <article className="kpis-card kpis-card--score">
      <span className="kpis-card-label">Current score</span>
      <div className="kpis-score-ring" style={{ "--score": score }}><strong>{summary ? `${score.toFixed(1)}%` : "—"}</strong><span>Final %</span></div>
      <div className="kpis-score-meta"><strong>{summary?.performanceRating || "No review selected"}</strong><span>{summary ? fmtMonth(summary.reviewMonth) : "—"}</span></div>
    </article>
  );
}

function StandardDetail({ standardId, meta, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { requestJson(`/api/kpis/standards?id=${encodeURIComponent(standardId)}`).then(setData).catch((err) => setError(err.message)); }, [standardId]);
  const standard = (meta?.standards || []).find((item) => String(item.id) === String(standardId)) || data?.standards?.[0] || null;
  const sections = data?.sections || [];
  const evaluations = data?.evaluations || [];
  const totalRows = sections.reduce((sum, section) => sum + (section.items || []).length, 0);
  const totalWeight = sections.reduce((sum, section) => sum + number(section.weightPercent), 0);
  return (
    <Modal size="wide" panelClass="kpis-standard-details-panel" icon="award" kicker="KPI standard" onClose={onClose}>
      <div className="kpis-standard-details">
        {error ? <div className="kpis-chart-empty">{error}</div> : null}
        {!data && !error ? <div className="kpis-chart-empty">Loading KPI standard...</div> : null}
        {data && standard ? <>
          <div className="kpis-standard-detail-hero">
            <div className="kpis-standard-detail-title"><span className="kpis-pill">{standard.isActive ? "Active" : "Inactive"}</span><h3>{standard.title || "Untitled standard"}</h3><p>{text(standard.description) || "No description added."}</p></div>
            <div className="kpis-standard-detail-score"><strong>{totalRows}</strong><span>KPI subsections</span></div>
          </div>
          <div className="kpis-standard-detail-grid">
            <div><span>Department</span><strong>{standard.department || "—"}</strong></div>
            <div><span>Role / Position</span><strong>{standard.rolePosition || "—"}</strong></div>
            <div><span>Total weight</span><strong>{totalWeight.toFixed(1)}</strong></div>
            <div><span>Created by</span><strong>{standard.createdByName || "—"}</strong></div>
            <div><span>Created time</span><strong>{fmtDateTime(standard.createdAt)}</strong></div>
          </div>
          {evaluations.length ? <div className="kpis-standard-detail-evaluations"><div className="kpis-standard-detail-evaluations__head"><h4>Overall Evaluation</h4></div><div className="kpis-standard-detail-evaluation-list">{evaluations.map((evaluation, index) => <div className="kpis-standard-detail-evaluation" key={evaluation.id || `${index}-${evaluation.grade}`}><span>{index + 1}</span><strong>{number(evaluation.scoreFromPercentage ?? evaluation.scorePercentage).toFixed(1)}% - {number(evaluation.scoreToPercentage ?? 100).toFixed(1)}%</strong><em>{evaluation.grade || "—"}</em></div>)}</div></div> : null}
          <div className="kpis-standard-detail-sections">
            {sections.length ? sections.map((section, sectionIndex) => <section className="kpis-standard-detail-section" key={`${section.sectionOrder}-${section.section}`}>
              <div className="kpis-standard-detail-section__head"><div><span>{sectionIndex + 1}</span><h4>{section.section || `Section ${sectionIndex + 1}`}</h4></div><strong>{number(section.weightPercent).toFixed(1)} total weight</strong></div>
              {section.sectionDescription ? <p className="kpis-standard-detail-description">{section.sectionDescription}</p> : null}
              <div className="kpis-standard-detail-rows">{(section.items || []).length ? section.items.map((item) => <article className="kpis-standard-detail-row kpis-standard-detail-row--card" key={item.id || `${sectionIndex}-${item.subsectionOrder}`}><div className="kpis-standard-detail-row__main"><span>{item.subsectionOrder || "—"}</span><div><strong>{item.subsection || "Untitled subsection"}</strong>{item.subsectionDescription ? <p>{item.subsectionDescription}</p> : null}</div></div><div className="kpis-standard-detail-row__weight"><span>Weight</span><strong>{number(item.weightPercent).toFixed(1)}</strong></div></article>) : <div className="kpis-chart-empty">No KPI subsections in this section.</div>}</div>
            </section>) : <div className="kpis-chart-empty">No active KPI sections found.</div>}
          </div>
        </> : null}
      </div>
    </Modal>
  );
}

function newSection(title = "", description = "") { return { id: makeId("section"), title: text(title), description: text(description), items: [] }; }
function newItem() { return { id: makeId("item"), title: "", description: "", weight: "" }; }
function newEvaluation() { return { id: makeId("evaluation"), from: "", to: "", grade: "" }; }

function StandardForm({ meta, adminPassword, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ department: "", rolePosition: "", title: "", description: "" });
  const [sections, setSections] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const positions = positionsForDepartment(meta, form.department);
  const totalWeight = sections.flatMap((section) => section.items).reduce((sum, item) => sum + Math.max(0, number(item.weight)), 0);
  const duplicate = (meta.standards || []).some((standard) => lower(standard.department) === lower(form.department) && lower(standard.rolePosition) === lower(form.rolePosition));

  const updateItem = (sectionId, itemId, patch) => setSections((rows) => rows.map((section) => section.id === sectionId ? { ...section, items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) } : section));
  const removeSection = async (section) => {
    const confirmed = window.OpsDeleteConfirm?.confirm ? await window.OpsDeleteConfirm.confirm({ title: "Delete KPI section?", itemType: "KPI section", itemName: section.title || "KPI section", message: `You’re going to delete “${section.title || "this KPI section"}” and every subsection inside it. This action cannot be undone after saving.` }) : window.confirm(`Delete “${section.title || "this KPI section"}” and all of its subsections?`);
    if (confirmed) setSections((rows) => rows.filter((row) => row.id !== section.id));
  };
  const removeItem = async (sectionId, item) => {
    const confirmed = window.OpsDeleteConfirm?.confirm ? await window.OpsDeleteConfirm.confirm({ title: "Delete KPI subsection?", itemType: "KPI subsection", itemName: item.title || "KPI subsection", message: `Delete “${item.title || "this KPI subsection"}”? This action cannot be undone after saving.` }) : window.confirm(`Delete “${item.title || "this KPI subsection"}”?`);
    if (confirmed) setSections((rows) => rows.map((section) => section.id === sectionId ? { ...section, items: section.items.filter((row) => row.id !== item.id) } : section));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (duplicate) notify("A KPI standard already exists for this department and position. The new standard will still be saved.", "info");
    if (!sections.length) return notify("Add a KPI section first.", "error");
    const items = sections.flatMap((section, sectionIndex) => section.items.map((item, itemIndex) => ({ sectionOrder: sectionIndex + 1, section: section.title || `Section ${sectionIndex + 1}`, sectionDescription: section.description, subsectionOrder: itemIndex + 1, subsection: text(item.title), subsectionDescription: text(item.description), weightPercent: number(item.weight) }))).filter((item) => item.subsection);
    if (!items.length) return notify("Add at least one KPI subsection inside a section.", "error");
    if (!form.department || !form.rolePosition) return notify("Department and role/position are required.", "error");
    setBusy(true);
    try {
      const body = await requestJson("/api/kpis/standards", { method: "POST", body: JSON.stringify({ ...form, items, evaluations: evaluations.map((row, index) => ({ evaluationOrder: index + 1, scoreFromPercentage: number(row.from), scoreToPercentage: row.to === "" ? 100 : number(row.to), grade: text(row.grade) })).filter((row) => row.grade), adminPassword }) });
      await onSaved(body, duplicate);
    } catch (err) { notify(err.message || "Failed to save KPI standard.", "error"); } finally { setBusy(false); }
  };
  return (
    <>
      <Modal size="wide" icon="target" kicker="Create a KPI standard" title="Department & role KPI points" onClose={onClose}>
        <form className="kpis-form" onSubmit={submit}>
          <div className="kpis-form-grid kpis-form-grid--standard">
            <label>Department<ModernSelect value={form.department} onChange={(value) => setForm((current) => ({ ...current, department: value, rolePosition: "" }))} placeholder="Choose department" options={(meta.departments || []).map((value) => ({ value, label: value }))} /></label>
            <label>Role / Position<ModernSelect value={form.rolePosition} onChange={(value) => setForm((current) => ({ ...current, rolePosition: value }))} placeholder={form.department ? "Choose position" : "Choose department first"} disabled={!form.department} options={positions.map((value) => ({ value, label: value }))} /></label>
          </div>
          <label>Standard title<input className="kpis-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: STEAM Instructor KPIs" /></label>
          <label>Description<textarea className="kpis-textarea" rows="2" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="kpis-items-head"><h3>KPI sections</h3><div className="kpis-items-actions"><button className="kpis-btn kpis-btn--dark" type="button" onClick={() => setSectionDialog(true)}><Icon name="folder-plus"/><span>Add section</span></button></div></div>
          <div className="kpis-items">
            {!sections.length ? <div className="kpis-empty-editor"><strong>No KPI sections yet.</strong></div> : sections.map((section, sectionIndex) => <section className="kpis-section-card" key={section.id}>
              <div className="kpis-section-card__head"><div className="kpis-section-card__titleline"><span className="kpis-section-card__order">{sectionIndex + 1}</span><h4>{section.title || `Section ${sectionIndex + 1}`}</h4></div><button className="kpis-section-delete" type="button" onClick={() => removeSection(section)} aria-label="Delete section" title="Delete section"><Icon name="trash-2"/></button></div>
              <div className={`kpis-section-card__description ${section.description ? "" : "is-empty"}`}>{section.description}</div>
              <div className="kpis-section-rows">
                {section.items.map((item, itemIndex) => <div className="kpis-item-row kpis-item-row--sectioned" key={item.id}>
                  <div className="kpis-item-row__top kpis-item-row__top--sectioned">
                    <div className="kpis-subsection-number-field"><span className="kpis-sub-number">{itemIndex + 1}</span></div>
                    <label>Title<input className="kpis-input" value={item.title} onChange={(event) => updateItem(section.id, item.id, { title: event.target.value })} /></label>
                    <label>Weight<input className="kpis-input" type="number" min="0" step="0.01" value={item.weight} onChange={(event) => updateItem(section.id, item.id, { weight: event.target.value })} /></label>
                  </div>
                  <label>Subsection description<textarea className="kpis-textarea" rows="2" value={item.description} onChange={(event) => updateItem(section.id, item.id, { description: event.target.value })} /></label>
                  <div className="kpis-row-actions"><button className="kpis-row-delete" type="button" onClick={() => removeItem(section.id, item)}><Icon name="trash-2"/><span>Delete subsection</span></button></div>
                </div>)}
              </div>
              <div className="kpis-section-card__footer"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={() => setSections((rows) => rows.map((row) => row.id === section.id ? { ...row, items: [...row.items, newItem()] } : row))}><Icon name="plus"/><span>Add subsection</span></button></div>
            </section>)}
          </div>
          <div className={`kpis-total-weight ${Math.abs(totalWeight - 100) < 0.01 ? "is-complete" : totalWeight > 100 ? "is-over" : ""}`}><span>Total weight</span><strong>{totalWeight.toFixed(1)}</strong></div>
          <div className="kpis-overall-evaluation">
            <div className="kpis-items-head kpis-items-head--evaluation"><h3>Overall Evaluation</h3><div className="kpis-items-actions"><button className="kpis-btn kpis-btn--dark" type="button" onClick={() => setEvaluations((rows) => [...rows, newEvaluation()])}><Icon name="plus-square"/><span>Add evaluation</span></button></div></div>
            <div className="kpis-evaluations">{evaluations.length ? evaluations.map((row, index) => <div className="kpis-evaluation-row" key={row.id}><span className="kpis-evaluation-row__number">{index + 1}</span><label>From score<input className="kpis-input" type="number" min="0" max="100" step="0.01" value={row.from} onChange={(event) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, from: event.target.value } : item))} /></label><label>To score<input className="kpis-input" type="number" min="0" max="100" step="0.01" value={row.to} onChange={(event) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, to: event.target.value } : item))} /></label><label>Grade<input className="kpis-input" value={row.grade} onChange={(event) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, grade: event.target.value } : item))} placeholder="Excellent" /></label><button className="kpis-section-delete kpis-evaluation-delete" type="button" onClick={() => setEvaluations((rows) => rows.filter((item) => item.id !== row.id))} aria-label="Delete evaluation"><Icon name="trash-2"/></button></div>) : <div className="kpis-empty-evaluation">No overall evaluation ranges yet.</div>}</div>
          </div>
          <div className="kpis-modal-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClose}>Cancel</button><button className="kpis-btn kpis-btn--primary" type="submit" disabled={busy}><Icon name="save"/><span>{busy ? "Saving..." : "Save standard"}</span></button></div>
        </form>
      </Modal>
      {sectionDialog ? <SectionTitleDialog onClose={() => setSectionDialog(false)} onAdd={({ title, description }) => { setSections((rows) => [...rows, newSection(title || `Section ${rows.length + 1}`, description)]); setSectionDialog(false); }} /> : null}
    </>
  );
}

function ReviewCreate({ meta, adminPassword, onClose, onCreated, notify }) {
  const initialUserId = text(meta?.currentUser?.id) || text(meta?.users?.[0]?.id);
  const [form, setForm] = useState({ teamMemberId: initialUserId, reviewMonth: currentMonthInput(), standardId: "" });
  const [busy, setBusy] = useState(false);
  const selectedUser = (meta.users || []).find((user) => String(user.id) === String(form.teamMemberId)) || meta.currentUser || null;
  const standards = matchingStandards(meta, selectedUser);
  useEffect(() => { if (form.standardId && !standards.some((standard) => String(standard.id) === String(form.standardId))) setForm((current) => ({ ...current, standardId: "" })); }, [form.teamMemberId]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (event) => {
    event.preventDefault();
    if (!form.teamMemberId || !form.reviewMonth || !form.standardId) return notify("Employee, review month, and KPI standard are required.", "error");
    setBusy(true);
    try {
      const body = await requestJson("/api/kpis/reviews", { method: "POST", body: JSON.stringify({ teamMemberId: form.teamMemberId, teamMemberName: selectedUser?.name || "", reviewMonth: `${form.reviewMonth}-01`, standardId: form.standardId, adminPassword }) });
      await onCreated(body.reviewId, adminPassword);
    } catch (err) { notify(err.message || "Failed to create KPI review.", "error"); } finally { setBusy(false); }
  };
  return (
    <Modal panelClass="kpis-review-panel" icon="user-check" kicker="Monthly review" title="Create employee KPI review" onClose={onClose}>
      <form className={`kpis-form kpis-review-form ${busy ? "is-transitioning" : ""}`} onSubmit={submit}>
        <label className="kpis-modern-field">Employee<ModernSelect value={form.teamMemberId} onChange={(value) => setForm((current) => ({ ...current, teamMemberId: value, standardId: "" }))} placeholder="Choose employee" options={(meta.users || []).map((user) => ({ value: user.id, label: user.name }))} /></label>
        <label className="kpis-modern-field">Review Month<input className="kpis-input" type="month" value={form.reviewMonth} onChange={(event) => setForm((current) => ({ ...current, reviewMonth: event.target.value }))} /></label>
        <label className="kpis-modern-field">KPI Standard<ModernSelect value={form.standardId} onChange={(value) => setForm((current) => ({ ...current, standardId: value }))} placeholder={standards.length ? "Choose KPI standard" : "No matching standards"} options={standards.map((standard) => ({ value: standard.id, label: `${standard.title} — ${standard.department} / ${standard.rolePosition}` }))} /></label>
        <div className="kpis-modal-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClose}>Cancel</button><button className="kpis-btn kpis-btn--primary" type="submit" disabled={busy}><Icon name="arrow-right"/><span>{busy ? "Opening..." : "Create / open"}</span></button></div>
      </form>
      {busy ? <div className="kpis-transition-loader"><span className="kpis-transition-spinner"/><strong>Opening KPI review...</strong><small>Please wait while the review page is prepared.</small></div> : null}
    </Modal>
  );
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Failed to read evidence file.")); reader.readAsDataURL(file); });
}
async function directUpload(file) {
  if (!file) throw new Error("Choose an evidence file first.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Evidence file must be 15 MB or smaller.");
  const fallback = async () => {
    const dataUrl = await fileToDataUrl(file);
    const body = await requestJson("/api/kpis/evidence-upload", { method: "POST", body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size, dataUrl }) });
    return body.file;
  };
  try {
    const ticket = await requestJson("/api/storage/upload-ticket", { method: "POST", body: JSON.stringify({ scope: "kpi-evidence", filename: file.name, mime: file.type || "application/octet-stream", size: file.size }) });
    if (!ticket?.upload?.signedUrl || !ticket?.uploadRef) return await fallback();
    const upload = await fetch(ticket.upload.signedUrl, { method: ticket.upload.method || "PUT", headers: ticket.upload.headers || {}, body: file });
    if (!upload.ok) throw new Error("Direct storage upload failed.");
    const complete = await requestJson("/api/storage/upload-complete", { method: "POST", body: JSON.stringify({ uploadRef: ticket.uploadRef }) });
    return complete.file;
  } catch (error) {
    if (file.size <= 4 * 1024 * 1024) return await fallback();
    throw error;
  }
}

function ReviewDetail({ reviewId, readOnly, adminPassword = "", onClose, onSaved, notify }) {
  const [data, setData] = useState(null);
  const [scores, setScores] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const query = adminPassword ? `?adminPassword=${encodeURIComponent(adminPassword)}` : "";
    requestJson(`/api/kpis/reviews/${encodeURIComponent(reviewId)}${query}`).then((body) => { setData(body); setScores((body.details || []).map((item) => ({ ...item }))); }).catch((err) => setError(err.message));
  }, [reviewId, adminPassword]);
  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of scores) {
      const key = `${item.sectionOrder}:${item.section}`;
      if (!map.has(key)) map.set(key, { section: item.section, sectionDescription: item.sectionDescription, items: [] });
      map.get(key).items.push(item);
    }
    return [...map.values()];
  }, [scores]);
  const summary = data?.summary;
  const update = (scoreId, patch) => setScores((rows) => rows.map((row) => String(row.scoreId) === String(scoreId) ? { ...row, ...patch } : row));
  const uploadEvidence = async (scoreId, file) => {
    if (!file) return;
    setUploading(scoreId);
    try {
      const uploaded = await directUpload(file);
      if (!uploaded?.url) throw new Error("Evidence upload did not return a file URL.");
      update(scoreId, { evidenceText: uploaded.url });
      notify("Evidence uploaded successfully.", "success");
    } catch (err) { notify(err.message || "Failed to upload evidence.", "error"); } finally { setUploading(""); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (readOnly) return;
    setBusy(true);
    try {
      await requestJson(`/api/kpis/reviews/${encodeURIComponent(reviewId)}/scores`, { method: "PATCH", body: JSON.stringify({ scores: scores.map((item) => ({ scoreId: item.scoreId, actualPercent: item.actualPercent === "" ? null : item.actualPercent, evidenceText: item.evidenceText, managerNotes: item.managerNotes })) }) });
      await onSaved();
      onClose();
      notify("KPI scores saved successfully.", "success");
    } catch (err) { notify(err.message || "Failed to save KPI scores.", "error"); } finally { setBusy(false); }
  };
  return (
    <Modal size="wide" panelClass="kpis-score-panel" icon="trending-up" kicker={summary ? `${fmtMonth(summary.reviewMonth)} KPI review` : "KPI review"} title={summary?.teamMemberName || "Employee KPI review"} onClose={onClose}>
      {error ? <div className="kpis-chart-empty">{error}</div> : null}
      {!data && !error ? <div className="kpis-chart-empty">Loading KPI review...</div> : null}
      {data && summary ? <form className={`kpis-form ${readOnly ? "is-read-only" : ""}`} onSubmit={save}>
        <div className="kpis-score-editor">
          <div className="kpis-review-detail-grid">
            <div><span>Employee</span><strong>{summary.teamMemberName || "—"}</strong></div>
            <div><span>Department</span><strong>{summary.department || "—"}</strong></div>
            <div><span>Role / Position</span><strong>{summary.rolePosition || "—"}</strong></div>
            <div><span>Month</span><strong>{fmtMonth(summary.reviewMonth)}</strong></div>
            <div><span>Score</span><strong>{summary.reviewId ? `${number(summary.finalPercentage).toFixed(1)}%` : "—"}</strong></div>
            <div><span>Created by</span><strong>{summary.createdByName || "—"}</strong></div>
            <div><span>Created time</span><strong>{fmtDateTime(summary.createdAt)}</strong></div>
          </div>
          {grouped.map((section, sectionIndex) => <div className="kpis-score-section kpis-score-section--modern" key={`${sectionIndex}-${section.section}`}>
            <div className="kpis-score-section__head"><div><span className="kpis-score-section__number">{sectionIndex + 1}</span><strong>{section.section || "Section"}</strong></div>{section.sectionDescription ? <p>{section.sectionDescription}</p> : null}</div>
            <div className="kpis-score-subcards">{section.items.map((item) => {
              const scoreValue = item.actualPercent === null || typeof item.actualPercent === "undefined" ? "" : item.actualPercent;
              const percentValue = scoreValue === "" ? 0 : scoreToPercentage(scoreValue, item.weightPercent);
              return <article className={`kpis-score-subcard ${readOnly ? "kpis-score-subcard--readonly" : ""}`} key={item.scoreId}>
                <div className="kpis-score-subcard__head"><div className="kpis-score-subcard__title"><span>{item.subsectionOrder || "—"}</span><div><h4>{item.subsection || "KPI subsection"}</h4>{item.subsectionDescription ? <p>{item.subsectionDescription}</p> : null}</div></div><div className="kpis-score-weight-pill"><span>Weight</span><strong>{number(item.weightPercent).toFixed(1)}</strong></div></div>
                {readOnly ? <><div className="kpis-score-readonly-grid"><div className="kpis-score-readonly-card"><span>Score</span><strong>{scoreValue === "" ? "—" : number(scoreValue).toFixed(1)}</strong></div><div className="kpis-score-readonly-card"><span>KPI %</span><strong>{percentValue.toFixed(1)}%</strong></div></div><div className="kpis-score-readonly-notes"><div><span>Evidence</span>{text(item.evidenceText) ? (isUrlEvidence(item.evidenceText) ? <a className="kpis-evidence-link" href={item.evidenceText} target="_blank" rel="noopener noreferrer"><Icon name="paperclip"/><strong>{evidenceFileName(item.evidenceText)}</strong></a> : <p>{evidenceFileName(item.evidenceText)}</p>) : <p>—</p>}</div><div><span>Manager notes</span><p>{text(item.managerNotes) || "—"}</p></div></div></> : <><div className="kpis-score-subcard__body"><label className="kpis-score-input-card"><span>Score</span><input className="kpis-input" type="number" min="0" max={number(item.weightPercent)} step="0.01" value={scoreValue} onChange={(event) => update(item.scoreId, { actualPercent: event.target.value })} /></label><div className="kpis-score-percent-card"><span>KPI %</span><strong>{percentValue.toFixed(1)}%</strong></div></div><div className="kpis-score-notes kpis-score-notes--modern kpis-score-notes--evidence"><div className="kpis-evidence-card"><span>Evidence</span><input id={`kpi-evidence-${item.scoreId}`} type="file" hidden onChange={(event) => uploadEvidence(item.scoreId, event.target.files?.[0])} /><button className="kpis-evidence-upload" type="button" disabled={uploading === item.scoreId} onClick={() => document.getElementById(`kpi-evidence-${item.scoreId}`)?.click()}>{uploading === item.scoreId ? <><span className="kpis-loading-dot"/><strong>Uploading...</strong></> : <><Icon name="upload-cloud"/><strong>Upload evidence</strong></>}</button><small>{evidenceFileName(item.evidenceText)}</small></div><label>Manager notes<textarea className="kpis-textarea" rows="2" value={item.managerNotes || ""} onChange={(event) => update(item.scoreId, { managerNotes: event.target.value })} /></label></div></>}
              </article>;
            })}</div>
          </div>)}
        </div>
        {!readOnly ? <div className="kpis-modal-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClose}>Cancel</button><button className="kpis-btn kpis-btn--primary" type="submit" disabled={busy}><Icon name="save"/><span>{busy ? "Saving..." : "Save scores"}</span></button></div> : null}
      </form> : null}
    </Modal>
  );
}

function ReviewFilters({ meta, value, onChange, onApply, onClear, onClose, notify }) {
  const [draft, setDraft] = useState(value);
  const [sections, setSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);
  useEffect(() => {
    let active = true;
    if (!draft.standardId) { setSections([]); return () => { active = false; }; }
    setLoadingSections(true);
    requestJson(`/api/kpis/standards?id=${encodeURIComponent(draft.standardId)}`).then((body) => { if (active) setSections(body.sections || []); }).catch((err) => notify(err.message, "error")).finally(() => { if (active) setLoadingSections(false); });
    return () => { active = false; };
  }, [draft.standardId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal size="small" panelClass="kpis-review-filters-panel" icon="sliders" kicker="Filter by" onClose={onClose}>
      <form className="kpis-form" onSubmit={(event) => { event.preventDefault(); onChange(draft); onApply(draft); }}>
        <div className="kpis-filter-grid">
          <label><span>Employee</span><ModernSelect value={draft.teamMemberId} onChange={(value) => setDraft((current) => ({ ...current, teamMemberId: value }))} placeholder="All employees" options={[{ value: "", label: "All employees" }, ...(meta.users || []).map((user) => ({ value: user.id, label: user.name }))]} /></label>
          <label><span>Department</span><ModernSelect value={draft.department} onChange={(value) => setDraft((current) => ({ ...current, department: value }))} placeholder="All departments" options={[{ value: "", label: "All departments" }, ...(meta.departments || []).map((value) => ({ value, label: value }))]} /></label>
          <label><span>Role</span><ModernSelect value={draft.position} onChange={(value) => setDraft((current) => ({ ...current, position: value }))} placeholder="All roles" options={[{ value: "", label: "All roles" }, ...(meta.positions || []).map((value) => ({ value, label: value }))]} /></label>
          <label><span>Month</span><input className="kpis-input" type="month" value={draft.month} onChange={(event) => setDraft((current) => ({ ...current, month: event.target.value }))} /></label>
          <label><span>KPI</span><ModernSelect value={draft.standardId} onChange={(value) => setDraft((current) => ({ ...current, standardId: value, sectionOrder: "", sectionLabel: "" }))} placeholder="All KPIs" options={[{ value: "", label: "All KPIs" }, ...(meta.standards || []).map((standard) => ({ value: standard.id, label: standardOptionLabel(standard) }))]} /></label>
          <label><span>Section</span><ModernSelect value={draft.sectionOrder} onChange={(value) => { const selectedSection = sections.find((section) => String(section.sectionOrder) === String(value)); setDraft((current) => ({ ...current, sectionOrder: value, sectionLabel: selectedSection?.section || "" })); }} placeholder={!draft.standardId ? "Choose KPI first" : loadingSections ? "Loading sections..." : "All sections"} disabled={!draft.standardId || loadingSections} options={[{ value: "", label: "All sections" }, ...sections.map((section) => ({ value: String(section.sectionOrder), label: section.section || `Section ${section.sectionOrder}` }))]} /></label>
        </div>
        <div className="kpis-modal-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClear}>Clear</button><button className="kpis-btn kpis-btn--dark" type="submit"><Icon name="check"/><span>Apply filters</span></button></div>
      </form>
    </Modal>
  );
}

function StandardFilters({ meta, value, onChange, onApply, onClear, onClose }) {
  const [draft, setDraft] = useState(value);
  const positions = draft.department ? positionsForDepartment(meta, draft.department) : unique(meta.positions || []);
  return (
    <Modal size="small" panelClass="kpis-standard-filters-panel" icon="sliders" kicker="Filter standards" onClose={onClose}>
      <form className="kpis-form" onSubmit={(event) => { event.preventDefault(); onChange(draft); onApply(draft); }}>
        <div className="kpis-filter-grid kpis-filter-grid--standards">
          <label><span>Department</span><ModernSelect value={draft.department} onChange={(value) => setDraft((current) => ({ ...current, department: value, position: "" }))} placeholder="All departments" options={[{ value: "", label: "All departments" }, ...(meta.departments || []).map((value) => ({ value, label: value }))]} /></label>
          <label><span>Role / Position</span><ModernSelect value={draft.position} onChange={(value) => setDraft((current) => ({ ...current, position: value }))} placeholder="All positions" options={[{ value: "", label: "All positions" }, ...positions.map((value) => ({ value, label: value }))]} /></label>
        </div>
        <div className="kpis-modal-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={onClear}>Clear</button><button className="kpis-btn kpis-btn--dark" type="submit"><Icon name="check"/><span>Apply filters</span></button></div>
      </form>
    </Modal>
  );
}

export default function KpisClient({ initialMeta, initialReviews, initialGraph, bootstrapWarnings = [] }) {
  const [meta, setMeta] = useState(initialMeta || {});
  const [reviews, setReviews] = useState(Array.isArray(initialReviews?.reviews) ? initialReviews.reviews : []);
  const [graphPoints, setGraphPoints] = useState(Array.isArray(initialGraph?.points) ? initialGraph.points : []);
  const [activeGraphMonth, setActiveGraphMonth] = useState(() => currentMonthKey());
  const [graphInteracted, setGraphInteracted] = useState(false);
  const [reviewTab, setReviewTab] = useState("all");
  const [reviewFilters, setReviewFilters] = useState({ teamMemberId: "", department: "", position: "", month: "", standardId: "", sectionOrder: "", sectionLabel: "" });
  const [standardFilters, setStandardFilters] = useState({ department: "", position: "" });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const currentUser = meta.currentUser || {};
  const accessLevel = lower(meta.accessLevel || currentUser.accessLevel || "view");

  const notify = (message, type = "info", title = "") => setToast({ message, type, title });
  const buildReviewQuery = ({ filters = reviewFilters, tab = reviewTab } = {}) => {
    const query = new URLSearchParams();
    if (filters.teamMemberId) query.set("teamMemberId", filters.teamMemberId);
    if (filters.department) query.set("department", filters.department);
    if (filters.position) query.set("rolePosition", filters.position);
    if (filters.standardId) query.set("standardId", filters.standardId);
    if (filters.sectionOrder) query.set("sectionOrder", filters.sectionOrder);
    if (filters.month) { query.set("from", `${filters.month}-01`); query.set("to", `${filters.month}-01`); }
    const currentUserId = text(currentUser.id);
    if (tab === "mine" && currentUserId) query.set("teamMemberId", currentUserId);
    if (tab === "created" && currentUserId) query.set("createdByTeamMemberId", currentUserId);
    query.set("tab", tab || "all");
    return query;
  };
  const refreshMeta = async () => { const body = await requestJson("/api/kpis/meta"); setMeta(body); return body; };
  const refreshReviews = async ({ filters = reviewFilters, tab = reviewTab } = {}) => { const query = buildReviewQuery({ filters, tab }); const body = await requestJson(`/api/kpis/reviews${query.toString() ? `?${query.toString()}` : ""}`); setReviews(body.reviews || []); return body; };
  const refreshGraph = async () => {
    const currentUserId = text(currentUser.id);
    const body = await requestJson(`/api/kpis/graph${currentUserId ? `?teamMemberId=${encodeURIComponent(currentUserId)}` : ""}`);
    const points = body.points || [];
    setGraphPoints(points);
    const current = currentMonthKey();
    setActiveGraphMonth(current);
    setGraphInteracted(false);
    return body;
  };

  useEffect(() => {
    if (!bootstrapWarnings.length) return;
    Promise.allSettled([refreshMeta(), refreshReviews(), refreshGraph()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const graphPointByMonth = useMemo(() => new Map(graphPoints.map((point) => [monthKey(point.reviewMonth), point])), [graphPoints]);
  const selectedGraphPoint = graphInteracted
    ? (graphPointByMonth.get(activeGraphMonth) || null)
    : (graphPointByMonth.get(activeGraphMonth) || graphPoints[graphPoints.length - 1] || null);
  const visibleStandards = useMemo(() => (meta.standards || []).filter((standard) => (!standardFilters.department || lower(standard.department) === lower(standardFilters.department)) && (!standardFilters.position || lower(standard.rolePosition) === lower(standardFilters.position))), [meta.standards, standardFilters]);

  const openStandard = () => rank(accessLevel) >= rank("admin") ? setModal({ type: "standard", password: "" }) : setModal({ type: "password", kind: "standard" });
  const openReviewCreator = () => rank(accessLevel) >= rank("edit") ? setModal({ type: "create-review", password: "" }) : setModal({ type: "password", kind: "review" });
  const onStandardSaved = async (body, duplicateBefore) => {
    setModal(null);
    await refreshMeta();
    if (body?.duplicateFound && !duplicateBefore) notify("A KPI standard already exists for this department and position. The new standard was saved as an additional standard.", "info");
    notify("KPI standard saved successfully.", "success");
  };
  const onReviewCreated = async (reviewId, adminPassword = "") => {
    await Promise.all([refreshReviews(), refreshGraph()]);
    setModal({ type: "review", reviewId, readOnly: false, adminPassword });
  };
  const onReviewSaved = async () => { await Promise.all([refreshReviews(), refreshGraph()]); };
  const changeReviewTab = async (tab) => {
    setReviewTab(tab);
    try { await refreshReviews({ tab }); } catch (err) { notify(err.message, "error"); }
  };
  const filterSummary = useMemo(() => {
    const chips = [];
    const employee = (meta.users || []).find((user) => String(user.id) === String(reviewFilters.teamMemberId));
    const standard = (meta.standards || []).find((item) => String(item.id) === String(reviewFilters.standardId));
    if (reviewFilters.teamMemberId) chips.push(`Employee: ${employee?.name || reviewFilters.teamMemberId}`);
    if (reviewFilters.department) chips.push(`Department: ${reviewFilters.department}`);
    if (reviewFilters.position) chips.push(`Role: ${reviewFilters.position}`);
    if (reviewFilters.standardId) chips.push(`KPI: ${standard ? standardOptionLabel(standard) : "Selected KPI"}`);
    if (reviewFilters.sectionOrder) chips.push(`Section: ${reviewFilters.sectionLabel || reviewFilters.sectionOrder}`);
    if (reviewFilters.month) chips.push(`Month: ${fmtMonth(`${reviewFilters.month}-01`)}`);
    return chips;
  }, [reviewFilters, meta.users, meta.standards]);
  const standardFilterSummary = useMemo(() => {
    const chips = [];
    if (standardFilters.department) chips.push(`Department: ${standardFilters.department}`);
    if (standardFilters.position) chips.push(`Position: ${standardFilters.position}`);
    return chips;
  }, [standardFilters]);
  const downloadReport = () => { const query = buildReviewQuery(); window.open(`/api/kpis/reviews/report.pdf${query.toString() ? `?${query.toString()}` : ""}`, "_blank", "noopener"); };

  return (
    <section className="kpis-main">
      <Toast value={toast} onClose={() => setToast(null)} />
      <section className="kpis-hero">
        <div><span className="kpis-kicker">Performance management</span></div>
        <div className="kpis-hero-actions"><button className="kpis-btn kpis-btn--ghost" type="button" onClick={openReviewCreator}><Icon name="edit-3"/><span>Create review</span></button><button className="kpis-btn kpis-btn--primary" type="button" onClick={openStandard}><Icon name="plus"/><span>Create KPI standard</span></button></div>
      </section>

      <section className="kpis-grid">
        <article className="kpis-card kpis-card--graph">
          <div className="kpis-card-head"><div><span className="kpis-card-label">Employee monthly KPIs</span><h2>{currentUser?.name ? `${currentUser.name} KPI graph` : "Current user KPI graph"}</h2></div><div className="kpis-current-user"><strong>{currentUser?.name || "Current user"}</strong>{[currentUser?.department, currentUser?.position].filter(Boolean).length ? <span>{[currentUser.department, currentUser.position].filter(Boolean).join(" / ")}</span> : null}</div></div>
          <Graph points={graphPoints} activeMonth={activeGraphMonth} onSelect={(month) => { setActiveGraphMonth(month); setGraphInteracted(true); }} />
        </article>
        <ScoreCard summary={selectedGraphPoint} />
      </section>

      <section className="kpis-layout">
        <article className="kpis-card">
          <div className="kpis-card-head kpis-card-head--wrap"><div><span className="kpis-card-label">Monthly reviews</span><h2>Employee KPI reviews</h2></div><div className="kpis-filters"><button className="kpis-btn kpis-btn--ghost kpis-filter-btn" type="button" onClick={() => setModal({ type: "review-filters" })}><Icon name="sliders"/><span>Filter by</span></button><button className="kpis-btn kpis-btn--dark kpis-report-btn" type="button" onClick={downloadReport}><Icon name="download"/><span>Download Report</span></button></div></div>
          <div className="kpis-filter-summary">{filterSummary.length ? filterSummary.map((chip) => <span key={chip}>{chip}</span>) : "No filters applied"}</div>
          <div className="kpis-review-tabs" role="tablist" aria-label="KPI review tabs">{[["all", "All"], ["mine", "My KPIs"], ["created", "Created by me"]].map(([value, label]) => <button type="button" key={value} className={`kpis-review-tab ${reviewTab === value ? "is-active" : ""}`} onClick={() => changeReviewTab(value)}>{label}</button>)}</div>
          <div className="kpis-table-wrap"><table className="kpis-table"><thead><tr><th>Employee</th><th>Department</th><th>Month</th><th>Score</th></tr></thead><tbody>{reviews.length ? reviews.map((review) => <tr className="kpis-review-row" key={review.reviewId} tabIndex="0" onClick={() => setModal({ type: "review", reviewId: review.reviewId, readOnly: true })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setModal({ type: "review", reviewId: review.reviewId, readOnly: true }); } }}><td><strong>{review.teamMemberName || "—"}</strong></td><td>{review.department || "—"}</td><td>{fmtMonth(review.reviewMonth)}</td><td><div className="kpis-score-actions"><span className="kpis-score-pill"><strong>{review.reviewId ? `${number(review.finalPercentage).toFixed(1)}%` : "—"}</strong><em>{review.performanceRating || "—"}</em></span>{reviewTab === "created" && rank(accessLevel) >= rank("admin") && review.reviewId ? <button className="kpis-review-edit-btn" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setModal({ type: "review", reviewId: review.reviewId, readOnly: false }); }}><Icon name="edit-3"/><span>Edit</span></button> : null}</div></td></tr>) : <tr><td colSpan="4">No KPI reviews found.</td></tr>}</tbody></table></div>
        </article>

        <article className="kpis-card">
          <div className="kpis-card-head kpis-card-head--wrap"><div><span className="kpis-card-label">Standards</span><h2>KPI standards</h2></div><button className="kpis-btn kpis-btn--ghost kpis-filter-btn" type="button" onClick={() => setModal({ type: "standard-filters" })}><Icon name="sliders"/><span>Filter by</span></button></div>
          <div className="kpis-filter-summary kpis-filter-summary--standards">{standardFilterSummary.length ? standardFilterSummary.map((chip) => <span key={chip}>{chip}</span>) : "No filters applied"}</div>
          <div className="kpis-standards">{(meta.standards || []).length ? (visibleStandards.length ? visibleStandards.map((standard) => <button className="kpis-standard-card" type="button" key={standard.id} onClick={() => setModal({ type: "standard-detail", standardId: standard.id })}><div className="kpis-standard-card__head"><h3>{standard.title || "Untitled standard"}</h3><span className="kpis-standard-date">{fmtDate(standard.createdAt)}</span></div><p>{standard.department || "—"} / {standard.rolePosition || "—"}</p></button>) : <div className="kpis-chart-empty">No KPI standards match these filters.</div>) : <div className="kpis-chart-empty">No KPI standards yet.</div>}</div>
        </article>
      </section>

      {modal?.type === "password" ? <AdminPasswordDialog kind={modal.kind} onClose={() => setModal(null)} onVerified={(password) => setModal({ type: modal.kind === "standard" ? "standard" : "create-review", password })} /> : null}
      {modal?.type === "standard" ? <StandardForm meta={meta} adminPassword={modal.password || ""} onClose={() => setModal(null)} onSaved={onStandardSaved} notify={notify} /> : null}
      {modal?.type === "create-review" ? <ReviewCreate meta={meta} adminPassword={modal.password || ""} onClose={() => setModal(null)} onCreated={onReviewCreated} notify={notify} /> : null}
      {modal?.type === "standard-detail" ? <StandardDetail standardId={modal.standardId} meta={meta} onClose={() => setModal(null)} /> : null}
      {modal?.type === "review" ? <ReviewDetail reviewId={modal.reviewId} readOnly={modal.readOnly} adminPassword={modal.adminPassword || ""} onClose={() => setModal(null)} onSaved={onReviewSaved} notify={notify} /> : null}
      {modal?.type === "review-filters" ? <ReviewFilters meta={meta} value={reviewFilters} onChange={setReviewFilters} onApply={async (filters) => { setModal(null); try { await refreshReviews({ filters }); } catch (err) { notify(err.message, "error"); } }} onClear={async () => { const cleared = { teamMemberId: "", department: "", position: "", month: "", standardId: "", sectionOrder: "", sectionLabel: "" }; setReviewFilters(cleared); setModal(null); try { await refreshReviews({ filters: cleared }); } catch (err) { notify(err.message, "error"); } }} onClose={() => setModal(null)} notify={notify} /> : null}
      {modal?.type === "standard-filters" ? <StandardFilters meta={meta} value={standardFilters} onChange={setStandardFilters} onApply={() => setModal(null)} onClear={() => { setStandardFilters({ department: "", position: "" }); setModal(null); }} onClose={() => setModal(null)} /> : null}
    </section>
  );
}
