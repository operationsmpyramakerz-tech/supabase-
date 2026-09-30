"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ActionLoadingModal from "../ActionLoadingModal";
import { cacheUsersCenterAuthorization, currentUsersCenterAuthorizationToken, requestJson, usersCenterMutation } from "./usersCenterClientShared";

const UsersCenterDialogs = dynamic(() => import("./UsersCenterDialogs"), { ssr: false });

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function initials(value) { const parts = text(value || "User").split(/\s+/).filter(Boolean).slice(0, 2); return (parts.map((part) => part[0]).join("") || "U").toUpperCase(); }
function unique(values) { const out = []; const seen = new Set(); for (const value of values || []) { const clean = text(value); const key = lower(clean); if (!clean || seen.has(key)) continue; seen.add(key); out.push(clean); } return out; }
function sortByName(rows) { return [...(rows || [])].sort((a, b) => text(a?.name).localeCompare(text(b?.name))); }
function normalizeAccessLevel(value) { const raw = lower(value); return raw === "admin" ? "admin" : raw === "view" ? "view" : "edit"; }

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

function Toast({ value, onClose }) {
  if (!value) return null;
  return <div className={`next-toast next-toast--${value.type || "info"}`} role="status"><span>{value.type === "success" ? "✓" : value.type === "error" ? "!" : "i"}</span><div><strong>{value.title || "Users Center"}</strong><small>{value.message}</small></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>;
}

let modalCount = 0;
function Avatar({ member, small = false }) {
  const cls = `ua-avatar${small ? " ua-avatar--small" : ""}`;
  return member?.photoUrl ? <div className={cls}><img src={member.photoUrl} alt={member.name || "User"} loading="lazy"/></div> : <div className={cls}>{initials(member?.name)}</div>;
}

function DepartmentFolder({ department, actionsOpen = false, onOpen, onActionsOpen, onEdit, onDelete }) {
  const longPressTimer = useRef(null);
  const suppressClick = useRef(false);
  const count = Number(department?.count || department?.members?.length || 0);
  const canEdit = lower(department?.name) !== "no department";

  useEffect(() => () => window.clearTimeout(longPressTimer.current), []);

  function clearLongPress() {
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function startLongPress(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearLongPress();
    suppressClick.current = false;
    longPressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      onActionsOpen?.(department.id);
      try { navigator.vibrate?.(18); } catch {}
    }, 520);
  }

  function handleOpen() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen?.(department.id);
  }

  function handleContextMenu(event) {
    event.preventDefault();
    clearLongPress();
    suppressClick.current = true;
    onActionsOpen?.(department.id);
  }

  return <article
    className={`ua-folder ${actionsOpen ? "is-actions-open" : ""}`}
    role="button"
    tabIndex={0}
    aria-label={`Open ${department.name} department. Press and hold for actions.`}
    aria-haspopup="menu"
    aria-expanded={actionsOpen}
    onPointerDown={startLongPress}
    onPointerUp={clearLongPress}
    onPointerCancel={clearLongPress}
    onPointerLeave={clearLongPress}
    onContextMenu={handleContextMenu}
    onClick={handleOpen}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen?.(department.id);
      }
      if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
        event.preventDefault();
        onActionsOpen?.(department.id);
      }
    }}
  >
    {actionsOpen ? <div className="ua-folder__menu" role="menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" disabled={!canEdit} title={!canEdit ? "Default fallback department cannot be renamed" : undefined} onClick={() => onEdit?.(department)}>
        <UAIcon name="edit"/><span>Edit</span>
      </button>
      <button type="button" role="menuitem" className="is-danger" disabled={!canEdit} title={!canEdit ? "Default fallback department cannot be deleted" : undefined} onClick={() => onDelete?.(department)}>
        <UAIcon name="trash"/><span>Delete</span>
      </button>
    </div> : null}
    <span className="ua-folder__icon" aria-hidden="true"><UAIcon name="users"/></span>
    <span className="ua-folder__text">
      <span className="ua-folder__name" title={department.name}>{department.name}</span>
      <span className="ua-folder__count">{count} {count === 1 ? "member" : "members"}{!count ? <span className="ua-folder__badge">Empty</span> : null}</span>
    </span>
  </article>;
}

