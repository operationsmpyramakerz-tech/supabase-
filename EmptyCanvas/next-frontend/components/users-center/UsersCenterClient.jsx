"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function fieldKey(value) { return lower(value).replace(/[^a-z0-9]/g, ""); }
function initials(value) { const parts = text(value || "User").split(/\s+/).filter(Boolean).slice(0, 2); return (parts.map((part) => part[0]).join("") || "U").toUpperCase(); }
function unique(values) { const out = []; const seen = new Set(); for (const value of values || []) { const clean = text(value); const key = lower(clean); if (!clean || seen.has(key)) continue; seen.add(key); out.push(clean); } return out; }
function splitValues(value) { const raw = text(value); if (!raw) return []; try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return unique(parsed); } catch {} return unique(raw.split(/[,\n]+/)); }
function formatDate(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString("en-GB"); }
function sortByName(rows) { return [...(rows || [])].sort((a, b) => text(a?.name).localeCompare(text(b?.name))); }
function pageToken(value) { return lower(value).replace(/[^a-z0-9]/g, ""); }
function normalizeAccessLevel(value) { const raw = lower(value); return raw === "admin" ? "admin" : raw === "view" ? "view" : "edit"; }
function accessLevelLabel(value) { const level = normalizeAccessLevel(value); return level === "admin" ? "Admin" : level === "view" ? "View" : "Edit"; }
function fileLinks(value) { return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean); }
function fileLabel(url, index) { let label = ""; try { const parsed = new URL(url); label = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "") || parsed.hostname; } catch { label = String(url || "").split("/").filter(Boolean).pop() || ""; } label = label.replace(/^\d+-[a-f0-9]+-/i, "").replace(/[_-]?image_?\d*/i, "").trim(); return !label || label.length > 28 ? `File ${index + 1}` : label; }

const MEMBER_FORM_FIELD_ORDER = ["profilepicture", "employeecode", "name", "password", "phone", "email", "department", "position", "filesmedia", "svschools", "allowedpages", "school"];
function orderEditableFieldsForForm(fields = []) {
  const list = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const picked = []; const used = new Set();
  for (const target of MEMBER_FORM_FIELD_ORDER) {
    const found = list.find((field) => fieldKey(field?.name) === target);
    if (found && !used.has(found)) { picked.push(found); used.add(found); }
  }
  for (const field of list) if (!used.has(field)) picked.push(field);
  return picked;
}

function fieldValue(member, name) {
  const wanted = fieldKey(name);
  const field = (member?.fields || []).find((item) => fieldKey(item?.label) === wanted);
  if (!field) return "";
  if (field.type === "files") {
    const urls = Array.isArray(field.files) ? field.files.map((item) => item?.url || "").filter(Boolean) : Array.isArray(field.fileUrls) ? field.fileUrls.filter(Boolean) : [];
    return urls.join("\n") || field.value || "";
  }
  if (field.type === "relation") return (field.relationIds || []).filter(Boolean).join(", ") || field.value || "";
  return field.value || "";
}

function normalizeDirectory(payload) {
  const departments = Array.isArray(payload?.departments) ? payload.departments.map((department) => ({
    ...department,
    id: text(department.id || department.departmentKey || department.name),
    name: text(department.name) || "No Department",
    members: Array.isArray(department.members) ? department.members : [],
    count: Number(department.count ?? department.members?.length ?? 0) || 0,
  })) : [];
  return {
    total: Number(payload?.total || departments.reduce((sum, department) => sum + Number(department.count || department.members?.length || 0), 0)) || 0,
    departments,
    editableFields: Array.isArray(payload?.editableFields) ? payload.editableFields : [],
  };
}

function normalizeAccessRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    pageId: text(row?.pageId || row?.page_id || row?.id),
    pageKey: text(row?.pageKey || row?.page_key),
    pageName: text(row?.pageName || row?.page_name || row?.name) || "Page",
    moduleName: text(row?.moduleName || row?.module_name) || "General",
    routePath: text(row?.routePath || row?.route_path),
    sortOrder: Number(row?.sortOrder || row?.sort_order || 100),
    accessLevel: normalizeAccessLevel(row?.accessLevel || row?.access_level || "edit"),
    isEnabled: !!(row?.isEnabled ?? row?.is_enabled ?? row?.enabled),
  })).filter((row) => row.pageId || row.pageKey).sort((a, b) => (a.sortOrder - b.sortOrder) || a.pageName.localeCompare(b.pageName));
}

function normalizeSvRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    memberId: text(row?.memberId || row?.member_id || row?.visibleTeamMemberId || row?.visible_team_member_id || row?.id),
    name: text(row?.name || row?.memberName || row?.member_name || row?.visibleTeamMemberName || row?.visible_team_member_name) || "User",
    department: text(row?.department), position: text(row?.position), email: text(row?.email), photoUrl: text(row?.photoUrl || row?.photo_url),
    isEnabled: !!(row?.isEnabled ?? row?.is_enabled ?? row?.enabled), isSelf: !!(row?.isSelf ?? row?.is_self),
  })).filter((row) => row.memberId).sort((a, b) => (Number(b.isSelf) - Number(a.isSelf)) || (Number(b.isEnabled) - Number(a.isEnabled)) || a.name.localeCompare(b.name));
}

function accessRowMatchesPage(row, pageName) {
  const wanted = pageToken(pageName);
  const raw = [row?.pageName, row?.pageKey, row?.routePath, row?.moduleName].map((value) => text(value)).filter(Boolean);
  const tokens = raw.map(pageToken); const rawLower = raw.map(lower);
  if (wanted === "ordersreview") return tokens.some((value) => ["ordersreview", "svorders", "orderssvorders"].includes(value)) || rawLower.some((value) => value.includes("orders-review") || value.includes("sv-orders"));
  if (wanted === "stocktaking") return tokens.some((value) => value === "stocktaking" || value.includes("stocktaking"));
  if (wanted === "currentorders") return tokens.some((value) => value === "currentorders" || value.includes("currentorders")) || rawLower.some((value) => value.includes("current-orders"));
  if (wanted === "shoppingcart") return tokens.some((value) => ["shoppingcart", "cart"].includes(value) || value.includes("shoppingcart")) || rawLower.some((value) => value.includes("shopping-cart") || value.endsWith("/cart"));
  return tokens.includes(wanted);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include", cache: "no-store", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    const error = new Error("Your session has expired."); error.status = 401; throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(text(body?.message || body?.error) || "The request failed.");
    error.status = response.status; error.body = body; throw error;
  }
  return body;
}

function UAIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    folder: <><path d="M3 5h6l2 2h10v12H3z"/><path d="M3 9h18"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/><path d="M9 6V4h6v2"/></>,
    chevron: <polyline points="9 18 15 12 9 6"/>, chevronDown: <polyline points="6 9 12 15 18 9"/>,
    back: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    addUser: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    signup: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></>,
    folderPlus: <><path d="M3 5h6l2 2h10v12H3z"/><path d="M12 11v5M9.5 13.5h5"/></>,
    hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="3" y1="15" x2="19" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>,
    mail: <><path d="M4 4h16v16H4z"/><polyline points="22,6 12,13 2,6"/></>,
    move: <><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    unlock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.5-2"/></>,
    check: <polyline points="20 6 9 17 4 12"/>, checkCircle: <><circle cx="12" cy="12" r="10"/><polyline points="16 8 10.5 15 8 12.5"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    alert: <><path d="M10.3 2.9L1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    upload: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.4 17.5A5 5 0 0 0 18 8.1 7 7 0 0 0 4.3 9.7 4.5 4.5 0 0 0 5.5 18H7"/></>,
    paperclip: <path d="M21.4 11.6l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.4 18a2 2 0 1 1-2.8-2.8l8.5-8.5"/>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    branch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9c0 0 2 0 4 0s3-3 5-3"/></>,
  };
  return <svg {...common}>{paths[name] || paths.user}</svg>;
}

