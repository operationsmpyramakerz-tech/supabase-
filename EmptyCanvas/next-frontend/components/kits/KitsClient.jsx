"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDelete } from "../../lib/client-confirm";

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(number(value));
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

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

const FEATHER_PATHS = {
  briefcase: [
    <rect key="r" x="3" y="7" width="18" height="13" rx="2" ry="2" />,
    <path key="p1" d="M8 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16" />,
    <path key="p2" d="M3 11h18" />,
  ],
  edit: [
    <path key="p1" d="M12 20h9" />,
    <path key="p2" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  ],
  copy: [
    <rect key="r" x="9" y="9" width="13" height="13" rx="2" ry="2" />,
    <path key="p" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />,
  ],
  trash: [
    <polyline key="pl" points="3 6 5 6 21 6" />,
    <path key="p1" d="M19 6l-1 14H6L5 6" />,
    <path key="p2" d="M10 11v6M14 11v6M9 6V4h6v2" />,
  ],
  arrowLeft: [<line key="l" x1="19" y1="12" x2="5" y2="12" />, <polyline key="p" points="12 19 5 12 12 5" />],
  plusCircle: [<circle key="c" cx="12" cy="12" r="10" />, <path key="p" d="M12 8v8M8 12h8" />],
  plus: [<path key="p" d="M12 5v14M5 12h14" />],
  minus: [<path key="p" d="M5 12h14" />],
  chevronDown: [<polyline key="p" points="6 9 12 15 18 9" />],
  search: [<circle key="c" cx="11" cy="11" r="8" />, <line key="l" x1="21" y1="21" x2="16.65" y2="16.65" />],
  externalLink: [
    <path key="p1" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
    <polyline key="p2" points="15 3 21 3 21 9" />,
    <line key="l" x1="10" y1="14" x2="21" y2="3" />,
  ],
  save: [
    <path key="p1" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />,
    <polyline key="p2" points="17 21 17 13 7 13 7 21" />,
    <polyline key="p3" points="7 3 7 8 15 8" />,
  ],
  eye: [<path key="p" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />, <circle key="c" cx="12" cy="12" r="3" />],
  merge: [<circle key="c1" cx="18" cy="18" r="3" />, <circle key="c2" cx="6" cy="6" r="3" />, <path key="p" d="M6 21V9a9 9 0 0 0 9 9" />],
};

function FeatherIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FEATHER_PATHS[name] || FEATHER_PATHS.briefcase}
    </svg>
  );
}

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId || product?.idCode || product?.id_code),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? null : number(product.unitPrice),
    unit: text(product?.unit),
    url: normalizedUrl(product?.url),
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    createdBy: text(kit?.createdBy),
    createdById: text(kit?.createdById),
    createdAt: text(kit?.createdAt),
    updatedAt: text(kit?.updatedAt),
    itemsCount: number(kit?.itemsCount),
    canEdit: kit?.canEdit === true,
  };
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    kitId: text(item?.kitId),
    productId: text(item?.productId),
    productName: text(item?.productName) || "Untitled product",
    quantity: Math.max(1, Math.round(number(item?.quantity) || 1)),
    createdAt: text(item?.createdAt),
    updatedAt: text(item?.updatedAt),
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
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-proposals-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Kits"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, icon = "◆", children, onClose, wide = false }) {
  return (
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="products-modal__close" onClick={onClose} aria-label="Close"><span aria-hidden="true">×</span></button>
        <div className="products-modal__header">
          <div className="products-modal__icon" aria-hidden="true">{icon}</div>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        <div className="next-proposals-modal__body">{children}</div>
      </section>
    </div>
  );
}

