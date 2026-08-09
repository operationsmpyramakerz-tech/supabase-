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

function Modal({ title, eyebrow, onClose, children, wide = false, extraWide = false, footer = null }) {
  return (
    <div className="next-users-modal-layer" role="presentation">
      <button type="button" className="next-users-modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <section className={`next-users-modal ${wide ? "next-users-modal--wide" : ""} ${extraWide ? "next-users-modal--extra-wide" : ""}`} role="dialog" aria-modal="true">
        <header><div><small>{eyebrow}</small><h3>{title}</h3></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-users-modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
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
    <Modal title={action?.title || "Admin authorization"} eyebrow="Protected Users Center action" onClose={onClose}>
      <form className="next-users-password-form" onSubmit={submit}>
        <p>{action?.message || "Enter the Admin password to continue."}</p>
        <label>Admin password<input type="password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-users-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Verifying..." : "Continue"}</button></div>
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
    <Modal title={value?.title || "Confirm action"} eyebrow={value?.danger ? "Destructive action" : "Confirmation"} onClose={busy ? () => {} : onClose}>
      <div className="next-users-confirm">
        <div className={value?.danger ? "danger" : "info"}>{value?.danger ? "!" : "i"}</div>
        <p>{value?.message}</p>
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-users-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={value?.danger ? "danger-button" : "primary-button"} disabled={busy} onClick={confirm}>{busy ? "Working..." : (value?.confirmLabel || "Confirm")}</button></div>
      </div>
    </Modal>
  );
}

