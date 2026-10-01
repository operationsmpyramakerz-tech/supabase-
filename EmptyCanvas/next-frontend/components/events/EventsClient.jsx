"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { navigateWithinApp } from "../../lib/client-navigation";
import EventIcon from "./EventIcon";


const loadEventsDialogs = () => import("./EventsDialogs");
const EventsDetailsModal = dynamic(() => loadEventsDialogs().then((module) => module.EventsDetailsModal), { ssr: false });
const AuthorizationModal = dynamic(() => loadEventsDialogs().then((module) => module.AuthorizationModal), { ssr: false });
const ConfirmationModal = dynamic(() => loadEventsDialogs().then((module) => module.ConfirmationModal), { ssr: false });
const ProfileModal = dynamic(() => loadEventsDialogs().then((module) => module.ProfileModal), { ssr: false });

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

function normalizeStatus(value) {
  const status = lower(value).replace(/[\s-]+/g, "_");
  if (status === "under_review" || status === "approved") return "submitted";
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? status : "submitted";
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

export default function EventsClient({ account, initialEvents = [] }) {
  const permissions = useMemo(() => allowedSet(account), [account]);
  const canRequestActions = permissions.has("event requests");

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

  const openDetails = async (event) => {
    void loadEventsDialogs();
    setActiveEvent(event);
    try {
      const body = await requestJson(`/next/api/events/${encodeURIComponent(event.id)}?_ts=${Date.now()}`);
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
    void loadEventsDialogs();
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
      const verified = await requestJson("/next/api/events/admin/verify", {
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
        try { window.sessionStorage.setItem(`erp.events.editAuth.${editId}`, text(verified?.authorizationToken)); } catch {}
        setAuthorization(null);
        navigateWithinApp(`/next/events/new?edit=${encodeURIComponent(editId)}`);
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
        authorizationToken: text(verified?.authorizationToken),
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
      const body = await requestJson("/next/api/events/mutations-direct", {
        method: "POST",
        body: JSON.stringify(isCancel ? {
          action: "request-action",
          eventId: confirmation.eventId,
          requestAction: "cancel",
          authorizationToken: confirmation.authorizationToken,
        } : {
          action: "workflow-transition",
          eventId: confirmation.eventId,
          targetStatus: confirmation.value,
          authorizationToken: confirmation.authorizationToken,
        }),
      });
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
    void loadEventsDialogs();
    const key = text(event.createdByUserId || event.requesterName);
    const name = text(event.requesterName) || "Creator";
    setProfileState({ loading: true, name, profile: null, error: "" });
    try {
      const { loadTeamMemberPublicProfile } = await import("../../lib/team-member-public-client");
      const body = await loadTeamMemberPublicProfile(key || name);
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

      {activeEvent ? (
        <EventsDetailsModal
          event={activeEvent}
          busy={busy}
          canRequestActions={canRequestActions}
          onClose={() => setActiveEvent(null)}
          onDownload={() => { if (activeEvent?.id) window.location.href = `/next/api/events/pdf-direct?id=${encodeURIComponent(activeEvent.id)}`; }}
          onWorkflow={(targetStatus) => requestAuthorization("workflow", targetStatus)}
          onRequestAction={(action) => requestAuthorization("request_action", action)}
        />
      ) : null}
      {authorization ? <AuthorizationModal authorization={authorization} busy={busy} error={authorizationError} onClose={() => { setAuthorization(null); setAuthorizationError(""); }} onPassword={(password) => setAuthorization((current) => ({ ...current, password }))} onSubmit={authorize} /> : null}
      {confirmation ? <ConfirmationModal confirmation={confirmation} busy={busy} onClose={() => setConfirmation(null)} onConfirm={confirmAction} /> : null}
      {profileState ? <ProfileModal profileState={profileState} onClose={() => setProfileState(null)} /> : null}
    </section>
  );
}
