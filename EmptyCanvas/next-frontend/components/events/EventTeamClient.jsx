"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import EventIcon from "./EventIcon";

const EventTeamMemberDialog = dynamic(() => import("./EventTeamDialogs").then((module) => module.EventTeamMemberDialog), { ssr: false });
const EventTeamDeleteDialog = dynamic(() => import("./EventTeamDialogs").then((module) => module.EventTeamDeleteDialog), { ssr: false });
const preloadEventTeamDialogs = () => import("./EventTeamDialogs");

const TABS = Object.freeze([
  { key: "instructor", label: "Instructors", icon: "user" },
  { key: "usher", label: "Ushers", icon: "award" },
  { key: "organizer", label: "Organizers", icon: "clipboard" },
]);

const ROLE_LABELS = Object.freeze({ instructor: "Instructor", usher: "Usher", organizer: "Organizer" });

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function token(value) {
  return lower(value).replace(/[^a-z0-9/]+/g, "");
}

function pageAccessLevel(account) {
  const builtInAdmin = token(account?.name) === "admin" || token(account?.position).includes("admin");
  if (builtInAdmin) return "admin";

  const wanted = new Set(["events", "eventrequests", "eventcalendar", "eventcomponents", "eventteam"]);
  const rank = { view: 1, edit: 2, admin: 3 };
  let best = "";
  for (const entry of Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : []) {
    const candidates = [entry?.pageName, entry?.pageKey, entry?.routePath, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
      .map(token)
      .filter(Boolean);
    if (!candidates.some((candidate) => wanted.has(candidate))) continue;
    const level = lower(entry?.accessLevel || entry?.access_level);
    if (rank[level] > (rank[best] || 0)) best = level;
  }
  return best || "view";
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`event-team-toast is-${toast.type || "info"}`} role="status">
      <div>
        <strong>{toast.title || "Event Team"}</strong>
        <small>{toast.message}</small>
      </div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

export default function EventTeamClient({ account, initialMembers = [], bootstrapError = "" }) {
  const [tab, setTab] = useState("instructor");
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(Array.isArray(initialMembers) ? initialMembers : []);
  const [memberDialog, setMemberDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(bootstrapError ? { type: "error", title: "Event Team", message: bootstrapError } : null);
  const accessLevel = useMemo(() => pageAccessLevel(account), [account]);
  const canEdit = ["edit", "admin"].includes(accessLevel);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = `Search ${TABS.find((item) => item.key === tab)?.label?.toLowerCase() || "team"}...`;
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, [tab]);

  const filteredMembers = useMemo(() => {
    const q = lower(query);
    return members.filter((member) => {
      if (member?.role !== tab) return false;
      if (!q) return true;
      return [member?.name, member?.nationalId, member?.phone, member?.email, member?.governorate, member?.instapay, member?.wallet, member?.station]
        .map(lower)
        .join(" ")
        .includes(q);
    });
  }, [members, query, tab]);

  const counts = useMemo(() => ({
    instructor: members.filter((item) => item?.role === "instructor").length,
    usher: members.filter((item) => item?.role === "usher").length,
    organizer: members.filter((item) => item?.role === "organizer").length,
  }), [members]);

  function requireEdit() {
    if (canEdit) return true;
    setToast({ type: "info", title: "View-only access", message: "Your Events permission does not allow changes." });
    return false;
  }

  async function copyPublicLink() {
    if (!TABS.some((item) => item.key === tab)) return;
    const url = `${window.location.origin}/next/event-team/join/${tab}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setToast({ type: "success", title: "Public registration link", message: `${ROLE_LABELS[tab] || "Team"} link copied.` });
    } catch {
      setToast({ type: "error", title: "Public registration link", message: url });
    }
  }

  function openAdd() {
    if (!requireEdit()) return;
    preloadEventTeamDialogs();
    setMemberDialog({ role: tab, member: null });
  }

  function openMemberEdit(member) {
    if (!requireEdit()) return;
    preloadEventTeamDialogs();
    setMemberDialog({ role: member?.role || tab, member });
  }

  function deleteMember(member) {
    if (!requireEdit()) return;
    preloadEventTeamDialogs();
    setDeleteTarget(member);
  }

  function handleSaved(saved, { editing } = {}) {
    setMembers((current) => editing
      ? current.map((item) => text(item?.id) === text(saved.id) ? saved : item)
      : [saved, ...current]);
    setToast({ type: "success", title: "Event Team", message: editing ? "Team member updated." : "Team member added." });
  }

  function handleDeleted(member) {
    setMembers((current) => current.filter((row) => text(row?.id) !== text(member?.id)));
    setToast({ type: "success", title: "Event Team", message: "Team member deleted." });
  }

  return (
    <div className="events-shell event-team-shell">
      {bootstrapError ? (
        <div className="events-stage2k-notice is-warning event-team-warning">
          <strong>Setup required:</strong> {bootstrapError}
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : null}

      <section className="event-team-toolbar" aria-label="Event team controls">
        <div className="event-team-tabs" role="tablist" aria-label="Event team categories">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`event-team-tab${tab === item.key ? " is-active" : ""}`}
              onClick={() => { setTab(item.key); setQuery(""); }}
              role="tab"
              aria-selected={tab === item.key}
            >
              <EventIcon name={item.icon} />
              <span>{item.label}</span>
              <b>{counts[item.key] || 0}</b>
            </button>
          ))}
        </div>
        <button type="button" className="event-team-public-link" onClick={copyPublicLink}>
          <EventIcon name="external-link" />
          <span>Public link</span>
        </button>
        <button
          type="button"
          className="event-team-add"
          onMouseEnter={preloadEventTeamDialogs}
          onFocus={preloadEventTeamDialogs}
          onClick={openAdd}
          disabled={!canEdit}
        >
          <EventIcon name="plus-circle" />
          <span>Add new</span>
        </button>
      </section>

      <section className="event-team-panel">
        <div className="event-team-table-wrap">
          <table className="event-team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID Number</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Governorate</th>
                <th>InstaPay</th>
                <th>Wallet</th>
                <th>Station</th>
                <th>ID Photo</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td data-label="Name"><strong className="event-team-person-name">{member.name || "—"}</strong></td>
                  <td data-label="ID Number">{member.nationalId || "—"}</td>
                  <td data-label="Phone">{member.phone || "—"}</td>
                  <td data-label="Email">{member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : "—"}</td>
                  <td data-label="Governorate">{member.governorate || "—"}</td>
                  <td data-label="InstaPay">{member.instapay || "—"}</td>
                  <td data-label="Wallet">{member.wallet || "—"}</td>
                  <td data-label="Station"><span className="event-team-station">{member.station || "—"}</span></td>
                  <td data-label="ID Photo">
                    {member.idPhotoUrl ? (
                      <a className="event-team-id-thumb" href={member.idPhotoUrl} target="_blank" rel="noreferrer" aria-label={`Open ${member.name || "member"} ID`}>
                        <img src={member.idPhotoUrl} alt="" />
                      </a>
                    ) : <span className="event-team-empty">—</span>}
                  </td>
                  <td data-label="Status"><span className={`event-team-status${member.isActive === false ? " is-inactive" : ""}`}>{member.isActive === false ? "Inactive" : "Active"}</span></td>
                  <td className="event-team-actions" data-label="Actions">
                    {canEdit ? <>
                      <button type="button" onMouseEnter={preloadEventTeamDialogs} onFocus={preloadEventTeamDialogs} onClick={() => openMemberEdit(member)} aria-label="Edit"><EventIcon name="edit-3" /></button>
                      <button type="button" className="is-danger" onMouseEnter={preloadEventTeamDialogs} onFocus={preloadEventTeamDialogs} onClick={() => deleteMember(member)} aria-label="Delete"><EventIcon name="trash-2" /></button>
                    </> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredMembers.length ? <div className="event-team-empty-state"><EventIcon name="user" /><strong>No records yet</strong></div> : null}
        </div>
      </section>

      {memberDialog ? (
        <EventTeamMemberDialog
          member={memberDialog.member}
          role={memberDialog.role}
          onClose={() => setMemberDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {deleteTarget ? (
        <EventTeamDeleteDialog
          member={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
