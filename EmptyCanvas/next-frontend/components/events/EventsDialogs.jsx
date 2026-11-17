"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import EventIcon from "./EventIcon";
import { eventConfirmation, eventConfirmationLabel } from "../../lib/event-confirmation.mjs";

const STATUS_LABELS = {
  submitted: "Pending Confirmation",
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

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={`events-detail-item next-events-detail-item${wide ? " wide" : ""}`}>
      <small>{label}</small>
      <strong>{text(value) || "—"}</strong>
    </div>
  );
}

function ItemList({ items, component = false, empty, showCost = true }) {
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
            <small>{quantity || 0} required{notes ? ` · ${notes}` : ""}{showCost ? ` · ${formatMoney(total)}` : ""}</small>
          </li>
        );
      })}
    </ul>
  );
}

const DETAIL_TABS = [
  { id: "overview", label: "Overview", icon: "clipboard" },
  { id: "projects", label: "Projects", icon: "box" },
  { id: "logistics", label: "Logistics & Venue", icon: "tool" },
  { id: "marketing", label: "Marketing", icon: "image" },
];

function DetailPanel({ title, icon, children, wide = false }) {
  return <section className={`event-detail-panel${wide ? " event-detail-panel--wide" : ""}`}>
    <h3><span className="event-detail-panel-icon"><EventIcon name={icon} /></span>{title}</h3>
    <div className="event-detail-panel-body">{children}</div>
  </section>;
}

function SummaryItem({ icon, label, value }) {
  return <div className="event-detail-summary-item"><span className="event-detail-summary-icon"><EventIcon name={icon} /></span><div><strong>{text(value) || "—"}</strong><small>{label}</small></div></div>;
}

function DetailField({ label, value, icon, wide = false, highlight = false }) {
  if (!icon) return <div className="event-detail-field"><small>{label}</small><strong>{text(value) || "—"}</strong></div>;
  return <div className={`event-detail-field event-detail-field--icon${wide ? " event-detail-field--wide" : ""}${highlight ? " event-detail-field--highlight" : ""}`}>
    <span className="event-detail-field-icon"><EventIcon name={icon} /></span>
    <div className="event-detail-field-text"><small>{label}</small><strong>{text(value) || "—"}</strong></div>
  </div>;
}

// Calendar and request pages share the presentation, but keep their own authorization flows.
export function EventsDetailsModal(props) {
  if (!props.event) return null;
  return <EventDetailsContent key={props.event.id} {...props} />;
}

