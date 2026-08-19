"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BodyClassSync } from "../ClassicShellControls";
import NotificationsBell from "../notifications/NotificationsBell";
import UserProfileMenu from "../UserProfileMenu";
import ClassicTaskWorkflowDetails from "./ClassicTaskWorkflowDetails";
import ClassicTaskSelect from "./ClassicTaskSelect";

const STATUS_OPTIONS = [
  ["all", "All", "layers"],
  ["not_started", "Not started", "circle"],
  ["in_progress", "In progress", "activity"],
  ["completed", "Completed", "check-circle"],
  ["archived", "Archive", "archive"],
];
const WORK_STATUS_OPTIONS = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["rejected", "Rejected"],
  ["completed", "Completed"],
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
function formatDate(value, fallback = "No date") {
  const key = dateKey(value);
  const date = dateFromKey(key);
  if (!date) return fallback;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function todayKey() {
  return dateKey(new Date());
}
function newClientId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function fileSize(bytes) {
  const size = number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}
async function fallbackTaskUpload(file, view) {
  const dataUrl = await readAsDataUrl(file);
  const payload = await requestJson(`/api/task-management/upload?view=${encodeURIComponent(view)}`, {
    method: "POST",
    body: JSON.stringify({ dataUrl, filename: file.name, mime: file.type || "", size: file.size }),
  });
  return payload.file;
}
async function uploadTaskFile(file, view) {
  if (!file) throw new Error("Choose a file first.");
  if (number(file.size) > 10 * 1024 * 1024) throw new Error("Attachments must be 10 MB or less.");
  try {
    const ticketResponse = await fetch("/api/storage/upload-ticket", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "task-management", filename: file.name, mime: file.type || "application/octet-stream", size: file.size }),
    });
    const ticket = await ticketResponse.json().catch(() => ({}));
    if (!ticketResponse.ok || !ticket?.upload?.signedUrl || !ticket?.uploadRef) {
      if (ticket?.fallbackAllowed || ticketResponse.status === 404 || ticketResponse.status >= 500) return fallbackTaskUpload(file, view);
      throw new Error(apiError(ticket, "Could not prepare the upload."));
    }
    const put = await fetch(ticket.upload.signedUrl, {
      method: ticket.upload.method || "PUT",
      headers: ticket.upload.headers || { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error(`Storage upload failed with status ${put.status}.`);
    const complete = await requestJson("/api/storage/upload-complete", {
      method: "POST",
      body: JSON.stringify({ uploadRef: ticket.uploadRef }),
    });
    return complete.file;
  } catch (error) {
    if (/network|fetch|storage upload failed/i.test(text(error?.message))) return fallbackTaskUpload(file, view);
    throw error;
  }
}
async function uploadTaskFiles(files, view) {
  const output = [];
  for (const file of Array.from(files || [])) output.push(await uploadTaskFile(file, view));
  return output;
}
function mergeAttachments(current, next) {
  const map = new Map();
  for (const item of [...(Array.isArray(current) ? current : []), ...(Array.isArray(next) ? next : [])]) {
    if (!item?.url) continue;
    map.set(String(item.url), { ...item });
  }
  return [...map.values()];
}
function ticketDepartments(ticket) {
  return [...new Set((ticket?.sections || []).map((section) => text(section?.department)).filter(Boolean))];
}
function ticketSearchText(ticket) {
  return lower([
    ticket?.ticketCode, ticket?.title, ticket?.description, ticket?.createdByName,
    ...(ticket?.sections || []).flatMap((section) => [section?.department, section?.request, section?.details, section?.deliveryDate, ...(section?.attachments || []).map((file) => file?.name)]),
  ].join(" "));
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
      const response = await fetch(`/api/team-members/${encodeURIComponent(key)}/public`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setProfile(body);
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

function PriorityPill({ priority }) {
  return <span className={`next-task-priority next-task-priority--${priorityKey(priority)} tm-priority tm-priority--${priorityKey(priority)}`}>{text(priority) || "Normal"}</span>;
}

function AttachmentLinks({ attachments, empty = null }) {
  const files = Array.isArray(attachments) ? attachments.filter((item) => item?.url) : [];
  if (!files.length) return empty ? <p className="next-task-muted">{empty}</p> : null;
  return (
    <div className="next-task-files">
      {files.map((file, index) => (
        <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}>
          <span>↗</span><div><strong>{file.name || "Open attachment"}</strong><small>{fileSize(file.size) || file.type || "Attached file"}</small></div>
        </a>
      ))}
    </div>
  );
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

function DependenciesEditor({ item, items, onChange }) {
  const selfId = text(item.clientId || item.id);
  const candidates = items.filter((candidate) => text(candidate.clientId || candidate.id) !== selfId);
  if (!candidates.length) return null;
  return (
    <fieldset className="next-task-dependencies">
      <legend>Starts after</legend>
      <div>
        {candidates.map((candidate, index) => {
          const candidateId = text(candidate.clientId || candidate.id);
          const checked = (item.dependsOn || []).includes(candidateId);
          return (
            <label key={candidateId}>
              <input type="checkbox" checked={checked} onChange={(event) => {
                const set = new Set(item.dependsOn || []);
                if (event.target.checked) set.add(candidateId); else set.delete(candidateId);
                onChange([...set]);
              }} />
              <span>{candidate.request || candidate.task || `Step ${index + 1}`}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProjectEditor({ editor, meta, view, onClose, onSaved, notify }) {
  const [draft, setDraft] = useState(() => ({ ...editor, sections: (editor.sections || []).map((section, index) => ({ ...section, canvasX: number(section.canvasX) || 80 + (index % 3) * 340, canvasY: number(section.canvasY) || 80 + Math.floor(index / 3) * 220 })) }));
  const [mode, setMode] = useState(editor.id ? "builder" : "meta");
  const [blockId, setBlockId] = useState("");
  const [connectFrom, setConnectFrom] = useState("");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const dragRef = useRef(null);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSection = (clientId, key, value) => setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.clientId === clientId ? { ...section, [key]: value } : section) }));
  const addSection = () => setDraft((current) => {
    const clientId = newClientId("section");
    const index = current.sections.length;
    const next = { clientId, department: "", request: "", details: "", deliveryDate: current.dueDate || "", attachments: [], dependsOn: [], canvasX: 90 + (index % 3) * 340, canvasY: 90 + Math.floor(index / 3) * 220 };
    window.setTimeout(() => setBlockId(clientId), 0);
    return { ...current, sections: [...current.sections, next] };
  });
  const removeSection = (clientId) => setDraft((current) => ({ ...current, sections: current.sections.filter((section) => section.clientId !== clientId).map((section) => ({ ...section, dependsOn: (section.dependsOn || []).filter((id) => id !== clientId) })) }));
  const chooseFiles = async (clientId, files) => {
    if (!files?.length) return;
    setUploading(clientId); setError("");
    try {
      const uploaded = await uploadTaskFiles(files, view);
      setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.clientId === clientId ? { ...section, attachments: mergeAttachments(section.attachments, uploaded) } : section) }));
    } catch (uploadError) { setError(uploadError?.message || "The attachments could not be uploaded."); }
    finally { setUploading(""); }
  };
  const continueToBuilder = (event) => {
    event?.preventDefault?.(); setError("");
    if (!text(draft.title) || !dateKey(draft.dueDate)) return setError("Project title, priority, and target date are required.");
    setMode("builder");
  };
  const toggleConnection = (toId) => {
    if (!connectFrom || connectFrom === toId) { setConnectFrom(""); return; }
    setDraft((current) => ({ ...current, sections: current.sections.map((section) => {
      if (section.clientId !== toId) return section;
      const set = new Set(section.dependsOn || []);
      if (set.has(connectFrom)) set.delete(connectFrom); else set.add(connectFrom);
      return { ...section, dependsOn: [...set] };
    }) }));
    setConnectFrom("");
  };
  const startDrag = (event, section) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    dragRef.current = { id: section.clientId, startX: event.clientX, startY: event.clientY, x: number(section.canvasX), y: number(section.canvasY) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current; if (!drag) return;
    const x = Math.max(20, drag.x + (event.clientX - drag.startX) / zoom);
    const y = Math.max(20, drag.y + (event.clientY - drag.startY) / zoom);
    updateSection(drag.id, "canvasX", Math.round(x)); updateSection(drag.id, "canvasY", Math.round(y));
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    setError("");
    const title = text(draft.title); const dueDate = dateKey(draft.dueDate);
    if (!title || !dueDate) return setError("Project title and target date are required.");
    if (!draft.sections.length) return setError("Add at least one workflow block.");
    if (draft.sections.some((section) => !text(section.department) || !text(section.request) || !dateKey(section.deliveryDate))) return setError("Each workflow block requires a department, requested action, and delivery date.");
    const sections = draft.sections.map((section, index) => ({ clientId: section.clientId, department: text(section.department), request: text(section.request), details: text(section.details), deliveryDate: dateKey(section.deliveryDate), attachments: section.attachments || [], sortOrder: index + 1, executionGroup: index + 1, canvasX: Math.round(number(section.canvasX)), canvasY: Math.round(number(section.canvasY)) }));
    const edges = draft.sections.flatMap((section) => (section.dependsOn || []).map((from) => ({ from, to: section.clientId })));
    setBusy(true);
    try {
      const isEdit = !!draft.id;
      const payload = { title, description: text(draft.description), priority: text(draft.priority) || "Normal", dueDate, sections, edges, ...(isEdit ? { adminPassword: draft.adminPassword || "" } : {}) };
      const result = await requestJson(isEdit ? `/api/task-management/${encodeURIComponent(draft.id)}?view=${encodeURIComponent(view)}` : "/api/task-management", { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      notify("success", isEdit ? "Project updated" : "Project created", isEdit ? "The project workflow changes were saved." : "The project workflow is ready and arrows now control the execution sequence.");
      onSaved(result.ticket);
    } catch (saveError) { setError(saveError?.message || "The project could not be saved."); }
    finally { setBusy(false); }
  };
  const activeBlock = draft.sections.find((section) => section.clientId === blockId) || null;
  const boardWidth = Math.max(1280, ...draft.sections.map((s) => number(s.canvasX) + 360));
  const boardHeight = Math.max(760, ...draft.sections.map((s) => number(s.canvasY) + 250));
  const edgeList = draft.sections.flatMap((section) => (section.dependsOn || []).map((from) => ({ from, to: section.clientId })));

  return <>
    {mode === "meta" ? <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--meta"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Project details</span><h2>Project information</h2></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><form onSubmit={continueToBuilder}><div className="tm-form-grid"><label className="tm-field tm-field--wide"><span>Project title <b>*</b></span><input value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={500} required /></label><label className="tm-field"><span>Priority <b>*</b></span><ClassicTaskSelect kind="priority" value={draft.priority} onChange={(event) => update("priority", event.target.value)}>{PRIORITIES.map((item) => <option value={item} key={item}>{item}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>Target date <b>*</b></span><input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} required /></label><label className="tm-field tm-field--wide"><span>Description</span><textarea rows="4" value={draft.description} onChange={(event) => update("description", event.target.value)} /></label></div>{error ? <div className="tm-form-error">{error}</div> : null}<div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="tm-btn tm-btn--primary"><span>{draft.id ? "Save Project Details" : "Continue to Workflow"}</span><FeatherIcon name="chevron-right" /></button></div></form></section></div> : null}

    {mode === "builder" ? <div className="tm-overlay tm-overlay--builder-layer" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--builder"><div className="tm-builder-header"><div><span className="tm-eyebrow">Workflow builder</span><h2>{draft.id ? "Edit Project Workflow" : "Create Project Workflow"}</h2></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><div className="tm-builder-toolbar" role="toolbar"><div className="tm-builder-toolbar__tools"><button type="button" className="tm-builder-tool tm-builder-tool--primary" onClick={addSection}><FeatherIcon name="plus-square" /><span>Add Block</span></button><div className="tm-builder-zoom"><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.max(.4, +(z - .1).toFixed(1)))}><FeatherIcon name="minus" /></button><button type="button" className="tm-builder-zoom__label" onClick={() => setZoom(1)}><span>{Math.round(zoom * 100)}%</span></button><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.min(1.8, +(z + .1).toFixed(1)))}><FeatherIcon name="plus" /></button></div><button type="button" className="tm-builder-tool" onClick={() => setMode("meta")}><FeatherIcon name="file-text" /><span>Project Details</span></button></div><div className="tm-builder-toolbar__status">{connectFrom ? "Select another block input point to create the arrow." : `${draft.sections.length} block${draft.sections.length === 1 ? "" : "s"} · ${edgeList.length} connection${edgeList.length === 1 ? "" : "s"}`}</div><div className="tm-builder-toolbar__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={save} disabled={busy || !!uploading}><FeatherIcon name="save" /><span>{busy ? "Saving…" : draft.id ? "Save Changes" : "Create Project"}</span></button></div></div>
      <div className="tm-builder-canvas-wrap" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div className="tm-builder-board" style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        <svg className="tm-connection-layer" width={boardWidth} height={boardHeight} aria-hidden="true"><defs><marker id="nextTmArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="tm-arrow-marker" /></marker></defs>{edgeList.map((edge) => { const from = draft.sections.find((s) => s.clientId === edge.from); const to = draft.sections.find((s) => s.clientId === edge.to); if (!from || !to) return null; const x1 = number(from.canvasX) + 300, y1 = number(from.canvasY) + 86, x2 = number(to.canvasX), y2 = number(to.canvasY) + 86, mid = Math.max(50, Math.abs(x2 - x1) * .45); return <path key={`${edge.from}-${edge.to}`} className="tm-builder-arrow" markerEnd="url(#nextTmArrow)" d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`} />; })}</svg>
        {!draft.sections.length ? <div className="tm-builder-empty"><FeatherIcon name="git-branch" /><b>Your workflow canvas is ready</b><span>Use <strong>Add Block</strong> to create a department task, then click a block’s output point and another block’s input point to connect the execution path.</span></div> : null}
        {draft.sections.map((section, index) => <article className={`tm-builder-block${connectFrom === section.clientId ? " is-connect-source" : ""}`} style={{ left: number(section.canvasX), top: number(section.canvasY) }} key={section.clientId}><button type="button" className="tm-builder-socket tm-builder-socket--in" aria-label="Connect into block" onClick={() => toggleConnection(section.clientId)} /><div className="tm-builder-block__head" onPointerDown={(event) => startDrag(event, section)}><span className="tm-builder-block__number">{index + 1}</span><span className="tm-builder-block__title"><b>{section.department || "Department"}</b><small>{section.deliveryDate ? `Delivery ${formatDate(section.deliveryDate)}` : "Set delivery date"}</small></span><span className="tm-builder-block__actions"><button type="button" className="tm-builder-icon-btn" onClick={() => setBlockId(section.clientId)}><FeatherIcon name="edit" /></button><button type="button" className="tm-builder-icon-btn tm-builder-icon-btn--danger" onClick={() => removeSection(section.clientId)}><FeatherIcon name="trash" /></button></span></div><button type="button" className="tm-builder-block__body" onClick={() => setBlockId(section.clientId)}><span className="tm-builder-block__label">Requested action</span><strong>{section.request || "Click to add requested action"}</strong><span className={`tm-builder-block__details${section.details ? "" : " tm-builder-block__details--empty"}`}>{section.details || "No extra details"}</span></button><button type="button" className="tm-builder-socket tm-builder-socket--out" aria-label="Start connection" onClick={() => setConnectFrom(section.clientId)} /></article>)}
      </div></div><div className="tm-builder-legend"><span><i className="tm-legend-dot tm-legend-dot--ready" />Each block is one department section</span><span><i className="tm-legend-arrow">→</i>Click an output point, then an input point to create an arrow</span><span><i className="tm-legend-handle" />Press and drag any empty part of a block to move it</span></div>{error ? <div className="tm-form-error">{error}</div> : null}</section></div> : null}

    {activeBlock ? <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={() => setBlockId("")} /><section className="tm-dialog tm-dialog--block"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Workflow block</span><h2>Edit Block</h2></div><button type="button" className="tm-icon-btn" onClick={() => setBlockId("")}><FeatherIcon name="x" /></button></div><div className="tm-form-grid tm-form-grid--block"><label className="tm-field"><span>Responsible department <b>*</b></span><ClassicTaskSelect value={activeBlock.department} onChange={(event) => updateSection(activeBlock.clientId, "department", event.target.value)}><option value="">Select department</option>{(meta.departments || []).map((department) => <option value={department} key={department}>{department}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>Delivery date <b>*</b></span><input type="date" max={draft.dueDate || undefined} value={activeBlock.deliveryDate} onChange={(event) => updateSection(activeBlock.clientId, "deliveryDate", event.target.value)} /></label><label className="tm-field tm-field--wide"><span>Requested action <b>*</b></span><textarea rows="3" value={activeBlock.request} onChange={(event) => updateSection(activeBlock.clientId, "request", event.target.value)} /></label><label className="tm-field tm-field--wide"><span>Details</span><textarea rows="4" value={activeBlock.details} onChange={(event) => updateSection(activeBlock.clientId, "details", event.target.value)} /></label><div className="tm-field tm-field--wide"><span>Attachments</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input hidden type="file" multiple onChange={(event) => { chooseFiles(activeBlock.clientId, event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading === activeBlock.clientId ? "Uploading…" : "Upload files"}</b><small>Maximum 10 MB per file</small></span><span className="tm-upload-field__action">Choose files</span></label></div><AttachmentLinks attachments={activeBlock.attachments} /></div></div><DependenciesEditor item={activeBlock} items={draft.sections} onChange={(value) => updateSection(activeBlock.clientId, "dependsOn", value)} /><div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={() => setBlockId("")}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={() => setBlockId("")}><FeatherIcon name="save" /><span>Save Block</span></button></div></section></div> : null}
  </>;
}

function WorkEditor({ target, view, onClose, onSaved, notify }) {
  const [form, setForm] = useState(() => ({
    status: target.status || "not_started",
    workReport: target.workReport || target.completionNote || "",
    rejectionReason: target.rejectionReason || "",
    workLink: target.workLink || "",
    workFiles: Array.isArray(target.workFiles) ? target.workFiles : (target.workFile ? [target.workFile] : []),
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const choose = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadTaskFiles(files, view);
      setForm((current) => ({ ...current, workFiles: mergeAttachments(current.workFiles, uploaded) }));
    } catch (uploadError) {
      setError(uploadError?.message || "The work files could not be uploaded.");
    } finally { setUploading(false); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (form.status === "rejected" && !text(form.rejectionReason)) return setError("Enter the rejected reason.");
    setBusy(true); setError("");
    try {
      const endpoint = target.targetType === "assignment"
        ? `/api/task-management/assignments/${encodeURIComponent(target.id)}/work?view=my`
        : `/api/task-management/sections/${encodeURIComponent(target.id)}/work?view=my`;
      const result = await requestJson(endpoint, { method: "PATCH", body: JSON.stringify(form) });
      notify("success", "Task work updated", `${target.task || target.request || "Task"} was updated.`);
      onSaved(result);
    } catch (saveError) { setError(saveError?.message || "The task work could not be updated."); }
    finally { setBusy(false); }
  };
  const kicker = target.targetType === "assignment" ? "Team-member task" : "My department task";
  return <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true">
    <div className="tm-overlay__backdrop" onClick={onClose} />
    <section className="tm-dialog tm-dialog--work-page">
      <div className="tm-dialog__top tm-work-page__header">
        <div><span className="tm-eyebrow">{kicker}</span><h2>Task work page</h2><p>Update the status, report, and work files for this section.</p></div>
        <button type="button" className="tm-icon-btn" aria-label="Close work page" onClick={onClose}><FeatherIcon name="x" /></button>
      </div>
      <form onSubmit={save} noValidate>
        <div className="tm-form-grid tm-work-page__form-grid">
          <label className="tm-field tm-field--wide"><span>Status <b>*</b></span><ClassicTaskSelect kind="status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{WORK_STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</ClassicTaskSelect></label>
          {form.status === "rejected" ? <label className="tm-field tm-field--wide"><span>Rejected reason <b>*</b></span><textarea rows="3" value={form.rejectionReason} onChange={(event) => setForm((current) => ({ ...current, rejectionReason: event.target.value }))} placeholder="Write why this task is rejected." /></label> : null}
          <label className="tm-field tm-field--wide"><span>Work report</span><textarea rows="5" maxLength={12000} value={form.workReport} onChange={(event) => setForm((current) => ({ ...current, workReport: event.target.value }))} placeholder="Write the work completed, progress, blockers, or handover details." /></label>
          <div className="tm-field tm-field--wide"><span>Work file</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input className="tm-upload-field__input" hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(event) => { choose(event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading ? "Uploading work file…" : "Upload work file"}</b><small>Images, PDF, Office files, text, CSV, or ZIP · maximum 10 MB</small></span><span className="tm-upload-field__action">Choose file</span></label>{form.workFiles.length ? <div className="tm-work-files-parity"><AttachmentLinks attachments={form.workFiles} /><button type="button" className="tm-btn tm-btn--secondary tm-work-files-clear" onClick={() => setForm((current) => ({ ...current, workFiles: [] }))}>Remove files</button></div> : null}</div></div>
          <label className="tm-field tm-field--wide"><span>Work link</span><div className="tm-link-control"><FeatherIcon name="link" /><input type="url" maxLength={4000} placeholder="https://drive.google.com/... or another work link" value={form.workLink} onChange={(event) => setForm((current) => ({ ...current, workLink: event.target.value }))} /></div></label>
        </div>
        {error ? <div className="tm-form-error" role="alert">{error}</div> : null}
        <div className="tm-dialog__actions tm-work-page__actions"><span className="tm-dialog__actions-spacer" /><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Close</button><button type="submit" className="tm-btn tm-btn--primary" disabled={busy || uploading}><FeatherIcon name="save" /><span>{busy ? "Saving…" : "Save Work"}</span></button></div>
      </form>
    </section>
  </div>;
}

function TeamWorkflowModal({ section, meta, onClose, onWork, notify, onParentRefresh }) {
  const [workflow, setWorkflow] = useState(null);
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [blockId, setBlockId] = useState("");
  const [connectFrom, setConnectFrom] = useState("");
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const canManage = ["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin;
  const currentUser = meta.currentUser || {};

  const load = async () => {
    setBusy(true); setError("");
    try {
      const result = await requestJson(`/api/task-management/sections/${encodeURIComponent(section.id)}/people-workflow?view=my`);
      const items = (result.assignments || []).map((assignment, index) => ({
        ...assignment,
        clientId: text(assignment.id) || newClientId("assignment"),
        dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id),
        canvasX: Number.isFinite(Number(assignment.canvasX)) ? Number(assignment.canvasX) : 160,
        canvasY: Number.isFinite(Number(assignment.canvasY)) ? Number(assignment.canvasY) : 80 + index * 210,
      }));
      setWorkflow(result); setDraft(items);
    } catch (loadError) { setError(loadError?.message || "The team workflow could not be loaded."); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [section.id]);
  const update = (clientId, key, value) => setDraft((current) => current.map((item) => item.clientId === clientId ? { ...item, [key]: value } : item));
  const add = () => {
    const id = newClientId("assignment");
    setDraft((current) => {
      const previous = current[current.length - 1];
      return [...current, {
        clientId: id, assigneeId: "", assigneeName: "", task: "", details: "",
        deliveryDate: section.deliveryDate || "", attachments: [], dependsOn: previous ? [previous.clientId] : [], status: "not_started",
        canvasX: 160, canvasY: 80 + current.length * 210,
      }];
    });
    setBlockId(id);
  };
  const remove = (clientId) => setDraft((current) => current.filter((item) => item.clientId !== clientId).map((item) => ({ ...item, dependsOn: (item.dependsOn || []).filter((id) => id !== clientId) })));
  const chooseFiles = async (clientId, files) => {
    if (!files?.length) return;
    setUploading(clientId); setError("");
    try {
      const uploaded = await uploadTaskFiles(files, "my");
      const item = draft.find((row) => row.clientId === clientId);
      update(clientId, "attachments", mergeAttachments(item?.attachments, uploaded));
    } catch (uploadError) { setError(uploadError?.message || "The attachments could not be uploaded."); }
    finally { setUploading(""); }
  };
  const save = async () => {
    if (!draft.length) return setError("Add at least one team-member task.");
    if (draft.some((item) => !text(item.assigneeId) || !text(item.task) || !dateKey(item.deliveryDate))) return setError("Each task requires a team member, task, and delivery date.");
    setSaving(true); setError("");
    try {
      const assignments = draft.map((item, index) => ({
        clientId: item.clientId, assigneeId: item.assigneeId, assigneeName: item.assigneeName,
        task: item.task, details: item.details, deliveryDate: dateKey(item.deliveryDate), attachments: item.attachments || [],
        sortOrder: index + 1, executionGroup: index + 1, canvasX: Math.round(number(item.canvasX)), canvasY: Math.round(number(item.canvasY)),
      }));
      const edges = draft.flatMap((item) => (item.dependsOn || []).map((from) => ({ from, to: item.clientId })));
      const result = await requestJson(`/api/task-management/sections/${encodeURIComponent(section.id)}/people-workflow?view=my`, { method: "PUT", body: JSON.stringify({ assignments, edges }) });
      notify("success", "Team workflow saved", `${assignments.length} team task${assignments.length === 1 ? "" : "s"} saved.`);
      setWorkflow((current) => ({ ...(current || {}), ...result }));
      setDraft((result.assignments || []).map((assignment, index) => ({
        ...assignment, clientId: text(assignment.id), dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id),
        canvasX: Number.isFinite(Number(assignment.canvasX)) ? Number(assignment.canvasX) : 160,
        canvasY: Number.isFinite(Number(assignment.canvasY)) ? Number(assignment.canvasY) : 80 + index * 210,
      })));
      onParentRefresh();
    } catch (saveError) { setError(saveError?.message || "The team workflow could not be saved."); }
    finally { setSaving(false); }
  };
  const archiveAssignment = async (assignment) => {
    const archived = assignment.status !== "cancelled";
    try {
      const result = await requestJson(`/api/task-management/assignments/${encodeURIComponent(assignment.id)}/archive?view=my`, { method: "PATCH", body: JSON.stringify({ archived }) });
      notify("success", archived ? "Task archived" : "Task restored", assignment.assigneeName || "Team task");
      setDraft((current) => current.map((item) => item.clientId === assignment.clientId ? { ...item, ...result.assignment } : item));
      onParentRefresh();
    } catch (actionError) { notify("error", "Action failed", actionError?.message || "The team task could not be updated."); }
  };
  const deleteAssignment = async (assignment) => {
    if (!window.confirm(`Delete the task assigned to ${assignment.assigneeName || "this team member"}?`)) return;
    try {
      await requestJson(`/api/task-management/assignments/${encodeURIComponent(assignment.id)}?view=my`, { method: "DELETE" });
      remove(assignment.clientId); notify("success", "Task deleted", assignment.assigneeName || "Team task"); onParentRefresh();
    } catch (actionError) { notify("error", "Delete failed", actionError?.message || "The team task could not be deleted."); }
  };
  const ownAssignment = (assignment) => {
    if (text(assignment.assigneeId) && text(currentUser.id)) return text(assignment.assigneeId) === text(currentUser.id);
    return lower(assignment.assigneeName) === lower(currentUser.name);
  };
  const toggleConnection = (toId) => {
    if (!connectFrom || connectFrom === toId) return setConnectFrom("");
    setDraft((current) => current.map((item) => item.clientId === toId ? { ...item, dependsOn: (item.dependsOn || []).includes(connectFrom) ? (item.dependsOn || []).filter((id) => id !== connectFrom) : [...(item.dependsOn || []), connectFrom] } : item));
    setConnectFrom("");
  };
  const startDrag = (event, item) => {
    if (!canManage || event.button !== 0 || event.target.closest("button")) return;
    dragRef.current = { id: item.clientId, startX: event.clientX, startY: event.clientY, x: number(item.canvasX), y: number(item.canvasY) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current; if (!drag) return;
    update(drag.id, "canvasX", Math.max(20, Math.round(drag.x + (event.clientX - drag.startX) / zoom)));
    update(drag.id, "canvasY", Math.max(20, Math.round(drag.y + (event.clientY - drag.startY) / zoom)));
  };
  const endDrag = () => { dragRef.current = null; };
  const activeBlock = draft.find((item) => item.clientId === blockId) || null;
  const boardWidth = Math.max(980, ...draft.map((item) => number(item.canvasX) + 380));
  const boardHeight = Math.max(700, ...draft.map((item) => number(item.canvasY) + 240));
  const edges = draft.flatMap((item) => (item.dependsOn || []).map((from) => ({ from, to: item.clientId })));

  return <>
    <div className="tm-overlay tm-overlay--builder-layer is-people-mode" role="dialog" aria-modal="true">
      <div className="tm-overlay__backdrop" onClick={onClose} />
      <section className="tm-dialog tm-dialog--builder">
        <div className="tm-builder-header"><div><span className="tm-eyebrow">Workflow builder</span><h2>Team Task Workflow</h2></div><button type="button" className="tm-icon-btn" aria-label="Close workflow builder" onClick={onClose}><FeatherIcon name="x" /></button></div>
        <div className="tm-builder-toolbar" role="toolbar" aria-label="Workflow builder tools">
          <div className="tm-builder-toolbar__tools">
            {canManage ? <button type="button" className="tm-builder-tool tm-builder-tool--primary" onClick={add}><FeatherIcon name="plus-square" /><span>Add Person Task</span></button> : null}
            <div className="tm-builder-zoom" role="group" aria-label="Canvas zoom controls"><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((value) => Math.max(.5, +(value - .1).toFixed(1)))} aria-label="Zoom out"><FeatherIcon name="minus" /></button><button type="button" className="tm-builder-zoom__label" onClick={() => setZoom(1)}><span>{Math.round(zoom * 100)}%</span></button><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((value) => Math.min(1.8, +(value + .1).toFixed(1)))} aria-label="Zoom in"><FeatherIcon name="plus" /></button></div>
          </div>
          <div className="tm-builder-toolbar__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button>{canManage ? <button type="button" className="tm-btn tm-btn--primary" onClick={save} disabled={saving || !!uploading}><FeatherIcon name="save" /><span>{saving ? "Saving…" : "Save Team Workflow"}</span></button> : null}</div>
        </div>
        {busy ? <div className="tm-builder-loading">Loading team workflow…</div> : null}
        {!busy && error && !workflow ? <div className="next-task-error-box"><b>Could not load team workflow</b><p>{error}</p><button type="button" onClick={load}>Retry</button></div> : null}
        {!busy && workflow ? <div className="tm-builder-canvas-wrap" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className={`tm-builder-board is-people-mode${connectFrom ? " is-awaiting-target" : ""}`} style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }} aria-label="Team task workflow design canvas">
            <svg className="tm-connection-layer" width={boardWidth} height={boardHeight} aria-hidden="true"><defs><marker id="nextPeopleArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="tm-arrow-marker" /></marker></defs>{edges.map((edge, index) => { const from = draft.find((item) => item.clientId === edge.from); const to = draft.find((item) => item.clientId === edge.to); if (!from || !to) return null; const x1 = number(from.canvasX) + 150, y1 = number(from.canvasY) + 170, x2 = number(to.canvasX) + 150, y2 = number(to.canvasY), bend = Math.max(55, Math.abs(y2 - y1) * .45); return <path key={`${edge.from}-${edge.to}-${index}`} className="tm-builder-arrow" markerEnd="url(#nextPeopleArrow)" d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`} />; })}</svg>
            {!draft.length ? <div className="tm-builder-empty"><FeatherIcon name="git-branch" /><b>Your team workflow canvas is ready</b><span>Add person tasks vertically, then connect each card from its bottom point to the next card’s top point.</span></div> : null}
            {draft.map((assignment, index) => <article className={`tm-builder-block${connectFrom === assignment.clientId ? " is-connect-source" : ""}${assignment.status === "cancelled" ? " is-archived" : ""}`} style={{ left: number(assignment.canvasX), top: number(assignment.canvasY) }} key={assignment.clientId}>
              {canManage ? <button type="button" className="tm-builder-socket tm-builder-socket--top" aria-label="Connect into task" onClick={() => toggleConnection(assignment.clientId)} /> : null}
              <div className="tm-builder-block__head" onPointerDown={(event) => startDrag(event, assignment)}><span className="tm-builder-block__number">{index + 1}</span><span className="tm-builder-block__title"><b>{assignment.assigneeName || "Team member"}</b><small>{assignment.deliveryDate ? `Delivery ${formatDate(assignment.deliveryDate)}` : "Set delivery date"}</small></span><span className="tm-builder-block__actions">{canManage ? <button type="button" className="tm-builder-icon-btn" onClick={() => setBlockId(assignment.clientId)}><FeatherIcon name="edit" /></button> : null}{canManage && !assignment.id ? <button type="button" className="tm-builder-icon-btn tm-builder-icon-btn--danger" onClick={() => remove(assignment.clientId)}><FeatherIcon name="trash" /></button> : null}</span></div>
              <button type="button" className="tm-builder-block__body" onClick={() => canManage ? setBlockId(assignment.clientId) : ((ownAssignment(assignment) || meta.isPageAdmin) && assignment.status !== "cancelled" ? onWork({ ...assignment, targetType: "assignment" }) : null)}><span className="tm-builder-block__label">Assigned task</span><strong>{assignment.task || "Click to add assigned task"}</strong><span className={`tm-builder-block__details${assignment.details ? "" : " tm-builder-block__details--empty"}`}>{assignment.details || "No extra details"}</span></button>
              <div className="tm-people-block__status"><StatusPill status={assignment.status} archived={assignment.status === "cancelled"} /></div>
              {canManage ? <button type="button" className="tm-builder-socket tm-builder-socket--bottom" aria-label="Start connection" onClick={() => setConnectFrom(assignment.clientId)} /> : null}
            </article>)}
          </div>
        </div> : null}
        {!busy && workflow ? <div className="tm-builder-legend"><span><i className="tm-legend-dot tm-legend-dot--ready" />Each block is one team-member task</span><span><i className="tm-legend-arrow">↓</i>Click a bottom point, then a top point to connect the execution path</span><span><i className="tm-legend-handle" />Press and drag any empty part of a block to move it</span></div> : null}
        {error && workflow ? <div className="tm-form-error">{error}</div> : null}
      </section>
    </div>
    {activeBlock ? <div className="tm-overlay tm-overlay--above tm-overlay--builder-child" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={() => setBlockId("")} /><section className="tm-dialog tm-dialog--block"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Person task</span><h2>Edit Block</h2></div><button type="button" className="tm-icon-btn" onClick={() => setBlockId("")}><FeatherIcon name="x" /></button></div>
      <div className="tm-form-grid tm-form-grid--block">
        <label className="tm-field"><span>Responsible team member <b>*</b></span><ClassicTaskSelect value={activeBlock.assigneeId || ""} onChange={(event) => { const member = (workflow?.members || []).find((item) => text(item.id) === event.target.value); update(activeBlock.clientId, "assigneeId", event.target.value); update(activeBlock.clientId, "assigneeName", member?.name || ""); }}><option value="">Select team member</option>{(workflow?.members || []).map((member) => <option value={member.id} key={member.id}>{member.name}{member.position ? ` · ${member.position}` : ""}</option>)}</ClassicTaskSelect></label>
        <label className="tm-field"><span>Delivery date <b>*</b></span><input type="date" max={section.deliveryDate || undefined} value={activeBlock.deliveryDate || ""} onChange={(event) => update(activeBlock.clientId, "deliveryDate", event.target.value)} /></label>
        <label className="tm-field tm-field--wide"><span>Assigned task <b>*</b></span><input maxLength={4000} value={activeBlock.task || ""} onChange={(event) => update(activeBlock.clientId, "task", event.target.value)} placeholder="What should this team member deliver?" /></label>
        <label className="tm-field tm-field--wide"><span>Implementation details</span><textarea rows="4" maxLength={8000} value={activeBlock.details || ""} onChange={(event) => update(activeBlock.clientId, "details", event.target.value)} placeholder="Optional notes, dependencies, or handover criteria." /></label>
        <div className="tm-field tm-field--wide"><span>Attachment</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(event) => { chooseFiles(activeBlock.clientId, event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading === activeBlock.clientId ? "Uploading attachments…" : "Upload attachments"}</b><small>Select multiple files · maximum 10 MB per file</small></span><span className="tm-upload-field__action">Choose files</span></label></div><AttachmentLinks attachments={activeBlock.attachments} /></div>
      </div>
      {(activeBlock.workReport || activeBlock.workLink || activeBlock.workFiles?.length || activeBlock.rejectionReason) ? <div className="tm-people-work-preview"><span>Submitted work</span>{activeBlock.workReport ? <p>{activeBlock.workReport}</p> : null}{activeBlock.rejectionReason ? <p className="danger">Rejected: {activeBlock.rejectionReason}</p> : null}{activeBlock.workLink ? <a href={activeBlock.workLink} target="_blank" rel="noreferrer">Open work link ↗</a> : null}<AttachmentLinks attachments={activeBlock.workFiles} /></div> : null}
      <div className="tm-dialog__actions">{activeBlock.id ? <><button type="button" className="tm-btn tm-btn--secondary" onClick={() => archiveAssignment(activeBlock)}>{activeBlock.status === "cancelled" ? "Restore" : "Archive"}</button><button type="button" className="tm-btn tm-btn--secondary tm-btn--danger" onClick={() => deleteAssignment(activeBlock)}>Delete</button></> : null}<span className="tm-dialog__actions-spacer" /><button type="button" className="tm-btn tm-btn--secondary" onClick={() => setBlockId("")}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={() => setBlockId("")}><FeatherIcon name="save" /><span>Save Block</span></button></div>
    </section></div> : null}
  </>;
}

function TicketDetails({ ticket, view, meta, onClose, onEdit, onRefresh, onWork, onTeamWorkflow, onArchive, onDelete, onDelivered, notify }) {
  const [live, setLive] = useState(ticket);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sectionDetail, setSectionDetail] = useState(null);
  const canManageDepartment = view === "my" && (["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin);
  const refreshDetail = async () => {
    setLoading(true);
    try { const result = await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}?view=${encodeURIComponent(view)}`); setLive(result.ticket || ticket); }
    catch (error) { notify("error", "Refresh failed", error?.message || "The project could not refresh."); }
    finally { setLoading(false); }
  };
  useEffect(() => { refreshDetail(); }, [ticket.id]);
  const stats = ticketStats(live, view);
  const nodes = (live.sections || []).map((section, index) => ({ ...section, x: number(section.canvasX) || 80 + (index % 3) * 340, y: number(section.canvasY) || 80 + Math.floor(index / 3) * 230 }));
  const edges = Array.isArray(live.edges) ? live.edges : [];
  const boardWidth = Math.max(980, ...nodes.map((node) => node.x + 380));
  const boardHeight = Math.max(650, ...nodes.map((node) => node.y + 280));
  return <>
    <div className="tm-overlay" role="dialog" aria-modal="true">
      <div className="tm-overlay__backdrop" onClick={onClose} />
      <section className="tm-dialog tm-dialog--workflow">
        <div className="tm-workflow-header">
          <div className="tm-workflow-header__title"><span className="tm-ticket-code">{live.ticketCode || "TKT"}</span><h2>{live.title || "Project workflow"}</h2><p>{live.createdByName || "—"} · Created {formatDate(live.createdAt)}</p></div>
          <div className="tm-workflow-header__actions">
            {view === "delegated" ? <div className="tm-project-more"><button type="button" className="tm-icon-btn tm-project-more__trigger" onClick={() => setMenuOpen((value) => !value)} aria-label="Project actions" aria-expanded={menuOpen}><FeatherIcon name="more-vertical" /></button>{menuOpen ? <div className="tm-project-more__menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(live); }}><FeatherIcon name="edit" /><span>Edit</span></button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchive(live); }}><FeatherIcon name="archive" /><span>{live.isArchived ? "Unarchive" : "Archive"}</span></button><button type="button" role="menuitem" className="tm-project-more__danger" onClick={() => { setMenuOpen(false); onDelete(live); }}><FeatherIcon name="trash" /><span>Delete</span></button></div> : null}</div> : null}
            <button type="button" className="tm-icon-btn" aria-label="Close workflow" onClick={onClose}><FeatherIcon name="x" /></button>
          </div>
        </div>
        <div className="tm-workflow-summary"><div><span>Objective</span><p>{live.description || "No additional context provided."}</p></div><div><span>Priority</span><b className={`tm-priority tm-priority--${priorityKey(live.priority)}`}>{live.priority || "Normal"}</b></div><div><span>Target date</span><b>{formatDate(live.dueDate)}</b></div><div><span>Progress</span><b>{stats.completed}/{stats.total} complete</b></div></div>
        <div className="tm-viewer-toolbar" role="toolbar"><div className="tm-viewer-zoom"><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.max(.4, +(z - .1).toFixed(1)))}><FeatherIcon name="minus" /></button><button type="button" className="tm-builder-zoom__label" onClick={() => setZoom(1)}><span>{Math.round(zoom * 100)}%</span></button><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.min(1.8, +(z + .1).toFixed(1)))}><FeatherIcon name="plus" /></button></div><span className="tm-viewer-toolbar__hint"><FeatherIcon name="move" /> Use zoom controls to review the full workflow</span>{loading ? <span className="tm-viewer-toolbar__hint">Refreshing…</span> : null}</div>
        <div className="tm-workflow-canvas-wrap"><div className="tm-workflow-stage"><div className="tm-workflow-board" style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          <svg className="tm-connection-layer tm-workflow-arrows" width={boardWidth} height={boardHeight} aria-hidden="true"><defs><marker id="nextWorkflowArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="tm-arrow-marker" /></marker></defs>{edges.map((edge, index) => { const from = nodes.find((node) => text(node.id) === text(edge.from || edge.fromSectionId)); const to = nodes.find((node) => text(node.id) === text(edge.to || edge.toSectionId)); if (!from || !to) return null; const x1 = from.x + 300, y1 = from.y + 86, x2 = to.x, y2 = to.y + 86, mid = Math.max(50, Math.abs(x2 - x1) * .45); return <path key={`${text(edge.from)}-${text(edge.to)}-${index}`} className="tm-workflow-arrow" markerEnd="url(#nextWorkflowArrow)" d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`} />; })}</svg>
          {nodes.length ? nodes.map((section, index) => <article className={`tm-workflow-card tm-builder-block tm-builder-block--viewer tm-workflow-card--interactive tm-status--${section.status}`} style={{ left: section.x, top: section.y }} role="button" tabIndex={0} onClick={() => setSectionDetail(section)} key={section.id}><div className="tm-builder-block__head tm-workflow-card__top"><div className="tm-builder-block__number">{section.workflowNumber || index + 1}</div><div className="tm-builder-block__title"><b>{section.department || "Department"}</b><small>Workflow block {section.workflowNumber || index + 1}</small></div><StatusPill status={section.status} /></div><div className="tm-builder-block__body tm-workflow-card__body"><span className="tm-builder-block__label">Requested action</span><strong>{section.request || "—"}</strong>{section.deliveryDate ? <div className="tm-builder-block__meta"><span className="tm-builder-block__delivery"><FeatherIcon name="calendar" />{formatDate(section.deliveryDate)}</span></div> : null}{section.status === "rejected" && section.rejectionReason ? <div className="tm-workflow-card__rejection"><span>{section.rejectionReason}</span></div> : null}</div><div className="tm-workflow-card__footer"><span>{section.completedAt ? `Done ${formatDateTime(section.completedAt)}` : section.startedAt ? `Started ${formatDateTime(section.startedAt)}` : "Waiting to start"}</span>{view === "my" ? <span className="tm-workflow-card__mine-label">View task details</span> : null}</div></article>) : <div className="tm-empty-state"><h2>No workflow sections</h2><p>This task has no configured department sections.</p></div>}
        </div></div></div>
        {view === "delegated" ? <div className="tm-workflow-delivery-actions"><button type="button" className="tm-btn tm-btn--delivered" onClick={() => onDelivered(live)} disabled={live.isArchived || live.status === "completed"}><FeatherIcon name="check-circle" /><span>{live.status === "completed" ? "Delivered" : "Mark as delivered"}</span></button></div> : null}
      </section>
    </div>
    {sectionDetail ? <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={() => setSectionDetail(null)} /><section className="tm-dialog tm-dialog--section-details"><div className="tm-dialog__top tm-section-details__header"><div><span className="tm-eyebrow">Workflow block</span><h2>{sectionDetail.request || "Task details"}</h2><p>Read-only task information and attached files.</p></div><div className="tm-section-details__header-actions"><StatusPill status={sectionDetail.status} /><button type="button" className="tm-icon-btn" onClick={() => setSectionDetail(null)}><FeatherIcon name="x" /></button></div></div><div className="tm-section-details__body"><div className="tm-section-details__item"><span>Department</span><b>{sectionDetail.department || "—"}</b></div><div className="tm-section-details__item"><span>Delivery date</span><b>{formatDate(sectionDetail.deliveryDate)}</b></div><div className="tm-section-details__item tm-section-details__item--wide"><span>Requested action</span><b>{sectionDetail.request || "—"}</b></div><div className="tm-section-details__item tm-section-details__item--wide"><span>Details</span><p>{sectionDetail.details || "No extra details."}</p></div><div className="tm-section-details__item tm-section-details__item--wide"><span>Project files</span><AttachmentLinks attachments={sectionDetail.attachments} empty="No attached files." /></div>{sectionDetail.workReport || sectionDetail.workLink || sectionDetail.workFiles?.length ? <div className="tm-section-details__item tm-section-details__item--wide"><span>Work output</span>{sectionDetail.workReport ? <p>{sectionDetail.workReport}</p> : null}{sectionDetail.workLink ? <a href={sectionDetail.workLink} target="_blank" rel="noreferrer">Open work link ↗</a> : null}<AttachmentLinks attachments={sectionDetail.workFiles} /></div> : null}</div><div className="tm-dialog__actions tm-section-details__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={() => setSectionDetail(null)}>Close</button>{view === "my" && canManageDepartment ? <button type="button" className="tm-btn tm-btn--secondary" onClick={() => { setSectionDetail(null); onTeamWorkflow(sectionDetail); }}><FeatherIcon name="user" /><span>Assign Tasks to Team</span></button> : null}{view === "my" && canManageDepartment ? <button type="button" className="tm-btn tm-btn--primary" onClick={() => { setSectionDetail(null); onWork({ ...sectionDetail, targetType: "section" }); }}><FeatherIcon name="briefcase" /><span>Open Work Page</span></button> : null}</div></section></div> : null}
  </>;
}

function editorFromTicket(ticket = null) {
  if (!ticket) return { id: "", ticketCode: "", title: "", description: "", priority: "Normal", dueDate: "", adminPassword: "", sections: [] };
  const sections = (ticket.sections || []).map((section, index) => ({ ...section, clientId: text(section.id) || newClientId("section"), attachments: Array.isArray(section.attachments) ? section.attachments : (section.attachment ? [section.attachment] : []), dependsOn: dependenciesFor(ticket.sections || [], ticket.edges || [], section.id), canvasX: number(section.canvasX) || 80 + (index % 3) * 340, canvasY: number(section.canvasY) || 80 + Math.floor(index / 3) * 220 }));
  return { id: ticket.id, ticketCode: ticket.ticketCode, title: ticket.title || "", description: ticket.description || "", priority: ticket.priority || "Normal", dueDate: dateKey(ticket.dueDate), adminPassword: "", sections };
}

function TaskFilterMenu({ open, onClose, department, setDepartment, filterStatus, setFilterStatus, priority, setPriority, departments, onClear }) {
  const active = department !== "all" || filterStatus !== "all" || priority !== "all";
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open, onClose]);
  return <div className={`tm-department-filter${open ? " is-open" : ""}${active ? " is-filtered" : ""}`} ref={ref}>
    <button type="button" className="tm-department-filter__button" onClick={() => open ? onClose() : null} aria-haspopup="menu" aria-expanded={open} aria-label={active ? "Task filters are active" : "Filter tasks"} title="Filter tasks">
      <span className="tm-department-filter__button-icon"><FeatherIcon name="filter" /></span><span className="tm-department-filter__button-label">Filter tasks</span>{active ? <span className="tm-department-filter__button-dot" /> : null}
    </button>
    {open ? <div className="tm-department-filter__panel" role="menu" aria-label="Filter tasks">
      <div className="tm-department-filter__panel-head"><div className="tm-department-filter__panel-title">Filter tasks</div>{active ? <button type="button" className="tm-department-filter__clear" onClick={onClear}>Clear all</button> : null}</div>
      <div className="tm-task-filter-grid">
        <label className="tm-field"><span>By department</span><ClassicTaskSelect value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label>
        <label className="tm-field"><span>By status</span><ClassicTaskSelect kind="status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="rejected">Rejected</option><option value="completed">Done</option></ClassicTaskSelect></label>
        <label className="tm-field"><span>By priority</span><ClassicTaskSelect kind="priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label>
      </div>
    </div> : null}
  </div>;
}

function AdminActionModal({ action, ticket, view, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!action || !ticket) return null;
  const label = action === "delete" ? "Delete project" : action === "archive" ? (ticket.isArchived ? "Restore project" : "Archive project") : "Edit project workflow";
  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Enter the admin password.");
    setBusy(true); setError("");
    try {
      await requestJson("/api/task-management/admin/verify", { method: "POST", body: JSON.stringify({ view, adminPassword: password }) });
      onVerified(password);
    } catch (verifyError) { setError(verifyError?.message || "Invalid admin password."); }
    finally { setBusy(false); }
  };
  return <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true">
    <div className="tm-overlay__backdrop" onClick={onClose} />
    <section className="tm-dialog tm-dialog--admin">
      <div className="tm-dialog__top"><div><span className="tm-eyebrow">Admin verification</span><h2>{label}</h2><p>Enter the admin password to continue.</p></div><button type="button" className="tm-icon-btn" onClick={onClose} aria-label="Close"><FeatherIcon name="x" /></button></div>
      <form onSubmit={submit}><label className="tm-field tm-field--wide"><span>Admin password <b>*</b></span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus placeholder="Enter admin password" /></label>{error ? <div className="tm-form-error">{error}</div> : null}<div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="tm-btn tm-btn--primary" disabled={busy}><FeatherIcon name="save" /><span>{busy ? "Verifying…" : "Verify & Continue"}</span></button></div></form>
    </section>
  </div>;
}

function ProjectConfirmModal({ confirmAction, onCancel, onConfirm }) {
  if (!confirmAction?.ticket) return null;
  const { type, ticket } = confirmAction;
  const restoring = type === "archive" && !!ticket.isArchived;
  const deleting = type === "delete";
  const title = deleting ? "Delete project?" : (restoring ? "Restore project?" : "Archive project?");
  const message = deleting
    ? `“${ticket.title || ticket.ticketCode || "This project"}” will be permanently deleted with its workflow blocks, arrows, team assignments, reports, and files.`
    : restoring
      ? `“${ticket.title || ticket.ticketCode || "This project"}” will be restored and visible again to the users who normally have access to it.`
      : `“${ticket.title || ticket.ticketCode || "This project"}” will be hidden from everyone and kept only in your Archive tab on this Task Management page.`;
  return <div className="tm-overlay tm-overlay--top" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onCancel} /><section className="tm-dialog tm-dialog--archive-confirm">
    <div className="tm-archive-confirm__icon"><FeatherIcon name={deleting ? "trash" : "archive"} /></div>
    <h2>{title}</h2><p>{message}</p>
    <div className="tm-archive-confirm__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onCancel}>{deleting ? "No, keep it" : "No, keep it"}</button><button type="button" className={`tm-btn ${deleting ? "tm-btn--danger" : "tm-btn--archive"}`} onClick={onConfirm}><FeatherIcon name={deleting ? "trash" : "archive"} /><span>{deleting ? "Yes, Delete!" : restoring ? "Yes, Restore" : "Yes, Archive"}</span></button></div>
  </section></div>;
}

function RejectedInfoModal({ reason, onClose }) {
  if (!reason) return null;
  return <div className="tm-overlay tm-overlay--top" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--rejected-info"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Rejected task</span><h2>Rejected reason</h2></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><div className="tm-rejected-info__message">{reason}</div><div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>Close</button></div></section></div>;
}

export default function TaskManagementClient({ view, initialMeta, initialTickets, availableViews, classicHref, account = {}, bootstrapWarnings = [] }) {
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
      const [list, metaResult] = await Promise.all([
        requestJson(`/api/task-management?view=${encodeURIComponent(view)}`),
        requestJson(`/api/task-management/meta?view=${encodeURIComponent(view)}`),
      ]);
      const nextTickets = Array.isArray(list.tickets) ? list.tickets : [];
      setTickets(nextTickets);
      setSelectedTicket((current) => current ? (nextTickets.find((item) => text(item.id) === text(current.id)) || current) : current);
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

  const afterSaved = async (ticket) => {
    setEditor(null);
    const rows = await refresh({ silent: true });
    const live = rows.find((item) => text(item.id) === text(ticket?.id));
    if (live) setSelectedTicket(live);
  };
  const doArchive = async (ticket, password = "") => {
    try {
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}/archive?view=${encodeURIComponent(view)}`, { method: "PATCH", body: JSON.stringify({ archived: !ticket.isArchived, adminPassword: password }) });
      notify("success", ticket.isArchived ? "Project restored" : "Project archived", ticket.isArchived ? "The project is active and visible again to its permitted users." : "The project is hidden from everyone and is available only in your Archive tab on this page.");
      setSelectedTicket(null); setAdminAction(null); setConfirmAction(null); refresh({ silent: true });
    } catch (error) { notify("error", "Archive action failed", error?.message || "The project could not be updated."); }
  };
  const doDelete = async (ticket, password = "") => {
    try {
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}?view=${encodeURIComponent(view)}`, { method: "DELETE", body: JSON.stringify({ adminPassword: password }) });
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
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}/mark-delivered?view=delegated`, { method: "POST", body: JSON.stringify({}) });
      notify("success", "Project delivered", ticket.ticketCode); setSelectedTicket(null); refresh({ silent: true });
    } catch (error) { notify("error", "Delivery failed", error?.message || "The project could not be marked as delivered."); }
  };
  const workSaved = async () => {
    setWorkTarget(null); await refresh({ silent: true });
    if (selectedTicket) {
      const result = await requestJson(`/api/task-management/${encodeURIComponent(selectedTicket.id)}?view=${encodeURIComponent(view)}`).catch(() => null);
      if (result?.ticket) setSelectedTicket(result.ticket);
    }
  };
  const userName = account?.name || account?.username || meta?.currentUser?.name || "...";

  return (
    <section className="task-management-page next-task-classic-parity">
      <BodyClassSync className="task-management-page" />
      <Toast toast={toast} onClose={() => setToast(null)} />
      <header className="main-header tm-page-header next-task-classic-header">
        <div className="header-row1"><div className="left"><div aria-live="polite" className="greeting-pill"><span className="greeting-avatar"><img alt="Hi icon" src="/images/greeting-icon.png" /></span><div className="greet-text"><div className="greet-title">Hi, <span>{userName}</span> 👋</div><div className="greet-sub">{copy.subtitle}</div></div></div></div><div className="right topbar-right"><NotificationsBell classic /><UserProfileMenu account={account} /></div></div>
        <div className="header-row2 tm-header-row2"><div className="tm-page-title-wrap"><span className="tm-page-module">Task Management</span><h1 className="page-title">{copy.label}</h1></div>{canCreate ? <button type="button" className="tm-new-ticket tm-new-ticket--header" onClick={() => setEditor(editorFromTicket())}><FeatherIcon name="plus" /><span>Add Project</span></button> : null}</div>
      </header>
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Some Task Management resources loaded through fallback.</strong><span>The page remains usable while those resources recover.</span></div> : null}
      <main className="container-full-width tm-main">
        <div className="tm-agenda-layout">
          <CalendarAgenda tickets={agendaTickets} selectedDate={selectedDate} onSelectDate={setSelectedDate} month={month} onMonthChange={setMonth} onOpenTicket={setSelectedTicket} view={view} />
          <section className="tm-tasks-column" aria-label="Task list">
            <div className="tm-toolbar tm-orders-toolbar" role="toolbar" aria-label="Task Management status and department filters">
              <div className="tm-toolbar__scroll"><div className="tm-tabs tm-tabs--orders" role="tablist" aria-label="Project status">{STATUS_OPTIONS.map(([value, label, icon]) => <button className={`tm-tab${status === value ? " is-active" : ""}`} type="button" onClick={() => setStatus(value)} role="tab" aria-selected={status === value} title={label} key={value}><span className="tm-tab__icon"><FeatherIcon name={icon} /></span><span className="tm-tab__label">{label}</span></button>)}</div></div>
              <div className="tm-toolbar__divider" aria-hidden="true" />
              <div ref={filterRef} className={`tm-department-filter${filterOpen ? " is-open" : ""}${department !== "all" || filterStatus !== "all" || priority !== "all" ? " is-filtered" : ""}`}>
                <button type="button" className="tm-department-filter__button" onClick={() => setFilterOpen((value) => !value)} aria-haspopup="menu" aria-expanded={filterOpen} aria-label="Filter tasks" title="Filter tasks"><span className="tm-department-filter__button-icon"><FeatherIcon name="filter" /></span><span className="tm-department-filter__button-label">Filter tasks</span>{department !== "all" || filterStatus !== "all" || priority !== "all" ? <span className="tm-department-filter__button-dot" /> : null}</button>
                {filterOpen ? <div className="tm-department-filter__panel" role="menu" aria-label="Filter tasks"><div className="tm-department-filter__panel-head"><div className="tm-department-filter__panel-title">Filter tasks</div>{department !== "all" || filterStatus !== "all" || priority !== "all" ? <button type="button" className="tm-department-filter__clear" onClick={clearFilters}>Clear all</button> : null}</div><div className="tm-task-filter-grid"><label className="tm-field"><span>By department</span><ClassicTaskSelect value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>By status</span><ClassicTaskSelect kind="status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="rejected">Rejected</option><option value="completed">Done</option></ClassicTaskSelect></label><label className="tm-field"><span>By priority</span><ClassicTaskSelect kind="priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</ClassicTaskSelect></label></div></div> : null}
              </div>
              {canCreate ? <button type="button" className="tm-new-ticket tm-new-ticket--toolbar" onClick={() => setEditor(editorFromTicket())}><FeatherIcon name="plus" /><span>Add Project</span></button> : null}
            </div>
            <section className="tm-ticket-grid" aria-live="polite">{busy ? <div className="modern-loading" role="status"><div className="modern-loading__spinner" /><div className="modern-loading__text">Loading projects</div></div> : activeTickets.length ? activeTickets.map((ticket) => <ProjectCard ticket={ticket} view={view} onOpen={setSelectedTicket} onRejected={() => setRejectedReason((ticket.sections || []).find((section) => section.status === "rejected" && text(section.rejectionReason))?.rejectionReason || "No rejected reason was provided.")} key={ticket.id} />) : <div className="tm-empty-state"><div className="tm-empty-state__icon"><FeatherIcon name="git-branch" /></div><h2>{copy.empty}</h2><p>{copy.emptyText}</p>{canCreate ? <button className="tm-btn tm-btn--primary" type="button" onClick={() => setEditor(editorFromTicket())}><FeatherIcon name="plus" />Add Project</button> : null}</div>}</section>
          </section>
        </div>
      </main>
      {selectedTicket ? <TaskPortal><ClassicTaskWorkflowDetails ticket={selectedTicket} view={view} meta={meta} onClose={() => setSelectedTicket(null)} onEdit={(ticket) => requestAction("edit", ticket)} onRefresh={() => refresh({ silent: true })} onWork={setWorkTarget} onTeamWorkflow={setTeamSection} onArchive={(ticket) => requestAction("archive", ticket)} onDelete={(ticket) => requestAction("delete", ticket)} onDelivered={delivered} notify={notify} /></TaskPortal> : null}
      {editor ? <TaskPortal><ProjectEditor editor={editor} meta={meta} view={view} onClose={() => setEditor(null)} onSaved={afterSaved} notify={notify} /></TaskPortal> : null}
      {workTarget ? <TaskPortal><WorkEditor target={workTarget} view={view} onClose={() => setWorkTarget(null)} onSaved={workSaved} notify={notify} /></TaskPortal> : null}
      {teamSection ? <TaskPortal><TeamWorkflowModal section={teamSection} meta={meta} onClose={() => setTeamSection(null)} onWork={(target) => { setTeamSection(null); setWorkTarget(target); }} notify={notify} onParentRefresh={() => refresh({ silent: true })} /></TaskPortal> : null}
      {adminAction ? <TaskPortal><AdminActionModal action={adminAction.action} ticket={adminAction.ticket} view={view} onClose={() => setAdminAction(null)} onVerified={verifiedAction} /></TaskPortal> : null}
      {confirmAction ? <TaskPortal><ProjectConfirmModal confirmAction={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={() => confirmAction.type === "archive" ? doArchive(confirmAction.ticket, confirmAction.password) : doDelete(confirmAction.ticket, confirmAction.password)} /></TaskPortal> : null}
      {rejectedReason ? <TaskPortal><RejectedInfoModal reason={rejectedReason} onClose={() => setRejectedReason("")} /></TaskPortal> : null}
    </section>
  );
}
