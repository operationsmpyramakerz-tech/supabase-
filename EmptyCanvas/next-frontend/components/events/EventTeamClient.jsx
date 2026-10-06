"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventIcon from "./EventIcon";

const TABS = Object.freeze([
  { key: "instructor", label: "Instructors", icon: "user" },
  { key: "usher", label: "Ushers", icon: "award" },
  { key: "organizer", label: "Organizers", icon: "clipboard" },
]);

const ROLE_LABELS = Object.freeze({ instructor: "Instructor", usher: "Usher", organizer: "Organizer" });
const ATTENDANCE_LABELS = Object.freeze({ planned: "Planned", present: "Present", late: "Late", absent: "Absent", excused: "Excused" });

const EMPTY_MEMBER = Object.freeze({
  id: "",
  role: "instructor",
  name: "",
  phone: "",
  email: "",
  governorate: "",
  instapay: "",
  wallet: "",
  station: "",
  idPhotoUrl: "",
  notes: "",
  isActive: true,
});

const EMPTY_ATTENDANCE = Object.freeze({
  id: "",
  eventId: "",
  memberId: "",
  attendanceDate: "",
  status: "planned",
  checkInTime: "",
  checkOutTime: "",
  station: "",
  notes: "",
});

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

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 10);
}

function displayDate(value) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-EG", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function displayTime(value) {
  const raw = text(value);
  return raw ? raw.slice(0, 5) : "—";
}

function normalizePhone(value) {
  return text(value).replace(/\s+/g, "");
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(text(payload?.error || payload?.message) || `Request failed with status ${response.status}.`);
  return payload;
}

function memberToForm(member) {
  return {
    ...EMPTY_MEMBER,
    id: text(member?.id),
    role: text(member?.role) || "instructor",
    name: text(member?.name),
    phone: text(member?.phone),
    email: text(member?.email),
    governorate: text(member?.governorate),
    instapay: text(member?.instapay),
    wallet: text(member?.wallet),
    station: text(member?.station),
    idPhotoUrl: text(member?.idPhotoUrl),
    notes: text(member?.notes),
    isActive: member?.isActive !== false,
  };
}

