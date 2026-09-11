"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventIcon from "./EventIcon";

const STATUS_LABELS = {
  submitted: "Submitted",
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
const TYPE_ICONS = {
  tech_day: "cpu",
  seminar: "mic",
  steam_fair: "star",
  competition: "award",
  exhibition: "image",
  other: "calendar",
};


function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value) {
  const status = lower(value).replace(/[\s-]+/g, "_");
  if (status === "under_review" || status === "approved") return "submitted";
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? status : "submitted";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateRange(event) {
  const start = toDate(event?.eventStartDate);
  const end = toDate(event?.eventEndDate);
  if (!start) return "Date to be confirmed";
  const first = formatDateTime(start);
  if (!end || end.getTime() === start.getTime()) return first;
  if (start.toDateString() === end.toDateString()) {
    return `${first} – ${end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `${first} – ${formatDateTime(end)}`;
}

function typeLabel(event) {
  const custom = text(event?.eventTypeCustom);
  if (custom) return custom;
  const type = lower(event?.eventType) || "other";
  return TYPE_LABELS[type] || type.replace(/^custom_/, "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function typeKey(event) {
  const custom = lower(event?.eventTypeCustom);
  return custom ? `custom:${custom}` : `built:${lower(event?.eventType) || "other"}`;
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://operations-hub.invalid";
    const url = new URL(raw, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function allowedSet(account) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(lower));
}

function apiError(body, fallback) {
  return text(body?.error || body?.message) || fallback;
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

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiError(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "Events"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function StatusPill({ status }) {
  const key = normalizeStatus(status);
  return <span className={`events-status events-status--${key} next-events-status next-events-status--${key}`}>{STATUS_LABELS[key]}</span>;
}

function SummaryCard({ label, value, note, tone = "default" }) {
  return (
    <article className={`next-events-summary-card next-events-summary-card--${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={`events-detail-item next-events-detail-item${wide ? " wide" : ""}`}>
      <small>{label}</small>
      <strong>{text(value) || "—"}</strong>
    </div>
  );
}

function ItemList({ items, component = false, empty }) {
  if (!Array.isArray(items) || !items.length) return <p className="next-events-empty-copy">{empty}</p>;
  return (
    <ul className="events-detail-list next-events-item-list">
      {items.map((item, index) => {
        const title = component ? item?.name : item?.title;
        const notes = component ? item?.notes : [item?.description, item?.notes].map(text).filter(Boolean).join(" · ");
        const quantity = number(item?.quantity);
        const total = number(item?.totalCost || quantity * number(item?.unitCost || item?.workingCost));
        return (
          <li key={`${text(title)}-${index}`}>
            <strong>{text(title) || "Untitled item"}</strong>
            <small>{quantity || 0} required{notes ? ` · ${notes}` : ""} · {formatMoney(total)}</small>
          </li>
        );
      })}
    </ul>
  );
}

function EventsDetailsModal({ event, busy, onClose, onDownload, onWorkflow, onRequestAction, canRequestActions }) {
  if (!event) return null;
  const mapUrl = safeUrl(event.locationUrl);
  const utilities = [event.requiresPower && "Power points", event.requiresInternet && "Internet", event.requiresSoundSystem && "Sound system"].filter(Boolean).join(" · ") || "No special utilities selected";
  const status = normalizeStatus(event.status);
  const workflow = status === "submitted"
    ? { targetStatus: "in_progress", label: "Mark as approved" }
    : status === "in_progress"
      ? { targetStatus: "completed", label: "Mark as delivered" }
      : null;

  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}>
      <section className="events-modal events-modal--detail next-modal next-events-details-modal" role="dialog" aria-modal="true" aria-label="Event request details">
        <header className="events-modal__header next-events-modal-head">
          <div>
            <span className="next-events-kicker">{event.eventCode || "Event request"}</span>
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
            <h3>Contact</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Contact person" value={event.contactPerson} />
              <DetailItem label="Phone" value={event.contactPhone} />
              <DetailItem label="Email" value={event.contactEmail} />
              <DetailItem label="Created" value={formatDateTime(event.createdAt)} />
            </div>
          </section>

          <section className="events-detail-block events-detail-block--wide next-events-detail-section next-events-detail-section--wide">
            <h3>Target audience</h3>
            <p>{text(event.audience) || "No audience details were added."}</p>
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Projects</h3>
            <ItemList items={event.projects} empty="No projects were added." />
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Marketing materials</h3>
            <ItemList items={event.marketingMaterials} component empty="No marketing materials were added." />
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Venue requirements</h3>
            <ItemList items={event.venueRequirements} component empty="No venue requirements were added." />
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Venue & location</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Venue" value={event.venueName} />
              <DetailItem label="Venue type" value={event.venueType} />
              <DetailItem label="Governorate" value={event.governorate} />
              <DetailItem label="Setup time" value={formatDateTime(event.venueSetupTime)} />
            </div>
            {mapUrl ? <a className="next-events-map-link" href={mapUrl} target="_blank" rel="noreferrer">Open map location ↗</a> : null}
          </section>

          <section className="events-detail-block next-events-detail-section">
            <h3>Site notes</h3>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Utilities" value={utilities} wide />
              <DetailItem label="Venue notes" value={event.venueNotes || "No venue notes were added."} wide />
            </div>
          </section>

          <section className="events-detail-block events-detail-block--wide next-events-detail-section next-events-detail-section--wide">
            <h3>Cost summary</h3>
            <div className="next-events-cost-grid">
              <span><small>Working cost</small><strong>{formatMoney(event.workingCost)}</strong></span>
              <span><small>Transport cost</small><strong>{formatMoney(event.transportCost)}</strong></span>
              <span><small>Total cost</small><strong>{formatMoney(event.totalCost)}</strong></span>
            </div>
          </section>

          {text(event.operationsNotes) ? (
            <section className="events-detail-block events-detail-block--wide next-events-detail-section next-events-detail-section--wide"><h3>Operations notes</h3><p>{event.operationsNotes}</p></section>
          ) : null}
        </div>

        <footer className="events-modal__actions next-events-modal-actions">
          <div>
            {canRequestActions ? <button type="button" className="events-secondary-btn secondary" disabled={busy} onClick={() => onRequestAction("edit")}>Edit</button> : null}
            {canRequestActions && status !== "cancelled" ? <button type="button" className="danger" disabled={busy} onClick={() => onRequestAction("cancel")}>Cancel request</button> : null}
          </div>
          <div>
            <button type="button" className="events-secondary-btn secondary" onClick={onDownload}>Download PDF</button>
            {workflow && canRequestActions ? <button type="button" className="events-primary-btn primary" disabled={busy} onClick={() => onWorkflow(workflow.targetStatus)}>{workflow.label}</button> : null}
          </div>
        </footer>
      </section>
    </div>
  );
}