function AddDepartmentFolder({ onClick }) {
  return <button type="button" className="ua-folder ua-folder--add" onClick={onClick} aria-label="Add new department">
    <span className="ua-folder-add__copy">
      <strong>Add new</strong>
      <small>Create a people folder</small>
    </span>
    <span className="ua-folder-add__plus" aria-hidden="true"><UAIcon name="plus"/></span>
  </button>;
}


export default function UsersCenterClient({ initialDirectory, initialSignupRequests, bootstrapWarnings = [] }) {
  const [directory, setDirectory] = useState(() => normalizeDirectory(initialDirectory));
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(""); const [search, setSearch] = useState(""); const [departmentActions, setDepartmentActions] = useState(""); const [toast, setToast] = useState(null); const [passwordAction, setPasswordAction] = useState(null); const [confirm, setConfirm] = useState(null); const [departmentForm, setDepartmentForm] = useState(null); const [memberForm, setMemberForm] = useState(null); const [memberDetailLoading, setMemberDetailLoading] = useState(false); const [moveMember, setMoveMember] = useState(null); const [signupOpen, setSignupOpen] = useState(false); const [pendingSignupCount, setPendingSignupCount] = useState((initialSignupRequests?.requests || []).length); const [memberMenu, setMemberMenu] = useState(""); const [pageAccessOpen, setPageAccessOpen] = useState(false); const [svAccessOpen, setSvAccessOpen] = useState(false); const [pageAccessRows, setPageAccessRows] = useState([]); const [svRows, setSvRows] = useState([]);
  const selectedDepartment = directory.departments.find((department) => department.id === selectedDepartmentId) || null;
  const allMembers = useMemo(() => directory.departments.flatMap((department) => department.members || []), [directory]);
  const positionOptions = useMemo(() => unique(allMembers.map((member) => member.position)).sort((a, b) => a.localeCompare(b)), [allMembers]);
  const filteredDepartments = useMemo(() => { const q = lower(search); if (!q) return directory.departments; return directory.departments.filter((department) => lower(`${department.name} ${(department.members || []).map((member) => `${member.name} ${member.email} ${member.phone} ${member.employeeCode}`).join(" ")}`).includes(q)); }, [directory, search]);
  const filteredMembers = useMemo(() => { if (!selectedDepartment) return []; const q = lower(search); return sortByName((selectedDepartment.members || []).filter((member) => !q || lower(`${member.name} ${member.position} ${member.email} ${member.phone} ${member.employeeCode}`).includes(q))); }, [selectedDepartment, search]);

  function notify(type, title, message) { setToast({ type, title, message }); window.clearTimeout(notify._timer); notify._timer = window.setTimeout(() => setToast(null), 3500); }
  async function refresh() {
    const stamp = Date.now();
    const body = await requestJson(`/next/api/users-center/directory?fresh=1&_=${stamp}`, { headers: { "X-Ops-Hard-Refresh": "1" } });
    const next = normalizeDirectory(body);
    setDirectory(next);
    return next;
  }
  async function refreshPending() {
    try {
      const stamp = Date.now();
      const body = await requestJson(`/next/api/users-center/signup-requests?status=pending&fresh=1&_=${stamp}`);
      setPendingSignupCount((body.requests || []).length);
    } catch {}
  }

  function writeDepartmentUrl(id, push = true) { if (typeof window === "undefined") return; const url = new URL(window.location.href); if (id) url.searchParams.set("department", id); else url.searchParams.delete("department"); const next = `${url.pathname}${url.search}${url.hash}`; if (push) window.history.pushState({}, "", next); else window.history.replaceState({}, "", next); }
  function navigateDepartment(id, push = true) { setDepartmentActions(""); setSelectedDepartmentId(id || ""); setSearch(""); writeDepartmentUrl(id, push); window.setTimeout(() => document.querySelector(".ua-members-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }
  function backDepartments(push = true) { setDepartmentActions(""); setSelectedDepartmentId(""); setSearch(""); writeDepartmentUrl("", push); }

  useEffect(() => { const read = () => { const id = new URLSearchParams(window.location.search).get("department") || ""; if (id && directory.departments.some((department) => department.id === id)) setSelectedDepartmentId(id); else setSelectedDepartmentId(""); }; read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, [directory.departments.length]);
  useEffect(() => { const input = document.querySelector(".classic-app-shell .main-header .searchbar input"); if (!input) return undefined; input.value = search; input.placeholder = selectedDepartment ? "Search users inside this department..." : "Search departments, users, emails..."; const handle = (event) => setSearch(event.target.value || ""); input.addEventListener("input", handle); return () => input.removeEventListener("input", handle); }, [selectedDepartmentId]);
  useEffect(() => { function close(event) { if (!event.target.closest(".ua-member-menu-wrap")) setMemberMenu(""); } document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, []);
  useEffect(() => { function closeDepartmentActions(event) { if (!event.target.closest(".ua-folder")) setDepartmentActions(""); } document.addEventListener("pointerdown", closeDepartmentActions); return () => document.removeEventListener("pointerdown", closeDepartmentActions); }, []);

  async function protect(descriptor, action) { try { if (currentUsersCenterAuthorizationToken()) return await action(); const probe = await requestJson("/next/api/users-center/admin/verify", { method: "POST", body: "{}" }); if (probe?.ok) { cacheUsersCenterAuthorization(probe); return await action(); } return undefined; } catch (err) { if ([400, 403].includes(err.status) && /password|required|invalid|verification|authorization/i.test(err.message)) setPasswordAction({ ...descriptor, action }); else notify("error", descriptor?.title || "Action failed", err.message); return undefined; } }
  function protectedOpen(descriptor, opener) { return protect(descriptor, async () => opener()); }
  async function openMember(mode, member = null) {
    setPageAccessRows([]);
    setSvRows([]);
    if (mode !== "edit" || !member?.id) {
      setMemberForm({ mode, member });
      return;
    }

    setMemberDetailLoading(true);
    try {
      const body = await requestJson(`/next/api/users-center/member?id=${encodeURIComponent(member.id)}&_=${Date.now()}`);

      const detailedMember = body?.member ? {
        ...member,
        ...body.member,
        pageAccessSummary: body.member.pageAccessSummary || member.pageAccessSummary,
        svAccessSummary: body.member.svAccessSummary || member.svAccessSummary,
      } : member;
      if (Array.isArray(body?.pageAccessRows)) {
        setPageAccessRows(normalizeAccessRows(body.pageAccessRows));
      }
      if (Array.isArray(body?.editableFields) && body.editableFields.length) {
        setDirectory((current) => ({ ...current, editableFields: body.editableFields }));
      }
      setMemberForm({ mode, member: detailedMember });
    } catch (error) {
      notify("error", "Team member could not load", error?.message || "The full team member record is temporarily unavailable.");
    } finally {
      setMemberDetailLoading(false);
    }
  }

  function deleteDepartment(department) { protectedOpen({ title: "Delete department", message: `Delete ${department.name}?` }, () => setConfirm({ danger: true, title: "Delete Department", message: Number(department.count || 0) ? `Delete ${department.name} department? ${department.count} user${Number(department.count) === 1 ? "" : "s"} will be moved to No Department.` : `Delete ${department.name} department?`, confirmLabel: "Delete Department", onConfirm: async () => { const body = await usersCenterMutation("department-delete", { departmentId: department.id }); backDepartments(false); await refresh(); notify("success", "Department deleted", body.message || "Department deleted."); setConfirm(null); } })); }
  function deleteMember(member) { protectedOpen({ title: "Delete team member", message: `Delete ${member.name}?` }, () => setConfirm({ danger: true, title: "Delete Team Member", message: `Delete ${member.name || "this user"} permanently from Team Members? This action cannot be undone.`, confirmLabel: "Delete Member", onConfirm: async () => { const body = await usersCenterMutation("member-delete", { memberId: member.id }); await refresh(); notify("success", "Member deleted", body.message || "Team member deleted."); setConfirm(null); } })); }

  return <section className="ua-page-body">
    <Toast value={toast} onClose={() => setToast(null)}/>
    <ActionLoadingModal state={memberDetailLoading ? { open: true, status: "loading", title: "Loading team member", message: "Loading the full account record…" } : null} zIndex={12040}/>
    {bootstrapWarnings.length ? <div className="ua-error">Some optional Users Center data loaded after the page opened. Refresh the page if a section looks incomplete.</div> : null}
    {!selectedDepartment ? <section className="ua-folders-panel"><div className="ua-section-head ua-section-head--folders ua-section-head--folders-actions-only"><div className="ua-folder-actions"><div className="ua-count-pill">{directory.departments.reduce((sum, department) => sum + Number(department.count || 0), 0)} {directory.total === 1 ? "user" : "users"}</div><button type="button" className="ua-dept-btn ua-dept-btn--requests" onClick={() => protectedOpen({ title: "Sign up requests", message: "Review account requests." }, () => setSignupOpen(true))}><UAIcon name="signup"/><span>Sign up requests</span>{pendingSignupCount ? <small>{pendingSignupCount}</small> : null}</button></div></div><div className="ua-folders"><AddDepartmentFolder onClick={() => { setDepartmentActions(""); protectedOpen({ title: "Create department", message: "Create a new department folder?" }, () => setDepartmentForm({ department: null })); }}/>{filteredDepartments.map((department) => <DepartmentFolder
      key={department.id}
      department={department}
      actionsOpen={departmentActions === department.id}
      onOpen={navigateDepartment}
      onActionsOpen={(id) => setDepartmentActions(id)}
      onEdit={(item) => { setDepartmentActions(""); protectedOpen({ title: "Rename department", message: `Rename ${item.name}?` }, () => setDepartmentForm({ department: item })); }}
      onDelete={(item) => { setDepartmentActions(""); deleteDepartment(item); }}
    />)}{!filteredDepartments.length && search ? <div className="ua-empty ua-empty--folders">No matching departments</div> : null}</div></section> : <section className="ua-members-panel"><div className="ua-section-head ua-section-head--members"><div className="ua-member-heading-left"><button type="button" className="ua-back-btn" onClick={() => backDepartments()} aria-label="Back to departments"><UAIcon name="back"/></button><div><h3>{selectedDepartment.name} Members</h3></div></div><div className="ua-members-actions"><button type="button" className="ua-add-member-btn" onClick={() => protectedOpen({ title: "Add team member", message: `Create a new account in ${selectedDepartment.name}?` }, () => openMember("create"))}><UAIcon name="addUser"/><span>Add Member</span></button></div></div>{!filteredMembers.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-members-grid">{filteredMembers.map((member) => <article className="ua-member-card" key={member.id}><div className="ua-member-card__top"><Avatar member={member}/><div className="ua-member-card__identity"><h4 title={member.name || "Unnamed"}>{member.name || "Unnamed"}</h4><p title={member.position || "Team Member"}>{member.position || "Team Member"}</p></div><div className="ua-member-menu-wrap"><button type="button" className="ua-member-menu-btn" aria-expanded={memberMenu === member.id} onClick={(event) => { event.stopPropagation(); setMemberMenu((current) => current === member.id ? "" : member.id); }} aria-label={`More actions for ${member.name || "user"}`}><span className="ua-member-menu-dots">•••</span></button><div className="ua-member-menu" hidden={memberMenu !== member.id}><button type="button" onClick={() => { setMemberMenu(""); protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member)); }}><UAIcon name="move"/><span>Move</span></button><button type="button" className="is-danger" onClick={() => { setMemberMenu(""); deleteMember(member); }}><UAIcon name="trash"/><span>Delete</span></button></div></div></div><div className="ua-member-card__meta"><div className="ua-meta-line" title={member.employeeCode || "No employee code"}><UAIcon name="hash"/><span>{member.employeeCode || "No employee code"}</span></div><div className="ua-meta-line" title={member.phone || "No phone"}><UAIcon name="phone"/><span>{member.phone || "No phone"}</span></div><div className="ua-meta-line" title={member.email || "No email"}><UAIcon name="mail"/><span>{member.email || "No email"}</span></div></div><div className="ua-member-card__actions"><button type="button" className="ua-btn ua-btn--dark" onClick={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => openMember("edit", member))}><UAIcon name="edit"/><span>Edit</span></button></div></article>)}</div>}</section>}

    {(passwordAction || confirm || departmentForm || memberForm || moveMember || pageAccessOpen || svAccessOpen || signupOpen) ? <UsersCenterDialogs
      passwordAction={passwordAction}
      onPasswordClose={() => setPasswordAction(null)}
      onPasswordVerified={async () => { const action = passwordAction?.action; setPasswordAction(null); if (!action) return; try { await action(); } catch (err) { notify("error", "Action failed", err.message); } }}
      confirm={confirm}
      onConfirmClose={() => setConfirm(null)}
      departmentForm={departmentForm}
      onDepartmentFormClose={() => setDepartmentForm(null)}
      onDepartmentSaved={async (body) => { const next = await refresh(); const createdId = text(body?.department?.id || body?.departmentId); if (!departmentForm?.department && createdId && next.departments.some((department) => department.id === createdId)) navigateDepartment(createdId); notify("success", departmentForm?.department ? "Department updated" : "Department added", body?.message || "Department saved."); }}
      memberForm={memberForm}
      selectedDepartment={selectedDepartment}
      editableFields={directory.editableFields}
      departments={directory.departments}
      pageAccessRows={pageAccessRows}
      svRows={svRows}
      notify={notify}
      onOpenPageAccess={() => setPageAccessOpen(true)}
      onOpenSvAccess={() => setSvAccessOpen(true)}
      onMemberFormClose={() => { setMemberForm(null); setPageAccessRows([]); setSvRows([]); }}
      onMemberSaved={() => { const wasEdit = !!memberForm?.member; notify("success", wasEdit ? "Updated" : "Created", wasEdit ? "Team member data updated." : "New team member added."); refresh().catch((error) => notify("error", "Refresh failed", error?.message || "Users Center could not refresh.")); }}
      moveMember={moveMember}
      onMoveMemberClose={() => setMoveMember(null)}
      onMoveMemberSaved={async (body, targetId) => { await refresh(); navigateDepartment(targetId); notify("success", "Member moved", body?.message || "Team member moved successfully."); }}
      pageAccessOpen={pageAccessOpen}
      setPageAccessRows={setPageAccessRows}
      onPageAccessClose={() => setPageAccessOpen(false)}
      protect={protect}
      onPageAccessSaved={async (rows) => { setPageAccessRows(rows); if (memberForm?.member) await refresh(); notify("success", memberForm?.member ? "Page access updated" : "Page access prepared", memberForm?.member ? "Page permissions were saved." : "Page access will be saved after creating the member."); }}
      svAccessOpen={svAccessOpen}
      allMembers={allMembers}
      setSvRows={setSvRows}
      onSvAccessClose={() => setSvAccessOpen(false)}
      onSvAccessSaved={async (rows) => { setSvRows(rows); if (memberForm?.member) await refresh(); notify("success", memberForm?.member ? "Orders Supervision updated" : "Orders Supervision prepared", memberForm?.member ? "Orders Review visibility was saved." : "Orders Review visibility will be saved after creating the member."); }}
      signupOpen={signupOpen}
      positions={positionOptions}
      onSignupClose={() => setSignupOpen(false)}
      onSignupChanged={async () => { await Promise.all([refresh(), refreshPending()]); }}
    /> : null}
  </section>;
}
