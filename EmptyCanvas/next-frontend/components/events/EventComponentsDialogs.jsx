"use client";

import { useEffect, useRef, useState } from "react";
import EventIcon from "./EventIcon";
import { DeleteConfirmDialog } from "../shared/SystemDeleteDialogs";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, number(value)));
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function fileExtension(name) {
  const match = text(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

function attachmentLabel(file = {}) {
  const ext = fileExtension(file?.name);
  if (ext) return ext.toUpperCase();
  const mime = text(file?.mime || file?.type);
  return mime ? mime.split("/").pop().toUpperCase() : "FILE";
}

function normalizeAttachment(value) {
  const url = safeUrl(value?.url || value?.fileUrl || value?.file_url);
  if (!url) return null;
  return {
    url,
    name: text(value?.name || value?.fileName || value?.file_name) || "Attachment",
    mime: text(value?.mime || value?.type),
    size: Math.max(0, number(value?.size)),
  };
}

function ModernDropdown({ value, options = [], onChange, disabled = false, ariaLabel = "Choose option" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const normalized = Array.isArray(options) ? options : [];
  const selected = normalized.find((option) => String(option?.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`next-event-modern-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="next-event-modern-select__trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span>{selected?.label || "Select"}</span>
        <span className="next-event-modern-select__chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="next-event-modern-select__menu" role="listbox" aria-label={ariaLabel}>
          {normalized.map((option) => {
            const optionValue = String(option?.value ?? "");
            const active = optionValue === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`next-event-modern-select__option${active ? " is-selected" : ""}${option?.special ? " is-special" : ""}`}
                key={optionValue}
                onClick={() => { onChange(optionValue); setOpen(false); }}
              >
                <span>{option?.label || optionValue}</span>
                {active ? <EventIcon name="check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ComponentFormModal({ mode, form, categories, busy, error, onChange, onAssets, onRemovePhoto, onRemoveAttachment, onClose, onSubmit }) {
  if (!mode) return null;
  const external = form.ownershipType === "external_rental";
  const unitCost = Math.max(0, number(form.operatingCost)) + (external ? Math.max(0, number(form.rentalCost)) : 0);
  const isNewCategory = form.category === "__new__";
  const existingPhotos = Array.isArray(form.existingPhotoUrls) ? form.existingPhotoUrls.filter(Boolean) : [];
  const photos = existingPhotos.map((src, index) => ({ src, kind: "existing", index }));
  const attachments = (Array.isArray(form.existingAttachments) ? form.existingAttachments : []).map(normalizeAttachment).filter(Boolean);
  const assetCount = photos.length + attachments.length;

  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="events-modal events-modal--form next-modal next-event-component-form" onSubmit={onSubmit}>
        <header className="events-modal__header next-events-modal-head next-event-component-form-head">
          <div className="next-event-component-form-title">
            <span className="next-event-component-form-icon"><EventIcon name="box" /></span>
            <h2>{mode === "create" ? "Add Event Component" : "Edit Event Component"}</h2>
          </div>
          <button type="button" className="events-modal__close next-modal-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>

        <div className="next-event-component-form-grid">
          <label className="next-field wide">
            <span>Component name *</span>
            <input value={form.name} maxLength={180} onChange={(event) => onChange("name", event.target.value)} placeholder="Example: 3m × 1m branded backdrop" required autoFocus />
          </label>

          <div className="events-field next-field">
            <span>Category *</span>
            <ModernDropdown
              value={form.category}
              onChange={(value) => onChange("category", value)}
              ariaLabel="Event component category"
              options={[...categories.map((item) => ({ value: item.code, label: item.label })), { value: "__new__", label: "+ Add a new category", special: true }]}
            />
          </div>

          <label className="events-field next-field">
            <span>Default quantity</span>
            <input type="number" min="0" step="0.01" value={form.defaultQuantity} onChange={(event) => onChange("defaultQuantity", event.target.value)} />
          </label>

          {isNewCategory ? (
            <label className="next-field wide next-event-component-new-category">
              <span>New category name *</span>
              <input value={form.customCategory} maxLength={80} onChange={(event) => onChange("customCategory", event.target.value)} placeholder="Example: Safety Equipment" required />
            </label>
          ) : null}

          <div className="events-field next-field">
            <span>Source type *</span>
            <ModernDropdown
              value={form.ownershipType}
              onChange={(value) => onChange("ownershipType", value)}
              ariaLabel="Event component source type"
              options={[
                { value: "company_owned", label: "Company Owned" },
                { value: "external_rental", label: "External Rental" },
              ]}
            />
          </div>

          <label className="events-field next-field">
            <span>Operating cost (EGP)</span>
            <input type="number" min="0" step="0.01" value={form.operatingCost} onChange={(event) => onChange("operatingCost", event.target.value)} />
          </label>

          {external ? (
            <label className="events-field next-field">
              <span>Rental cost (EGP)</span>
              <input type="number" min="0" step="0.01" value={form.rentalCost} onChange={(event) => onChange("rentalCost", event.target.value)} />
            </label>
          ) : null}

          <div className="next-event-component-cost-preview">
            <small>Estimated cost / unit</small>
            <strong>{money(unitCost)}</strong>
            <span>{external ? `${money(form.rentalCost)} rental + ${money(form.operatingCost)} operating` : `${money(form.operatingCost)} operating`}</span>
          </div>

          <label className="next-field wide">
            <span>Supplier or reference link</span>
            <input type="url" value={form.linkUrl} maxLength={1000} onChange={(event) => onChange("linkUrl", event.target.value)} placeholder="https://..." />
          </label>

          <label className="next-field wide">
            <span>Description</span>
            <textarea rows="4" maxLength={2000} value={form.description} onChange={(event) => onChange("description", event.target.value)} placeholder="Brief description or preparation notes" />
          </label>

          <div className="next-event-component-photo-field next-event-component-photo-field--modern wide">
            <div className="next-event-component-photo-heading">
              <span>Photos & files</span>
              {assetCount ? <b>{photos.length} photo{photos.length === 1 ? "" : "s"} · {attachments.length} file{attachments.length === 1 ? "" : "s"}</b> : null}
            </div>
            <label className="next-event-component-photo-dropzone">
              <span className="next-event-component-photo-dropzone__icon"><EventIcon name="paperclip" /></span>
              <strong>{assetCount ? "Add more photos or files" : "Choose photos or files"}</strong>
              <span className="next-event-component-photo-dropzone__action">Browse</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                multiple
                onChange={onAssets}
                hidden
              />
            </label>
            {assetCount ? (
              <div className="next-event-component-photo-grid">
                {photos.map((photo, photoIndex) => (
                  <figure className="next-event-component-photo-thumb" key={`${photo.kind}-${photo.index}-${photo.src.slice(0, 24)}`}>
                    <img src={photo.src} alt={`Component photo ${photoIndex + 1}`} />
                    {photoIndex === 0 ? <span className="next-event-component-photo-primary">Card photo</span> : null}
                    <button type="button" onClick={() => onRemovePhoto(photo.kind, photo.index)} aria-label={`Remove photo ${photoIndex + 1}`}>×</button>
                  </figure>
                ))}
                {attachments.map((file, fileIndex) => (
                  <figure className="next-event-component-file-thumb" key={`${file.url}-${fileIndex}`}>
                    <span className="next-event-component-file-thumb__icon"><EventIcon name="file-text" /></span>
                    <figcaption>
                      <strong title={file.name}>{file.name}</strong>
                      <small>{attachmentLabel(file)}</small>
                    </figcaption>
                    <button type="button" onClick={() => onRemoveAttachment(fileIndex)} aria-label={`Remove ${file.name}`}>×</button>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>

          <label className="next-event-component-checkbox wide">
            <input type="checkbox" checked={!!form.isActive} onChange={(event) => onChange("isActive", event.target.checked)} />
            <span>Available for new event requests</span>
          </label>
        </div>

        {error ? <div className="events-form-error next-events-form-error">{error}</div> : null}

        <footer className="events-modal__actions next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="events-secondary-btn secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="events-primary-btn primary-button" disabled={busy}>{busy ? "Working..." : mode === "create" ? "Save Component" : "Save Changes"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function AuthorizationModal({ authorization, busy, error, password, onPassword, onClose, onSubmit }) {
  if (!authorization) return null;
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="events-modal events-modal--authorization next-modal next-events-auth-modal" onSubmit={onSubmit}>
        <header className="events-modal__header next-events-modal-head">
          <div>
            <span className="next-events-kicker">Admin authorization</span>
            <h2>Authorization required</h2>
            <p>Enter the shared Admin password to {authorization.intent === "create" ? "add a component" : "edit this component"}.</p>
          </div>
          <button type="button" className="events-modal__close next-modal-close" onClick={onClose} disabled={busy}>×</button>
        </header>
        <label className="events-field next-field">
          <span>Admin password *</span>
          <input type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="current-password" required autoFocus />
        </label>
        {error ? <div className="events-form-error next-events-form-error">{error}</div> : null}
        <footer className="events-modal__actions next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="events-secondary-btn secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="events-primary-btn primary-button" disabled={busy}>{busy ? "Authorizing..." : "Authorize & Continue"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function DeleteModal({ component, busy, error, onClose, onConfirm }) {
  if (!component) return null;
  return <DeleteConfirmDialog
    title={`Delete “${component.name || "this component"}”?`}
    message="Existing event requests keep their saved snapshot, but this catalogue record will be permanently deleted and cannot be restored."
    busy={busy}
    error={error}
    onCancel={onClose}
    onConfirm={onConfirm}
  />;
}

export function PhotoGalleryModal({ component, onClose }) {
  if (!component) return null;
  const photos = (Array.isArray(component?.photoUrls) ? component.photoUrls : [component?.photoUrl])
    .map(safeUrl)
    .filter(Boolean);
  const attachments = (Array.isArray(component?.attachments) ? component.attachments : []).map(normalizeAttachment).filter(Boolean);
  if (!photos.length && !attachments.length) return null;
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="events-modal next-modal next-event-component-gallery" role="dialog" aria-modal="true" aria-label={`${component?.name || "Event component"} photos`}>
        <header className="events-modal__header next-events-modal-head next-event-component-gallery__head">
          <div>
            <h2>{component?.name || "Event Component"}</h2>
            <span>{photos.length} photo{photos.length === 1 ? "" : "s"} · {attachments.length} file{attachments.length === 1 ? "" : "s"}</span>
          </div>
          <button type="button" className="events-modal__close next-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-event-component-gallery__grid">
          {photos.map((src, index) => (
            <a href={src} target="_blank" rel="noreferrer" className="next-event-component-gallery__item" key={`${src}-${index}`}>
              <img src={src} alt={`${component?.name || "Event component"} photo ${index + 1}`} />
            </a>
          ))}
          {attachments.map((file, index) => (
            <a href={file.url} target="_blank" rel="noreferrer" className="next-event-component-gallery__file" key={`${file.url}-${index}`}>
              <span className="next-event-component-gallery__file-icon"><EventIcon name="file-text" /></span>
              <span className="next-event-component-gallery__file-copy">
                <strong>{file.name}</strong>
                <small>{attachmentLabel(file)}</small>
              </span>
              <EventIcon name="download" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