function AuthorizationModal({ authorization, busy, error, onClose, onPassword, onSubmit }) {
  if (!authorization) return null;
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="events-modal events-modal--authorization next-modal next-events-auth-modal" onSubmit={onSubmit}>
        <header className="events-modal__header next-events-modal-head"><div><span className="next-events-kicker">Admin verification</span><h2>{authorization.title}</h2><p>Enter the shared Events Admin password to continue.</p></div><button type="button" className="events-modal__close next-modal-close" onClick={onClose}>×</button></header>
        <label className="events-field next-field"><span>Admin password</span><input autoFocus type="password" value={authorization.password} onChange={(event) => onPassword(event.target.value)} placeholder="Enter Admin password" /></label>
        {error ? <div className="events-form-error next-events-form-error">{error}</div> : null}
        <footer className="events-modal__actions next-events-modal-actions"><span /><div><button type="button" className="events-secondary-btn secondary" onClick={onClose}>Cancel</button><button type="submit" className="events-primary-btn primary" disabled={busy}>{busy ? "Verifying..." : "Verify & continue"}</button></div></footer>
      </form>
    </div>
  );
}

function ConfirmationModal({ confirmation, busy, onClose, onConfirm }) {
  if (!confirmation) return null;
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="events-modal events-modal--workflow-confirm next-modal next-events-confirm-modal" role="dialog" aria-modal="true">
        <header className="events-modal__header next-events-modal-head"><div><span className="next-events-kicker">Confirm action</span><h2>{confirmation.title}</h2><p>{confirmation.message}</p></div><button type="button" className="events-modal__close next-modal-close" onClick={onClose}>×</button></header>
        <footer className="events-modal__actions next-events-modal-actions"><span /><div><button type="button" className="events-secondary-btn secondary" onClick={onClose}>Back</button><button type="button" className={confirmation.danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Updating..." : confirmation.label}</button></div></footer>
      </section>
    </div>
  );
}