function Toast({ value, onClose }) {
  if (!value) return null;
  return <div className={`next-toast next-toast--${value.type || "info"}`} role="status"><span>{value.type === "success" ? "✓" : value.type === "error" ? "!" : "i"}</span><div><strong>{value.title || "Users Center"}</strong><small>{value.message}</small></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>;
}

let modalCount = 0;
function useModalBodyLock() {
  useEffect(() => {
    modalCount += 1; document.body.classList.add("ua-modal-open");
    return () => { modalCount = Math.max(0, modalCount - 1); if (!modalCount) document.body.classList.remove("ua-modal-open"); };
  }, []);
}

function Modal({ title, subtitle = "", onClose, children, modalClass = "", compact = false, icon = "user", footer = null, dangerIcon = false, bodyClass = "", closeDisabled = false, beforeBody = null, zIndex = 9999 }) {
  const [mounted, setMounted] = useState(false); useModalBodyLock();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="ua-modal-overlay" style={{ zIndex }} onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose?.(); }}>
      <section className={`ua-modal ${modalClass}`} role="dialog" aria-modal="true">
        <button type="button" className="ua-modal__close" onClick={onClose} disabled={closeDisabled} aria-label="Close"><UAIcon name="close"/></button>
        <div className={`ua-modal__header ${compact ? "ua-modal__header--compact" : ""}`}>
          <div className={`ua-modal__avatar ua-modal__avatar--icon ${dangerIcon ? "ua-modal__avatar--danger" : ""}`}><UAIcon name={icon}/></div>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        {beforeBody}
        {children != null ? <div className={`ua-modal__body ${bodyClass}`}>{children}</div> : null}
        {footer ? <div className="ua-modal__actions">{footer}</div> : null}
      </section>
    </div>, document.body,
  );
}

