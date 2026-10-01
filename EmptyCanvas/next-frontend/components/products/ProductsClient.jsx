"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ProductModal = dynamic(() => import("./ProductsDialogs").then((module) => module.ProductModal), { ssr: false });
const TagModal = dynamic(() => import("./ProductsDialogs").then((module) => module.TagModal), { ssr: false });
const ProductImageViewer = dynamic(() => import("./ProductsDialogs").then((module) => module.ProductImageViewer), { ssr: false });

function preloadProductsDialogs() {
  void import("./ProductsDialogs");
}

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

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/")) return url;
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

function ClassicIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>,
    tag: <><path d="M20.59 13.41L11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    "plus-circle": <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    chevron: <polyline points="6 9 12 15 18 9" />,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
    package: <><path d="M16.5 9.4L7.5 4.2" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></>,
    unit: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  };
  return <svg {...common}>{paths[name] || paths.package}</svg>;
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

function ProductCard({ product, menuOpen, onMenu, onEdit, onDelete, onImage }) {
  const proxyImageUrl = product.id ? `/next/api/products/image?id=${encodeURIComponent(product.id)}` : "";
  const primaryImageUrl = product.imageUrl || proxyImageUrl;
  const [imagePreviewUrl, setImagePreviewUrl] = useState(primaryImageUrl);
  const [imageFailed, setImageFailed] = useState(!primaryImageUrl);

  useEffect(() => {
    setImagePreviewUrl(primaryImageUrl);
    setImageFailed(!primaryImageUrl);
  }, [primaryImageUrl]);

  const imageError = () => {
    // Stored Supabase images should load directly in the browser. If an old or
    // unavailable object still fails, use the server-side resolver once so it
    // can try the product page preview. This keeps hundreds of cards from
    // creating hundreds of Supabase lookups/proxy requests at the same time.
    if (imagePreviewUrl !== proxyImageUrl && proxyImageUrl) {
      setImagePreviewUrl(proxyImageUrl);
      return;
    }
    setImageFailed(true);
  };

  const canOpenImage = !!imagePreviewUrl && !imageFailed;
  return (
    <article className="product-card">
      <button type="button" className={`product-card__media ${canOpenImage ? "" : "is-fallback"}`} onClick={() => canOpenImage && onImage(imagePreviewUrl, product.name)} disabled={!canOpenImage} aria-label={canOpenImage ? `Open ${product.name} image` : "No product image"}>
        {canOpenImage ? <img className="product-card__image" src={imagePreviewUrl} alt={product.name} loading="lazy" onError={imageError} /> : null}
        <div className="product-card__image-fallback"><ClassicIcon name="package" /></div>
      </button>
      <div className="product-card__content">
        <div className="product-card__headline">
          <h4 title={product.name}>{product.name}</h4>
          <div className="product-card__menu-wrap" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="product-card__menu-btn" onClick={() => onMenu(product.id)} aria-label="Product actions" aria-expanded={menuOpen}><ClassicIcon name="more" /></button>
            <div className="product-card__menu" hidden={!menuOpen}>
              <button type="button" onClick={() => onEdit(product)}><ClassicIcon name="edit" /><span>Edit</span></button>
              <button type="button" className="is-danger" onClick={() => onDelete(product)}><ClassicIcon name="trash" /><span>Delete</span></button>
            </div>
          </div>
        </div>
        <div className="product-card__details"><span className="product-card__code">{product.displayId || "No ID"}</span></div>
        <div className="product-card__bottom">
          <div className="product-card__price-wrap"><strong className="product-card__price">{formatMoney(product.unitPrice)}</strong>{product.unit ? <span className="product-card__unit"><ClassicIcon name="unit" />{product.unit}</span> : null}</div>
          {product.url ? <a className="product-card__url" href={product.url} target="_blank" rel="noopener noreferrer" aria-label="Open product URL" title="Open product URL"><ClassicIcon name="external" /></a> : <span className="product-card__url is-disabled" title="No product URL"><ClassicIcon name="link" /></span>}
        </div>
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [productMenu, setProductMenu] = useState("");
  const [groupMenu, setGroupMenu] = useState("");
  const [modal, setModal] = useState(null);
  const [tagModal, setTagModal] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [toast, setToast] = useState(null);
  const filterRef = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search products...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  useEffect(() => {
    const closeMenus = (event) => {
      if (!event.target.closest(".products-tag-filter-wrap")) setFilterOpen(false);
      if (!event.target.closest(".product-card__menu-wrap")) setProductMenu("");
      if (!event.target.closest(".products-group-menu-wrap")) setGroupMenu("");
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const tags = useMemo(() => mergeUnique([...tagCatalog, ...products.map(firstTag)]), [tagCatalog, products]);

  const tagCounts = useMemo(() => {
    const map = new Map(tags.map((tag) => [tag, 0]));
    products.forEach((product) => map.set(firstTag(product), (map.get(firstTag(product)) || 0) + 1));
    return map;
  }, [products, tags]);

  const filteredProducts = useMemo(() => {
    const query = lower(search);
    return products.filter((product) => {
      if (activeTag !== "__all__" && firstTag(product) !== activeTag) return false;
      if (!query) return true;
      return lower([product.name, product.displayId, product.unit, product.unitPrice, product.url, firstTag(product)].join(" ")).includes(query);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTag, products, search]);

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

  const notify = (type, message) => {
    setToast({ type, title: "Products", message });
    window.setTimeout(() => setToast(null), 4200);
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
    setTagCatalog((current) => mergeUnique([...current, firstTag(normalized)]));
    notify("success", isEdit ? "Product updated successfully." : "Product added successfully.");
  };

  const deleteProduct = async (product) => {
    setProductMenu("");
    const { confirmDelete } = await import("../../lib/client-confirm");
    const confirmed = await confirmDelete({
      itemName: product.name,
      itemType: "product",
      title: "Delete product?",
      message: `You’re going to permanently delete “${product.name}”. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    try {
      await requestJson(`/next/api/products?id=${encodeURIComponent(product.id)}`, { method: "DELETE" });
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

  const deleteTag = async (tag) => {
    setGroupMenu("");
    if (!tag || lower(tag) === "uncategorized") return;
    const { confirmDelete } = await import("../../lib/client-confirm");
    const confirmed = await confirmDelete({
      itemName: tag,
      itemType: "tag",
      title: "Delete tag?",
      message: `Delete the tag “${tag}”? Products in this tag will move to Uncategorized and will not be deleted.`,
      confirmLabel: "Delete Tag",
    });
    if (!confirmed) return;
    try {
      await requestJson("/next/api/products/tags", { method: "DELETE", body: JSON.stringify({ tag }) });
      setProducts((current) => current.map((product) => firstTag(product) === tag ? { ...product, tags: ["Uncategorized"] } : product));
      setTagCatalog((current) => mergeUnique(current.filter((item) => lower(item) !== lower(tag)).concat("Uncategorized")));
      if (activeTag === tag) setActiveTag("__all__");
      notify("success", "Tag deleted and products moved to Uncategorized.");
    } catch (error) {
      notify("error", error?.message || "The tag could not be deleted.");
    }
  };

  const activeLabel = activeTag === "__all__" ? "All Products" : activeTag;
  const activeCount = activeTag === "__all__" ? products.length : (tagCounts.get(activeTag) || 0);

  return (
    <section className="products-shell next-products-classic-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some catalogue data may be temporarily unavailable.</strong><span>The loaded catalogue remains available while the missing resource recovers.</span></div> : null}

      <section className="products-filter-panel" aria-label="Product tag filter">
        <div className="products-tag-filter-wrap" ref={filterRef} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="products-tag-filter-btn" aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}>
            <span className="products-tag-filter-btn__icon"><ClassicIcon name="filter" /></span>
            <span className="products-tag-filter-btn__copy"><small>Filter by tag</small><strong>{activeLabel}</strong></span>
            <span className="products-tag-filter-btn__count">{activeCount}</span>
            <span className="products-tag-filter-btn__chevron"><ClassicIcon name="chevron" /></span>
          </button>
          <div className="products-tags" hidden={!filterOpen}>
            <button type="button" className="products-tag-option products-tag-option--add" onPointerEnter={preloadProductsDialogs} onFocus={preloadProductsDialogs} onClick={() => { preloadProductsDialogs(); setFilterOpen(false); setTagModal({ mode: "create", tag: "" }); }}>
              <span className="products-tag-option__icon"><ClassicIcon name="plus-circle" /></span><span><strong>Add New Tag</strong><small>Create a new product group</small></span><ClassicIcon name="plus" />
            </button>
            <button type="button" className={`products-tag-option ${activeTag === "__all__" ? "is-active" : ""}`} onClick={() => { setActiveTag("__all__"); setFilterOpen(false); }}>
              <span className="products-tag-option__icon"><ClassicIcon name="layers" /></span><span><strong>All Products</strong><small>{products.length.toLocaleString("en-EG")} products</small></span>{activeTag === "__all__" ? <ClassicIcon name="check" /> : null}
            </button>
            {tags.map((tag) => <button type="button" className={`products-tag-option ${activeTag === tag ? "is-active" : ""}`} onClick={() => { setActiveTag(tag); setFilterOpen(false); }} key={tag}><span className="products-tag-option__icon"><ClassicIcon name="tag" /></span><span><strong>{tag}</strong><small>{(tagCounts.get(tag) || 0).toLocaleString("en-EG")} products</small></span>{activeTag === tag ? <ClassicIcon name="check" /> : null}</button>)}
          </div>
        </div>
      </section>

      <section className="products-results" aria-live="polite">
        {!groupedProducts.length ? (
          <div className="products-empty"><strong>Sorry, No data available</strong><span>{search ? "No products match your search." : "Create a tag first, then add products to it."}</span></div>
        ) : groupedProducts.map((group) => (
          <section className="products-group" key={group.tag}>
            <header className="products-group__head">
              <div className="products-group__title"><span className="products-group__icon"><ClassicIcon name="layers" /></span><div><h3 title={group.tag}>{group.tag}</h3></div></div>
              <div className="products-group__metrics">
                <button type="button" className="products-group-add-product" onPointerEnter={preloadProductsDialogs} onFocus={preloadProductsDialogs} onClick={() => { preloadProductsDialogs(); setModal({ product: null, tag: group.tag }); }}><ClassicIcon name="plus-circle" /><span>Add Product</span></button>
                <div className="products-group-menu-wrap" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="products-group-menu-btn" onClick={() => setGroupMenu((value) => value === group.tag ? "" : group.tag)} aria-label="Tag actions" aria-expanded={groupMenu === group.tag}><ClassicIcon name="more" /></button>
                  <div className="products-group-menu" hidden={groupMenu !== group.tag}>
                    <button type="button" onClick={() => { preloadProductsDialogs(); setGroupMenu(""); setTagModal({ mode: "edit", tag: group.tag }); }}><ClassicIcon name="edit" /><span>Edit Tag</span></button>
                    {lower(group.tag) !== "uncategorized" ? <button type="button" className="is-danger" onClick={() => deleteTag(group.tag)}><ClassicIcon name="trash" /><span>Delete Tag</span></button> : null}
                  </div>
                </div>
              </div>
            </header>
            <div className={`products-grid ${group.items.length ? "" : "is-empty"}`}>
              {group.items.length ? group.items.map((product) => <ProductCard product={product} menuOpen={productMenu === product.id} onMenu={(id) => setProductMenu((value) => value === id ? "" : id)} onEdit={(item) => { preloadProductsDialogs(); setProductMenu(""); setModal({ product: item, tag: firstTag(item) }); }} onDelete={deleteProduct} onImage={(url, name) => { preloadProductsDialogs(); setImageViewer({ url, name }); }} key={product.id} />) : <div className="products-group-empty"><span className="products-group-empty__icon"><ClassicIcon name="package" /></span><div><strong>No products in this tag yet</strong><small>Use Add Product to create the first product in this group.</small></div></div>}
            </div>
          </section>
        ))}
      </section>

      {modal ? <ProductModal product={modal.product} activeTag={modal.tag || activeTag} tags={tags} units={unitCatalog} onClose={() => setModal(null)} onSaved={productSaved} onUnitAdded={(unit) => setUnitCatalog((current) => mergeUnique([...current, unit]))} /> : null}
      {tagModal ? <TagModal mode={tagModal.mode} tag={tagModal.tag} onClose={() => setTagModal(null)} onSaved={tagSaved} /> : null}
      {imageViewer ? <ProductImageViewer image={imageViewer} onClose={() => setImageViewer(null)} /> : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
