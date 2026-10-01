"use client";

import { useRef, useState } from "react";

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

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function fileSize(bytes) {
  const size = number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function apiErrorMessage(body, fallback) {
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
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function ClassicIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    tag: <><path d="M20.59 13.41L11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    "plus-circle": <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    chevron: <polyline points="6 9 12 15 18 9" />,
    box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></>,
    unit: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
    upload: <><path d="M16 16l-4-4-4 4" /><path d="M12 12v9" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /><polyline points="16 16 12 12 8 16" /></>,
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg {...common}>{paths[name] || paths.box}</svg>;
}

export function ProductModal({ product, activeTag, tags, units, onClose, onSaved, onUnitAdded }) {
  const isEdit = !!product?.id;
  const lockTag = !isEdit && activeTag !== "__all__";
  const [form, setForm] = useState(() => ({
    name: product?.name || "",
    idCode: product?.displayId || "",
    unitPrice: product?.unitPrice ?? "",
    unit: product?.unit || "",
    tag: firstTag(product || {}) === "Uncategorized" ? (activeTag !== "__all__" ? activeTag : "") : firstTag(product),
    url: product?.url || "",
  }));
  const [image, setImage] = useState(() => ({
    dataUrl: "",
    blob: null,
    previewUrl: product?.imageUrl || "",
    name: product?.imageUrl ? "Current product image" : "",
    type: "",
    size: 0,
    removed: false,
  }));
  const [newUnit, setNewUnit] = useState("");
  const [showUnitInput, setShowUnitInput] = useState(false);
  const [openSelect, setOpenSelect] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const chooseImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageBusy(true);
    setError("");
    try {
      const { prepareProductImage } = await import("./ProductImageProcessing");
      const prepared = await prepareProductImage(file);
      setImage({ ...prepared, removed: false });
    } catch (imageError) {
      setError(imageError?.message || "The image could not be prepared.");
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = () => {
    setImage({ dataUrl: "", blob: null, previewUrl: "", name: "", type: "", size: 0, removed: !!product?.imageUrl });
  };

  const addUnit = async () => {
    const name = text(newUnit);
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const body = await requestJson("/next/api/products/units", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const savedUnit = text(body?.unit) || name;
      onUnitAdded(savedUnit);
      update("unit", savedUnit);
      setNewUnit("");
      setShowUnitInput(false);
      setOpenSelect("");
    } catch (unitError) {
      setError(unitError?.message || "The unit could not be added.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const name = text(form.name);
    if (!name) {
      setError("Product name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let uploadedImageUrl = "";
      if (image?.blob) {
        const { uploadPreparedProductImage } = await import("./ProductImageProcessing");
        uploadedImageUrl = await uploadPreparedProductImage(image);
      }
      const payload = {
        name,
        idCode: text(form.idCode) || null,
        unitPrice: text(form.unitPrice) === "" ? null : number(form.unitPrice),
        unit: text(form.unit) || null,
        tags: text(form.tag) || null,
        url: text(form.url) || null,
        ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
        removeImage: !uploadedImageUrl && !!image.removed,
      };
      const endpoint = isEdit ? `/next/api/products?id=${encodeURIComponent(product.id)}` : "/next/api/products";
      const body = await requestJson(endpoint, {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved(body.product, isEdit);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || "The product could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="products-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="products-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-form-title">
        <button type="button" className="products-modal__close" onClick={onClose} disabled={busy} aria-label="Close product form"><span aria-hidden="true">×</span></button>
        <div className="products-modal__header">
          <div className="products-modal__icon"><ClassicIcon name="box" /></div>
          <div><h2 id="product-form-title">{isEdit ? "Edit Product" : "Product"}</h2><p>{isEdit ? "Update the selected product record." : "Add a product to this catalogue group."}</p></div>
        </div>

        <div className="products-form-grid">
          <label className="products-field products-field--wide"><span>Product Name <em>*</em></span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Example: Arduino Nano Type-C USB" autoFocus /></label>
          <label className="products-field"><span>ID Code</span><input value={form.idCode} onChange={(event) => update("idCode", event.target.value)} placeholder="A100217" /></label>
          <label className="products-field"><span>Unit Price</span><span className="products-price-input"><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => update("unitPrice", event.target.value)} placeholder="0.00" /><strong>EGP</strong></span></label>

          <div className="products-field products-unit-field">
            <span>Unit of Measurement</span>
            <button type="button" className="products-modern-select" aria-expanded={openSelect === "unit"} onClick={() => setOpenSelect((value) => value === "unit" ? "" : "unit")}>
              <span className="products-modern-select__icon"><ClassicIcon name="unit" /></span>
              <span className="products-modern-select__label">{form.unit || "Select unit"}</span>
              <ClassicIcon name="chevron" />
            </button>
            <div className="products-modern-select__menu" hidden={openSelect !== "unit"}>
              <button type="button" className={`products-modern-select__option ${!form.unit ? "is-selected" : ""}`} onClick={() => { update("unit", ""); setOpenSelect(""); }}><span>No unit</span>{!form.unit ? <ClassicIcon name="check" /> : null}</button>
              {units.map((unit) => <button type="button" className={`products-modern-select__option ${form.unit === unit ? "is-selected" : ""}`} onClick={() => { update("unit", unit); setOpenSelect(""); }} key={unit}><span>{unit}</span>{form.unit === unit ? <ClassicIcon name="check" /> : null}</button>)}
              <button type="button" className="products-modern-select__option products-modern-select__option--add" onClick={() => { setShowUnitInput(true); setOpenSelect(""); }}><span><ClassicIcon name="plus-circle" /> Add new unit</span></button>
            </div>
            <div className="products-unit-add" hidden={!showUnitInput}><input value={newUnit} onChange={(event) => setNewUnit(event.target.value)} placeholder="Example: Box" /><button type="button" onClick={addUnit} disabled={busy || !text(newUnit)}><ClassicIcon name="plus" /><span>Add</span></button></div>
          </div>

          {!lockTag ? (
            <div className="products-field products-tag-field">
              <span>Tag</span>
              <button type="button" className="products-modern-select" aria-expanded={openSelect === "tag"} onClick={() => setOpenSelect((value) => value === "tag" ? "" : "tag")}>
                <span className="products-modern-select__icon"><ClassicIcon name="tag" /></span>
                <span className="products-modern-select__label">{form.tag || "Select tag"}</span>
                <ClassicIcon name="chevron" />
              </button>
              <div className="products-modern-select__menu" hidden={openSelect !== "tag"}>
                <button type="button" className={`products-modern-select__option ${!form.tag ? "is-selected" : ""}`} onClick={() => { update("tag", ""); setOpenSelect(""); }}><span>Select tag</span>{!form.tag ? <ClassicIcon name="check" /> : null}</button>
                {tags.map((tag) => <button type="button" className={`products-modern-select__option ${form.tag === tag ? "is-selected" : ""}`} onClick={() => { update("tag", tag); setOpenSelect(""); }} key={tag}><span>{tag}</span>{form.tag === tag ? <ClassicIcon name="check" /> : null}</button>)}
              </div>
            </div>
          ) : <input type="hidden" value={form.tag} readOnly />}

          <label className="products-field products-field--wide"><span>Product URL</span><input type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://supplier.com/product" /></label>

          <div className="products-field products-field--wide">
            <span>Product Image</span>
            {!image.previewUrl ? (
              <div className="products-upload-field">
                <input ref={fileRef} className="products-upload-field__input" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
                <button type="button" className="products-upload-field__picker" onClick={() => fileRef.current?.click()} disabled={busy || imageBusy}>
                  <span className="products-upload-field__icon"><ClassicIcon name="upload" /></span>
                  <span className="products-upload-field__copy"><b>{imageBusy ? "Preparing image…" : "Choose product image"}</b><small>PNG, JPG or WEBP · maximum 10 MB</small></span>
                  <span className="products-upload-field__action">Browse</span>
                </button>
              </div>
            ) : (
              <div className="products-upload-file">
                <span className="products-upload-file__thumb"><img src={image.previewUrl} alt="Product preview" /></span>
                <span className="products-upload-file__info"><b>{image.name || "Product image"}</b><small>{image.size ? `${image.type} · ${fileSize(image.size)}` : "Saved image"}</small></span>
                <button type="button" className="products-upload-file__open" onClick={() => window.open(image.previewUrl, "_blank", "noopener,noreferrer")} aria-label="Open image"><ClassicIcon name="eye" /></button>
                <button type="button" className="products-upload-file__remove" onClick={removeImage} disabled={busy} aria-label="Remove image">×</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} hidden />
              </div>
            )}
          </div>
        </div>

        <div className="products-form-error">{error}</div>
        <div className="products-modal__actions"><button className="products-btn products-btn--light" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="products-btn products-btn--dark" type="submit" disabled={busy || imageBusy}>{busy ? "Saving..." : "Save Product"}</button></div>
      </form>
    </div>
  );
}

export function TagModal({ mode, tag, onClose, onSaved }) {
  const [name, setName] = useState(mode === "edit" ? tag : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const clean = text(name);
    if (!clean) return setError("Tag name is required.");
    if (mode === "edit" && lower(clean) === lower(tag)) return setError("Enter a different tag name.");
    setBusy(true);
    setError("");
    try {
      const body = await requestJson("/next/api/products/tags", {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(mode === "edit" ? { oldTag: tag, newTag: clean } : { name: clean }),
      });
      onSaved(clean, body);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || "The tag could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="products-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="products-modal products-tag-modal" onSubmit={submit} role="dialog" aria-modal="true">
        <button type="button" className="products-modal__close" onClick={onClose} disabled={busy} aria-label="Close"><span>×</span></button>
        <div className="products-modal__header"><div className="products-modal__icon"><ClassicIcon name="tag" /></div><div><h2>{mode === "edit" ? "Edit Tag" : "Add Tag"}</h2><p>{mode === "edit" ? `Rename “${tag}” across its products.` : "Create a new product group."}</p></div></div>
        <label className="products-field"><span>Tag Name <em>*</em></span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
        <div className="products-form-error">{error}</div>
        <div className="products-modal__actions"><button className="products-btn products-btn--light" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="products-btn products-btn--dark" type="submit" disabled={busy}>{busy ? "Saving..." : mode === "edit" ? "Save Tag" : "Add Tag"}</button></div>
      </form>
    </div>
  );
}

export function ProductImageViewer({ image, onClose }) {
  if (!image?.url) return null;
  return (
    <div className="products-modal-overlay next-products-image-viewer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section role="dialog" aria-modal="true">
        <header><strong>{image.name}</strong><button type="button" onClick={onClose}>×</button></header>
        <img src={image.url} alt={image.name || "Product image"} />
      </section>
    </div>
  );
}
