"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { navigateWithinApp } from "../../lib/client-navigation";
import EventIcon from "./EventIcon";
import EventsAddDock from "./EventsAddDock";
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

// Keep the agenda controls in a single row; this popover replaces the native
// mobile select without changing the confirmation status values.
function AgendaStatusFilter({ activeList, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [opensAbove, setOpensAbove] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const options = [
    { key: "all", label: "All statuses", icon: "layers" },
    { key: "pending", label: "Pending Confirmation", icon: "clock" },
    { key: "confirmed", label: "Confirmed", icon: "check-circle" },
    ...(activeList !== "upcoming" ? [{ key: "cancelled", label: "Cancelled", icon: "x-circle" }] : []),
  ];
  const selectedLabel = options.find(option => option.key === value)?.label || "All statuses";
  useEffect(() => { setOpen(false); }, [activeList]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = rootRef.current?.querySelector(".agenda-status-menu");
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      // Keep the menu clear of the mobile navigation dock when possible.
      const clearance = window.matchMedia("(max-width: 1020px)").matches ? 92 : 12;
      const needed = menu.getBoundingClientRect().height + 6;
      setOpensAbove(bottom - rect.bottom - clearance < needed && rect.top - top > bottom - rect.bottom - clearance);
    };
    positionMenu();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    window.visualViewport?.addEventListener("resize", positionMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      window.visualViewport?.removeEventListener("resize", positionMenu);
    };
  }, [open]);
  function closeAndFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function onKeyDown(event) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
    }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...rootRef.current.querySelectorAll(".agenda-status-menu-option")];
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
  return (
    <div className="agenda-status-filter" ref={rootRef} onKeyDown={onKeyDown} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={triggerRef} type="button" className={`agenda-status-filter-trigger${value !== "all" ? " is-filtered" : ""}${open ? " is-open" : ""}`} aria-label={`Filter confirmation status: ${selectedLabel}`} aria-expanded={open} title={`Filter: ${selectedLabel}`} onClick={() => setOpen(previous => !previous)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z"/></svg>
        {value !== "all" ? <span className="agenda-filter-dot" aria-hidden="true"/> : null}
      </button>
      {open ? <div className={`agenda-status-menu${opensAbove ? " opens-above" : ""}`} role="group" aria-label="Confirmation status">
        {options.map(option => <button key={option.key} type="button" className={`agenda-status-menu-option agenda-status-menu-option--${option.key}${value === option.key ? " is-active" : ""}`} aria-pressed={value === option.key} onClick={() => { onChange(option.key); closeAndFocus(); }}>
          <span className="agenda-status-menu-icon"><EventIcon name={option.icon}/></span>
          <span className="agenda-status-menu-label">{option.label}</span>
          <span className="agenda-status-menu-check" aria-hidden="true">{value === option.key ? <EventIcon name="check"/> : null}</span>
        </button>)}
      </div> : null}
    </div>
  );
}

// Independent action trigger: never nest buttons inside the card button.
function EventCardActions({ event, canEdit, canArchive, canExport, busy, onAction, open, onToggle, onClose }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  const options = [
    ...(canEdit && !event.isArchived ? [{ key: "edit", label: "Edit Event", icon: "edit-3" }] : []),
    ...(canExport ? [{ key: "pdf", label: "Download PDF", icon: "download" }] : []),
    ...(canArchive && !event.isArchived ? [{ key: "archive", label: "Delete / Archive", icon: "trash-2" }] : []),
  ];
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vv = window.visualViewport;
      const left = vv?.offsetLeft || 0, top = vv?.offsetTop || 0;
      const width = vv?.width || window.innerWidth, height = vv?.height || window.innerHeight;
      const menuWidth = Math.min(224, width - 16);
      const below = top + height - rect.bottom - 12;
      const above = rect.top - top - 12;
      const showAbove = below < options.length * 48 + 16 && above > below;
      setPosition({ left: Math.max(left + 8, Math.min(rect.right - menuWidth, left + width - menuWidth - 8)), width: menuWidth,
        top: showAbove ? undefined : rect.bottom + 6, bottom: showAbove ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.max(48, showAbove ? above : below) });
    }
    function outside(e) { if (!triggerRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) onClose(); }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); onClose(); triggerRef.current?.focus(); } }
    place();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, options.length, onClose]);
  useEffect(() => { if (open && position) menuRef.current?.querySelector("button, a")?.focus({ preventScroll: true }); }, [open, Boolean(position)]);
  if (!options.length) return null;
  return <>
    <button ref={triggerRef} type="button" className="agenda-row-more" aria-label={`Actions for ${event.eventName || event.eventCode || "event"}`} aria-expanded={open} disabled={busy} onClick={onToggle}><EventIcon name="more-horizontal"/></button>
    {open && position && createPortal(<div ref={menuRef} className="agenda-event-actions-menu" style={position} role="group" aria-label="Event actions" onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && !triggerRef.current?.contains(e.relatedTarget)) onClose(); }}>
      {options.map(option => option.key === "pdf"
        ? <a key={option.key} href={`/next/api/events/pdf-direct?id=${encodeURIComponent(event.id)}`} target="_blank" rel="noreferrer" onClick={onClose}><span><EventIcon name={option.icon}/></span>{option.label}</a>
        : <button key={option.key} type="button" className={option.key === "archive" ? "is-danger" : ""} onClick={() => { onClose(); onAction(option.key, event); }}><span><EventIcon name={option.icon}/></span>{option.label}</button>)}
    </div>, document.body)}
  </>;
}

