"use client";

import { useEffect, useMemo, useState } from "react";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values) { return [...new Set((values || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function initials(value) { const parts = text(value || "User").split(/\s+/).filter(Boolean).slice(0, 2); return (parts.map((part) => part[0]).join("") || "U").toUpperCase(); }
function formatDate(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? text(value) || "—" : date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }); }
function fieldKey(value) { return lower(value).replace(/[^a-z0-9]/g, ""); }
function accessRank(value) { return ({ view: 1, edit: 2, admin: 3 })[lower(value)] || 0; }
function sortByName(rows) { return [...(rows || [])].sort((a, b) => text(a?.name).localeCompare(text(b?.name))); }

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    const error = new Error("Your session has expired."); error.status = 401; throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(text(body?.message || body?.error) || "The request failed.");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function Toast({ value, onClose }) {
  if (!value) return null;
  return (
    <div className={`next-toast next-toast--${value.type || "info"}`} role="status">
      <span>{value.type === "success" ? "✓" : value.type === "error" ? "!" : "i"}</span>
      <div><strong>{value.title || "Users Center"}</strong><small>{value.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}


function UAIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    folder: <><path d="M3 5h6l2 2h10v12H3z" /><path d="M3 9h18" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /><path d="M9 6V4h6v2" /></>,
    chevron: <polyline points="9 18 15 12 9 6" />,
    back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
    addUser: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>,
    signup: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></>,
    folderPlus: <><path d="M3 5h6l2 2h10v12H3z" /><path d="M12 11v5M9.5 13.5h5" /></>,
    hash: <><line x1="4" y1="9" x2="20" y2="9" /><line x1="3" y1="15" x2="19" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />,
    mail: <><path d="M4 4h16v16H4z" /><polyline points="22,6 12,13 2,6" /></>,
    move: <><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  };
  return <svg {...common}>{paths[name] || paths.users}</svg>;
}

function Modal({ title, eyebrow, onClose, children, wide = false, extraWide = false, footer = null, icon = "users" }) {
  return (
    <div className="ua-modal-overlay next-ua-modal-layer" role="presentation">
      <button type="button" className="next-ua-modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <section className={`ua-modal ${wide ? "ua-modal--form" : ""} ${extraWide ? "ua-modal--page-access next-ua-modal--extra-wide" : ""}`} role="dialog" aria-modal="true">
        <button type="button" className="ua-modal__close" onClick={onClose} aria-label="Close"><UAIcon name="close" /></button>
        <div className="ua-modal__header ua-modal__header--compact">
          <div className="ua-modal__avatar ua-modal__avatar--icon"><UAIcon name={icon} /></div>
          <div><h2>{title}</h2>{eyebrow ? <p>{eyebrow}</p> : null}</div>
        </div>
        <div className="ua-modal__body">{children}</div>
        {footer ? <div className="ua-modal__actions">{footer}</div> : null}
      </section>
    </div>
  );
}


function PasswordModal({ action, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Admin password is required.");
    setBusy(true); setError("");
    try {
      await requestJson("/api/user-access/admin/verify", { method: "POST", body: JSON.stringify({ password }) });
      onVerified();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={action?.title || "Admin Verification"} eyebrow={action?.message || "Enter the Admin password to continue."} onClose={onClose} icon="lock">
      <form className="next-ua-form" onSubmit={submit}>
        <label className="ua-form-field ua-form-field--wide"><span>Admin Password</span><input type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter Admin password" /></label>
        {error ? <div className="ua-form-error">{error}</div> : null}
        <div className="next-ua-inline-actions"><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button className="ua-btn ua-btn--dark" type="submit" disabled={busy}>{busy ? "Verifying..." : "Continue"}</button></div>
      </form>
    </Modal>
  );
}


function ConfirmModal({ value, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={value?.title || "Confirm action"} eyebrow={value?.message || "Are you sure?"} onClose={busy ? () => {} : onClose} icon={value?.danger ? "trash" : "check"}>
      {error ? <div className="ua-form-error">{error}</div> : null}
      <div className="next-ua-inline-actions">
        <button type="button" className="ua-btn ua-btn--light" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className={`ua-btn ${value?.danger ? "ua-btn--danger" : "ua-btn--dark"}`} disabled={busy} onClick={confirm}>{busy ? "Working..." : (value?.confirmLabel || "Confirm")}</button>
      </div>
    </Modal>
  );
}

function Avatar({ member, large = false, small = false }) {
  const classes = ["ua-avatar", large ? "next-ua-avatar--large" : "", small ? "ua-avatar--small" : ""].filter(Boolean).join(" ");
  return member?.photoUrl
    ? <span className={classes}><img src={member.photoUrl} alt={member.name || "User"} /></span>
    : <span className={classes}>{initials(member?.name)}</span>;
}

function fieldValue(member, name) {
  const wanted = fieldKey(name);
  const field = (member?.fields || []).find((item) => fieldKey(item?.label) === wanted);
  if (!field) return "";
  if (field.type === "files") return field.fileUrls?.[0] || field.files?.[0]?.url || field.value || "";
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
  return { total: Number(payload?.total || departments.reduce((sum, department) => sum + department.members.length, 0)) || 0, departments, editableFields: Array.isArray(payload?.editableFields) ? payload.editableFields : [] };
}


function SignupRequestsModal({ initialStatus = "pending", departments, onClose, onChanged, protect }) {
  const [status, setStatus] = useState(initialStatus);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approve, setApprove] = useState(null);
  const [approveForm, setApproveForm] = useState({ department: "", position: "" });
  const [busy, setBusy] = useState(false);

  const load = async (nextStatus = status) => {
    setLoading(true); setError("");
    try { const body = await requestJson(`/api/user-access/signup-requests?status=${encodeURIComponent(nextStatus)}&_=${Date.now()}`); setRequests(body.requests || []); }
    catch (err) { setError(err.message); setRequests([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(initialStatus); }, []);

  const changeStatus = (nextStatus) => { setStatus(nextStatus); load(nextStatus); };
  const beginApprove = (request) => {
    setApprove(request);
    setApproveForm({ department: request.department || departments[0]?.name || "", position: request.position || "" });
  };
  const submitApprove = async (event) => {
    event.preventDefault();
    if (!text(approveForm.department) || !text(approveForm.position)) return setError("Department and position are required.");
    protect({ title: "Approve sign up request", message: `Approve ${approve?.username || "this request"} and create a team account?` }, async () => {
      setBusy(true); setError("");
      try {
        await requestJson(`/api/user-access/signup-requests/${encodeURIComponent(approve.id)}/approve`, { method: "POST", body: JSON.stringify(approveForm) });
        setApprove(null); await load(status); await onChanged();
      } finally { setBusy(false); }
    });
  };
  const reject = (request) => {
    protect({ title: "Reject sign up request", message: `Reject the request from ${request.username || request.email || "this applicant"}?` }, async () => {
      await requestJson(`/api/user-access/signup-requests/${encodeURIComponent(request.id)}/reject`, { method: "POST", body: "{}" });
      await load(status); await onChanged();
    });
  };

  return (
    <Modal title="Sign up requests" eyebrow="Review account requests." onClose={onClose} wide icon="signup">
      <div className="ua-signup-request-tabs" role="tablist">
        {["pending", "approved", "rejected"].map((item) => <button type="button" key={item} className={status === item ? "is-active" : ""} onClick={() => changeStatus(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      {error ? <div className="ua-form-error">{error}</div> : null}
      {loading ? <div className="ua-loading-inline"><span /> Loading requests...</div> : null}
      {!loading && !requests.length ? <div className="ua-empty ua-empty--requests">No {status} sign up requests.</div> : null}
      {!loading && requests.length ? <div className="ua-signup-requests-body next-ua-request-list">
        {requests.map((request) => (
          <article className={`ua-signup-request-card ${status === "approved" ? "ua-signup-request-card--approved" : status === "rejected" ? "ua-signup-request-card--rejected" : ""}`} key={request.id}>
            <div className="ua-signup-request-avatar">{initials(request.username)}</div>
            <div className="ua-signup-request-main">
              <div className="ua-signup-request-text"><strong>{request.username || "Unnamed applicant"}</strong><span>{request.email || "No email"} · {request.phone || "No phone"}</span><small>Employee code: {request.employeeCode || "—"} · Submitted {formatDate(request.createdAt)}</small>{request.reviewedBy ? <small>Reviewed by {request.reviewedBy} on {formatDate(request.reviewedAt)}</small> : null}</div>
              <span className={`ua-signup-request-status ${status === "approved" ? "ua-signup-request-status--approved" : status === "rejected" ? "ua-signup-request-status--rejected" : ""}`}>{request.status}</span>
            </div>
            {status === "pending" ? <div className="ua-signup-request-actions"><button type="button" className="ua-btn ua-btn--reject" onClick={() => reject(request)}>Reject</button><button type="button" className="ua-btn ua-btn--approve" onClick={() => beginApprove(request)}>Approve</button></div> : null}
          </article>
        ))}
      </div> : null}

      {approve ? <div className="next-ua-submodal-layer"><button type="button" className="next-ua-submodal-backdrop" onClick={() => setApprove(null)} aria-label="Close" /><form className="ua-modal ua-modal--small next-ua-submodal" onSubmit={submitApprove}><button type="button" className="ua-modal__close" onClick={() => setApprove(null)}><UAIcon name="close" /></button><div className="ua-modal__header ua-modal__header--compact"><div className="ua-modal__avatar ua-modal__avatar--icon"><UAIcon name="check" /></div><div><h2>Approve request</h2><p>{approve.username}</p></div></div><div className="ua-modal__body ua-modal__body--compact"><label className="ua-form-field ua-form-field--wide"><span>Department</span><select value={approveForm.department} onChange={(event) => setApproveForm((current) => ({ ...current, department: event.target.value }))}><option value="">Choose department</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label><label className="ua-form-field ua-form-field--wide"><span>Position</span><input value={approveForm.position} onChange={(event) => setApproveForm((current) => ({ ...current, position: event.target.value }))} placeholder="Example: Operations Engineer" /></label></div><div className="ua-modal__actions"><button type="button" className="ua-btn ua-btn--light" onClick={() => setApprove(null)}>Cancel</button><button type="submit" className="ua-btn ua-btn--dark" disabled={busy}>{busy ? "Approving..." : "Approve"}</button></div></form></div> : null}
    </Modal>
  );
}


function DepartmentForm({ department, onClose, onSaved }) {
  const [name, setName] = useState(department?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!text(name)) return setError("Department name is required.");
    setBusy(true); setError("");
    try {
      const url = department ? `/api/user-access/departments/${encodeURIComponent(department.id)}` : "/api/user-access/departments";
      await requestJson(url, { method: department ? "PATCH" : "POST", body: JSON.stringify({ name }) });
      await onSaved(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={department ? "Rename department" : "Department"} eyebrow={department ? "Rename this team department." : "Add a team department."} onClose={onClose} icon="folder">
      <form className="next-ua-form" onSubmit={submit}>
        <label className="ua-form-field ua-form-field--wide"><span>Department Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Operations" /></label>
        {error ? <div className="ua-form-error">{error}</div> : null}
        <div className="next-ua-inline-actions"><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button className="ua-btn ua-btn--dark" type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
      </form>
    </Modal>
  );
}


function MemberForm({ member, selectedDepartment, editableFields, departments, onClose, onSaved, onOpenPageAccess, onOpenSvAccess }) {
  const schema = useMemo(() => {
    const source = editableFields.length ? editableFields : [
      { name: "Profile picture", type: "files" }, { name: "Employee Code", type: "number" }, { name: "Name", type: "title", required: true }, { name: "Password", type: "rich_text" }, { name: "Phone", type: "phone_number" }, { name: "Email", type: "email" }, { name: "Department", type: "select" }, { name: "Position", type: "rich_text" }, { name: "Files & media", type: "files" }, { name: "School", type: "rich_text" },
    ];
    return source.filter((field) => !["allowedpages", "svschools"].includes(fieldKey(field.name)));
  }, [editableFields]);
  const initialValues = useMemo(() => Object.fromEntries(schema.map((field) => [field.name, member ? fieldValue(member, field.name) : (fieldKey(field.name) === "department" ? selectedDepartment?.name || "" : "")])), [schema, member, selectedDepartment]);
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  const upload = async (field, file) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) return setError("Files must be 12 MB or smaller.");
    setUploading(field.name); setError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("The file could not be read.")); reader.readAsDataURL(file); });
      const body = await requestJson("/api/user-access/upload-file", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name, kind: fieldKey(field.name).includes("profile") ? "profile-picture" : "file" }) });
      setValues((current) => ({ ...current, [field.name]: body.url || "" }));
    } catch (err) { setError(err.message); } finally { setUploading(""); }
  };

  const submit = async (event) => {
    event.preventDefault();
    const nameField = schema.find((field) => fieldKey(field.name) === "name")?.name || "Name";
    if (!text(values[nameField])) return setError("Name is required.");
    setBusy(true); setError("");
    try {
      const url = member ? `/api/user-access/team-members/${encodeURIComponent(member.id)}` : "/api/user-access/team-members";
      await requestJson(url, { method: member ? "PATCH" : "POST", body: JSON.stringify({ fields: values }) });
      await onSaved(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const renderField = (field) => {
    const key = fieldKey(field.name);
    const value = values[field.name] ?? "";
    if (field.type === "files") return <label className="ua-form-field ua-form-field--wide next-ua-file-field" key={field.name}><span>{field.name}</span><div className="ua-file-chip-list">{value ? <a className="ua-file-chip" href={value} target="_blank" rel="noreferrer"><UAIcon name="folder" /><span>Open current file</span></a> : <small className="ua-file-chip-empty">No file selected</small>}<label className="ua-btn ua-btn--light next-ua-file-pick">Choose file<input className="next-ua-hidden-file" type="file" accept={key.includes("profile") ? "image/*" : undefined} onChange={(event) => upload(field, event.target.files?.[0])} disabled={uploading === field.name} /></label>{value ? <button className="ua-btn ua-btn--light" type="button" onClick={() => setValues((current) => ({ ...current, [field.name]: "" }))}>Remove</button> : null}</div>{uploading === field.name ? <small>Uploading...</small> : null}</label>;
    if (key === "department") return <label className="ua-form-field" key={field.name}><span>{field.name}</span><select value={value} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}><option value="">Choose department</option>{departments.map((department) => <option value={department.name} key={department.id}>{department.name}</option>)}</select></label>;
    if (Array.isArray(field.options) && field.options.length) return <label className="ua-form-field" key={field.name}><span>{field.name}</span><select value={value} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}><option value="">Choose option</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
    const type = key === "password" ? "password" : field.type === "email" ? "email" : field.type === "phone_number" ? "tel" : field.type === "number" ? "number" : "text";
    return <label className="ua-form-field" key={field.name}><span>{field.name}{field.required ? " *" : ""}</span><input type={type} value={value} required={!!field.required} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /></label>;
  };

  return (
    <Modal title={member ? `Edit ${member.name}` : "Team Member"} eyebrow={member ? "Edit user data." : "Add a new team member."} onClose={onClose} wide icon="users">
      <form className="next-ua-member-form" onSubmit={submit}>
        <div className="next-ua-profile-head"><Avatar member={member || { name: values.Name, photoUrl: values["Profile picture"] }} large /><div><strong>{member ? member.name : "New account"}</strong><small>Update account details and department information.</small></div></div>
        <div className="ua-form-grid">{schema.map(renderField)}</div>
        {member ? <div className="next-ua-access-managers">
          <div className="ua-page-access-card"><div><strong>Page access</strong><small>{Number(member.pageAccessSummary?.accessCount || 0)} enabled pages</small></div><button type="button" className="ua-page-access-open" onClick={() => { onClose(); onOpenPageAccess(member); }}><UAIcon name="shield" /><span>Manage Access</span></button></div>
          <div className="ua-page-access-card ua-sv-access-card"><div><strong>Orders Supervision</strong><small>Control which team members appear in Orders Review.</small></div><button type="button" className="ua-page-access-open" onClick={() => { onClose(); onOpenSvAccess(member); }}><UAIcon name="users" /><span>Manage Users</span></button></div>
        </div> : null}
        {error ? <div className="ua-form-error">{error}</div> : null}
        <div className="next-ua-inline-actions"><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button className="ua-btn ua-btn--dark" type="submit" disabled={busy || !!uploading}>{busy ? "Saving..." : "Save"}</button></div>
      </form>
    </Modal>
  );
}


function MoveMemberModal({ member, departments, onClose, onSaved }) {
  const [departmentId, setDepartmentId] = useState(departments.find((department) => lower(department.name) !== lower(member.department))?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); const target = departments.find((department) => department.id === departmentId); if (!target) return setError("Choose a department.");
    setBusy(true); setError("");
    try { await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/department`, { method: "PATCH", body: JSON.stringify({ departmentId: target.id, department: target.name }) }); await onSaved(); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Move Member" eyebrow={`Move ${member.name} to another department.`} onClose={onClose} icon="move">
      <form className="next-ua-form" onSubmit={submit}>
        <label className="ua-form-field ua-form-field--wide"><span>Target Department</span><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Choose department</option>{departments.filter((department) => lower(department.name) !== lower(member.department)).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></label>
        {error ? <div className="ua-form-error">{error}</div> : null}
        <div className="next-ua-inline-actions"><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button type="submit" className="ua-btn ua-btn--dark" disabled={busy}>{busy ? "Moving..." : "Move"}</button></div>
      </form>
    </Modal>
  );
}


function PageAccessModal({ member, onClose, onSaved, protect }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/page-access`).then((body) => setRows(body.pages || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [member.id]);
  const grouped = useMemo(() => { const map = new Map(); for (const row of rows) { const key = text(row.moduleName) || "General"; if (!map.has(key)) map.set(key, []); map.get(key).push(row); } return [...map.entries()]; }, [rows]);
  const patch = (id, values) => setRows((items) => items.map((row) => text(row.pageId || row.id) === text(id) ? { ...row, ...values } : row));
  const save = () => protect({ title: "Save page access", message: `Apply this complete page-access matrix to ${member.name}?` }, async () => {
    setBusy(true); setError("");
    try {
      await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/page-access`, { method: "PATCH", body: JSON.stringify({ pages: rows.map((row) => ({ pageId: row.pageId || row.id, pageKey: row.pageKey, isEnabled: !!row.isEnabled, accessLevel: row.accessLevel || "view" })) }) });
      await onSaved(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  });
  const enabledCount = rows.filter((row) => row.isEnabled).length;
  return (
    <Modal title={`${member.name} · Page access`} eyebrow="Application permissions" onClose={onClose} extraWide icon="shield" footer={<><span className="next-ua-footer-summary">{enabledCount} enabled pages</span><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" onClick={save} disabled={busy || loading}>{busy ? "Saving..." : "Save access"}</button></>}>
      {loading ? <div className="ua-page-access-loading"><span /> Loading application pages...</div> : null}
      {error ? <div className="ua-form-error">{error}</div> : null}
      {!loading ? <div className="ua-page-access-body">
        <div className="ua-page-access-head"><span>Page</span><span>Access level</span><span>Enabled</span></div>
        <div className="ua-page-access-list">
          {grouped.map(([moduleName, pages]) => <section className="next-ua-page-group" key={moduleName}><div className="next-ua-page-group-title"><strong>{moduleName}</strong><span>{pages.filter((page) => page.isEnabled).length}/{pages.length}</span></div>{pages.map((page) => <div className={`ua-page-access-row ${page.isEnabled ? "" : "is-disabled"}`} key={page.pageId || page.id}><div className="ua-page-access-name"><strong>{page.pageName}</strong><small>{page.routePath || page.pageKey}</small></div><select value={page.accessLevel || "view"} disabled={!page.isEnabled} onChange={(event) => patch(page.pageId || page.id, { accessLevel: event.target.value })}><option value="view">View</option><option value="edit">Edit</option><option value="admin">Admin</option></select><div className="ua-page-access-enable"><label className="ua-switch"><input type="checkbox" checked={!!page.isEnabled} onChange={(event) => patch(page.pageId || page.id, { isEnabled: event.target.checked })} /><span /></label></div></div>)}</section>)}
        </div>
      </div> : null}
    </Modal>
  );
}


function SvAccessModal({ member, onClose, onSaved, protect }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/sv-access`).then((body) => setRows(body.members || [])).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, [member.id]);
  const visible = rows.filter((row) => !search || `${row.name} ${row.department} ${row.position} ${row.email}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (memberId) => setRows((items) => items.map((row) => row.memberId === memberId ? { ...row, isEnabled: !row.isEnabled } : row));
  const save = () => protect({ title: "Save Orders Review visibility", message: `Update which team members ${member.name} can see in Orders Review?` }, async () => {
    setBusy(true); setError("");
    try { await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}/sv-access`, { method: "PATCH", body: JSON.stringify({ members: rows.filter((row) => row.isEnabled).map((row) => ({ memberId: row.memberId })) }) }); await onSaved(); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  });
  return (
    <Modal title={`${member.name} · Orders Supervision`} eyebrow="Orders Review visibility" onClose={onClose} wide icon="users" footer={<><span className="next-ua-footer-summary">{rows.filter((row) => row.isEnabled).length} visible members</span><button type="button" className="ua-btn ua-btn--light" onClick={onClose}>Cancel</button><button type="button" className="ua-btn ua-btn--dark" disabled={busy || loading} onClick={save}>{busy ? "Saving..." : "Save visibility"}</button></>}>
      <div className="ua-sv-access-body">
        <div className="ua-sv-access-tools"><label className="ua-sv-search"><UAIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team members..." /></label></div>
        {loading ? <div className="ua-page-access-loading"><span /> Loading visibility list...</div> : null}
        {error ? <div className="ua-form-error">{error}</div> : null}
        {!loading ? <div className="ua-sv-access-list">{visible.map((row) => <div key={row.memberId} className={`ua-sv-access-row ${row.isEnabled ? "is-enabled" : ""}`}><div className="ua-sv-access-person"><Avatar member={{ name: row.name, photoUrl: row.photoUrl }} small /><span><strong><span className="ua-sv-access-name">{row.name}</span>{row.isSelf ? <em className="ua-sv-self-badge">This user</em> : null}</strong><small>{row.department || "No department"} · {row.position || "Team Member"} · {row.email || "No email"}</small></span></div><label className="ua-switch"><input type="checkbox" checked={!!row.isEnabled} onChange={() => toggle(row.memberId)} /><span /></label></div>)}</div> : null}
      </div>
    </Modal>
  );
}


export default function UsersCenterClient({ initialDirectory, initialSignupRequests, bootstrapWarnings = [] }) {
  const normalized = normalizeDirectory(initialDirectory);
  const [directory, setDirectory] = useState(normalized);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [passwordAction, setPasswordAction] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [departmentForm, setDepartmentForm] = useState(null);
  const [memberForm, setMemberForm] = useState(null);
  const [moveMember, setMoveMember] = useState(null);
  const [pageAccessMember, setPageAccessMember] = useState(null);
  const [svAccessMember, setSvAccessMember] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [pendingSignupCount, setPendingSignupCount] = useState((initialSignupRequests?.requests || []).length);
  const [memberMenu, setMemberMenu] = useState("");

  const selectedDepartment = directory.departments.find((department) => department.id === selectedDepartmentId) || null;
  const allMembers = useMemo(() => directory.departments.flatMap((department) => department.members || []), [directory]);
  const filteredDepartments = useMemo(() => {
    const q = lower(search);
    if (!q) return directory.departments;
    return directory.departments.filter((department) => `${department.name} ${(department.members || []).map((member) => `${member.name} ${member.email} ${member.phone} ${member.employeeCode}`).join(" ")}`.toLowerCase().includes(q));
  }, [directory, search]);
  const filteredMembers = useMemo(() => {
    if (!selectedDepartment) return [];
    const q = lower(search);
    return sortByName((selectedDepartment.members || []).filter((member) => !q || `${member.name} ${member.position} ${member.email} ${member.phone} ${member.employeeCode}`.toLowerCase().includes(q)));
  }, [selectedDepartment, search]);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = selectedDepartment ? "Search users inside this department..." : "Search departments, users, emails...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, [selectedDepartmentId]);

  useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest(".ua-member-menu-wrap")) setMemberMenu("");
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const notify = (type, title, message) => setToast({ type, title, message });
  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setBusy(true);
    try {
      const body = await requestJson(`/api/user-access/team-members?_fresh=1&_refresh=${Date.now()}`, { headers: { "X-Ops-Hard-Refresh": "1" } });
      const next = normalizeDirectory(body); setDirectory(next);
      if (selectedDepartmentId && !next.departments.some((department) => department.id === selectedDepartmentId)) setSelectedDepartmentId("");
      return next;
    } catch (err) { notify("error", "Refresh failed", err.message); throw err; } finally { if (!silent) setBusy(false); }
  };
  const refreshPending = async () => {
    try { const body = await requestJson(`/api/user-access/signup-requests?status=pending&_=${Date.now()}`); setPendingSignupCount((body.requests || []).length); } catch {}
  };

  const protect = async (descriptor, action) => {
    try {
      await requestJson("/api/user-access/admin/verify", { method: "POST", body: "{}" });
      await action();
    } catch (err) {
      if ([400, 401, 403].includes(err.status) && /password|required|invalid|verification/i.test(err.message)) {
        setPasswordAction({ ...descriptor, action });
      } else notify("error", descriptor?.title || "Action failed", err.message);
    }
  };

  const protectedOpen = (descriptor, opener) => protect(descriptor, async () => opener());
  const deleteDepartment = (department) => protectedOpen({ title: "Delete department", message: `Delete ${department.name}? Existing members will move to No Department automatically.` }, () => setConfirm({ danger: true, title: "Delete department", message: `Delete the ${department.name} department folder? Existing members will move to No Department.`, confirmLabel: "Delete department", onConfirm: async () => { await requestJson(`/api/user-access/departments/${encodeURIComponent(department.id)}`, { method: "DELETE" }); await refresh({ silent: true }); notify("success", "Department deleted", `${department.name} was removed.`); setConfirm(null); } }));
  const deleteMember = (member) => protectedOpen({ title: "Delete team member", message: `Delete ${member.name} and revoke their access?` }, () => setConfirm({ danger: true, title: "Delete team member", message: `This permanently deletes ${member.name}'s account and related access records.`, confirmLabel: "Delete member", onConfirm: async () => { await requestJson(`/api/user-access/team-members/${encodeURIComponent(member.id)}`, { method: "DELETE" }); await refresh({ silent: true }); notify("success", "Member deleted", `${member.name} was removed.`); setConfirm(null); } }));

  return (
    <section className="ua-page-body next-ua-workspace">
      <Toast value={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="ua-error next-ua-bootstrap-warning">Some optional Users Center data loaded after the page opened. Refresh if a section looks incomplete.</div> : null}

      {!selectedDepartment ? (
        <section className="ua-folders-panel">
          <div className="ua-section-head ua-section-head--folders ua-section-head--folders-actions-only">
            <div className="ua-folder-actions">
              <div className="ua-count-pill">{directory.total} {directory.total === 1 ? "user" : "users"}</div>
              <button type="button" className="ua-dept-btn ua-dept-btn--requests" onClick={() => setSignupOpen(true)}><UAIcon name="signup" /><span>Sign up requests</span>{pendingSignupCount ? <small>{pendingSignupCount}</small> : null}</button>
              <button type="button" className="ua-dept-btn ua-dept-btn--add" onClick={() => protectedOpen({ title: "Create department", message: "Create a new department folder?" }, () => setDepartmentForm({ department: null }))}><UAIcon name="folderPlus" /><span>New Department</span></button>
              <button type="button" className={`ua-refresh ${busy ? "is-loading" : ""}`} disabled={busy} onClick={() => refresh()}><UAIcon name="refresh" /><span>{busy ? "Refreshing..." : "Refresh"}</span></button>
            </div>
          </div>
          {!filteredDepartments.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-folders">
            {filteredDepartments.map((department) => {
              const count = Number(department.count || department.members?.length || 0);
              const canEdit = lower(department.name) !== "no department";
              return <article className="ua-folder" key={department.id} role="button" tabIndex={0} onClick={() => { setSelectedDepartmentId(department.id); setSearch(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDepartmentId(department.id); setSearch(""); } }}>
                <div className="ua-folder__main"><span className="ua-folder__icon"><UAIcon name="folder" /></span><span className="ua-folder__text"><span className="ua-folder__name" title={department.name}>{department.name}</span><span className="ua-folder__count">{count} {count === 1 ? "member" : "members"}{!count ? <span className="ua-folder__badge">Empty</span> : null}</span></span></div>
                <div className="ua-folder__actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="ua-folder__edit" disabled={!canEdit} onClick={() => protectedOpen({ title: "Rename department", message: `Rename ${department.name}?` }, () => setDepartmentForm({ department }))}><UAIcon name="edit" /><span>Edit</span></button>
                  <button type="button" className="ua-folder__delete" disabled={!canEdit} onClick={() => deleteDepartment(department)}><UAIcon name="trash" /><span>Delete</span></button>
                  <button type="button" className="ua-folder__open" onClick={() => { setSelectedDepartmentId(department.id); setSearch(""); }} aria-label={`Open ${department.name}`}><UAIcon name="chevron" /></button>
                </div>
              </article>;
            })}
          </div>}
        </section>
      ) : (
        <section className="ua-members-panel">
          <div className="ua-section-head ua-section-head--members">
            <div className="ua-member-heading-left"><button type="button" className="ua-back-btn" onClick={() => { setSelectedDepartmentId(""); setSearch(""); }} aria-label="Back to departments"><UAIcon name="back" /></button><div><h3>{selectedDepartment.name} Members</h3></div></div>
            <div className="ua-members-actions"><span className="ua-count-pill">{filteredMembers.length} {filteredMembers.length === 1 ? "member" : "members"}</span><button type="button" className="ua-add-member-btn" onClick={() => protectedOpen({ title: "Add team member", message: `Create a new account in ${selectedDepartment.name}?` }, () => setMemberForm({ mode: "create", member: null }))}><UAIcon name="addUser" /><span>Add Member</span></button><button type="button" className={`ua-refresh ${busy ? "is-loading" : ""}`} disabled={busy} onClick={() => refresh()}><UAIcon name="refresh" /><span>{busy ? "Refreshing..." : "Refresh"}</span></button></div>
          </div>
          {!filteredMembers.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-members-grid">
            {filteredMembers.map((member) => <article className="ua-member-card" key={member.id}>
              <div className="ua-member-card__top">
                <Avatar member={member} />
                <div className="ua-member-card__identity"><h4 title={member.name}>{member.name}</h4><p title={member.position || "Team Member"}>{member.position || "Team Member"}</p></div>
                <div className="ua-member-menu-wrap">
                  <button type="button" className="ua-member-menu-btn" onClick={(event) => { event.stopPropagation(); setMemberMenu((current) => current === member.id ? "" : member.id); }} aria-label={`More actions for ${member.name}`}><span className="ua-member-menu-dots">•••</span></button>
                  <div className="ua-member-menu" hidden={memberMenu !== member.id}>
                    <button type="button" onClick={() => { setMemberMenu(""); protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member)); }}><UAIcon name="move" /><span>Move</span></button>
                    <button type="button" className="is-danger" onClick={() => { setMemberMenu(""); deleteMember(member); }}><UAIcon name="trash" /><span>Delete</span></button>
                  </div>
                </div>
              </div>
              <div className="ua-member-card__meta"><div className="ua-meta-line" title={member.employeeCode || "No employee code"}><UAIcon name="hash" /><span>{member.employeeCode || "No employee code"}</span></div><div className="ua-meta-line" title={member.phone || "No phone"}><UAIcon name="phone" /><span>{member.phone || "No phone"}</span></div><div className="ua-meta-line" title={member.email || "No email"}><UAIcon name="mail" /><span>{member.email || "No email"}</span></div></div>
              <div className="ua-member-card__actions"><button type="button" className="ua-btn ua-btn--dark" onClick={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => setMemberForm({ mode: "edit", member }))}><UAIcon name="edit" /><span>Edit</span></button></div>
            </article>)}
          </div>}
        </section>
      )}

      {passwordAction ? <PasswordModal action={passwordAction} onClose={() => setPasswordAction(null)} onVerified={async () => { const action = passwordAction.action; setPasswordAction(null); try { await action(); } catch (err) { notify("error", "Action failed", err.message); } }} /> : null}
      {confirm ? <ConfirmModal value={confirm} onClose={() => setConfirm(null)} onConfirm={confirm.onConfirm} /> : null}
      {departmentForm ? <DepartmentForm department={departmentForm.department} onClose={() => setDepartmentForm(null)} onSaved={async () => { await refresh({ silent: true }); notify("success", "Department saved", "The department directory was updated."); }} /> : null}
      {memberForm ? <MemberForm member={memberForm.member} selectedDepartment={selectedDepartment} editableFields={directory.editableFields} departments={directory.departments} onClose={() => setMemberForm(null)} onOpenPageAccess={setPageAccessMember} onOpenSvAccess={setSvAccessMember} onSaved={async () => { await refresh({ silent: true }); notify("success", memberForm.member ? "Member updated" : "Member created", "The team directory was updated."); }} /> : null}
      {moveMember ? <MoveMemberModal member={moveMember} departments={directory.departments} onClose={() => setMoveMember(null)} onSaved={async () => { await refresh({ silent: true }); notify("success", "Member moved", `${moveMember.name} was moved successfully.`); }} /> : null}
      {pageAccessMember ? <PageAccessModal member={pageAccessMember} onClose={() => setPageAccessMember(null)} protect={protect} onSaved={async () => { await refresh({ silent: true }); notify("success", "Page access saved", `${pageAccessMember.name}'s permissions were updated.`); }} /> : null}
      {svAccessMember ? <SvAccessModal member={svAccessMember} onClose={() => setSvAccessMember(null)} protect={protect} onSaved={async () => { await refresh({ silent: true }); notify("success", "Visibility saved", `${svAccessMember.name}'s Orders Review visibility was updated.`); }} /> : null}
      {signupOpen ? <SignupRequestsModal departments={directory.departments} onClose={() => setSignupOpen(false)} protect={protect} onChanged={async () => { await Promise.all([refresh({ silent: true }), refreshPending()]); }} /> : null}
    </section>
  );
}