function EventDetailsContent({ event, busy, onClose, onDownload, onWorkflow, onRequestAction,
  canRequestActions, canEdit = canRequestActions, canCancel = canRequestActions,
  canWorkflow = canRequestActions, canExport = true, calendarMode = false,
  canOpenRequests = true, onConfirmEvent }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [viewportStyle, setViewportStyle] = useState(null);
  useEffect(() => {
    if (!calendarMode) return;
    const viewport = window.visualViewport;
    function resize() {
      setViewportStyle({ "--event-sheet-top": `${viewport?.offsetTop || 0}px`, "--event-sheet-height": `${viewport?.height || window.innerHeight}px` });
    }
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => { window.removeEventListener("resize", resize); viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); };
  }, [calendarMode]);
  const full = !calendarMode || canOpenRequests;
  const tab = full ? activeTab : "overview";
  const mapUrl = full ? safeUrl(event.locationUrl) : "";
  const utilities = [event.requiresPower && "Power points", event.requiresInternet && "Internet", event.requiresSoundSystem && "Sound system"].filter(Boolean).join(" · ") || "No special utilities selected";
  const status = normalizeStatus(event.status);
  const confirmation = eventConfirmation(event.status);
  const workflow = confirmation === "pending"
    ? { targetStatus: "in_progress", label: "Confirm Event" }
    : !calendarMode && status === "in_progress"
      ? { targetStatus: "completed", label: "Mark as completed" }
      : null;
  const showWorkflow = full && canWorkflow && workflow && (!calendarMode || !event.isArchived);
  const canConfirmStatus = calendarMode && Boolean(showWorkflow);
  const canCancelStatus = calendarMode && full && canCancel && !event.isArchived && confirmation !== "cancelled";
  const projects = Array.isArray(event.projects) ? event.projects : [];
  const marketing = Array.isArray(event.marketingMaterials) ? event.marketingMaterials : [];
  const requirements = Array.isArray(event.venueRequirements) ? event.venueRequirements : [];

  function venuePanel() {
    return <DetailPanel title="Venue & Setup" icon="map-pin">
      <div className="event-detail-fields">
        {full && <DetailField label="Venue" icon={calendarMode ? "building" : undefined} value={event.venueName} />}
        <DetailField label="Governorate" icon={calendarMode ? "map-pin" : undefined} value={event.governorate} />
        {full && <><DetailField label="Venue type" icon={calendarMode ? "layers" : undefined} value={event.venueType} /><DetailField label="Setup time" icon={calendarMode ? "calendar" : undefined} value={formatDateTime(event.venueSetupTime)} /><DetailField label="Utilities" icon={calendarMode ? "zap" : undefined} wide={calendarMode} highlight={calendarMode} value={utilities} /></>}
      </div>
      {mapUrl && <a className="event-detail-map" href={mapUrl} target="_blank" rel="noreferrer">Open map location <EventIcon name="external-link" /></a>}
    </DetailPanel>;
  }

  const statusLabel = eventConfirmationLabel(event.status);
  const statusIcon = confirmation === "confirmed" ? "check" : confirmation === "cancelled" ? "x" : "clock";
  const content = (
    <div style={calendarMode ? viewportStyle : undefined} className={`events-modal-overlay next-modal-layer event-detail-overlay${calendarMode ? " event-detail-overlay--sheet" : ""}`}  role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`events-modal next-modal event-detail-v2${calendarMode ? " event-detail-v2--sheet" : ""}`} role="dialog" aria-modal="true" aria-label="Event details">
        {calendarMode && <span className="event-detail-floating-icon" aria-hidden="true"><EventIcon name="calendar" /></span>}
        <div className="event-detail-body">
        {calendarMode && <h2 className="event-detail-sheet-title">Event Details</h2>}
        <header className="event-detail-header">
          <div className="event-detail-hero">
            {!calendarMode && <span className="event-detail-hero-icon"><EventIcon name="calendar" /></span>}
            <div className="event-detail-hero-text"><small>{event.eventCode || "Event request"}</small><h2>{event.eventName || "Untitled Event"}</h2><p><EventIcon name="calendar" />{formatDateRange(event)}</p></div>
            {calendarMode && <div className="event-detail-hero-status"><span className={`event-detail-status event-detail-status--${confirmation}`}><span className="event-detail-status-glyph"><EventIcon name={statusIcon} /></span><span>{statusLabel}</span></span></div>}
          </div>
          {!calendarMode && <div className="event-detail-header-side">
            <div className="event-detail-status-row"><span className={`event-detail-status event-detail-status--${confirmation}`}><EventIcon name={confirmation === "confirmed" ? "check-circle" : confirmation === "cancelled" ? "x-circle" : "clock"} />{eventConfirmationLabel(event.status)}</span>{!calendarMode && <button type="button" className="event-detail-close" aria-label="Close" onClick={onClose}>×</button>}</div>
            {!calendarMode && <div className="event-detail-actions">
              {canEdit && <button type="button" disabled={busy} onClick={() => onRequestAction("edit")}><EventIcon name="edit-3" />Edit</button>}
              {showWorkflow && <button type="button" className="event-detail-primary" disabled={busy} onClick={() => onWorkflow(workflow.targetStatus)}><EventIcon name="check" />{workflow.label}</button>}
              {full && canExport && <button type="button" onClick={onDownload}><EventIcon name="download" />PDF</button>}
              {canCancel && status !== "cancelled" && <button type="button" className="event-detail-danger" disabled={busy} onClick={() => onRequestAction("cancel")}>Cancel request</button>}
            </div>}
          </div>}
        </header>

        <div className="event-detail-summary">
          <SummaryItem icon="layers" label="Event Type" value={typeLabel(event)} />
          <SummaryItem icon={calendarMode ? "calendar" : "clipboard"} label="Organization" value={event.organizationName} />
          {full && <><SummaryItem icon="user" label="Expected Attendees" value={event.expectedAttendees ?? "—"} /><SummaryItem icon="box" label="Projects" value={event.summaryFormat ? "—" : projects.length} /></>}
        </div>

        {full && <nav className="event-detail-tabs" aria-label="Event detail sections">
          {DETAIL_TABS.map(item => <button key={item.id} type="button" className={tab === item.id ? "is-active" : ""} aria-pressed={tab === item.id} onClick={() => setActiveTab(item.id)}><EventIcon name={calendarMode && item.id === "overview" ? "calendar" : item.icon} /><span>{calendarMode && item.id === "marketing" ? "Media" : item.label}{item.id === "projects" && !event.summaryFormat ? ` (${projects.length})` : ""}</span></button>)}
        </nav>}

        <div className="event-detail-scroll" key={tab}>
          {tab === "overview" && <div className="event-detail-layout">
            {full && <DetailPanel title="Contact Information" icon="user"><div className="event-detail-fields">
              <DetailField label="Contact person" icon={calendarMode ? "user" : undefined} value={event.contactPerson} /><DetailField label="Phone" icon={calendarMode ? "phone" : undefined} value={event.contactPhone} /><DetailField label="Email" icon={calendarMode ? "mail" : undefined} value={event.contactEmail} /><DetailField label="Requested by" icon={calendarMode ? "user" : undefined} value={event.requesterName} /><DetailField label="Created" icon={calendarMode ? "calendar" : undefined} wide={calendarMode} value={formatDateTime(event.createdAt)} />
            </div></DetailPanel>}
            {venuePanel()}
            {full && <><DetailPanel title="Target Audience" icon="user"><p className="event-detail-note">{text(event.audience) || "—"}</p></DetailPanel><DetailPanel title="Operations Notes" icon="file-text"><p className="event-detail-note">{text(event.operationsNotes) || "—"}</p></DetailPanel></>}
          </div>}
          {full && tab === "projects" && <div className="event-detail-layout"><DetailPanel title={`Projects (${projects.length})`} icon="box" wide><ItemList items={projects} showCost={!calendarMode} empty="No projects were added." /></DetailPanel></div>}
          {full && tab === "logistics" && <div className="event-detail-layout">
            {venuePanel()}
            <DetailPanel title="Venue Requirements" icon="tool"><ItemList items={requirements} component showCost={!calendarMode} empty="No venue requirements were added." /></DetailPanel>
            <DetailPanel title="Venue Notes" icon="file-text" wide><p className="event-detail-note">{text(event.venueNotes) || "—"}</p></DetailPanel>
            {!calendarMode && <DetailPanel title="Cost Summary" icon="clipboard" wide><div className="event-detail-costs"><DetailField label="Working cost" value={formatMoney(event.workingCost)} /><DetailField label="Transport cost" value={formatMoney(event.transportCost)} /><DetailField label="Total cost" value={formatMoney(event.totalCost)} /></div></DetailPanel>}
          </div>}
          {full && tab === "marketing" && <div className="event-detail-layout"><DetailPanel title={`Marketing Materials (${marketing.length})`} icon="image" wide><ItemList items={marketing} component showCost={!calendarMode} empty="No marketing materials were added." /></DetailPanel></div>}
        </div>
        </div>
        {calendarMode && <footer className="event-detail-sheet-footer">
          {statusOpen && <div className="event-detail-status-options" role="group" aria-label="Update event status">
            <div className="event-detail-status-current"><span>Current status</span><strong>{eventConfirmationLabel(event.status)}</strong></div>
            {canConfirmStatus && <button type="button" className="event-detail-status-choice is-confirm" disabled={busy} onClick={() => { setStatusOpen(false); onConfirmEvent(); }}><EventIcon name="check-circle"/>Confirmed</button>}
            {canCancelStatus && <button type="button" className="event-detail-status-choice is-cancel" disabled={busy} onClick={() => { setStatusOpen(false); onRequestAction("cancel"); }}><EventIcon name="x-circle"/>Cancelled</button>}
          </div>}
          <div className="event-detail-sheet-buttons">
            {(canConfirmStatus || canCancelStatus) && <button type="button" className="event-detail-sheet-update" disabled={busy} aria-expanded={statusOpen} onClick={() => setStatusOpen(value => !value)}><EventIcon name="refresh-cw"/>Update</button>}
            <button type="button" className="event-detail-sheet-close" disabled={busy} onClick={onClose}>Close</button>
          </div>
        </footer>}
      </section>
    </div>
  );
  return calendarMode && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

export function AuthorizationModal({ authorization, busy, error, onClose, onPassword, onSubmit }) {
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

export function ConfirmationModal({ confirmation, busy, onClose, onConfirm }) {
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

export function ProfileModal({ profileState, onClose }) {
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
