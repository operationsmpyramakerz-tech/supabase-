"use client";

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

function StatusPill({ status }) {
  const key = normalizeStatus(status);
  return <span className={`events-status events-status--${key} next-events-status next-events-status--${key}`}>{STATUS_LABELS[key]}</span>;
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

export function EventsDetailsModal({ event, busy, onClose, onDownload, onWorkflow, onRequestAction, canRequestActions }) {
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