function NameModal({ dialog, busy, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.value || "");
  const [error, setError] = useState("");
  const labels = {
    create: ["Create New Kit", "Create a reusable collection of products and quantities.", "Create Kit"],
    copy: ["Copy Kit", "Create an independent copy with all saved components.", "Create Copy"],
    rename: ["Rename Kit", "Change the folder name without changing its components.", "Save Name"],
  };
  const [title, subtitle, action] = labels[dialog?.mode] || labels.create;

  const submit = async (event) => {
    event.preventDefault();
    const name = text(value);
    if (!name) return setError("Kit name is required.");
    setError("");
    try {
      await onSubmit(name);
    } catch (submitError) {
      setError(submitError?.message || "The kit could not be saved.");
    }
  };

  return (
    <Modal title={title} subtitle={subtitle} icon="▣" onClose={onClose}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Kit Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: Arduino starter kit" /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Saving…" : action}</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ request, busy, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await requestJson("/api/products/admin/verify", { method: "POST", body: JSON.stringify({ password }) });
      onVerified(text(password));
    } catch (verifyError) {
      setError(verifyError?.message || "Invalid Admin password.");
    }
  };

  return (
    <Modal title={request?.title || "Admin password required"} subtitle={request?.message || "Enter the Admin password to continue."} icon="⌾" onClose={onClose}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Admin Password *</span><input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CombineKitsModal({ kits, busy, onClose, onCreate }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const selectedKits = useMemo(() => selectedIds.map((id) => kits.find((kit) => kit.id === id)).filter(Boolean), [kits, selectedIds]);

  const toggleKit = (kit) => {
    setError("");
    if (selectedIds.includes(kit.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== kit.id));
      return;
    }
    if (selectedIds.length >= 2) return;
    const next = [...selectedIds, kit.id];
    setSelectedIds(next);
    if (next.length === 2 && !text(name)) {
      const names = next.map((id) => kits.find((entry) => entry.id === id)?.name).filter(Boolean);
      if (names.length === 2) setName(`${names[0]} + ${names[1]}`);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanName = text(name);
    if (selectedIds.length !== 2) return setError("Select exactly two kits to combine.");
    if (!cleanName) return setError("Combined kit name is required.");
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await onCreate({ kitIds: selectedIds, name: cleanName, password: text(password) });
    } catch (submitError) {
      setError(submitError?.message || "The combined kit could not be created.");
    }
  };

  return (
    <Modal title="Combined Kits" subtitle="Select exactly two kits. Duplicate components will be merged and their quantities added together." icon={<FeatherIcon name="merge" size={20} />} onClose={onClose} wide>
      <form className="next-kit-combine-form" onSubmit={submit}>
        <div className="next-kit-combine-headline">
          <div><span>Selected kits</span><strong>{selectedIds.length} / 2</strong></div>
          <p>The source kits stay unchanged. A new independent kit will be created.</p>
        </div>

        <div className="next-kit-combine-list" role="group" aria-label="Choose two kits">
          {kits.map((kit) => {
            const selected = selectedIds.includes(kit.id);
            const disabled = !selected && selectedIds.length >= 2;
            return (
              <button type="button" key={kit.id} className={selected ? "is-selected" : ""} disabled={disabled || busy} onClick={() => toggleKit(kit)}>
                <span className="next-kit-combine-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                <span className="next-kit-combine-copy"><strong>{kit.name}</strong><small>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"} · Created by {kit.createdBy || "—"}</small></span>
              </button>
            );
          })}
        </div>

        {selectedKits.length === 2 ? (
          <div className="next-kit-combine-preview">
            <FeatherIcon name="merge" size={18} />
            <div><strong>{selectedKits[0].name}</strong><span>+</span><strong>{selectedKits[1].name}</strong></div>
          </div>
        ) : null}

        <div className="products-form-grid next-kit-combine-fields">
          <label className="products-field products-field--wide"><span>Combined Kit Name <em>*</em></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: TH1 + TH2 Combined Kit" autoComplete="off" /></label>
          <label className="products-field products-field--wide"><span>Admin Password <em>*</em></span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>

        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}

        <div className="products-modal__actions next-kit-combine-actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || selectedIds.length !== 2}>
            <FeatherIcon name="merge" size={17} /><span>{busy ? "Combining…" : "Create Combined Kit"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddProductModal({ kit, products, busy, onClose, onSubmit }) {
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const filteredProducts = useMemo(() => {
    const needle = lower(search);
    return products.filter((product) => !needle || [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle))).slice(0, 100);
  }, [products, search]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return setError("Choose a product.");
    setError("");
    try {
      await onSubmit({ productId: selected, quantity: Math.max(1, Math.round(number(quantity) || 1)) });
    } catch (submitError) {
      setError(submitError?.message || "The product could not be added.");
    }
  };

  return (
    <Modal title={`Add Product to ${kit.name}`} subtitle="Choose a catalogue product and the quantity stored in this reusable kit." icon="＋" onClose={onClose} wide>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Search Catalogue</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, ID code, tag or unit" /></label>
        <div className="next-proposals-product-picker">
          {filteredProducts.map((product) => (
            <button type="button" className={selected === product.id ? "active" : ""} onClick={() => setSelected(product.id)} key={product.id}>
              <span>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : "▧"}</span>
              <div><strong>{product.name}</strong><small>{product.displayId || firstTag(product)} · {product.unit || "No unit"}</small></div>
              <b>{formatMoney(product.unitPrice)}</b>
            </button>
          ))}
          {!filteredProducts.length ? <div className="next-proposals-empty-inline">No matching catalogue products.</div> : null}
        </div>
        <div className="next-proposals-form-grid products-form-grid">
          <label><span>Quantity *</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>Selected Product</span><input value={products.find((product) => product.id === selected)?.name || "No product selected"} readOnly /></label>
        </div>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Adding…" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function KitsClient({ account, initialCatalog, initialKits, bootstrapWarnings = [] }) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [combineOpen, setCombineOpen] = useState(false);
  const [detailEdit, setDetailEdit] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: "", items: "" });
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQty, setProductQty] = useState(1);
  const passwordResolver = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search kits...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder")) setFolderMenu("");
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setProductPickerOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setFolderMenu("");
      setProductPickerOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredKits = useMemo(() => {
    const needle = lower(search);
    return kits.filter((kit) => !needle || [kit.name, kit.createdBy].some((value) => lower(value).includes(needle)));
  }, [kits, search]);

  const filteredProducts = useMemo(() => {
    const needle = lower(productSearch);
    return products
      .filter((product) => !needle || [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle)))
      .slice(0, 120);
  }, [products, productSearch]);

  const enrichedRows = useMemo(() => {
    const items = Array.isArray(activeDetail?.items) ? activeDetail.items.map(normalizeItem) : [];
    return items.map((item) => {
      const product = productMap.get(item.productId) || null;
      const unitPrice = product?.unitPrice;
      return {
        ...item,
        product,
        displayId: product?.displayId || "",
        name: product?.name || item.productName,
        tag: product ? firstTag(product) : "Uncategorized",
        unit: product?.unit || "",
        unitPrice,
        totalPrice: Number.isFinite(Number(unitPrice)) ? Number(unitPrice) * item.quantity : null,
      };
    });
  }, [activeDetail, productMap]);

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

  const selectedProduct = selectedProductId ? productMap.get(selectedProductId) : null;

  const notify = (message, type = "success", title = "Kits") => {
    setToast({ message, type, title });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };

  const syncKit = (kit) => {
    const normalized = normalizeKit(kit);
    setKits((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setActiveDetail((current) => current?.kit?.id === normalized.id ? { ...current, kit: normalized } : current);
    return normalized;
  };

  const setDetailFromBody = (body) => {
    const kit = normalizeKit(body?.kit || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ kit, items });
    setEditName(kit.name || "");
    setKits((current) => current.map((entry) => entry.id === kit.id ? { ...kit, itemsCount: items.length } : entry));
    return { kit, items };
  };

  const resetDetailEditor = () => {
    setDetailEdit(false);
    setCreateMode(false);
    setEditAdminPassword("");
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setProductPickerOpen(false);
    setProductSearch("");
    setSelectedProductId("");
    setProductQty(1);
  };

  const backToKits = () => {
    setActiveDetail(null);
    resetDetailEditor();
  };

  const loadKit = async (kitId, options = {}) => {
    const edit = Boolean(options.edit);
    setFolderMenu("");
    setCreateMode(false);
    setDetailEdit(edit);
    if (Object.prototype.hasOwnProperty.call(options, "adminPassword")) setEditAdminPassword(options.adminPassword || "");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      setDetailFromBody(body);
      setDraftErrors({ name: "", items: "" });
    } catch (error) {
      notify(error?.message || "The kit could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshKits = async () => {
    try {
      const [kitBody, productBody] = await Promise.all([
        requestJson(`/next/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/next/api/products?_ts=${Date.now()}`),
      ]);
      setKits((kitBody.kits || []).map(normalizeKit));
      setProducts((productBody.products || []).map(normalizeProduct));
    } catch (error) {
      notify(error?.message || "The data could not be refreshed.", "error");
    }
  };

  const createCombinedKit = async ({ kitIds, name, password }) => {
    const ids = Array.isArray(kitIds) ? kitIds.map(text).filter(Boolean) : [];
    const cleanName = text(name);
    const adminPassword = text(password);
    if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error("Select exactly two different kits.");
    if (!cleanName) throw new Error("Combined kit name is required.");
    if (!adminPassword) throw new Error("Admin password is required.");

    setBusy(true);
    let createdId = "";
    try {
      await requestJson("/api/products/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });

      const sourceBodies = await Promise.all(ids.map((id) => requestJson(`/next/api/products/kits/${encodeURIComponent(id)}?_ts=${Date.now()}`)));
      const productIdByName = new Map(products.map((product) => [lower(product.name), product.id]));
      const merged = new Map();

      sourceBodies.forEach((body) => {
        (Array.isArray(body?.items) ? body.items : []).map(normalizeItem).forEach((item) => {
          const productId = text(item.productId) || productIdByName.get(lower(item.productName)) || "";
          if (!productId) throw new Error(`Could not match “${item.productName || "a component"}” to the Products catalogue.`);
          const current = merged.get(productId) || { productId, quantity: 0 };
          current.quantity += Math.max(1, number(item.quantity) || 1);
          merged.set(productId, current);
        });
      });

      if (!merged.size) throw new Error("The selected kits do not contain any components to combine.");

      const createdBody = await requestJson("/next/api/products/kits", {
        method: "POST",
        body: JSON.stringify({ name: cleanName, adminPassword }),
      });
      createdId = text(createdBody?.kit?.id);
      if (!createdId) throw new Error("The combined kit was created but its ID was not returned.");

      for (const row of merged.values()) {
        await requestJson(`/next/api/products/kits/${encodeURIComponent(createdId)}/items`, {
          method: "POST",
          body: JSON.stringify({ productId: row.productId, quantity: row.quantity, adminPassword }),
        });
      }

      await refreshKits();
      setCombineOpen(false);
      notify(`Combined kit “${cleanName}” created successfully.`);
    } catch (error) {
      if (createdId) {
        try {
          await requestJson(`/next/api/products/kits/${encodeURIComponent(createdId)}`, {
            method: "DELETE",
            body: JSON.stringify({ adminPassword }),
          });
        } catch {}
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const askPassword = ({ title, message }) => new Promise((resolve) => {
    passwordResolver.current = resolve;
    setPasswordRequest({ title, message });
  });

  const closePassword = () => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(null);
  };

  const verifyPassword = (password) => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(password);
  };

  const protectedPassword = async (kit, message) => {
    if (kit?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This kit belongs to another user." });
  };

  const startCreateKit = async () => {
    const adminPassword = await askPassword({
      title: "Create New Kit",
      message: "Enter the Admin password to create a new kit.",
    });
    if (adminPassword === null) return;
    const createdBy = text(account?.name || account?.fullName || account?.username || account?.email);
    setCreateMode(true);
    setDetailEdit(true);
    setEditAdminPassword(adminPassword);
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setActiveDetail({
      kit: normalizeKit({ name: "", createdBy, canEdit: true }),
      items: [],
    });
    setSelectedProductId("");
    setProductSearch("");
    setProductQty(1);
  };

  const enterEditKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to edit “${kit.name}”.`);
    if (adminPassword === null) return;
    setEditAdminPassword(adminPassword);
    await loadKit(kit.id, { edit: true, adminPassword });
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog || dialog.mode !== "copy") return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(dialog.kit.id)}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      syncKit(body.kit);
      setNameDialog(null);
      notify(`A copy named “${name}” was created.`);
    } catch (error) {
      notify(error?.message || "The kit copy could not be created.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to delete “${kit.name}”.`);
    if (adminPassword === null) return;
    const confirmed = await confirmDelete({
      itemName: kit.name,
      itemType: "kit",
      title: "Delete kit?",
      message: `You’re going to permanently delete “${kit.name}” and all saved components. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      setKits((current) => current.filter((item) => item.id !== kit.id));
      if (activeDetail?.kit?.id === kit.id) backToKits();
      notify("Kit deleted.");
    } catch (error) {
      notify(error?.message || "The kit could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addSelectedProduct = async () => {
    const product = productMap.get(selectedProductId);
    if (!product) {
      setDraftErrors((current) => ({ ...current, items: "Select a product first." }));
      return;
    }
    const quantity = Math.max(1, Math.round(number(productQty) || 1));
    if (createMode) {
      setActiveDetail((current) => {
        const items = Array.isArray(current?.items) ? [...current.items] : [];
        const existingIndex = items.findIndex((item) => text(item.productId) === product.id);
        if (existingIndex >= 0) {
          const existing = items[existingIndex];
          items[existingIndex] = { ...existing, quantity: Math.max(1, number(existing.quantity) + quantity), updatedAt: new Date().toISOString() };
        } else {
          items.push(normalizeItem({
            id: `draft-kit-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            productId: product.id,
            productName: product.name,
            quantity,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, items.length));
        }
        return { ...(current || {}), items };
      });
      setDraftErrors((current) => ({ ...current, items: "" }));
      setSelectedProductId("");
      setProductSearch("");
      setProductQty(1);
      setProductPickerOpen(false);
      notify("Product added to kit draft.");
      return;
    }

    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      setDraftErrors((current) => ({ ...current, items: "" }));
      setSelectedProductId("");
      setProductSearch("");
      setProductQty(1);
      setProductPickerOpen(false);
      notify("Product added to kit.");
    } catch (error) {
      notify(error?.message || "The product could not be added.", "error");
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = async (row, value) => {
    const quantity = Math.max(1, Math.round(number(value) || 1));
    if (quantity === row.quantity) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).map((item) => item.id === row.id ? { ...item, quantity, updatedAt: new Date().toISOString() } : item),
      }));
      notify("Quantity updated.");
      return;
    }
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      notify("Quantity updated.");
    } catch (error) {
      notify(error?.message || "The quantity could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (row) => {
    const confirmed = await confirmDelete({
      itemName: row.name,
      itemType: "component",
      title: "Remove component?",
      message: `Remove “${row.name}” from this kit? The product itself will stay in the Products catalogue.`,
      confirmLabel: "Remove Component",
    });
    if (!confirmed) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).filter((item) => item.id !== row.id),
      }));
      notify("Component removed.");
      return;
    }
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      notify("Component removed.");
    } catch (error) {
      notify(error?.message || "The component could not be removed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveKit = async () => {
    const cleanName = text(editName);
    const rows = Array.isArray(activeDetail?.items) ? activeDetail.items : [];
    const errors = {
      name: cleanName ? "" : "Kit name is required.",
      items: rows.length ? "" : createMode ? "Add at least one component before saving the kit." : "Add at least one component before saving changes.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.items) return;

    setBusy(true);
    try {
      if (createMode) {
        const createdBody = await requestJson("/next/api/products/kits", {
          method: "POST",
          body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
        });
        const created = normalizeKit({ ...(createdBody.kit || {}), canEdit: true });
        if (!created.id) throw new Error("Kit was created but the kit ID was not returned.");
        for (const row of rows) {
          if (!row.productId) continue;
          await requestJson(`/next/api/products/kits/${encodeURIComponent(created.id)}/items`, {
            method: "POST",
            body: JSON.stringify({ productId: row.productId, quantity: row.quantity, adminPassword: editAdminPassword }),
          });
        }
        await refreshKits();
        backToKits();
        notify("Kit saved successfully.");
        return;
      }

      const kit = activeDetail?.kit;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
      });
      const updated = normalizeKit(body.kit || { ...kit, name: cleanName });
      setActiveDetail((current) => current ? { ...current, kit: updated } : current);
      setKits((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
    } catch (error) {
      notify(error?.message || `Failed to ${createMode ? "create" : "update"} kit.`, "error");
    } finally {
      setBusy(false);
    }
  };

  if (activeDetail || detailBusy) {
    const kit = activeDetail?.kit;
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className={`products-proposal-detail ${createMode ? "is-create" : detailEdit ? "is-edit" : "is-view"}`}>
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading kit</strong></div>
                </div>
              ) : (
                <>
                  {createMode ? (
                    <header className="products-proposal-detail__head kit-create-label-head">
                      <div className="kit-create-title-pill">
                        <button type="button" className="products-back-btn" onClick={backToKits} aria-label="Back to kits"><FeatherIcon name="arrowLeft" /></button>
                        <span>Create New Kit</span>
                      </div>
                    </header>
                  ) : (
                    <header className="products-proposal-detail__head">
                      <button type="button" className="products-back-btn" onClick={backToKits} aria-label="Back to kits"><FeatherIcon name="arrowLeft" /></button>
                      <div>
                        <h2>{kit?.name || "Kit"}</h2>
                        <p>{formatNumber(enrichedRows.length)} saved component{enrichedRows.length === 1 ? "" : "s"}{detailEdit ? " • Edit mode" : " • View only"}</p>
                      </div>
                    </header>
                  )}

                  {detailEdit ? (
                    <>
                      <div className={`proposal-name-edit-block proposal-name-edit-block--footer-save ${createMode ? "proposal-name-edit-block--create proposal-name-edit-block--kit-create" : "proposal-name-edit-block--kit-edit"}`}>
                        <label className="products-field products-field--wide">
                          <span>Kit name <em>*</em></span>
                          <input
                            type="text"
                            value={editName}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              if (text(event.target.value)) setDraftErrors((current) => ({ ...current, name: "" }));
                            }}
                            autoComplete="off"
                            placeholder="Example: Arduino starter kit"
                          />
                        </label>
                        <div className="direct-create-inline-error direct-create-inline-error--name kit-create-inline-error kit-create-inline-error--name" aria-live="polite">{draftErrors.name}</div>
                      </div>

                      <div className="products-proposal-tools proposals-one-tool">
                        <div className={`products-proposal-tool-card ${productPickerOpen ? "has-open-select" : ""}`}>
                          <div className="products-proposal-tool-title"><FeatherIcon name="plusCircle" /><span>Add kit component</span></div>
                          <div className="products-proposal-control-grid">
                            <label className="products-field proposals-search-field">
                              <span>Component</span>
                              <div className={`proposal-search-select ${productPickerOpen ? "is-open" : ""}`} ref={pickerRef}>
                                <button
                                  type="button"
                                  className="proposal-search-select__button"
                                  onClick={() => setProductPickerOpen((open) => !open)}
                                  aria-haspopup="listbox"
                                  aria-expanded={productPickerOpen}
                                >
                                  <span className="proposal-search-select__value">{selectedProduct ? `${selectedProduct.name}${selectedProduct.displayId ? ` · ${selectedProduct.displayId}` : ""}` : "Search or select component"}</span>
                                  <FeatherIcon name="chevronDown" />
                                </button>
                                {productPickerOpen ? (
                                  <div className="proposal-search-select__menu" role="listbox">
                                    <div className="proposal-search-select__search">
                                      <FeatherIcon name="search" />
                                      <input autoFocus type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search..." autoComplete="off" />
                                    </div>
                                    <div className="proposal-search-select__options">
                                      {filteredProducts.map((product) => (
                                        <button
                                          type="button"
                                          className="proposal-search-select__option"
                                          key={product.id}
                                          onClick={() => {
                                            setSelectedProductId(product.id);
                                            setProductPickerOpen(false);
                                            setDraftErrors((current) => ({ ...current, items: "" }));
                                          }}
                                        >
                                          <span>{product.name}{product.displayId ? ` · ${product.displayId}` : ""}</span>
                                          <small>{[firstTag(product), product.unit].filter(Boolean).join(" · ") || "Catalogue product"}</small>
                                        </button>
                                      ))}
                                      {!filteredProducts.length ? <div className="proposal-search-select__empty">No products available</div> : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </label>
                            <label className="products-field products-field--qty">
                              <span>Qty</span>
                              <input type="number" min="1" step="1" value={productQty} onChange={(event) => setProductQty(event.target.value)} inputMode="numeric" />
                            </label>
                            <button type="button" className="products-btn products-btn--dark" onClick={addSelectedProduct} disabled={busy}><FeatherIcon name="plus" /><span>Add</span></button>
                          </div>
                        </div>
                      </div>
                      <div className="direct-create-inline-error direct-create-inline-error--items kit-create-inline-error kit-create-inline-error--items" aria-live="polite">{draftErrors.items}</div>
                    </>
                  ) : (
                    <div className="proposal-view-note"><FeatherIcon name="eye" /><span>View only. Use the 3-dot menu then Edit to modify this kit.</span></div>
                  )}

                  <div className="products-proposal-table-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap">
                      <table className="products-proposal-table">
                        <thead><tr><th>Component name</th><th>Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th /></tr></thead>
                        <tbody>
                          {enrichedRows.map((row) => (
                            <tr key={row.id}>
                              <td className="proposal-component-name"><strong>{row.name}</strong></td>
                              <td>{detailEdit ? <input className="proposal-item-qty" type="number" min="1" step="1" defaultValue={row.quantity} key={`${row.id}-${row.quantity}`} onChange={(event) => createMode ? updateQuantity(row, event.target.value) : undefined} onBlur={(event) => !createMode ? updateQuantity(row, event.target.value) : undefined} aria-label={`Quantity for ${row.name}`} /> : <strong>{formatNumber(row.quantity)}</strong>}</td>
                              <td className="proposal-price-cell">{formatMoney(row.unitPrice)}</td>
                              <td className="proposal-price-cell proposal-price-cell--total">{formatMoney(row.totalPrice)}</td>
                              <td className="proposal-link-cell">{row.product?.url ? <a className="proposal-row-link" href={row.product.url} target="_blank" rel="noreferrer" aria-label={`Open product link for ${row.name}`}><FeatherIcon name="externalLink" /></a> : <span className="proposal-row-link proposal-row-link--disabled" aria-label="No product link"><FeatherIcon name="minus" /></span>}</td>
                              <td><div className="proposal-row-actions">{detailEdit ? <button type="button" className="proposal-row-delete proposal-row-delete--icon" onClick={() => removeItem(row)} aria-label={`Delete ${row.name}`} title="Delete"><FeatherIcon name="trash" /></button> : null}</div></td>
                            </tr>
                          ))}
                          {!enrichedRows.length ? <tr><td colSpan="6"><div className="products-table-empty">No components yet. {detailEdit ? "Add one component above." : "Open Edit from the folder menu to add components."}</div></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Total requested items</span><strong>{formatNumber(detailTotals.items)} item{detailTotals.items === 1 ? "" : "s"}</strong></div>
                      <div><span>Total quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Total cost</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

                  {detailEdit ? (
                    <div className={`kit-create-save-footer direct-create-save-footer ${createMode ? "direct-create-save-footer--create" : "direct-create-save-footer--edit"}`}>
                      <button type="button" className="products-btn products-btn--light direct-create-cancel-btn" onClick={backToKits} disabled={busy}>Cancel</button>
                      <button type="button" className="products-btn products-btn--dark kit-create-save-btn direct-create-save-btn" onClick={saveKit} disabled={busy}>
                        <FeatherIcon name="save" /><span>{busy ? "Saving…" : createMode ? "Save" : "Save Changes"}</span>
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </section>
        </section>

        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="proposals-floating-actions">
        <button type="button" className="products-btn products-btn--light proposal-classic-combine-btn next-kit-combine-btn" onClick={() => setCombineOpen(true)} disabled={kits.length < 2}><FeatherIcon name="merge" /><span>Combined Kits</span></button>
        <button type="button" className="products-add-btn proposals-create-btn" onClick={startCreateKit}><FeatherIcon name="briefcase" /><span>Create New Kit</span></button>
      </div>

      {bootstrapWarnings.length ? <div className="proposal-view-note"><span aria-hidden="true">!</span><span>Some startup resources were delayed. The page remains usable; refresh if a kit is missing.</span></div> : null}

      <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
        <section className="proposals-panel">
          <div className="products-proposals-list">
            {filteredKits.length ? (
              <div className="products-proposal-folders">
                {filteredKits.map((kit) => {
                  const menuOpen = folderMenu === kit.id;
                  return (
                    <article className={`products-proposal-folder ${menuOpen ? "is-menu-open" : ""}`} key={kit.id}>
                      <button type="button" className="proposal-folder-menu-btn" onClick={(event) => { event.stopPropagation(); setFolderMenu((current) => current === kit.id ? "" : kit.id); }} aria-expanded={menuOpen} aria-label={`Actions for ${kit.name}`}><span className="proposal-menu-dots" aria-hidden="true">•••</span></button>
                      {menuOpen ? (
                        <div className="proposal-folder-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => { setFolderMenu(""); enterEditKit(kit); }}><FeatherIcon name="edit" /><span>Edit</span></button>
                          <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", kit, value: `${kit.name} copy` }); }}><FeatherIcon name="copy" /><span>Make a copy</span></button>
                          <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteKit(kit); }}><FeatherIcon name="trash" /><span>Delete</span></button>
                        </div>
                      ) : null}
                      <button type="button" className="products-proposal-folder__main" onClick={() => loadKit(kit.id, { edit: false, adminPassword: "" })} aria-label={`Open ${kit.name}`}>
                        <span className="proposal-folder-figure" aria-hidden="true">
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                          <span className="proposal-folder-figure__back" />
                          <span className="proposal-folder-figure__front"><small>K</small></span>
                        </span>
                        <span className="proposal-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
                        <span className="proposal-folder-count"><FeatherIcon name="copy" /><span>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"}</span></span>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="products-proposals-empty">Sorry, No data available</div>
            )}
          </div>
        </section>
      </section>

      {combineOpen ? <CombineKitsModal kits={kits} busy={busy} onClose={() => setCombineOpen(false)} onCreate={createCombinedKit} /> : null}
      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}