function attendanceToForm(record) {
  return {
    ...EMPTY_ATTENDANCE,
    id: text(record?.id),
    eventId: text(record?.eventId),
    memberId: text(record?.memberId),
    attendanceDate: text(record?.attendanceDate),
    status: text(record?.status) || "planned",
    checkInTime: text(record?.checkInTime).slice(0, 5),
    checkOutTime: text(record?.checkOutTime).slice(0, 5),
    station: text(record?.station),
    notes: text(record?.notes),
  };
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

function Modal({ children, onClose, label }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="events-modal-overlay event-team-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="events-modal event-team-modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}

export default function EventTeamClient({ account, initialMembers = [], initialAttendance = [], initialEvents = [], bootstrapError = "" }) {
  const [tab, setTab] = useState("instructor");
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(Array.isArray(initialMembers) ? initialMembers : []);
  const [attendance, setAttendance] = useState(Array.isArray(initialAttendance) ? initialAttendance : []);
  const [events, setEvents] = useState(Array.isArray(initialEvents) ? initialEvents : []);
  const [memberForm, setMemberForm] = useState(null);
  const [attendanceForm, setAttendanceForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(bootstrapError || "");
  const [toast, setToast] = useState(bootstrapError ? { type: "error", title: "Event Team", message: bootstrapError } : null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const idInputRef = useRef(null);
  const accessLevel = useMemo(() => pageAccessLevel(account), [account]);
  const canEdit = ["edit", "admin"].includes(accessLevel);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = tab === "attendance" ? "Search attendance..." : `Search ${TABS.find((item) => item.key === tab)?.label?.toLowerCase() || "team"}...`;
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, [tab]);

  const memberMap = useMemo(() => new Map(members.map((item) => [text(item?.id), item])), [members]);
  const eventMap = useMemo(() => new Map(events.map((item) => [text(item?.id), item])), [events]);

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

  const filteredAttendance = useMemo(() => {
    const q = lower(query);
    return attendance.filter((record) => {
      if (!q) return true;
      const member = memberMap.get(text(record?.memberId));
      const event = eventMap.get(text(record?.eventId));
      return [member?.name, member?.role, event?.eventName, event?.eventCode, record?.attendanceDate, record?.status, record?.station]
        .map(lower)
        .join(" ")
        .includes(q);
    });
  }, [attendance, eventMap, memberMap, query]);

  const counts = useMemo(() => ({
    instructor: members.filter((item) => item?.role === "instructor").length,
    usher: members.filter((item) => item?.role === "usher").length,
    organizer: members.filter((item) => item?.role === "organizer").length,
    attendance: attendance.length,
  }), [members, attendance]);

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
    setFormError("");
    if (tab === "attendance") {
      setAttendanceForm({ ...EMPTY_ATTENDANCE, attendanceDate: todayIso() });
      return;
    }
    setMemberForm({ ...EMPTY_MEMBER, role: tab });
  }

  function openMemberEdit(member) {
    if (!requireEdit()) return;
    setFormError("");
    setMemberForm(memberToForm(member));
  }

  function openAttendanceEdit(record) {
    if (!requireEdit()) return;
    setFormError("");
    setAttendanceForm(attendanceToForm(record));
  }

  async function refresh() {
    const payload = await requestJson(`/next/api/events/team?_ts=${Date.now()}`);
    setMembers(Array.isArray(payload?.members) ? payload.members : []);
    setAttendance(Array.isArray(payload?.attendance) ? payload.attendance : []);
    setEvents(Array.isArray(payload?.events) ? payload.events : []);
  }

  async function uploadIdPhoto(file) {
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setFormError("ID must be uploaded as an image.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const { compressImage } = await import("./EventComponentAssetProcessing");
      const prepared = await compressImage(file);
      const payload = await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({ action: "upload-id", dataUrl: prepared.dataUrl, fileName: prepared.fileName || file.name }),
      });
      if (!text(payload?.url)) throw new Error("The uploaded ID image did not return a URL.");
      setMemberForm((current) => current ? { ...current, idPhotoUrl: text(payload.url) } : current);
    } catch (error) {
      setFormError(error?.message || "Could not upload the ID image.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(event) {
    event.preventDefault();
    if (!memberForm || busy) return;
    if (!text(memberForm.name)) {
      setFormError("Name is required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const editing = !!text(memberForm.id);
      const payload = await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({
          action: editing ? "update-member" : "create-member",
          id: memberForm.id,
          payload: {
            ...memberForm,
            phone: normalizePhone(memberForm.phone),
            instapay: normalizePhone(memberForm.instapay),
            wallet: normalizePhone(memberForm.wallet),
          },
        }),
      });
      const saved = payload?.member;
      if (saved?.id) {
        setMembers((current) => editing
          ? current.map((item) => text(item?.id) === text(saved.id) ? saved : item)
          : [saved, ...current]);
      }
      setMemberForm(null);
      setToast({ type: "success", title: "Event Team", message: editing ? "Team member updated." : "Team member added." });
    } catch (error) {
      setFormError(error?.message || "Could not save the team member.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAttendance(event) {
    event.preventDefault();
    if (!attendanceForm || busy) return;
    if (!text(attendanceForm.eventId) || !text(attendanceForm.memberId) || !text(attendanceForm.attendanceDate)) {
      setFormError("Event, team member, and attendance date are required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const editing = !!text(attendanceForm.id);
      const payload = await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({ action: editing ? "update-attendance" : "create-attendance", id: attendanceForm.id, payload: attendanceForm }),
      });
      const saved = payload?.attendance;
      if (saved?.id) {
        setAttendance((current) => editing
          ? current.map((item) => text(item?.id) === text(saved.id) ? saved : item)
          : [saved, ...current]);
      }
      setAttendanceForm(null);
      setToast({ type: "success", title: "Attendance", message: editing ? "Attendance updated." : "Attendance added." });
    } catch (error) {
      setFormError(error?.message || "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  function deleteMember(member) {
    if (!requireEdit() || busy) return;
    setDeleteTarget({ kind: "member", item: member });
  }

  function deleteAttendance(record) {
    if (!requireEdit() || busy) return;
    setDeleteTarget({ kind: "attendance", item: record });
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    const { kind, item } = deleteTarget;
    setBusy(true);
    try {
      await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({ action: kind === "member" ? "delete-member" : "delete-attendance", id: item?.id }),
      });
      if (kind === "member") {
        setMembers((current) => current.filter((row) => text(row?.id) !== text(item?.id)));
        setAttendance((current) => current.filter((row) => text(row?.memberId) !== text(item?.id)));
        setToast({ type: "success", title: "Event Team", message: "Team member deleted." });
      } else {
        setAttendance((current) => current.filter((row) => text(row?.id) !== text(item?.id)));
        setToast({ type: "success", title: "Attendance", message: "Attendance record deleted." });
      }
      setDeleteTarget(null);
    } catch (error) {
      setToast({ type: "error", title: kind === "member" ? "Event Team" : "Attendance", message: error?.message || "Could not delete the record." });
    } finally {
      setBusy(false);
    }
  }

  function selectEventForAttendance(value) {
    const event = eventMap.get(text(value));
    setAttendanceForm((current) => current ? {
      ...current,
      eventId: value,
      attendanceDate: current.attendanceDate || text(event?.eventStartDate).slice(0, 10) || todayIso(),
    } : current);
  }

  function selectMemberForAttendance(value) {
    const member = memberMap.get(text(value));
    setAttendanceForm((current) => current ? {
      ...current,
      memberId: value,
      station: current.station || text(member?.station),
    } : current);
  }

  return (
    <div className="events-shell event-team-shell">
      {bootstrapError ? (
        <div className="events-stage2k-notice is-warning event-team-warning">
          <strong>Setup required:</strong> {bootstrapError}
          <button type="button" onClick={() => refresh().catch((error) => setToast({ type: "error", title: "Event Team", message: error?.message || "Refresh failed." }))}>Retry</button>
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
        <button type="button" className="event-team-public-link" onClick={copyPublicLink} disabled={busy}>
          <EventIcon name="external-link" />
          <span>Public link</span>
        </button>
        <button type="button" className="event-team-add" onClick={openAdd} disabled={!canEdit || busy}>
          <EventIcon name="plus-circle" />
          <span>Add new</span>
        </button>
      </section>

      <section className="event-team-panel">
        {tab !== "attendance" ? (
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
                        <button type="button" onClick={() => openMemberEdit(member)} aria-label="Edit"><EventIcon name="edit-3" /></button>
                        <button type="button" className="is-danger" onClick={() => deleteMember(member)} aria-label="Delete"><EventIcon name="trash-2" /></button>
                      </> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredMembers.length ? <div className="event-team-empty-state"><EventIcon name="user" /><strong>No records yet</strong></div> : null}
          </div>
        ) : (
          <div className="event-team-table-wrap">
            <table className="event-team-table event-team-table--attendance">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Station</th>
                  <th>Status</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.map((record) => {
                  const member = memberMap.get(text(record.memberId));
                  const event = eventMap.get(text(record.eventId));
                  return (
                    <tr key={record.id}>
                      <td data-label="Date">{displayDate(record.attendanceDate)}</td>
                      <td data-label="Event"><strong>{event?.eventName || event?.eventCode || "Unknown event"}</strong>{event?.eventCode ? <small className="event-team-cell-note">{event.eventCode}</small> : null}</td>
                      <td data-label="Name">{member?.name || "Unknown member"}</td>
                      <td data-label="Role"><span className={`event-team-role is-${member?.role || "unknown"}`}>{ROLE_LABELS[member?.role] || "—"}</span></td>
                      <td data-label="Station"><span className="event-team-station">{record.station || member?.station || "—"}</span></td>
                      <td data-label="Status"><span className={`event-team-attendance-status is-${record.status}`}>{ATTENDANCE_LABELS[record.status] || record.status}</span></td>
                      <td data-label="Check in">{displayTime(record.checkInTime)}</td>
                      <td data-label="Check out">{displayTime(record.checkOutTime)}</td>
                      <td className="event-team-actions" data-label="Actions">
                        {canEdit ? <>
                          <button type="button" onClick={() => openAttendanceEdit(record)} aria-label="Edit"><EventIcon name="edit-3" /></button>
                          <button type="button" className="is-danger" onClick={() => deleteAttendance(record)} aria-label="Delete"><EventIcon name="trash-2" /></button>
                        </> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredAttendance.length ? <div className="event-team-empty-state"><EventIcon name="check-circle" /><strong>No attendance records yet</strong><span>Add attendance and link it to an event and team member.</span></div> : null}
          </div>
        )}
      </section>

      {memberForm ? (
        <Modal label={`${memberForm.id ? "Edit" : "Add"} ${ROLE_LABELS[memberForm.role] || "team member"}`} onClose={() => { if (!busy) { setMemberForm(null); setFormError(""); } }}>
          <form onSubmit={saveMember}>
            <div className="event-team-modal__head">
              <div>
                <span>{memberForm.id ? "Edit team member" : "New team member"}</span>
                <h3>{ROLE_LABELS[memberForm.role] || "Event Team"}</h3>
              </div>
              <button type="button" className="event-team-modal__close" onClick={() => setMemberForm(null)} disabled={busy} aria-label="Close">×</button>
            </div>

            <div className="event-team-form-grid">
              <label><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="instructor">Instructor</option><option value="usher">Usher</option><option value="organizer">Organizer</option></select></label>
              <label><span>Name *</span><input value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" autoFocus /></label>
              <label><span>Phone</span><input inputMode="tel" value={memberForm.phone} onChange={(event) => setMemberForm((current) => ({ ...current, phone: event.target.value }))} placeholder="01xxxxxxxxx" /></label>
              <label><span>Email</span><input type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></label>
              <label><span>Governorate</span><input value={memberForm.governorate} onChange={(event) => setMemberForm((current) => ({ ...current, governorate: event.target.value }))} placeholder="Cairo" /></label>
              <label><span>Station</span><input value={memberForm.station} onChange={(event) => setMemberForm((current) => ({ ...current, station: event.target.value }))} placeholder="e.g. 3D Printer" /></label>
              <label><span>InstaPay</span><input inputMode="tel" value={memberForm.instapay} onChange={(event) => setMemberForm((current) => ({ ...current, instapay: event.target.value }))} placeholder="InstaPay number" /></label>
              <label><span>Wallet</span><input inputMode="tel" value={memberForm.wallet} onChange={(event) => setMemberForm((current) => ({ ...current, wallet: event.target.value }))} placeholder="Wallet number" /></label>
              <label className="event-team-field--wide"><span>ID image</span><div className="event-team-id-upload"><input ref={idInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadIdPhoto(file); }} /><button type="button" onClick={() => idInputRef.current?.click()} disabled={busy}><EventIcon name="image" /> {memberForm.idPhotoUrl ? "Replace ID" : "Upload ID"}</button>{memberForm.idPhotoUrl ? <a href={memberForm.idPhotoUrl} target="_blank" rel="noreferrer"><img src={memberForm.idPhotoUrl} alt="ID preview" /></a> : <span>No ID uploaded</span>}</div></label>
              <label className="event-team-field--wide"><span>Notes</span><textarea rows="3" value={memberForm.notes} onChange={(event) => setMemberForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional notes" /></label>
              <label className="event-team-toggle event-team-field--wide"><input type="checkbox" checked={memberForm.isActive} onChange={(event) => setMemberForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Active team member</span></label>
            </div>

            {formError ? <div className="event-team-form-error">{formError}</div> : null}
            <div className="event-team-modal__actions"><button type="button" className="events-secondary-btn" onClick={() => setMemberForm(null)} disabled={busy}>Cancel</button><button type="submit" className="events-primary-btn" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
          </form>
        </Modal>
      ) : null}

      {attendanceForm ? (
        <Modal label={`${attendanceForm.id ? "Edit" : "Add"} attendance`} onClose={() => { if (!busy) { setAttendanceForm(null); setFormError(""); } }}>
          <form onSubmit={saveAttendance}>
            <div className="event-team-modal__head">
              <div><span>{attendanceForm.id ? "Edit record" : "New record"}</span><h3>Attendance</h3></div>
              <button type="button" className="event-team-modal__close" onClick={() => setAttendanceForm(null)} disabled={busy} aria-label="Close">×</button>
            </div>

            <div className="event-team-form-grid">
              <label className="event-team-field--wide"><span>Event *</span><select value={attendanceForm.eventId} onChange={(event) => selectEventForAttendance(event.target.value)}><option value="">Select event</option>{events.map((item) => <option key={item.id} value={item.id}>{item.eventName || item.eventCode || "Event"}{item.eventStartDate ? ` · ${String(item.eventStartDate).slice(0, 10)}` : ""}</option>)}</select></label>
              <label className="event-team-field--wide"><span>Team member *</span><select value={attendanceForm.memberId} onChange={(event) => selectMemberForAttendance(event.target.value)}><option value="">Select team member</option>{members.filter((item) => item?.isActive !== false).map((item) => <option key={item.id} value={item.id}>{item.name} · {ROLE_LABELS[item.role] || item.role}</option>)}</select></label>
              <label><span>Date *</span><input type="date" value={attendanceForm.attendanceDate} onChange={(event) => setAttendanceForm((current) => ({ ...current, attendanceDate: event.target.value }))} /></label>
              <label><span>Status</span><select value={attendanceForm.status} onChange={(event) => setAttendanceForm((current) => ({ ...current, status: event.target.value }))}><option value="planned">Planned</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
              <label><span>Check in</span><input type="time" value={attendanceForm.checkInTime} onChange={(event) => setAttendanceForm((current) => ({ ...current, checkInTime: event.target.value }))} /></label>
              <label><span>Check out</span><input type="time" value={attendanceForm.checkOutTime} onChange={(event) => setAttendanceForm((current) => ({ ...current, checkOutTime: event.target.value }))} /></label>
              <label className="event-team-field--wide"><span>Station</span><input value={attendanceForm.station} onChange={(event) => setAttendanceForm((current) => ({ ...current, station: event.target.value }))} placeholder="Station used in this event" /></label>
              <label className="event-team-field--wide"><span>Notes</span><textarea rows="3" value={attendanceForm.notes} onChange={(event) => setAttendanceForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional attendance notes" /></label>
            </div>

            {formError ? <div className="event-team-form-error">{formError}</div> : null}
            <div className="event-team-modal__actions"><button type="button" className="events-secondary-btn" onClick={() => setAttendanceForm(null)} disabled={busy}>Cancel</button><button type="submit" className="events-primary-btn" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
          </form>
        </Modal>
      ) : null}


      {deleteTarget ? (
        <Modal label="Delete record" onClose={() => { if (!busy) setDeleteTarget(null); }}>
          <div className="event-team-delete-dialog">
            <div className="event-team-delete-dialog__icon"><EventIcon name="trash-2" /></div>
            <h3>Delete {deleteTarget.kind === "member" ? "team member" : "attendance record"}?</h3>
            <p>{deleteTarget.kind === "member" ? `${text(deleteTarget.item?.name) || "This person"} and linked attendance records will be removed.` : "This attendance record will be removed."}</p>
            <div className="event-team-modal__actions">
              <button type="button" className="events-secondary-btn" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</button>
              <button type="button" className="event-team-delete-confirm" onClick={confirmDelete} disabled={busy}>{busy ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </Modal>
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
