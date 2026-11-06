"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ActionLoadingModal from "../ActionLoadingModal";
import HeaderFolderBreadcrumb from "../HeaderFolderBreadcrumb";
import BulkPageAccessModal from "./BulkPageAccessModal";
import { featureAllowed } from "../../lib/feature-permissions-registry";
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
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    coins: <><ellipse cx="8" cy="6" rx="5" ry="2.5"/><path d="M3 6v9c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V6M3 10c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5"/><path d="M16 8c2.8 0 5 1.1 5 2.5V19c0 1.4-2.2 2.5-5 2.5-1.2 0-2.3-.2-3.2-.6M13 10.5c0 1.4 2.2 2.5 5 2.5 1.1 0 2.1-.2 3-.5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l-1.9 1.9a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-.9 1.5V21H9v-1.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-1.9-1.9a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-.9H2v-3h1.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l1.9-1.9a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V4h6v1.1a1.6 1.6 0 0 0 .9 1.5 1.6 1.6 0 0 0 1.8-.3l1.9 1.9a1.6 1.6 0 0 0-.3 1.8c.2.6.8 1 1.5 1H22v3h-1.1c-.7 0-1.3.4-1.5 1Z"/></>,
    graduation: <><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.6 3 8.4 3 12 0v-5M22 9v7"/></>,
    factory: <><path d="M3 21V9l6 4V9l6 4V4h6v17H3Z"/><path d="M7 17h2M12 17h2M18 17h1"/></>,
    building: <><path d="M4 21V8l8-6 8 6v13M2 21h20M9 21v-7h6v7M8 10h1M15 10h1"/></>,
    flask: <><path d="M9 3h6M10 3v7l-6 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-6-9V3M7 16h10"/></>,
    clipboard: <><rect x="4" y="5" width="16" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="m8 15 3 3 5-6"/></>,
    filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    archive: <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 13h4"/></>,
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

const DEPARTMENT_VISUALS = [
  { match: /account|financ/i, icon: "coins", tone: "amber" },
  { match: /admin|management/i, icon: "settings", tone: "slate" },
  { match: /curricul|academ|educat/i, icon: "graduation", tone: "violet" },
  { match: /event/i, icon: "calendar", tone: "green" },
  { match: /operat/i, icon: "layers", tone: "orange" },
  { match: /produc|techn/i, icon: "factory", tone: "blue" },
  { match: /school/i, icon: "building", tone: "blue" },
  { match: /b2c|research|lab/i, icon: "flask", tone: "violet" },
  { match: /test|qualit/i, icon: "clipboard", tone: "green" },
];
function departmentVisual(name) {
  return DEPARTMENT_VISUALS.find((item) => item.match.test(name || "")) || { icon: "users", tone: "slate" };
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
    <span className={`ua-folder__icon ua-folder__icon--${departmentVisual(department.name).tone}`} aria-hidden="true"><UAIcon name={departmentVisual(department.name).icon}/></span>
    <span className="ua-folder__text">
      <span className="ua-folder__name" title={department.name}>{department.name}</span>
      <span className="ua-folder__count"><UAIcon name="users"/>{count} {count === 1 ? "member" : "members"}</span>
    </span>
    <span className="ua-folder__people" aria-hidden="true">
      {Array.from({length: Math.min(3, count)}, (_, index) => <span className="ua-folder__person" key={index}><UAIcon name="user"/></span>)}
      {count > 3 ? <span className="ua-folder__overflow">+{count - 3}</span> : null}
    </span>
    <span className="ua-folder__chevron" aria-hidden="true"><UAIcon name="chevron"/></span>
  </article>;
}

function AddDepartmentFolder({ onClick }) {
  return <button type="button" className="ua-directory-add" onClick={onClick} aria-label="Add new department">
    <UAIcon name="plus"/><span>Add Group</span>
  </button>;
}


/* A compact, user-first card for the default directory view. The existing
   department member editor/permissions remain the only mutation path. */
