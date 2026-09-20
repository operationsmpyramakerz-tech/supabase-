"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventIcon from "./EventIcon";

const STANDARD_CATEGORIES = [
  { code: "project", label: "Project Resource" },
  { code: "marketing_material", label: "Marketing Material" },
  { code: "venue_equipment", label: "Venue Equipment" },
];


const FILTER_CATEGORIES = Object.freeze([
  { code: "all", label: "All", icon: "layers" },
  { code: "project", label: "Project Resource", icon: "cpu" },
  { code: "marketing_material", label: "Marketing Material", icon: "image" },
  { code: "venue_equipment", label: "Venue Equipment", icon: "tool" },
  { code: "other", label: "Other", icon: "more-horizontal" },
]);

const OWNERSHIP_LABELS = {
  company_owned: "Company Owned",
  external_rental: "External Rental",
};

const CATEGORY_THEME_MAP = Object.freeze({
  project: { accent: "#2563eb", accent2: "#0ea5e9", soft: "#eff6ff", surface: "#f8fbff", border: "rgba(37,99,235,.24)", text: "#1d4ed8" },
  marketing_material: { accent: "#ea580c", accent2: "#f59e0b", soft: "#fff7ed", surface: "#fffbf5", border: "rgba(234,88,12,.24)", text: "#c2410c" },
  venue_equipment: { accent: "#059669", accent2: "#14b8a6", soft: "#ecfdf5", surface: "#f5fffb", border: "rgba(5,150,105,.24)", text: "#047857" },
  other: { accent: "#64748b", accent2: "#475569", soft: "#f1f5f9", surface: "#f8fafc", border: "rgba(100,116,139,.24)", text: "#475569" },
});

const CUSTOM_CATEGORY_THEMES = Object.freeze([
  { accent: "#db2777", accent2: "#f43f5e", soft: "#fdf2f8", surface: "#fff8fb", border: "rgba(219,39,119,.24)", text: "#be185d" },
  { accent: "#7c3aed", accent2: "#8b5cf6", soft: "#f5f3ff", surface: "#fbfaff", border: "rgba(124,58,237,.24)", text: "#6d28d9" },
  { accent: "#0891b2", accent2: "#06b6d4", soft: "#ecfeff", surface: "#f6feff", border: "rgba(8,145,178,.24)", text: "#0e7490" },
  { accent: "#ca8a04", accent2: "#eab308", soft: "#fefce8", surface: "#fffef7", border: "rgba(202,138,4,.24)", text: "#a16207" },
  { accent: "#4f46e5", accent2: "#6366f1", soft: "#eef2ff", surface: "#f8f9ff", border: "rgba(79,70,229,.24)", text: "#4338ca" },
  { accent: "#0f766e", accent2: "#14b8a6", soft: "#f0fdfa", surface: "#f7fffd", border: "rgba(15,118,110,.24)", text: "#0f766e" },
]);

function categoryTheme(categoryCode) {
  const code = text(categoryCode) || "other";
  const preset = CATEGORY_THEME_MAP[code];
  let theme = preset;
  if (!theme) {
    let hash = 0;
    for (let index = 0; index < code.length; index += 1) hash = ((hash * 31) + code.charCodeAt(index)) >>> 0;
    theme = CUSTOM_CATEGORY_THEMES[hash % CUSTOM_CATEGORY_THEMES.length];
  }
  return {
    "--event-cat-accent": theme.accent,
    "--event-cat-accent-2": theme.accent2,
    "--event-cat-soft": theme.soft,
    "--event-cat-surface": theme.surface,
    "--event-cat-border": theme.border,
    "--event-cat-text": theme.text,
  };
}

const EMPTY_FORM = {
  id: "",
  name: "",
  category: "project",
  customCategory: "",
  defaultQuantity: "1",
  ownershipType: "company_owned",
  operatingCost: "0",
  rentalCost: "0",
  linkUrl: "",
  description: "",
  isActive: true,
  existingPhotoUrls: [],
  existingAttachments: [],
};

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function token(value) {
  return lower(value).replace(/[^a-z0-9/]+/g, "");
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

function normalizeCategories(value) {
  const source = Array.isArray(value) ? value : [];
  const merged = [...STANDARD_CATEGORIES];
  const seen = new Set(merged.map((item) => item.code));
  for (const item of source) {
    const code = text(item?.code);
    const label = text(item?.label);
    if (!code || !label || seen.has(code)) continue;
    seen.add(code);
    merged.push({ code, label, isCustom: !!item?.isCustom || /^custom_/i.test(code) });
  }
  return merged;
}

function pageAccessLevel(account) {
  const builtInAdmin = token(account?.name) === "admin" || token(account?.position).includes("admin");
  if (builtInAdmin) return "admin";

  const wanted = new Set(["eventcomponents", "/events/components", "event-components"]);
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
  if (best) return best;

  const allowed = (Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(token);
  return allowed.some((value) => wanted.has(value)) ? "edit" : "view";
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

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(blob);
  });
}

