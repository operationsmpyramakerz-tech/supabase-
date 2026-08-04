"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_OPTIONS = [
  ["all", "All"],
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["rejected", "Rejected"],
  ["completed", "Completed"],
  ["archived", "Archive"],
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
    subtitle: "Company-wide projects and their cross-department workflow blocks.",
    empty: "No company workflow projects match the selected filters.",
  },
  my: {
    label: "My Tasks",
    subtitle: "Projects and team-member work assigned to your department.",
    empty: "No workflow projects are currently assigned to your department.",
  },
  delegated: {
    label: "Delegated Tasks",
    subtitle: "Projects you created and delegated to other departments.",
    empty: "No delegated projects were found. Create the first project to start a workflow.",
  },
};

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

function StatusPill({ status, archived = false }) {
  if (archived) return <span className="next-task-pill next-task-pill--archived">Archive</span>;
  return <span className={`next-task-pill next-task-pill--${text(status)}`}>{statusLabel(status)}</span>;
}

function PriorityPill({ priority }) {
  return <span className={`next-task-priority next-task-priority--${priorityKey(priority)}`}>{text(priority) || "Normal"}</span>;
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

function CalendarAgenda({ tickets, selectedDate, onSelectDate, month, onMonthChange, onOpenTicket }) {
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
  return (
    <aside className="next-task-agenda">
      <section className="next-task-panel next-task-calendar">
        <div className="next-task-calendar-head">
          <div><span>Task agenda</span><h3>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3></div>
          <div>
            <button type="button" onClick={() => { const now = new Date(); onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1)); onSelectDate(todayKey()); }}>Today</button>
            <button type="button" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}>‹</button>
            <button type="button" aria-label="Next month" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}>›</button>
          </div>
        </div>
        <div className="next-task-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="next-task-calendar-grid">
          {Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const key = dateKey(date);
            const count = counts.get(key) || 0;
            return (
              <button
                type="button"
                key={key}
                className={`${date.getMonth() !== monthIndex ? "outside" : ""} ${count ? "busy" : ""} ${key === selectedDate ? "selected" : ""} ${key === todayKey() ? "today" : ""}`}
                onClick={() => onSelectDate(key)}
                title={`${date.toLocaleDateString()}${count ? ` · ${count} task${count === 1 ? "" : "s"}` : ""}`}
              >{date.getDate()}</button>
            );
          })}
        </div>
      </section>
      <section className="next-task-panel next-task-day-list">
        <div className="next-task-day-head">
          <div><b>{selected.getDate()}</b><span>{selected.toLocaleDateString(undefined, { weekday: "long" })}</span></div>
          <div><small>{selectedDate === todayKey() ? "Today" : selected.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</small><h3>{selectedDate === todayKey() ? "Today tasks" : "Scheduled tasks"}</h3></div>
          <strong>{selectedTasks.length}</strong>
        </div>
        <div className="next-task-day-items">
          {selectedTasks.length ? selectedTasks.map((ticket) => {
            const stats = ticketStats(ticket, "all");
            return (
              <button type="button" onClick={() => onOpenTicket(ticket)} key={ticket.id}>
                <i className={`priority-${priorityKey(ticket.priority)}`} />
                <span><small>{ticket.ticketCode}</small><b>{ticket.title}</b><em>{stats.progress}% complete</em></span>
                <strong>{stats.progress}%</strong>
              </button>
            );
          }) : <div className="next-task-empty-mini"><span>○</span><b>No tasks on this date</b><small>Select another highlighted day.</small></div>}
        </div>
      </section>
    </aside>
  );
}

