"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";
import EventIcon from "./EventIcon";
import { AuthorizationModal, ConfirmationModal } from "./EventsDialogs";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { eventRequestScopeFor } from "../../lib/event-request-scope.mjs";
import { eventConfirmation, eventConfirmationLabel } from "../../lib/event-confirmation.mjs";

const STATUS_LABELS = {
  submitted: "Pending Confirmation",
  under_review: "Pending Confirmation",
  approved: "Pending Confirmation",
  in_progress: "Confirmed",
  completed: "Confirmed",
  cancelled: "Cancelled",
};

const TYPE_LABELS = {
  tech_day: "Tech Day",
  seminar: "Seminar",
  steam_fair: "STEAM Fair",
  competition: "Competition",
  exhibition: "Exhibition",
  other: "Other",
};

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function localDay(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = text(value);
  const dateOnly = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfMonth(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function dateKey(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function sameDay(first, second) {
  return Boolean(first && second && dateKey(first) === dateKey(second));
}

function startDate(event) {
  return localDay(event?.eventStartDate);
}

function endDate(event) {
  return localDay(event?.eventEndDate) || startDate(event);
}

function eventOnDate(event, day) {
  const start = startDate(event);
  const end = endDate(event);
  if (!start || !end) return false;
  const time = startOfDay(day).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function formatDate(value, options = { day: "2-digit", month: "short", year: "numeric" }) {
  const date = value instanceof Date ? value : localDay(value);
  return date ? date.toLocaleDateString("en-GB", options) : "—";
}

function formatDateRange(event) {
  const start = startDate(event);
  const end = endDate(event);
  if (!start) return "Date to be confirmed";
  if (!end || sameDay(start, end)) return formatDate(start, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return `${formatDate(start, { day: "2-digit", month: "short", year: "numeric" })} – ${formatDate(end, { day: "2-digit", month: "short", year: "numeric" })}`;
}

function typeLabel(event) {
  const custom = text(event?.eventTypeCustom);
  if (custom) return custom;
  const key = lower(event?.eventType) || "other";
  return TYPE_LABELS[key] || key.replace(/^custom_/, "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(value) {
  const status = lower(value).replace(/[\s-]+/g, "_");
  return STATUS_LABELS[status] ? status : "submitted";
}

function allowedSet(account) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(lower));
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://operations-hub.invalid";
    const parsed = new URL(raw, base);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  if (response.status === 401 && !options.body) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.error) || "Unable to load the event schedule.");
  return body;
}

function StatusPill({ status }) {
  const key = eventConfirmation(status);
  return <span className={`agenda-status agenda-status--${key}`}><EventIcon name={key === "confirmed" ? "check-circle" : key === "cancelled" ? "x-circle" : "clock"} />{eventConfirmationLabel(status)}</span>;
}

function DetailItem({ label, value }) {
  return (
    <div className="events-detail-item next-events-detail-item">
      <small>{label}</small>
      <strong>{text(value) || "—"}</strong>
    </div>
  );
}

function DetailList({ items, empty }) {
  if (!Array.isArray(items) || !items.length) return <p className="next-events-empty-copy">{empty}</p>;
  return (
    <div className="next-events-item-list">
      {items.map((item, index) => (
        <article key={`${text(item?.name || item?.title)}-${index}`}>
          <div>
            <strong>{text(item?.name || item?.title) || "Untitled item"}</strong>
            <small>{Number(item?.quantity || 0)} required{text(item?.notes) ? ` · ${text(item.notes)}` : ""}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function DetailsModal({ event, canOpenRequests, canExport = true, canConfirm, onConfirmEvent, onClose }) {
  useEffect(() => {
    if (!event) return undefined;
    const onKey = (keyEvent) => { if (keyEvent.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;
  const mapUrl = safeUrl(event.locationUrl);
  const utilities = [event.requiresPower && "Power points", event.requiresInternet && "Internet", event.requiresSoundSystem && "Sound system"].filter(Boolean).join(" · ") || "No special utilities selected";

  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}>
      <section className="events-modal events-modal--calendar-detail next-modal next-events-details-modal" role="dialog" aria-modal="true" aria-label="Scheduled event details">
        <header className="events-modal__header next-events-modal-head">
          <div>
            <span className="next-events-kicker">{event.eventCode || "Scheduled event"}</span>
            <h2>{event.eventName || "Untitled Event"}</h2>
            <p>{formatDateRange(event)}</p>
          </div>
          <div><StatusPill status={event.status} /><button type="button" className="events-modal__close next-modal-close" onClick={onClose} aria-label="Close">×</button></div>
        </header>

        <div className="events-detail-content next-events-detail-body">
          <section className="events-detail-block next-events-detail-section">
            <h3>Overview</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Type" value={typeLabel(event)} />
              <DetailItem label="Organization" value={event.organizationName} />
              {canOpenRequests ? <DetailItem label="Expected attendees" value={event.expectedAttendees ? String(event.expectedAttendees) : "—"} /> : null}
              {canOpenRequests ? <DetailItem label="Requested by" value={event.requesterName} /> : null}
            </div>
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Venue</h3>
            <div className="events-detail-grid next-events-detail-grid">
              {canOpenRequests ? <DetailItem label="Venue" value={event.venueName} /> : null}
              <DetailItem label="Governorate" value={event.governorate} />
              {canOpenRequests ? <DetailItem label="Setup time" value={event.venueSetupTime} /> : null}
              {canOpenRequests ? <DetailItem label="Utilities" value={utilities} /> : null}
            </div>
            {canOpenRequests && mapUrl ? <a className="next-events-map-link" href={mapUrl} target="_blank" rel="noreferrer">Open map location ↗</a> : null}
          </section>

          {canOpenRequests ? <>
          <section className="events-detail-block next-events-detail-section">
            <h3>Contact</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Contact person" value={event.contactPerson} />
              <DetailItem label="Phone" value={event.contactPhone} />
              <DetailItem label="Email" value={event.contactEmail} />
              <DetailItem label="Status" value={STATUS_LABELS[normalizeStatus(event.status)]} />
            </div>
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Projects</h3>
            <DetailList items={event.projects} empty="No projects were added." />
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Marketing Materials</h3>
            <DetailList items={event.marketingMaterials} empty="No marketing materials were added." />
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Venue Requirements</h3>
            <DetailList items={event.venueRequirements} empty="No venue requirements were added." />
          </section>

          <section className="events-detail-block events-detail-block--wide next-events-detail-section next-events-detail-section--wide">
            <h3>Notes</h3>
            <p>{text(event.venueNotes) || "No venue notes were added."}</p>
          </section>
          </> : null}
        </div>

        <footer className="events-modal__actions next-events-modal-actions">
          <div>
            {canExport ? <a className="events-secondary-btn secondary-button" href={`/next/api/events/pdf-direct?id=${encodeURIComponent(event.id)}`} target="_blank" rel="noreferrer">Download PDF</a> : null}
            {canOpenRequests && !event.isArchived ? <a className="events-secondary-btn secondary-button" href={`/next/events?event=${encodeURIComponent(event.id)}`}>Open Event Request</a> : null}
            {canConfirm && !event.isArchived && eventConfirmation(event.status) === "pending" ? <button type="button" className="agenda-confirm-button" onClick={onConfirmEvent}>Confirm Event</button> : null}
          </div>
          <button type="button" className="events-primary-btn primary-button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}

export default function EventsCalendarClient({ account, initialEvents = [], canMutateRequests = false }) {
  const access = useMemo(() => allowedSet(account), [account]);
  const canCreate = canMutateRequests && access.has("event requests") && featureAllowed(account, "events.requests.view") && featureAllowed(account, "events.requests.create");
  const canOpenRequests = access.has("event requests") && featureAllowed(account, "events.requests.view")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.view"));
  const canExport = canOpenRequests && featureAllowed(account, "events.requests.pdf")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.pdf"));
  const canConfirm = canMutateRequests && canOpenRequests && featureAllowed(account, "events.requests.workflow")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.workflow"));
  const [events, setEvents] = useState(initialEvents);
  const [authorization, setAuthorization] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [activeList, setActiveList] = useState("upcoming");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeEvent, setActiveEvent] = useState(null);
  const detailRequest = useRef(0);
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedDate = useMemo(() => localDay(selectedKey) || today, [selectedKey, today]);
  const scheduled = useMemo(() => events.filter(event => !event.isArchived && eventConfirmation(event.status) !== "cancelled"), [events]);
  const archived = useMemo(() => events.filter(event => event.isArchived), [events]);
  const upcoming = useMemo(() => scheduled.filter(event => endDate(event) && endDate(event) >= today).sort((a,b) => startDate(a) - startDate(b)), [scheduled,today]);
  const past = useMemo(() => events.filter(event => !event.isArchived && (eventConfirmation(event.status) === "cancelled" || (endDate(event) && endDate(event) < today))).sort((a,b) => (startDate(b)?.getTime() || 0) - (startDate(a)?.getTime() || 0)), [events,today]);
  const calendarDays = useMemo(() => {
    const first = startOfMonth(month);
    first.setDate(1 - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(first); day.setDate(first.getDate() + index); return day; });
  }, [month]);
  const stats = [
    { key: "all", label: "Total Events", count: events.length, icon: "calendar" },
    { key: "pending", label: "Pending Confirmation", count: scheduled.filter(event => eventConfirmation(event.status) === "pending").length, icon: "clock" },
    { key: "confirmed", label: "Confirmed", count: scheduled.filter(event => eventConfirmation(event.status) === "confirmed").length, icon: "check-circle" },
    { key: "archived", label: "Archived", count: archived.length, icon: "archive" },
  ];
  const lists = { upcoming, past, archived };
  const list = (lists[activeList] || []).filter(event => {
    if (filter !== "all" && eventConfirmation(event.status) !== filter) return false;
    if (activeList === "upcoming" && endDate(event) < selectedDate) return false;
    return [event.eventName,event.eventCode,event.organizationName,event.venueName,event.governorate,typeLabel(event)].map(lower).join(" ").includes(lower(search));
  });
  function selectDate(day) {
    setSelectedKey(dateKey(day));
    setMonth(startOfMonth(day));
    setActiveList(day < today ? "past" : "upcoming");
  }
  function shiftMonth(direction) {
    setMonth(current => new Date(current.getFullYear(),current.getMonth()+direction,1));
  }
  async function openEventDetails(event) {
    if (!event?.id) return;
    const requestId = ++detailRequest.current;
    setActiveEvent(event);
    try {
      const body = await requestJson(`/next/api/events/${encodeURIComponent(event.id)}?${canOpenRequests ? "" : "view=calendar&"}_ts=${Date.now()}`);
      if (body?.event && detailRequest.current === requestId) setActiveEvent(body.event);
    } catch { /* Keep the permitted summary visible. */ }
  }
  function openNewEvent() {
    const params = new URLSearchParams({ startDate: selectedKey });
    const codes = [...new Set(scheduled.filter(event => eventOnDate(event,selectedDate)).map(event => text(event.eventCode)).filter(Boolean))];
    if (codes.length) params.set("conflictCodes", codes.join(","));
    navigateWithinApp(`/next/events/new?${params.toString()}`);
  }
  function beginConfirmation() {
    if (!activeEvent || !canConfirm) return;
    setActionError("");
    setAuthorization({ title: "Confirm Event", eventId: activeEvent.id, password: "" });
  }
  async function authorizeConfirmation(e) {
    e.preventDefault();
    if (!authorization || busy) return;
    setBusy(true); setActionError("");
    try {
      const verified = await requestJson("/next/api/events/admin/verify", { method: "POST", body: JSON.stringify({ intent: "request_workflow", targetStatus: "in_progress", eventId: authorization.eventId, password: authorization.password }) });
      setConfirmation({ eventId: authorization.eventId, token: verified.authorizationToken, title: "Confirm event?", message: "The event will move from Pending Confirmation to Confirmed.", label: "Confirm Event" });
      setAuthorization(null);
    } catch (error) { setActionError(error.message); }
    finally { setBusy(false); }
  }
  async function confirmEvent() {
    if (!confirmation || busy) return;
    setBusy(true); setActionError("");
    try {
      const body = await requestJson("/next/api/events/mutations-direct", { method: "POST", body: JSON.stringify({ action: "workflow-transition", eventId: confirmation.eventId, targetStatus: "in_progress", authorizationToken: confirmation.token }) });
      if (!body.event?.id) throw new Error("The event could not be refreshed.");
      detailRequest.current++;
      setEvents(current => current.map(event => event.id === body.event.id ? { ...event, status: body.event.status } : event));
      setActiveEvent(body.event); setConfirmation(null);
    } catch (error) { setActionError(error.message); setConfirmation(null); }
    finally { setBusy(false); }
  }
  return (
    <section className="events-shell events-calendar-shell agenda-v2" aria-label="Event management">
      <div className="agenda-top">
        <section className="agenda-hero">
          <div><h2>Events Management</h2><p>Plan, organize, and track all school events in one place.</p></div>
          <div className="agenda-hero-art" aria-hidden="true"><svg viewBox="0 0 220 140" fill="none"><ellipse cx="116" cy="121" rx="94" ry="10" fill="#f6d7ab"/><path d="M29 103C12 83 20 64 43 78C59 86 58 104 61 119M166 116C164 83 184 60 202 69C212 91 190 110 166 116" fill="#8dc58c"/><path d="M180 112C181 85 205 91 209 103C201 116 190 119 180 119" fill="#55a76b"/><path d="M63 30H174L194 118H55Z" fill="#232326"/><path d="M51 30H163L176 112Q177 120 168 120H42Q33 120 35 111L43 40Q44 30 51 30Z" fill="white"/><path d="M51 30H163L168 53H41L43 40Q44 30 51 30Z" fill="#ff7900"/><path d="M67 38V22C67 10 83 10 83 22V32M123 38V22C123 10 139 10 139 22V32" stroke="#262628" strokeWidth="4" strokeLinecap="round"/><g fill="#eeeae5">{Array.from({length:12},(_,i)=><rect key={i} x={53+(i%4)*28} y={61+Math.floor(i/4)*18} width="21" height="13" rx="4"/>)}</g><circle cx="150" cy="92" r="19" fill="#258b3b"/><path d="M141 92L147 98L159 85" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M30 18L18 10M25 33L9 32M43 12L38 1" stroke="#ff7900" strokeWidth="4" strokeLinecap="round"/></svg></div>
        </section>
        <section className="agenda-stats" aria-label="Event totals">{stats.map(stat => <article key={stat.key} className={`agenda-stat agenda-stat--${stat.key}`}><span className="agenda-stat-icon"><EventIcon name={stat.icon}/></span><span><small>{stat.label}</small><strong>{stat.count}</strong></span></article>)}</section>
      </div>
      <div className="agenda-layout">
        <aside className="agenda-left">
          <section className="agenda-panel agenda-calendar" aria-label="Monthly event calendar">
            <div className="agenda-month"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><EventIcon name="chevron-left"/></button><h3>{month.toLocaleDateString("en-GB",{month:"long"})} <span>{month.getFullYear()}</span></h3><button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><EventIcon name="chevron-right"/></button></div>
            <div className="agenda-weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => <span key={day}>{day}</span>)}</div>
            <div className="agenda-days">{calendarDays.map(day => {
              const matches = scheduled.filter(event => eventOnDate(event,day));
              const states = [...new Set(matches.map(event => eventConfirmation(event.status)))];
              const selected = dateKey(day) === selectedKey;
              return <button type="button" key={dateKey(day)} className={`agenda-day${day.getMonth() !== month.getMonth() ? " is-outside" : ""}${selected ? " is-selected" : ""}${sameDay(day,today) ? " is-today" : ""}`} aria-pressed={selected} aria-label={`${formatDate(day,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}, ${matches.length} events${states.length ? `, ${states.map(state => state === "pending" ? "Pending Confirmation" : "Confirmed").join(", ")}` : ""}`} onClick={() => selectDate(day)}><strong>{day.getDate()}</strong><span className="agenda-dots">{states.map(state => <i key={state} className={`agenda-dot agenda-dot--${state}`}/>)}</span></button>;
            })}</div>
            <div className="agenda-legend"><span><i className="agenda-dot agenda-dot--pending"/>Pending Confirmation</span><span><i className="agenda-dot agenda-dot--confirmed"/>Confirmed</span></div>
            <button type="button" className="agenda-today" onClick={() => selectDate(today)}>Today</button>
          </section>
          {canCreate ? <button type="button" className="agenda-add" onClick={openNewEvent}><EventIcon name="plus-circle"/>Add New Event</button> : null}
        </aside>
        <section className="agenda-panel agenda-list" aria-label="Event agenda">
          <div className="agenda-toolbar"><div className="agenda-tabs" role="tablist" aria-label="Event history">{[{key:"upcoming",label:"Upcoming",icon:"calendar"},{key:"past",label:"Past",icon:"clock"},{key:"archived",label:"Archived",icon:"archive"}].map(tab => <button type="button" role="tab" aria-selected={activeList === tab.key} key={tab.key} className={activeList === tab.key ? "is-active" : ""} onClick={() => {setActiveList(tab.key);setFilter("all");if(tab.key === "upcoming" && selectedDate < today) setSelectedKey(dateKey(today));}}><EventIcon name={tab.icon}/>{tab.label} ({lists[tab.key].length})</button>)}</div><div className="agenda-tools"><label className="agenda-search"><EventIcon name="search"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events…" aria-label="Search events"/></label><label className="agenda-filter"><EventIcon name="filter"/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter confirmation status"><option value="all">All statuses</option><option value="pending">Pending Confirmation</option><option value="confirmed">Confirmed</option>{activeList !== "upcoming" ? <option value="cancelled">Cancelled</option> : null}</select></label></div></div>
          <div className="agenda-rows" role="tabpanel">{list.length ? list.map(event => <button type="button" key={event.id} className={`agenda-row agenda-row--${eventConfirmation(event.status)}`} onClick={() => openEventDetails(event)}><span className="agenda-row-date"><small>{formatDate(startDate(event),{weekday:"short"})}</small><strong>{formatDate(startDate(event),{day:"2-digit",month:"short"})}</strong></span><span className="agenda-row-main"><strong>{event.eventName || "Untitled Event"}</strong><span><span><EventIcon name="map-pin"/>{event.venueName || event.organizationName || event.governorate || "Venue to be confirmed"}</span>{event.expectedAttendees != null ? <span><EventIcon name="user"/>{event.expectedAttendees} Attendees</span> : null}</span></span><StatusPill status={event.status}/><span className="agenda-row-more"><EventIcon name="more-horizontal"/></span></button>) : <div className="agenda-empty"><EventIcon name="calendar"/><strong>No {activeList} events</strong><span>{search || filter !== "all" ? "Try changing your search or filter." : "Events will appear here when available."}</span></div>}</div>
        </section>
      </div>
      {!authorization && !confirmation ? <DetailsModal event={activeEvent} canOpenRequests={canOpenRequests} canExport={canExport} canConfirm={canConfirm} onConfirmEvent={beginConfirmation} onClose={() => {detailRequest.current++;setActiveEvent(null);setActionError("");}} /> : null}
      {authorization ? <AuthorizationModal authorization={authorization} busy={busy} error={actionError} onClose={() => { if (!busy) {setAuthorization(null);setActionError("");} }} onPassword={password=>setAuthorization(current=>({...current,password}))} onSubmit={authorizeConfirmation}/> : null}
      {confirmation ? <ConfirmationModal confirmation={confirmation} busy={busy} onClose={() => {if(!busy)setConfirmation(null);}} onConfirm={confirmEvent}/> : null}
      {actionError && !authorization ? <div className="agenda-action-error" role="alert">{actionError}<button type="button" aria-label="Dismiss error" onClick={()=>setActionError("")}>×</button></div> : null}
    </section>
  );
}
