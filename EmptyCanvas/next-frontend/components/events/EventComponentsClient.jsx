"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STANDARD_CATEGORIES = [
  { code: "project", label: "Project Resource" },
  { code: "marketing_material", label: "Marketing Material" },
  { code: "venue_equipment", label: "Venue Equipment" },
];

const OWNERSHIP_LABELS = {
  company_owned: "Company Owned",
  external_rental: "External Rental",
};

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
  photoDataUrl: "",
  photoFileName: "",
  existingPhotoUrl: "",
  removePhoto: false,
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
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(blob);
  });
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

function ComponentFormModal({ mode, form, categories, busy, error, onChange, onPhoto, onClose, onSubmit }) {
  if (!mode) return null;
  const external = form.ownershipType === "external_rental";
  const preview = form.removePhoto ? "" : (form.photoDataUrl || form.existingPhotoUrl);
  const unitCost = Math.max(0, number(form.operatingCost)) + (external ? Math.max(0, number(form.rentalCost)) : 0);
  const isNewCategory = form.category === "__new__";

  return (
    <div className="next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="next-modal next-event-component-form" onSubmit={onSubmit}>
        <header className="next-events-modal-head">
          <div>
            <span className="next-events-kicker">Catalogue record</span>
            <h2>{mode === "create" ? "Add Event Component" : "Edit Event Component"}</h2>
            <p>Define its category, source, default quantity, costs, photo, and availability.</p>
          </div>
          <button type="button" className="next-modal-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>

        <div className="next-event-component-form-grid">
          <label className="next-field wide">
            <span>Component name *</span>
            <input value={form.name} maxLength={180} onChange={(event) => onChange("name", event.target.value)} placeholder="Example: 3m × 1m branded backdrop" required autoFocus />
          </label>

          <label className="next-field">
            <span>Category *</span>
            <select value={form.category} onChange={(event) => onChange("category", event.target.value)}>
              {categories.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
              <option value="__new__">+ Add a new category</option>
            </select>
          </label>

          <label className="next-field">
            <span>Default quantity</span>
            <input type="number" min="0" step="0.01" value={form.defaultQuantity} onChange={(event) => onChange("defaultQuantity", event.target.value)} />
          </label>

          {isNewCategory ? (
            <label className="next-field wide next-event-component-new-category">
              <span>New category name *</span>
              <input value={form.customCategory} maxLength={80} onChange={(event) => onChange("customCategory", event.target.value)} placeholder="Example: Safety Equipment" required />
              <small>The category will be saved when the component is saved.</small>
            </label>
          ) : null}

          <label className="next-field">
            <span>Source type *</span>
            <select value={form.ownershipType} onChange={(event) => onChange("ownershipType", event.target.value)}>
              <option value="company_owned">Company Owned</option>
              <option value="external_rental">External Rental</option>
            </select>
          </label>

          <label className="next-field">
            <span>Operating cost (EGP)</span>
            <input type="number" min="0" step="0.01" value={form.operatingCost} onChange={(event) => onChange("operatingCost", event.target.value)} />
          </label>

          {external ? (
            <label className="next-field">
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

          <div className="next-event-component-photo-field wide">
            <div>
              <span>Component photo</span>
              <small>PNG, JPG, WEBP, or GIF. Images are compressed before upload.</small>
            </div>
            <div className="next-event-component-photo-layout">
              <div className={`next-event-component-photo-preview${preview ? " has-image" : ""}`}>
                {preview ? <img src={preview} alt="Component preview" /> : <span>Photo preview</span>}
              </div>
              <div className="next-event-component-photo-actions">
                <label className="secondary-button">
                  Choose image
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPhoto} hidden />
                </label>
                {(form.existingPhotoUrl || form.photoDataUrl) && !form.removePhoto ? (
                  <button type="button" className="danger-button" onClick={() => onChange("removePhoto", true)}>Remove photo</button>
                ) : null}
                {form.removePhoto ? (
                  <button type="button" className="secondary-button" onClick={() => onChange("removePhoto", false)}>Keep current photo</button>
                ) : null}
              </div>
            </div>
          </div>

          <label className="next-event-component-checkbox wide">
            <input type="checkbox" checked={!!form.isActive} onChange={(event) => onChange("isActive", event.target.checked)} />
            <span>Available for new event requests</span>
          </label>
        </div>

        {error ? <div className="next-events-form-error">{error}</div> : null}

        <footer className="next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving..." : mode === "create" ? "Save Component" : "Save Changes"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function AuthorizationModal({ authorization, busy, error, password, onPassword, onClose, onSubmit }) {
  if (!authorization) return null;
  return (
    <div className="next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="next-modal next-events-auth-modal" onSubmit={onSubmit}>
        <header className="next-events-modal-head">
          <div>
            <span className="next-events-kicker">Admin authorization</span>
            <h2>Authorization required</h2>
            <p>Enter the shared Admin password to {authorization.intent === "create" ? "add a component" : "edit this component"}.</p>
          </div>
          <button type="button" className="next-modal-close" onClick={onClose} disabled={busy}>×</button>
        </header>
        <label className="next-field">
          <span>Admin password *</span>
          <input type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="current-password" required autoFocus />
        </label>
        {error ? <div className="next-events-form-error">{error}</div> : null}
        <footer className="next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-button" disabled={busy}>{busy ? "Authorizing..." : "Authorize & Continue"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function DeleteModal({ component, busy, error, onClose, onConfirm }) {
  if (!component) return null;
  return (
    <div className="next-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="next-modal next-events-confirm-modal" role="dialog" aria-modal="true">
        <header className="next-events-modal-head">
          <div>
            <span className="next-events-kicker">Permanent deletion</span>
            <h2>Delete “{component.name || "this component"}”?</h2>
            <p>Existing event requests keep their saved snapshot, but this catalogue record cannot be restored.</p>
          </div>
          <button type="button" className="next-modal-close" onClick={onClose} disabled={busy}>×</button>
        </header>
        {error ? <div className="next-events-form-error">{error}</div> : null}
        <footer className="next-events-modal-actions">
          <span />
          <div>
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? "Deleting..." : "Delete permanently"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ComponentCard({ component, categoryLabel, canEdit, canDelete, onEdit, onDelete }) {
  const photo = safeUrl(component?.photoUrl);
  const link = safeUrl(component?.linkUrl);
  const external = component?.ownershipType === "external_rental";
  const operating = Math.max(0, number(component?.operatingCost));
  const rental = external ? Math.max(0, number(component?.rentalCost)) : 0;
  const unit = Math.max(0, number(component?.unitCost || operating + rental));
  const active = component?.isActive !== false;

  return (
    <article className={`next-event-component-card${active ? "" : " is-inactive"}`}>
      <div className="next-event-component-card-photo">
        {photo ? <img src={photo} alt={`${component?.name || "Event component"} photo`} loading="lazy" /> : <span>EC</span>}
        <em className={active ? "active" : "inactive"}>{active ? "Active" : "Inactive"}</em>
      </div>
      <div className="next-event-component-card-body">
        <div className="next-event-component-badges">
          <span>{categoryLabel}</span>
          <span>{OWNERSHIP_LABELS[external ? "external_rental" : "company_owned"]}</span>
        </div>
        <h3>{component?.name || "Untitled component"}</h3>
        <p>{text(component?.description) || "No description was added."}</p>
        <div className="next-event-component-metrics">
          <div><small>Default qty.</small><strong>{number(component?.defaultQuantity || 0)}</strong></div>
          <div><small>Operating</small><strong>{money(operating)}</strong></div>
          {external ? <div><small>Rental</small><strong>{money(rental)}</strong></div> : null}
          <div className="unit"><small>Cost / unit</small><strong>{money(unit)}</strong></div>
        </div>
      </div>
      <footer>
        <div>{link ? <a href={link} target="_blank" rel="noreferrer">Open link ↗</a> : <span>No reference link</span>}</div>
        <div>
          {canEdit ? <button type="button" className="secondary-button" onClick={() => onEdit(component)}>Edit</button> : null}
          {canDelete ? <button type="button" className="danger-button" onClick={() => onDelete(component)}>Delete</button> : null}
        </div>
      </footer>
    </article>
  );
}

export default function EventComponentsClient({ account, initialComponents, initialCategories, initialCreate = false, bootstrapWarnings = [] }) {
  const [components, setComponents] = useState(Array.isArray(initialComponents) ? initialComponents : []);
  const [categories, setCategories] = useState(normalizeCategories(initialCategories));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
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
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const initialCreateHandled = useRef(false);

  const accessLevel = useMemo(() => pageAccessLevel(account), [account]);
  const canEdit = ["edit", "admin"].includes(accessLevel);
  const canDelete = accessLevel === "admin";

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.code, item.label])), [categories]);

  const filtered = useMemo(() => {
    const q = lower(query);
    const rows = components.filter((component) => {
      const active = component?.isActive !== false;
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;
      if (category !== "all" && text(component?.category) !== category) return false;
      if (!q) return true;
      return [component?.name, component?.description, component?.linkUrl, categoryMap.get(text(component?.category)), OWNERSHIP_LABELS[component?.ownershipType]]
        .map(lower)
        .join(" ")
        .includes(q);
    });

    return rows.sort((a, b) => {
      if (sort === "cost-desc") return number(b?.unitCost) - number(a?.unitCost);
      if (sort === "cost-asc") return number(a?.unitCost) - number(b?.unitCost);
      if (sort === "category") return text(categoryMap.get(text(a?.category))).localeCompare(text(categoryMap.get(text(b?.category)))) || text(a?.name).localeCompare(text(b?.name));
      return text(a?.name).localeCompare(text(b?.name));
    });
  }, [components, query, category, status, sort, categoryMap]);

  const summary = useMemo(() => {
    const active = components.filter((item) => item?.isActive !== false).length;
    const rentals = components.filter((item) => item?.ownershipType === "external_rental").length;
    const totalUnitCost = components.reduce((sum, item) => sum + Math.max(0, number(item?.unitCost)), 0);
    return { total: components.length, active, inactive: components.length - active, rentals, totalUnitCost };
  }, [components]);

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
      existingPhotoUrl: text(component?.photoUrl),
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

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFormBusy(true);
    setFormError("");
    try {
      const prepared = await compressImage(file);
      setForm((current) => ({
        ...current,
        photoDataUrl: prepared.dataUrl,
        photoFileName: prepared.fileName,
        removePhoto: false,
      }));
    } catch (error) {
      setFormError(error?.message || "Could not prepare the image.");
    } finally {
      setFormBusy(false);
    }
  }

  async function refreshCategories() {
    const payload = await requestJson(`/api/events/component-categories?_ts=${Date.now()}`);
    const next = normalizeCategories(payload?.categories);
    setCategories(next);
    return next;
  }

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [componentsPayload, categoriesPayload] = await Promise.all([
        requestJson(`/api/events/components?_ts=${Date.now()}`),
        requestJson(`/api/events/component-categories?_ts=${Date.now()}`),
      ]);
      setComponents(Array.isArray(componentsPayload?.components) ? componentsPayload.components : []);
      setCategories(normalizeCategories(categoriesPayload?.categories));
      setToast({ type: "success", title: "Event Components", message: "Catalogue data was refreshed." });
    } catch (error) {
      setToast({ type: "error", title: "Event Components", message: error?.message || "Could not refresh the catalogue." });
    } finally {
      setRefreshing(false);
    }
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
        photoDataUrl: form.photoDataUrl || "",
        photoFileName: form.photoFileName || "",
        removePhoto: !!form.removePhoto,
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
    <section className="next-event-components-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="next-events-title-row">
        <div>
          <span className="next-events-kicker">Event catalogue</span>
          <h2>Reusable components for every event request</h2>
          <p>Manage projects, marketing materials, venue equipment, external rentals, costs, images, and availability.</p>
        </div>
        <div className="next-events-title-actions">
          <a href="/next/events" className="secondary">Event Requests</a>
          <a href="/next/events-calendar" className="secondary">Calendar</a>
          <a href="/events/components?classic=1" className="secondary">Classic</a>
          {canEdit ? <button type="button" className="primary-button" onClick={() => requestForm("create")}>Add Event Component</button> : null}
        </div>
      </div>

      {bootstrapWarnings.length ? (
        <div className="next-bootstrap-warning">Some catalogue resources were omitted during initial loading. Use Refresh to retry them.</div>
      ) : null}

      <div className="next-event-components-summary-grid">
        <article><small>Total components</small><strong>{summary.total}</strong><span>{categories.length} available categories</span></article>
        <article><small>Active catalogue</small><strong>{summary.active}</strong><span>{summary.inactive} inactive records</span></article>
        <article><small>External rentals</small><strong>{summary.rentals}</strong><span>Rental source components</span></article>
        <article><small>Combined unit cost</small><strong>{money(summary.totalUnitCost)}</strong><span>Across all catalogue records</span></article>
      </div>

      <div className="next-event-components-toolbar">
        <label className="next-events-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, description, category, source, or link" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name">Name A–Z</option>
            <option value="category">Category</option>
            <option value="cost-desc">Cost high to low</option>
            <option value="cost-asc">Cost low to high</option>
          </select>
        </label>
        <button type="button" className="next-events-refresh" onClick={refreshAll} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
      </div>

      <div className="next-event-components-results-line">
        <span>{filtered.length} of {components.length} components</span>
        <span>Access: {accessLevel === "admin" ? "Admin" : accessLevel === "edit" ? "Edit with Admin authorization" : "View only"}</span>
      </div>

      {filtered.length ? (
        <div className="next-event-components-grid">
          {filtered.map((component) => (
            <ComponentCard
              component={component}
              categoryLabel={categoryMap.get(text(component?.category)) || "Other"}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={(item) => requestForm("edit", item)}
              onDelete={setDeleteTarget}
              key={component?.id || component?.name}
            />
          ))}
        </div>
      ) : (
        <div className="next-events-empty">
          <span>EC</span>
          <h3>No components match this view</h3>
          <p>Change the search or filters, or add a new catalogue record.</p>
        </div>
      )}

      <ComponentFormModal
        mode={formMode}
        form={form}
        categories={categories}
        busy={formBusy}
        error={formError}
        onChange={patchForm}
        onPhoto={handlePhoto}
        onClose={() => { if (!formBusy) { setFormMode(""); setFormError(""); } }}
        onSubmit={submitForm}
      />

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
