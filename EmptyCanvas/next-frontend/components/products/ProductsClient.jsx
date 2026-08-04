"use client";

import { useMemo, useRef, useState } from "react";

const DEFAULT_UNITS = ["Piece", "Pack", "Kilogram", "Metre", "Inch"];

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

function formatMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function fileSize(bytes) {
  const size = number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function mergeUnique(values) {
  const map = new Map();
  for (const value of values || []) {
    const clean = text(value);
    const key = lower(clean);
    if (clean && !map.has(key)) map.set(key, clean);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? null : number(product.unitPrice),
    unit: text(product?.unit),
    url: normalizedUrl(product?.url),
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
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

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function prepareProductImage(file) {
  if (!file || !/^image\//i.test(text(file.type))) throw new Error("Choose a valid image file.");
  if (number(file.size) > 10 * 1024 * 1024) throw new Error("Product image must not exceed 10 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("The selected image could not be opened."));
      candidate.src = objectUrl;
    });

    const longest = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const scale = Math.min(1, 1800 / longest);
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.86;
    let blob = await canvasBlob(canvas, "image/webp", quality);
    while (blob && blob.size > 1.7 * 1024 * 1024 && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, "image/webp", quality);
    }
    if (!blob) throw new Error("The selected image could not be compressed.");

    const dataUrl = await blobToDataUrl(blob);
    return {
      dataUrl,
      name: `${text(file.name).replace(/\.[^.]+$/, "") || "product-image"}.webp`,
      type: "image/webp",
      size: blob.size,
      previewUrl: dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "Products"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function ProductImage({ product, onOpen }) {
  if (!product.imageUrl) {
    return <div className="next-product-image next-product-image--empty"><span>▧</span><small>No image</small></div>;
  }
  return (
    <button className="next-product-image" type="button" onClick={() => onOpen(product.imageUrl, product.name)} aria-label={`Open ${product.name} image`}>
      <img src={product.imageUrl} alt="" loading="lazy" />
    </button>
  );
}

function ProductModal({ product, activeTag, tags, units, onClose, onSaved, onUnitAdded }) {
  const isEdit = !!product?.id;
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
    previewUrl: product?.imageUrl || "",
    name: product?.imageUrl ? "Current product image" : "",
    type: "",
    size: 0,
    removed: false,
  }));
  const [newUnit, setNewUnit] = useState("");
  const [showUnitInput, setShowUnitInput] = useState(false);
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
      const prepared = await prepareProductImage(file);
      setImage((current) => {
        if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
        return { ...prepared, removed: false };
      });
    } catch (imageError) {
      setError(imageError?.message || "The image could not be prepared.");
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = () => {
    setImage((current) => {
      if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
      return { dataUrl: "", previewUrl: "", name: "", type: "", size: 0, removed: !!product?.imageUrl };
    });
  };

  const addUnit = async () => {
    const name = text(newUnit);
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const body = await requestJson("/api/products/units", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const savedUnit = text(body?.unit) || name;
      onUnitAdded(savedUnit);
      update("unit", savedUnit);
      setNewUnit("");
      setShowUnitInput(false);
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
      const payload = {
        name,
        idCode: text(form.idCode) || null,
        unitPrice: text(form.unitPrice) === "" ? null : number(form.unitPrice),
        unit: text(form.unit) || null,
        tags: text(form.tag) || null,
        url: text(form.url) || null,
        imageData: image.dataUrl || null,
        imageName: image.name || null,
        imageType: image.type || null,
        removeImage: !!image.removed,
      };
      const endpoint = isEdit ? `/api/products/${encodeURIComponent(product.id)}` : "/api/products";
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
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="next-product-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-form-title">
        <header>
          <div><span className="pill">Product catalogue</span><h2 id="product-form-title">{isEdit ? "Edit product" : "Add product"}</h2><p>{isEdit ? "Update the selected product record." : "Create a new item in the product catalogue."}</p></div>
          <button className="next-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>

        <div className="next-product-modal__body">
          <div className="next-product-form-grid">
            <label className="product-field product-field--wide"><span>Product name <em>*</em></span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Example: Arduino Nano Type-C USB" autoFocus /></label>
            <label className="product-field"><span>ID code</span><input value={form.idCode} onChange={(event) => update("idCode", event.target.value)} placeholder="A100217" /></label>
            <label className="product-field"><span>Unit price</span><div className="product-price-field"><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => update("unitPrice", event.target.value)} placeholder="0.00" /><b>EGP</b></div></label>
            <label className="product-field"><span>Tag</span><select value={form.tag} onChange={(event) => update("tag", event.target.value)}><option value="">Uncategorized</option>{tags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select></label>
            <div className="product-field"><span>Unit of measurement</span><div className="product-unit-row"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}><option value="">No unit</option>{units.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select><button type="button" onClick={() => setShowUnitInput((value) => !value)} aria-label="Add unit">+</button></div>{showUnitInput ? <div className="product-new-unit"><input value={newUnit} onChange={(event) => setNewUnit(event.target.value)} placeholder="New unit" /><button type="button" onClick={addUnit} disabled={busy || !text(newUnit)}>Add</button></div> : null}</div>
            <label className="product-field product-field--wide"><span>Product URL</span><input type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://supplier.com/product" /></label>
          </div>

          <div className="product-image-editor">
            <div><span>Product image</span><small>Images are compressed before upload to keep the page fast.</small></div>
            <div className="product-image-editor__content">
              {image.previewUrl ? <img src={image.previewUrl} alt="Product preview" /> : <span className="product-image-placeholder">▧</span>}
              <div><strong>{image.name || "No image selected"}</strong><small>{imageBusy ? "Preparing image…" : image.size ? `${image.type} · ${fileSize(image.size)}` : image.previewUrl ? "Saved image" : "PNG, JPG or WEBP · maximum 10 MB"}</small><div className="product-image-actions"><button type="button" onClick={() => fileRef.current?.click()} disabled={busy || imageBusy}>{image.previewUrl ? "Replace" : "Choose image"}</button>{image.previewUrl ? <button className="danger-link" type="button" onClick={removeImage} disabled={busy}>Remove</button> : null}</div></div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} hidden />
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy || imageBusy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Add product"}</button></footer>
      </form>
    </div>
  );
}

function TagModal({ mode, tag, onClose, onSaved }) {
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
      const body = await requestJson("/api/products/tags", {
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
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="next-tag-modal" onSubmit={submit} role="dialog" aria-modal="true">
        <header><div><span className="pill">Product tag</span><h2>{mode === "edit" ? "Rename tag" : "Add tag"}</h2><p>{mode === "edit" ? `All products under “${tag}” will move to the new name.` : "Create a new product group."}</p></div><button className="next-modal-close" type="button" onClick={onClose} disabled={busy}>×</button></header>
        <div className="next-tag-modal__body"><label className="product-field"><span>Tag name <em>*</em></span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>{error ? <p className="form-error">{error}</p> : null}</div>
        <footer><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : mode === "edit" ? "Rename tag" : "Add tag"}</button></footer>
      </form>
    </div>
  );
}

function ProductCard({ product, onEdit, onDelete, onImage }) {
  return (
    <article className="next-product-card">
      <ProductImage product={product} onOpen={onImage} />
      <div className="next-product-card__body">
        <div className="next-product-card__title"><div><span>{product.displayId || "No ID code"}</span><h3>{product.name}</h3></div><div className="next-product-card__actions"><button type="button" onClick={() => onEdit(product)} title="Edit product">✎</button><button className="danger" type="button" onClick={() => onDelete(product)} title="Delete product">×</button></div></div>
        <div className="next-product-card__meta"><span>{product.unit || "No unit"}</span><strong>{formatMoney(product.unitPrice)}</strong></div>
        <footer>{product.url ? <a href={product.url} target="_blank" rel="noreferrer">Open supplier link ↗</a> : <span>No supplier link</span>}<em>{firstTag(product)}</em></footer>
      </div>
    </article>
  );
}

export default function ProductsClient({ initialCatalog = {}, bootstrapWarnings = [] }) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [tagCatalog, setTagCatalog] = useState(() => mergeUnique(initialCatalog?.tagsCatalog || []));
  const [unitCatalog, setUnitCatalog] = useState(() => mergeUnique([...(initialCatalog?.unitsCatalog || []), ...DEFAULT_UNITS]));
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("__all__");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("name");
  const [modal, setModal] = useState(null);
  const [tagModal, setTagModal] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const tags = useMemo(() => mergeUnique([
    ...tagCatalog,
    ...products.map(firstTag),
  ]), [tagCatalog, products]);

  const tagCounts = useMemo(() => {
    const map = new Map(tags.map((tag) => [tag, 0]));
    products.forEach((product) => map.set(firstTag(product), (map.get(firstTag(product)) || 0) + 1));
    return map;
  }, [products, tags]);

  const filteredProducts = useMemo(() => {
    const query = lower(search);
    const list = products.filter((product) => {
      if (activeTag !== "__all__" && firstTag(product) !== activeTag) return false;
      if (!query) return true;
      return lower([product.name, product.displayId, product.unit, product.unitPrice, product.url, firstTag(product)].join(" ")).includes(query);
    });
    return [...list].sort((a, b) => {
      if (sort === "price-high") return number(b.unitPrice) - number(a.unitPrice) || a.name.localeCompare(b.name);
      if (sort === "price-low") return number(a.unitPrice) - number(b.unitPrice) || a.name.localeCompare(b.name);
      if (sort === "id") return (a.displayId || "zzzz").localeCompare(b.displayId || "zzzz") || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [activeTag, products, search, sort]);

  const groupedProducts = useMemo(() => {
    const map = new Map();
    if (activeTag === "__all__" && !search) tags.forEach((tag) => map.set(tag, []));
    filteredProducts.forEach((product) => {
      const tag = firstTag(product);
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(product);
    });
    return [...map.entries()].map(([tag, items]) => ({ tag, items })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [activeTag, filteredProducts, search, tags]);

  const stats = useMemo(() => {
    const priced = products.filter((product) => Number.isFinite(Number(product.unitPrice)) && product.unitPrice !== null);
    const imageCount = products.filter((product) => product.imageUrl).length;
    const average = priced.length ? priced.reduce((sum, product) => sum + number(product.unitPrice), 0) / priced.length : 0;
    return { total: products.length, tags: tags.length, imageCount, average };
  }, [products, tags]);

  const notify = (type, message) => {
    setToast({ type, title: "Products", message });
    window.setTimeout(() => setToast(null), 4200);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const body = await requestJson(`/api/products?_fresh=1&_ts=${Date.now()}`);
      setProducts((Array.isArray(body.products) ? body.products : []).map(normalizeProduct));
      setTagCatalog(mergeUnique(body.tagsCatalog || []));
      setUnitCatalog(mergeUnique([...(body.unitsCatalog || []), ...DEFAULT_UNITS]));
      notify("success", "Product catalogue refreshed.");
    } catch (error) {
      notify("error", error?.message || "The product catalogue could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const productSaved = (savedProduct, isEdit) => {
    const normalized = normalizeProduct(savedProduct || {});
    setProducts((current) => {
      const index = current.findIndex((item) => item.id === normalized.id);
      if (index < 0) return [normalized, ...current];
      const next = [...current];
      next[index] = normalized;
      return next;
    });
    const savedTag = firstTag(normalized);
    setTagCatalog((current) => mergeUnique([...current, savedTag]));
    notify("success", isEdit ? "Product updated successfully." : "Product added successfully.");
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete “${product.name}”? This action cannot be undone.`)) return;
    try {
      await requestJson(`/api/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      setProducts((current) => current.filter((item) => item.id !== product.id));
      notify("success", "Product deleted successfully.");
    } catch (error) {
      notify("error", error?.message || "The product could not be deleted.");
    }
  };

  const tagSaved = async (name, body) => {
    if (tagModal?.mode === "edit") {
      const oldTag = tagModal.tag;
      setProducts((current) => current.map((product) => firstTag(product) === oldTag ? { ...product, tags: [name] } : product));
      setTagCatalog((current) => mergeUnique(current.filter((item) => lower(item) !== lower(oldTag)).concat(name)));
      setActiveTag(name);
      notify("success", `Tag updated for ${number(body?.updatedCount).toLocaleString("en-EG")} products.`);
    } else {
      setTagCatalog((current) => mergeUnique([...current, name]));
      setActiveTag(name);
      notify("success", "Tag added successfully.");
    }
  };

  const deleteTag = async () => {
    if (activeTag === "__all__" || lower(activeTag) === "uncategorized") return;
    if (!window.confirm(`Delete the tag “${activeTag}”? Products in this tag will move to Uncategorized.`)) return;
    const removedTag = activeTag;
    try {
      await requestJson("/api/products/tags", { method: "DELETE", body: JSON.stringify({ tag: removedTag }) });
      setProducts((current) => current.map((product) => firstTag(product) === removedTag ? { ...product, tags: ["Uncategorized"] } : product));
      setTagCatalog((current) => mergeUnique(current.filter((item) => lower(item) !== lower(removedTag)).concat("Uncategorized")));
      setActiveTag("__all__");
      notify("success", "Tag deleted and products moved to Uncategorized.");
    } catch (error) {
      notify("error", error?.message || "The tag could not be deleted.");
    }
  };

  return (
    <section className="next-products-page">
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some catalogue data may be temporarily unavailable.</strong><span>The classic Products page remains available while the resource recovers.</span><a href="/products">Open classic Products</a></div> : null}

      <section className="products-next-hero">
        <div><span className="pill">Product master data</span><h2>Catalogue, pricing, tags, and supplier links</h2><p>Manage the product records used by orders, stocktaking, kits, and quotations from one fast workspace.</p><div className="products-next-hero__actions"><button className="primary-button" type="button" onClick={() => setModal({ product: null, tag: activeTag })}>+ Add product</button><button className="secondary-button" type="button" onClick={() => setTagModal({ mode: "create", tag: "" })}>+ Add tag</button><a className="secondary-button" href="/proposals">Open proposals</a></div></div>
        <div className="products-next-stats"><article><span>Products</span><strong>{stats.total.toLocaleString("en-EG")}</strong><small>Catalogue records</small></article><article><span>Tags</span><strong>{stats.tags.toLocaleString("en-EG")}</strong><small>Product groups</small></article><article><span>Images</span><strong>{stats.imageCount.toLocaleString("en-EG")}</strong><small>Products with photos</small></article><article><span>Average price</span><strong>{formatMoney(stats.average)}</strong><small>Priced products</small></article></div>
      </section>

      <section className="products-next-toolbar">
        <label className="products-next-search"><span>⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products, IDs, tags, units, or supplier links…" />{search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button> : null}</label>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option value="name">Sort: Name</option><option value="id">Sort: ID code</option><option value="price-low">Price: Low to high</option><option value="price-high">Price: High to low</option></select>
        <div className="products-next-view"><button className={view === "grid" ? "active" : ""} type="button" onClick={() => setView("grid")}>Grid</button><button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")}>Table</button></div>
        <button className="secondary-button" type="button" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      </section>

      <section className="products-next-tags" aria-label="Product tag filter">
        <button className={activeTag === "__all__" ? "active" : ""} type="button" onClick={() => setActiveTag("__all__")}><span>All products</span><b>{products.length}</b></button>
        {tags.map((tag) => <button className={activeTag === tag ? "active" : ""} type="button" onClick={() => setActiveTag(tag)} key={tag}><span>{tag}</span><b>{tagCounts.get(tag) || 0}</b></button>)}
      </section>

      <div className="products-next-results-line"><span>{filteredProducts.length.toLocaleString("en-EG")} of {products.length.toLocaleString("en-EG")} products</span><div>{activeTag !== "__all__" ? <><button type="button" onClick={() => setTagModal({ mode: "edit", tag: activeTag })}>Rename tag</button>{lower(activeTag) !== "uncategorized" ? <button className="danger-link" type="button" onClick={deleteTag}>Delete tag</button> : null}</> : null}<a href="/products">Open classic Products</a></div></div>

      {!filteredProducts.length ? (
        <div className="products-next-empty"><span>□</span><h2>No matching products</h2><p>{search ? "Try another name, code, tag, or supplier link." : "This tag does not contain products yet."}</p><button className="primary-button" type="button" onClick={() => setModal({ product: null, tag: activeTag })}>Add product</button></div>
      ) : view === "table" ? (
        <div className="products-next-table-wrap"><table className="products-next-table"><thead><tr><th>Product</th><th>ID code</th><th>Tag</th><th>Unit</th><th className="number-cell">Unit price</th><th>Supplier</th><th aria-label="Actions" /></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><div className="products-next-table-product">{product.imageUrl ? <button type="button" onClick={() => setImageViewer({ url: product.imageUrl, name: product.name })}><img src={product.imageUrl} alt="" /></button> : <span>▧</span>}<strong>{product.name}</strong></div></td><td>{product.displayId || "—"}</td><td><em>{firstTag(product)}</em></td><td>{product.unit || "—"}</td><td className="number-cell"><strong>{formatMoney(product.unitPrice)}</strong></td><td>{product.url ? <a href={product.url} target="_blank" rel="noreferrer">Open ↗</a> : "—"}</td><td><div className="products-next-row-actions"><button type="button" onClick={() => setModal({ product, tag: firstTag(product) })}>Edit</button><button className="danger" type="button" onClick={() => deleteProduct(product)}>Delete</button></div></td></tr>)}</tbody></table></div>
      ) : (
        <div className="products-next-groups">{groupedProducts.map((group) => <section className="products-next-group" key={group.tag}><header><div><span>Tag</span><h3>{group.tag}</h3></div><div><b>{group.items.length.toLocaleString("en-EG")} products</b><button type="button" onClick={() => setModal({ product: null, tag: group.tag })}>+ Add product</button></div></header>{group.items.length ? <div className="products-next-grid">{group.items.map((product) => <ProductCard product={product} onEdit={(item) => setModal({ product: item, tag: firstTag(item) })} onDelete={deleteProduct} onImage={(url, name) => setImageViewer({ url, name })} key={product.id} />)}</div> : <div className="products-next-group-empty"><span>No products in this tag.</span><button type="button" onClick={() => setModal({ product: null, tag: group.tag })}>Add first product</button></div>}</section>)}</div>
      )}

      {modal ? <ProductModal product={modal.product} activeTag={modal.tag || activeTag} tags={tags} units={unitCatalog} onClose={() => setModal(null)} onSaved={productSaved} onUnitAdded={(unit) => setUnitCatalog((current) => mergeUnique([...current, unit]))} /> : null}
      {tagModal ? <TagModal mode={tagModal.mode} tag={tagModal.tag} onClose={() => setTagModal(null)} onSaved={tagSaved} /> : null}
      {imageViewer ? <div className="next-modal-backdrop product-image-viewer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setImageViewer(null)}><section role="dialog" aria-modal="true"><header><strong>{imageViewer.name}</strong><button type="button" onClick={() => setImageViewer(null)}>×</button></header><img src={imageViewer.url} alt={imageViewer.name} /></section></div> : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
