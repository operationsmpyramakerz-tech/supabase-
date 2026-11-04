"use client";

import { useRef, useState } from "react";
import { prepareProductImage, uploadPreparedProductImage } from "../products/ProductImageProcessing";
import { validateProductAddition } from "../../lib/product-addition-request-payload.mjs";

const clean = value => String(value ?? "").trim();

export default function ProductAdditionForm({ initial = {}, units = [], tags = [], review = false, canUploadImage = true, onSave, onClose, uploadEndpoint = "/next/api/orders/shopping-cart/request-image" }) {
  const [form, setForm] = useState(() => ({
    name: initial.name || "", idCode: initial.idCode || initial.id_code || "",
    unitPrice: initial.unitPrice ?? initial.unit_price ?? "",
    unit: initial.unit || "", tag: initial.tag || "",
    url: initial.url || "", imageUrl: initial.imageUrl || initial.image_url || "",
    quantity: initial.quantity || 1,
  }));
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const chooseImage = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setError("");
      const prepared = await prepareProductImage(file);
      setImage(prepared);
    } catch (exception) { setError(exception?.message || "Unable to load image."); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const validated = validateProductAddition(form);
      if (image?.blob) {
        validated.imageUrl = await uploadPreparedProductImage(image, uploadEndpoint);
      }
      await onSave(validated);
    } catch (exception) { setError(exception?.message || "Could not save the requested component."); }
    finally { setBusy(false); }
  };

  return <div className="addition-dialog-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="addition-dialog" role="dialog" aria-modal="true" aria-labelledby="addition-dialog-heading" onSubmit={submit}>
      <header className="addition-dialog__header">
        <span className="addition-dialog__icon">⬡</span>
        <div><h2 id="addition-dialog-heading">{review ? "Review New Product" : "Add New Product Request"}</h2><p>{review ? "Review the details before adding this item to Products." : "This item will be sent for review. It will not appear in Products automatically."}</p></div>
        <button className="addition-dialog__close" type="button" disabled={busy} onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="addition-dialog__grid">
        <label className="addition-field addition-field--full"><span>Product Name <b>*</b></span><input required maxLength={250} autoFocus placeholder="Example: Arduino Nano Type-C USB" value={form.name} onChange={event => update("name", event.target.value)} /></label>
        <label className="addition-field"><span>ID Code</span><input maxLength={80} placeholder="Optional" value={form.idCode} onChange={event => update("idCode", event.target.value)} /></label>
        <label className="addition-field"><span>Unit Price</span><span className="addition-field__price"><input type="number" step="0.01" min="0" placeholder="0.00" value={form.unitPrice} onChange={event => update("unitPrice", event.target.value)} /><b>EGP</b></span></label>
        <label className="addition-field"><span>Unit of Measurement</span><input list="addition-units" maxLength={80} placeholder="Select or enter unit" value={form.unit} onChange={event => update("unit", event.target.value)} /><datalist id="addition-units">{[...new Set(["Piece", "Pack", "Metre", "Kilogram", ...units])].map(unit => <option key={unit} value={unit}/>)}</datalist></label>
        <label className="addition-field"><span>Tag</span><input list="addition-tags" maxLength={120} placeholder="Select or enter tag" value={form.tag} onChange={event => update("tag", event.target.value)} /><datalist id="addition-tags">{[...new Set(tags)].map(tag => <option key={tag} value={tag}/>)}</datalist></label>
        <label className="addition-field"><span>Qty <b>*</b></span><input required type="number" min="0.01" max="100000" step="0.001" value={form.quantity} onFocus={event => { if (String(form.quantity) === "0") event.target.select(); }} onChange={event => update("quantity", event.target.value)} /></label>
        <label className="addition-field addition-field--full"><span>Product URL</span><input type="url" maxLength={2000} placeholder="https://supplier.com/product" value={form.url} onChange={event => update("url", event.target.value)} /></label>
        <div className="addition-field addition-field--full"><span>Product Image</span><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
          <button className="addition-image-picker" type="button" onClick={() => fileRef.current?.click()} disabled={busy || !canUploadImage}>
            {(image?.previewUrl || form.imageUrl) ? <img src={image?.previewUrl || form.imageUrl} alt="Selected product" /> : <span className="addition-image-picker__symbol">↑</span>}
            <span><strong>{image?.name || (form.imageUrl ? "Change product image" : "Choose product image")}</strong><small>PNG, JPG or WEBP · maximum 10 MB</small></span><b>Browse</b>
          </button>
          {canUploadImage && (image || form.imageUrl) ? <button type="button" className="addition-image-remove" onClick={() => { setImage(null); update("imageUrl", ""); }}>Remove image</button> : null}
        </div>
      </div>
      {error ? <p className="addition-dialog__error" role="alert">{error}</p> : null}
      <footer className="addition-dialog__footer"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="addition-dialog__save" disabled={busy}>{busy ? "Saving..." : review ? "Save Changes" : "Add to Cart"}</button></footer>
    </form>
  </div>;
}