function DetailsModal({ event, canOpenRequests, canCancel, canConfirm, onConfirmEvent, onRequestAction, onClose, busy }) {
  useEffect(() => {
    if (!event) return undefined;
    const onKey = (keyEvent) => { if (keyEvent.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);
  return <EventsDetailsModal event={event} calendarMode canOpenRequests={canOpenRequests} canCancel={canCancel} canWorkflow={canConfirm} onConfirmEvent={onConfirmEvent} onRequestAction={onRequestAction} onClose={onClose} busy={busy} />;
}

export default function EventsCalendarClient({ account, initialEvents = [], canMutateRequests = false, canArchiveRequests = false }) {
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
  const canArchive = canMutateRequests && canArchiveRequests && canOpenRequests && featureAllowed(account, "events.requests.archive")
    && !["own", "team", "none"].includes(eventRequestScopeFor(account, "events.requests.archive"));
  const [openMenuId, setOpenMenuId] = useState(null);
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
  // The persistent shell's HeaderSearch dispatches an input event both when
  // typing and when closing/clearing. Use the same bridge as the other pages.
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search events...";
    const handle = event => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);
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
    if (day >= today && filter === "cancelled") setFilter("all");
  }
  function shiftWeek(direction) {
    const target = new Date(selectedDate);
    target.setDate(target.getDate() + direction * 7);
    selectDate(target);
  }
  async function openEventDetails(event) {
    if (!event?.id) return;
    const requestId = ++detailRequest.current;
    setOpenMenuId(null);
    setActiveEvent(event);
    try {
      const body = await requestJson(`/next/api/events/${encodeURIComponent(event.id)}?${canOpenRequests ? "projectCards=1&" : "view=calendar&"}_ts=${Date.now()}`);
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
  function openNewEvent(creationStatus) {
    if (!canCreate || (creationStatus === "confirmed" && !canConfirm)) return;
    const params = new URLSearchParams({ startDate: selectedKey, creationStatus });
    const codes = [...new Set(scheduled.filter(event => eventOnDate(event,selectedDate)).map(event => text(event.eventCode)).filter(Boolean))];
    if (codes.length) params.set("conflictCodes", codes.join(","));
    navigateWithinApp(`/next/events/new?${params.toString()}`);
  }
  function beginConfirmation() {
    if (!activeEvent || !canConfirm || activeEvent.isArchived || eventConfirmation(activeEvent.status) !== "pending") return;
    setActionError("");
    setAuthorization({ title: "Confirm Event", eventId: activeEvent.id, password: "" });
  }
  function beginRequestAction(action, event = activeEvent) {
    if (!event || event.isArchived || busy || !["edit", "cancel", "archive"].includes(action)) return;
    if (action === "edit" && !canEdit || action === "cancel" && (!canCancel || eventConfirmation(event.status) === "cancelled") || action === "archive" && !canArchive) return;
    setActionError("");
    if (action === "archive") {
      setConfirmation({ kind: "archive", eventId: event.id, title: "Archive event?", message: "This removes the event from the active calendar and keeps its record in Archived.", label: "Archive Event", danger: true });
      return;
    }
    setAuthorization({ intent: "request_action", action, eventId: event.id, title: action === "edit" ? "Edit Event" : "Cancel Event", password: "" });
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
      const body = await requestJson("/next/api/events/mutations-direct", { method: "POST", body: JSON.stringify(confirmation.kind === "archive"
        ? { action: "archive-event", eventId: confirmation.eventId }
        : confirmation.kind === "cancel"
        ? { action: "request-action", requestAction: "cancel", eventId: confirmation.eventId, authorizationToken: confirmation.token }
        : { action: "workflow-transition", eventId: confirmation.eventId, targetStatus: "in_progress", authorizationToken: confirmation.token }) });
      if (!body.event?.id) throw new Error("The event could not be refreshed.");
      detailRequest.current++;
      setEvents(current => current.map(event => event.id === body.event.id ? { ...event, status: body.event.status, isArchived: body.event.isArchived } : event));
      // Only reopen details if the action originated from an open detail sheet.
      setActiveEvent(current => current?.id === body.event.id ? (confirmation.kind === "archive" ? null : body.event) : current);
      setConfirmation(null);
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
              return <button type="button" key={dateKey(day)} className={`agenda-day${selected ? " is-selected" : ""}${sameDay(day,today) ? " is-today" : ""}`} aria-pressed={selected} aria-current={sameDay(day,today) ? "date" : undefined} aria-label={`${formatDate(day,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}, ${matches.length} events${states.length ? `, ${states.map(state => state === "pending" ? "Pending Confirmation" : "Confirmed").join(", ")}` : ""}`} onClick={() => selectDate(day)}><small>{day.toLocaleDateString("en-GB",{weekday:"short"})}</small><strong>{day.getDate()}</strong><span className="agenda-dots">{states.map(state => <i key={state} className={`agenda-dot agenda-dot--${state}`}/>)}</span></button>;
            })}</div>
            <div className="agenda-legend"><span><i className="agenda-dot agenda-dot--pending"/>Pending Confirmation</span><span><i className="agenda-dot agenda-dot--confirmed"/>Confirmed</span></div>
          </section>
          {canCreate ? <EventsAddDock onCreate={openNewEvent} canConfirm={canConfirm} /> : null}
        </aside>
        <section className="agenda-panel agenda-list" aria-label="Event agenda">
          <div className="agenda-toolbar"><div className="agenda-tabs" role="tablist" aria-label="Event history">{[{key:"upcoming",label:"Upcoming",icon:"calendar"},{key:"past",label:"Past",icon:"clock"},{key:"archived",label:"Archived",icon:"archive"}].map(tab => <button type="button" role="tab" aria-selected={activeList === tab.key} key={tab.key} className={activeList === tab.key ? "is-active" : ""} onClick={() => {setActiveList(tab.key);setFilter("all");if(tab.key === "upcoming" && selectedDate < today) {setSelectedKey(dateKey(today));setWeek(startOfWeek(today));}}}><EventIcon name={tab.icon}/>{tab.label} ({lists[tab.key].length})</button>)}</div><AgendaStatusFilter activeList={activeList} value={filter} onChange={setFilter}/></div>
          <div className="agenda-rows" role="tabpanel">{list.length ? list.map(event => <article key={event.id} className={`agenda-row agenda-row--${eventConfirmation(event.status)}`}><button type="button" className="agenda-row-open" onClick={() => openEventDetails(event)}><span className="agenda-row-date"><small>{formatDate(startDate(event),{weekday:"short"})}</small><strong>{formatDate(startDate(event),{day:"2-digit",month:"short"})}</strong></span><span className="agenda-row-main"><strong>{event.eventName || "Untitled Event"}</strong><span><span><EventIcon name="map-pin"/>{event.venueName || event.organizationName || event.governorate || "Venue to be confirmed"}</span>{event.expectedAttendees != null ? <span><EventIcon name="user"/>{event.expectedAttendees} Attendees</span> : null}</span></span><StatusPill status={event.status}/></button><EventCardActions event={event} canEdit={canEdit} canArchive={canArchive} canExport={canExport} busy={busy} open={openMenuId === event.id} onToggle={() => setOpenMenuId(current => current === event.id ? null : event.id)} onClose={() => setOpenMenuId(null)} onAction={beginRequestAction}/></article>) : <div className="agenda-empty"><EventIcon name="calendar"/><strong>No {activeList} events</strong><span>{search || filter !== "all" ? "Try changing your search or filter." : "Events will appear here when available."}</span></div>}</div>
        </section>
      </div>
      {!authorization && !confirmation ? <DetailsModal busy={busy} event={activeEvent} canOpenRequests={canOpenRequests} canCancel={canCancel} canConfirm={canConfirm} onConfirmEvent={beginConfirmation} onRequestAction={beginRequestAction} onClose={() => {detailRequest.current++;setActiveEvent(null);setActionError("");}} /> : null}
      {authorization ? <AuthorizationModal authorization={authorization} busy={busy} error={actionError} onClose={() => { if (!busy) {setAuthorization(null);setActionError("");} }} onPassword={password=>setAuthorization(current=>({...current,password}))} onSubmit={authorizeConfirmation}/> : null}
      {confirmation ? <ConfirmationModal confirmation={confirmation} busy={busy} onClose={() => {if(!busy)setConfirmation(null);}} onConfirm={confirmEvent}/> : null}
      {actionError && !authorization ? <div className="agenda-action-error" role="alert">{actionError}<button type="button" aria-label="Dismiss error" onClick={()=>setActionError("")}>×</button></div> : null}
    </section>
  );
}
