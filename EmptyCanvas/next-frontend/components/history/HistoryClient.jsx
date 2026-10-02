"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const PAGE_SIZE = 50;

const HistoryFilterModal = dynamic(
  () => import("./HistoryDialogs").then((module) => module.HistoryFilterModal),
  { ssr: false }
);
const HistoryDetailsModal = dynamic(
  () => import("./HistoryDialogs").then((module) => module.HistoryDetailsModal),
  { ssr: false }
);
const HistoryProfilePopover = dynamic(
  () => import("./HistoryDialogs").then((module) => module.HistoryProfilePopover),
  { ssr: false }
);
const HistoryClearModal = dynamic(
  () => import("./HistoryDialogs").then((module) => module.HistoryClearModal),
  { ssr: false }
);

function preloadHistoryDialogs() {
  void import("./HistoryDialogs");
}


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
    filter: <><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
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

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-history-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "System History"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

export default function HistoryClient({ initialRows, bootstrapWarnings = [] }) {
  const [rows, setRows] = useState(Array.isArray(initialRows) ? initialRows : []);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
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
      if (selected) {
        setSelected(null);
        setDetailsLoading(false);
        setDetailsError("");
      }
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

  async function openDetails(row) {
    if (!row) return;
    preloadHistoryDialogs();
    setSelected(row);
    setDetailsError("");
    const id = text(row?.id);
    if (!id || row?.detailsLoaded === true) {
      setDetailsLoading(false);
      return;
    }

    setDetailsLoading(true);
    try {
      const payload = await requestJson(`/next/api/history/${encodeURIComponent(id)}`);
      const fullRow = payload?.row && typeof payload.row === "object" ? payload.row : null;
      if (fullRow) {
        setSelected((current) => text(current?.id) === id ? { ...current, ...fullRow, detailsLoaded: true } : current);
      }
    } catch (error) {
      setDetailsError(error.message || "Full history details could not be loaded.");
    } finally {
      setDetailsLoading(false);
    }
  }

  function openProfilePopover(anchor, row) {
    preloadHistoryDialogs();
    if (!text(row?.actorId)) {
      openDetails(row);
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

      <section className="next-history-list-card next-history-list-card--parity">
        <header className="next-history-list-head--parity">
          <div className="next-history-list-heading">
            <span className="next-history-kicker">RECENT ACTIVITY</span>
            <h3>System actions</h3>
            <p title={activeFilterText}>{activeFilterText}</p>
          </div>
          <div className="next-history-list-actions--parity">
            <button type="button" className={`next-history-filter-button ${hasFilters ? "is-active" : ""}`} onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={() => { preloadHistoryDialogs(); setShowFilters(true); }}>
              <HistoryIcon name="filter"/><span>Filter by</span>{hasFilters ? <b aria-label="Filters active">•</b> : null}
            </button>
            <strong className="next-history-count-badge">{filtered.length} record{filtered.length === 1 ? "" : "s"}</strong>
            <button type="button" className="next-history-delete-button" onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={() => { preloadHistoryDialogs(); setShowClear(true); }} aria-label="Delete all history" title="Delete all history">
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
                <button type="button" className={`next-history-action-mark is-${actionTone(row)}`} onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={() => openDetails(row)} aria-label={`Open ${text(row?.actionLabel) || "history"} details`}>{actionMark(row)}</button>
                <button type="button" className="next-history-row-main" onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={() => openDetails(row)}>
                  <strong>{text(row?.actionLabel) || "System action"}</strong>
                  <span>{entityLabel(row)}</span>
                </button>
                <div className="next-history-row-context">
                  <span>{text(row?.pageName) || "System"}</span>
                  <small>{text(row?.method) || "—"} {statusCode ? `• ${statusCode}` : ""}</small>
                </div>
                <button type="button" className="next-history-actor co-right-ico co-creator-btn" onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={(event) => openProfilePopover(event.currentTarget, row)} aria-label={`Created by ${text(row?.actorName) || "System"}`} title={`Created by ${text(row?.actorName) || "System"}`}>
                  <span className="next-history-actor-initials">{initials(row?.actorName)}</span>
                  <span className="next-history-actor-icon"><HistoryIcon name="user"/></span>
                  <div><strong>{text(row?.actorName) || "System"}</strong><small>{text(row?.actorDepartment || row?.actorPosition) || "System activity"}</small></div>
                </button>
                <time>{formatCardDateTime(row?.createdAt)}</time>
                <button type="button" className="next-history-open" onMouseEnter={preloadHistoryDialogs} onFocus={preloadHistoryDialogs} onClick={() => openDetails(row)}>View</button>
              </article>
            );
          }) : (
            <div className="next-history-empty"><span>0</span><strong>No history records found</strong><p>Change the filters to find the records you need.</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
          )}
        </div>

        {visibleLimit < filtered.length ? <button type="button" className="next-history-show-more" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - visibleLimit)} more records</button> : null}
      </section>

      {showFilters ? <HistoryFilterModal
        current={currentFilters}
        pages={pages}
        actors={actors}
        actions={actions}
        onClose={() => setShowFilters(false)}
        onClear={() => { clearFilters(); setShowFilters(false); }}
        onApply={applyFilters}
      /> : null}
      {selected ? <HistoryDetailsModal
        row={selected}
        loadingDetails={detailsLoading}
        detailsError={detailsError}
        onClose={() => { setSelected(null); setDetailsLoading(false); setDetailsError(""); }}
        onProfile={() => {
          const current = selected;
          setSelected(null);
          setDetailsLoading(false);
          setDetailsError("");
          const width = Math.min(380, window.innerWidth - 28);
          setProfilePopover({ row: current, left: Math.max(14, window.innerWidth - width - 24), top: 90 });
        }}
      /> : null}
      {profilePopover ? <HistoryProfilePopover state={profilePopover} onClose={() => setProfilePopover(null)} /> : null}
      {showClear ? <HistoryClearModal onClose={() => setShowClear(false)} onCleared={() => {
        setRows([]);
        clearFilters();
        setToast({ type: "success", title: "History deleted", message: "All system-history records were removed successfully." });
      }} /> : null}
    </main>
  );
}
