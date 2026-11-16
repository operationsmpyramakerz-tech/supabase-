"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const PAGE_SIZE = 30;
const FETCH_SIZE = 250;
const CATEGORY_FILTERS = ["All", "Login", "Orders", "Projects", "System"];

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

function activityCategory(row) {
  const value = lower(`${row?.pageName || ""} ${row?.actionLabel || ""} ${row?.entityType || ""}`);
  if (/sign(ed)?[ -]?(in|out)|login|logout|account|auth/.test(value)) return "Login";
  if (/orders?|shopping|maintenance|stock|product|kit|proposal|requisition/.test(value)) return "Orders";
  if (/projects?|preparing|stage|cartons|testing|box distribution/.test(value)) return "Projects";
  return "System";
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const delta = Date.now() - date.getTime();
  if (delta >= 0 && delta < 60000) return "Just now";
  if (delta >= 0 && delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta >= 0 && delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return formatCardDateTime(value);
}

function HistoryIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    filter: <><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></>,
    login: <><rect x="11" y="3" width="10" height="18" rx="2"/><path d="M3 12h13m-4-4 4 4-4 4"/></>,
    order: <><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l3 13h13l2-9H6"/></>,
    edit: <><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m10 14 2-.4 9-9a2 2 0 0 0-3-3l-9 9L9 13Z"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
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

export default function HistoryClient({ initialRows, bootstrapWarnings = [], canClear = true, canProbe = false, initialHasMore = false, initialNextOffset = 0 }) {
  const [rows, setRows] = useState(Array.isArray(initialRows) ? initialRows : []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAudit, setCheckingAudit] = useState(false);
  const [auditWriteError, setAuditWriteError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [lastChecked, setLastChecked] = useState(null);
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
  }, [search, category, page, actor, action, date, status, sort]);

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

  async function loadRecent({ silent = false } = {}) {
    if (!silent) setRefreshing(true);
    try {
      const payload = await requestJson(`/next/api/history?limit=${FETCH_SIZE}&offset=0&_fresh=1`);
      const incoming = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows((current) => {
        const map = new Map();
        for (const entry of [...incoming, ...current]) map.set(text(entry?.id) || `${entry?.createdAt}:${entry?.actionLabel}`, entry);
        return [...map.values()].sort((a, b) => dateValue(b?.createdAt) - dateValue(a?.createdAt));
      });
      setLastChecked(new Date().toISOString());
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "Could not refresh activity.");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  async function verifyAuditWriter() {
    if (checkingAudit) return;
    setCheckingAudit(true);
    setAuditWriteError("");
    try {
      const result = await requestJson("/next/api/history/diagnostics", { method: "POST" });
      setToast({
        type: "success",
        title: "Database write verified",
        message: `A test event was saved${result?.rowId ? ` (ID: ${result.rowId})` : ""}. Other modules still need their own audit integrations.`,
      });
      await loadRecent({ silent: true });
    } catch (error) {
      setAuditWriteError(error?.message || "Supabase refused the audit event. Check the server logs.");
      setToast({
        type: "error",
        title: "History write failed",
        message: error?.message || "Supabase refused the audit event. Check the server logs.",
      });
    } finally {
      setCheckingAudit(false);
    }
  }

  async function loadMore() {
    if (!hasMore || fetchingMore) return;
    setFetchingMore(true);
    try {
      const payload = await requestJson(`/next/api/history?limit=${FETCH_SIZE}&offset=${nextOffset}&_fresh=1`);
      const incoming = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows((current) => {
        const map = new Map();
        for (const entry of [...current, ...incoming]) map.set(text(entry?.id) || `${entry?.createdAt}:${entry?.actionLabel}`, entry);
        return [...map.values()].sort((a, b) => dateValue(b?.createdAt) - dateValue(a?.createdAt));
      });
      setNextOffset(Number(payload?.nextOffset || nextOffset + FETCH_SIZE));
      setHasMore(Boolean(payload?.hasMore));
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "Could not load older records.");
    } finally { setFetchingMore(false); }
  }

  useEffect(() => {
    // Refresh on visible-tab focus and while History stays open; no fake client-side audit events.
    const onFocus = () => { if (document.visibilityState === "visible") void loadRecent({ silent: true }); };
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadRecent({ silent: true });
    }, 60000);
    return () => { document.removeEventListener("visibilitychange", onFocus); window.clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overview = useMemo(() => {
    const today = dateKey(new Date());
    const actors = new Set(rows.map((entry) => text(entry?.actorId) || text(entry?.actorName)).filter(Boolean));
    const latest = rows.reduce((best, entry) => dateValue(entry?.createdAt) > dateValue(best) ? entry?.createdAt : best, null);
    return { todayCount: rows.filter((entry) => dateKey(entry?.createdAt) === today).length, users: actors.size, latest };
  }, [rows]);
  const isStale = overview.latest && (Date.now() - dateValue(overview.latest)) > 7 * 24 * 60 * 60 * 1000;

  const pages = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.pageName)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const actors = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.actorName)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => text(row?.actionLabel)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => {
    const needle = lower(search);
    const result = rows.filter((row) => {
      if (category !== "All" && activityCategory(row) !== category) return false;
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
  }, [rows, search, category, page, actor, action, date, status, sort]);

  function clearFilters() {
    setSearch("");
    setCategory("All");
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
  const hasFilters = !!(search || category !== "All" || page || actor || action || date || status !== "all" || sort !== "newest");
  const activeFilterText = useMemo(() => {
    const parts = [];
    if (category !== "All") parts.push(`Category: ${category}`);
    if (page) parts.push(`Page: ${page}`);
    if (actor) parts.push(`User: ${actor}`);
    if (date) parts.push(`Date: ${formatShortDate(date)}`);
    if (action) parts.push(`Action: ${action}`);
    if (status !== "all") parts.push(`Result: ${status === "error" ? "Failed" : "Successful"}`);
    if (sort !== "newest") parts.push("Oldest first");
    if (search) parts.push(`Search: ${search}`);
    return parts.length ? parts.join(" • ") : "No filters applied";
  }, [search, category, page, actor, action, date, status, sort]);
  const visibleRows = filtered.slice(0, visibleLimit);

  return (
    <main className="next-history-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="history-design-heading">
        <div><span className="history-design-overline">ACTIVITY TRACKING</span><h1>History</h1><p>System actions across your ERP</p></div>
        <button type="button" className="history-design-refresh" disabled={refreshing} onClick={() => loadRecent()} title="Refresh history"><HistoryIcon name="refresh"/><span>{refreshing ? "Refreshing..." : "Refresh"}</span></button>
      </div>
      <section className="history-design-stats" aria-label="History overview">
        <div className="history-design-stat history-design-stat--accent"><span className="history-design-stat-icon"><HistoryIcon name="calendar"/></span><small>Today</small><strong>{overview.todayCount}</strong><em>In loaded history</em></div>
        <div className="history-design-stat"><span className="history-design-stat-icon"><HistoryIcon name="user"/></span><small>All users</small><strong>{overview.users}</strong><em>In loaded history</em></div>
        <div className="history-design-stat"><span className="history-design-stat-icon"><HistoryIcon name="clock"/></span><small>Last activity</small><strong className="history-design-stat-date">{overview.latest ? relativeTime(overview.latest) : "None"}</strong><em>{overview.latest ? formatShortDate(overview.latest) : "No records"}</em></div>
      </section>
      {(isStale || (!overview.latest && canProbe)) ? <div className="history-design-alert" role="status">
        <div className="history-design-alert-copy"><strong>No recent activity has been recorded.</strong> The latest saved event is {overview.latest ? formatCardDateTime(overview.latest) : "not available"}. The History page cannot recover events that were never recorded.</div>
        {canProbe ? <button type="button" className="history-design-audit-check" disabled={checkingAudit} onClick={verifyAuditWriter} title="Save a real test record to check the Supabase history writer"><HistoryIcon name="refresh"/><span>{checkingAudit ? "Testing write..." : "Test audit write"}</span></button> : null}
        {auditWriteError ? <div className="history-design-audit-error" role="alert">Audit write error: {auditWriteError}</div> : null}
      </div> : null}
      {loadError ? <div className="history-design-alert is-error" role="alert">{loadError} <button type="button" onClick={() => loadRecent()}>Try again</button></div> : null}
      <section className="history-design-workspace" aria-label="System activity history">
        <div className="history-design-toolbar">
          <label className="history-design-search"><HistoryIcon name="search"/><input aria-label="Search history" placeholder="Search activities, users, pages..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button type="button" className={`history-design-filter ${hasFilters ? "is-active" : ""}`} aria-label="Filter history" title="Filter history" onClick={() => { preloadHistoryDialogs(); setShowFilters(true); }}><HistoryIcon name="filter"/><span>Filter</span>{hasFilters ? <b>•</b> : null}</button>
          {canClear ? <button type="button" className="history-design-clear" onClick={() => { preloadHistoryDialogs(); setShowClear(true); }} title="Delete all history" aria-label="Delete all history"><HistoryIcon name="trash"/></button> : null}
        </div>
        <div className="history-design-categories" role="group" aria-label="Activity category">
          {CATEGORY_FILTERS.map((item) => <button type="button" className={category === item ? "is-selected" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}
        </div>
        <div className="history-design-results"><div><strong>Recent activity</strong><span>{filtered.length} matching / {rows.length} loaded{hasMore ? " · Older records available" : ""}</span></div>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
        {bootstrapWarnings.length ? <div className="history-design-alert">{bootstrapWarnings.length} data loading warning(s).</div> : null}
        <div className="history-design-feed">
          {visibleRows.length ? visibleRows.map((row, index) => {
            const categoryName = activityCategory(row);
            const iconName = categoryName === "Login" ? "login" : categoryName === "Orders" ? "order" : categoryName === "Projects" ? "edit" : "database";
            return <article className="history-design-event" key={text(row?.id) || `${row?.createdAt}-${index}`}>
              <button type="button" className={`history-design-event-icon is-${actionTone(row)}`} onClick={() => openDetails(row)} aria-label="View activity details"><HistoryIcon name={iconName}/></button>
              <button type="button" className="history-design-event-main" onClick={() => openDetails(row)}><strong>{text(row?.actionLabel) || "System action"}</strong><span><HistoryIcon name="user"/>{text(row?.actorName) || "System"}</span><small><HistoryIcon name="clock"/>{relativeTime(row?.createdAt)}</small></button>
              <div className="history-design-event-side"><span title={text(row?.pageName)}>{text(row?.pageName) || "System"}</span><button type="button" onClick={() => openDetails(row)} title="View details" aria-label={`View ${text(row?.actionLabel)} details`}><HistoryIcon name="eye"/></button></div>
            </article>;
          }) : <div className="history-design-empty"><HistoryIcon name="search"/><strong>No activities found</strong><p>{hasFilters ? "Try removing some filters." : "No history events have been recorded yet."}</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>}
        </div>
        {visibleLimit < filtered.length ? <button type="button" className="history-design-more" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>Show more results</button> : null}
        {hasMore ? <button type="button" className="history-design-more history-design-more--secondary" disabled={fetchingMore} onClick={loadMore}>{fetchingMore ? "Loading older activity..." : "Load older records"}</button> : null}
        {lastChecked ? <p className="history-design-last-check">Last checked: {formatCardDateTime(lastChecked)} · Automatically refreshes every minute</p> : null}
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
        setHasMore(false);
        setNextOffset(0);
        clearFilters();
        setToast({ type: "success", title: "History deleted", message: "All system-history records were removed successfully." });
      }} /> : null}
    </main>
  );
}