const EVENT_ATTACHMENT_EXTENSIONS = new Set([
  "pdf", "zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
]);

function fileExtension(name) {
  const match = text(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

function isSupportedAttachment(file) {
  if (String(file?.type || "").toLowerCase().startsWith("image/")) return true;
  return EVENT_ATTACHMENT_EXTENSIONS.has(fileExtension(file?.name));
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

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the selected image."));
    };
    image.src = url;
  });
}

async function compressImage(file) {
  const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowed.has(String(file?.type || "").toLowerCase())) {
    throw new Error("Choose a PNG, JPG, WEBP, or GIF image.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("The original image must be 8 MB or less.");

  if (String(file.type).toLowerCase() === "image/gif") {
    if (file.size > 2.6 * 1024 * 1024) throw new Error("Animated GIF files must be 2.6 MB or less for Vercel upload limits.");
    return { dataUrl: await readBlobAsDataUrl(file), fileName: file.name || "component.gif" };
  }

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const maxSide = 1500;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let blob = null;
  for (const quality of [0.84, 0.74, 0.64, 0.54]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= 2.6 * 1024 * 1024) break;
  }
  if (!blob) throw new Error("Could not prepare the selected image.");
  if (blob.size > 2.9 * 1024 * 1024) throw new Error("The compressed image is still too large. Choose a smaller image.");

  const baseName = text(file.name).replace(/\.[^.]+$/, "") || "event-component";
  return { dataUrl: await readBlobAsDataUrl(blob), fileName: `${baseName}.webp` };
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

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "Event Components"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function ComponentFormModal({ mode, form, categories, busy, error, onChange, onAssets, onRemovePhoto, onRemoveAttachment, onClose, onSubmit }) {
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

function AuthorizationModal({ authorization, busy, error, password, onPassword, onClose, onSubmit }) {
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

function DeleteModal({ component, busy, error, onClose, onConfirm }) {
  if (!component) return null;
  return (
    <div className="events-modal-overlay next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="events-modal next-modal next-events-confirm-modal" role="dialog" aria-modal="true">
        <header className="events-modal__header next-events-modal-head">
          <div>
            <span className="next-events-kicker">Permanent deletion</span>
            <h2>Delete “{component.name || "this component"}”?</h2>
            <p>Existing event requests keep their saved snapshot, but this catalogue record cannot be restored.</p>
          </div>
          <button type="button" className="events-modal__close next-modal-close" onClick={onClose} disabled={busy}>×</button>
        </header>
        {error ? <div className="events-form-error next-events-form-error">{error}</div> : null}
        <footer className="events-modal__actions next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="events-secondary-btn secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? "Deleting..." : "Delete permanently"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ComponentCard({ component, categoryLabel, canEdit, canDelete, onEdit, onDelete, onOpenPhotos }) {
  const photos = (Array.isArray(component?.photoUrls) ? component.photoUrls : [component?.photoUrl])
    .map(safeUrl)
    .filter(Boolean);
  const attachments = (Array.isArray(component?.attachments) ? component.attachments : []).map(normalizeAttachment).filter(Boolean);
  const photo = photos[0] || "";
  const link = safeUrl(component?.linkUrl);
  const external = component?.ownershipType === "external_rental";
  const operating = Math.max(0, number(component?.operatingCost));
  const rental = external ? Math.max(0, number(component?.rentalCost)) : 0;
  const unit = Math.max(0, number(component?.unitCost || operating + rental));
  const active = component?.isActive !== false;

  return (
    <article className={`events-component-card${active ? "" : " is-inactive"}`} style={categoryTheme(component?.category)}>
      <div className="events-component-card__top">
        <span className="events-component-badge"><EventIcon name="layers" />{categoryLabel}</span>
        <span className={`events-status ${active ? "events-status--approved" : "events-status--cancelled"}`}>{active ? "Active" : "Inactive"}</span>
      </div>

      {photo ? (
        <button type="button" className="events-component-card__photo events-component-card__photo-button" onClick={() => onOpenPhotos(component)} aria-label={`Open ${component?.name || "component"} photos and files`}>
          <img src={photo} alt={`${component?.name || "Event component"} photo`} loading="lazy" />
          {photos.length + attachments.length > 1 ? <span className="events-component-card__photo-count">+{photos.length + attachments.length - 1}</span> : null}
        </button>
      ) : attachments.length ? (
        <button type="button" className="events-component-card__photo events-component-card__photo-button events-component-card__file-only" onClick={() => onOpenPhotos(component)} aria-label={`Open ${component?.name || "component"} files`}>
          <EventIcon name="file-text" />
          <span>{attachments.length} file{attachments.length === 1 ? "" : "s"}</span>
        </button>
      ) : (
        <div className="events-component-card__photo"><EventIcon name="box" /></div>
      )}

      <div className="events-component-card__body">
        <h3 title={component?.name || ""}>{component?.name || "Untitled component"}</h3>
        <p>{text(component?.description) || "No description added yet."}</p>
      </div>

      <div className="events-component-card__meta">
        <div><span>Source type</span><strong>{OWNERSHIP_LABELS[external ? "external_rental" : "company_owned"]}</strong></div>
        <div><span>Default qty.</span><strong>{component?.defaultQuantity ?? 1}</strong></div>
      </div>

      <div className="events-component-card__cost">
        <div><span>Event cost / unit</span><strong>{money(unit)}</strong></div>
        <div className="events-component-card__cost-breakdown">
          {external ? <><span>Rental {money(rental)}</span><span>Operating {money(operating)}</span></> : <span>Operating {money(operating)}</span>}
        </div>
      </div>

      <div className="events-component-card__footer">
        <div>
          {link ? <a className="events-component-card__link" href={link} target="_blank" rel="noreferrer"><EventIcon name="external-link" /><span>Open Link</span></a> : <span className="events-component-card__no-link">No link</span>}
        </div>
        {canEdit ? (
          <div className="events-component-card__actions">
            <button type="button" className="events-action-btn" onClick={() => onEdit(component)}><EventIcon name="edit-3" /><span>Edit</span></button>
            {canDelete ? <button type="button" className="events-action-btn events-action-btn--danger" onClick={() => onDelete(component)} aria-label="Delete component"><EventIcon name="trash-2" /></button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AddNewComponentCard({ onClick }) {
  return (
    <button type="button" className="events-component-add-new" onClick={onClick}>
      <span className="events-component-add-new__copy">
        <strong>Add new</strong>
        <small>Create a new event component</small>
      </span>
      <span className="events-component-add-new__plus"><EventIcon name="plus-circle" /></span>
    </button>
  );
}

function PhotoGalleryModal({ component, onClose }) {
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

export default function EventComponentsClient({ account, initialComponents, initialCategories, initialCreate = false, bootstrapWarnings = [] }) {
  const [components, setComponents] = useState(Array.isArray(initialComponents) ? initialComponents : []);
  const [categories, setCategories] = useState(normalizeCategories(initialCategories));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef(null);
  const [formMode, setFormMode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [authorization, setAuthorization] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState(null);
  const [galleryTarget, setGalleryTarget] = useState(null);
  const initialCreateHandled = useRef(false);

  useEffect(() => {
    const onPointerDown = (event) => {
      const root = statusFilterRef.current;
      if (root && !root.contains(event.target)) setStatusFilterOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setStatusFilterOpen(false); };
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
    input.placeholder = "Search event components...";
    const handle = (event) => setQuery(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  const accessLevel = useMemo(() => pageAccessLevel(account), [account]);
  const canEdit = ["edit", "admin"].includes(accessLevel);
  const canDelete = accessLevel === "admin";

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.code, item.label])), [categories]);

  const filtered = useMemo(() => {
    const q = lower(query);
    return components.filter((component) => {
      const active = component?.isActive !== false;
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;

      const componentCategory = text(component?.category) || "other";
      if (category === "other") {
        if (!(componentCategory === "other" || /^custom_/i.test(componentCategory))) return false;
      } else if (category !== "all" && componentCategory !== category) {
        return false;
      }

      if (!q) return true;
      return [component?.name, component?.description, component?.linkUrl, categoryMap.get(componentCategory), OWNERSHIP_LABELS[component?.ownershipType]]
        .map(lower)
        .join(" ")
        .includes(q);
    });
  }, [components, query, category, status, categoryMap]);

  const statusOptions = useMemo(() => [
    { key: "all", label: "All statuses", icon: "layers", count: components.length },
    { key: "active", label: "Active", icon: "check-circle", count: components.filter((item) => item?.isActive !== false).length },
    { key: "inactive", label: "Inactive", icon: "x-circle", count: components.filter((item) => item?.isActive === false).length },
  ], [components]);

  function patchForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
  }

  function componentToForm(component) {
    return {
      ...EMPTY_FORM,
      id: text(component?.id),
      name: text(component?.name),
      category: text(component?.category) || "project",
      defaultQuantity: String(component?.defaultQuantity ?? 1),
      ownershipType: component?.ownershipType === "external_rental" ? "external_rental" : "company_owned",
      operatingCost: String(number(component?.operatingCost)),
      rentalCost: String(number(component?.rentalCost)),
      linkUrl: text(component?.linkUrl),
      description: text(component?.description),
      isActive: component?.isActive !== false,
      existingPhotoUrls: (Array.isArray(component?.photoUrls) ? component.photoUrls : [component?.photoUrl]).map(safeUrl).filter(Boolean),
      existingAttachments: (Array.isArray(component?.attachments) ? component.attachments : []).map(normalizeAttachment).filter(Boolean),
    };
  }

  function openAuthorizedForm(intent, component = null) {
    setForm(component ? componentToForm(component) : { ...EMPTY_FORM });
    setFormMode(intent);
    setFormError("");
  }

  function requestForm(intent, component = null) {
    if (!canEdit) {
      setToast({ type: "info", title: "View-only access", message: "Your Event Components permission does not allow catalogue changes." });
      return;
    }
    if (accessLevel === "admin") {
      openAuthorizedForm(intent, component);
      return;
    }
    setAuthorization({ intent, component });
    setAdminPassword("");
    setAuthError("");
  }

  async function submitAuthorization(event) {
    event.preventDefault();
    if (!authorization || authBusy) return;
    const password = text(adminPassword);
    if (!password) {
      setAuthError("Enter the Admin password.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await requestJson("/api/events/admin/verify", {
        method: "POST",
        body: JSON.stringify({
          password,
          intent: authorization.intent,
          componentId: authorization.intent === "edit" ? authorization.component?.id : "",
        }),
      });
      const next = authorization;
      setAuthorization(null);
      setAdminPassword("");
      openAuthorizedForm(next.intent, next.component);
    } catch (error) {
      setAuthError(error?.message || "Invalid Admin password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAssets(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const unsupported = files.find((file) => !isSupportedAttachment(file));
    if (unsupported) {
      setFormError(`Unsupported file type: ${unsupported.name}. Use images, PDF, ZIP/RAR/7Z, Office files, TXT, or CSV.`);
      return;
    }

    const currentPhotos = Array.isArray(form.existingPhotoUrls) ? form.existingPhotoUrls.length : 0;
    const currentFiles = Array.isArray(form.existingAttachments) ? form.existingAttachments.length : 0;
    const incomingPhotos = files.filter((file) => String(file?.type || "").toLowerCase().startsWith("image/")).length;
    const incomingFiles = files.length - incomingPhotos;
    if (currentPhotos + incomingPhotos > 8) {
      setFormError("You can attach up to 8 photos to one component.");
      return;
    }
    if (currentFiles + incomingFiles > 8) {
      setFormError("You can attach up to 8 files to one component.");
      return;
    }

    setFormBusy(true);
    setFormError("");
    try {
      for (const file of files) {
        const isImage = String(file?.type || "").toLowerCase().startsWith("image/");
        if (isImage) {
          const prepared = await compressImage(file);
          const payload = await requestJson("/api/events/components/photo-upload", {
            method: "POST",
            body: JSON.stringify({
              componentId: form.id || "",
              dataUrl: prepared.dataUrl,
              fileName: prepared.fileName,
            }),
          });
          const url = safeUrl(payload?.url || payload?.photoUrl);
          if (!url) throw new Error("The uploaded image did not return a valid URL.");
          setForm((current) => ({
            ...current,
            existingPhotoUrls: [...(Array.isArray(current.existingPhotoUrls) ? current.existingPhotoUrls : []), url],
          }));
          continue;
        }

        if (file.size > 2.6 * 1024 * 1024) {
          throw new Error(`${file.name} is too large. Non-image files must be 2.6 MB or less.`);
        }
        const payload = await requestJson("/api/events/components/file-upload", {
          method: "POST",
          body: JSON.stringify({
            componentId: form.id || "",
            dataUrl: await readBlobAsDataUrl(file),
            fileName: file.name || "attachment",
            size: file.size || 0,
          }),
        });
        const uploaded = normalizeAttachment(payload?.file || {
          url: payload?.url,
          name: file.name,
          mime: file.type,
          size: file.size,
        });
        if (!uploaded) throw new Error("The uploaded file did not return a valid URL.");
        setForm((current) => ({
          ...current,
          existingAttachments: [...(Array.isArray(current.existingAttachments) ? current.existingAttachments : []), uploaded],
        }));
      }
    } catch (error) {
      setFormError(error?.message || "Could not upload the selected files.");
    } finally {
      setFormBusy(false);
    }
  }

  function removeFormPhoto(kind, index) {
    setForm((current) => ({
      ...current,
      existingPhotoUrls: (current.existingPhotoUrls || []).filter((_, itemIndex) => itemIndex !== index),
    }));
    setFormError("");
  }

  function removeFormAttachment(index) {
    setForm((current) => ({
      ...current,
      existingAttachments: (current.existingAttachments || []).filter((_, itemIndex) => itemIndex !== index),
    }));
    setFormError("");
  }

  async function refreshCategories() {
    const payload = await requestJson(`/next/api/events/component-categories?_ts=${Date.now()}`);
    const next = normalizeCategories(payload?.categories);
    setCategories(next);
    return next;
  }


  async function submitForm(event) {
    event.preventDefault();
    if (!formMode || formBusy) return;
    const name = text(form.name);
    if (!name) {
      setFormError("Component name is required.");
      return;
    }
    const newCategory = form.category === "__new__";
    const customCategory = text(form.customCategory);
    if (newCategory && !customCategory) {
      setFormError("Enter the new category name.");
      return;
    }
    const link = text(form.linkUrl);
    if (link && !safeUrl(link)) {
      setFormError("Link must start with http:// or https://.");
      return;
    }

    setFormBusy(true);
    setFormError("");
    try {
      const body = {
        name,
        category: newCategory ? "other" : form.category,
        categoryCustom: newCategory ? customCategory : "",
        defaultQuantity: Math.max(0, number(form.defaultQuantity)),
        ownershipType: form.ownershipType === "external_rental" ? "external_rental" : "company_owned",
        operatingCost: Math.max(0, number(form.operatingCost)),
        rentalCost: form.ownershipType === "external_rental" ? Math.max(0, number(form.rentalCost)) : 0,
        existingPhotoUrls: Array.isArray(form.existingPhotoUrls) ? form.existingPhotoUrls : [],
        existingAttachments: (Array.isArray(form.existingAttachments) ? form.existingAttachments : []).map(normalizeAttachment).filter(Boolean),
        linkUrl: link,
        description: text(form.description),
        isActive: !!form.isActive,
      };

      const editing = formMode === "edit" && form.id;
      const payload = await requestJson(editing ? `/api/events/components/${encodeURIComponent(form.id)}` : "/api/events/components", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const saved = payload?.component;
      if (saved?.id) {
        setComponents((current) => editing
          ? current.map((item) => text(item?.id) === text(saved.id) ? saved : item)
          : [saved, ...current]);
      }
      if (newCategory) await refreshCategories().catch(() => null);
      setFormMode("");
      setForm({ ...EMPTY_FORM });
      setToast({ type: "success", title: "Event Components", message: editing ? "Component updated." : "Component added." });
    } catch (error) {
      setFormError(error?.message || "Could not save the event component.");
    } finally {
      setFormBusy(false);
    }
  }

  useEffect(() => {
    if (!initialCreate || initialCreateHandled.current) return;
    initialCreateHandled.current = true;
    requestForm("create");
  }, [initialCreate]);

  async function deleteComponent() {
    if (!deleteTarget || deleteBusy || !canDelete) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await requestJson(`/api/events/components/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setComponents((current) => current.filter((item) => text(item?.id) !== text(deleteTarget.id)));
      setToast({ type: "success", title: "Event Components", message: "Component deleted." });
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error?.message || "Could not delete the component.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="events-shell">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="events-panel events-components-workspace">
        <div className="events-orders-toolbar events-component-filters-toolbar" aria-label="Event component filters">
          <div className="events-orders-toolbar__scroll">
            <div className="events-orders-tabs" role="tablist" aria-label="Event component categories">
              {FILTER_CATEGORIES.map((item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === item.code}
                  className={`events-order-status-tab${category === item.code ? " is-active" : ""}`}
                  onClick={() => setCategory(item.code)}
                  key={item.code}
                >
                  <span className="order-status-tab__icon"><EventIcon name={item.icon} /></span>
                  <span className="order-status-tab__label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            ref={statusFilterRef}
            className={`orders-type-filter events-type-filter events-component-status-filter${statusFilterOpen ? " is-open" : ""}${status !== "all" ? " is-filtered" : ""}`}
          >
            <button
              type="button"
              className="orders-type-filter__button"
              aria-haspopup="menu"
              aria-expanded={statusFilterOpen}
              aria-label="Filter event components by status"
              onClick={() => setStatusFilterOpen((open) => !open)}
            >
              <span className="orders-type-filter__button-icon"><EventIcon name="filter" /></span>
              <span className="orders-type-filter__button-label">Filter by status</span>
              <span className="orders-type-filter__button-dot" hidden={status === "all"} />
            </button>

            {!statusFilterOpen ? null : (
              <div className="orders-type-filter__panel" role="menu" aria-label="Filter event components by status">
                <div className="orders-type-filter__panel-head">
                  <div className="orders-type-filter__panel-title">Filter by status</div>
                  <div className="orders-type-filter__panel-sub">{components.length} component{components.length === 1 ? "" : "s"}</div>
                </div>
                <div className="orders-type-filter__options">
                  {statusOptions.map((option) => (
                    <button
                      type="button"
                      className={`orders-type-filter__option${option.key === status ? " is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={option.key === status}
                      key={option.key}
                      onClick={() => { setStatus(option.key); setStatusFilterOpen(false); }}
                    >
                      <span className="orders-type-filter__option-icon"><EventIcon name={option.icon} /></span>
                      <span className="orders-type-filter__option-body">
                        <span className="orders-type-filter__option-title">{option.label}</span>
                        <span className="orders-type-filter__option-sub">{option.count} component{option.count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="orders-type-filter__option-check"><EventIcon name="check" /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="events-component-cards" aria-live="polite">
          {canEdit ? <AddNewComponentCard onClick={() => requestForm("create")} /> : null}
          {filtered.map((component) => (
            <ComponentCard
              component={component}
              categoryLabel={categoryMap.get(text(component?.category)) || "Other"}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={(item) => requestForm("edit", item)}
              onDelete={setDeleteTarget}
              onOpenPhotos={setGalleryTarget}
              key={component?.id || component?.name}
            />
          ))}
          {!filtered.length ? (
            <div className="events-empty events-component-cards__empty"><EventIcon name="layers" /><span>No event components match this view.</span></div>
          ) : null}
        </div>
      </section>

      <ComponentFormModal
        mode={formMode}
        form={form}
        categories={categories}
        busy={formBusy}
        error={formError}
        onChange={patchForm}
        onAssets={handleAssets}
        onRemovePhoto={removeFormPhoto}
        onRemoveAttachment={removeFormAttachment}
        onClose={() => { if (!formBusy) { setFormMode(""); setFormError(""); } }}
        onSubmit={submitForm}
      />

      <PhotoGalleryModal component={galleryTarget} onClose={() => setGalleryTarget(null)} />

      <AuthorizationModal
        authorization={authorization}
        busy={authBusy}
        error={authError}
        password={adminPassword}
        onPassword={(value) => { setAdminPassword(value); setAuthError(""); }}
        onClose={() => { if (!authBusy) { setAuthorization(null); setAuthError(""); } }}
        onSubmit={submitAuthorization}
      />

      <DeleteModal
        component={deleteTarget}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(""); } }}
        onConfirm={deleteComponent}
      />
    </section>
  );
}