function UserDirectoryCard({ member, access, menuOpen, onMenuToggle, onEdit, onMove, onDelete, onArchive, selectionMode, selected, onSelect }) {
  const departmentLabel = text(member.directoryDepartment || member.department) || "No Department";
  return <article className={`ua-directory-user-card${selected ? " is-selected" : ""}${member.isActive === false ? " is-archived" : ""}`}>
    <div className="ua-directory-user-card__head">
      {selectionMode ? <label className="ua-directory-user-card__select" title={`Select ${member.name || "user"}`}><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${member.name || "user"}`}/></label> : null}
      <Avatar member={member}/>
      <div className="ua-directory-user-card__identity">
        <strong title={member.name || "Unnamed user"}>{member.name || "Unnamed user"}</strong>
        <span title={member.position || "Team Member"}>{member.position || "Team Member"}</span>
      </div>
      {(access.memberMove || access.memberDelete || (access.memberEdit && typeof member.isActive === "boolean")) ? <div className="ua-member-menu-wrap">
        <button type="button" className="ua-member-menu-btn" aria-label={`More actions for ${member.name || "user"}`} aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onMenuToggle(); }}><span className="ua-member-menu-dots">•••</span></button>
        <div className="ua-member-menu" hidden={!menuOpen}>
          {access.memberMove ? <button type="button" onClick={onMove}><UAIcon name="move"/><span>Move</span></button> : null}
          {access.memberEdit && typeof member.isActive === "boolean" ? <button type="button" onClick={onArchive}><UAIcon name={member.isActive ? "archive" : "unlock"}/><span>{member.isActive ? "Archive" : "Unarchive"}</span></button> : null}
          {access.memberDelete ? <button type="button" className="is-danger" onClick={onDelete}><UAIcon name="trash"/><span>Delete</span></button> : null}
        </div>
      </div> : null}
    </div>
    <div className="ua-directory-user-card__department"><UAIcon name="folder"/><span title={departmentLabel}>{departmentLabel}</span>{typeof member.isActive === "boolean" ? <small className={member.isActive ? "is-active" : "is-inactive"}>{member.isActive ? "Active" : "Archived"}</small> : null}</div>
    <div className="ua-directory-user-card__details">
      <span title={member.email || "No email"}><UAIcon name="mail"/>{member.email || "No email"}</span>
      <span title={member.phone || "No phone"}><UAIcon name="phone"/>{member.phone || "No phone"}</span>
    </div>
    {access.memberEdit ? <button className="ua-directory-user-card__edit" type="button" onClick={onEdit}><UAIcon name="edit"/><span>Edit</span></button> : null}
  </article>;
}


export default function UsersCenterClient({ account, initialDirectory, initialSignupRequests, bootstrapWarnings = [] }) {
  const can = (key) => featureAllowed(account, `users.${key}`);
  const access = {
    memberCreate: can("member_create"), memberEdit: can("member_edit"), memberDelete: can("member_delete"), memberMove: can("member_move"),
    departmentCreate: can("department_create"), departmentEdit: can("department_edit"), departmentDelete: can("department_delete"),
    pageAccess: can("page_access_manage"), featureAccess: can("feature_access_manage"), svAccess: can("sv_access_manage"),
    signupApprove: can("signup_approve"), signupReject: can("signup_reject"),
  };
  const [directory, setDirectory] = useState(() => normalizeDirectory(initialDirectory));
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(""); const [search, setSearch] = useState(""); const [directoryTab, setDirectoryTab] = useState("users"); const [sortMode, setSortMode] = useState("name"); const [departmentActions, setDepartmentActions] = useState(""); const [toast, setToast] = useState(null); const [passwordAction, setPasswordAction] = useState(null); const [confirm, setConfirm] = useState(null); const [departmentForm, setDepartmentForm] = useState(null); const [memberForm, setMemberForm] = useState(null); const [memberDetailLoading, setMemberDetailLoading] = useState(false); const [moveMember, setMoveMember] = useState(null); const [signupOpen, setSignupOpen] = useState(false); const [pendingSignupCount, setPendingSignupCount] = useState((initialSignupRequests?.requests || []).length); const [memberMenu, setMemberMenu] = useState(""); const [pageAccessOpen, setPageAccessOpen] = useState(false); const [svAccessOpen, setSvAccessOpen] = useState(false); const [pageAccessRows, setPageAccessRows] = useState([]); const [svRows, setSvRows] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [bulkAccessOpen, setBulkAccessOpen] = useState(false);
  const selectedMemberSet = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds]);
  function toggleMemberSelection(id, checked) {
    if (!text(id)) return;
    setSelectedMemberIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }
  const selectedDepartment = directory.departments.find((department) => department.id === selectedDepartmentId) || null;
  const allMembers = useMemo(() => directory.departments.flatMap((department) => department.members || []), [directory]);
  const membersWithDepartments = useMemo(() => {
    const seen = new Set();
    return directory.departments.flatMap((department) => (department.members || []).map((member) => ({ ...member, directoryDepartment: department.name }))).filter((member) => {
      // A user can be referenced from more than one department in legacy data.
      // Prefer the immutable account ID, not the display name, for deduplication.
      const key = text(member.id) || `${lower(member.name)}|${lower(member.email)}|${lower(member.directoryDepartment)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [directory.departments]);
  const isMemberDirectoryTab = directoryTab === "users" || directoryTab === "active" || directoryTab === "archived";
  const visibleUsers = useMemo(() => {
    const q = lower(search);
    const rows = membersWithDepartments.filter((member) => {
      if (directoryTab === "active" && member.isActive !== true) return false;
      if (directoryTab === "archived" && member.isActive !== false) return false;
      return !q || lower(`${member.name} ${member.position} ${member.directoryDepartment} ${member.email} ${member.phone} ${member.employeeCode}`).includes(q);
    });
    if (sortMode === "name-desc") rows.sort((a, b) => text(b.name).localeCompare(text(a.name)));
    else if (sortMode === "department") rows.sort((a, b) => text(a.directoryDepartment).localeCompare(text(b.directoryDepartment)) || text(a.name).localeCompare(text(b.name)));
    else rows.sort((a, b) => text(a.name).localeCompare(text(b.name)));
    return rows;
  }, [membersWithDepartments, directoryTab, search, sortMode]);
  function changeDirectoryTab(nextTab) { setSelectionMode(false); setSelectedMemberIds([]); setDirectoryTab(nextTab); setSearch(""); setSortMode("name"); setDepartmentActions(""); setMemberMenu(""); }
  const positionOptions = useMemo(() => unique(allMembers.map((member) => member.position)).sort((a, b) => a.localeCompare(b)), [allMembers]);
  const filteredDepartments = useMemo(() => { const q = lower(search); if (!q) return directory.departments; return directory.departments.filter((department) => lower(`${department.name} ${(department.members || []).map((member) => `${member.name} ${member.email} ${member.phone} ${member.employeeCode}`).join(" ")}`).includes(q)); }, [directory, search]);
  const filteredMembers = useMemo(() => { if (!selectedDepartment) return []; const q = lower(search); return sortByName((selectedDepartment.members || []).filter((member) => !q || lower(`${member.name} ${member.position} ${member.email} ${member.phone} ${member.employeeCode}`).includes(q))); }, [selectedDepartment, search]);
  const statusAvailable = allMembers.length > 0 && allMembers.every((member) => typeof member.isActive === "boolean");
  const activeUsersCount = statusAvailable ? allMembers.filter((member) => member.isActive).length : null;
  const visibleDepartments = useMemo(() => {
    let rows = filteredDepartments;
    if (directoryTab === "teams") rows = rows.filter((item) => item.count > 0);
    if (directoryTab === "active") rows = rows.filter((item) => (item.members || []).some((member) => member.isActive === true));
    if (directoryTab === "archived") rows = rows.filter((item) => (item.members || []).some((member) => member.isActive === false));
    const sorted = [...rows];
    if (sortMode === "members") sorted.sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
    else if (sortMode === "fewest") sorted.sort((a,b) => a.count - b.count || a.name.localeCompare(b.name));
    else sorted.sort((a,b) => a.name.localeCompare(b.name));
    return sorted;
  }, [filteredDepartments, directoryTab, sortMode]);
  const canReviewSignups = access.signupApprove || access.signupReject;
  function openSignups() {
    if (canReviewSignups) protectedOpen({ title: "Sign up requests", message: "Review account requests." }, () => setSignupOpen(true));
  }
  function openDepartmentCreate() {
    setDepartmentActions("");
    protectedOpen({ title: "Create department", message: "Create a new department folder?" }, () => setDepartmentForm({ department: null }));
  }


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
  function navigateDepartment(id, push = true) { setSelectionMode(false); setSelectedMemberIds([]); setDepartmentActions(""); setDirectoryTab("departments"); setSelectedDepartmentId(id || ""); setSearch(""); writeDepartmentUrl(id, push); window.setTimeout(() => document.querySelector(".ua-members-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }
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

  function setArchived(member) {
    const archived = member.isActive !== false;
    setMemberMenu("");
    protectedOpen({ title: archived ? "Archive user" : "Unarchive user", message: `${archived ? "Archive" : "Restore"} ${member.name}?` },
      () => setConfirm({ danger: archived, title: archived ? "Archive User" : "Unarchive User", message: archived
        ? `Archive ${member.name}? This blocks sign-in and ends their existing sessions. The account and permissions are retained for restoring later.`
        : `Restore ${member.name}? Their existing permissions will be kept; they will need to sign in again.`,
        confirmLabel: archived ? "Archive User" : "Unarchive User",
        onConfirm: async () => { const body = await usersCenterMutation("member-archive", { memberId: member.id, archived }); await refresh(); notify("success", archived ? "User archived" : "User restored", body.message); setConfirm(null); } }));
  }
  function deleteDepartment(department) { protectedOpen({ title: "Delete department", message: `Delete ${department.name}?` }, () => setConfirm({ danger: true, title: "Delete Department", message: Number(department.count || 0) ? `Delete ${department.name} department? ${department.count} user${Number(department.count) === 1 ? "" : "s"} will be moved to No Department.` : `Delete ${department.name} department?`, confirmLabel: "Delete Department", onConfirm: async () => { const body = await usersCenterMutation("department-delete", { departmentId: department.id }); backDepartments(false); await refresh(); notify("success", "Department deleted", body.message || "Department deleted."); setConfirm(null); } })); }
  function deleteMember(member) { protectedOpen({ title: "Delete team member", message: `Delete ${member.name}?` }, () => setConfirm({ danger: true, title: "Delete Team Member", message: `Delete ${member.name || "this user"} permanently from Team Members? This action cannot be undone.`, confirmLabel: "Delete Member", onConfirm: async () => { const body = await usersCenterMutation("member-delete", { memberId: member.id }); await refresh(); notify("success", "Member deleted", body.message || "Team member deleted."); setConfirm(null); } })); }

  return <section className="ua-page-body ua-directory-v339">
    {selectedDepartment ? <HeaderFolderBreadcrumb segments={[
      {label:"Users Center",icon:"shield",onClick:backDepartments},
      {label:selectedDepartment.name,icon:"users"}
    ]}/> : null}
    <Toast value={toast} onClose={() => setToast(null)}/>
    <ActionLoadingModal state={memberDetailLoading ? { open: true, status: "loading", title: "Loading team member", message: "Loading the full account record…" } : null} zIndex={12040}/>
    {bootstrapWarnings.length ? <div className="ua-error">Some optional Users Center data loaded after the page opened. Refresh the page if a section looks incomplete.</div> : null}
    {!selectedDepartment ? <>
      <header className="ua-directory-hero">
        <div className="ua-directory-hero__copy">
          <h2>Users Center</h2>
          <p>Manage users, teams, and access permissions across the system.</p>
        </div>
        <div className="ua-directory-hero__art" aria-hidden="true"><UAIcon name="users"/></div>
      </header>
      <div className="ua-directory-metrics" aria-label="Users Center overview">
        <div className="ua-directory-metric ua-directory-metric--primary"><UAIcon name="users"/><div><span>Total Users</span><strong>{directory.total}</strong></div></div>
        <div className="ua-directory-metric"><UAIcon name="layers"/><div><span>Groups</span><strong>{directory.departments.length}</strong></div></div>
        {canReviewSignups ? <button type="button" className="ua-directory-metric ua-directory-metric--clickable" onClick={openSignups} aria-label={`${pendingSignupCount} pending sign up requests, open requests`}><UAIcon name="signup"/><div><span>Sign up Requests</span><strong>{pendingSignupCount}</strong></div><UAIcon name="chevron"/></button> : <div className="ua-directory-metric"><UAIcon name="signup"/><div><span>Sign up Requests</span><strong aria-label="Unavailable without permission">—</strong></div></div>}
        <div className="ua-directory-metric" title={statusAvailable ? "Accounts marked active" : "Account active status is not available in the directory"}><UAIcon name="shield"/><div><span>Active Users</span><strong>{activeUsersCount === null ? "—" : activeUsersCount}</strong></div></div>
      </div>
      <section className="ua-folders-panel" aria-label="Departments">
        <div className="ua-directory-toolbar">
          <div className="ua-directory-tabs" role="group" aria-label="Directory view">
            {[{id:"users",label:"All Users",icon:"users"},{id:"departments",label:"Departments",icon:"grid"},{id:"teams",label:"Teams",icon:"folder"},{id:"active",label:"Active",icon:"checkCircle"},{id:"archived",label:"Archived",icon:"archive"}].map((item) => <button key={item.id} type="button" className={`ua-directory-tab${directoryTab === item.id ? " is-active" : ""}`} onClick={() => changeDirectoryTab(item.id)} aria-pressed={directoryTab === item.id} disabled={(item.id === "active" || item.id === "archived") && !statusAvailable} title={(item.id === "active" || item.id === "archived") && !statusAvailable ? "Account status isn't available in this directory" : undefined}><UAIcon name={item.icon}/><span>{item.label}</span></button>)}
          </div>
          {isMemberDirectoryTab ? (access.memberCreate ? <button type="button" className="ua-directory-add" onClick={() => protectedOpen({ title: "Add team member", message: "Create a new user account?" }, () => openMember("create"))}><UAIcon name="addUser"/><span>Add Member</span></button> : null) : (access.departmentCreate ? <AddDepartmentFolder onClick={openDepartmentCreate}/> : null)}
        </div>
        <div className="ua-directory-filter-row">
          <label className="ua-directory-search"><UAIcon name="search"/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isMemberDirectoryTab ? "Search users, departments or emails..." : "Search departments..."} aria-label={isMemberDirectoryTab ? "Search all users" : "Search departments or members"} /></label>
          <label className="ua-directory-sort"><UAIcon name="filter"/><span>Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label={isMemberDirectoryTab ? "Sort users" : "Sort departments"}><option value="name">Name A–Z</option>{isMemberDirectoryTab ? <><option value="name-desc">Name Z–A</option><option value="department">Department A–Z</option></> : <><option value="members">Most members</option><option value="fewest">Fewest members</option></>}</select><UAIcon name="chevronDown"/></label>
        </div>
        {isMemberDirectoryTab ? <div className="ua-directory-users" aria-label={directoryTab === "users" ? "All users" : directoryTab === "active" ? "Active users" : "Archived users"}>
          <div className="ua-directory-users__heading"><div><h3>{directoryTab === "users" ? "All Users" : directoryTab === "active" ? "Active Users" : "Archived Users"}</h3><p>Browse and manage individual accounts</p></div><div className="ua-directory-users__heading-actions"><span className="ua-directory-users__count">{visibleUsers.length} {visibleUsers.length === 1 ? "user" : "users"}</span>{(access.pageAccess || access.featureAccess) ? <button type="button" className={`ua-directory-select-btn${selectionMode ? " is-active" : ""}`} onClick={() => { setSelectionMode((current) => !current); setSelectedMemberIds([]); }}><UAIcon name="checkCircle"/><span>{selectionMode ? "Cancel Select" : "Select Users"}</span></button> : null}</div></div>
          {selectionMode && (access.pageAccess || access.featureAccess) ? <div className="ua-directory-bulkbar"><label><input type="checkbox" checked={visibleUsers.length > 0 && visibleUsers.every((member) => selectedMemberSet.has(member.id))} onChange={(event) => { const ids = visibleUsers.map((member) => member.id).filter(Boolean); setSelectedMemberIds((current) => event.target.checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))); }} disabled={!visibleUsers.length}/> Select all visible</label><strong>{selectedMemberIds.length} selected</strong><button type="button" disabled={!selectedMemberIds.length} onClick={() => protectedOpen({ title: "Bulk access editing", message: `Edit access for ${selectedMemberIds.length} selected users?` }, () => setBulkAccessOpen(true))}><UAIcon name="shield"/> Edit Access</button></div> : null}
          {visibleUsers.length ? <div className="ua-directory-users__grid">{visibleUsers.map((member) => <UserDirectoryCard
            key={member.id || `${member.name}-${member.directoryDepartment}`}
            member={member}
            access={access}
            menuOpen={memberMenu === member.id}
            onMenuToggle={() => setMemberMenu((current) => current === member.id ? "" : member.id)}
            onEdit={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => openMember("edit", member))}
            onMove={() => { setMemberMenu(""); protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member)); }}
            onDelete={() => { setMemberMenu(""); deleteMember(member); }}
            onArchive={() => setArchived(member)}
            selectionMode={selectionMode && (access.pageAccess || access.featureAccess)}
            selected={selectedMemberSet.has(member.id)}
            onSelect={(checked) => toggleMemberSelection(member.id, checked)}
          />)}</div> : <div className="ua-empty ua-directory-users__empty">{search ? "No matching users" : "No users in this view"}</div>}
        </div> : <div className="ua-folders">
          {visibleDepartments.map((department) => <DepartmentFolder
            key={department.id}
            department={department}
            actionsOpen={departmentActions === department.id}
            onOpen={navigateDepartment}
            onActionsOpen={(id) => { if (access.departmentEdit || access.departmentDelete) setDepartmentActions(id); }}
            onEdit={access.departmentEdit ? (item) => { setDepartmentActions(""); protectedOpen({ title: "Rename department", message: `Rename ${item.name}?` }, () => setDepartmentForm({ department: item })); } : undefined}
            onDelete={access.departmentDelete ? (item) => { setDepartmentActions(""); deleteDepartment(item); } : undefined}
          />)}
          {!visibleDepartments.length ? <div className="ua-empty ua-empty--folders">{search ? "No matching departments" : "No departments in this view"}</div> : null}
        </div>}
      </section>
    </> : <section className="ua-members-panel"><div className="ua-section-head ua-section-head--members ua-section-head--members-actions-only"><div className="ua-members-title"><h3>{selectedDepartment.name}</h3><p>{selectedDepartment.count} {selectedDepartment.count === 1 ? "member" : "members"}</p></div><div className="ua-members-actions">{access.memberCreate ? <button type="button" className="ua-add-member-btn" onClick={() => protectedOpen({ title: "Add team member", message: `Create a new account in ${selectedDepartment.name}?` }, () => openMember("create"))}><UAIcon name="addUser"/><span>Add Member</span></button> : null}</div></div>{!filteredMembers.length ? <div className="ua-empty">Sorry, No data available</div> : <div className="ua-members-grid">{filteredMembers.map((member) => <article className="ua-member-card" key={member.id}><div className="ua-member-card__top"><Avatar member={member}/><div className="ua-member-card__identity"><h4 title={member.name || "Unnamed"}>{member.name || "Unnamed"}</h4><p title={member.position || "Team Member"}>{member.position || "Team Member"}</p></div>{(access.memberMove || access.memberDelete || (access.memberEdit && typeof member.isActive === "boolean")) ? <div className="ua-member-menu-wrap"><button type="button" className="ua-member-menu-btn" aria-expanded={memberMenu === member.id} onClick={(event) => { event.stopPropagation(); setMemberMenu((current) => current === member.id ? "" : member.id); }} aria-label={`More actions for ${member.name || "user"}`}><span className="ua-member-menu-dots">•••</span></button><div className="ua-member-menu" hidden={memberMenu !== member.id}>{access.memberMove ? <button type="button" onClick={() => { setMemberMenu(""); protectedOpen({ title: "Move team member", message: `Move ${member.name} to another department?` }, () => setMoveMember(member)); }}><UAIcon name="move"/><span>Move</span></button> : null}{access.memberEdit && typeof member.isActive === "boolean" ? <button type="button" onClick={() => setArchived(member)}><UAIcon name={member.isActive ? "archive" : "unlock"}/><span>{member.isActive ? "Archive" : "Unarchive"}</span></button> : null}{access.memberDelete ? <button type="button" className="is-danger" onClick={() => { setMemberMenu(""); deleteMember(member); }}><UAIcon name="trash"/><span>Delete</span></button> : null}</div></div> : null}</div><div className="ua-member-card__meta"><div className="ua-meta-line" title={member.employeeCode || "No employee code"}><UAIcon name="hash"/><span>{member.employeeCode || "No employee code"}</span></div><div className="ua-meta-line" title={member.phone || "No phone"}><UAIcon name="phone"/><span>{member.phone || "No phone"}</span></div><div className="ua-meta-line" title={member.email || "No email"}><UAIcon name="mail"/><span>{member.email || "No email"}</span></div></div>{access.memberEdit ? <div className="ua-member-card__actions"><button type="button" className="ua-btn ua-btn--dark" onClick={() => protectedOpen({ title: "Edit team member", message: `Edit ${member.name}'s account record?` }, () => openMember("edit", member))}><UAIcon name="edit"/><span>Edit</span></button></div> : null}</article>)}</div>}</section>}

    {bulkAccessOpen && (access.pageAccess || access.featureAccess) ? <BulkPageAccessModal members={membersWithDepartments.filter((member) => selectedMemberSet.has(member.id))} allowPages={access.pageAccess} allowFeatures={access.featureAccess} protect={protect} onClose={() => setBulkAccessOpen(false)} onComplete={async (result) => {
      let refreshError = null;
      try { await refresh(); } catch (error) { refreshError = error; }
      if (!result.failures?.length) {
        notify(refreshError ? "error" : "success", refreshError ? "Saved — reload to refresh" : "Access updated", refreshError ? "The changes were saved, but the directory could not refresh." : `Saved ${result.successes?.length || 0} users.`);
        setSelectedMemberIds([]); setSelectionMode(false);
      } else notify("error", "Partial update", `${result.successes?.length || 0} saved, ${result.failures?.length || 0} failed. Review the details.`);
    }}/> : null}
    {(passwordAction || confirm || departmentForm || memberForm || moveMember || pageAccessOpen || svAccessOpen || signupOpen) ? <UsersCenterDialogs
      access={access}
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