function ModernSelect({ value, onChange, options = [], placeholder = "Select", disabled = false, compact = false, ariaLabel, footer = null }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  const values = unique([value, ...options].filter(Boolean));
  useEffect(() => {
    function close(event) { if (!ref.current?.contains(event.target)) setOpen(false); }
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <div ref={ref} className={`ua-modern-select ${compact ? "ua-modern-select--compact" : ""} ${open ? "is-open" : ""}`}>
    <button type="button" className={`ua-modern-select-button ${value ? "has-value" : ""}`} disabled={disabled} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel || placeholder}><span>{value || placeholder}</span><UAIcon name="chevronDown"/></button>
    <div className="ua-modern-select-menu" role="listbox" hidden={!open}>
      {values.length ? values.map((option) => <button type="button" key={option} className={`ua-modern-option ${option === value ? "is-selected" : ""}`} onClick={() => { onChange(option); setOpen(false); }}><span>{option}</span>{option === value ? <UAIcon name="check"/> : null}</button>) : <div className="ua-modern-option-empty">No options available.</div>}
      {footer}
    </div>
  </div>;
}

function PasswordModal({ action, onClose, onVerified }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); if (!text(password)) return setError("Please enter the Admin password."); setBusy(true); setError(""); try { await requestJson("/api/user-access/admin/verify", { method: "POST", body: JSON.stringify({ password }) }); await onVerified(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title="Admin Verification" onClose={onClose} modalClass="ua-modal--small" compact icon="lock" closeDisabled={busy} bodyClass="ua-modal__body--compact" zIndex={10060} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-admin-password-form" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="unlock"/><span>{busy ? "Checking..." : "Continue"}</span></button></>}>
    <form id="ua-next-admin-password-form" onSubmit={submit}><label className="ua-form-field ua-form-field--wide"><span>Admin Password</span><input autoFocus type="password" autoComplete="current-password" placeholder="Enter Admin password" value={password} onChange={(event) => setPassword(event.target.value)}/></label><div className="ua-form-error">{error}</div></form>
  </Modal>;
}

function ConfirmModal({ value, onClose }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function confirm() { if (busy) return; setBusy(true); setError(""); try { await value?.onConfirm?.(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title={value?.title || "Confirm action"} subtitle={value?.message || "Are you sure?"} onClose={onClose} modalClass="ua-modal--small ua-confirm-modal" compact icon="alert" dangerIcon closeDisabled={busy} zIndex={10050} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={`ua-btn ${value?.danger ? "ua-btn--danger" : "ua-btn--dark"}`} onClick={confirm} disabled={busy}><UAIcon name={value?.danger ? "trash" : "check"}/><span>{busy ? "Working..." : (value?.confirmLabel || "Confirm")}</span></button></>}>{error ? <div className="ua-form-error">{error}</div> : null}</Modal>;
}

function Avatar({ member, small = false }) {
  const cls = `ua-avatar${small ? " ua-avatar--small" : ""}`;
  return member?.photoUrl ? <div className={cls}><img src={member.photoUrl} alt={member.name || "User"} loading="lazy"/></div> : <div className={cls}>{initials(member?.name)}</div>;
}

async function readRawFileAsDataUrl(file) { return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Failed to read file.")); reader.readAsDataURL(file); }); }
function shouldCompressImage(file) { const type = lower(file?.type); const name = lower(file?.name); if (type === "image/gif" || type === "image/svg+xml" || /\.(gif|svg)$/i.test(name)) return false; return type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name); }
async function compressDataUrl(file, raw) { if (!shouldCompressImage(file)) return raw; try { const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Failed to load image for compression.")); img.src = raw; }); const ratio = Math.min(1, 1400 / Math.max(1, image.naturalWidth || image.width), 1400 / Math.max(1, image.naturalHeight || image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio)); canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio)); const context = canvas.getContext("2d", { alpha: true }); context.drawImage(image, 0, 0, canvas.width, canvas.height); let compressed = canvas.toDataURL("image/webp", .74); if (!/^data:image\/webp/i.test(compressed)) compressed = canvas.toDataURL("image/jpeg", .76); return compressed && compressed.length < raw.length ? compressed : raw; } catch { return raw; } }
async function uploadUserFile(file, kind) { if (!file) return null; if (file.size > 12 * 1024 * 1024) throw new Error("File is too large. Maximum size is 12MB."); const raw = await readRawFileAsDataUrl(file); const dataUrl = await compressDataUrl(file, raw); return await requestJson("/api/user-access/upload-file", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name || "upload.bin", kind }) }); }

function SignupRequestsModal({ departments, positions = [], onClose, onChanged, notify }) {
  const [status, setStatus] = useState("pending"); const [requests, setRequests] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [approve, setApprove] = useState(null); const [rejecting, setRejecting] = useState(null); const [form, setForm] = useState({ department: "", position: "" }); const [busy, setBusy] = useState(false);
  async function load(nextStatus = status) { setLoading(true); setError(""); try { const body = await requestJson(`/api/user-access/signup-requests?status=${encodeURIComponent(nextStatus)}&_=${Date.now()}`); setRequests(body.requests || []); } catch (err) { setRequests([]); setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load("pending"); }, []);
  function beginApprove(request) { setApprove(request); setForm({ department: "", position: "" }); setError(""); }
  async function approveSubmit(event) { event.preventDefault(); if (!text(form.department) || !text(form.position)) return setError("Please select department and position."); setBusy(true); setError(""); try { const body = await requestJson(`/api/user-access/signup-requests/${encodeURIComponent(approve.id)}/approve`, { method: "POST", body: JSON.stringify(form) }); setApprove(null); notify?.("success", "Request approved", body.emailWarning ? `Approved, but email warning: ${body.emailWarning}` : "The user was added and notified by email."); await Promise.all([load(status), onChanged()]); } catch (err) { setError(err.message); notify?.("error", "Approval failed", err.message); } finally { setBusy(false); } }
  async function rejectConfirmed() { if (!rejecting || busy) return; setBusy(true); setError(""); try { const body = await requestJson(`/api/user-access/signup-requests/${encodeURIComponent(rejecting.id)}/reject`, { method: "POST", body: "{}" }); setRejecting(null); notify?.("success", "Request rejected", body.emailWarning ? `Rejected, but email warning: ${body.emailWarning}` : "The user was notified by email."); await Promise.all([load(status), onChanged()]); } catch (err) { setError(err.message); notify?.("error", "Reject failed", err.message); } finally { setBusy(false); } }
  const tabs = <div className="ua-signup-request-tabs" role="tablist" aria-label="Sign up request status filter">{["pending", "approved", "rejected"].map((item) => <button type="button" key={item} className={status === item ? "is-active" : ""} onClick={() => { setStatus(item); load(item); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
  const availableDepartments = departments.filter((department) => lower(department.name) !== "no department").map((department) => department.name).sort((a, b) => a.localeCompare(b));
  return <>
    <Modal title="Sign up requests" subtitle="Review account requests." onClose={onClose} modalClass="ua-modal--requests" compact icon="signup" beforeBody={tabs} bodyClass="ua-signup-requests-body" zIndex={10010}>
      {error && !approve && !rejecting ? <div className="ua-form-error">{error}</div> : null}
      {loading ? <div className="ua-loading-inline"><span/> Loading requests...</div> : null}
      {!loading && !requests.length ? <div className="ua-signup-empty"><UAIcon name={status === "rejected" ? "xCircle" : "checkCircle"}/><strong>No {status} requests</strong><span>No sign up requests found in this status.</span></div> : null}
      {!loading ? requests.map((request) => { const currentStatus = lower(request.status || status || "pending"); const details = [request.email, request.phone, formatDate(request.createdAt)].filter(Boolean).join(" • "); const review = [request.department, request.position, formatDate(request.reviewedAt)].filter(Boolean).join(" • "); return <article className={`ua-signup-request-card ua-signup-request-card--${currentStatus}`} key={request.id}><div className="ua-signup-request-main"><div className="ua-signup-request-avatar"><UAIcon name="user"/></div><div className="ua-signup-request-text"><strong title={request.username || "Unnamed"}>{request.username || "Unnamed"}</strong><span>Employee code: {request.employeeCode || "-"}</span><small>{details}</small>{review ? <small className="ua-signup-request-review">{review}</small> : null}</div></div>{currentStatus === "pending" ? <div className="ua-signup-request-actions"><button type="button" className="ua-btn ua-btn--approve" onClick={() => beginApprove(request)}><UAIcon name="check"/><span>Approve</span></button><button type="button" className="ua-btn ua-btn--reject" onClick={() => { setError(""); setRejecting(request); }}><UAIcon name="close"/><span>Reject</span></button></div> : <div className={`ua-signup-request-status ua-signup-request-status--${currentStatus}`}><UAIcon name={currentStatus === "approved" ? "checkCircle" : "xCircle"}/><span>{currentStatus === "approved" ? "Approved" : "Rejected"}</span></div>}</article>; }) : null}
    </Modal>
    {approve ? <Modal title="Approve request" subtitle={`${approve.username || "User"} • ${approve.employeeCode || "No code"}`} onClose={() => setApprove(null)} modalClass="ua-modal--small" compact icon="checkCircle" closeDisabled={busy} bodyClass="ua-modal__body--compact" zIndex={10040} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={() => setApprove(null)} disabled={busy}>Cancel</button><button type="submit" form="ua-next-signup-approve" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="signup"/><span>{busy ? "Approving..." : "Approve"}</span></button></>}><form id="ua-next-signup-approve" onSubmit={approveSubmit}><div className="ua-form-field ua-form-field--wide ua-form-field--modern-select"><span>Department</span><ModernSelect value={form.department} onChange={(department) => setForm((current) => ({ ...current, department }))} options={availableDepartments} placeholder="Choose department" disabled={busy}/></div><label className="ua-form-field ua-form-field--wide"><span>Position</span><input type="text" list="ua-next-signup-position-options" placeholder="Example: Operations Team Leader" value={form.position} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}/><datalist id="ua-next-signup-position-options">{positions.map((position) => <option value={position} key={position}/>)}</datalist></label>{error ? <div className="ua-form-error ua-form-field--wide">{error}</div> : null}</form></Modal> : null}
    {rejecting ? <Modal title="Reject sign up request?" subtitle={`Reject ${rejecting.username || "this user"} sign up request?`} onClose={() => setRejecting(null)} modalClass="ua-modal--small ua-confirm-modal" compact icon="alert" dangerIcon closeDisabled={busy} zIndex={10040} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={() => setRejecting(null)} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--danger" onClick={rejectConfirmed} disabled={busy}><UAIcon name="close"/><span>{busy ? "Working..." : "Reject"}</span></button></>}>{error ? <div className="ua-form-error">{error}</div> : null}</Modal> : null}
  </>;
}

function DepartmentForm({ department, onClose, onSaved }) {
  const [name, setName] = useState(department?.name || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const isEdit = !!department;
  async function submit(event) { event.preventDefault(); const clean = text(name).replace(/\s+/g, " "); if (!clean) return setError("Department name is required."); setBusy(true); setError(""); try { const endpoint = isEdit ? `/api/user-access/departments/${encodeURIComponent(department.id)}` : "/api/user-access/departments"; const body = await requestJson(endpoint, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify({ name: clean }) }); await onSaved(body); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title={isEdit ? "Edit Department" : "New Department"} subtitle={isEdit ? "Rename this department for all assigned team members." : ""} onClose={onClose} modalClass="ua-modal--small" compact icon="folder" closeDisabled={busy} bodyClass="ua-modal__body--compact" footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-department-form" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="save"/><span>{busy ? "Saving..." : isEdit ? "Save Department" : "Create Department"}</span></button></>}><form id="ua-next-department-form" onSubmit={submit}><label className="ua-form-field ua-form-field--wide"><span>Department Name</span><input autoFocus type="text" autoComplete="off" placeholder="e.g. Operations" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="ua-form-error">{error}</div></form></Modal>;
}

function MultiSelectField({ field, value, onChange }) {
  const [custom, setCustom] = useState(""); const selected = splitValues(value); const options = unique([...selected, ...(Array.isArray(field.options) ? field.options : [])]); const allowCustom = field.allowCustom !== false;
  function toggle(option) { const has = selected.some((item) => lower(item) === lower(option)); onChange((has ? selected.filter((item) => lower(item) !== lower(option)) : [...selected, option]).join(", ")); }
  function add() { const clean = text(custom); if (!clean) return; onChange(unique([...selected, clean]).join(", ")); setCustom(""); }
  return <div className="ua-form-field ua-form-field--wide ua-form-field--tokens"><span>{field.name}</span><div className="ua-multiselect"><div className="ua-token-list">{selected.length ? selected.map((item) => <span className="ua-token" key={item}>{item}</span>) : <span className="ua-token ua-token--muted">No values selected</span>}</div><div className="ua-ms-options">{options.length ? options.map((option) => <label className="ua-ms-option" key={option}><input type="checkbox" checked={selected.some((item) => lower(item) === lower(option))} onChange={() => toggle(option)}/><span>{option}</span></label>) : <div className="ua-ms-empty">No options yet.</div>}</div>{allowCustom ? <div className="ua-inline-add"><input type="text" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Add new option then press Add"/><button type="button" className="ua-mini-btn" onClick={add}>Add</button></div> : null}</div></div>;
}

function ProfileUploadField({ field, value, onChange, notify }) {
  const [uploading, setUploading] = useState(false); const [status, setStatus] = useState("");
  async function choose(file) { if (!file) return; setUploading(true); setStatus("Uploading profile picture..."); try { const body = await uploadUserFile(file, "profile-picture"); onChange(body?.url || ""); setStatus("Profile picture uploaded. Save changes to apply it."); notify("success", "Uploaded", "Profile picture uploaded."); } catch (err) { setStatus(err.message); notify("error", "Upload failed", err.message); } finally { setUploading(false); } }
  return <div className="ua-form-field ua-form-field--wide ua-upload-field"><span>{field.name}</span><div className="ua-profile-uploader ua-profile-uploader--upload-only"><div className="ua-profile-preview">{value ? <img src={value} alt="Profile picture"/> : <UAIcon name="image"/>}</div><div className="ua-upload-actions ua-upload-actions--profile-only"><label className="ua-file-pick ua-profile-pick"><UAIcon name="upload"/><span>{value ? "Replace image" : "Upload image"}</span><input type="file" accept="image/*" disabled={uploading} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }}/></label></div></div><small className={status && /fail|error|too large/i.test(status) ? "is-error" : ""}>{status}</small></div>;
}

function FileLinksField({ field, value, onChange, notify }) {
  const [uploading, setUploading] = useState(false); const [status, setStatus] = useState("Uploaded files and pasted links are saved as compact buttons."); const [link, setLink] = useState(""); const links = fileLinks(value);
  async function choose(files) { const list = Array.from(files || []); if (!list.length) return; setUploading(true); setStatus(`Uploading ${list.length} file${list.length === 1 ? "" : "s"}...`); try { const urls = []; for (const file of list) { const body = await uploadUserFile(file, "files-media"); if (body?.url) urls.push(body.url); } onChange([...links, ...urls].join("\n")); setStatus(`${urls.length} file${urls.length === 1 ? "" : "s"} uploaded. Save changes to apply.`); notify("success", "Uploaded", `${urls.length} file${urls.length === 1 ? "" : "s"} uploaded.`); } catch (err) { setStatus(err.message); notify("error", "Upload failed", err.message); } finally { setUploading(false); } }
  function insert() { const clean = text(link); if (!clean) return; onChange([...links, clean].join("\n")); setLink(""); setStatus("Link inserted. Save changes to apply it."); }
  return <div className="ua-form-field ua-form-field--wide ua-upload-field ua-upload-field--files"><span>{field.name}</span><textarea className="ua-files-raw" rows="4" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${field.name} raw links`}/><div className="ua-file-chip-list">{links.length ? links.map((url, index) => <a className="ua-file-chip" href={url} target="_blank" rel="noopener noreferrer" title={url} key={`${url}-${index}`}><UAIcon name="paperclip"/><span>{fileLabel(url, index)}</span></a>) : <div className="ua-file-chip-empty">No files or links yet.</div>}</div><div className="ua-upload-row"><label className="ua-file-pick ua-file-pick--small"><UAIcon name="paperclip"/><span>{uploading ? "Uploading..." : "Upload file"}</span><input type="file" multiple disabled={uploading} onChange={(event) => { choose(event.target.files); event.target.value = ""; }}/></label><input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="Insert external link"/><button type="button" className="ua-mini-btn" onClick={insert}>Insert link</button></div><small>{status}</small></div>;
}

function PageAccessManager({ summary, onOpen }) {
  return <div className="ua-form-field ua-form-field--wide ua-page-access-field"><span>Allowed Pages</span><div className="ua-page-access-card"><div><strong>Page access</strong><small>{summary}</small></div><button type="button" className="ua-page-access-open" onClick={onOpen}><UAIcon name="shield"/><span>Manage Access</span></button></div></div>;
}
function SvAccessManager({ summary, onOpen, hidden }) {
  if (hidden) return null;
  return <div className="ua-form-field ua-form-field--wide ua-sv-access-field"><span>Orders Supervision</span><div className="ua-page-access-card ua-sv-access-card"><div><strong>Orders Supervision</strong><small>{summary}</small></div><button type="button" className="ua-page-access-open" onClick={onOpen}><UAIcon name="users"/><span>Manage Users</span></button></div></div>;
}

function SchoolField({ field, value, onChange, notify }) {
  const [newName, setNewName] = useState(""); const [busy, setBusy] = useState(false); const [localOptions, setLocalOptions] = useState(() => unique([value, ...(field.options || [])].filter(Boolean)));
  async function addSchool() { const clean = text(newName); if (!clean) return notify("warning", "Missing school", "Enter the new school / column name first."); setBusy(true); try { const body = await requestJson("/api/user-access/stocktaking-columns", { method: "POST", body: JSON.stringify({ name: clean }) }); const label = body.label || clean; setLocalOptions((current) => unique([label, ...current])); onChange(label); setNewName(""); notify("success", "School added", `${label} was added to Stocktaking.`); } catch (err) { notify("error", "Could not add school", err.message); } finally { setBusy(false); } }
  const footer = <div className="ua-inline-add ua-modern-select-add" onClick={(event) => event.stopPropagation()}><input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Add new Stocktaking column"/><button type="button" className="ua-mini-btn" onClick={addSchool} disabled={busy}>{busy ? "Adding..." : "Add column"}</button><small>All Stocktaking table columns are shown here.</small></div>;
  return <div className="ua-form-field ua-form-field--wide ua-form-field--modern-select ua-form-field--school"><span>Stocktaking</span><ModernSelect value={value} onChange={onChange} options={localOptions} placeholder="Select stocktaking column" footer={footer}/></div>;
}

function accessSummaryText(rows, member) {
  if (rows?.length) { const enabled = rows.filter((row) => row.isEnabled); const admins = enabled.filter((row) => row.accessLevel === "admin"); if (!enabled.length) return "No pages enabled yet. Open the access window to configure permissions."; return `${enabled.length} enabled page${enabled.length === 1 ? "" : "s"}${admins.length ? ` • ${admins.length} admin` : ""}`; }
  const count = Number(member?.pageAccessSummary?.accessCount || 0); const admins = Number(member?.pageAccessSummary?.adminCount || 0); if (!count) return "No pages enabled yet. Open the access window to configure permissions."; return `${count} enabled page${count === 1 ? "" : "s"}${admins ? ` • ${admins} admin` : ""}`;
}
function svSummaryText(rows, member) { const count = rows?.length ? rows.filter((row) => row.isEnabled).length : Number(member?.svAccessSummary?.enabledCount || member?.svAccessSummary?.accessCount || splitValues(fieldValue(member, "S.V Schools")).length || 0); return count ? `${count} visible team member${count === 1 ? "" : "s"} for Orders Review` : "No team members enabled yet. Orders Review will not show orders for this user."; }

function memberHasPage(member, rows, pageName) {
  if (rows?.length) return rows.some((row) => row.isEnabled && accessRowMatchesPage(row, pageName));
  const allowed = unique([...(member?.pageAccessSummary?.allowedPages || []), ...splitValues(fieldValue(member, "Allowed Pages"))]);
  return allowed.some((item) => pageToken(item) === pageToken(pageName));
}

function MemberForm({ member, selectedDepartment, editableFields, departments, pageAccessRows, svRows, onOpenPageAccess, onOpenSvAccess, onClose, onSaved, notify }) {
  const schema = useMemo(() => orderEditableFieldsForForm(editableFields.length ? editableFields : [
    { name: "Profile picture", type: "ua_profile_upload" }, { name: "Employee Code", type: "text" }, { name: "Name", type: "title", required: true }, { name: "Password", type: "rich_text" }, { name: "Phone", type: "phone_number" }, { name: "Email", type: "email" }, { name: "Department", type: "select" }, { name: "Position", type: "text" }, { name: "Files & media", type: "ua_file_links" }, { name: "S.V Schools", type: "ua_sv_access_manager" }, { name: "Allowed Pages", type: "ua_page_access_manager" }, { name: "School", type: "school_select" },
  ]), [editableFields]);
  const [values, setValues] = useState(() => Object.fromEntries(schema.map((field) => [field.name, member ? fieldValue(member, field.name) : (fieldKey(field.name) === "department" ? selectedDepartment?.name || "" : "")])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const isEdit = !!member; const hasOrdersReview = memberHasPage(member, pageAccessRows, "Orders Review"); const hasSchoolPages = ["Stocktaking", "Current Orders", "Shopping Cart"].some((name) => memberHasPage(member, pageAccessRows, name));
  function setField(name, value) { setValues((current) => ({ ...current, [name]: value })); }
  async function submit(event) { event.preventDefault(); const nameField = schema.find((field) => fieldKey(field.name) === "name")?.name || "Name"; if (!text(values[nameField])) return setError("Please enter the team member name."); setBusy(true); setError(""); try { const endpoint = isEdit ? `/api/user-access/team-members/${encodeURIComponent(member.id)}` : "/api/user-access/team-members"; const fields = { ...values }; for (const field of schema) { if (["ua_page_access_manager", "ua_sv_access_manager"].includes(field.type) || ["allowedpages", "svschools"].includes(fieldKey(field.name))) delete fields[field.name]; } const body = await requestJson(endpoint, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify({ fields }) }); const savedMember = body.member || member; if (!isEdit && savedMember?.id && pageAccessRows?.length) await requestJson(`/api/user-access/team-members/${encodeURIComponent(savedMember.id)}/page-access`, { method: "PATCH", body: JSON.stringify({ pages: pageAccessRows.map((row) => ({ pageId: row.pageId, pageKey: row.pageKey, isEnabled: !!row.isEnabled, accessLevel: row.accessLevel })) }) }); if (!isEdit && savedMember?.id && hasOrdersReview && svRows?.length) await requestJson(`/api/user-access/team-members/${encodeURIComponent(savedMember.id)}/sv-access`, { method: "PATCH", body: JSON.stringify({ members: svRows.filter((row) => row.isEnabled).map((row) => ({ memberId: row.memberId })) }) }); await onSaved(body); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  function renderField(field) {
    const key = fieldKey(field.name); const value = values[field.name] ?? ""; const type = field.type || "rich_text";
    if (type === "ua_page_access_manager" || key === "allowedpages") return <PageAccessManager key={field.name} summary={accessSummaryText(pageAccessRows, member)} onOpen={onOpenPageAccess}/>;
    if (type === "ua_sv_access_manager" || key === "svschools") return <SvAccessManager key={field.name} summary={svSummaryText(svRows, member)} onOpen={onOpenSvAccess} hidden={!hasOrdersReview}/>;
    if (type === "school_select" || key === "school") return hasSchoolPages ? <SchoolField key={field.name} field={field} value={value} onChange={(next) => setField(field.name, next)} notify={notify}/> : null;
    if (type === "ua_profile_upload" || key === "profilepicture") return <ProfileUploadField key={field.name} field={field} value={value} onChange={(next) => setField(field.name, next)} notify={notify}/>;
    if (type === "ua_file_links" || key === "filesmedia" || type === "files") return <FileLinksField key={field.name} field={field} value={value} onChange={(next) => setField(field.name, next)} notify={notify}/>;
    if (type === "ua_multi_select" || type === "multi_select" || type === "relation") return <MultiSelectField key={field.name} field={{ ...field, allowCustom: type === "relation" ? false : field.allowCustom }} value={value} onChange={(next) => setField(field.name, next)}/>;
    if (key === "department" || ((type === "select" || type === "status") && Array.isArray(field.options) && field.options.length)) { const options = key === "department" ? departments.map((item) => item.name) : field.options; return <div className="ua-form-field ua-form-field--modern-select" key={field.name}><span>{field.name}</span><ModernSelect value={value} onChange={(next) => setField(field.name, next)} options={options} placeholder={`Select ${field.name}`}/></div>; }
    if (type === "checkbox") return <div className="ua-form-field ua-form-field--modern-select" key={field.name}><span>{field.name}</span><ModernSelect value={/^(yes|true|1)$/i.test(String(value)) ? "Yes" : "No"} onChange={(next) => setField(field.name, next)} options={["No", "Yes"]} placeholder={`Select ${field.name}`}/></div>;
    if (key === "position") return <label className="ua-form-field ua-form-field--position-text" key={field.name}><span>{field.name}</span><input type="text" value={value} placeholder="Enter position" onChange={(event) => setField(field.name, event.target.value)}/></label>;
    const isLong = (type === "rich_text" || type === "text") && (String(value).length > 90 || /notes?|comment|address|description/i.test(field.name));
    if (isLong) return <label className="ua-form-field ua-form-field--wide" key={field.name}><span>{field.name}</span><textarea rows="3" value={value} onChange={(event) => setField(field.name, event.target.value)}/></label>;
    const inputType = key === "password" ? "password" : type === "email" ? "email" : type === "number" ? "number" : type === "phone_number" ? "tel" : type === "date" ? "date" : "text";
    return <label className="ua-form-field" key={field.name}><span>{field.name}</span><input type={inputType} required={!!field.required || type === "title"} value={value} onChange={(event) => setField(field.name, event.target.value)}/></label>;
  }
  return <Modal title={isEdit ? "Edit Team Member" : "Add Team Member"} subtitle={isEdit ? `${member?.name || "User"} • Update user data.` : `${selectedDepartment?.name || "Department"} • Create a new Team Members record.`} onClose={onClose} modalClass="ua-modal--form" icon="user" closeDisabled={busy} zIndex={10000} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-member-form" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="save"/><span>{busy ? "Saving..." : isEdit ? "Save Changes" : "Create Member"}</span></button></>}><form id="ua-next-member-form" onSubmit={submit}><div className="ua-form-grid">{schema.map(renderField)}</div>{error ? <div className="ua-form-error">{error}</div> : null}</form></Modal>;
}

function MoveMemberModal({ member, departments, onClose, onSaved }) {
  const current = departments.find((department) => lower(department.name) === lower(member.department)); const [departmentId, setDepartmentId] = useState(current?.id || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const selected = departments.find((department) => department.id === departmentId);
  async function submit(event) { event.preventDefault(); if (!departmentId) return setError("Please select a target department."); if (lower(selected?.name) === lower(member.department)) return setError("This user is already inside this department."); setBusy(true); setError(""); try { const body = await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/department`, { method: "PATCH", body: JSON.stringify({ departmentId }) }); await onSaved(body, departmentId); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title="Move Member" subtitle={`Move ${member.name || "this user"} to another department.`} onClose={onClose} modalClass="ua-modal--small" compact icon="move" closeDisabled={busy} bodyClass="ua-modal__body--compact" footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-move-member" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="move"/><span>{busy ? "Moving..." : "Move"}</span></button></>}><form id="ua-next-move-member" onSubmit={submit}><div className="ua-form-field ua-form-field--wide ua-form-field--modern-select"><span>Target Department</span><ModernSelect value={selected?.name || ""} onChange={(name) => setDepartmentId(departments.find((department) => department.name === name)?.id || "")} options={departments.map((department) => department.name)} placeholder="Choose department"/></div><div className="ua-form-error">{error}</div></form></Modal>;
}

function PageAccessRow({ row, onChange, subpage = false }) {
  return <div className={`ua-page-access-row ${row.isEnabled ? "" : "is-disabled"}${subpage ? " ua-page-access-row--subpage" : ""}`}><div className="ua-page-access-name"><strong>{subpage ? <span className="ua-page-access-branch" aria-hidden="true"/> : null}{row.pageName}</strong><small>{row.moduleName}{row.routePath ? ` • ${row.routePath}` : ""}</small></div><div><ModernSelect compact value={accessLevelLabel(row.accessLevel)} onChange={(label) => onChange({ accessLevel: lower(label) })} options={["View", "Edit", "Admin"]} placeholder="Select access" ariaLabel={`Access type for ${row.pageName}`}/></div><div className="ua-page-access-enable"><label className="ua-switch" title={`Enable ${row.pageName}`}><input type="checkbox" checked={!!row.isEnabled} onChange={(event) => onChange({ isEnabled: event.target.checked })}/><span/></label></div></div>;
}

function PageAccessModal({ member, draftRows, onDraftRows, onClose, onSaved, protect }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const isCreate = !member;
  useEffect(() => { let active = true; (async () => { try { if (isCreate && draftRows?.length) { if (active) setRows(normalizeAccessRows(draftRows)); return; } const body = isCreate ? await requestJson("/api/user-access/pages") : await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/page-access`); const nextRows = isCreate ? normalizeAccessRows((body.pages || []).map((page) => ({ ...page, accessLevel: "edit", isEnabled: false }))) : normalizeAccessRows(body.pages || []); if (active) setRows(nextRows); } catch (err) { if (active) setError(err.message); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [member?.id]);
  function patch(index, values) { setRows((current) => current.map((row, i) => i === index ? { ...row, ...values, accessLevel: values.accessLevel ? normalizeAccessLevel(values.accessLevel) : row.accessLevel } : row)); }
  async function save() { if (loading || busy) return; if (isCreate) { onDraftRows(rows); onSaved?.(rows); onClose(); return; } protect({ title: "Save page access", message: `Apply this page-access matrix to ${member.name}?` }, async () => { setBusy(true); setError(""); try { const body = await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/page-access`, { method: "PATCH", body: JSON.stringify({ pages: rows.map((row) => ({ pageId: row.pageId, pageKey: row.pageKey, isEnabled: !!row.isEnabled, accessLevel: row.accessLevel })) }) }); const saved = normalizeAccessRows(body.pages || rows); setRows(saved); await onSaved?.(saved, body.summary); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }); }
  const events = new Set(["event-calendar", "event-requests", "event-components"]); const tasks = new Set(["task-management-all-tasks", "task-management-my-tasks", "task-management-delegated-tasks", "all-tasks", "my-tasks", "delegated-tasks"]); const b2c = new Set(["b2c-customer-database", "customer-database", "b2c-customer-form", "customer-form"]);
  function inSet(row, set) { return set.has(lower(row.pageKey)); }
  const eventRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, events)); const taskRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, tasks)); const b2cRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, b2c));
  const firstEvent = eventRows[0]?.index; const firstTask = taskRows[0]?.index; const firstB2c = b2cRows[0]?.index;
  const markup = []; rows.forEach((row, index) => { if (index === firstEvent) markup.push(<section className="ua-page-access-group ua-page-access-group--events" key="events-group"><div className="ua-page-access-group__heading"><UAIcon name="calendar"/><span>Events</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{eventRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (index === firstTask) markup.push(<section className="ua-page-access-group ua-page-access-group--task-management" key="task-group"><div className="ua-page-access-group__heading"><UAIcon name="branch"/><span>Task Management</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{taskRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (index === firstB2c) markup.push(<section className="ua-page-access-group ua-page-access-group--b2c" key="b2c-group"><div className="ua-page-access-group__heading"><UAIcon name="users"/><span>B2C</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{b2cRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (!inSet(row, events) && !inSet(row, tasks) && !inSet(row, b2c)) markup.push(<PageAccessRow key={row.pageId || row.pageKey} row={row} onChange={(values) => patch(index, values)}/>); });
  return <Modal title="Page Access" subtitle={`Configure page access for ${isCreate ? "new team member" : member?.name || "this team member"}.`} onClose={onClose} modalClass="ua-modal--page-access" compact icon="shield" closeDisabled={busy} bodyClass="ua-page-access-body" zIndex={10020} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Access"}</span></button></>}><div className="ua-page-access-head"><div>Page name</div><div>Access type</div><div>Enable</div></div><div className="ua-page-access-list">{loading ? <div className="ua-page-access-loading"><span/> Loading pages...</div> : markup}</div>{error ? <div className="ua-form-error ua-page-access-error">{error}</div> : null}</Modal>;
}

function SvAccessModal({ member, allMembers, draftRows, onDraftRows, onClose, onSaved, protect }) {
  const [rows, setRows] = useState([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const isCreate = !member;
  useEffect(() => { let active = true; (async () => { try { if (isCreate) { const base = draftRows?.length ? normalizeSvRows(draftRows) : normalizeSvRows(allMembers.map((item) => ({ memberId: item.id, name: item.name, department: item.department, position: item.position, email: item.email, photoUrl: item.photoUrl, isEnabled: false }))); if (active) setRows(base); return; } const body = await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/sv-access`); if (active) setRows(normalizeSvRows(body.members || body.rows || [])); } catch (err) { if (active) setError(err.message); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [member?.id]);
  const visible = rows.filter((row) => !search || lower(`${row.name} ${row.department} ${row.position} ${row.email}`).includes(lower(search)));
  function toggle(id, enabled) { setRows((current) => current.map((row) => row.memberId === id ? { ...row, isEnabled: enabled } : row)); }
  function enableVisible() { const ids = new Set(visible.map((row) => row.memberId)); setRows((current) => current.map((row) => ids.has(row.memberId) ? { ...row, isEnabled: true } : row)); }
  async function save() { if (isCreate) { onDraftRows(rows); await onSaved?.(rows); onClose(); return; } protect({ title: "Save Orders Review visibility", message: `Update which team members ${member.name} can see in Orders Review?` }, async () => { setBusy(true); setError(""); try { const body = await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/sv-access`, { method: "PATCH", body: JSON.stringify({ members: rows.filter((row) => row.isEnabled).map((row) => ({ memberId: row.memberId })) }) }); const saved = normalizeSvRows(body.members || rows); setRows(saved); await onSaved?.(saved, body.summary); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }); }
  return <Modal title="Orders Supervision" subtitle={`Enable team members whose orders should be visible to ${isCreate ? "the new user" : member?.name || "this user"} in Orders Review.`} onClose={onClose} modalClass="ua-modal--sv-access" compact icon="users" closeDisabled={busy} bodyClass="ua-sv-access-body" zIndex={10020} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Users"}</span></button></>}><div className="ua-sv-access-tools"><label className="ua-sv-search"><UAIcon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team members..." autoComplete="off"/></label><button type="button" className="ua-mini-btn" onClick={enableVisible} disabled={loading || busy}>Enable all visible</button></div>{loading ? <div className="ua-page-access-loading"><span/> Loading team members...</div> : null}{error ? <div className="ua-form-error">{error}</div> : null}{!loading ? <div className="ua-sv-access-list">{visible.length ? visible.map((row) => <div className={`ua-sv-access-row ${row.isEnabled ? "is-enabled" : ""}`} key={row.memberId}><div className="ua-sv-access-person"><Avatar member={row} small/><div><strong><span className="ua-sv-access-name">{row.name}</span>{row.isSelf ? <span className="ua-sv-self-badge">This user</span> : null}</strong><small>{[row.department, row.position].filter(Boolean).join(" • ") || row.email || "Team member"}</small></div></div><label className="ua-switch" title={`Enable ${row.name}`}><input type="checkbox" checked={row.isEnabled} onChange={(event) => toggle(row.memberId, event.target.checked)}/><span/></label></div>) : <div className="ua-empty">Sorry, No data available</div>}</div> : null}</Modal>;
}

export default function UsersCenterClient({ initialDirectory, initialSignupRequests, bootstrapWarnings = [] }) {
  const [directory, setDirectory] = useState(() => normalizeDirectory(initialDirectory));
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(""); const [search, setSearch] = useState(""); const [toast, setToast] = useState(null); const [passwordAction, setPasswordAction] = useState(null); const [confirm, setConfirm] = useState(null); const [departmentForm, setDepartmentForm] = useState(null); const [memberForm, setMemberForm] = useState(null); const [moveMember, setMoveMember] = useState(null); const [signupOpen, setSignupOpen] = useState(false); const [pendingSignupCount, setPendingSignupCount] = useState((initialSignupRequests?.requests || []).length); const [memberMenu, setMemberMenu] = useState(""); const [pageAccessOpen, setPageAccessOpen] = useState(false); const [svAccessOpen, setSvAccessOpen] = useState(false); const [pageAccessRows, setPageAccessRows] = useState([]); const [svRows, setSvRows] = useState([]);
  const selectedDepartment = directory.departments.find((department) => department.id === selectedDepartmentId) || null;
  const allMembers = useMemo(() => directory.departments.flatMap((department) => department.members || []), [directory]);
  const positionOptions = useMemo(() => unique(allMembers.map((member) => member.position)).sort((a, b) => a.localeCompare(b)), [allMembers]);
  const filteredDepartments = useMemo(() => { const q = lower(search); if (!q) return directory.departments; return directory.departments.filter((department) => lower(`${department.name} ${(department.members || []).map((member) => `${member.name} ${member.email} ${member.phone} ${member.employeeCode}`).join(" ")}`).includes(q)); }, [directory, search]);
  const filteredMembers = useMemo(() => { if (!selectedDepartment) return []; const q = lower(search); return sortByName((selectedDepartment.members || []).filter((member) => !q || lower(`${member.name} ${member.position} ${member.email} ${member.phone} ${member.employeeCode}`).includes(q))); }, [selectedDepartment, search]);

  function notify(type, title, message) { setToast({ type, title, message }); window.clearTimeout(notify._timer); notify._timer = window.setTimeout(() => setToast(null), 3500); }
  async function refresh() { const body = await requestJson(`/api/user-access/team-members?_fresh=1&_refresh=${Date.now()}`, { headers: { "X-Ops-Hard-Refresh": "1" } }); const next = normalizeDirectory(body); setDirectory(next); return next; }
  async function refreshPending() { try { const body = await requestJson(`/api/user-access/signup-requests?status=pending&_=${Date.now()}`); setPendingSignupCount((body.requests || []).length); } catch {} }

  function writeDepartmentUrl(id, push = true) { if (typeof window === "undefined") return; const url = new URL(window.location.href); if (id) url.searchParams.set("department", id); else url.searchParams.delete("department"); const next = `${url.pathname}${url.search}${url.hash}`; if (push) window.history.pushState({}, "", next); else window.history.replaceState({}, "", next); }
  function navigateDepartment(id, push = true) { setSelectedDepartmentId(id || ""); setSearch(""); writeDepartmentUrl(id, push); window.setTimeout(() => document.querySelector(".ua-members-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }
  function backDepartments(push = true) { setSelectedDepartmentId(""); setSearch(""); writeDepartmentUrl("", push); }

  useEffect(() => { const read = () => { const id = new URLSearchParams(window.location.search).get("department") || ""; if (id && directory.departments.some((department) => department.id === id)) setSelectedDepartmentId(id); else setSelectedDepartmentId(""); }; read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, [directory.departments.length]);
  useEffect(() => { const input = document.querySelector(".classic-app-shell .main-header .searchbar input"); if (!input) return undefined; input.value = search; input.placeholder = selectedDepartment ? "Search users inside this department..." : "Search departments, users, emails..."; const handle = (event) => setSearch(event.target.value || ""); input.addEventListener("input", handle); return () => input.removeEventListener("input", handle); }, [selectedDepartmentId]);
  useEffect(() => { function close(event) { if (!event.target.closest(".ua-member-menu-wrap")) setMemberMenu(""); } document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, []);

  async function protect(descriptor, action) { try { const probe = await requestJson("/api/user-access/admin/verify", { method: "POST", body: "{}" }); if (probe?.ok) return await action(); return undefined; } catch (err) { if ([400, 401, 403].includes(err.status) && /password|required|invalid|verification/i.test(err.message)) setPasswordAction({ ...descriptor, action }); else notify("error", descriptor?.title || "Action failed", err.message); return undefined; } }
  function protectedOpen(descriptor, opener) { return protect(descriptor, async () => opener()); }
  function openMember(mode, member = null) { setPageAccessRows([]); setSvRows([]); setMemberForm({ mode, member }); }

  function deleteDepartment(department) { protectedOpen({ title: "Delete department", message: `Delete ${department.name}?` }, () => setConfirm({ danger: true, title: "Delete Department", message: Number(department.count || 0) ? `Delete ${department.name} department? ${department.count} user${Number(department.count) === 1 ? "" : "s"} will be moved to No Department.` : `Delete ${department.name} department?`, confirmLabel: "Delete Department", onConfirm: async () => { const body = await requestJson(`/api/user-access/departments/${encodeURIComponent(department.id)}`, { method: "DELETE" }); backDepartments(false); await refresh(); notify("success", "Department deleted", body.message || "Department deleted."); setConfirm(null); } })); }
  function deleteMember(member) { protectedOpen({ title: "Delete team member", message: `Delete ${member.name}?` }, () => setConfirm({ danger: true, title: "Delete Team Member", message: `Delete ${member.name || "this user"} permanently from Team Members? This action cannot be undone.`, confirmLabel: "Delete Member", onConfirm: async () => { const body = await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}`, { method: "DELETE" }); await refresh(); notify("success", "Member deleted", body.message || "Team member deleted."); setConfirm(null); } })); }

  return <section className="ua-page-body">
    <Toast value={toast} onClose={() => setToast(null)}/>
    {bootstrapWarnings.length ? <div className="ua-error">Some optional Users Center data loaded after the page opened. Refresh the page if a section looks incomplete.</div> : null}
    {!selectedDepartment ? <section className="ua-folders-panel"><div className="ua-section-head ua-section-head--folders ua-section-head--folders-actions-only"><div className="ua-folder-actions"><div className="ua-count-pill">{directory.departments.reduce((sum, department) => sum + Number(department.count || 0), 0)} {directory.total === 1 ? "user" : "users"}</div><button type="button" className="ua-dept-btn ua-dept-btn--requests" onClick={() => protectedOpen({ title: "Sign up requests", message: "Review account requests." }, () => setSignupOpen(true))}><UAIcon name="signup"/><span>Sign up requests</span>{pendingSignupCount ? <small>{pendingSignupCount}</small> : null}</button><button type="button" className="ua-dept-btn ua-dept-btn--add" onClick={() => protectedOpen({ title: "Create department", message: "Create a new department folder?" }, () => setDepartmentForm({ department: null }))}><UAIcon name="folderPlus"/><span>New Department</span></button></div></div>{!filteredDepartments.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-folders">{filteredDepartments.map((department) => { const count = Number(department.count || department.members?.length || 0); const canEdit = lower(department.name) !== "no department"; return <article className="ua-folder" key={department.id} role="button" tabIndex={0} aria-label={`Open ${department.name} department`} onClick={() => navigateDepartment(department.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigateDepartment(department.id); } }}><div className="ua-folder__main"><span className="ua-folder__icon"><UAIcon name="folder"/></span><span className="ua-folder__text"><span className="ua-folder__name" title={department.name}>{department.name}</span><span className="ua-folder__count">{count} {count === 1 ? "member" : "members"}{!count ? <span className="ua-folder__badge">Empty</span> : null}</span></span></div><div className="ua-folder__actions" onClick={(event) => event.stopPropagation()}><button type="button" className="ua-folder__edit" disabled={!canEdit} title={!canEdit ? "Default fallback department cannot be renamed" : undefined} onClick={() => protectedOpen({ title: "Rename department", message: `Rename ${department.name}?` }, () => setDepartmentForm({ department }))}><UAIcon name="edit"/><span>Edit</span></button><button type="button" className="ua-folder__delete" disabled={!canEdit} title={!canEdit ? "Default fallback department cannot be deleted" : undefined} onClick={() => deleteDepartment(department)}><UAIcon name="trash"/><span>Delete</span></button><span className="ua-folder__open" onClick={() => navigateDepartment(department.id)}><UAIcon name="chevron"/></span></div></article>; })}</div>}</section> : <section className="ua-members-panel"><div className="ua-section-head ua-section-head--members"><div className="ua-member-heading-left"><button type="button" className="ua-back-btn" onClick={() => backDepartments()} aria-label="Back to departments"><UAIcon name="back"/></button><div><h3>{selectedDepartment.name} Members</h3></div></div><div className="ua-members-actions"><button type="button" className="ua-add-member-btn" onClick={() => protectedOpen({ title: "Add team member", message: `Create a new account in ${selectedDepartment.name}?` }, () => openMember("create"))}><UAIcon name="addUser"/><span>Add Member</span></button></div></div>{!filteredMembers.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-members-grid">{filteredMembers.map((member) => <article className="ua-member-card" key={member.id}><div className="ua-member-card__top"><Avatar member={member}/><div className="ua-member-card__identity"><h4 title={member.name || "Unnamed"}>{member.name || "Unnamed"}</h4><p title={member.position || "Team Member"}>{member.position || "Team Member"}</p></div><div className="ua-member-menu-wrap"><button type="button" className="ua-member-menu-btn" aria-expanded={memberMenu === member.id} onClick={(event) => { event.stopPropagation(); setMemberMenu((current) => current === member.id ? "" : member.id); }} aria-label={`More actions for ${member.name || "user"}`}><span className="ua-member-menu-dots">•••</span></button><div className="ua-member-menu" hidden={memberMenu !== member.id}><button type="button" onClick={() => { setMemberMenu(""); protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member)); }}><UAIcon name="move"/><span>Move</span></button><button type="button" className="is-danger" onClick={() => { setMemberMenu(""); deleteMember(member); }}><UAIcon name="trash"/><span>Delete</span></button></div></div></div><div className="ua-member-card__meta"><div className="ua-meta-line" title={member.employeeCode || "No employee code"}><UAIcon name="hash"/><span>{member.employeeCode || "No employee code"}</span></div><div className="ua-meta-line" title={member.phone || "No phone"}><UAIcon name="phone"/><span>{member.phone || "No phone"}</span></div><div className="ua-meta-line" title={member.email || "No email"}><UAIcon name="mail"/><span>{member.email || "No email"}</span></div></div><div className="ua-member-card__actions"><button type="button" className="ua-btn ua-btn--dark" onClick={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => openMember("edit", member))}><UAIcon name="edit"/><span>Edit</span></button></div></article>)}</div>}</section>}

    {passwordAction ? <PasswordModal action={passwordAction} onClose={() => setPasswordAction(null)} onVerified={async () => { const action = passwordAction.action; setPasswordAction(null); try { await action(); } catch (err) { notify("error", "Action failed", err.message); } }}/> : null}
    {confirm ? <ConfirmModal value={confirm} onClose={() => setConfirm(null)}/> : null}
    {departmentForm ? <DepartmentForm department={departmentForm.department} onClose={() => setDepartmentForm(null)} onSaved={async (body) => { const next = await refresh(); const createdId = text(body?.department?.id || body?.departmentId); if (!departmentForm.department && createdId && next.departments.some((department) => department.id === createdId)) navigateDepartment(createdId); notify("success", departmentForm.department ? "Department updated" : "Department added", body?.message || "Department saved."); }}/> : null}
    {memberForm ? <MemberForm member={memberForm.member} selectedDepartment={selectedDepartment} editableFields={directory.editableFields} departments={directory.departments} pageAccessRows={pageAccessRows} svRows={svRows} notify={notify} onOpenPageAccess={() => setPageAccessOpen(true)} onOpenSvAccess={() => setSvAccessOpen(true)} onClose={() => { setMemberForm(null); setPageAccessRows([]); setSvRows([]); }} onSaved={async () => { await refresh(); notify("success", memberForm.member ? "Updated" : "Created", memberForm.member ? "Team member data updated." : "New team member added."); }}/> : null}
    {moveMember ? <MoveMemberModal member={moveMember} departments={directory.departments} onClose={() => setMoveMember(null)} onSaved={async (body, targetId) => { await refresh(); navigateDepartment(targetId); notify("success", "Member moved", body?.message || "Team member moved successfully."); }}/> : null}
    {pageAccessOpen && memberForm ? <PageAccessModal member={memberForm.member} draftRows={pageAccessRows} onDraftRows={setPageAccessRows} onClose={() => setPageAccessOpen(false)} protect={protect} onSaved={async (rows) => { setPageAccessRows(rows); if (memberForm.member) await refresh(); notify("success", memberForm.member ? "Page access updated" : "Page access prepared", memberForm.member ? "Page permissions were saved." : "Page access will be saved after creating the member."); }}/> : null}
    {svAccessOpen && memberForm ? <SvAccessModal member={memberForm.member} allMembers={allMembers} draftRows={svRows} onDraftRows={setSvRows} onClose={() => setSvAccessOpen(false)} protect={protect} onSaved={async (rows) => { setSvRows(rows); if (memberForm.member) await refresh(); notify("success", memberForm.member ? "Orders Supervision updated" : "Orders Supervision prepared", memberForm.member ? "Orders Review visibility was saved." : "Orders Review visibility will be saved after creating the member."); }}/> : null}
    {signupOpen ? <SignupRequestsModal departments={directory.departments} positions={positionOptions} onClose={() => setSignupOpen(false)} notify={notify} onChanged={async () => { await Promise.all([refresh(), refreshPending()]); }}/> : null}
  </section>;
}
