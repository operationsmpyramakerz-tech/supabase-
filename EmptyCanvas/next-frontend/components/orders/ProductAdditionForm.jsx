"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepareProductImage, uploadPreparedProductImage } from "../products/ProductImageProcessing";
import { validateProductAddition } from "../../lib/product-addition-request-payload.mjs";

const clean = value => String(value ?? "").trim();
const unique = values => [...new Map((values || []).map(clean).filter(Boolean).map(value => [value.toLowerCase(), value])).values()]
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));

function AdditionIcon({ name, size = 19 }) {
  const icons = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    x: <><path d="M18 6 6 18M6 6l12 12" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    tag: <><path d="M20.6 13.4 11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r=".6"/></>,
    unit: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[name] || icons.plus}</svg>;
}

function AdditionSelect({ label, name, value, options, onChange, icon, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef(null);
  const searchInput = useRef(null);
  const list = useMemo(() => unique([...(options || []), ...(value ? [value] : [])]), [options, value]);
  const filtered = list.filter(option => option.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    searchInput.current?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const toggle = () => { setQuery(""); setOpen(previous => !previous); };
  return <div className="addition-field addition-select" ref={root}>
    <label id={`addition-${name}-label`} htmlFor={`addition-${name}-value`}>{label} <b>*</b></label>
    <input id={`addition-${name}-value`} type="text" className="addition-select__value" required value={value} readOnly tabIndex={-1} aria-hidden="true" />
    <button type="button" className={`addition-select__trigger ${open ? "is-open" : ""} ${value ? "has-value" : ""}`} aria-labelledby={`addition-${name}-label`} aria-expanded={open} aria-haspopup="listbox" onClick={toggle} disabled={disabled}>
      <span className="addition-select__icon"><AdditionIcon name={icon}/></span>
      <span className="addition-select__text">{value || placeholder}</span>
      <AdditionIcon name="chevron" size={17}/>
    </button>
    {open ? <div className="addition-select__panel">
      <div className="addition-select__search"><AdditionIcon name="search" size={16}/><input ref={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${name}s...`} aria-label={`Search ${name}s`} /></div>
      <div className="addition-select__options" role="listbox" aria-labelledby={`addition-${name}-label`}>
        {filtered.length ? filtered.map(option => <button key={option} type="button" role="option" aria-selected={value === option} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); setQuery(""); }}><span>{option}</span>{value === option ? <AdditionIcon name="check" size={16}/> : null}</button>) : <p className="addition-select__empty">No matching {name}s</p>}
      </div>
    </div> : null}
  </div>;
}

export default function ProductAdditionForm({ initial = {}, units = [], tags = [], review = false, canUploadImage = true, onSave, onClose, uploadEndpoint = "/next/api/orders/shopping-cart/request-image" }) {
  const [form, setForm] = useState(() => ({
    name: initial.name || "", idCode: initial.idCode || initial.id_code || "",
    unitPrice: initial.unitPrice ?? initial.unit_price ?? "",
    unit: initial.unit || "", tag: initial.tag || "",
    url: initial.url || "", imageUrl: initial.imageUrl || initial.image_url || "",
    quantity: initial.quantity ?? 1,
  }));
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const preview = image?.previewUrl || form.imageUrl;

  const prepareImage = async file => {
    if (!file) return;
    try {
      setError("");
      const prepared = await prepareProductImage(file);
      setImage(previous => { if (previous?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previous.previewUrl); return prepared; });
    } catch (exception) { setError(exception?.message || "Unable to load image."); }
  };
  useEffect(() => () => { if (image?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl); }, [image]);
  const chooseImage = event => { const file = event.target.files?.[0]; event.target.value = ""; void prepareImage(file); };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!clean(form.unit) || !clean(form.tag)) { setError("Select Unit of Measurement and Tag."); return; }
    if (!clean(form.url)) { setError("Product URL is required."); return; }
    if (!preview) { setError("Product Image is required."); return; }
    setBusy(true);
    try {
      const finalImageUrl = image?.blob ? await uploadPreparedProductImage(image, uploadEndpoint) : form.imageUrl;
      const validated = validateProductAddition({ ...form, imageUrl: finalImageUrl });
      await onSave(validated);
    } catch (exception) { setError(exception?.message || "Could not save the requested component."); }
    finally { setBusy(false); }
  };

  return <div className="addition-dialog-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="addition-dialog" role="dialog" aria-modal="true" aria-labelledby="addition-dialog-heading" onSubmit={submit}>
      <header className="addition-dialog__header">
        <span className="addition-dialog__icon" aria-hidden="true"><AdditionIcon name="plus" size={28}/></span>
        <button className="addition-dialog__close" type="button" disabled={busy} onClick={onClose} aria-label="Close"><AdditionIcon name="x" size={21}/></button>
      </header>
      <div className="addition-dialog__body">
        <div className="addition-dialog__intro"><h2 id="addition-dialog-heading">{review ? "Review New Product" : "Add New Product Request"}</h2><p>{review ? "Review the details before adding this item to Products." : "This item will be sent for review. It will not appear in Products automatically."}</p></div>
        <div className="addition-dialog__grid">
          <label className="addition-field addition-field--full"><span>Product Name <b>*</b></span><input required maxLength={250} disabled={busy} placeholder="Example: Arduino Nano Type-C USB" value={form.name} onChange={event => update("name", event.target.value)}/></label>
          <label className="addition-field"><span>ID Code <small>(Optional)</small></span><input maxLength={80} disabled={busy} placeholder="Optional" value={form.idCode} onChange={event => update("idCode", event.target.value)} /></label>
          <label className="addition-field"><span>Unit Price <b>*</b></span><span className="addition-field__price"><input required disabled={busy} type="number" step="0.01" min="0" max="100000000" placeholder="0.00" value={form.unitPrice} onChange={event => update("unitPrice", event.target.value)} /><b>EGP</b></span></label>
          <AdditionSelect label="Unit of Measurement" name="unit" value={form.unit} options={units} onChange={value => update("unit", value)} icon="unit" placeholder="Select unit" disabled={busy}/>
          <AdditionSelect label="Tag" name="tag" value={form.tag} options={tags} onChange={value => update("tag", value)} icon="tag" placeholder="Select tag" disabled={busy}/>
          <label className="addition-field"><span>Qty <b>*</b></span><input required disabled={busy} type="number" min="0.01" max="100000" step="0.001" value={form.quantity} onChange={event => update("quantity", event.target.value)} /></label>
          <label className="addition-field addition-field--full"><span>Product URL <b>*</b></span><input required disabled={busy} type="url" maxLength={2000} placeholder="https://supplier.com/product" value={form.url} onChange={event => update("url", event.target.value)} /></label>
          <div className="addition-field addition-field--full"><span>Product Image <b>*</b></span>
            <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} aria-label="Upload product image" />
            <div className={`addition-image-upload ${dragging ? "is-dragging" : ""} ${preview ? "has-image" : ""}`} onDragOver={event => { event.preventDefault(); if (canUploadImage) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (canUploadImage) void prepareImage(event.dataTransfer.files?.[0]); }}>
              {preview ? <img className="addition-image-upload__preview" src={preview} alt="Selected product"/> : <span className="addition-image-upload__icon"><AdditionIcon name="upload" size={24}/></span>}
              <span className="addition-image-upload__copy"><strong>{image?.name || (preview ? "Product image selected" : "Upload product image")}</strong><small>{preview ? "PNG, JPG or WEBP · Image ready" : "PNG, JPG or WEBP · Maximum 10 MB"}</small></span>
              {canUploadImage ? <button className="addition-image-upload__browse" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{preview ? "Change" : "Browse"}</button> : null}
              {preview && canUploadImage ? <button type="button" className="addition-image-upload__remove" onClick={() => { setImage(null); update("imageUrl", ""); }} aria-label="Remove image" disabled={busy}><AdditionIcon name="x" size={16}/></button> : null}
            </div>
            {!canUploadImage && !preview ? <small className="addition-image-upload__help">Image upload permission is required to complete this request.</small> : null}
          </div>
        </div>
        {error ? <p className="addition-dialog__error" role="alert">{error}</p> : null}
      </div>
      <footer className="addition-dialog__footer"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="addition-dialog__save" disabled={busy}>{busy ? "Saving..." : review ? "Save Changes" : "Add to Cart"}</button></footer>
    </form>
  </div>;
}
