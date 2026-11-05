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
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h6"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></>,
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg {...common}>{paths[name] || paths.box}</svg>;
}

export function ProductModal({ product, activeTag, tags, units, onClose, onSaved, onUnitAdded, canAddUnit = true, canUploadImage = true }) {
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
  const [sourceMode, setSourceMode] = useState(() => product?.attachments?.length ? "files" : "url");
  const [attachments, setAttachments] = useState(() => Array.isArray(product?.attachments) ? [...product.attachments] : []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [draggingFile, setDraggingFile] = useState(false);
  const resourceFileRef = useRef(null);
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

  const addResourceFiles = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    setError("");
    const selected = [];
    for (const file of incoming) {
      // Any filename/extension is accepted; size and count limits still apply.
      if (!file.name?.trim()) { setError("Choose a file with a valid name."); return; }
      if (!file.size || file.size > 10 * 1024 * 1024) { setError(`File must be 1 byte–10 MB: ${file.name}`); return; }
      selected.push(file);
    }
    if (attachments.length + pendingFiles.length + selected.length > 10) {
      setError("A product can have up to 10 uploaded files.");
      return;
    }
    setPendingFiles((current) => [...current, ...selected]);
  };

  const downloadResource = (entry) => {
    if (entry.file) {
      const url = URL.createObjectURL(entry.file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = entry.file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (entry.url) {
      window.open(entry.url, "_blank", "noopener,noreferrer");
    }
  };

  const uploadResource = async (file) => {
    const ticket = await requestJson("/next/api/products/file-upload", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, mime: file.type || "application/octet-stream", size: file.size }),
    });
    const upload = ticket?.upload;
    if (!upload?.signedUrl || !upload?.publicUrl) throw new Error("Could not prepare file upload.");
    const formData = new FormData();
    formData.append("cacheControl", String(upload.cacheControl || "3600"));
    // Preserve normal MIME types (e.g. PDFs) while making executable web
    // documents download as binary rather than run in a browser.
    const activeWebFile = /\.(?:html?|xhtml|svg|js|mjs|cjs|jsx|xml)$/i.test(file.name);
    const uploadMime = activeWebFile ? "application/octet-stream" : (file.type || "application/octet-stream");
    const downloadFile = new File([file], file.name, { type: uploadMime, lastModified: file.lastModified });
    formData.append("", downloadFile, file.name);
    const response = await fetch(upload.signedUrl, {
      method: upload.method || "PUT", credentials: "omit", cache: "no-store",
      headers: upload.headers || { "x-upsert": "false" }, body: formData,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message.slice(0, 250) || `File upload failed (${response.status}).`);
    }
    return { name: file.name, size: file.size, type: file.type || "application/octet-stream", url: upload.publicUrl };
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
      let savedAttachments = [...attachments];
      if (sourceMode === "files") {
        for (const file of pendingFiles) {
          const uploaded = await uploadResource(file);
          savedAttachments.push(uploaded);
          setAttachments([...savedAttachments]);
          setPendingFiles((current) => current.filter((item) => item !== file));
        }
      }
      const payload = {
        name,
        idCode: text(form.idCode) || null,
        unitPrice: text(form.unitPrice) === "" ? null : number(form.unitPrice),
        unit: text(form.unit) || null,
        tags: text(form.tag) || null,
        url: sourceMode === "url" ? (text(form.url) || null) : null,
        attachments: sourceMode === "files" ? savedAttachments : [],
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
              {canAddUnit ? <button type="button" className="products-modern-select__option products-modern-select__option--add" onClick={() => { setShowUnitInput(true); setOpenSelect(""); }}><span><ClassicIcon name="plus-circle" /> Add new unit</span></button> : null}
            </div>
            {canAddUnit ? <div className="products-unit-add" hidden={!showUnitInput}><input value={newUnit} onChange={(event) => setNewUnit(event.target.value)} placeholder="Example: Box" /><button type="button" onClick={addUnit} disabled={busy || !text(newUnit)}><ClassicIcon name="plus" /><span>Add</span></button></div> : null}
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

          <div className="products-field products-field--wide products-resource-field">
            <div className="products-resource-heading">
              <span>Product URL / Files</span>
              <div className="products-resource-modes" role="group" aria-label="Product link type">
                <button type="button" className={sourceMode === "url" ? "is-active" : ""} onClick={() => setSourceMode("url")} disabled={busy}><ClassicIcon name="link" /> URL</button>
                <button type="button" className={sourceMode === "files" ? "is-active" : ""} onClick={() => setSourceMode("files")} disabled={busy}><ClassicIcon name="file" /> Upload Files</button>
              </div>
            </div>
            {sourceMode === "url" ? (
              <input aria-label="Product URL" type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://supplier.com/product" disabled={busy} />
            ) : (
              <div className="products-resource-uploader">
                <h3>Upload Files</h3>
                <input ref={resourceFileRef} type="file" multiple className="products-resource-uploader__input" aria-label="Choose product files" onChange={(event) => { addResourceFiles(event.target.files); event.target.value = ""; }} disabled={busy} />
                <button type="button" className={`products-resource-dropzone ${draggingFile ? "is-dragging" : ""}`} onClick={() => resourceFileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragLeave={(event) => { event.preventDefault(); setDraggingFile(false); }} onDrop={(event) => { event.preventDefault(); setDraggingFile(false); addResourceFiles(event.dataTransfer.files); }} disabled={busy}>
                  <span className="products-resource-dropzone__plus"><ClassicIcon name="plus" /></span>
                  <span>Drag &amp; Drop or click to choose files</span>
                  <small>ⓘ Max file size: 10 MB · Up to 10 files</small>
                </button>
                {(attachments.length || pendingFiles.length) ? (
                  <div className="products-resource-list">
                    {attachments.map((entry, index) => (
                      <div className="products-resource-file" key={`saved-${entry.url}`}>
                        <span className="products-resource-file__icon"><ClassicIcon name="file" /></span>
                        <span className="products-resource-file__details"><b title={entry.name}>{entry.name}</b><small>{entry.name.split(".").pop()?.toUpperCase()} | {fileSize(entry.size)}</small></span>
                        <span className="products-resource-file__actions">
                          <button type="button" title="Open/download file" aria-label={`Download ${entry.name}`} onClick={() => downloadResource(entry)}><ClassicIcon name="download" /></button>
                          <button type="button" title="Remove file" aria-label={`Remove ${entry.name}`} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))} disabled={busy}><ClassicIcon name="trash" /></button>
                        </span>
                      </div>
                    ))}
                    {pendingFiles.map((file, index) => (
                      <div className="products-resource-file" key={`pending-${index}-${file.name}-${file.size}`}>
                        <span className="products-resource-file__icon"><ClassicIcon name="file" /></span>
                        <span className="products-resource-file__details"><b title={file.name}>{file.name}</b><small>{file.name.split(".").pop()?.toUpperCase()} | {fileSize(file.size)} · Pending upload</small></span>
                        <span className="products-resource-file__actions">
                          <button type="button" title="Download selected file" aria-label={`Download ${file.name}`} onClick={() => downloadResource({ file })}><ClassicIcon name="download" /></button>
                          <button type="button" title="Remove file" aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))} disabled={busy}><ClassicIcon name="trash" /></button>
                        </span>
                      </div>
                    ))}
                    <button className="products-resource-remove-all" type="button" onClick={() => { setAttachments([]); setPendingFiles([]); }} disabled={busy}><ClassicIcon name="trash" /> Remove all uploaded files</button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="products-field products-field--wide">
            <span>Product Image</span>
            {!image.previewUrl ? (canUploadImage ? (
              <div className="products-upload-field">
                <input ref={fileRef} className="products-upload-field__input" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
                <button type="button" className="products-upload-field__picker" onClick={() => fileRef.current?.click()} disabled={busy || imageBusy}>
                  <span className="products-upload-field__icon"><ClassicIcon name="upload" /></span>
                  <span className="products-upload-field__copy"><b>{imageBusy ? "Preparing image…" : "Choose product image"}</b><small>PNG, JPG or WEBP · maximum 10 MB</small></span>
                  <span className="products-upload-field__action">Browse</span>
                </button>
              </div> ) : <small>Image changes are not allowed.</small>
            ) : (
              <div className="products-upload-file">
                <span className="products-upload-file__thumb"><img src={image.previewUrl} alt="Product preview" /></span>
                <span className="products-upload-file__info"><b>{image.name || "Product image"}</b><small>{image.size ? `${image.type} · ${fileSize(image.size)}` : "Saved image"}</small></span>
                <button type="button" className="products-upload-file__open" onClick={() => window.open(image.previewUrl, "_blank", "noopener,noreferrer")} aria-label="Open image"><ClassicIcon name="eye" /></button>
                {canUploadImage ? <button type="button" className="products-upload-file__remove" onClick={removeImage} disabled={busy} aria-label="Remove image">×</button> : null}
                {canUploadImage ? <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} hidden /> : null}
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

export function ProductFilesViewer({ product, onClose }) {
  return (
    <div className="products-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="products-modal products-files-viewer" role="dialog" aria-modal="true" aria-label="Product files">
        <button type="button" className="products-modal__close" onClick={onClose} aria-label="Close"><span aria-hidden="true">×</span></button>
        <h2>{product?.name || "Product"} — Files</h2>
        <div className="products-resource-list">
          {(product?.attachments || []).map((entry) => <a key={entry.url} className="products-resource-file" href={entry.url} target="_blank" rel="noopener noreferrer" title={`Open ${entry.name}`}>
            <span className="products-resource-file__icon"><ClassicIcon name="file" /></span>
            <span className="products-resource-file__details"><b>{entry.name}</b><small>{fileSize(entry.size)}</small></span>
            <span className="products-resource-file__download"><ClassicIcon name="download" /></span>
          </a>)}
        </div>
      </section>
    </div>
  );
}
