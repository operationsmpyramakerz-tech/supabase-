"use client";

import { EVENT_REQUEST_SCOPE_MARKER } from "../../lib/event-request-scope.mjs";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import { DeleteConfirmDialog, DeleteVerificationDialog } from "../shared/SystemDeleteDialogs";
import { cacheUsersCenterAuthorization, currentUsersCenterAuthorizationToken, requestJson, usersCenterMutation } from "./usersCenterClientShared";
import { TASK_SCOPE_MARKER } from "../../lib/task-data-scope.mjs";
import { FEATURE_DEFINITIONS, ACTIVE_PILOT_FEATURE_KEYS, OPTIONAL_FEATURE_FALLBACKS, LEGACY_DEFAULT_FEATURE_KEYS, MY_ORDERS_ENFORCEMENT_MARKER, PHASE2A_LEGACY_MARKERS, ORDER_SCOPE_MARKERS } from "../../lib/feature-permissions-registry";
import { permissionDraft, permissionDraftChanges, modulePermissionStatus } from "../../lib/feature-permissions-ui.mjs";

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
function fileLabel(url, index) { let label = ""; try { const parsed = new URL(url); label = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "") || parsed.hostname; } catch { label = String(url || "").split("/").filter(Boolean).pop() || ""; } label = label.replace(/^\d+-[a-f0-9]+-/i, "").replace(/[_-]?image_?\d*/i, "").trim(); return !label || label.length > 48 ? `File ${index + 1}` : label; }
function normalizeMediaEntry(item, index = 0) {
  if (!item) return null;
  if (typeof item === "string") { const url = text(item); return url ? { name: fileLabel(url, index), url } : null; }
  const url = text(item?.url || item?.href || item?.publicUrl || item?.public_url);
  if (!url) return null;
  const hasExplicitName = Object.prototype.hasOwnProperty.call(item, "name");
  const explicitName = hasExplicitName ? String(item?.name ?? "") : text(item?.label || item?.title || item?.filename);
  return { name: hasExplicitName ? explicitName : (explicitName || fileLabel(url, index)), url };
}
function parseMediaEntries(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const entries = list.map((item, index) => normalizeMediaEntry(item, index)).filter(Boolean);
    if (entries.length) return entries;
  } catch {}
  return raw.split(/\n+/).map((item, index) => normalizeMediaEntry(item, index)).filter(Boolean);
}
function serializeMediaEntries(entries) {
  const clean = (Array.isArray(entries) ? entries : []).map((item, index) => {
    const url = text(item?.url);
    if (!url) return null;
    return { name: String(item?.name ?? ""), url };
  }).filter(Boolean);
  return clean.length ? JSON.stringify(clean) : "";
}

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
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
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
  async function verifyPassword(cleanPassword) { if (!text(cleanPassword)) return setError("Please enter the Admin password."); setBusy(true); setError(""); try { const verified = await requestJson("/next/api/users-center/admin/verify", { method: "POST", body: JSON.stringify({ password: cleanPassword }) }); cacheUsersCenterAuthorization(verified); await onVerified(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function submit(event) { event.preventDefault(); await verifyPassword(password); }
  const isDelete = /^delete\b/i.test(text(action?.title));
  if (isDelete) return <DeleteVerificationDialog title={action?.title || "Delete item"} password={password} onPasswordChange={setPassword} busy={busy} error={error} onCancel={onClose} onSubmit={verifyPassword} />;
  return <Modal title="Admin Verification" onClose={onClose} modalClass="ua-modal--small" compact icon="lock" closeDisabled={busy} bodyClass="ua-modal__body--compact" zIndex={10090} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-admin-password-form" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="unlock"/><span>{busy ? "Checking..." : "Continue"}</span></button></>}>
    <form id="ua-next-admin-password-form" onSubmit={submit}><label className="ua-form-field ua-form-field--wide"><span>Admin Password</span><input autoFocus type="password" autoComplete="current-password" placeholder="Enter Admin password" value={password} onChange={(event) => setPassword(event.target.value)}/></label><div className="ua-form-error">{error}</div></form>
  </Modal>;
}

function ConfirmModal({ value, onClose }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function confirm() { if (busy) return; setBusy(true); setError(""); try { await value?.onConfirm?.(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  if (value?.danger) return <DeleteConfirmDialog title={value?.title || "Delete item?"} message={value?.message || "This action cannot be undone."} busy={busy} error={error} onCancel={onClose} onConfirm={confirm} confirmLabel={value?.confirmLabel || "Yes, Delete!"} />;
  return <Modal title={value?.title || "Confirm action"} subtitle={value?.message || "Are you sure?"} onClose={onClose} modalClass="ua-modal--small ua-confirm-modal" compact icon="alert" closeDisabled={busy} zIndex={10050} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={confirm} disabled={busy}><UAIcon name="check"/><span>{busy ? "Working..." : (value?.confirmLabel || "Confirm")}</span></button></>}>{error ? <div className="ua-form-error">{error}</div> : null}</Modal>;
}

function Avatar({ member, small = false }) {
  const cls = `ua-avatar${small ? " ua-avatar--small" : ""}`;
  return member?.photoUrl ? <div className={cls}><img src={member.photoUrl} alt={member.name || "User"} loading="lazy"/></div> : <div className={cls}>{initials(member?.name)}</div>;
}


async function readRawFileAsDataUrl(file) { return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Failed to read file.")); reader.readAsDataURL(file); }); }
function shouldCompressImage(file) { const type = lower(file?.type); const name = lower(file?.name); if (type === "image/gif" || type === "image/svg+xml" || /\.(gif|svg)$/i.test(name)) return false; return type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name); }
async function compressDataUrl(file, raw) { if (!shouldCompressImage(file)) return raw; try { const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Failed to load image for compression.")); img.src = raw; }); const ratio = Math.min(1, 1400 / Math.max(1, image.naturalWidth || image.width), 1400 / Math.max(1, image.naturalHeight || image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio)); canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio)); const context = canvas.getContext("2d", { alpha: true }); context.drawImage(image, 0, 0, canvas.width, canvas.height); let compressed = canvas.toDataURL("image/webp", .74); if (!/^data:image\/webp/i.test(compressed)) compressed = canvas.toDataURL("image/jpeg", .76); return compressed && compressed.length < raw.length ? compressed : raw; } catch { return raw; } }
async function uploadUserFile(file, kind) {
  if (!file) return null;
  if (file.size > 12 * 1024 * 1024) throw new Error("File is too large. Maximum size is 12MB.");
  const authorizationToken = currentUsersCenterAuthorizationToken();
  if (!authorizationToken) throw new Error("Admin verification expired. Please enter the Admin password first.");
  let blob = file;
  let compressed = false;
  if (shouldCompressImage(file)) {
    const raw = await readRawFileAsDataUrl(file);
    const dataUrl = await compressDataUrl(file, raw);
    if (dataUrl !== raw) { blob = await fetch(dataUrl).then((response) => response.blob()); compressed = true; }
  }
  const originalName = file.name || "upload.bin";
  const compressedExtension = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "";
  const filename = compressed && compressedExtension ? `${originalName.replace(/\.[^.]+$/, "") || "image"}.${compressedExtension}` : originalName;
  const ticket = await requestJson("/next/api/users-center/upload-ticket", { method: "POST", body: JSON.stringify({ authorizationToken, filename, mime: blob.type || file.type || "application/octet-stream", size: blob.size, kind }) });
  const upload = await fetch(ticket.upload.signedUrl, { method: ticket.upload.method || "PUT", headers: ticket.upload.headers || {}, body: blob });
  if (!upload.ok) throw new Error(`Storage upload failed with status ${upload.status}.`);
  return { ok: true, url: ticket.upload.publicUrl || ticket.url, name: originalName, mime: blob.type || file.type || "application/octet-stream" };
}

function SignupRequestsModal({ departments, positions = [], onClose, onChanged, notify, canApprove = true, canReject = true }) {
  const [status, setStatus] = useState("pending"); const [requests, setRequests] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [approve, setApprove] = useState(null); const [rejecting, setRejecting] = useState(null); const [form, setForm] = useState({ department: "", position: "" }); const [busy, setBusy] = useState(false);
  async function load(nextStatus = status) { setLoading(true); setError(""); try { const body = await requestJson(`/next/api/users-center/signup-requests?status=${encodeURIComponent(nextStatus)}&fresh=1&_=${Date.now()}`); setRequests(body.requests || []); } catch (err) { setRequests([]); setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load("pending"); }, []);
  function beginApprove(request) { setApprove(request); setForm({ department: "", position: "" }); setError(""); }
  async function approveSubmit(event) { event.preventDefault(); if (!text(form.department) || !text(form.position)) return setError("Please select department and position."); setBusy(true); setError(""); try { const body = await usersCenterMutation("signup-approve", { requestId: approve.id, ...form }); setApprove(null); notify?.("success", "Request approved", body.emailWarning ? `Approved, but email warning: ${body.emailWarning}` : "The user was added and notified by email."); await Promise.all([load(status), onChanged()]); } catch (err) { setError(err.message); notify?.("error", "Approval failed", err.message); } finally { setBusy(false); } }
  async function rejectConfirmed() { if (!rejecting || busy) return; setBusy(true); setError(""); try { const body = await usersCenterMutation("signup-reject", { requestId: rejecting.id }); setRejecting(null); notify?.("success", "Request rejected", body.emailWarning ? `Rejected, but email warning: ${body.emailWarning}` : "The user was notified by email."); await Promise.all([load(status), onChanged()]); } catch (err) { setError(err.message); notify?.("error", "Reject failed", err.message); } finally { setBusy(false); } }
  const tabs = <div className="ua-signup-request-tabs" role="tablist" aria-label="Sign up request status filter">{["pending", "approved", "rejected"].map((item) => <button type="button" key={item} className={status === item ? "is-active" : ""} onClick={() => { setStatus(item); load(item); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
  const availableDepartments = departments.filter((department) => lower(department.name) !== "no department").map((department) => department.name).sort((a, b) => a.localeCompare(b));
  return <>
    <Modal title="Sign up requests" subtitle="Review account requests." onClose={onClose} modalClass="ua-modal--requests" compact icon="signup" beforeBody={tabs} bodyClass="ua-signup-requests-body" zIndex={10010}>
      {error && !approve && !rejecting ? <div className="ua-form-error">{error}</div> : null}
      {loading ? <div className="ua-loading-inline"><span/> Loading requests...</div> : null}
      {!loading && !requests.length ? <div className="ua-signup-empty"><UAIcon name={status === "rejected" ? "xCircle" : "checkCircle"}/><strong>No {status} requests</strong><span>No sign up requests found in this status.</span></div> : null}
      {!loading ? requests.map((request) => { const currentStatus = lower(request.status || status || "pending"); const details = [request.email, request.phone, formatDate(request.createdAt)].filter(Boolean).join(" • "); const review = [request.department, request.position, formatDate(request.reviewedAt)].filter(Boolean).join(" • "); return <article className={`ua-signup-request-card ua-signup-request-card--${currentStatus}`} key={request.id}><div className="ua-signup-request-main"><div className="ua-signup-request-avatar"><UAIcon name="user"/></div><div className="ua-signup-request-text"><strong title={request.username || "Unnamed"}>{request.username || "Unnamed"}</strong><span>Employee code: {request.employeeCode || "-"}</span><small>{details}</small>{review ? <small className="ua-signup-request-review">{review}</small> : null}</div></div>{currentStatus === "pending" ? <div className="ua-signup-request-actions">{canApprove ? <button type="button" className="ua-btn ua-btn--approve" onClick={() => beginApprove(request)}><UAIcon name="check"/><span>Approve</span></button> : null}{canReject ? <button type="button" className="ua-btn ua-btn--reject" onClick={() => { setError(""); setRejecting(request); }}><UAIcon name="close"/><span>Reject</span></button> : null}</div> : <div className={`ua-signup-request-status ua-signup-request-status--${currentStatus}`}><UAIcon name={currentStatus === "approved" ? "checkCircle" : "xCircle"}/><span>{currentStatus === "approved" ? "Approved" : "Rejected"}</span></div>}</article>; }) : null}
    </Modal>
    {approve ? <Modal title="Approve request" subtitle={`${approve.username || "User"} • ${approve.employeeCode || "No code"}`} onClose={() => setApprove(null)} modalClass="ua-modal--small" compact icon="checkCircle" closeDisabled={busy} bodyClass="ua-modal__body--compact" zIndex={10040} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={() => setApprove(null)} disabled={busy}>Cancel</button><button type="submit" form="ua-next-signup-approve" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="signup"/><span>{busy ? "Approving..." : "Approve"}</span></button></>}><form id="ua-next-signup-approve" onSubmit={approveSubmit}><div className="ua-form-field ua-form-field--wide ua-form-field--modern-select"><span>Department</span><ModernSelect value={form.department} onChange={(department) => setForm((current) => ({ ...current, department }))} options={availableDepartments} placeholder="Choose department" disabled={busy}/></div><label className="ua-form-field ua-form-field--wide"><span>Position</span><input type="text" list="ua-next-signup-position-options" placeholder="Example: Operations Team Leader" value={form.position} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}/><datalist id="ua-next-signup-position-options">{positions.map((position) => <option value={position} key={position}/>)}</datalist></label>{error ? <div className="ua-form-error ua-form-field--wide">{error}</div> : null}</form></Modal> : null}
    {rejecting ? <Modal title="Reject sign up request?" subtitle={`Reject ${rejecting.username || "this user"} sign up request?`} onClose={() => setRejecting(null)} modalClass="ua-modal--small ua-confirm-modal" compact icon="alert" dangerIcon closeDisabled={busy} zIndex={10040} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={() => setRejecting(null)} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--danger" onClick={rejectConfirmed} disabled={busy}><UAIcon name="close"/><span>{busy ? "Working..." : "Reject"}</span></button></>}>{error ? <div className="ua-form-error">{error}</div> : null}</Modal> : null}
  </>;
}

function DepartmentForm({ department, onClose, onSaved }) {
  const [name, setName] = useState(department?.name || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const isEdit = !!department;
  async function submit(event) { event.preventDefault(); const clean = text(name).replace(/\s+/g, " "); if (!clean) return setError("Department name is required."); setBusy(true); setError(""); try { const body = await usersCenterMutation(isEdit ? "department-update" : "department-create", { ...(isEdit ? { departmentId: department.id } : {}), name: clean }); await onSaved(body); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
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
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("Add a clear display name so this file or link is easy to recognize everywhere the user profile appears.");
  const [fileName, setFileName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [link, setLink] = useState("");
  const entries = useMemo(() => parseMediaEntries(value), [value]);

  function saveEntries(next) { onChange(serializeMediaEntries(next)); }
  function patchEntry(index, patch) { saveEntries(entries.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function removeEntry(index) { saveEntries(entries.filter((_, itemIndex) => itemIndex !== index)); setStatus("File or link removed. Save changes to apply it."); }

  async function choose(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    setStatus(`Uploading ${list.length} file${list.length === 1 ? "" : "s"}...`);
    try {
      const added = [];
      for (let index = 0; index < list.length; index += 1) {
        const file = list[index];
        const body = await uploadUserFile(file, "files-media");
        if (!body?.url) continue;
        const custom = text(fileName);
        const displayName = custom
          ? (list.length === 1 ? custom : `${custom} ${index + 1}`)
          : text(body?.name || file?.name) || fileLabel(body.url, entries.length + added.length);
        added.push({ name: displayName, url: body.url });
      }
      saveEntries([...entries, ...added]);
      setFileName("");
      setStatus(`${added.length} file${added.length === 1 ? "" : "s"} uploaded. Save changes to apply.`);
      notify("success", "Uploaded", `${added.length} file${added.length === 1 ? "" : "s"} uploaded.`);
    } catch (err) {
      setStatus(err.message);
      notify("error", "Upload failed", err.message);
    } finally { setUploading(false); }
  }

  function insert() {
    const cleanUrl = text(link);
    if (!cleanUrl) return notify("warning", "Missing link", "Paste the external link first.");
    if (!/^https?:\/\//i.test(cleanUrl)) return notify("warning", "Invalid link", "Use a full link starting with http:// or https://.");
    const displayName = text(linkName) || fileLabel(cleanUrl, entries.length);
    saveEntries([...entries, { name: displayName, url: cleanUrl }]);
    setLink("");
    setLinkName("");
    setStatus("Link added. Save changes to apply it.");
  }

  return <div className="ua-form-field ua-form-field--wide ua-upload-field ua-upload-field--files">
    <span>{field.name}</span>
    <textarea className="ua-files-raw" rows="4" value={value} readOnly aria-label={`${field.name} structured data`}/>
    <div className="ua-file-chip-list ua-media-entry-list">
      {entries.length ? entries.map((item, index) => <div className="ua-media-entry" key={`${item.url}-${index}`}>
        <div className="ua-media-entry__icon"><UAIcon name="paperclip"/></div>
        <div className="ua-media-entry__body">
          <label className="ua-media-entry__name"><span>Display name</span><input type="text" value={item.name} onChange={(event) => patchEntry(index, { name: event.target.value })} onBlur={(event) => { if (!text(event.target.value)) patchEntry(index, { name: fileLabel(item.url, index) }); }} placeholder="e.g. Location"/></label>
          <a className="ua-media-entry__url" href={item.url} target="_blank" rel="noopener noreferrer" title={item.url}>{item.url}</a>
        </div>
        <button type="button" className="ua-media-entry__remove" onClick={() => removeEntry(index)} aria-label={`Remove ${item.name || "file"}`} title="Remove"><UAIcon name="trash"/></button>
      </div>) : <div className="ua-file-chip-empty">No files or links yet.</div>}
    </div>
    <div className="ua-media-add-grid">
      <div className="ua-media-add-card">
        <div className="ua-media-add-card__heading"><UAIcon name="upload"/><div><strong>Upload file</strong><small>Add a custom name before choosing the file.</small></div></div>
        <input type="text" value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="File name (optional)"/>
        <label className="ua-file-pick ua-file-pick--small ua-file-pick--wide"><UAIcon name="paperclip"/><span>{uploading ? "Uploading..." : "Choose file"}</span><input type="file" multiple disabled={uploading} onChange={(event) => { choose(event.target.files); event.target.value = ""; }}/></label>
      </div>
      <div className="ua-media-add-card">
        <div className="ua-media-add-card__heading"><UAIcon name="paperclip"/><div><strong>External link</strong><small>Name links like Location, Drive folder, Contract, etc.</small></div></div>
        <input type="text" value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Link name (e.g. Location)"/>
        <div className="ua-media-link-row"><input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..."/><button type="button" className="ua-mini-btn" onClick={insert}>Add link</button></div>
      </div>
    </div>
    <small>{status}</small>
  </div>;
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
  async function addSchool() { const clean = text(newName); if (!clean) return notify("warning", "Missing school", "Enter the new school / column name first."); setBusy(true); try { const body = await usersCenterMutation("stocktaking-column-create", { name: clean }); const label = body.label || clean; setLocalOptions((current) => unique([label, ...current])); onChange(label); setNewName(""); notify("success", "School added", `${label} was added to Stocktaking.`); } catch (err) { notify("error", "Could not add school", err.message); } finally { setBusy(false); } }
  const footer = <div className="ua-inline-add ua-modern-select-add" onClick={(event) => event.stopPropagation()}><input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Add new Stocktaking column"/><button type="button" className="ua-mini-btn" onClick={addSchool} disabled={busy}>{busy ? "Adding..." : "Add column"}</button><small>All Stocktaking table columns are shown here.</small></div>;
  return <div className="ua-form-field ua-form-field--wide ua-form-field--modern-select ua-form-field--school"><span>Stocktaking</span><ModernSelect value={value} onChange={onChange} options={localOptions} placeholder="Select stocktaking column" footer={footer}/></div>;
}

function generatedStocktakingColumnName(name = "") {
  const clean = text(name).replace(/\s+/g, " ");
  return clean ? `${clean} Stock` : "";
}

function AutoStocktakingField({ value }) {
  return <label className="ua-form-field ua-form-field--wide ua-form-field--stock-auto"><span>Stocktaking</span><input type="text" value={value} readOnly aria-readonly="true"/><small>Created automatically from the user name.</small></label>;
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

function MemberForm({ member, selectedDepartment, editableFields, departments, pageAccessRows, svRows, onOpenPageAccess, onOpenSvAccess, onOpenFeatureAccess, onClose, onSaved, notify, access = {} }) {
  const schema = useMemo(() => orderEditableFieldsForForm(editableFields.length ? editableFields : [
    { name: "Profile picture", type: "ua_profile_upload" }, { name: "Employee Code", type: "text" }, { name: "Name", type: "title", required: true }, { name: "Password", type: "rich_text" }, { name: "Phone", type: "phone_number" }, { name: "Email", type: "email" }, { name: "Department", type: "select" }, { name: "Position", type: "text" }, { name: "Files & media", type: "ua_file_links" }, { name: "S.V Schools", type: "ua_sv_access_manager" }, { name: "Allowed Pages", type: "ua_page_access_manager" }, { name: "School", type: "school_select" },
  ]), [editableFields]);
  const [values, setValues] = useState(() => Object.fromEntries(schema.map((field) => [field.name, member ? fieldValue(member, field.name) : (fieldKey(field.name) === "department" ? selectedDepartment?.name || "" : "")])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const isEdit = !!member; const hasOrdersReview = memberHasPage(member, pageAccessRows, "Orders Review"); const hasStocktaking = memberHasPage(member, pageAccessRows, "Stocktaking"); const hasSchoolPages = ["Stocktaking", "Current Orders", "Shopping Cart"].some((name) => memberHasPage(member, pageAccessRows, name));
  const nameFieldName = schema.find((field) => fieldKey(field.name) === "name")?.name || "Name";
  const autoStocktakingColumn = generatedStocktakingColumnName(values[nameFieldName]);
  function setField(name, value) { setValues((current) => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault();
    const nameField = nameFieldName;
    if (!text(values[nameField])) return setError("Please enter the team member name.");

    setBusy(true);
    setError("");
    startActionLoading({
      title: isEdit ? "Saving team member" : "Creating team member",
      message: isEdit ? "Updating the user record…" : "Creating the account and applying access settings…",
    });

    try {
      const fields = { ...values };
      if (hasStocktaking && autoStocktakingColumn) {
        const schoolField = schema.find((field) => fieldKey(field.name) === "school");
        if (schoolField) fields[schoolField.name] = autoStocktakingColumn;
      }
      for (const field of schema) {
        if (["ua_page_access_manager", "ua_sv_access_manager"].includes(field.type) || ["allowedpages", "svschools"].includes(fieldKey(field.name))) delete fields[field.name];
      }

      const payload = { fields };
      if (!isEdit) {
        payload.pageAccess = (pageAccessRows || []).map((row) => ({
          pageId: row.pageId,
          pageKey: row.pageKey,
          isEnabled: !!row.isEnabled,
          accessLevel: row.accessLevel,
        }));
        payload.svAccess = hasOrdersReview
          ? (svRows || []).filter((row) => row.isEnabled).map((row) => ({ memberId: row.memberId }))
          : [];
      }

      const body = await usersCenterMutation(isEdit ? "member-update" : "member-create", { ...(isEdit ? { memberId: member.id } : {}), ...payload });

      // Refresh the directory in the background. It should not keep the user
      // waiting after the member and permissions have already been saved.
      try { onSaved?.(body); } catch {}

      await finishActionLoading(
        "done",
        isEdit ? "Team member updated successfully." : "Team member created successfully.",
      );
      onClose();
    } catch (err) {
      setError(err.message);
      await finishActionLoading("failed", err.message || "The team member could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function renderField(field) {
    const key = fieldKey(field.name); const value = values[field.name] ?? ""; const type = field.type || "rich_text";
    if (type === "ua_page_access_manager" || key === "allowedpages") {
      if (access.pageAccess) return <PageAccessManager key={field.name} summary={accessSummaryText(pageAccessRows, member)} onOpen={onOpenPageAccess}/>;
      if (access.featureAccess && member?.id) return <div key={field.name} className="ua-form-field ua-form-field--wide ua-sv-access-field">
        <span>Advanced Feature Permissions</span>
        <div className="ua-page-access-card ua-sv-access-card"><div><strong>Feature Access</strong><small>Configure this user's allowed actions individually.</small></div>
          <button type="button" className="ua-page-access-open" onClick={onOpenFeatureAccess}><UAIcon name="shield"/><span>Manage Features</span></button>
        </div>
      </div>;
      return null;
    }
    if (type === "ua_sv_access_manager" || key === "svschools") return access.svAccess ? <SvAccessManager key={field.name} summary={svSummaryText(svRows, member)} onOpen={onOpenSvAccess} hidden={!hasOrdersReview}/> : null;
    if (type === "school_select" || key === "school") { if (hasStocktaking) return <AutoStocktakingField key={field.name} value={autoStocktakingColumn}/>; return hasSchoolPages ? <SchoolField key={field.name} field={field} value={value} onChange={(next) => setField(field.name, next)} notify={notify}/> : null; }
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
  return <>
    <Modal title={isEdit ? "Edit Team Member" : "Add Team Member"} subtitle={isEdit ? `${member?.name || "User"} • Update user data.` : `${selectedDepartment?.name || "Department"} • Create a new Team Members record.`} onClose={onClose} modalClass="ua-modal--form" icon="user" closeDisabled={busy} zIndex={10000} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-member-form" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="save"/><span>{busy ? "Saving..." : isEdit ? "Save Changes" : "Create Member"}</span></button></>}><form id="ua-next-member-form" onSubmit={submit}><div className="ua-form-grid">{schema.map(renderField)}</div>{error ? <div className="ua-form-error">{error}</div> : null}</form></Modal>
    <ActionLoadingModal state={actionLoading} zIndex={12050} />
  </>;
}

function MoveMemberModal({ member, departments, onClose, onSaved }) {
  const current = departments.find((department) => lower(department.name) === lower(member.department)); const [departmentId, setDepartmentId] = useState(current?.id || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const selected = departments.find((department) => department.id === departmentId);
  async function submit(event) { event.preventDefault(); if (!departmentId) return setError("Please select a target department."); if (lower(selected?.name) === lower(member.department)) return setError("This user is already inside this department."); setBusy(true); setError(""); try { const body = await usersCenterMutation("member-move", { memberId: member.id, departmentId }); await onSaved(body, departmentId); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title="Move Member" subtitle={`Move ${member.name || "this user"} to another department.`} onClose={onClose} modalClass="ua-modal--small" compact icon="move" closeDisabled={busy} bodyClass="ua-modal__body--compact" footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="ua-next-move-member" className="ua-btn ua-btn--dark" disabled={busy}><UAIcon name="move"/><span>{busy ? "Moving..." : "Move"}</span></button></>}><form id="ua-next-move-member" onSubmit={submit}><div className="ua-form-field ua-form-field--wide ua-form-field--modern-select"><span>Target Department</span><ModernSelect value={selected?.name || ""} onChange={(name) => setDepartmentId(departments.find((department) => department.name === name)?.id || "")} options={departments.map((department) => department.name)} placeholder="Choose department"/></div><div className="ua-form-error">{error}</div></form></Modal>;
}

function PageAccessRow({ row, onChange, subpage = false }) {
  return <div className={`ua-page-access-row ${row.isEnabled ? "" : "is-disabled"}${subpage ? " ua-page-access-row--subpage" : ""}`}><div className="ua-page-access-name"><strong>{subpage ? <span className="ua-page-access-branch" aria-hidden="true"/> : null}{row.pageName}</strong><small>{row.moduleName}{row.routePath ? ` • ${row.routePath}` : ""}</small></div><div><ModernSelect compact value={accessLevelLabel(row.accessLevel)} onChange={(label) => onChange({ accessLevel: lower(label) })} options={["View", "Edit", "Admin"]} placeholder="Select access" ariaLabel={`Access type for ${row.pageName}`}/></div><div className="ua-page-access-enable"><label className="ua-switch" title={`Enable ${row.pageName}`}><input type="checkbox" checked={!!row.isEnabled} onChange={(event) => onChange({ isEnabled: event.target.checked })}/><span/></label></div></div>;
}

const EVENT_REQUEST_ROW_KEYS = new Set([
  "events.requests.view", "events.requests.edit", "events.requests.workflow",
  "events.requests.cancel", "events.requests.archive", "events.requests.pdf",
]);

// Scope links affect Home, Expenses, Orders, Tasks and Events immediately.
// Editing them is a privileged operation, separate from changing page grants.
function TeamScopeModal({ member, protect, onClose }) {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [initial, setInitial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await requestJson(`/next/api/users-center/team-scope?id=${encodeURIComponent(member.id)}`);
        if (!live) return;
        setMembers(response.members || []);
        setSelected(response.visibleIds || []);
        setInitial(response.visibleIds || []);
      } catch (e) { if (live) { setError(e.message); setLoadFailed(true); } }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [member.id]);
  const queryText = lower(query);
  const filtered = members.filter(item => [item.name, item.department, item.position].some(value => lower(value).includes(queryText)));
  const picked = new Set(selected);
  const changes = [...new Set([...selected, ...initial])].some(id => picked.has(id) !== initial.includes(id));
  const addedIds = selected.filter(id => !initial.includes(id));
  const removedIds = initial.filter(id => !picked.has(id));
  function closeTeamEditor() {
    if (busy) return;
    if (changes && !window.confirm(`Discard ${addedIds.length + removedIds.length} unsaved team change(s)?`)) return;
    onClose();
  }
  function setVisibleMembers(enabled) {
    const ids = new Set(filtered.map(item => item.id));
    setSelected(current => enabled ? [...new Set([...current, ...ids])] : current.filter(id => !ids.has(id)));
  }
  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  function save() {
    if (busy || loading || loadFailed || !changes) return;
    protect({ title: "Update team visibility", message: `Save ${selected.length} direct team member(s) for ${member.name}? These links affect Own / Team / All immediately.` }, async () => {
      setBusy(true); setError("");
      try {
        await usersCenterMutation("team-scope-save", { memberId: member.id, visibleMemberIds: selected, expectedVisibleIds: initial });
        onClose();
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    });
  }
  return <Modal title="Team Visibility" subtitle={`Choose whose records ${member.name} can access under Team scope.`} onClose={closeTeamEditor} modalClass="ua-modal--page-access" compact icon="users" closeDisabled={busy} bodyClass="ua-page-access-body" zIndex={10060}
    footer={<><button className="ua-btn ua-btn--light" type="button" disabled={busy} onClick={closeTeamEditor}>Cancel</button><button className="ua-btn ua-btn--dark" type="button" disabled={busy || loading || loadFailed || !changes} onClick={save}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Team"}</span></button></>}>
    <div className="ua-team-scope-panel">
      <p className="ua-team-scope-notice">Only explicitly selected members are included. Sharing a department does not grant Team access. This changes every module using Team scope.</p>
      <div className="ua-team-scope-toolbar"><label htmlFor="ua-team-scope-search">Find a team member</label><input id="ua-team-scope-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, department or position..." disabled={loading || busy}/><strong>{selected.length} selected</strong></div>
      {!loading && !loadFailed ? <div className="ua-team-scope-actions"><span>{filtered.length} visible members</span><button type="button" className="ua-mini-btn" disabled={busy || !filtered.length} onClick={() => setVisibleMembers(true)}>Select visible</button><button type="button" className="ua-mini-btn" disabled={busy || !filtered.length} onClick={() => setVisibleMembers(false)}>Remove visible</button></div> : null}
      {loading ? <p>Loading team members...</p> : null}
      {!loading && !loadFailed && <div className="ua-team-scope-list">{filtered.map(item => <label key={item.id} className="ua-team-scope-item"><span className="ua-team-scope-avatar">{initials(item.name)}</span><span className="ua-team-scope-item-copy"><strong>{item.name}</strong><small>{[item.department, item.position].filter(Boolean).join(" • ") || "Team member"}</small></span><input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} disabled={busy}/></label>)}{!filtered.length && <p className="ua-empty">No matching team members.</p>}</div>}
      {error ? <div className="ua-form-error" role="alert">{error} <button type="button" onClick={onClose}>Close</button></div> : null}
      {!loading && !loadFailed ? <small className="ua-team-scope-notice">{changes ? `${addedIds.length} added and ${removedIds.length} removed — Save Team to apply.` : "No unsaved changes."} The manager always retains Own access without needing a self-link.</small> : null}
    </div>
  </Modal>;
}

// Pilot modules only: other keys are registered but not yet protected across
// every route. Do not expose switches that would give a false sense of security.
function FeatureAccessModal({ member, onClose, protect }) {
  const [available, setAvailable] = useState(false);
  const [setupReason, setSetupReason] = useState("");
  const [active, setActive] = useState(false);
  const [grants, setGrants] = useState({});
  const [grantScopes, setGrantScopes] = useState({});
  const [unmanagedGrants, setUnmanagedGrants] = useState([]);
  const [teamScopeOpen, setTeamScopeOpen] = useState(false);
  const [featureQuery, setFeatureQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedModules, setExpandedModules] = useState({});
  const [savedDraft, setSavedDraft] = useState(null);
  const [scopedOrders, setScopedOrders] = useState({ "orders.my": false, "orders.operations": false, tasks: false });
  const [enabledModules, setEnabledModules] = useState({ products: false, "orders.operations": false });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const modules = [
    { key: "products", label: "Products", optIn: true },
    { key: "orders.operations", label: "Operations Orders", optIn: true },
    { key: "orders.my", label: "My Orders", optIn: true },
    { key: "orders.maintenance", label: "Maintenance Orders", optIn: true },
    { key: "orders.shopping", label: "Shopping Cart", optIn: true },
    { key: "orders.documents", label: "Order Documents", optIn: false },
    { key: "notifications", label: "Notifications", optIn: false },
    { key: "account", label: "Personal Account", optIn: false },
    { key: "tasks", label: "Task Management", optIn: true },
    { key: "events.requests", label: "Event Requests", optIn: true },
    { key: "events.calendar", label: "Event Calendar", optIn: true },
    { key: "events.components", label: "Event Components", optIn: true },
    { key: "events.team", label: "Event Team", optIn: true },
    { key: "kits", label: "Kits", optIn: true },
    { key: "proposals", label: "Proposals", optIn: true },
    // Unlike older migrated modules, Preparing already requires an explicit
    // feature View grant for every Advanced profile; it cannot opt back into
    // legacy Page Access while the profile is enforced.
    { key: "preparing", label: "Projects Preparing", optIn: false },
    { key: "orders.review", label: "Orders Review", optIn: true },
    { key: "stocktaking", label: "Stocktaking", optIn: true },
    { key: "expenses", label: "Expenses", optIn: true },
    { key: "expenses.users", label: "Expenses by Users", optIn: true },
    { key: "users", label: "Users Center", optIn: true },
    { key: "b2c.database", label: "B2C Database", optIn: true },
    { key: "b2c.forms", label: "B2C Forms", optIn: true },
    { key: "backup", label: "Database Backup", optIn: true },
    { key: "history", label: "System History", optIn: true },
    { key: "kpis", label: "KPIs", optIn: true },
    { key: "sla", label: "SLA Settings", optIn: true },
    { key: "home", label: "Home Dashboard", optIn: true },
  ];
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await requestJson(`/next/api/users-center/feature-access?id=${encodeURIComponent(member.id)}`);
        if (!mounted) return;
        setAvailable(result.available === true);
        setSetupReason(result.reason || "");
        setActive(result.enabled === true);
        const stored = result.grants || [];
        const savedGrants = Object.fromEntries(stored.filter(item => ACTIVE_PILOT_FEATURE_KEYS.includes(item.key)).map(item => [item.key, item.allowed === true]));
        // An existing profile inherits each newly activated control from the
        // previously guarded action. Show its *effective* value in the editor
        // and persist it explicitly at the next save; never surprise-revoke.
        for (const [key, predecessor] of Object.entries(OPTIONAL_FEATURE_FALLBACKS)) {
          if (!Object.hasOwn(savedGrants, key) && savedGrants[predecessor] === true) savedGrants[key] = true;
        }
        // Shared document endpoints were always controlled by Page Access.
        // Show their effective legacy value unless the admin has saved a deny.
        for (const key of LEGACY_DEFAULT_FEATURE_KEYS) {
          if (!Object.hasOwn(savedGrants, key)) savedGrants[key] = true;
        }
        setGrants(savedGrants);
        const savedScopes = Object.fromEntries(stored.filter(item => ACTIVE_PILOT_FEATURE_KEYS.includes(item.key)).map(item => [item.key, item.scope || "all"]));
        for (const [key, predecessor] of Object.entries(OPTIONAL_FEATURE_FALLBACKS)) {
          if (!Object.hasOwn(savedScopes, key) && savedGrants[predecessor] === true) savedScopes[key] = key === "orders.tracking.view" ? "all" : (savedScopes[predecessor] || "all");
        }
        setGrantScopes(Object.fromEntries(Object.entries(savedScopes)));
        setEnabledModules({
          // Previously enabled Phase 2A profiles keep their enforced restrictions
          // until an admin explicitly switches a module back to legacy. Fresh
          // advanced profiles start with these unrelated modules opt-out.
          // An active Advanced profile does not imply the Products or Operations
          // pilot module was migrated. Inferring migration from result.enabled
          // inadvertently persisted products.view=false when editing other modules,
          // making an otherwise allowed Products page disappear from the sidebar.
          products: !stored.some(item => item.key === PHASE2A_LEGACY_MARKERS.products && item.allowed === true)
            && stored.some(item => item.key.startsWith("products.") && item.key !== PHASE2A_LEGACY_MARKERS.products),
          "orders.operations": !stored.some(item => item.key === PHASE2A_LEGACY_MARKERS["orders.operations"] && item.allowed === true)
            && stored.some(item => item.key.startsWith("orders.operations.") && item.key !== PHASE2A_LEGACY_MARKERS["orders.operations"]),
          "orders.my": stored.some(item => item.key === MY_ORDERS_ENFORCEMENT_MARKER && item.allowed === true),
          "orders.maintenance": stored.some(item => item.key === "orders.maintenance.view"),
          "orders.shopping": stored.some(item => item.key === "orders.shopping.view"),
          "orders.documents": true,
          notifications: true,
          account: true,
          tasks: stored.some(item => item.key === "tasks.view"),
          "events.requests": stored.some(item => item.key === "events.requests.view"),
          "events.calendar": stored.some(item => item.key === "events.calendar.view"),
          "events.components": stored.some(item => item.key === "events.components.view"),
          "events.team": stored.some(item => item.key === "events.team.view"),
          kits: stored.some(item => item.key === "kits.view"),
          proposals: stored.some(item => item.key === "proposals.view"),
          // This new module is always guarded by preparing.view in Advanced mode.
          preparing: true,
          "orders.review": stored.some(item => item.key === "orders.review.view"),
          stocktaking: stored.some(item => item.key === "stocktaking.view"),
          expenses: stored.some(item => item.key === "expenses.view"),
          "expenses.users": stored.some(item => item.key === "expenses.users.view"),
          users: stored.some(item => item.key === "users.view"),
          "b2c.database": stored.some(item => item.key === "b2c.database.view"),
          "b2c.forms": stored.some(item => item.key === "b2c.forms.view"),
          backup: stored.some(item => item.key === "backup.view"),
          history: stored.some(item => item.key === "history.view"),
          kpis: stored.some(item => item.key === "kpis.view"),
          sla: stored.some(item => item.key === "sla.view"),
          home: stored.some(item => item.key === "home.view"),
        });
        setScopedOrders({ ...Object.fromEntries(Object.entries(ORDER_SCOPE_MARKERS).map(([module, marker]) =>
          [module, stored.some(item => item.key === marker && item.allowed === true)])),
          tasks: stored.some(item => item.key === TASK_SCOPE_MARKER && item.allowed === true),
          "events.requests": stored.some(item => item.key === EVENT_REQUEST_SCOPE_MARKER && item.allowed === true) });
        setUnmanagedGrants(stored.filter(item => !ACTIVE_PILOT_FEATURE_KEYS.includes(item.key)
          && item.key !== MY_ORDERS_ENFORCEMENT_MARKER
          && !Object.values(ORDER_SCOPE_MARKERS).includes(item.key)
          && item.key !== TASK_SCOPE_MARKER
          && item.key !== EVENT_REQUEST_SCOPE_MARKER
          && !Object.values(PHASE2A_LEGACY_MARKERS).includes(item.key)));
      } catch (e) { if (mounted) setError(e.message); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [member.id]);
  const shown = FEATURE_DEFINITIONS.filter(item => ACTIVE_PILOT_FEATURE_KEYS.includes(item.key));
  const activeFeatures = shown.filter(item => enabledModules[item.module]);
  const checkedCount = activeFeatures.filter(item => grants[item.key] === true).length;
  const draft = permissionDraft({ active, modules, definitions: shown, enabledModules, grants, grantScopes, scopedOrders });
  const draftChanges = permissionDraftChanges(savedDraft, draft, modules, shown);
  const hasUnsavedChanges = savedDraft !== null && draftChanges.length > 0;
  const activeModuleCount = modules.filter(item => draft.modules[item.key]).length;
  const blockedModules = modules.filter(item => modulePermissionStatus(item.key, draft, shown).mode === "blocked");
  const effectiveAllowedCount = modules.reduce((sum, item) => sum + modulePermissionStatus(item.key, draft, shown).effective, 0);
  useEffect(() => {
    if (!loading && available && savedDraft === null) setSavedDraft(draft);
  }, [loading, available, savedDraft, draft]);
  function closeEditor() {
    if (busy) return;
    if (hasUnsavedChanges && !window.confirm(`Discard ${draftChanges.length} unsaved permission change(s)?`)) return;
    onClose();
  }
  function restoreDraft() {
    if (!savedDraft || busy) return;
    setActive(savedDraft.active);
    setEnabledModules({ ...savedDraft.modules });
    setGrants({ ...savedDraft.grants });
    setGrantScopes({ ...savedDraft.scopes });
    setScopedOrders({ ...savedDraft.rowScopes });
  }
  const searchText = lower(featureQuery);
  const visibleModules = modules.filter(module => (moduleFilter === "all" || module.key === moduleFilter)
    && (statusFilter === "all" || (statusFilter === "changed"
      ? draftChanges.some(change => change.module === module.key)
      : modulePermissionStatus(module.key, draft, shown).mode === statusFilter))
    && (!searchText || lower(module.label).includes(searchText) || shown.some(item => item.module === module.key && lower(`${item.label} ${item.key}`).includes(searchText))));
  const visibleFeatures = activeFeatures.filter(item => visibleModules.some(module => module.key === item.module)
    && (!searchText || lower(modules.find(module => module.key === item.module)?.label).includes(searchText) || lower(`${item.label} ${item.key}`).includes(searchText)));

  function save() {
    if (busy || loading || !available || !hasUnsavedChanges) return;
    protect({ title: "Save advanced feature access", message: active
      ? `Apply ${draftChanges.length} reviewed change(s) for ${member.name}? ${activeModuleCount} modules will use Advanced Permissions; all other modules retain Legacy Page Access. ${blockedModules.length} advanced module(s) will have View denied.`
      : `Restore ${member.name} to legacy page-based permissions? This will stop enforcing the Advanced feature grants.` }, async () => {
      setBusy(true); setError("");
      try {
        await usersCenterMutation("feature-access-save", {
          memberId: member.id, enabled: active,
          grants: [
            ...unmanagedGrants,
            ...Object.entries(PHASE2A_LEGACY_MARKERS)
              .filter(([module]) => !enabledModules[module])
              .map(([, key]) => ({ key, allowed: true, scope: "all" })),
            ...(enabledModules["orders.my"] ? [{ key: MY_ORDERS_ENFORCEMENT_MARKER, allowed: true, scope: "all" }] : []),
            ...Object.entries({ ...ORDER_SCOPE_MARKERS, tasks: TASK_SCOPE_MARKER, "events.requests": EVENT_REQUEST_SCOPE_MARKER }).filter(([module]) => enabledModules[module] && scopedOrders[module])
              .map(([, key]) => ({ key, allowed: true, scope: "all" })),
            ...activeFeatures.filter(item => grants[item.key] === true).map(item => ({ key: item.key, allowed: true, scope: grantScopes[item.key] || "all" }))
              .map(grant => ({ ...grant, scope: Object.keys({ ...ORDER_SCOPE_MARKERS, tasks: TASK_SCOPE_MARKER, "events.requests": EVENT_REQUEST_SCOPE_MARKER }).some(module =>
                grant.key.startsWith(`${module}.`) && !scopedOrders[module]) || (grant.key.startsWith("events.requests.") && !EVENT_REQUEST_ROW_KEYS.has(grant.key)) || grant.key === "orders.tracking.view" ? "all" : grant.scope })),
            // Unlike older implicit-deny actions, Phase 2P4A keys use a
            // compatibility fallback when the grant is absent. A deliberate
            // OFF switch therefore MUST be persisted as an explicit deny.
            ...activeFeatures.filter(item => (Object.hasOwn(OPTIONAL_FEATURE_FALLBACKS, item.key) || LEGACY_DEFAULT_FEATURE_KEYS.includes(item.key)) && grants[item.key] !== true)
              .map(item => ({ key: item.key, allowed: false, scope: "all" })),
            // Persist a denied view marker for opt-in modules. An absent marker
            // intentionally means 'not migrated' and preserves legacy access.
            ...modules.filter(module => module.optIn && module.key !== "orders.my" && enabledModules[module.key] && grants[`${module.key}.view`] !== true)
              .map(module => ({ key: `${module.key}.view`, allowed: false, scope: "all" })),
          ],
        });
        onClose();
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    });
  }
  return <><Modal title="Advanced Permissions" subtitle={`Control exact features for ${member.name}.`} onClose={closeEditor} modalClass="ua-modal--page-access" compact icon="shield" closeDisabled={busy} bodyClass="ua-page-access-body" zIndex={10040} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={closeEditor} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading || !available || !hasUnsavedChanges}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Features"}</span></button></>}>
    <div style={{ padding: "12px 14px" }}>
      {loading ? <p>Loading feature permissions...</p> : null}
      {!loading && !available ? <div className="ua-feature-setup-notice" role="status">
        <strong>Advanced Permissions is not ready</strong>
        {setupReason === "server_flag_disabled" ? <p>Enable <code>ERP_ADVANCED_PERMISSIONS_ENABLED=1</code> on the <strong>Next.js server</strong>, then restart or redeploy. SQL alone is not enough.</p>
        : setupReason === "missing_service_credential" ? <p>The Next.js server needs a private <code>SUPABASE_SERVICE_ROLE_KEY</code> or another supported service credential. Never expose it to browser code.</p>
        : <p>Check the Supabase tables, application server settings, and any error below.</p>}
      </div> : null}
      {available ? <>
        <div className="ua-page-access-row ua-feature-access-row"><div className="ua-page-access-name"><strong>Use Advanced Permissions</strong><small>ON: deny all unselected pilot actions. OFF: keep legacy page rules.</small></div><div className="ua-page-access-enable"><label className="ua-switch"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/><span/></label></div></div>
        <div className="ua-feature-overview" aria-live="polite">
          <div><strong>{active ? "Advanced profile" : "Legacy profile"}</strong><small>{active ? `${activeModuleCount} of ${modules.length} modules use detailed access` : "Existing Page Access remains in effect"}</small></div>
          <div><strong>{active ? effectiveAllowedCount : "—"}</strong><small>Allowed actions in active modules*</small></div>
          <div><strong>{active ? blockedModules.length : "—"}</strong><small>Modules blocked by View</small></div>
        </div>
        {active ? <small className="ua-feature-count-note">*Feature-grant status only. Page Access, Data Scope and required admin verification still apply. Projects Preparing also requires an explicit <strong>View preparing projects</strong> grant here, even if Page Access is enabled.</small> : null}
        {active && blockedModules.length > 0 ? <p className="ua-feature-warning" role="status">View is denied in {blockedModules.map(item => item.label).join(", ")}. Other allowed actions in those modules won't work until View is granted.</p> : null}
        <button type="button" className="ua-team-scope-open" onClick={() => setTeamScopeOpen(true)}><UAIcon name="users"/><span><strong>Manage Team Visibility</strong><small>Set explicit reporting links for Own / Team / All.</small></span><UAIcon name="chevron"/></button>
        {active ? <>
          <div className="ua-feature-toolbar">
            <label className="ua-feature-search-field"><span>Search permissions</span><input value={featureQuery} onChange={e => setFeatureQuery(e.target.value)} placeholder="Search actions, modules or keys..."/></label>
            <label className="ua-feature-filter-field"><span>Module</span><select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}><option value="all">All modules</option>{modules.map(module => <option key={module.key} value={module.key}>{module.label}</option>)}</select></label>
            <label className="ua-feature-filter-field"><span>Show</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="advanced">Advanced</option><option value="legacy">Legacy</option><option value="blocked">View blocked</option><option value="changed">Unsaved changes</option></select></label>
          </div>
          <div className="ua-feature-bulk"><strong>{checkedCount} of {activeFeatures.length} configured as allowed</strong><span>{visibleFeatures.length} visible features in active modules</span><button type="button" className="ua-mini-btn" disabled={!visibleFeatures.length || busy} onClick={() => setGrants(current => ({ ...current, ...Object.fromEntries(visibleFeatures.map(item => [item.key, true])) }))}>Allow Visible</button><button type="button" className="ua-mini-btn" disabled={!visibleFeatures.length || busy} onClick={() => setGrants(current => ({ ...current, ...Object.fromEntries(visibleFeatures.map(item => [item.key, false])) }))}>Deny Visible</button><button type="button" className="ua-mini-btn" onClick={() => setExpandedModules(Object.fromEntries(modules.map(item => [item.key, true])))}>Expand all</button><button type="button" className="ua-mini-btn" onClick={() => setExpandedModules(Object.fromEntries(modules.map(item => [item.key, false])))}>Collapse all</button></div>
          <p className="ua-feature-bulk-hint">Bulk changes only affect displayed actions in enabled modules. Check the review below before saving.</p>
          {!visibleModules.length ? <div className="ua-empty">No matching permissions.</div> : null}
          {visibleModules.map(module => <section className="ua-page-access-group ua-feature-module-group" key={module.key}>
            <div className="ua-page-access-group__heading ua-feature-module-heading">
              <button type="button" className="ua-feature-module-toggle" aria-expanded={searchText ? true : expandedModules[module.key] !== false} aria-label={`${searchText || expandedModules[module.key] !== false ? "Collapse" : "Expand"} ${module.label}`} onClick={() => setExpandedModules(current => ({ ...current, [module.key]: current[module.key] === false }))}><UAIcon name="chevronDown"/>{module.label}<span className={`ua-feature-status ua-feature-status--${modulePermissionStatus(module.key, draft, shown).mode}`}>{modulePermissionStatus(module.key, draft, shown).mode === "blocked" ? "View blocked" : modulePermissionStatus(module.key, draft, shown).mode === "legacy" ? "Legacy" : "Advanced"}</span><small>{modulePermissionStatus(module.key, draft, shown).selected}/{modulePermissionStatus(module.key, draft, shown).total} allowed</small></button>
              {module.optIn ? <label className="ua-switch" title={`Enable detailed ${module.label} permissions`}>
                <input type="checkbox" aria-label={`Enable detailed ${module.label} permissions`} checked={!!enabledModules[module.key]} onChange={e => setEnabledModules(current => ({ ...current, [module.key]: e.target.checked }))}/><span/>
              </label> : null}
            </div>
            {(searchText || expandedModules[module.key] !== false) ? <>
            {module.optIn && !enabledModules[module.key] ? <p style={{ margin: "12px 14px" }}>Uses existing Page Access until you enable detailed permissions for this module.</p> : null}
            {enabledModules[module.key] && (ORDER_SCOPE_MARKERS[module.key] || module.key === "tasks" || module.key === "events.requests") ? <label className="ua-page-access-row ua-feature-access-row" style={{ cursor: "pointer" }}><span className="ua-page-access-name"><strong>Enable row-level Own / Team / All</strong><small>Explicit opt-in. Off preserves the existing visibility rules for this module.</small></span><span className="ua-page-access-enable"><input type="checkbox" checked={!!scopedOrders[module.key]} onChange={e => setScopedOrders(prev => ({ ...prev, [module.key]: e.target.checked }))}/></span></label> : null}
            {enabledModules[module.key] ? <div className="ua-page-access-group__rows">{shown.filter(item => item.module === module.key && (!searchText || lower(module.label).includes(searchText) || lower(`${item.label} ${item.key}`).includes(searchText))).map(item => <div className="ua-page-access-row ua-feature-access-row" key={item.key}><div className="ua-page-access-name"><strong>{item.label}</strong><small>{item.key}</small></div><div className="ua-page-access-enable">{((item.key === "home.analysis" || item.key.startsWith("expenses.users.")) || ((ORDER_SCOPE_MARKERS[item.module] || item.module === "tasks" || EVENT_REQUEST_ROW_KEYS.has(item.key)) && scopedOrders[item.module] && item.key !== "orders.tracking.view")) && grants[item.key] === true ? <select aria-label={item.key === "home.analysis" ? "Home analysis data scope" : `${item.label} data scope`} className="ua-feature-scope-select" value={grantScopes[item.key] || "all"} onChange={e => setGrantScopes(current => ({ ...current, [item.key]: e.target.value }))}><option value="own">Own</option><option value="team">Team</option><option value="all">All</option></select> : null}<label className="ua-switch" title={item.label}><input type="checkbox" checked={grants[item.key] === true} onChange={e => setGrants(current => ({ ...current, [item.key]: e.target.checked }))}/><span/></label></div></div>)}</div> : null}
            </> : null}
          </section>)}
          <small>Most optional modules remain on legacy Page Access until enabled for this user. Projects Preparing is different: when Advanced Permissions is ON, explicitly allow View preparing projects (plus any actions needed) as well as Page Access. Enable other modules, then grant only the features needed. A disabled View permission hides its page. Products and Operations Orders now have separate opt-in switches; turn them off to keep existing Page Access while enabling Expenses by Users. For an already-enabled profile, review those switches and save once. Existing Page Access and any required admin password still apply. Home Analysis and Expenses by Users support Own / Team / All. My Orders, Operations Orders and Maintenance Orders support the same scopes only after enabling their separate row-level scope switch. Other permissions retain their saved scope without row-level enforcement.</small>
        </> : <p>Legacy page permissions will apply to this account. No feature grants will be enforced.</p>}
      </> : null}
      {savedDraft !== null ? <section className="ua-feature-review" aria-live="polite">
        <div className="ua-feature-review-head"><strong>Review before saving</strong><span className={hasUnsavedChanges ? "ua-feature-status ua-feature-status--changed" : "ua-feature-status"}>{hasUnsavedChanges ? `${draftChanges.length} unsaved changes` : "No changes"}</span>{hasUnsavedChanges ? <button type="button" className="ua-mini-btn" onClick={restoreDraft} disabled={busy}>Discard edits</button> : null}</div>
        {hasUnsavedChanges ? <ul>{draftChanges.slice(0, 8).map((change, index) => <li key={`${change.type}-${change.key || change.module || index}`}>{change.label}</li>)}</ul> : <small>No permission settings have changed since opening this window.</small>}
        {draftChanges.length > 8 ? <small>And {draftChanges.length - 8} more change(s). All changes are included when you save.</small> : null}
        {hasUnsavedChanges && !active ? <p>Switching to Legacy stops enforcing this user's Advanced permissions.</p> : null}
      </section> : null}
      {error ? <p className="ua-form-error" role="alert">{error}</p> : null}
    </div>
  </Modal>{teamScopeOpen ? <TeamScopeModal member={member} protect={protect} onClose={() => setTeamScopeOpen(false)}/> : null}</>;
}

function PageAccessModal({ member, draftRows, onDraftRows, onClose, onSaved, protect, allowAdvanced = true }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [advancedOpen, setAdvancedOpen] = useState(false); const isCreate = !member;
  useEffect(() => { let active = true; (async () => { try { if (draftRows?.length) { if (active) setRows(normalizeAccessRows(draftRows)); return; } const body = isCreate
        ? await requestJson("/next/api/users-center/pages")
        : await requestJson(`/next/api/users-center/page-access?id=${encodeURIComponent(member.id)}`); const nextRows = isCreate ? normalizeAccessRows((body.pages || []).map((page) => ({ ...page, accessLevel: "edit", isEnabled: false }))) : normalizeAccessRows(body.pages || []); if (active) setRows(nextRows); } catch (err) { if (active) setError(err.message); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [member?.id]);
  function patch(index, values) { setRows((current) => current.map((row, i) => i === index ? { ...row, ...values, accessLevel: values.accessLevel ? normalizeAccessLevel(values.accessLevel) : row.accessLevel } : row)); }
  async function save() { if (loading || busy) return; if (isCreate) { onDraftRows(rows); onSaved?.(rows); onClose(); return; } protect({ title: "Save page access", message: `Apply this page-access matrix to ${member.name}?` }, async () => { setBusy(true); setError(""); try { const body = await usersCenterMutation("page-access-save", { memberId: member.id, pages: rows.map((row) => ({ pageId: row.pageId, pageKey: row.pageKey, isEnabled: !!row.isEnabled, accessLevel: row.accessLevel })) }); const saved = normalizeAccessRows(body.pages || rows); setRows(saved); await onSaved?.(saved, body.summary); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }); }
  const events = new Set(["event-calendar", "event-requests", "event-components"]); const tasks = new Set(["task-management-all-tasks", "task-management-my-tasks", "task-management-delegated-tasks", "all-tasks", "my-tasks", "delegated-tasks"]); const b2c = new Set(["b2c-customer-database", "customer-database", "b2c-customer-form", "customer-form"]);
  function inSet(row, set) { return set.has(lower(row.pageKey)); }
  const eventRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, events)); const taskRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, tasks)); const b2cRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => inSet(row, b2c));
  const firstEvent = eventRows[0]?.index; const firstTask = taskRows[0]?.index; const firstB2c = b2cRows[0]?.index;
  const markup = []; rows.forEach((row, index) => { if (index === firstEvent) markup.push(<section className="ua-page-access-group ua-page-access-group--events" key="events-group"><div className="ua-page-access-group__heading"><UAIcon name="calendar"/><span>Events</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{eventRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (index === firstTask) markup.push(<section className="ua-page-access-group ua-page-access-group--task-management" key="task-group"><div className="ua-page-access-group__heading"><UAIcon name="branch"/><span>Task Management</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{taskRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (index === firstB2c) markup.push(<section className="ua-page-access-group ua-page-access-group--b2c" key="b2c-group"><div className="ua-page-access-group__heading"><UAIcon name="users"/><span>B2C</span><small>Sub-pages</small></div><div className="ua-page-access-group__rows">{b2cRows.map(({ row: child, index: childIndex }) => <PageAccessRow key={child.pageId || child.pageKey} row={child} subpage onChange={(values) => patch(childIndex, values)}/>)}</div></section>); if (!inSet(row, events) && !inSet(row, tasks) && !inSet(row, b2c)) markup.push(<PageAccessRow key={row.pageId || row.pageKey} row={row} onChange={(values) => patch(index, values)}/>); });
  return <><Modal title="Page Access" subtitle={`Configure page access for ${isCreate ? "new team member" : member?.name || "this team member"}.`} onClose={onClose} modalClass="ua-modal--page-access" compact icon="shield" closeDisabled={busy} bodyClass="ua-page-access-body" zIndex={10020} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Access"}</span></button></>}>{!isCreate && allowAdvanced ? <div className="ua-advanced-access-cta"><button type="button" className="ua-advanced-access-cta__button" onClick={() => setAdvancedOpen(true)} disabled={busy || loading}><span className="ua-advanced-access-cta__icon"><UAIcon name="shield"/></span><span className="ua-advanced-access-cta__copy"><strong>Advanced Feature Permissions</strong><small>Control individual actions, such as Edit, Delete and Export.</small></span><UAIcon name="chevron"/></button><small className="ua-advanced-access-cta__hint">Save any Page Access changes before configuring features.</small></div> : null}<div className="ua-page-access-head"><div>Page name</div><div>Access type</div><div>Enable</div></div><div className="ua-page-access-list">{loading ? <div className="ua-page-access-loading"><span/> Loading pages...</div> : markup}</div>{error ? <div className="ua-form-error ua-page-access-error">{error}</div> : null}</Modal>{advancedOpen && !isCreate ? <FeatureAccessModal member={member} onClose={() => setAdvancedOpen(false)} protect={protect}/> : null}</>;
}

function SvAccessModal({ member, allMembers, draftRows, onDraftRows, onClose, onSaved, protect }) {
  const [rows, setRows] = useState([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const isCreate = !member;
  useEffect(() => { let active = true; (async () => { try { if (isCreate) { const base = draftRows?.length ? normalizeSvRows(draftRows) : normalizeSvRows(allMembers.map((item) => ({ memberId: item.id, name: item.name, department: item.department, position: item.position, email: item.email, photoUrl: item.photoUrl, isEnabled: false }))); if (active) setRows(base); return; } const body = await requestJson(`/next/api/users-center/sv-access?id=${encodeURIComponent(member.id)}`); if (active) setRows(normalizeSvRows(body.members || body.rows || [])); } catch (err) { if (active) setError(err.message); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [member?.id]);
  const visible = rows.filter((row) => !search || lower(`${row.name} ${row.department} ${row.position} ${row.email}`).includes(lower(search)));
  function toggle(id, enabled) { setRows((current) => current.map((row) => row.memberId === id ? { ...row, isEnabled: enabled } : row)); }
  function enableVisible() { const ids = new Set(visible.map((row) => row.memberId)); setRows((current) => current.map((row) => ids.has(row.memberId) ? { ...row, isEnabled: true } : row)); }
  async function save() { if (isCreate) { onDraftRows(rows); await onSaved?.(rows); onClose(); return; } protect({ title: "Save Orders Review visibility", message: `Update which team members ${member.name} can see in Orders Review?` }, async () => { setBusy(true); setError(""); try { const body = await usersCenterMutation("sv-access-save", { memberId: member.id, members: rows.filter((row) => row.isEnabled).map((row) => ({ memberId: row.memberId })) }); const saved = normalizeSvRows(body.members || rows); setRows(saved); await onSaved?.(saved, body.summary); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } }); }
  return <Modal title="Orders Supervision" subtitle={`Enable team members whose orders should be visible to ${isCreate ? "the new user" : member?.name || "this user"} in Orders Review.`} onClose={onClose} modalClass="ua-modal--sv-access" compact icon="users" closeDisabled={busy} bodyClass="ua-sv-access-body" zIndex={10020} footer={<><button type="button" className="ua-btn ua-btn--light" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading}><UAIcon name="save"/><span>{busy ? "Saving..." : "Save Users"}</span></button></>}><div className="ua-sv-access-tools"><label className="ua-sv-search"><UAIcon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team members..." autoComplete="off"/></label><button type="button" className="ua-mini-btn" onClick={enableVisible} disabled={loading || busy}>Enable all visible</button></div>{loading ? <div className="ua-page-access-loading"><span/> Loading team members...</div> : null}{error ? <div className="ua-form-error">{error}</div> : null}{!loading ? <div className="ua-sv-access-list">{visible.length ? visible.map((row) => <div className={`ua-sv-access-row ${row.isEnabled ? "is-enabled" : ""}`} key={row.memberId}><div className="ua-sv-access-person"><Avatar member={row} small/><div><strong><span className="ua-sv-access-name">{row.name}</span>{row.isSelf ? <span className="ua-sv-self-badge">This user</span> : null}</strong><small>{[row.department, row.position].filter(Boolean).join(" • ") || row.email || "Team member"}</small></div></div><label className="ua-switch" title={`Enable ${row.name}`}><input type="checkbox" checked={row.isEnabled} onChange={(event) => toggle(row.memberId, event.target.checked)}/><span/></label></div>) : <div className="ua-empty">Sorry, No data available</div>}</div> : null}</Modal>;
}

export default function UsersCenterDialogs({
  access = {},
  passwordAction, onPasswordClose, onPasswordVerified,
  confirm, onConfirmClose,
  departmentForm, onDepartmentFormClose, onDepartmentSaved,
  memberForm, selectedDepartment, editableFields, departments, pageAccessRows, svRows, notify, onOpenPageAccess, onOpenSvAccess, onMemberFormClose, onMemberSaved,
  moveMember, onMoveMemberClose, onMoveMemberSaved,
  pageAccessOpen, setPageAccessRows, onPageAccessClose, protect, onPageAccessSaved,
  svAccessOpen, allMembers, setSvRows, onSvAccessClose, onSvAccessSaved,
  signupOpen, positions, onSignupClose, onSignupChanged,
}) {
  const [featureAccessOpen, setFeatureAccessOpen] = useState(false);
  return <>
    {passwordAction ? <PasswordModal action={passwordAction} onClose={onPasswordClose} onVerified={onPasswordVerified}/> : null}
    {confirm ? <ConfirmModal value={confirm} onClose={onConfirmClose}/> : null}
    {departmentForm ? <DepartmentForm department={departmentForm.department} onClose={onDepartmentFormClose} onSaved={onDepartmentSaved}/> : null}
    {memberForm ? <MemberForm member={memberForm.member} selectedDepartment={selectedDepartment} editableFields={editableFields} departments={departments} pageAccessRows={pageAccessRows} svRows={svRows} notify={notify} access={access} onOpenPageAccess={onOpenPageAccess} onOpenSvAccess={onOpenSvAccess} onOpenFeatureAccess={() => setFeatureAccessOpen(true)} onClose={onMemberFormClose} onSaved={onMemberSaved}/> : null}
    {moveMember ? <MoveMemberModal member={moveMember} departments={departments} onClose={onMoveMemberClose} onSaved={onMoveMemberSaved}/> : null}
    {pageAccessOpen && memberForm ? <PageAccessModal member={memberForm.member} draftRows={pageAccessRows} onDraftRows={setPageAccessRows} onClose={onPageAccessClose} protect={protect} allowAdvanced={access.featureAccess} onSaved={onPageAccessSaved}/> : null}
    {featureAccessOpen && memberForm?.member && access.featureAccess ? <FeatureAccessModal member={memberForm.member} onClose={() => setFeatureAccessOpen(false)} protect={protect}/> : null}
    {svAccessOpen && memberForm ? <SvAccessModal member={memberForm.member} allMembers={allMembers} draftRows={svRows} onDraftRows={setSvRows} onClose={onSvAccessClose} protect={protect} onSaved={onSvAccessSaved}/> : null}
    {signupOpen ? <SignupRequestsModal departments={departments} positions={positions} canApprove={access.signupApprove} canReject={access.signupReject} onClose={onSignupClose} notify={notify} onChanged={onSignupChanged}/> : null}
  </>;
}