function Avatar({ member, large = false }) {
  return member?.photoUrl ? <img className={`next-users-avatar ${large ? "large" : ""}`} src={member.photoUrl} alt={member.name || "User"} /> : <span className={`next-users-avatar ${large ? "large" : ""}`}>{initials(member?.name)}</span>;
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
    <Modal title="Sign up requests" eyebrow="Account onboarding" onClose={onClose} wide>
      <div className="next-users-tabs">{["pending", "approved", "rejected"].map((item) => <button type="button" key={item} className={status === item ? "active" : ""} onClick={() => changeStatus(item)}>{item}<span>{status === item ? requests.length : ""}</span></button>)}</div>
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
      {loading ? <div className="next-users-modal-loading">Loading requests...</div> : null}
      {!loading && !requests.length ? <div className="next-users-empty"><strong>No {status} requests</strong><span>There are no sign up requests in this status.</span></div> : null}
      {!loading && requests.length ? <div className="next-users-request-list">{requests.map((request) => <article key={request.id}><div className="next-users-request-avatar">{initials(request.username)}</div><div><h4>{request.username || "Unnamed applicant"}</h4><p>{request.email || "No email"} · {request.phone || "No phone"}</p><small>Employee code: {request.employeeCode || "—"} · Submitted {formatDate(request.createdAt)}</small>{request.reviewedBy ? <small>Reviewed by {request.reviewedBy} on {formatDate(request.reviewedAt)}</small> : null}</div><span className={`next-users-status ${lower(request.status)}`}>{request.status}</span>{status === "pending" ? <footer><button type="button" className="secondary-button" onClick={() => reject(request)}>Reject</button><button type="button" className="primary-button" onClick={() => beginApprove(request)}>Approve</button></footer> : null}</article>)}</div> : null}
      {approve ? <div className="next-users-submodal"><button type="button" className="next-users-submodal-backdrop" onClick={() => setApprove(null)} /><form onSubmit={submitApprove}><header><div><small>Approve request</small><h4>{approve.username}</h4></div><button type="button" onClick={() => setApprove(null)}>×</button></header><label>Department<select value={approveForm.department} onChange={(event) => setApproveForm((current) => ({ ...current, department: event.target.value }))}><option value="">Choose department</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label><label>Position<input value={approveForm.position} onChange={(event) => setApproveForm((current) => ({ ...current, position: event.target.value }))} placeholder="Example: Operations Engineer" /></label><div className="next-users-form-actions"><button type="button" className="secondary-button" onClick={() => setApprove(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Approving..." : "Approve account"}</button></div></form></div> : null}
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
  return <Modal title={department ? "Rename department" : "New department"} eyebrow="Department folders" onClose={onClose}><form className="next-users-simple-form" onSubmit={submit}><label>Department name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Operations" /></label>{error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}<div className="next-users-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving..." : "Save department"}</button></div></form></Modal>;
}

function MemberForm({ member, selectedDepartment, editableFields, departments, onClose, onSaved }) {
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
    if (field.type === "files") return <label className="next-users-file-field" key={field.name}><span>{field.name}</span><div>{value ? <a href={value} target="_blank" rel="noreferrer">Open current file</a> : <small>No file selected</small>}<input type="file" accept={key.includes("profile") ? "image/*" : undefined} onChange={(event) => upload(field, event.target.files?.[0])} disabled={uploading === field.name} /><button type="button" onClick={() => setValues((current) => ({ ...current, [field.name]: "" }))} disabled={!value}>Remove</button></div>{uploading === field.name ? <small>Uploading...</small> : null}</label>;
    if (key === "department") return <label key={field.name}><span>{field.name}</span><select value={value} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}><option value="">Choose department</option>{departments.map((department) => <option value={department.name} key={department.id}>{department.name}</option>)}</select></label>;
    if (Array.isArray(field.options) && field.options.length) return <label key={field.name}><span>{field.name}</span><select value={value} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}><option value="">Choose option</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
    const type = key === "password" ? "password" : field.type === "email" ? "email" : field.type === "phone_number" ? "tel" : field.type === "number" ? "number" : "text";
    return <label key={field.name}><span>{field.name}{field.required ? " *" : ""}</span><input type={type} value={value} required={!!field.required} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /></label>;
  };

  return (
    <Modal title={member ? `Edit ${member.name}` : "Add team member"} eyebrow="Account record" onClose={onClose} wide>
      <form className="next-users-member-form" onSubmit={submit}>
        <div className="next-users-member-form-head"><Avatar member={member || { name: values.Name, photoUrl: values["Profile picture"] }} large /><div><h4>{member ? member.name : "New account"}</h4><p>Update account details. Page access and Orders Review visibility are managed from the member card.</p></div></div>
        <div className="next-users-form-grid">{schema.map(renderField)}</div>
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-users-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !!uploading}>{busy ? "Saving..." : "Save member"}</button></div>
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
  return <Modal title={`Move ${member.name}`} eyebrow="Department assignment" onClose={onClose}><form className="next-users-simple-form" onSubmit={submit}><label>New department<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Choose department</option>{departments.filter((department) => lower(department.name) !== lower(member.department)).map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></label>{error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}<div className="next-users-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Moving..." : "Move member"}</button></div></form></Modal>;
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
    <Modal title={`${member.name} · Page access`} eyebrow="Application permissions" onClose={onClose} extraWide footer={<div className="next-users-modal-footer"><span>{enabledCount} enabled pages</span><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" onClick={save} disabled={busy || loading}>{busy ? "Saving..." : "Save access"}</button></div></div>}>
      {loading ? <div className="next-users-modal-loading">Loading application pages...</div> : null}
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
      {!loading ? <div className="next-users-access-groups">{grouped.map(([moduleName, pages]) => <section key={moduleName}><header><h4>{moduleName}</h4><span>{pages.filter((page) => page.isEnabled).length}/{pages.length}</span></header><div>{pages.map((page) => <article key={page.pageId || page.id} className={page.isEnabled ? "enabled" : ""}><label><input type="checkbox" checked={!!page.isEnabled} onChange={(event) => patch(page.pageId || page.id, { isEnabled: event.target.checked })} /><span><strong>{page.pageName}</strong><small>{page.routePath || page.pageKey}</small></span></label><select value={page.accessLevel || "view"} disabled={!page.isEnabled} onChange={(event) => patch(page.pageId || page.id, { accessLevel: event.target.value })}><option value="view">View</option><option value="edit">Edit</option><option value="admin">Admin</option></select></article>)}</div></section>)}</div> : null}
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
    <Modal title={`${member.name} · Orders Review visibility`} eyebrow="S.V Schools access" onClose={onClose} wide footer={<div className="next-users-modal-footer"><span>{rows.filter((row) => row.isEnabled).length} visible members</span><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy || loading} onClick={save}>{busy ? "Saving..." : "Save visibility"}</button></div></div>}>
      <label className="next-users-modal-search"><span>Search team members</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, department, position..." /></label>
      {loading ? <div className="next-users-modal-loading">Loading visibility list...</div> : null}
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
      {!loading ? <div className="next-users-sv-list">{visible.map((row) => <label key={row.memberId} className={row.isEnabled ? "enabled" : ""}><input type="checkbox" checked={!!row.isEnabled} onChange={() => toggle(row.memberId)} /><Avatar member={{ name: row.name, photoUrl: row.photoUrl }} /><span><strong>{row.name}{row.isSelf ? " · This user" : ""}</strong><small>{row.department || "No department"} · {row.position || "Team Member"}</small><em>{row.email || "No email"}</em></span></label>)}</div> : null}
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
  const positions = unique(allMembers.map((member) => member.position));
  const adminAccounts = allMembers.filter((member) => Number(member.pageAccessSummary?.adminCount || member.adminCount || 0) > 0).length;

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
    <section className="next-users-page">
      <Toast value={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="next-inline-warning">Some optional Users Center data loaded after the page opened. Refresh if a section looks incomplete.</div> : null}

      <section className="next-users-hero">
        <div><span className="pill">Account administration</span><h2>Manage people, departments, and access in one place.</h2><p>Keep team records current, review new account requests, and control each user's application permissions without leaving the Next.js workspace.</p><div className="next-users-hero-actions"><button type="button" className="primary-button" onClick={() => protectedOpen({ title: "Add team member", message: "Create a new team account?" }, () => setMemberForm({ mode: "create", member: null }))}>+ Add member</button><button type="button" className="secondary-button" onClick={() => protectedOpen({ title: "Create department", message: "Create a new department folder?" }, () => setDepartmentForm({ department: null }))}>+ New department</button><button type="button" className="secondary-button" onClick={() => setSignupOpen(true)}>Sign up requests {pendingSignupCount ? <b>{pendingSignupCount}</b> : null}</button></div></div>
        <div className="next-users-hero-orbit"><span>{directory.total}</span><small>team accounts</small><i>{directory.departments.length} departments</i></div>
      </section>

      <section className="next-users-stats">
        <article><small>Team members</small><strong>{directory.total}</strong><span>Active records in the directory</span></article>
        <article><small>Departments</small><strong>{directory.departments.length}</strong><span>Organizational folders</span></article>
        <article><small>Positions</small><strong>{positions.length}</strong><span>Distinct job titles</span></article>
        <article><small>Admin access</small><strong>{adminAccounts}</strong><span>Users with at least one Admin page</span></article>
      </section>

      <section className="next-users-toolbar">
        <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={selectedDepartment ? "Search inside this department..." : "Search departments, names, emails..."} /></label>
        <div><button type="button" className="secondary-button" disabled={busy} onClick={() => refresh()}>{busy ? "Refreshing..." : "Refresh"}</button><a className="secondary-button" href="/user-access?classic=1">Classic view</a></div>
      </section>

      {!selectedDepartment ? (
        <section className="next-users-directory-section">
          <header><div><small>Department directory</small><h3>Choose a department</h3></div><span>{filteredDepartments.length} folders</span></header>
          {!filteredDepartments.length ? <div className="next-users-empty"><strong>No departments found</strong><span>Try another search phrase or add a new department.</span></div> : <div className="next-users-department-grid">{filteredDepartments.map((department) => <article key={department.id}><button type="button" className="next-users-department-main" onClick={() => { setSelectedDepartmentId(department.id); setSearch(""); }}><span className="next-users-folder-icon">▰</span><div><h4>{department.name}</h4><p>{department.count || department.members.length} {(department.count || department.members.length) === 1 ? "member" : "members"}</p></div><b>→</b></button><footer><button type="button" onClick={() => protectedOpen({ title: "Rename department", message: `Rename ${department.name}?` }, () => setDepartmentForm({ department }))}>Rename</button><button type="button" className="danger" disabled={lower(department.name) === "no department"} onClick={() => deleteDepartment(department)}>Delete</button></footer></article>)}</div>}
        </section>
      ) : (
        <section className="next-users-members-section">
          <header><div><button type="button" className="next-users-back" onClick={() => { setSelectedDepartmentId(""); setSearch(""); }}>←</button><div><small>Department members</small><h3>{selectedDepartment.name}</h3></div></div><div><span>{filteredMembers.length} visible</span><button type="button" className="primary-button" onClick={() => protectedOpen({ title: "Add team member", message: `Create a new account in ${selectedDepartment.name}?` }, () => setMemberForm({ mode: "create", member: null }))}>+ Add member</button></div></header>
          {!filteredMembers.length ? <div className="next-users-empty"><strong>No members found</strong><span>This department is empty or no account matches your search.</span></div> : <div className="next-users-member-grid">{filteredMembers.map((member) => <article key={member.id}><header><Avatar member={member} /><div><h4>{member.name}</h4><p>{member.position || "Team Member"}</p></div><span className="next-users-access-badge">{member.pageAccessSummary?.accessCount || 0} pages</span></header><div className="next-users-member-meta"><p><b>#</b><span>{member.employeeCode || "No employee code"}</span></p><p><b>@</b><span>{member.email || "No email"}</span></p><p><b>☎</b><span>{member.phone || "No phone"}</span></p><p><b>◷</b><span>Updated {formatDate(member.lastEditedTime)}</span></p></div><footer><button type="button" className="primary-button" onClick={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => setMemberForm({ mode: "edit", member }))}>Edit</button><button type="button" className="secondary-button" onClick={() => setPageAccessMember(member)}>Page access</button><button type="button" className="secondary-button" onClick={() => setSvAccessMember(member)}>S.V visibility</button><div><button type="button" onClick={() => protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member))}>Move</button><button type="button" className="danger" onClick={() => deleteMember(member)}>Delete</button></div></footer></article>)}</div>}
        </section>
      )}

      {passwordAction ? <PasswordModal action={passwordAction} onClose={() => setPasswordAction(null)} onVerified={async () => { const action = passwordAction.action; setPasswordAction(null); try { await action(); } catch (err) { notify("error", "Action failed", err.message); } }} /> : null}
      {confirm ? <ConfirmModal value={confirm} onClose={() => setConfirm(null)} onConfirm={confirm.onConfirm} /> : null}
      {departmentForm ? <DepartmentForm department={departmentForm.department} onClose={() => setDepartmentForm(null)} onSaved={async () => { await refresh({ silent: true }); notify("success", "Department saved", "The department directory was updated."); }} /> : null}
      {memberForm ? <MemberForm member={memberForm.member} selectedDepartment={selectedDepartment} editableFields={directory.editableFields} departments={directory.departments} onClose={() => setMemberForm(null)} onSaved={async () => { await refresh({ silent: true }); notify("success", memberForm.member ? "Member updated" : "Member created", "The team directory was updated."); }} /> : null}
      {moveMember ? <MoveMemberModal member={moveMember} departments={directory.departments} onClose={() => setMoveMember(null)} onSaved={async () => { await refresh({ silent: true }); notify("success", "Member moved", `${moveMember.name} was moved successfully.`); }} /> : null}
      {pageAccessMember ? <PageAccessModal member={pageAccessMember} onClose={() => setPageAccessMember(null)} protect={protect} onSaved={async () => { await refresh({ silent: true }); notify("success", "Page access saved", `${pageAccessMember.name}'s permissions were updated.`); }} /> : null}
      {svAccessMember ? <SvAccessModal member={svAccessMember} onClose={() => setSvAccessMember(null)} protect={protect} onSaved={async () => { await refresh({ silent: true }); notify("success", "Visibility saved", `${svAccessMember.name}'s Orders Review visibility was updated.`); }} /> : null}
      {signupOpen ? <SignupRequestsModal departments={directory.departments} onClose={() => setSignupOpen(false)} protect={protect} onChanged={async () => { await Promise.all([refresh({ silent: true }), refreshPending()]); }} /> : null}
    </section>
  );
}