function ProfileModal({ profileState, onClose }) {
  if (!profileState) return null;
  const profile = profileState.profile || {};
  const initials = (text(profile.name || profileState.name) || "U").split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="events-modal next-modal next-events-profile-modal" role="dialog" aria-modal="true">
        <header className="events-modal__header next-events-modal-head"><div><span className="next-events-kicker">Created by</span><h2>{profile.name || profileState.name || "Team member"}</h2><p>{[profile.position, profile.department].map(text).filter(Boolean).join(" · ") || "Team member"}</p></div><button type="button" className="events-modal__close next-modal-close" onClick={onClose}>×</button></header>
        {profileState.loading ? <div className="next-events-profile-state">Loading profile details...</div> : profileState.error ? <div className="events-form-error next-events-form-error">{profileState.error}</div> : (
          <div className="next-events-profile-body">
            <div className="next-events-avatar">{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : <span>{initials}</span>}</div>
            <div className="events-detail-grid next-events-detail-grid">
              <DetailItem label="Name" value={profile.name || profile.username} />
              <DetailItem label="Department" value={profile.department} />
              <DetailItem label="Position" value={profile.position} />
              <DetailItem label="Employee code" value={profile.employeeCode} />
              <DetailItem label="Phone" value={profile.phone} />
              <DetailItem label="Email" value={profile.email} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function EventsClient({ account, initialEvents = [], bootstrapWarnings = [] }) {
  const permissions = useMemo(() => allowedSet(account), [account]);
  const canRequestActions = permissions.has("event requests");
  const canOpenCalendar = permissions.has("event calendar");
  const canOpenComponents = permissions.has("event components");

  const [events, setEvents] = useState(() => initialEvents.map((event) => ({ ...event, status: normalizeStatus(event.status) })));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const typeFilterRef = useRef(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [authorization, setAuthorization] = useState(null);
  const [authorizationError, setAuthorizationError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [profileState, setProfileState] = useState(null);

  useEffect(() => {
    const onPointerDown = (event) => {
      const root = typeFilterRef.current;
      if (root && !root.contains(event.target)) setTypeFilterOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setTypeFilterOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search event requests...";
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  const typeOptions = useMemo(() => {
    const counts = new Map();
    for (const event of events) {
      const key = typeKey(event);
      const rawType = lower(event?.eventType) || "other";
      const current = counts.get(key) || { key, label: typeLabel(event), icon: TYPE_ICONS[rawType] || "calendar", count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
    return [{ key: "all", label: "All event types", icon: "layers", count: events.length }, ...[...counts.values()].sort((a, b) => a.label.localeCompare(b.label))];
  }, [events]);

  const filtered = useMemo(() => {
    const search = lower(query);
    return events.filter((event) => {
      const eventStatus = normalizeStatus(event.status);
      if (status !== "all" && eventStatus !== status) return false;
      if (eventType !== "all" && typeKey(event) !== eventType) return false;
      if (!search) return true;
      return [event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.organizationName, event.governorate, event.requesterName, event.contactPerson]
        .map(lower)
        .join(" ")
        .includes(search);
    });
  }, [events, query, status, eventType]);

  const counts = useMemo(() => {
    const result = { all: events.length, submitted: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const event of events) result[normalizeStatus(event.status)] += 1;
    return result;
  }, [events]);

  const totalCost = useMemo(() => events.reduce((total, event) => total + number(event.totalCost), 0), [events]);
  const upcoming = useMemo(() => events.filter((event) => {
    const date = toDate(event.eventStartDate);
    return date && date.getTime() >= Date.now() && normalizeStatus(event.status) !== "cancelled";
  }).length, [events]);

  const refreshEvents = async () => {
    const body = await requestJson(`/api/events?_ts=${Date.now()}`);
    setEvents((Array.isArray(body.events) ? body.events : []).map((event) => ({ ...event, status: normalizeStatus(event.status) })));
  };

  const openDetails = async (event) => {
    setActiveEvent(event);
    try {
      const body = await requestJson(`/api/events/${encodeURIComponent(event.id)}?_ts=${Date.now()}`);
      setActiveEvent({ ...body.event, status: normalizeStatus(body.event?.status) });
    } catch (error) {
      setToast({ type: "error", title: "Events", message: error.message });
    }
  };

  const updateEvent = (updated) => {
    const normalized = { ...updated, status: normalizeStatus(updated?.status) };
    setEvents((current) => current.map((event) => event.id === normalized.id ? normalized : event));
    setActiveEvent(normalized);
  };

  const requestAuthorization = (kind, value) => {
    const event = activeEvent;
    if (!event) return;
    const title = kind === "workflow"
      ? (value === "in_progress" ? "Mark as approved" : "Mark as delivered")
      : (value === "edit" ? "Edit event request" : "Cancel event request");
    setAuthorization({ kind, value, eventId: event.id, password: "", title });
    setAuthorizationError("");
  };

  const authorize = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!authorization) return;
    const password = text(authorization.password);
    if (!password) {
      setAuthorizationError("Please enter the Admin password.");
      return;
    }
    setBusy(true);
    setAuthorizationError("");
    try {
      const isWorkflow = authorization.kind === "workflow";
      await requestJson("/api/events/admin/verify", {
        method: "POST",
        body: JSON.stringify(isWorkflow ? {
          password,
          intent: "request_workflow",
          eventId: authorization.eventId,
          targetStatus: authorization.value,
        } : {
          password,
          intent: "request_action",
          eventId: authorization.eventId,
          action: authorization.value,
        }),
      });

      if (!isWorkflow && authorization.value === "edit") {
        const editId = authorization.eventId;
        setAuthorization(null);
        window.location.href = `/next/events/new?edit=${encodeURIComponent(editId)}`;
        return;
      }

      const isCancel = authorization.kind === "request_action" && authorization.value === "cancel";
      const targetStatus = authorization.value;
      setAuthorization(null);
      setConfirmation({
        kind: authorization.kind,
        value: authorization.value,
        eventId: authorization.eventId,
        title: isCancel ? "Cancel event request?" : targetStatus === "completed" ? "Mark event as delivered?" : "Approve event request?",
        message: isCancel
          ? `${activeEvent?.eventCode || "This request"} will be changed to Cancelled.`
          : targetStatus === "completed"
            ? "The request will move from In progress to Done."
            : "The request will move from Submitted to In progress.",
        label: isCancel ? "Confirm cancellation" : targetStatus === "completed" ? "Confirm delivery" : "Confirm approval",
        danger: isCancel,
      });
    } catch (error) {
      setAuthorizationError(error.message || "Invalid Admin password.");
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    setBusy(true);
    try {
      const isCancel = confirmation.kind === "request_action";
      const body = await requestJson(
        isCancel
          ? `/api/events/${encodeURIComponent(confirmation.eventId)}/request-action`
          : `/api/events/${encodeURIComponent(confirmation.eventId)}/workflow-transition`,
        {
          method: "POST",
          body: JSON.stringify(isCancel ? { action: "cancel" } : { targetStatus: confirmation.value }),
        },
      );
      updateEvent(body.event);
      setConfirmation(null);
      setToast({ type: "success", title: "Events", message: isCancel ? "Event request cancelled." : confirmation.value === "completed" ? "Event request marked as Done." : "Event request marked as In progress." });
    } catch (error) {
      setToast({ type: "error", title: "Events", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const openProfile = async (event, clickEvent) => {
    clickEvent.stopPropagation();
    const key = text(event.createdByUserId || event.requesterName);
    const name = text(event.requesterName) || "Creator";
    setProfileState({ loading: true, name, profile: null, error: "" });
    try {
      const body = await requestJson(`/api/team-members/${encodeURIComponent(key || name)}/public`);
      setProfileState({ loading: false, name, profile: body, error: "" });
    } catch (error) {
      setProfileState({ loading: false, name, profile: null, error: error.message || "Could not load profile details." });
    }
  };

  return (
    <section className="events-shell">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="events-request-workspace" aria-labelledby="eventsListTitle">
        <h3 className="events-visually-hidden" id="eventsListTitle">Event Requests</h3>
        <input className="events-global-search-bridge" type="search" aria-label="Search event requests" tabIndex={-1} readOnly />

        <div className="events-orders-toolbar" aria-label="Event request status">
          <div className="events-orders-toolbar__scroll">
            <div className="events-orders-tabs" role="tablist" aria-label="Event request status tabs">
              {[
                { key: "all", label: "All", icon: "layers" },
                { key: "submitted", label: "Submitted", icon: "send" },
                { key: "in_progress", label: "In progress", icon: "activity" },
                { key: "completed", label: "Done", icon: "check" },
                { key: "cancelled", label: "Cancelled", icon: "x-circle" },
              ].map((item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={status === item.key}
                  className={`events-order-status-tab${status === item.key ? " is-active" : ""}`}
                  onClick={() => setStatus(item.key)}
                  key={item.key}
                >
                  <span className="order-status-tab__icon"><EventIcon name={item.icon} /></span>
                  <span className="order-status-tab__label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            ref={typeFilterRef}
            className={`orders-type-filter events-type-filter${typeFilterOpen ? " is-open" : ""}${eventType !== "all" ? " is-filtered" : ""}`}
          >
            <button
              type="button"
              className="orders-type-filter__button"
              aria-haspopup="menu"
              aria-expanded={typeFilterOpen}
              aria-label="Filter event requests by event type"
              onClick={() => setTypeFilterOpen((open) => !open)}
            >
              <span className="orders-type-filter__button-icon"><EventIcon name="filter" /></span>
              <span className="orders-type-filter__button-label">Filter</span>
              <span className="orders-type-filter__button-dot" hidden={eventType === "all"} />
            </button>

            {!typeFilterOpen ? null : (
              <div className="orders-type-filter__panel" role="menu" aria-label="Filter event requests by event type">
                <div className="orders-type-filter__panel-head">
                  <div className="orders-type-filter__panel-title">Filter by event type</div>
                  <div className="orders-type-filter__panel-sub">{events.length} event{events.length === 1 ? "" : "s"}</div>
                </div>
                <div className="orders-type-filter__options">
                  {typeOptions.map((option) => (
                    <button
                      type="button"
                      className={`orders-type-filter__option${option.key === eventType ? " is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={option.key === eventType}
                      key={option.key}
                      onClick={() => { setEventType(option.key); setTypeFilterOpen(false); }}
                    >
                      <span className="orders-type-filter__option-icon"><EventIcon name={option.icon} /></span>
                      <span className="orders-type-filter__option-body">
                        <span className="orders-type-filter__option-title">{option.label}</span>
                        <span className="orders-type-filter__option-sub">{option.count} event{option.count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="orders-type-filter__option-check"><EventIcon name="check" /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {filtered.length ? (
          <div className="events-request-cards" aria-live="polite">
            {filtered.map((event) => {
              const mapUrl = safeUrl(event.locationUrl);
              const rawType = lower(event.eventType) || "other";
              const typeClass = rawType.replace(/[^a-z0-9_]/g, "") || "other";
              const typeIcon = TYPE_ICONS[rawType] || "calendar";
              return (
                <article className="events-request-card co-card" key={event.id} onClick={() => openDetails(event)} role="button" tabIndex={0} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") openDetails(event); }}>
                  <div className="co-top">
                    <span className={`events-request-card__thumb events-request-card__thumb--${typeClass}`}><EventIcon name={typeIcon} /></span>
                    <div className="co-main">
                      <div className="co-title">{event.eventCode || "Pending reference"}</div>
                      <div className="co-sub">{formatDateRange(event)}</div>
                      <div className="co-createdby">{event.eventName || "Untitled Event"}</div>
                    </div>
                    <div className="events-request-card__count">{typeLabel(event)}</div>
                  </div>
                  <div className="co-divider" />
                  <div className="co-bottom">
                    <div className="co-est">
                      {mapUrl ? (
                        <a className="events-request-card__location events-request-card__location-link" href={mapUrl} target="_blank" rel="noreferrer" onClick={(clickEvent) => clickEvent.stopPropagation()}>
                          <EventIcon name="map-pin" /><span>{event.governorate || "Open location"}</span>
                        </a>
                      ) : (
                        <span className="events-request-card__location is-disabled"><EventIcon name="map-pin" /><span>{event.governorate || "Location to be confirmed"}</span></span>
                      )}
                    </div>
                    <div className="co-actions">
                      <StatusPill status={event.status} />
                      <button type="button" className="co-right-ico co-creator-btn" onClick={(clickEvent) => openProfile(event, clickEvent)} aria-label={`Created by ${event.requesterName || "creator"}`} title={`Created by ${event.requesterName || "creator"}`}><EventIcon name="user" /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="events-empty"><EventIcon name="calendar" /><span>No event requests match this view.</span></div>
        )}
      </section>

      <EventsDetailsModal
        event={activeEvent}
        busy={busy}
        canRequestActions={canRequestActions}
        onClose={() => setActiveEvent(null)}
        onDownload={() => { if (activeEvent?.id) window.location.href = `/api/events/${encodeURIComponent(activeEvent.id)}/pdf`; }}
        onWorkflow={(targetStatus) => requestAuthorization("workflow", targetStatus)}
        onRequestAction={(action) => requestAuthorization("request_action", action)}
      />
      <AuthorizationModal authorization={authorization} busy={busy} error={authorizationError} onClose={() => { setAuthorization(null); setAuthorizationError(""); }} onPassword={(password) => setAuthorization((current) => ({ ...current, password }))} onSubmit={authorize} />
      <ConfirmationModal confirmation={confirmation} busy={busy} onClose={() => setConfirmation(null)} onConfirm={confirmAction} />
      <ProfileModal profileState={profileState} onClose={() => setProfileState(null)} />
    </section>
  );
}
