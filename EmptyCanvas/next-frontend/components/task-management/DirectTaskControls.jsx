"use client";

import { useEffect, useId, useRef, useState } from "react";
import TaskCreateSelect from "./TaskCreateSelect";
import { DirectTaskAttachmentPicker, DirectTaskFiles } from "./DirectTaskAttachments";

const STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Done", rejected: "Rejected" };
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function Symbol({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "task" ? <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 11 2 2 5-5M8 17h8"/></> : name === "project" ? <><circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="19" r="2.5"/><path d="M6 7.5v9M18 8.5c0 6-4 9-9.5 10"/></> : name === "close" ? <path d="m6 6 12 12M18 6 6 18"/> : <path d="m9 5 7 7-7 7"/>}</svg>;
}

function Dialog({ title, eyebrow, onClose, children, choice = false, elevated = false, sheetIcon = "" }) {
  const titleId = useId();
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    if (sheetIcon) panel.current?.querySelector("h2")?.focus({ preventScroll: true });
    else panel.current?.querySelector("button, input, select")?.focus();
    const keyboard = (event) => {
      // Only the topmost dialog handles keyboard navigation.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (event.defaultPrevented || dialogs[dialogs.length - 1] !== panel.current?.parentElement) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== "Tab") return;
      const els = [...(panel.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])].filter(element => element.tabIndex >= 0 && element.getClientRects().length);
      if (!els.length) return;
      if (event.shiftKey && document.activeElement === els[0]) { event.preventDefault(); els[els.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === els[els.length - 1]) { event.preventDefault(); els[0].focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  const dialogContent = <>
    {sheetIcon ? <header className="tm-direct-header tm-create-sheet-header"><h2 id={titleId} tabIndex={-1}>{title}</h2></header> : <header className="tm-direct-header"><div><span>{eyebrow}</span><h2 id={titleId}>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close" className="tm-direct-close"><Symbol name="close"/></button></header>}
    {children}
  </>;
  return <div className={`tm-direct-overlay${choice ? " tm-direct-overlay--choice" : ""}${elevated ? " tm-direct-overlay--elevated" : ""}${sheetIcon ? " tm-create-sheet-overlay" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="tm-direct-backdrop" onClick={onClose}/>
    <section className={`tm-direct-panel${sheetIcon ? " tm-create-sheet" : ""}`} ref={panel}>
      {sheetIcon ? <>
        <span className="tm-create-sheet-badge" aria-hidden="true"><Symbol name={sheetIcon}/></span>
        <div className="tm-create-sheet-scroll">{dialogContent}</div>
      </> : dialogContent}
    </section>
  </div>;
}

export function TaskCreateChoice({ onClose, onTask, onProject }) {
  return <Dialog title="Add new" eyebrow="Task management" choice onClose={onClose}>
    <button type="button" className="tm-direct-option" onClick={onTask}><span className="tm-direct-option__icon"><Symbol name="task"/></span><span><strong>Task</strong><small>Assign a task to one person</small></span><Symbol name="arrow"/></button>
    <button type="button" className="tm-direct-option" onClick={onProject}><span className="tm-direct-option__icon"><Symbol name="project"/></span><span><strong>Project</strong><small>Build a department workflow</small></span><Symbol name="arrow"/></button>
  </Dialog>;
}

export function DirectTaskEditor({ editor, meta, view, requestJson, notify, onClose, onSaved, canUploadAttachments = false }) {
  const [draft, setDraft] = useState(editor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const uploadLock = useRef(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const chooseFiles = async (chosen) => {
    if (draft.id || !canUploadAttachments || saving.current || uploadLock.current || !chosen.length) return;
    setUploadError("");
    if (files.length + chosen.length > 20) { setUploadError("Choose at most 20 attachments."); return; }
    if (chosen.some(file => !file.size || file.size > 10 * 1024 * 1024)) {
      setUploadError("Each attachment must be non-empty and 10 MB or less."); return;
    }
    uploadLock.current = true;
    setUploading(true);
    const failures = [];
    try {
      for (const [index, file] of chosen.entries()) {
        setUploadProgress(`Uploading ${index + 1} of ${chosen.length}…`);
        try {
          const result = await requestJson(`/next/api/task-management/upload-task-attachment?filename=${encodeURIComponent(file.name)}`, {
            method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
          });
          if (!result?.file?.url) throw new Error("Storage did not confirm the attachment upload.");
          setFiles(current => [...current, result.file]);
        } catch (err) {
          failures.push(`${file.name}: ${err.message || "Upload failed."}`);
        }
      }
      if (failures.length) setUploadError(failures.join(" · "));
    } finally {
      uploadLock.current = false;
      setUploading(false);
      setUploadProgress("");
    }
  };
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const close = () => { if (!saving.current && !uploadLock.current) onClose(); };
  const submit = async (event) => {
    event.preventDefault();
    if (saving.current || uploadLock.current) return;
    if (!draft.id && !members.some(member => String(member.id) === String(draft.assigneeId))) {
      setError("Select a team member.");
      return;
    }
    saving.current = true; setBusy(true); setError("");
    try {
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({
        action: draft.id ? "ticket-update" : "ticket-create", view, ticketId: draft.id,
        kind: "task", ...(!draft.id && files.length ? { attachments: files } : {}), title: draft.title, description: draft.description, priority: draft.priority, dueDate: draft.dueDate, assigneeId: draft.assigneeId, adminPassword: draft.adminPassword,
      }) });
      notify("success", draft.id ? "Task updated" : "Task created", draft.title);
      await onSaved(result.ticket);
    } catch (err) { setError(err.message || "Unable to save task."); }
    finally { saving.current = false; setBusy(false); }
  };
  const members = meta.taskAssignees || [];
  return <Dialog title={draft.id ? "Edit task" : "Create Task"} eyebrow="Individual task" onClose={close} elevated sheetIcon={draft.id ? "" : "task"}>
    <form className="tm-direct-form" onSubmit={submit}>
      <label>Task title <input required autoComplete="off" maxLength={500} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Enter task title"/></label>
      {draft.id ? <label>Assigned to <input readOnly value={draft.assigneeName || ""}/></label> : <div className="tm-create-select-field"><span>Assigned to</span><TaskCreateSelect label="Assigned to" value={draft.assigneeId} onChange={(value) => { set("assigneeId", value); setError(""); }} placeholder={members.length ? "Select a team member" : "No team members available"} options={members.map(member => ({ value: member.id, label: `${member.name}${member.department ? ` · ${member.department}` : ""}` }))}/></div>}
      <div className="tm-direct-fields"><label>Due date <input required type="date" value={draft.dueDate} onChange={(e) => set("dueDate", e.target.value)}/></label>{draft.id ? <label>Priority <select required value={draft.priority} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label> : <div className="tm-create-select-field"><span>Priority</span><TaskCreateSelect label="Priority" priority value={draft.priority} options={PRIORITIES.map(p => ({value:p,label:p}))} onChange={value => set("priority", value)}/></div>}</div>
      <label>Description <textarea rows={4} maxLength={8000} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the task…"/></label>
      {!draft.id && canUploadAttachments && <DirectTaskAttachmentPicker files={files} uploading={uploading} progress={uploadProgress} error={uploadError} disabled={busy} onChoose={chooseFiles} onRemove={url => { setFiles(current => current.filter(file => file.url !== url)); setUploadError(""); }}/> }
      {error && <p role="alert" className="tm-direct-error">{error}</p>}
      <div className="tm-direct-actions"><button type="button" className="tm-direct-secondary" disabled={busy || uploading} onClick={close}>Cancel</button><button type="submit" className="tm-direct-primary" disabled={busy || uploading || (!draft.id && !members.length)}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create Task"}</button></div>
    </form>
  </Dialog>;
}

export function DirectTaskDetail({ ticket, view, canWork, onClose, onEdit, onArchive, onDelete, requestJson, notify, onSaved }) {
  const [status, setStatus] = useState(ticket.status);
  const [report, setReport] = useState(ticket.directWorkReport || "");
  const [reason, setReason] = useState(ticket.directRejectionReason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => { setStatus(ticket.status); setReport(ticket.directWorkReport || ""); setReason(ticket.directRejectionReason || ""); }, [ticket.id, ticket.status, ticket.directWorkReport, ticket.directRejectionReason]);
  const submit = async (event) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const res = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "ticket-task-work", view, ticketId: ticket.id, status, workReport: report, rejectionReason: reason }) });
      notify("success", "Task updated", ticket.title);
      await onSaved(res.ticket);
    } catch (err) { setError(err.message || "Unable to update task."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog title={ticket.title} eyebrow={`Individual task · ${ticket.ticketCode}`} onClose={() => { if (!saving.current) onClose(); }}>
    <span className={`tm-direct-status tm-direct-status--${ticket.status}`}>{ticket.isArchived ? "Archived" : STATUS[ticket.status] || ticket.statusLabel}</span>
    <dl className="tm-direct-meta"><div><dt>Assigned to</dt><dd>{ticket.directAssigneeName}</dd></div><div><dt>Created by</dt><dd>{ticket.createdByName}</dd></div><div><dt>Due date</dt><dd>{ticket.dueDate || "—"}</dd></div><div><dt>Priority</dt><dd>{ticket.priority}</dd></div></dl>
    <div className="tm-direct-description"><strong>Description</strong><p>{ticket.description || "No description provided."}</p></div>
    {ticket.directAttachments?.length > 0 && <div className="tm-direct-description"><strong>Attachments</strong><DirectTaskFiles files={ticket.directAttachments}/></div>}
    {canWork ? <form className="tm-direct-form" onSubmit={submit}>
      <label>Status <select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Work report <textarea rows={3} maxLength={8000} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Write a progress update…"/></label>
      {status === "rejected" && <label>Rejection reason <textarea required rows={3} maxLength={8000} value={reason} onChange={(e) => setReason(e.target.value)}/></label>}
      {error && <p role="alert" className="tm-direct-error">{error}</p>}
      <button type="submit" className="tm-direct-primary" disabled={busy}>{busy ? "Saving…" : "Save work"}</button>
    </form> : <><div className="tm-direct-description"><strong>Work report</strong><p>{ticket.directWorkReport || "No report yet."}</p></div>{ticket.directRejectionReason && <div className="tm-direct-description"><strong>Rejection reason</strong><p>{ticket.directRejectionReason}</p></div>}</>}
    {(onEdit || onArchive || onDelete) && <div className="tm-direct-actions tm-direct-management">{onEdit && <button type="button" className="tm-direct-secondary" onClick={() => onEdit(ticket)}>Edit</button>}{onArchive && <button type="button" className="tm-direct-secondary" onClick={() => onArchive(ticket)}>{ticket.isArchived ? "Restore" : "Archive"}</button>}{onDelete && <button type="button" className="tm-direct-secondary tm-direct-danger" onClick={() => onDelete(ticket)}>Delete</button>}</div>}
  </Dialog>;
}
