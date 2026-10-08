"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { BodyClassSync } from "../ClassicShellControls";
import NotificationsBell from "../notifications/NotificationsBell";
import UserProfileMenu from "../UserProfileMenu";
import ClassicTaskSelect from "./ClassicTaskSelect";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";

const ClassicTaskWorkflowDetails = dynamic(() => import("./ClassicTaskWorkflowDetails"), { ssr: false });
const TaskManagementDialogs = dynamic(() => import("./TaskManagementDialogs"), { ssr: false });

const STATUS_OPTIONS = [
  ["all", "All", "layers"],
  ["not_started", "Not started", "circle"],
  ["in_progress", "In progress", "activity"],
  ["completed", "Completed", "check-circle"],
  ["archived", "Archive", "archive"],
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const VIEW_COPY = {
  all: {
    label: "All Tasks",
    subtitle: "All cross-department workflow tickets across the company.",
    empty: "No tasks found",
    emptyText: "No cross-department workflow tickets have been created yet.",
  },
  my: {
    label: "My Tasks",
    subtitle: "Tickets with workflow work assigned to your department.",
    empty: "No tasks assigned to you",
    emptyText: "You do not have any active workflow work assigned to your department yet.",
  },
  delegated: {
    label: "Delegated Tasks",
    subtitle: "Tickets you created and delegated to other departments.",
    empty: "No delegated tasks found",
    emptyText: "Create a project to start a workflow between departments.",
  },
};

function TaskPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

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
function statusLabel(value) {
  return ({
    not_started: "Not started",
    in_progress: "In progress",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
  })[text(value)] || "Not started";
}
function priorityKey(value) {
  const key = lower(value);
  return ["urgent", "high", "low"].includes(key) ? key : "normal";
}
function dateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}
function dateFromKey(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
function todayKey() {
  return dateKey(new Date());
}
function newClientId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function ticketStats(ticket, view) {
  const scoped = view === "my";
  const total = scoped && Number.isFinite(Number(ticket?.viewerSectionsCount))
    ? number(ticket.viewerSectionsCount)
    : number(ticket?.sectionsCount);
  const completed = scoped && Number.isFinite(Number(ticket?.viewerCompletedCount))
    ? number(ticket.viewerCompletedCount)
    : number(ticket?.completedCount);
  const progress = scoped && Number.isFinite(Number(ticket?.viewerProgress))
    ? number(ticket.viewerProgress)
    : (total ? Math.round((completed / total) * 100) : 0);
  return { total: Math.max(0, total), completed: Math.max(0, completed), progress: Math.max(0, Math.min(100, progress)) };
}
function apiError(body, fallback = "The request failed.") {
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
  if (response.status === 401 && !options.allow401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(apiError(body));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
function ticketDepartments(ticket) {
  return [...new Set((ticket?.sections || []).map((section) => text(section?.department)).filter(Boolean))];
}
function dependenciesFor(items, edges, targetId) {
  return (Array.isArray(edges) ? edges : [])
    .filter((edge) => text(edge?.to) === text(targetId))
    .map((edge) => text(edge?.from))
    .filter((id) => items.some((item) => text(item.clientId || item.id) === id));
}

function FeatherIcon({ name, className = "" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className };
  const paths = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    circle: <circle cx="12" cy="12" r="10"/>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    "check-circle": <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    "plus-square": <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    "chevron-left": <polyline points="15 18 9 12 15 6"/>,
    "chevron-right": <polyline points="9 18 15 12 9 6"/>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    "more-vertical": <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></>,
    move: <><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></>,
  };
  return <svg {...common}>{paths[name] || paths["git-branch"]}</svg>;
}

function statusIconName(status) {
  return ({ not_started: "circle", in_progress: "activity", completed: "check-circle", rejected: "x", cancelled: "x" })[text(status)] || "circle";
}

function CreatorProfileButton({ ticket, className = "" }) {
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const name = text(ticket?.createdByName) || "Creator";
  const key = text(ticket?.createdById || ticket?.createdByName);
  const toggle = async (event) => {
    event.stopPropagation();
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (profile || !key) return;
    setLoading(true);
    try {
      const body = await loadTeamMemberPublicProfile(key);
      setProfile(body);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, []);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  return <span className="tm-creator-anchor" ref={ref}>
    <button className={`co-right-ico co-creator-btn tm-ticket-creator-btn ${className}`.trim()} type="button" onClick={toggle} aria-label={`Created by ${name}`} title={`Created by ${name}`}><FeatherIcon name="user" /></button>
    {open ? <div className="creator-profile-popover tm-creator-profile-popover is-open" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", left: "auto" }} aria-hidden="false" onClick={(event) => event.stopPropagation()}>
      <div className="creator-profile-window" role="dialog" aria-label="Created by profile">
        <button type="button" className="creator-profile-close" aria-label="Close" onClick={() => setOpen(false)}><span className="creator-profile-close-x">×</span></button>
        <div className="creator-profile-head">
          <div className={`creator-profile-avatar ${profile?.photoUrl ? "has-image" : ""}`}>{profile?.photoUrl ? <img src={profile.photoUrl} alt={name} /> : <span>{initials}</span>}</div>
          <div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{profile?.name || name}</div><div className="creator-profile-subtitle">{[profile?.position, profile?.department].filter(Boolean).join(" • ") || "Team member"}</div></div>
        </div>
        {loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : profile ? <><div className="creator-profile-section-title">Profile details</div><div className="creator-profile-fields">{[["Name", profile.name || profile.username], ["Department", profile.department], ["Position", profile.position], ["Phone", profile.phone], ["Email", profile.email], ["Employee Code", profile.employeeCode]].filter(([, value]) => text(value)).map(([label, value]) => <div className="creator-profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></> : <div className="creator-profile-state creator-profile-state--error"><span>Could not load this user details.</span></div>}
      </div>
    </div> : null}
  </span>;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "Task Management"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function StatusPill({ status, archived = false, onRejected = null }) {
  if (archived) return <span className="tm-archive-pill"><FeatherIcon name="archive" />Archived</span>;
  const cls = `tm-status-pill tm-status--${text(status)}`;
  if (text(status) === "rejected" && onRejected) return <button type="button" className={`${cls} tm-status-pill--clickable`} onClick={(event) => { event.stopPropagation(); onRejected(); }}><FeatherIcon name={statusIconName(status)} />{statusLabel(status)}</button>;
  return <span className={cls}><FeatherIcon name={statusIconName(status)} />{statusLabel(status)}</span>;
}


function CalendarAgenda({ tickets, selectedDate, onSelectDate, month, onMonthChange, onOpenTicket, view }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstMondayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - firstMondayOffset);
  const counts = new Map();
  for (const ticket of tickets) {
    const key = dateKey(ticket?.dueDate);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const selectedTasks = tickets.filter((ticket) => dateKey(ticket?.dueDate) === selectedDate);
  const selected = dateFromKey(selectedDate) || new Date();
  const isToday = selectedDate === todayKey();
  return (
    <aside className="tm-agenda-column" aria-label="Task agenda">
      <section className="tm-agenda-card tm-calendar-card">
        <div className="tm-calendar-head">
          <div><span className="tm-agenda-eyebrow"><FeatherIcon name="calendar" /> Task agenda</span><h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2></div>
          <div className="tm-calendar-actions">
            <button type="button" className="tm-calendar-today" onClick={() => { const now = new Date(); onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1)); onSelectDate(todayKey()); }}>Today</button>
            <button type="button" className="tm-calendar-nav" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}><FeatherIcon name="chevron-left" /></button>
            <button type="button" className="tm-calendar-nav" aria-label="Next month" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}><FeatherIcon name="chevron-right" /></button>
          </div>
        </div>
        <div className="tm-calendar-weekdays" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="tm-calendar-grid" role="grid" aria-label="Task calendar">
          {Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const key = dateKey(date);
            const count = counts.get(key) || 0;
            const classes = ["tm-calendar-day"];
            if (date.getMonth() !== monthIndex) classes.push("is-outside");
            if (count) classes.push("has-tasks");
            if (key === selectedDate) classes.push("is-selected");
            if (key === todayKey()) classes.push("is-today");
            return <button type="button" key={key} className={classes.join(" ")} onClick={() => onSelectDate(key)} aria-selected={key === selectedDate}><span>{date.getDate()}</span></button>;
          })}
        </div>
        <div className="tm-calendar-legend"><span><i className="tm-calendar-legend__empty" />Empty day</span><span><i className="tm-calendar-legend__busy" />Has tasks</span></div>
      </section>
      <section className="tm-agenda-card tm-day-tasks-card">
        <div className="tm-day-tasks-head">
          <div className="tm-day-date-block"><b>{selected.getDate()}</b><span>{selected.toLocaleDateString(undefined, { weekday: "long" })}</span></div>
          <div className="tm-day-tasks-title"><span>{isToday ? "Today" : selected.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span><h2>{isToday ? "Today tasks" : `Tasks on ${selected.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}</h2></div>
          <span className="tm-day-tasks-count">{selectedTasks.length}</span>
        </div>
        <div className="tm-day-task-list" aria-live="polite">
          {selectedTasks.length ? selectedTasks.map((ticket) => {
            const stats = ticketStats(ticket, view);
            return <article className="tm-agenda-task" role="button" tabIndex={0} onClick={() => onOpenTicket(ticket)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpenTicket(ticket); }} key={ticket.id}>
              <span className={`tm-agenda-task__priority tm-agenda-task__priority--${priorityKey(ticket.priority)}`} />
              <span className="tm-agenda-task__body"><small>{ticket.ticketCode}</small><b>{ticket.title}</b><span>{statusLabel(ticket.status)} · {stats.completed}/{stats.total} complete</span></span>
              <span className="tm-agenda-task__actions"><span className={`tm-agenda-task__progress-ring tm-status--${ticket.status}`} style={{ "--tm-agenda-progress": `${stats.progress}%` }}><b>{stats.progress}%</b></span><CreatorProfileButton ticket={ticket} className="tm-agenda-task__creator" /></span>
            </article>;
          }) : <div className="tm-agenda-empty"><FeatherIcon name="calendar" /><b>No tasks on this date</b><span>Select a dark calendar day to view its scheduled tasks.</span></div>}
        </div>
      </section>
    </aside>
  );
}

function MobileTaskDashboard({ tickets, view, selectedDate, onSelectDate, onOpenTicket, canCreate, onCreate, activeStatus, onStatusChange }) {
  const selected = dateFromKey(selectedDate) || new Date();
  const today = new Date();
  const todayValue = todayKey();
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
  const liveTickets = (Array.isArray(tickets) ? tickets : []).filter((ticket) => !ticket?.isArchived);
  const selectedTasks = liveTickets
    .filter((ticket) => dateKey(ticket?.dueDate) === selectedDate)
    .sort((a, b) => text(a?.ticketCode).localeCompare(text(b?.ticketCode), undefined, { numeric: true }));
  const dayCounts = new Map();
  for (const ticket of liveTickets) {
    const key = dateKey(ticket?.dueDate);
    if (key) dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }
  const statusCounts = {
    not_started: liveTickets.filter((ticket) => text(ticket?.status) === "not_started").length,
    in_progress: liveTickets.filter((ticket) => text(ticket?.status) === "in_progress").length,
    completed: liveTickets.filter((ticket) => text(ticket?.status) === "completed").length,
  };
  const shiftWeek = (direction) => {
    const next = new Date(selected);
    next.setDate(selected.getDate() + (direction * 7));
    onSelectDate(dateKey(next));
  };
  const resetToday = () => onSelectDate(todayValue);
  const selectedLabel = selectedDate === todayValue
    ? "TODAY"
    : selected.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();

  return (
    <section className="tm-mobile-dashboard" aria-label="Task Management mobile dashboard">
      {canCreate ? (
        <button type="button" className="tm-mobile-add-card" onClick={onCreate} aria-label="Add new project">
          <span className="tm-mobile-add-card__copy">
            <strong>Add new</strong>
            <small>Create a new delegated project</small>
          </span>
          <span className="tm-mobile-add-card__plus"><FeatherIcon name="plus-square" /></span>
        </button>
      ) : null}

      <section className="tm-mobile-week-card" aria-label="Weekly task calendar">
        <div className="tm-mobile-week-toolbar">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week"><FeatherIcon name="chevron-left" /></button>
          <button type="button" className="tm-mobile-week-month" onClick={resetToday}>
            <strong>{selected.toLocaleDateString(undefined, { month: "long" })}</strong>
            <span>{selected.getFullYear()} · Today</span>
          </button>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week"><FeatherIcon name="chevron-right" /></button>
        </div>
        <div className="tm-mobile-week-strip">
          {weekDays.map((day) => {
            const key = dateKey(day);
            const selectedDay = key === selectedDate;
            const current = key === todayValue;
            const count = dayCounts.get(key) || 0;
            return (
              <button
                type="button"
                key={key}
                className={`tm-mobile-week-day${selectedDay ? " is-selected" : ""}${current ? " is-today" : ""}${count ? " has-tasks" : ""}`}
                onClick={() => onSelectDate(key)}
                aria-pressed={selectedDay}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${count ? `, ${count} task${count === 1 ? "" : "s"}` : ""}`}
              >
                <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <strong>{day.getDate()}</strong>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="tm-mobile-summary-grid" aria-label="Task summary">
        <button type="button" className={`tm-mobile-summary-card tm-mobile-summary-card--not-started${activeStatus === "not_started" ? " is-active" : ""}`} onClick={() => onStatusChange(activeStatus === "not_started" ? "all" : "not_started")}>
          <span><FeatherIcon name="circle" /> Not started</span>
          <strong>{statusCounts.not_started}</strong>
          <small>waiting to begin</small>
        </button>
        <button type="button" className={`tm-mobile-summary-card tm-mobile-summary-card--progress${activeStatus === "in_progress" ? " is-active" : ""}`} onClick={() => onStatusChange(activeStatus === "in_progress" ? "all" : "in_progress")}>
          <span><FeatherIcon name="activity" /> In progress</span>
          <strong>{statusCounts.in_progress}</strong>
          <small>active workflow</small>
        </button>
        <button type="button" className={`tm-mobile-summary-card tm-mobile-summary-card--done${activeStatus === "completed" ? " is-active" : ""}`} onClick={() => onStatusChange(activeStatus === "completed" ? "all" : "completed")}>
          <span><FeatherIcon name="check-circle" /> Done</span>
          <strong>{statusCounts.completed}</strong>
          <small>completed projects</small>
        </button>
      </section>

      <section className="tm-mobile-day-feed" aria-labelledby="tmMobileDayTitle">
        <div className="tm-mobile-day-feed__head">
          <div>
            <span>{selectedLabel}</span>
            <h3 id="tmMobileDayTitle">{selected.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h3>
          </div>
          <b>{selectedTasks.length}</b>
        </div>
        <div className="tm-mobile-task-list">
          {selectedTasks.length ? selectedTasks.map((ticket) => {
            const stats = ticketStats(ticket, view);
            const due = dateFromKey(dateKey(ticket?.dueDate)) || selected;
            const departments = ticketDepartments(ticket);
            return (
              <button type="button" className="tm-mobile-task-card" key={ticket.id} onClick={() => onOpenTicket(ticket)}>
                <span className="tm-mobile-task-card__date">
                  <strong>{String(due.getDate()).padStart(2, "0")}</strong>
                  <small>{due.toLocaleDateString(undefined, { month: "short" })}</small>
                </span>
                <span className="tm-mobile-task-card__body">
                  <span>{ticket.ticketCode || "Project"}</span>
                  <strong>{ticket.title || "Untitled project"}</strong>
                  <small>{departments.join(" · ") || `${stats.completed}/${stats.total} complete`}</small>
                </span>
                <span className="tm-mobile-task-card__side">
                  <StatusPill status={ticket.status} archived={ticket.isArchived} />
                  <small>{stats.progress}%</small>
                </span>
              </button>
            );
          }) : (
            <div className="tm-mobile-day-empty">
              <span><FeatherIcon name="calendar" /></span>
              <strong>No tasks on this date</strong>
              <small>Select another day from the week above{canCreate ? " or use the Add new card above." : "."}</small>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function ProjectCard({ ticket, view, onOpen, onRejected }) {
  const stats = ticketStats(ticket, view);
  return (
    <article className={`tm-ticket-card tm-status--${ticket.status}${ticket.isArchived ? " tm-ticket-card--archived" : ""}`} role="button" tabIndex={0} onClick={() => onOpen(ticket)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(ticket); }} aria-label={`Open ${ticket.ticketCode}`}>
      <div className="tm-ticket-card__top">
        <div className={`tm-ticket-thumb tm-ticket-thumb--${priorityKey(ticket.priority)}`} title={`${ticket.priority || "Normal"} priority`}><FeatherIcon name="git-branch" /></div>
        <div className="tm-ticket-main"><div className="tm-ticket-code">{ticket.ticketCode}</div><h2>{ticket.title}</h2></div>
        <div className="tm-ticket-card__state"><StatusPill status={ticket.status} archived={ticket.isArchived} onRejected={onRejected} /></div>
      </div>
      <div className="tm-ticket-card__bottom">
        <div className={`tm-progress tm-status--${ticket.status}`} data-status={ticket.status}><div className="tm-progress__head"><span>{stats.completed}/{stats.total} {view === "my" ? "tasks" : "sections"} completed</span><b>{stats.progress}%</b></div><div className="tm-progress__rail"><span style={{ width: `${stats.progress}%` }} /></div></div>
        <CreatorProfileButton ticket={ticket} />
      </div>
    </article>
  );
}

function editorFromTicket(ticket = null) {
  if (!ticket) return { id: "", ticketCode: "", title: "", description: "", priority: "Normal", dueDate: "", adminPassword: "", sections: [] };
  const sections = (ticket.sections || []).map((section, index) => ({ ...section, clientId: text(section.id) || newClientId("section"), attachments: Array.isArray(section.attachments) ? section.attachments : (section.attachment ? [section.attachment] : []), dependsOn: dependenciesFor(ticket.sections || [], ticket.edges || [], section.id), canvasX: number(section.canvasX) || 80 + (index % 3) * 340, canvasY: number(section.canvasY) || 80 + Math.floor(index / 3) * 220 }));
  return { id: ticket.id, ticketCode: ticket.ticketCode, title: ticket.title || "", description: ticket.description || "", priority: ticket.priority || "Normal", dueDate: dateKey(ticket.dueDate), adminPassword: "", sections };
}



export default function TaskManagementClient({ view, initialMeta, initialTickets, account = {}, bootstrapWarnings = [] }) {
  const [tickets, setTickets] = useState(Array.isArray(initialTickets) ? initialTickets : []);
  const [meta, setMeta] = useState(initialMeta || {});
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [editor, setEditor] = useState(null);
  const [workTarget, setWorkTarget] = useState(null);
  const [teamSection, setTeamSection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [adminAction, setAdminAction] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [rejectedReason, setRejectedReason] = useState("");
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event) => { if (filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [filterOpen]);
  const copy = VIEW_COPY[view] || VIEW_COPY.my;
  const canCreate = view === "delegated";
  const isPageAdmin = !!meta.isPageAdmin;

  const notify = (type, title, message) => {
    setToast({ type, title, message });
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(null), 5000);
  };
  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setBusy(true);
    try {
      const fresh = Date.now();
      const [list, metaResult] = await Promise.all([
        requestJson(`/next/api/task-management?view=${encodeURIComponent(view)}&_ts=${fresh}`),
        requestJson(`/next/api/task-management/meta?view=${encodeURIComponent(view)}&_ts=${fresh}`),
      ]);
      const nextTickets = Array.isArray(list.tickets) ? list.tickets : [];
      setTickets(nextTickets);
      setSelectedTicket((current) => {
        if (!current) return current;
        const summary = nextTickets.find((item) => text(item.id) === text(current.id));
        if (!summary) return current;
        return {
          ...current,
          ...summary,
          description: current.description,
          sections: Array.isArray(current.sections) && current.sections.some((section) => section?.request || section?.details || section?.attachments) ? current.sections : summary.sections,
          edges: Array.isArray(current.edges) ? current.edges : [],
        };
      });
      setMeta(metaResult || meta);
      return nextTickets;
    } catch (error) {
      notify("error", "Refresh failed", error?.message || "Task Management could not refresh.");
      return [];
    } finally { if (!silent) setBusy(false); }
  };
  const departments = useMemo(() => {
    const map = new Map();
    for (const value of [...(meta.departments || []), ...tickets.flatMap(ticketDepartments)]) {
      const clean = text(value); if (clean && !map.has(lower(clean))) map.set(lower(clean), clean);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [meta.departments, tickets]);
  const activeTickets = useMemo(() => tickets.filter((ticket) => {
    if (status === "archived") { if (!ticket.isArchived) return false; }
    else { if (ticket.isArchived) return false; if (status !== "all" && ticket.status !== status) return false; }
    if (filterStatus !== "all" && ticket.status !== filterStatus) return false;
    if (department !== "all" && !ticketDepartments(ticket).some((item) => lower(item) === department)) return false;
    if (priority !== "all" && priorityKey(ticket.priority) !== priority) return false;
    return true;
  }), [tickets, status, filterStatus, department, priority]);
  const agendaTickets = useMemo(() => tickets.filter((ticket) => status === "archived" ? ticket.isArchived : (!ticket.isArchived && (status === "all" || ticket.status === status))), [tickets, status]);
  const clearFilters = () => { setDepartment("all"); setFilterStatus("all"); setPriority("all"); };
  const openTicket = async (ticket, { force = false } = {}) => {
    if (!ticket?.id) return;
    try {
      const fresh = force ? `&_ts=${Date.now()}` : "";
      const result = await requestJson(`/next/api/task-management/detail-direct?id=${encodeURIComponent(ticket.id)}&view=${encodeURIComponent(view)}${fresh}`);
      setSelectedTicket(result?.ticket || ticket);
    } catch (error) {
      notify("error", "Project details could not load", error?.message || "The selected project could not be opened.");
      setSelectedTicket(ticket);
    }
  };

  const afterSaved = async (ticket) => {
    setEditor(null);
    const rows = await refresh({ silent: true });
    const live = rows.find((item) => text(item.id) === text(ticket?.id));
    if (live || ticket?.id) await openTicket(live || ticket, { force: true });
  };
  const doArchive = async (ticket, password = "") => {
    try {
      await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "ticket-archive", view, ticketId: ticket.id, archived: !ticket.isArchived, adminPassword: password }) });
      notify("success", ticket.isArchived ? "Project restored" : "Project archived", ticket.isArchived ? "The project is active and visible again to its permitted users." : "The project is hidden from everyone and is available only in your Archive tab on this page.");
      setSelectedTicket(null); setAdminAction(null); setConfirmAction(null); refresh({ silent: true });
    } catch (error) { notify("error", "Archive action failed", error?.message || "The project could not be updated."); }
  };
  const doDelete = async (ticket, password = "") => {
    try {
      await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "ticket-delete", view, ticketId: ticket.id, adminPassword: password }) });
      notify("success", "Project deleted", "The project and its workflow were deleted successfully.");
      setSelectedTicket(null); setAdminAction(null); setConfirmAction(null); refresh({ silent: true });
    } catch (error) { notify("error", "Delete failed", error?.message || "The project could not be deleted."); }
  };
  const requestAction = (action, ticket) => {
    if (isPageAdmin) {
      if (action === "edit") setEditor(editorFromTicket(ticket));
      else if (action === "archive" || action === "delete") setConfirmAction({ type: action, ticket, password: "" });
      return;
    }
    setAdminAction({ action, ticket });
  };
  const verifiedAction = (password) => {
    if (!adminAction) return;
    const { action, ticket } = adminAction;
    if (action === "edit") { const next = editorFromTicket(ticket); next.adminPassword = password; setEditor(next); setAdminAction(null); }
    else if (action === "archive" || action === "delete") { setConfirmAction({ type: action, ticket, password }); setAdminAction(null); }
  };
  const delivered = async (ticket) => {
    if (!window.confirm(`Mark ${ticket.ticketCode} and all workflow tasks as completed?`)) return;
    try {
      await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "ticket-mark-delivered", view: "delegated", ticketId: ticket.id }) });
      notify("success", "Project delivered", ticket.ticketCode); setSelectedTicket(null); refresh({ silent: true });
    } catch (error) { notify("error", "Delivery failed", error?.message || "The project could not be marked as delivered."); }
  };
  const workSaved = async () => {
    setWorkTarget(null); await refresh({ silent: true });
    if (selectedTicket) {
      const result = await requestJson(`/next/api/task-management/detail-direct?id=${encodeURIComponent(selectedTicket.id)}&view=${encodeURIComponent(view)}&_ts=${Date.now()}`).catch(() => null);
      if (result?.ticket) setSelectedTicket(result.ticket);
    }
  };
  const userName = account?.name || account?.username || meta?.currentUser?.name || "...";

  return (
    <section className="task-management-page next-task-classic-parity">
      <link rel="stylesheet" href="/next/css/task-management-next-parity.css?v=workflow-bottom-sheet-v7-bottom-actions" />
      <BodyClassSync className="task-management-page" />
      <Toast toast={toast} onClose={() => setToast(null)} />
      <header className="main-header tm-page-header next-task-classic-header">
        <div className="header-row1"><div className="left"><div aria-live="polite" className="greeting-pill"><span className="greeting-avatar"><img alt="Hi icon" src="/next/images/greeting-icon.png" /></span><div className="greet-text"><div className="greet-title">Hi, <span>{userName}</span> 👋</div><div className="greet-sub">{copy.subtitle}</div></div></div></div><div className="right topbar-right"><NotificationsBell classic /><UserProfileMenu account={account} /></div></div>
        <div className="header-row2 tm-header-row2"><div className="tm-page-title-wrap"><span className="tm-page-module">Task Management</span><h1 className="page-title">{copy.label}</h1></div>{canCreate ? <button type="button" className="tm-new-ticket tm-new-ticket--header" onClick={() => setEditor(editorFromTicket())}><FeatherIcon name="plus" /><span>Add Project</span></button> : null}</div>
      </header>
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Some Task Management resources loaded through fallback.</strong><span>The page remains usable while those resources recover.</span></div> : null}
      <main className="container-full-width tm-main">
        <MobileTaskDashboard
          tickets={tickets}
          view={view}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onOpenTicket={openTicket}
          canCreate={canCreate}
          onCreate={() => setEditor(editorFromTicket())}
          activeStatus={status}
          onStatusChange={setStatus}
        />
        <div className="tm-agenda-layout">
          <CalendarAgenda tickets={agendaTickets} selectedDate={selectedDate} onSelectDate={setSelectedDate} month={month} onMonthChange={setMonth} onOpenTicket={openTicket} view={view} />
          <section className="tm-tasks-column" aria-label="Task list">
            <div className="tm-mobile-list-heading">
              <div><span>PROJECTS</span><h2>{copy.label}</h2></div>
              <b>{activeTickets.length}</b>
            </div>
            <div className="tm-toolbar tm-orders-toolbar" role="toolbar" aria-label="Task Management status and department filters">
              <div className="tm-toolbar__scroll"><div className="tm-tabs tm-tabs--orders" role="tablist" aria-label="Project status">{STATUS_OPTIONS.map(([value, label, icon]) => <button className={`tm-tab${status === value ? " is-active" : ""}`} type="button" onClick={() => setStatus(value)} role="tab" aria-selected={status === value} title={label} key={value}><span className="tm-tab__icon"><FeatherIcon name={icon} /></span><span className="tm-tab__label">{label}</span></button>)}</div></div>
              <div className="tm-toolbar__divider" aria-hidden="true" />
              <div ref={filterRef} className={`tm-department-filter${filterOpen ? " is-open" : ""}${department !== "all" || filterStatus !== "all" || priority !== "all" ? " is-filtered" : ""}`}>
                <button type="button" className="tm-department-filter__button" onClick={() => setFilterOpen((value) => !value)} aria-haspopup="menu" aria-expanded={filterOpen} aria-label="Filter tasks" title="Filter tasks"><span className="tm-department-filter__button-icon"><FeatherIcon name="filter" /></span><span className="tm-department-filter__button-label">Filter tasks</span>{department !== "all" || filterStatus !== "all" || priority !== "all" ? <span className="tm-department-filter__button-dot" /> : null}</button>
                {filterOpen ? <div className="tm-department-filter__panel" role="menu" aria-label="Filter tasks"><div className="tm-department-filter__panel-head"><div className="tm-department-filter__panel-title">Filter tasks</div>{department !== "all" || filterStatus !== "all" || priority !== "all" ? <button type="button" className="tm-department-filter__clear" onClick={clearFilters}>Clear all</button> : null}</div><div className="tm-task-filter-grid"><label className="tm-field"><span>By department</span><ClassicTaskSelect value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>By status</span><ClassicTaskSelect kind="status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="rejected">Rejected</option><option value="completed">Done</option></ClassicTaskSelect></label><label className="tm-field"><span>By priority</span><ClassicTaskSelect kind="priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label></div></div> : null}
              </div>
              {canCreate ? <button type="button" className="tm-new-ticket tm-new-ticket--toolbar" onClick={() => setEditor(editorFromTicket())}><FeatherIcon name="plus" /><span>Add Project</span></button> : null}
            </div>
            <section className="tm-ticket-grid" aria-live="polite">{busy ? <div className="modern-loading" role="status"><div className="modern-loading__spinner" /><div className="modern-loading__text">Loading projects</div></div> : activeTickets.length ? activeTickets.map((ticket) => <ProjectCard ticket={ticket} view={view} onOpen={openTicket} onRejected={() => setRejectedReason((ticket.sections || []).find((section) => section.status === "rejected" && text(section.rejectionReason))?.rejectionReason || "No rejected reason was provided.")} key={ticket.id} />) : <div className="tm-empty-state"><div className="tm-empty-state__icon"><FeatherIcon name="git-branch" /></div><h2>{copy.empty}</h2><p>{copy.emptyText}</p></div>}</section>
          </section>
        </div>
      </main>
      {selectedTicket ? <TaskPortal><ClassicTaskWorkflowDetails ticket={selectedTicket} view={view} meta={meta} onClose={() => setSelectedTicket(null)} onEdit={(ticket) => requestAction("edit", ticket)} onRefresh={() => refresh({ silent: true })} onWork={setWorkTarget} onTeamWorkflow={setTeamSection} onArchive={(ticket) => requestAction("archive", ticket)} onDelete={(ticket) => requestAction("delete", ticket)} onDelivered={delivered} notify={notify} /></TaskPortal> : null}
      {(editor || workTarget || teamSection || adminAction || confirmAction || rejectedReason) ? <TaskPortal><TaskManagementDialogs
        editor={editor}
        meta={meta}
        view={view}
        onEditorClose={() => setEditor(null)}
        onSaved={afterSaved}
        notify={notify}
        workTarget={workTarget}
        onWorkClose={() => setWorkTarget(null)}
        onWorkSaved={workSaved}
        teamSection={teamSection}
        onTeamClose={() => setTeamSection(null)}
        onTeamWork={(target) => { setTeamSection(null); setWorkTarget(target); }}
        onParentRefresh={() => refresh({ silent: true })}
        adminAction={adminAction}
        onAdminClose={() => setAdminAction(null)}
        onAdminVerified={verifiedAction}
        confirmAction={confirmAction}
        onConfirmCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.type === "archive" ? doArchive(confirmAction.ticket, confirmAction.password) : doDelete(confirmAction?.ticket, confirmAction?.password)}
        rejectedReason={rejectedReason}
        onRejectedClose={() => setRejectedReason("")}
      /></TaskPortal> : null}
    </section>
  );
}
