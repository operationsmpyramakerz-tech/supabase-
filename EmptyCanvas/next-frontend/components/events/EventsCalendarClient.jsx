"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";
import EventIcon from "./EventIcon";
import { AuthorizationModal, ConfirmationModal, EventsDetailsModal } from "./EventsDialogs";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { eventRequestScopeFor } from "../../lib/event-request-scope.mjs";
import { eventConfirmation, eventConfirmationLabel } from "../../lib/event-confirmation.mjs";
import { localDay, startOfDay, startOfWeek, dateKey, sameDay, startDate, endDate, eventOnDate, isScheduledEvent, hasEventsNextWeek } from "../../lib/event-calendar-dates.mjs";

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

function formatDate(value, options = { day: "2-digit", month: "short", year: "numeric" }) {
  const date = value instanceof Date ? value : localDay(value);
  return date ? date.toLocaleDateString("en-GB", options) : "—";
}

function typeLabel(event) {
  const custom = text(event?.eventTypeCustom);
  if (custom) return custom;
  const key = lower(event?.eventType) || "other";
  return TYPE_LABELS[key] || key.replace(/^custom_/, "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function allowedSet(account) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(lower));
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

function DetailsModal({ event, canOpenRequests, canEdit = false, canCancel = false, canExport = true, canConfirm, onConfirmEvent, onRequestAction, onClose, busy }) {
  useEffect(() => {
    if (!event) return undefined;
    const onKey = (keyEvent) => { if (keyEvent.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);
  return <EventsDetailsModal event={event} calendarMode canOpenRequests={canOpenRequests} canEdit={canEdit} canCancel={canCancel} canExport={canExport} canWorkflow={canConfirm} onConfirmEvent={onConfirmEvent} onRequestAction={onRequestAction} onClose={onClose} busy={busy} />;
}

export default function EventsCalendarClient({ account, initialEvents = [], canMutateRequests = false }) {
  const access = useMemo(() => allowedSet(account), [account]);
  const canCreate = canMutateRequests && access.has("event requests") && featureAllowed(account, "events.requests.view") && featureAllowed(account, "events.requests.create");
  const canOpenRequests = access.has("event requests") && featureAllowed(account, "events.requests.view")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.view"));
  const canEdit = canMutateRequests && canOpenRequests && featureAllowed(account, "events.requests.edit");
  const canCancel = canMutateRequests && canOpenRequests && featureAllowed(account, "events.requests.cancel");
  const canExport = canOpenRequests && featureAllowed(account, "events.requests.pdf")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.pdf"));
  const canConfirm = canMutateRequests && canOpenRequests && featureAllowed(account, "events.requests.workflow")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.workflow"));
  const [events, setEvents] = useState(initialEvents);
  const [authorization, setAuthorization] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [activeList, setActiveList] = useState("upcoming");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeEvent, setActiveEvent] = useState(null);
  const detailRequest = useRef(0);
  const deepLinkOpened = useRef(false);
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedDate = useMemo(() => localDay(selectedKey) || today, [selectedKey, today]);
  const scheduled = useMemo(() => events.filter(isScheduledEvent), [events]);
  const nextWeekHasEvents = useMemo(() => hasEventsNextWeek(week, scheduled), [week, scheduled]);
  const archived = useMemo(() => events.filter(event => event.isArchived), [events]);
  const upcoming = useMemo(() => scheduled.filter(event => endDate(event) && endDate(event) >= today).sort((a,b) => startDate(a) - startDate(b)), [scheduled,today]);
  const past = useMemo(() => events.filter(event => !event.isArchived && (eventConfirmation(event.status) === "cancelled" || (endDate(event) && endDate(event) < today))).sort((a,b) => (startDate(b)?.getTime() || 0) - (startDate(a)?.getTime() || 0)), [events,today]);
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = new Date(week);
    day.setDate(week.getDate() + index);
    return day;
  }), [week]);
  const weekLabel = useMemo(() => {
    const last = new Date(week);
    last.setDate(week.getDate() + 6);
    const from = week.toLocaleDateString("en-GB", { month: "short" });
    const to = last.toLocaleDateString("en-GB", { month: "short" });
    return `${week.getDate()} ${from} – ${last.getDate()} ${to}`;
  }, [week]);
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
    setWeek(startOfWeek(day));
    setActiveList(day < today ? "past" : "upcoming");
  }
  function shiftWeek(direction) {
    const target = new Date(selectedDate);
    target.setDate(target.getDate() + direction * 7);
    selectDate(target);
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
  useEffect(() => {
    if (deepLinkOpened.current || typeof window === "undefined") return;
    deepLinkOpened.current = true;
    const eventId = new URLSearchParams(window.location.search).get("event");
    const selected = events.find(item => item.id === eventId);
    if (selected) void openEventDetails(selected);
    // Only run once for legacy bookmark/notification deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  function beginRequestAction(action) {
    if (!activeEvent || !["edit", "cancel"].includes(action)) return;
    if (action === "edit" && !canEdit || action === "cancel" && !canCancel) return;
    setActionError("");
    setAuthorization({ intent: "request_action", action, title: action === "edit" ? "Edit Event" : "Cancel Event", eventId: activeEvent.id, password: "" });
  }
  async function authorizeConfirmation(e) {
    e.preventDefault();
    if (!authorization || busy) return;
    setBusy(true); setActionError("");
    try {
      const action = authorization.intent === "request_action" ? authorization.action : "";
      const verified = await requestJson("/next/api/events/admin/verify", {
        method: "POST",
        body: JSON.stringify(action
          ? { intent: "request_action", action, eventId: authorization.eventId, password: authorization.password }
          : { intent: "request_workflow", targetStatus: "in_progress", eventId: authorization.eventId, password: authorization.password }),
      });
      if (action === "edit") {
        try { window.sessionStorage.setItem(`erp.events.editAuth.${authorization.eventId}`, text(verified.authorizationToken)); } catch {}
        navigateWithinApp(`/next/events/new?edit=${encodeURIComponent(authorization.eventId)}`);
        setAuthorization(null);
        return;
      }
      if (action === "cancel") {
        setConfirmation({ kind: "cancel", eventId: authorization.eventId, token: verified.authorizationToken, title: "Cancel event?", message: "This event will be marked as Cancelled.", label: "Confirm Cancellation" });
      } else {
        setConfirmation({ kind: "confirm", eventId: authorization.eventId, token: verified.authorizationToken, title: "Confirm event?", message: "The event will move from Pending Confirmation to Confirmed.", label: "Confirm Event" });
      }
      setAuthorization(null);
    } catch (error) { setActionError(error.message); }
    finally { setBusy(false); }
  }
  async function confirmEvent() {
    if (!confirmation || busy) return;
    setBusy(true); setActionError("");
    try {
      const body = await requestJson("/next/api/events/mutations-direct", { method: "POST", body: JSON.stringify(confirmation.kind === "cancel"
        ? { action: "request-action", requestAction: "cancel", eventId: confirmation.eventId, authorizationToken: confirmation.token }
        : { action: "workflow-transition", eventId: confirmation.eventId, targetStatus: "in_progress", authorizationToken: confirmation.token }) });
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
        <section className="agenda-stats" aria-label="Event totals">{stats.map(stat => <article key={stat.key} className={`agenda-stat agenda-stat--${stat.key}`}><span className="agenda-stat-icon"><EventIcon name={stat.icon}/></span><span><small>{stat.label}</small><strong>{stat.count}</strong></span></article>)}</section>
      </div>
      <div className="agenda-layout">
        <aside className="agenda-left">
          <section className="agenda-panel agenda-calendar" aria-label="Weekly event calendar">
            <div className="agenda-month">
              <button type="button" className="agenda-week-nav" aria-label="Previous week" onClick={() => shiftWeek(-1)}><EventIcon name="chevron-left"/></button>
              <div className="agenda-month-title"><h3>{selectedDate.toLocaleDateString("en-GB",{month:"long"})} <span>{selectedDate.getFullYear()}</span></h3><small>{weekLabel}</small></div>
              <button type="button" className={`agenda-week-nav${nextWeekHasEvents ? " has-next-week-events" : ""}`} aria-label={nextWeekHasEvents ? "Next week — events scheduled" : "Next week"} title={nextWeekHasEvents ? "Events scheduled next week" : "Next week"} onClick={() => shiftWeek(1)}><EventIcon name="chevron-right"/></button>
            </div>
            <div className="agenda-days">{calendarDays.map(day => {
              const matches = scheduled.filter(event => eventOnDate(event,day));
              const states = [...new Set(matches.map(event => eventConfirmation(event.status)))];
              const selected = dateKey(day) === selectedKey;
              return <button type="button" key={dateKey(day)} className={`agenda-day${selected ? " is-selected" : ""}${sameDay(day,today) ? " is-today" : ""}`} aria-pressed={selected} aria-label={`${formatDate(day,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}, ${matches.length} events${states.length ? `, ${states.map(state => state === "pending" ? "Pending Confirmation" : "Confirmed").join(", ")}` : ""}`} onClick={() => selectDate(day)}><small>{day.toLocaleDateString("en-GB",{weekday:"short"})}</small><strong>{day.getDate()}</strong><span className="agenda-dots">{states.map(state => <i key={state} className={`agenda-dot agenda-dot--${state}`}/>)}</span></button>;
            })}</div>
            <div className="agenda-legend"><span><i className="agenda-dot agenda-dot--pending"/>Pending Confirmation</span><span><i className="agenda-dot agenda-dot--confirmed"/>Confirmed</span></div>
          </section>
          {canCreate ? <button type="button" className="agenda-add" onClick={openNewEvent}><EventIcon name="plus-circle"/>Add New Event</button> : null}
        </aside>
        <section className="agenda-panel agenda-list" aria-label="Event agenda">
          <div className="agenda-toolbar"><div className="agenda-tabs" role="tablist" aria-label="Event history">{[{key:"upcoming",label:"Upcoming",icon:"calendar"},{key:"past",label:"Past",icon:"clock"},{key:"archived",label:"Archived",icon:"archive"}].map(tab => <button type="button" role="tab" aria-selected={activeList === tab.key} key={tab.key} className={activeList === tab.key ? "is-active" : ""} onClick={() => {setActiveList(tab.key);setFilter("all");if(tab.key === "upcoming" && selectedDate < today) {setSelectedKey(dateKey(today));setWeek(startOfWeek(today));}}}><EventIcon name={tab.icon}/>{tab.label} ({lists[tab.key].length})</button>)}</div><div className="agenda-tools"><label className="agenda-search"><EventIcon name="search"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events…" aria-label="Search events"/></label><label className="agenda-filter"><EventIcon name="filter"/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter confirmation status"><option value="all">All statuses</option><option value="pending">Pending Confirmation</option><option value="confirmed">Confirmed</option>{activeList !== "upcoming" ? <option value="cancelled">Cancelled</option> : null}</select></label></div></div>
          <div className="agenda-rows" role="tabpanel">{list.length ? list.map(event => <button type="button" key={event.id} className={`agenda-row agenda-row--${eventConfirmation(event.status)}`} onClick={() => openEventDetails(event)}><span className="agenda-row-date"><small>{formatDate(startDate(event),{weekday:"short"})}</small><strong>{formatDate(startDate(event),{day:"2-digit",month:"short"})}</strong></span><span className="agenda-row-main"><strong>{event.eventName || "Untitled Event"}</strong><span><span><EventIcon name="map-pin"/>{event.venueName || event.organizationName || event.governorate || "Venue to be confirmed"}</span>{event.expectedAttendees != null ? <span><EventIcon name="user"/>{event.expectedAttendees} Attendees</span> : null}</span></span><StatusPill status={event.status}/><span className="agenda-row-more"><EventIcon name="more-horizontal"/></span></button>) : <div className="agenda-empty"><EventIcon name="calendar"/><strong>No {activeList} events</strong><span>{search || filter !== "all" ? "Try changing your search or filter." : "Events will appear here when available."}</span></div>}</div>
        </section>
      </div>
      {!authorization && !confirmation ? <DetailsModal busy={busy} event={activeEvent} canOpenRequests={canOpenRequests} canEdit={canEdit} canCancel={canCancel} canExport={canExport} canConfirm={canConfirm} onConfirmEvent={beginConfirmation} onRequestAction={beginRequestAction} onClose={() => {detailRequest.current++;setActiveEvent(null);setActionError("");}} /> : null}
      {authorization ? <AuthorizationModal authorization={authorization} busy={busy} error={actionError} onClose={() => { if (!busy) {setAuthorization(null);setActionError("");} }} onPassword={password=>setAuthorization(current=>({...current,password}))} onSubmit={authorizeConfirmation}/> : null}
      {confirmation ? <ConfirmationModal confirmation={confirmation} busy={busy} onClose={() => {if(!busy)setConfirmation(null);}} onConfirm={confirmEvent}/> : null}
      {actionError && !authorization ? <div className="agenda-action-error" role="alert">{actionError}<button type="button" aria-label="Dismiss error" onClick={()=>setActionError("")}>×</button></div> : null}
    </section>
  );
}
