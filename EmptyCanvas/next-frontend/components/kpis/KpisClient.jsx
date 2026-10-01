"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const AdminPasswordDialog = dynamic(() => import("./KpisDialogs").then((module) => module.AdminPasswordDialog), { ssr: false });
const StandardForm = dynamic(() => import("./KpisDialogs").then((module) => module.StandardForm), { ssr: false });
const ReviewCreate = dynamic(() => import("./KpisDialogs").then((module) => module.ReviewCreate), { ssr: false });
const StandardDetail = dynamic(() => import("./KpisDialogs").then((module) => module.StandardDetail), { ssr: false });
const ReviewDetail = dynamic(() => import("./KpisDialogs").then((module) => module.ReviewDetail), { ssr: false });
const ReviewFilters = dynamic(() => import("./KpisDialogs").then((module) => module.ReviewFilters), { ssr: false });
const StandardFilters = dynamic(() => import("./KpisDialogs").then((module) => module.StandardFilters), { ssr: false });

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
function evidenceUrl(value) {
  const raw = text(value);
  const legacy = raw.match(/^\/api\/storage\/file\/([A-Za-z0-9._~-]+)(?:\?([^#]*))?$/i);
  if (!legacy) return raw;
  const query = new URLSearchParams(legacy[2] || "");
  query.set("reference", legacy[1]);
  return `/next/api/storage/file-direct?${query.toString()}`;
}
function isUrlEvidence(value) { const raw = evidenceUrl(value); return /^https?:\/\//i.test(raw) || /^\/next\/api\/storage\/file-direct\?reference=/i.test(raw); }
function evidenceFileName(value) {
  const raw = evidenceUrl(value);
  if (!raw) return "No evidence uploaded";
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const explicitName = text(url.searchParams.get("name"));
    if (explicitName) return explicitName;
    if (/^\/(?:api\/storage\/file|next\/api\/storage\/file-direct)/i.test(url.pathname || "")) return "Evidence file";
    return decodeURIComponent((url.pathname || "").split("/").filter(Boolean).pop() || "Evidence file") || "Evidence file";
  } catch { return raw; }
}

function directKpiReadUrl(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") return "";
  const raw = String(url || "");
  const path = raw.split("?")[0];
  const supported = path === "/api/kpis/meta"
    || path === "/api/kpis/reviews"
    || path === "/api/kpis/graph"
    || path === "/api/kpis/standards";
  return supported ? `/next${raw}` : "";
}

async function requestJson(url, options = {}) {
  const directUrl = directKpiReadUrl(url, options);
  const targets = directUrl ? [directUrl] : [url];
  let lastError = null;

  for (const target of targets) {
    try {
      const response = await fetch(target, {
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
      if (!response.ok || body?.ok === false) {
        const error = new Error(text(body?.message || body?.error) || "The request failed.");
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (!directUrl || target === url || error?.message === "Your session has expired.") throw error;
    }
  }

  throw lastError || new Error("The request failed.");
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
  const downloadReport = () => { const query = buildReviewQuery(); window.open(`/next/api/kpis/report-direct${query.toString() ? `?${query.toString()}` : ""}`, "_blank", "noopener"); };

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