function ProjectCard({ ticket, view, onOpen }) {
  const stats = ticketStats(ticket, view);
  return (
    <button type="button" className={`next-task-card next-task-card--${text(ticket.status)} ${ticket.isArchived ? "archived" : ""}`} onClick={() => onOpen(ticket)}>
      <div className="next-task-card-top">
        <span className={`next-task-card-icon priority-${priorityKey(ticket.priority)}`}>⌁</span>
        <div><small>{ticket.ticketCode}</small><h3>{ticket.title}</h3></div>
        <StatusPill status={ticket.status} archived={ticket.isArchived} />
      </div>
      <p>{ticket.description || "No project description."}</p>
      <div className="next-task-departments">
        {ticketDepartments(ticket).slice(0, 4).map((department) => <span key={department}>{department}</span>)}
        {ticketDepartments(ticket).length > 4 ? <span>+{ticketDepartments(ticket).length - 4}</span> : null}
      </div>
      <div className="next-task-card-meta">
        <span><b>{formatDate(ticket.dueDate)}</b><small>Target date</small></span>
        <span><b>{stats.completed}/{stats.total}</b><small>{view === "my" ? "Tasks" : "Blocks"}</small></span>
        <span><b>{ticket.createdByName || "—"}</b><small>Created by</small></span>
      </div>
      <div className="next-task-progress"><div><span>{stats.progress}% complete</span><b>{stats.progress}%</b></div><i><em style={{ width: `${stats.progress}%` }} /></i></div>
    </button>
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
  const [draft, setDraft] = useState(() => editor);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSection = (clientId, key, value) => setDraft((current) => ({
    ...current,
    sections: current.sections.map((section) => section.clientId === clientId ? { ...section, [key]: value } : section),
  }));
  const addSection = () => setDraft((current) => {
    const previous = current.sections[current.sections.length - 1];
    const clientId = newClientId("section");
    return {
      ...current,
      sections: [...current.sections, {
        clientId,
        department: "",
        request: "",
        details: "",
        deliveryDate: current.dueDate || "",
        attachments: [],
        dependsOn: previous ? [previous.clientId] : [],
      }],
    };
  });
  const removeSection = (clientId) => setDraft((current) => ({
    ...current,
    sections: current.sections.filter((section) => section.clientId !== clientId).map((section) => ({ ...section, dependsOn: (section.dependsOn || []).filter((id) => id !== clientId) })),
  }));
  const chooseFiles = async (clientId, files) => {
    if (!files?.length) return;
    setUploading(clientId);
    setError("");
    try {
      const uploaded = await uploadTaskFiles(files, view);
      updateSection(clientId, "attachments", mergeAttachments(draft.sections.find((section) => section.clientId === clientId)?.attachments, uploaded));
    } catch (uploadError) {
      setError(uploadError?.message || "The attachments could not be uploaded.");
    } finally {
      setUploading("");
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setError("");
    const title = text(draft.title);
    const dueDate = dateKey(draft.dueDate);
    if (!title || !dueDate) return setError("Project title and target date are required.");
    if (!draft.sections.length) return setError("Add at least one workflow block.");
    if (draft.sections.some((section) => !text(section.department) || !text(section.request) || !dateKey(section.deliveryDate))) {
      return setError("Each workflow block requires a department, requested action, and delivery date.");
    }
    const sections = draft.sections.map((section, index) => ({
      clientId: section.clientId,
      department: text(section.department),
      request: text(section.request),
      details: text(section.details),
      deliveryDate: dateKey(section.deliveryDate),
      attachments: section.attachments || [],
      sortOrder: index + 1,
      executionGroup: index + 1,
      canvasX: 80 + (index % 3) * 360,
      canvasY: 80 + Math.floor(index / 3) * 260,
    }));
    const edges = draft.sections.flatMap((section) => (section.dependsOn || []).map((from) => ({ from, to: section.clientId })));
    setBusy(true);
    try {
      const isEdit = !!draft.id;
      const payload = {
        title,
        description: text(draft.description),
        priority: text(draft.priority) || "Normal",
        dueDate,
        sections,
        edges,
        ...(isEdit ? { adminPassword: draft.adminPassword || "" } : {}),
      };
      const result = await requestJson(isEdit
        ? `/api/task-management/${encodeURIComponent(draft.id)}?view=${encodeURIComponent(view)}`
        : "/api/task-management", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      notify("success", isEdit ? "Project updated" : "Project created", `${result.ticket?.ticketCode || "Project"} was saved successfully.`);
      onSaved(result.ticket);
    } catch (saveError) {
      setError(saveError?.message || "The project could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="next-task-modal-layer" role="dialog" aria-modal="true">
      <button className="next-task-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <form className="next-task-modal next-task-project-editor" onSubmit={save}>
        <header><div><span>{draft.id ? "Protected project editing" : "New delegated project"}</span><h2>{draft.id ? `Edit ${draft.ticketCode || "project"}` : "Create Project"}</h2></div><button type="button" onClick={onClose}>×</button></header>
        <div className="next-task-form-grid">
          <label className="wide"><span>Project title *</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={500} /></label>
          <label><span>Priority *</span><select value={draft.priority} onChange={(event) => update("priority", event.target.value)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Target date *</span><input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
          <label className="wide"><span>Description</span><textarea rows="3" value={draft.description} onChange={(event) => update("description", event.target.value)} /></label>
          {draft.id ? <label className="wide"><span>Admin password *</span><input type="password" autoComplete="current-password" value={draft.adminPassword || ""} onChange={(event) => update("adminPassword", event.target.value)} /></label> : null}
        </div>
        <div className="next-task-editor-head"><div><span>Workflow structure</span><h3>Department blocks</h3><p>Use “Starts after” to keep sequential and parallel dependencies.</p></div><button type="button" onClick={addSection}>＋ Add block</button></div>
        <div className="next-task-section-editors">
          {draft.sections.map((section, index) => (
            <article key={section.clientId}>
              <header><span>{index + 1}</span><div><b>Workflow block</b><small>{section.department || "Department not selected"}</small></div><button type="button" onClick={() => removeSection(section.clientId)} disabled={draft.sections.length === 1}>Remove</button></header>
              <div className="next-task-form-grid">
                <label><span>Department *</span><select value={section.department} onChange={(event) => updateSection(section.clientId, "department", event.target.value)}><option value="">Select department</option>{(meta.departments || []).map((department) => <option key={department}>{department}</option>)}</select></label>
                <label><span>Delivery date *</span><input type="date" max={draft.dueDate || undefined} value={section.deliveryDate} onChange={(event) => updateSection(section.clientId, "deliveryDate", event.target.value)} /></label>
                <label className="wide"><span>Requested action *</span><textarea rows="2" value={section.request} onChange={(event) => updateSection(section.clientId, "request", event.target.value)} /></label>
                <label className="wide"><span>Details</span><textarea rows="3" value={section.details} onChange={(event) => updateSection(section.clientId, "details", event.target.value)} /></label>
              </div>
              <DependenciesEditor item={section} items={draft.sections} onChange={(value) => updateSection(section.clientId, "dependsOn", value)} />
              <div className="next-task-upload-row"><label><input type="file" multiple hidden onChange={(event) => { chooseFiles(section.clientId, event.target.files); event.target.value = ""; }} /><span>{uploading === section.clientId ? "Uploading…" : "＋ Attach files"}</span></label><small>Up to 10 MB per file</small></div>
              <AttachmentLinks attachments={section.attachments} />
              {section.attachments?.length ? <button type="button" className="next-task-clear-files" onClick={() => updateSection(section.clientId, "attachments", [])}>Remove all attachments</button> : null}
            </article>
          ))}
        </div>
        {error ? <p className="next-task-form-error">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || !!uploading}>{busy ? "Saving…" : draft.id ? "Save project" : "Create project"}</button></footer>
      </form>
    </div>
  );
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
    } finally {
      setUploading(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = target.targetType === "assignment"
        ? `/api/task-management/assignments/${encodeURIComponent(target.id)}/work?view=my`
        : `/api/task-management/sections/${encodeURIComponent(target.id)}/work?view=my`;
      const result = await requestJson(endpoint, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      notify("success", "Task work updated", `${target.task || target.request || "Task"} was updated.`);
      onSaved(result);
    } catch (saveError) {
      setError(saveError?.message || "The task work could not be updated.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="next-task-modal-layer" role="dialog" aria-modal="true">
      <button className="next-task-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <form className="next-task-modal next-task-work-editor" onSubmit={save}>
        <header><div><span>{target.targetType === "assignment" ? "Team-member task" : "Department task"}</span><h2>Update work</h2><p>{target.task || target.request}</p></div><button type="button" onClick={onClose}>×</button></header>
        <div className="next-task-form-grid">
          <label><span>Status *</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{WORK_STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Work link</span><input type="url" placeholder="https://..." value={form.workLink} onChange={(event) => setForm((current) => ({ ...current, workLink: event.target.value }))} /></label>
          <label className="wide"><span>Work report</span><textarea rows="7" value={form.workReport} onChange={(event) => setForm((current) => ({ ...current, workReport: event.target.value }))} /></label>
          {form.status === "rejected" ? <label className="wide"><span>Rejected reason *</span><textarea rows="3" value={form.rejectionReason} onChange={(event) => setForm((current) => ({ ...current, rejectionReason: event.target.value }))} /></label> : null}
        </div>
        <div className="next-task-upload-row"><label><input type="file" multiple hidden onChange={(event) => { choose(event.target.files); event.target.value = ""; }} /><span>{uploading ? "Uploading…" : "＋ Add work files"}</span></label><small>Up to 10 MB per file</small></div>
        <AttachmentLinks attachments={form.workFiles} empty="No work files uploaded." />
        {form.workFiles.length ? <button type="button" className="next-task-clear-files" onClick={() => setForm((current) => ({ ...current, workFiles: [] }))}>Remove all work files</button> : null}
        {error ? <p className="next-task-form-error">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || uploading}>{busy ? "Saving…" : "Save work"}</button></footer>
      </form>
    </div>
  );
}

function TeamWorkflowModal({ section, meta, onClose, onWork, notify, onParentRefresh }) {
  const [workflow, setWorkflow] = useState(null);
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const canManage = ["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin;
  const currentUser = meta.currentUser || {};

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(`/api/task-management/sections/${encodeURIComponent(section.id)}/people-workflow?view=my`);
      const items = (result.assignments || []).map((assignment) => ({
        ...assignment,
        clientId: text(assignment.id) || newClientId("assignment"),
        dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id),
      }));
      setWorkflow(result);
      setDraft(items);
    } catch (loadError) {
      setError(loadError?.message || "The team workflow could not be loaded.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { load(); }, [section.id]);
  const update = (clientId, key, value) => setDraft((current) => current.map((item) => item.clientId === clientId ? { ...item, [key]: value } : item));
  const add = () => setDraft((current) => {
    const previous = current[current.length - 1];
    return [...current, {
      clientId: newClientId("assignment"), assigneeId: "", assigneeName: "", task: "", details: "",
      deliveryDate: section.deliveryDate || "", attachments: [], dependsOn: previous ? [previous.clientId] : [], status: "not_started",
    }];
  });
  const remove = (clientId) => setDraft((current) => current.filter((item) => item.clientId !== clientId).map((item) => ({ ...item, dependsOn: (item.dependsOn || []).filter((id) => id !== clientId) })));
  const chooseFiles = async (clientId, files) => {
    if (!files?.length) return;
    setUploading(clientId);
    setError("");
    try {
      const uploaded = await uploadTaskFiles(files, "my");
      update(clientId, "attachments", mergeAttachments(draft.find((item) => item.clientId === clientId)?.attachments, uploaded));
    } catch (uploadError) {
      setError(uploadError?.message || "The attachments could not be uploaded.");
    } finally {
      setUploading("");
    }
  };
  const save = async () => {
    if (!draft.length) return setError("Add at least one team-member task.");
    if (draft.some((item) => !text(item.assigneeId) || !text(item.task) || !dateKey(item.deliveryDate))) return setError("Each task requires a team member, task, and delivery date.");
    setSaving(true);
    setError("");
    try {
      const assignments = draft.map((item, index) => ({
        clientId: item.clientId,
        assigneeId: item.assigneeId,
        assigneeName: item.assigneeName,
        task: item.task,
        details: item.details,
        deliveryDate: dateKey(item.deliveryDate),
        attachments: item.attachments || [],
        sortOrder: index + 1,
        executionGroup: index + 1,
        canvasX: 80 + (index % 3) * 340,
        canvasY: 80 + Math.floor(index / 3) * 240,
      }));
      const edges = draft.flatMap((item) => (item.dependsOn || []).map((from) => ({ from, to: item.clientId })));
      const result = await requestJson(`/api/task-management/sections/${encodeURIComponent(section.id)}/people-workflow?view=my`, {
        method: "PUT",
        body: JSON.stringify({ assignments, edges }),
      });
      notify("success", "Team workflow saved", `${assignments.length} team task${assignments.length === 1 ? "" : "s"} saved.`);
      setWorkflow((current) => ({ ...(current || {}), ...result }));
      setDraft((result.assignments || []).map((assignment) => ({ ...assignment, clientId: text(assignment.id), dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id) })));
      onParentRefresh();
    } catch (saveError) {
      setError(saveError?.message || "The team workflow could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const archiveAssignment = async (assignment) => {
    const archived = assignment.status !== "cancelled";
    try {
      const result = await requestJson(`/api/task-management/assignments/${encodeURIComponent(assignment.id)}/archive?view=my`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      notify("success", archived ? "Task archived" : "Task restored", assignment.assigneeName || "Team task");
      setDraft((current) => current.map((item) => item.clientId === assignment.clientId ? { ...item, ...result.assignment } : item));
    } catch (actionError) {
      notify("error", "Action failed", actionError?.message || "The team task could not be updated.");
    }
  };
  const deleteAssignment = async (assignment) => {
    if (!window.confirm(`Delete the task assigned to ${assignment.assigneeName || "this team member"}?`)) return;
    try {
      await requestJson(`/api/task-management/assignments/${encodeURIComponent(assignment.id)}?view=my`, { method: "DELETE" });
      remove(assignment.clientId);
      notify("success", "Task deleted", assignment.assigneeName || "Team task");
      onParentRefresh();
    } catch (actionError) {
      notify("error", "Delete failed", actionError?.message || "The team task could not be deleted.");
    }
  };
  const ownAssignment = (assignment) => {
    if (text(assignment.assigneeId) && text(currentUser.id)) return text(assignment.assigneeId) === text(currentUser.id);
    return lower(assignment.assigneeName) === lower(currentUser.name);
  };

  return (
    <div className="next-task-modal-layer" role="dialog" aria-modal="true">
      <button className="next-task-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className="next-task-modal next-task-team-modal">
        <header><div><span>{section.department}</span><h2>Team workflow</h2><p>{section.request}</p></div><button type="button" onClick={onClose}>×</button></header>
        {busy ? <div className="next-task-modal-loading">Loading team tasks…</div> : null}
        {!busy && error && !workflow ? <div className="next-task-error-box"><b>Could not load team workflow</b><p>{error}</p><button type="button" onClick={load}>Retry</button></div> : null}
        {!busy && workflow ? (
          <>
            <div className="next-task-team-summary"><span><b>{draft.length}</b><small>Team tasks</small></span><span><b>{draft.filter((item) => item.status === "completed").length}</b><small>Completed</small></span><span><b>{formatDate(section.deliveryDate)}</b><small>Department target</small></span></div>
            {canManage ? <div className="next-task-editor-head"><div><span>Department manager controls</span><h3>Assign team members</h3></div><button type="button" onClick={add}>＋ Add person task</button></div> : null}
            <div className="next-task-assignment-list">
              {draft.length ? draft.map((assignment, index) => (
                <article key={assignment.clientId} className={assignment.status === "cancelled" ? "archived" : ""}>
                  <header><span>{index + 1}</span><div><b>{assignment.assigneeName || "Unassigned task"}</b><small>{statusLabel(assignment.status)}</small></div><StatusPill status={assignment.status} archived={assignment.status === "cancelled"} /></header>
                  {canManage ? (
                    <div className="next-task-form-grid">
                      <label><span>Team member *</span><select value={assignment.assigneeId || ""} onChange={(event) => { const member = (workflow.members || []).find((item) => text(item.id) === event.target.value); update(assignment.clientId, "assigneeId", event.target.value); update(assignment.clientId, "assigneeName", member?.name || ""); }}><option value="">Select team member</option>{(workflow.members || []).map((member) => <option value={member.id} key={member.id}>{member.name}{member.position ? ` · ${member.position}` : ""}</option>)}</select></label>
                      <label><span>Delivery date *</span><input type="date" max={section.deliveryDate || undefined} value={assignment.deliveryDate || ""} onChange={(event) => update(assignment.clientId, "deliveryDate", event.target.value)} /></label>
                      <label className="wide"><span>Assigned task *</span><textarea rows="2" value={assignment.task || ""} onChange={(event) => update(assignment.clientId, "task", event.target.value)} /></label>
                      <label className="wide"><span>Details</span><textarea rows="2" value={assignment.details || ""} onChange={(event) => update(assignment.clientId, "details", event.target.value)} /></label>
                    </div>
                  ) : <div className="next-task-assignment-copy"><h4>{assignment.task}</h4><p>{assignment.details || "No extra details."}</p></div>}
                  {canManage ? <DependenciesEditor item={assignment} items={draft} onChange={(value) => update(assignment.clientId, "dependsOn", value)} /> : null}
                  {canManage ? <div className="next-task-upload-row"><label><input type="file" multiple hidden onChange={(event) => { chooseFiles(assignment.clientId, event.target.files); event.target.value = ""; }} /><span>{uploading === assignment.clientId ? "Uploading…" : "＋ Attach files"}</span></label></div> : null}
                  <AttachmentLinks attachments={assignment.attachments} />
                  {(assignment.workReport || assignment.workLink || assignment.workFiles?.length || assignment.rejectionReason) ? <div className="next-task-work-preview"><b>Submitted work</b>{assignment.workReport ? <p>{assignment.workReport}</p> : null}{assignment.rejectionReason ? <p className="danger">Rejected: {assignment.rejectionReason}</p> : null}{assignment.workLink ? <a href={assignment.workLink} target="_blank" rel="noreferrer">Open work link ↗</a> : null}<AttachmentLinks attachments={assignment.workFiles} /></div> : null}
                  <footer>
                    {(ownAssignment(assignment) || meta.isPageAdmin) && assignment.status !== "cancelled" ? <button type="button" onClick={() => onWork({ ...assignment, targetType: "assignment" })}>Update work</button> : null}
                    {canManage && assignment.id ? <button type="button" onClick={() => archiveAssignment(assignment)}>{assignment.status === "cancelled" ? "Restore" : "Archive"}</button> : null}
                    {canManage && assignment.id ? <button type="button" className="danger" onClick={() => deleteAssignment(assignment)}>Delete</button> : null}
                    {canManage && !assignment.id ? <button type="button" className="danger" onClick={() => remove(assignment.clientId)}>Remove</button> : null}
                  </footer>
                </article>
              )) : <div className="next-task-empty-mini"><span>○</span><b>No team tasks yet</b><small>{canManage ? "Add a person task to start the team workflow." : "Your department manager has not assigned team tasks yet."}</small></div>}
            </div>
            {error ? <p className="next-task-form-error">{error}</p> : null}
            <footer className="next-task-modal-footer"><button type="button" onClick={onClose}>Close</button>{canManage ? <button className="primary" type="button" onClick={save} disabled={saving || !!uploading}>{saving ? "Saving…" : "Save team workflow"}</button> : null}</footer>
          </>
        ) : null}
      </section>
    </div>
  );
}

function TicketDetails({ ticket, view, meta, onClose, onEdit, onRefresh, onWork, onTeamWorkflow, onArchive, onDelete, onDelivered, notify }) {
  const [live, setLive] = useState(ticket);
  const [loading, setLoading] = useState(false);
  const canManageDepartment = view === "my" && (["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin);
  const refreshDetail = async () => {
    setLoading(true);
    try {
      const result = await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}?view=${encodeURIComponent(view)}`);
      setLive(result.ticket || ticket);
    } catch (error) {
      notify("error", "Refresh failed", error?.message || "The project could not refresh.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refreshDetail(); }, [ticket.id]);
  const sectionGroups = useMemo(() => {
    const groups = new Map();
    for (const section of live.sections || []) {
      const key = number(section.executionGroup || section.sortOrder || 1);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(section);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [live]);
  const updateSimpleStatus = async (section, status) => {
    try {
      const result = await requestJson(`/api/task-management/sections/${encodeURIComponent(section.id)}?view=${encodeURIComponent(view)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, completionNote: section.completionNote || "" }),
      });
      setLive(result.ticket || live);
      onRefresh();
      notify("success", "Workflow updated", `${section.department} is now ${statusLabel(status)}.`);
    } catch (error) {
      notify("error", "Update failed", error?.message || "The workflow block could not be updated.");
    }
  };
  return (
    <div className="next-task-modal-layer" role="dialog" aria-modal="true">
      <button className="next-task-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className="next-task-modal next-task-details-modal">
        <header className="next-task-details-head">
          <div><span>{live.ticketCode}</span><h2>{live.title}</h2><p>{live.description || "No project description."}</p></div>
          <div><StatusPill status={live.status} archived={live.isArchived} /><PriorityPill priority={live.priority} /><button type="button" onClick={onClose}>×</button></div>
        </header>
        <div className="next-task-project-summary">
          <span><small>Created by</small><b>{live.createdByName || "—"}</b></span>
          <span><small>Target date</small><b>{formatDate(live.dueDate)}</b></span>
          <span><small>Created</small><b>{formatDateTime(live.createdAt)}</b></span>
          <span><small>Progress</small><b>{ticketStats(live, view).progress}%</b></span>
        </div>
        <div className="next-task-project-actions">
          <button type="button" onClick={() => onEdit(live)}>Edit project</button>
          <button type="button" onClick={() => onArchive(live)}>{live.isArchived ? "Unarchive" : "Archive"}</button>
          {view === "delegated" && !live.isArchived && live.status !== "completed" ? <button type="button" className="success" onClick={() => onDelivered(live)}>Mark delivered</button> : null}
          <button type="button" className="danger" onClick={() => onDelete(live)}>Delete</button>
          <button type="button" onClick={refreshDetail} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
        <div className="next-task-workflow-heading"><div><span>Visual workflow</span><h3>Department execution stages</h3></div><small>{(live.sections || []).length} blocks · {(live.edges || []).length} dependencies</small></div>
        <div className="next-task-workflow">
          {sectionGroups.map(([stage, sections], groupIndex) => (
            <div className="next-task-workflow-stage" key={stage}>
              {groupIndex ? <div className="next-task-workflow-arrow">→</div> : null}
              <div className="next-task-workflow-stage-body"><small>Stage {stage}</small>{sections.map((section) => (
                <article key={section.id} className={`next-task-workflow-card next-task-workflow-card--${section.status}`}>
                  <header><span>{section.department || "Department"}</span><StatusPill status={section.status} /></header>
                  <h4>{section.request}</h4>
                  <p>{section.details || "No extra details."}</p>
                  <div className="next-task-workflow-meta"><span>Due {formatDate(section.deliveryDate)}</span>{section.completedByName ? <span>Done by {section.completedByName}</span> : null}</div>
                  <AttachmentLinks attachments={section.attachments} />
                  {(section.workReport || section.workLink || section.workFiles?.length || section.rejectionReason) ? <div className="next-task-work-preview"><b>Work output</b>{section.workReport ? <p>{section.workReport}</p> : null}{section.rejectionReason ? <p className="danger">Rejected: {section.rejectionReason}</p> : null}{section.workLink ? <a href={section.workLink} target="_blank" rel="noreferrer">Open work link ↗</a> : null}<AttachmentLinks attachments={section.workFiles} /></div> : null}
                  <footer>
                    {view === "my" ? <button type="button" onClick={() => onTeamWorkflow(section)}>Team workflow</button> : null}
                    {view === "my" && canManageDepartment ? <button type="button" onClick={() => onWork({ ...section, targetType: "section" })}>Update work</button> : null}
                    {view !== "my" ? <select value={section.status} onChange={(event) => updateSimpleStatus(section, event.target.value)}>{WORK_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : null}
                  </footer>
                </article>
              ))}</div>
            </div>
          ))}
        </div>
        <footer className="next-task-modal-footer"><a href={`/task-management/${view === "all" ? "all-tasks" : view === "my" ? "my-tasks" : "delegated-tasks"}`}>Open classic workflow builder</a><button type="button" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}

function editorFromTicket(ticket = null) {
  if (!ticket) {
    const first = newClientId("section");
    return { id: "", ticketCode: "", title: "", description: "", priority: "Normal", dueDate: "", adminPassword: "", sections: [{ clientId: first, department: "", request: "", details: "", deliveryDate: "", attachments: [], dependsOn: [] }] };
  }
  const sections = (ticket.sections || []).map((section) => ({
    ...section,
    clientId: text(section.id) || newClientId("section"),
    attachments: Array.isArray(section.attachments) ? section.attachments : (section.attachment ? [section.attachment] : []),
    dependsOn: dependenciesFor(ticket.sections || [], ticket.edges || [], section.id),
  }));
  return {
    id: ticket.id,
    ticketCode: ticket.ticketCode,
    title: ticket.title || "",
    description: ticket.description || "",
    priority: ticket.priority || "Normal",
    dueDate: dateKey(ticket.dueDate),
    adminPassword: "",
    sections: sections.length ? sections : editorFromTicket().sections,
  };
}

export default function TaskManagementClient({ view, initialMeta, initialTickets, availableViews, classicHref, bootstrapWarnings = [] }) {
  const [tickets, setTickets] = useState(Array.isArray(initialTickets) ? initialTickets : []);
  const [meta, setMeta] = useState(initialMeta || {});
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [priority, setPriority] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [editor, setEditor] = useState(null);
  const [workTarget, setWorkTarget] = useState(null);
  const [teamSection, setTeamSection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);
  const copy = VIEW_COPY[view] || VIEW_COPY.my;
  const canCreate = view === "delegated" && (["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin);

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
      setTickets(Array.isArray(list.tickets) ? list.tickets : []);
      setMeta(metaResult || meta);
      return list.tickets || [];
    } catch (error) {
      notify("error", "Refresh failed", error?.message || "Task Management could not refresh.");
      return [];
    } finally {
      if (!silent) setBusy(false);
    }
  };
  const departments = useMemo(() => {
    const map = new Map();
    for (const value of [...(meta.departments || []), ...tickets.flatMap(ticketDepartments)]) {
      const clean = text(value);
      if (clean && !map.has(lower(clean))) map.set(lower(clean), clean);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [meta.departments, tickets]);
  const activeTickets = useMemo(() => tickets.filter((ticket) => {
    if (status === "archived") {
      if (!ticket.isArchived) return false;
    } else {
      if (ticket.isArchived) return false;
      if (status !== "all" && ticket.status !== status) return false;
    }
    if (department !== "all" && !ticketDepartments(ticket).some((item) => lower(item) === department)) return false;
    if (priority !== "all" && priorityKey(ticket.priority) !== priority) return false;
    if (text(query) && !ticketSearchText(ticket).includes(lower(query))) return false;
    return true;
  }), [tickets, status, department, priority, query]);
  const agendaTickets = useMemo(() => tickets.filter((ticket) => status === "archived" ? ticket.isArchived : (!ticket.isArchived && (status === "all" || ticket.status === status))), [tickets, status]);
  const counts = useMemo(() => ({
    all: tickets.filter((ticket) => !ticket.isArchived).length,
    not_started: tickets.filter((ticket) => !ticket.isArchived && ticket.status === "not_started").length,
    in_progress: tickets.filter((ticket) => !ticket.isArchived && ticket.status === "in_progress").length,
    rejected: tickets.filter((ticket) => !ticket.isArchived && ticket.status === "rejected").length,
    completed: tickets.filter((ticket) => !ticket.isArchived && ticket.status === "completed").length,
    archived: tickets.filter((ticket) => ticket.isArchived).length,
  }), [tickets]);
  const summary = useMemo(() => ({
    active: tickets.filter((ticket) => !ticket.isArchived).length,
    blocks: tickets.reduce((sum, ticket) => sum + number(ticket.sectionsCount), 0),
    dueSoon: tickets.filter((ticket) => {
      const due = dateFromKey(dateKey(ticket.dueDate));
      if (!due || ticket.isArchived || ticket.status === "completed") return false;
      const days = (due.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000;
      return days >= 0 && days <= 7;
    }).length,
    completed: tickets.filter((ticket) => !ticket.isArchived && ticket.status === "completed").length,
  }), [tickets]);
  const clearFilters = () => { setDepartment("all"); setPriority("all"); setQuery(""); };

  const afterSaved = async (ticket) => {
    setEditor(null);
    const rows = await refresh({ silent: true });
    const live = rows.find((item) => text(item.id) === text(ticket?.id));
    if (live) setSelectedTicket(live);
  };
  const actionPassword = (label) => window.prompt(`${label}\nEnter the page Admin password:`) ?? null;
  const archive = async (ticket) => {
    const password = actionPassword(ticket.isArchived ? "Unarchive project" : "Archive project");
    if (password === null) return;
    try {
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}/archive?view=${encodeURIComponent(view)}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !ticket.isArchived, adminPassword: password }),
      });
      notify("success", ticket.isArchived ? "Project restored" : "Project archived", ticket.ticketCode);
      setSelectedTicket(null);
      refresh({ silent: true });
    } catch (error) {
      notify("error", "Archive action failed", error?.message || "The project could not be updated.");
    }
  };
  const remove = async (ticket) => {
    if (!window.confirm(`Delete ${ticket.ticketCode} permanently? This also deletes its workflow blocks and team tasks.`)) return;
    const password = actionPassword("Delete project");
    if (password === null) return;
    try {
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}?view=${encodeURIComponent(view)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: password }),
      });
      notify("success", "Project deleted", ticket.ticketCode);
      setSelectedTicket(null);
      refresh({ silent: true });
    } catch (error) {
      notify("error", "Delete failed", error?.message || "The project could not be deleted.");
    }
  };
  const delivered = async (ticket) => {
    if (!window.confirm(`Mark ${ticket.ticketCode} and all workflow tasks as completed?`)) return;
    try {
      await requestJson(`/api/task-management/${encodeURIComponent(ticket.id)}/mark-delivered?view=delegated`, { method: "POST", body: JSON.stringify({}) });
      notify("success", "Project delivered", ticket.ticketCode);
      setSelectedTicket(null);
      refresh({ silent: true });
    } catch (error) {
      notify("error", "Delivery failed", error?.message || "The project could not be marked as delivered.");
    }
  };
  const openEdit = (ticket) => setEditor(editorFromTicket(ticket));
  const workSaved = async () => {
    setWorkTarget(null);
    await refresh({ silent: true });
    if (selectedTicket) {
      const result = await requestJson(`/api/task-management/${encodeURIComponent(selectedTicket.id)}?view=${encodeURIComponent(view)}`).catch(() => null);
      if (result?.ticket) setSelectedTicket(result.ticket);
    }
  };

  return (
    <section className="next-task-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Some Task Management resources loaded through fallback.</strong><span>The page remains usable while those resources recover.</span><a href={classicHref}>Open classic page</a></div> : null}
      <div className="next-task-viewbar">
        <div>{(availableViews || []).map((item) => <a className={item.key === view ? "active" : ""} href={`/next/task-management/${item.slug}`} key={item.key}>{item.label}</a>)}</div>
        <div><button type="button" onClick={() => searchRef.current?.focus()}>⌕ Search</button><button type="button" onClick={() => refresh()} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh"}</button>{canCreate ? <button type="button" className="primary" onClick={() => setEditor(editorFromTicket())}>＋ Add Project</button> : null}</div>
      </div>
      <div className="next-task-title-row"><div><span>Task Management</span><h2>{copy.label}</h2><p>{copy.subtitle}</p></div><a href={classicHref}>Open classic interface</a></div>
      <div className="next-task-summary-grid">
        <article><span>Active projects</span><strong>{summary.active}</strong><small>Across this view</small></article>
        <article><span>Workflow blocks</span><strong>{summary.blocks}</strong><small>Department tasks</small></article>
        <article><span>Due in 7 days</span><strong>{summary.dueSoon}</strong><small>Needs attention</small></article>
        <article><span>Completed</span><strong>{summary.completed}</strong><small>Delivered projects</small></article>
      </div>
      <div className="next-task-layout">
        <CalendarAgenda tickets={agendaTickets} selectedDate={selectedDate} onSelectDate={setSelectedDate} month={month} onMonthChange={setMonth} onOpenTicket={setSelectedTicket} />
        <div className="next-task-main-list">
          <div className="next-task-toolbar">
            <div className="next-task-status-tabs">
              {STATUS_OPTIONS.map(([value, label]) => <button type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)} key={value}><span>{label}</span><b>{counts[value] || 0}</b></button>)}
            </div>
            <div className="next-task-filters">
              <label><span>Search</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project, department, creator…" /></label>
              <label><span>Department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</select></label>
              <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map((item) => <option value={lower(item)} key={item}>{item}</option>)}</select></label>
              {(department !== "all" || priority !== "all" || query) ? <button type="button" onClick={clearFilters}>Clear</button> : null}
            </div>
          </div>
          <div className="next-task-results-head"><span>{activeTickets.length} project{activeTickets.length === 1 ? "" : "s"}</span><small>{status === "archived" ? "Personal archive for this page" : "Live Supabase workflow data"}</small></div>
          <div className="next-task-grid">
            {activeTickets.length ? activeTickets.map((ticket) => <ProjectCard ticket={ticket} view={view} onOpen={setSelectedTicket} key={ticket.id} />) : <div className="next-task-empty"><span>⌁</span><h3>{copy.empty}</h3><p>Adjust the filters or open the classic page if you need the previous workflow builder.</p>{canCreate ? <button type="button" onClick={() => setEditor(editorFromTicket())}>Create Project</button> : <a href={classicHref}>Open classic page</a>}</div>}
          </div>
        </div>
      </div>
      {selectedTicket ? <TicketDetails ticket={selectedTicket} view={view} meta={meta} onClose={() => setSelectedTicket(null)} onEdit={openEdit} onRefresh={() => refresh({ silent: true })} onWork={setWorkTarget} onTeamWorkflow={setTeamSection} onArchive={archive} onDelete={remove} onDelivered={delivered} notify={notify} /> : null}
      {editor ? <ProjectEditor editor={editor} meta={meta} view={view} onClose={() => setEditor(null)} onSaved={afterSaved} notify={notify} /> : null}
      {workTarget ? <WorkEditor target={workTarget} view={view} onClose={() => setWorkTarget(null)} onSaved={workSaved} notify={notify} /> : null}
      {teamSection ? <TeamWorkflowModal section={teamSection} meta={meta} onClose={() => setTeamSection(null)} onWork={(target) => { setTeamSection(null); setWorkTarget(target); }} notify={notify} onParentRefresh={() => refresh({ silent: true })} /> : null}
    </section>
  );
}
