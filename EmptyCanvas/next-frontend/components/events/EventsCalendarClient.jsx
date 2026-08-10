"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Done",
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

function typeClass(event) {
  return (lower(event?.eventType) || "other").replace(/[^a-z0-9_-]/g, "") || "other";
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

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.error) || "Unable to load the event schedule.");
  return body;
}

function StatusPill({ status }) {
  const key = normalizeStatus(status);
  return <span className={`events-status events-status--${key} next-events-status next-events-status--${key}`}>{STATUS_LABELS[key]}</span>;
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

function DetailsModal({ event, canOpenRequests, onClose }) {
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
              <DetailItem label="Expected attendees" value={event.expectedAttendees ? String(event.expectedAttendees) : "—"} />
              <DetailItem label="Requested by" value={event.requesterName} />
            </div>
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Venue</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Venue" value={event.venueName} />
              <DetailItem label="Governorate" value={event.governorate} />
              <DetailItem label="Setup time" value={event.venueSetupTime} />
              <DetailItem label="Utilities" value={utilities} />
            </div>
            {mapUrl ? <a className="next-events-map-link" href={mapUrl} target="_blank" rel="noreferrer">Open map location ↗</a> : null}
          </section>

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
        </div>

        <footer className="events-modal__actions next-events-modal-actions">
          <div>
            <a className="events-secondary-btn secondary-button" href={`/api/events/${encodeURIComponent(event.id)}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
            {canOpenRequests ? <a className="events-secondary-btn secondary-button" href="/next/events">Open Event Requests</a> : null}
          </div>
          <button type="button" className="events-primary-btn primary-button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}

export default function EventsCalendarClient({ account, initialEvents = [], bootstrapWarnings = [] }) {
  const access = useMemo(() => allowedSet(account), [account]);
  const canCreate = access.has("event requests");
  const canOpenRequests = access.has("event requests");
  const canOpenComponents = access.has("event components");
  const [events, setEvents] = useState(Array.isArray(initialEvents) ? initialEvents : []);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [activeList, setActiveList] = useState("upcoming");
  const [activeEvent, setActiveEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedDate = useMemo(() => localDay(selectedKey) || startOfDay(new Date()), [selectedKey]);
  const today = useMemo(() => startOfDay(new Date()), []);

  const datedEvents = useMemo(() => events.filter((event) => startDate(event)), [events]);
  const eventsForDate = (day) => datedEvents.filter((event) => eventOnDate(event, day));

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [month]);

  const upcoming = useMemo(() => datedEvents
    .filter((event) => {
      const end = endDate(event);
      return end && end >= selectedDate && normalizeStatus(event.status) !== "cancelled";
    })
    .sort((a, b) => (startDate(a)?.getTime() || Infinity) - (startDate(b)?.getTime() || Infinity)), [datedEvents, selectedDate]);

  const past = useMemo(() => datedEvents
    .filter((event) => endDate(event) && endDate(event) < today)
    .sort((a, b) => (startDate(b)?.getTime() || -Infinity) - (startDate(a)?.getTime() || -Infinity)), [datedEvents, today]);

  const selectedDayEvents = useMemo(() => eventsForDate(selectedDate), [datedEvents, selectedKey]);
  const list = activeList === "past" ? past : upcoming;
  const activeMonthEvents = useMemo(() => datedEvents.filter((event) => {
    const start = startDate(event);
    const end = endDate(event);
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return start && end && start <= last && end >= first;
  }), [datedEvents, month]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const payload = await requestJson(`/api/events?_ts=${Date.now()}`);
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
    } catch (refreshError) {
      setError(refreshError?.message || "Unable to refresh the schedule.");
    } finally {
      setLoading(false);
    }
  }

  function selectDate(day) {
    setSelectedKey(dateKey(day));
    if (day.getFullYear() !== month.getFullYear() || day.getMonth() !== month.getMonth()) {
      setMonth(startOfMonth(day));
    }
  }

  function openNewEvent() {
    const overlapping = selectedDayEvents.filter((event) => normalizeStatus(event.status) !== "cancelled");
    const params = new URLSearchParams({ startDate: selectedKey });
    const codes = Array.from(new Set(overlapping.map((event) => text(event.eventCode)).filter(Boolean)));
    if (codes.length) params.set("conflictCodes", codes.join(","));
    window.location.href = `/next/events/new?${params.toString()}`;
  }

  return (
    <section className="events-shell events-calendar-shell next-events-calendar-page">
      <section className="events-calendar-workspace" aria-label="Event schedule">
        <div className="events-calendar-workspace__top">
          <div><span className="events-eyebrow">Event schedule</span></div>
          <div className="events-calendar-toolbar">
            <button type="button" className="events-secondary-btn" onClick={() => selectDate(new Date())}>Today</button>
            <button type="button" className="events-secondary-btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            {canCreate ? <button type="button" className="events-primary-btn" onClick={openNewEvent}>＋ Add New Event</button> : null}
          </div>
        </div>

        {bootstrapWarnings.length ? <div className="next-inline-warning">Some optional calendar data could not be loaded. The available schedule is shown below.</div> : null}
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}

      <div className="events-calendar-layout next-events-calendar-layout">
        <section className="events-calendar-card next-events-calendar-card">
          <header className="events-calendar-card__header">
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="events-calendar-nav" aria-label="Previous month">‹</button>
            <div className="events-calendar-month-title"><h3>{month.toLocaleDateString("en-GB", { month: "long" })}</h3><span>{month.getFullYear()}</span></div>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="events-calendar-nav" aria-label="Next month">›</button>
          </header>

          <div className="events-calendar-weekdays next-events-calendar-weekdays" aria-hidden="true">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="events-calendar-grid next-events-calendar-grid">
            {calendarDays.map((day) => {
              const scheduled = eventsForDate(day);
              const outside = day.getMonth() !== month.getMonth();
              const selected = dateKey(day) === selectedKey;
              const current = sameDay(day, today);
              const markers = scheduled.slice(0, 3);
              return (
                <button
                  type="button"
                  key={dateKey(day)}
                  className={`events-calendar-day ${outside ? "is-outside " : ""}${selected ? "is-selected " : ""}${current ? "is-today " : ""}${scheduled.length ? "has-events" : ""}`.trim()}
                  onClick={() => selectDate(day)}
                  aria-pressed={selected}
                  aria-label={`${formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${scheduled.length ? `, ${scheduled.length} event${scheduled.length === 1 ? "" : "s"}` : ""}`}
                >
                  <span className="events-calendar-day__number day-number">{day.getDate()}</span>
                  {scheduled.length ? (
                    <span className="events-calendar-day__markers day-markers">
                      {markers.map((event, index) => <i className={`type-${typeClass(event)}`} key={`${event.id}-${index}`} />)}
                      {scheduled.length > markers.length ? <b>+{scheduled.length - markers.length}</b> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <footer className="events-calendar-legend next-events-calendar-legend">
            <span><i className="selected" /> Selected date</span>
            <span><i className="scheduled" /> Event scheduled</span>
          </footer>
        </section>

        <aside className="events-calendar-sidebar next-events-calendar-side">
          <section className="next-events-calendar-selected-card">
            <header><div><small>Selected date</small><h3>{formatDate(selectedDate, { weekday: "long", day: "2-digit", month: "long" })}</h3></div><b>{selectedDayEvents.length}</b></header>
            <div className="next-events-calendar-selected-list">
              {selectedDayEvents.length ? selectedDayEvents.map((event) => (
                <button type="button" key={event.id} onClick={() => setActiveEvent(event)}>
                  <i className={`type-${typeClass(event)}`} />
                  <span><strong>{event.eventName || "Untitled Event"}</strong><small>{event.organizationName || event.governorate || typeLabel(event)}</small></span>
                  <StatusPill status={event.status} />
                </button>
              )) : <div className="next-events-calendar-empty"><strong>No events on this date</strong><span>Select another date or create a new event.</span></div>}
            </div>
          </section>

          <section className="events-calendar-events-card next-events-calendar-list-card">
            <div className="events-calendar-list-tabs next-events-calendar-tabs">
              <button type="button" className={`events-calendar-list-tab${activeList === "upcoming" ? " is-active active" : ""}`} onClick={() => setActiveList("upcoming")}><span>Upcoming</span><b>{upcoming.length}</b></button>
              <button type="button" className={`events-calendar-list-tab${activeList === "past" ? " is-active active" : ""}`} onClick={() => setActiveList("past")}><span>Past</span><b>{past.length}</b></button>
            </div>
            <div className="events-calendar-section-heading next-events-calendar-list-head"><div><small>{activeList === "past" ? "Before today" : `From ${formatDate(selectedDate, { day: "2-digit", month: "short", year: "numeric" })}`}</small><h3>{activeList === "past" ? "Past Events" : "Upcoming Events"}</h3></div><b>{list.length}</b></div>
            <div className="events-calendar-upcoming-list next-events-calendar-event-list">
              {list.length ? list.map((event) => (
                <button type="button" className="events-calendar-upcoming-item" key={event.id} onClick={() => setActiveEvent(event)}>
                  <span className="events-calendar-upcoming-item__date event-date"><strong>{formatDate(startDate(event), { day: "2-digit", month: "short" })}</strong><small>{startDate(event)?.getFullYear() || "—"}</small></span>
                  <span className="events-calendar-upcoming-item__body event-copy"><small>{event.organizationName || event.governorate || "Event execution"}</small><strong>{event.eventName || "Untitled Event"}</strong><em>{typeLabel(event)} · {event.governorate || "Location to be confirmed"}</em></span>
                  <span className="event-arrow">↗</span>
                </button>
              )) : <div className="next-events-calendar-empty"><strong>{activeList === "past" ? "No past events" : "No upcoming events"}</strong><span>{activeList === "past" ? "Completed event history will appear here." : "No active events are scheduled from the selected date onward."}</span></div>}
            </div>
          </section>
        </aside>
      </div>

      <div className="next-events-calendar-footer-actions">
        {canOpenRequests ? <a className="events-secondary-btn secondary-button" href="/next/events">Event Requests</a> : null}
        {canOpenComponents ? <a className="events-secondary-btn secondary-button" href="/next/event-components">Event Components</a> : null}
        <a className="events-secondary-btn secondary-button" href="/events/calendar?classic=1">Open classic Calendar</a>
      </div>

      </section>
      <DetailsModal event={activeEvent} canOpenRequests={canOpenRequests} onClose={() => setActiveEvent(null)} />
    </section>
  );
}
