"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ORDER_TYPES = ["Request Products", "Withdraw Products", "Request Maintenance"];
const EDIT_TRANSFER_TTL_MS = 30 * 60 * 1000;

const TYPE_META = {
  requestproducts: {
    label: "Request Products",
    icon: "shopping-cart",
    className: "request",
    description: "Add new products or supplies and send them as a stock request.",
    checkout: "Checkout Now",
  },
  withdrawproducts: {
    label: "Withdraw Products",
    icon: "log-out",
    className: "withdraw",
    description: "Withdraw available items from stock with a dedicated outgoing flow.",
    checkout: "Withdraw Now",
  },
  requestmaintenance: {
    label: "Request Maintenance",
    icon: "tool",
    className: "maintenance",
    description: "Report issues for products and create a maintenance request quickly.",
    checkout: "Submit Maintenance",
  },
};

function text(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quantity(value, fallback = 1) {
  const parsed = Math.round(number(value, fallback) * 1000) / 1000;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0.01, parsed);
}

function formatQuantity(value) {
  const parsed = quantity(value, 1);
  if (Math.abs(parsed - Math.round(parsed)) < 1e-9) return String(Math.round(parsed));
  return parsed.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function normalizedUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? 0 : number(product.unitPrice),
    unit: text(product?.unit) || "Unit",
    url: normalizedUrl(product?.url),
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeDraftItem(item) {
  return {
    id: text(item?.id),
    quantity: quantity(item?.quantity, 1),
    reason: text(item?.reason),
    issueDescription: text(item?.issueDescription),
    schoolId: text(item?.schoolId),
    expectedSparePartId: text(item?.expectedSparePartId),
  };
}

function normalizeDraft(items) {
  const unique = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeDraftItem(raw);
    if (item.id) unique.set(item.id, item);
  }
  return [...unique.values()];
}

function orderTypeMeta(type) {
  return TYPE_META[key(type)] || {
    label: text(type) || "Shopping Cart",
    icon: "grid",
    className: "default",
    description: "Open this order workflow and add products to the cart.",
    checkout: "Checkout Now",
  };
}

function isMaintenance(type) {
  return key(type) === "requestmaintenance";
}

function isWithdraw(type) {
  return key(type) === "withdrawproducts";
}

function apiMessage(body, fallback) {
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
    if (/submit-order/i.test(url)) {
      const body = await response.json().catch(() => ({}));
      throw new Error(apiMessage(body, "Incorrect password."));
    }
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false || body?.success === false) {
    throw new Error(apiMessage(body, "The request could not be completed."));
  }
  return body;
}

function storageAreas() {
  const stores = [];
  try { if (window.sessionStorage) stores.push(window.sessionStorage); } catch {}
  try { if (window.localStorage) stores.push(window.localStorage); } catch {}
  return stores;
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function freshTransfer(payload) {
  const ts = number(payload?.ts);
  return !!ts && Date.now() - ts <= EDIT_TRANSFER_TTL_MS;
}

function readEditTransfer(editKey = "") {
  const candidates = [];
  const keys = [];
  const addKey = (value) => {
    const clean = text(value);
    if (clean && !keys.includes(clean)) keys.push(clean);
  };
  addKey(editKey);

  for (const storage of storageAreas()) {
    try {
      const pending = parseJson(storage.getItem("shopping_cart:edit_pending:v2"));
      if (freshTransfer(pending)) {
        addKey(pending?.key);
        candidates.push(pending);
      }
    } catch {}
  }

  for (const storage of storageAreas()) {
    for (const transferKey of keys) {
      try {
        const payload = parseJson(storage.getItem(`shopping_cart:edit_payload:v2:${transferKey}`));
        if (freshTransfer(payload)) candidates.push(payload);
      } catch {}
    }
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const storageKey = storage.key(index) || "";
        if (!storageKey.startsWith("shopping_cart:edit_fallback:v1:")) continue;
        const payload = parseJson(storage.getItem(storageKey));
        if (freshTransfer(payload)) candidates.push(payload);
      }
    } catch {}
  }

  return candidates.find((candidate) => Array.isArray(candidate?.products) && candidate.products.length)
    || candidates[0]
    || null;
}

function clearEditTransfer() {
  for (const storage of storageAreas()) {
    try {
      const remove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const storageKey = storage.key(index) || "";
        if (
          storageKey === "shopping_cart:edit_pending:v2" ||
          storageKey === "shopping_cart:edit_target_type:v1" ||
          storageKey.startsWith("shopping_cart:edit_payload:v2:") ||
          storageKey.startsWith("shopping_cart:edit_fallback:v1:")
        ) remove.push(storageKey);
      }
      remove.forEach((storageKey) => storage.removeItem(storageKey));
    } catch {}
  }
}

function CartSvgIcon({ name, size = 18 }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", width: size, height: size, "aria-hidden": true };
  const icons = {
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L7.4 3.6l3 3 2.3-2.3a4 4 0 0 0 2 5"/><path d="M5 13L2 16l6 6 3-3"/><path d="M12 12l8.6 8.6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    "arrow-left": <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  };
  return <svg {...common}>{icons[name] || icons.grid}</svg>;
}

function Toast({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`classic-cart-toast is-${notice.type || "info"}`} role="status">
      <div><strong>{notice.title || "Shopping Cart"}</strong><span>{notice.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function TypeSelection({ orderTypes, onChoose }) {
  return (
    <section className="classic-cart-order-type-step" aria-label="Choose order type">
      <div className="classic-cart-order-step-header">
        <div>
          <div className="classic-cart-order-step-kicker"><CartSvgIcon name="layers" size={16}/><span>Shopping flow</span></div>
          <h2 className="classic-cart-order-type-title">Choose Order Type</h2>
        </div>
      </div>
      <div className="classic-cart-order-type-tabs">
        {orderTypes.length ? orderTypes.map((type) => {
          const meta = orderTypeMeta(type);
          const themeClass = meta.className === "request" ? "theme-request-products" : meta.className === "withdraw" ? "theme-withdraw-products" : meta.className === "maintenance" ? "theme-request-maintenance" : "theme-default";
          return (
            <button className={`classic-cart-order-type-btn ${themeClass}`} type="button" key={type} onClick={() => onChoose(type)}>
              <span className="classic-cart-order-type-icon"><CartSvgIcon name={meta.icon} size={24}/></span>
              <span className="classic-cart-order-type-copy"><strong>{type}</strong><small>{meta.description}</small></span>
              <span className="classic-cart-order-type-arrow"><CartSvgIcon name="arrow-right" size={18}/></span>
            </button>
          );
        }) : <div className="classic-cart-order-type-loading"><span/><strong>No order types found.</strong></div>}
      </div>
    </section>
  );
}

function ProductPicker({ products, type, item, onClose, onSave }) {
  const maintenance = isMaintenance(type);
  const [selectedId, setSelectedId] = useState(text(item?.id));
  const [qty, setQty] = useState(item?.quantity || 1);
  const [issueDescription, setIssueDescription] = useState(text(item?.issueDescription));
  const [error, setError] = useState("");

  const selected = products.find((product) => product.id === selectedId) || null;

  const submit = () => {
    if (!selected) return setError("Select a product first.");
    if (maintenance && !text(issueDescription)) return setError("Issue Description is required for maintenance requests.");
    if (!maintenance && quantity(qty, 0) <= 0) return setError("Quantity must be greater than zero.");
    onSave({ id: selected.id, quantity: maintenance ? 1 : quantity(qty, 1), issueDescription: maintenance ? text(issueDescription) : "", schoolId: text(item?.schoolId) });
  };

  return (
    <div className="classic-cart-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="classic-cart-modal-card" role="dialog" aria-modal="true" aria-labelledby="classic-cart-modal-title">
        <h3 className="classic-cart-modal-title" id="classic-cart-modal-title">{isWithdraw(type) ? "Update Withdraw Cart" : "Update Cart"}</h3>
        <div className={`classic-cart-modal-grid ${maintenance ? "is-maintenance" : ""}`}>
          <label className="classic-cart-mfield full">
            <span>Product <em>*</em></span>
            <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(""); }} aria-label="Product">
              <option value="">Select product...</option>
              {products.map((product) => <option value={product.id} key={product.id}>{product.name}{product.displayId ? ` · ${product.displayId}` : ""}{product.unit ? ` · ${product.unit}` : ""}</option>)}
            </select>
          </label>
          {!maintenance ? (
            <label className="classic-cart-mfield">
              <span>Qty <em>*</em></span>
              <div className="classic-cart-qty-input-with-unit">
                <input type="number" min="0.01" step="0.01" value={qty} onChange={(event) => setQty(event.target.value)} />
                <b className={!selected?.unit ? "is-placeholder" : ""}>{selected?.unit || "Unit"}</b>
              </div>
            </label>
          ) : (
            <label className="classic-cart-mfield full">
              <span>Issue Description <em>*</em></span>
              <textarea value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="Describe the issue..." rows={4} />
            </label>
          )}
          {error ? <p className="classic-cart-modal-error full">{error}</p> : null}
        </div>
        <div className="classic-cart-modal-actions">
          <button className="classic-cart-btn-ghost" type="button" onClick={onClose}>Close</button>
          <button className="classic-cart-btn-solid" type="button" onClick={submit}>{item ? "Update" : "Add"}</button>
        </div>
      </section>
    </div>
  );
}

function CartThumb({ product, index }) {
  if (!product?.imageUrl) return <span className="classic-cart-thumb">{index + 1}</span>;
  return (
    <button className="classic-cart-thumb has-image" type="button" title="Open image full screen" aria-label={`Open ${product.name} image`} onClick={(event) => { event.stopPropagation(); const w = window.open(product.imageUrl, "_blank", "noopener,noreferrer"); if (w) w.opener = null; }}>
      <img src={product.imageUrl} alt={product.name} loading="lazy" />
    </button>
  );
}

function CartItem({ item, product, type, index, onEdit, onDelete, onQuantityChange }) {
  const maintenance = isMaintenance(type);
  const withdraw = isWithdraw(type);
  const qty = quantity(item.quantity, 1);
  const total = product.unitPrice * qty * (withdraw ? -1 : 1);
  const excludedTags = new Set(DEFAULT_ORDER_TYPES.map(key));
  const tags = product.tags.filter((tag) => !excludedTags.has(key(tag))).slice(0, 2);

  if (maintenance) {
    return (
      <article className="classic-cart-row classic-cart-row--maintenance-card">
        <div className="classic-cart-card-main" role="button" tabIndex={0} onClick={() => onEdit(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(item); } }}>
          <CartThumb product={product} index={index}/>
          <span className="classic-cart-prod-meta"><strong>{product.name}</strong>{product.displayId ? <small className="part">Part No: {product.displayId}</small> : null}</span>
        </div>
        <button className="classic-cart-note classic-cart-note--editable" type="button" onClick={() => onEdit(item)}>
          <span>Issue Description</span><strong className={!item.issueDescription ? "is-empty" : ""}>{item.issueDescription || "—"}</strong>
        </button>
        <div className="classic-cart-card-actions">
          {product.url ? <a className="classic-cart-action classic-cart-action--open" href={product.url} target="_blank" rel="noopener noreferrer"><CartSvgIcon name="external-link" size={16}/><span>Open</span></a> : <button className="classic-cart-action classic-cart-action--open" type="button" disabled><CartSvgIcon name="external-link" size={16}/><span>Open</span></button>}
          <button className="classic-cart-action classic-cart-action--delete" type="button" onClick={() => onDelete(item)}>Delete</button>
        </div>
      </article>
    );
  }

  return (
    <article className="classic-cart-row classic-cart-row--request-card">
      <div className="classic-cart-card-main" role="button" tabIndex={0} onClick={() => onEdit(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(item); } }}>
        <CartThumb product={product} index={index}/>
        <span className="classic-cart-prod-meta"><strong>{product.name}</strong>{tags.length ? <small>{tags.join(" • ")}</small> : null}{product.displayId ? <small className="part">Part No: {product.displayId}</small> : null}</span>
      </div>
      <div className="classic-cart-card-metrics">
        <div className="classic-cart-card-metric classic-cart-card-metric--qty">
          <span>Qty</span>
          <div className="classic-cart-card-qty-unit-row">
            <div className="classic-cart-qty-control">
              <button type="button" onClick={() => onQuantityChange(item.id, Math.max(0.01, qty - 1))}>−</button>
              <b>{withdraw ? `-${formatQuantity(qty)}` : formatQuantity(qty)}</b>
              <button type="button" onClick={() => onQuantityChange(item.id, qty + 1)}>+</button>
            </div>
            <strong className="classic-cart-unit-badge" title={product.unit}>{product.unit}</strong>
          </div>
        </div>
        <div className="classic-cart-card-metric"><span>Unit Price</span><strong>{formatMoney(product.unitPrice)}</strong></div>
        <div className="classic-cart-card-metric"><span>Total</span><strong>{formatMoney(total)}</strong></div>
      </div>
      <div className="classic-cart-card-actions">
        {product.url ? <a className="classic-cart-action classic-cart-action--open" href={product.url} target="_blank" rel="noopener noreferrer"><CartSvgIcon name="external-link" size={16}/><span>Open</span></a> : <button className="classic-cart-action classic-cart-action--open" type="button" disabled><CartSvgIcon name="external-link" size={16}/><span>Open</span></button>}
        <button className="classic-cart-action classic-cart-action--delete" type="button" onClick={() => onDelete(item)}>Delete</button>
      </div>
    </article>
  );
}

export default function ShoppingCartClient({
  initialOrderTypes = [],
  initialComponents = [],
  initialDraft = {},
  initialType = "",
  editMode = false,
  editKey = "",
  bootstrapWarnings = [],
}) {
  const orderTypes = useMemo(() => {
    const map = new Map();
    for (const type of [...DEFAULT_ORDER_TYPES, ...(Array.isArray(initialOrderTypes) ? initialOrderTypes : [])]) {
      const clean = text(type);
      if (clean && !map.has(key(clean))) map.set(key(clean), clean);
    }
    return [...map.values()];
  }, [initialOrderTypes]);

  const products = useMemo(() => (Array.isArray(initialComponents) ? initialComponents : [])
    .map(normalizeProduct)
    .filter((product) => product.id && product.name), [initialComponents]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const [selectedType, setSelectedType] = useState(text(initialType));
  const [cart, setCart] = useState(() => normalizeDraft(initialDraft?.products));
  const [reason, setReason] = useState(() => text(initialDraft?.reason) || normalizeDraft(initialDraft?.products).find((item) => item.reason)?.reason || "");
  const [password, setPassword] = useState("");
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [checkoutCommitted, setCheckoutCommitted] = useState(false);
  const reasonTimer = useRef(null);
  const mounted = useRef(false);

  const meta = orderTypeMeta(selectedType);
  const maintenance = isMaintenance(selectedType);
  const withdraw = isWithdraw(selectedType);
  const itemCount = cart.length;

  useEffect(() => {
    const heading = selectedType
      ? (isWithdraw(selectedType) ? "Withdraw Products" : isMaintenance(selectedType) ? "Request Maintenance" : "Shopping Cart")
      : "Shopping Cart";
    const titleEl = document.querySelector(".classic-app-shell .dash-title");
    const searchEl = document.querySelector(".classic-app-shell .searchbar input");
    if (titleEl) titleEl.textContent = editMode && selectedType ? `Edit ${heading}` : heading;
    if (searchEl) searchEl.setAttribute("placeholder", `Search in ${heading}`);
    document.title = `${editMode && selectedType ? "Edit " : ""}${heading}`;
  }, [selectedType, editMode]);

  const total = cart.reduce((sum, item) => {
    const product = productMap.get(item.id);
    if (!product || maintenance) return sum;
    return sum + product.unitPrice * quantity(item.quantity, 1) * (withdraw ? -1 : 1);
  }, 0);

  const payloadFor = (items = cart, type = selectedType, globalReason = reason) => normalizeDraft(items).map((item) => ({
    id: item.id,
    quantity: isMaintenance(type) ? 1 : quantity(item.quantity, 1),
    reason: isMaintenance(type) ? (text(item.issueDescription).slice(0, 80) || "Request Maintenance") : text(globalReason),
    issueDescription: isMaintenance(type) ? text(item.issueDescription) : "",
    schoolId: text(item.schoolId),
    expectedSparePartId: "",
  }));

  const persistDraft = async (items = cart, type = selectedType, globalReason = reason, { quiet = false } = {}) => {
    const cleanType = text(type);
    if (!cleanType) return true;
    const cleanItems = normalizeDraft(items);
    try {
      if (!quiet) setSaveState("Saving…");
      if (!cleanItems.length) {
        await requestJson(`/api/order-draft?orderType=${encodeURIComponent(cleanType)}`, { method: "DELETE" });
      } else {
        await requestJson("/api/order-draft/products", {
          method: "POST",
          body: JSON.stringify({ products: payloadFor(cleanItems, cleanType, globalReason), orderType: cleanType }),
        });
      }
      if (!quiet) {
        setSaveState("Saved");
        window.setTimeout(() => setSaveState(""), 1300);
      }
      return true;
    } catch (error) {
      if (!quiet) setSaveState("Save failed");
      setNotice({ type: "error", title: "Draft not saved", message: error?.message || "The cart draft could not be saved." });
      return false;
    }
  };

  const setBrowserType = (type) => {
    try {
      const url = new URL(window.location.href);
      if (text(type)) url.searchParams.set("type", text(type));
      else url.searchParams.delete("type");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  };

  const loadDraft = async (type, fallback = null) => {
    const cleanType = text(type);
    if (!cleanType) return;
    setLoadingDraft(true);
    try {
      const draft = fallback || await requestJson(`/api/order-draft?orderType=${encodeURIComponent(cleanType)}`);
      let items = normalizeDraft(draft?.products);
      let nextReason = text(draft?.reason) || items.find((item) => item.reason)?.reason || "";

      if (editMode) {
        const transfer = readEditTransfer(editKey);
        const transferItems = normalizeDraft(transfer?.products);
        const transferReason = text(transfer?.reason) || transferItems.find((item) => item.reason)?.reason || "";
        if (!items.length && transferItems.length) items = transferItems;
        if (!nextReason && transferReason) nextReason = transferReason;
        if (nextReason) items = items.map((item) => ({ ...item, reason: item.reason || nextReason }));
      }

      setCart(items);
      setReason(isMaintenance(cleanType) ? "" : nextReason);
      if (items.length && (!draft?.products?.length || (editMode && !text(draft?.reason) && nextReason))) {
        await persistDraft(items, cleanType, nextReason, { quiet: true });
      }
    } catch (error) {
      setCart([]);
      setReason("");
      setNotice({ type: "error", title: "Draft unavailable", message: error?.message || "The saved cart could not be loaded." });
    } finally {
      setLoadingDraft(false);
    }
  };

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (selectedType) {
      loadDraft(selectedType, initialDraft);
      return;
    }
    if (editMode) {
      const transfer = readEditTransfer(editKey);
      const transferType = text(transfer?.orderType);
      if (transferType) {
        setSelectedType(transferType);
        setBrowserType(transferType);
        loadDraft(transferType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (reasonTimer.current) window.clearTimeout(reasonTimer.current);
  }, []);

  const chooseType = async (type) => {
    const clean = text(type);
    setSelectedType(clean);
    setBrowserType(clean);
    setPicker(null);
    setPassword("");
    await loadDraft(clean);
  };

  const backToTypes = async () => {
    if (editMode && !checkoutCommitted) {
      try {
        await requestJson("/api/order-edit/cancel", {
          method: "POST",
          body: JSON.stringify({ orderType: selectedType }),
        });
      } catch {}
      clearEditTransfer();
      window.location.href = "/next/orders";
      return;
    }
    setSelectedType("");
    setBrowserType("");
    setCart([]);
    setReason("");
    setPassword("");
  };

  const savePickerItem = async (draftItem) => {
    const next = [...cart];
    const previousId = text(picker?.item?.id);
    const existingIndex = next.findIndex((item) => item.id === draftItem.id);
    if (previousId && previousId !== draftItem.id) {
      const previousIndex = next.findIndex((item) => item.id === previousId);
      if (previousIndex >= 0) next.splice(previousIndex, 1);
    }
    const normalized = normalizeDraftItem({ ...draftItem, reason });
    const targetIndex = next.findIndex((item) => item.id === normalized.id);
    if (targetIndex >= 0) next[targetIndex] = normalized;
    else next.push(normalized);
    setCart(next);
    setPicker(null);
    await persistDraft(next);
  };

  const deleteItem = async (item) => {
    const product = productMap.get(item.id);
    const name = product?.name || "this item";
    if (!window.confirm(`Remove “${name}” from this cart?`)) return;
    const next = cart.filter((row) => row.id !== item.id);
    setCart(next);
    await persistDraft(next);
  };

  const updateQuantity = (id, value, options = { save: true }) => {
    const next = cart.map((item) => item.id === id ? { ...item, quantity: quantity(value, 1) } : item);
    setCart(next);
    if (options?.save !== false) persistDraft(next);
  };

  const updateReason = (value) => {
    setReason(value);
    if (reasonTimer.current) window.clearTimeout(reasonTimer.current);
    reasonTimer.current = window.setTimeout(() => {
      if (cart.length) persistDraft(cart, selectedType, value, { quiet: false });
    }, 550);
  };

  const clearCart = async () => {
    if (!cart.length) return;
    if (!window.confirm("Clear all products from this cart?")) return;
    setCart([]);
    await persistDraft([]);
  };

  const checkout = async () => {
    if (!cart.length) {
      setNotice({ type: "error", title: "Empty cart", message: maintenance ? "Add at least one product to maintain." : "Add at least one product before checkout." });
      return;
    }
    if (!maintenance && !text(reason)) {
      setNotice({ type: "error", title: "Reason required", message: withdraw ? "Enter the withdrawal reason." : "Enter the order reason." });
      return;
    }
    if (maintenance && cart.some((item) => !text(item.issueDescription))) {
      setNotice({ type: "error", title: "Issue Description required", message: "Every maintenance product must include an Issue Description." });
      return;
    }
    if (!text(password)) {
      setNotice({ type: "error", title: "Password required", message: "Enter your account password before submitting." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const draftSaved = await persistDraft(cart, selectedType, reason, { quiet: true });
      if (!draftSaved) throw new Error("The cart draft could not be saved before checkout.");
      const response = await requestJson("/api/submit-order", {
        method: "POST",
        body: JSON.stringify({
          products: payloadFor(cart, selectedType, reason),
          password: text(password),
          orderType: selectedType,
        }),
      });
      setCheckoutCommitted(true);
      clearEditTransfer();
      setCart([]);
      setPassword("");
      setNotice({
        type: "success",
        title: editMode ? "Order updated" : (withdraw ? "Withdrawal submitted" : maintenance ? "Maintenance submitted" : "Order submitted"),
        message: response?.message || "The order was saved successfully.",
      });
      window.setTimeout(() => { window.location.href = "/next/orders"; }, 850);
    } catch (error) {
      setNotice({ type: "error", title: "Submission failed", message: error?.message || "The order could not be submitted." });
    } finally {
      setBusy(false);
    }
  };

  if (!selectedType) {
    return (
      <section className="classic-cart-page">
        {bootstrapWarnings.length ? (
          <div className="dashboard-notice">
            <strong>Partial initial data</strong>
            <span>One Shopping Cart resource was not available.</span>
            <a href="/orders/new?classic=1">Classic page</a>
          </div>
        ) : null}
        <TypeSelection orderTypes={orderTypes} onChoose={chooseType} />
        <Toast notice={notice} onClose={() => setNotice(null)} />
      </section>
    );
  }

  const typeTheme = meta.className === "request"
    ? "theme-request-products"
    : meta.className === "withdraw"
      ? "theme-withdraw-products"
      : meta.className === "maintenance"
        ? "theme-request-maintenance"
        : "theme-default";

  return (
    <section className={`classic-cart-page ${maintenance ? "is-maintenance" : ""}`}>
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice">
          <strong>Partial initial data</strong>
          <span>One Shopping Cart resource was not available.</span>
          <a href="/orders/new?classic=1">Classic page</a>
        </div>
      ) : null}

      <div className="classic-cart-type-pill">
        <button className="classic-cart-back-btn" type="button" onClick={backToTypes} aria-label={editMode ? "Back to Current Orders" : "Back to order types"}>
          <CartSvgIcon name="arrow-left" size={16}/>
        </button>
        <span className={`classic-cart-type-value ${typeTheme}`}>
          <span className="classic-cart-type-value-icon"><CartSvgIcon name={meta.icon} size={16}/></span>
          <span>{selectedType}</span>
        </span>
        <span className={`classic-cart-save-state ${saveState === "Save failed" ? "is-error" : ""}`}>{saveState}</span>
      </div>

      <div className="classic-cart-grid">
        <section className="classic-cart-main">
          <div className="classic-cart-card" aria-label="Shopping cart items">
            {loadingDraft ? (
              <div className="classic-cart-loading" role="status" aria-live="polite">
                <span className="classic-cart-loading-spinner" aria-hidden="true"/>
                <strong>Loading products...</strong>
              </div>
            ) : cart.length ? (
              <div className={`classic-cart-body ${maintenance ? "classic-cart-body--maintenance-cards" : "classic-cart-body--request-cards"}`}>
                {cart.map((item, index) => {
                  const product = productMap.get(item.id) || normalizeProduct({ id: item.id, name: "Unavailable product" });
                  return (
                    <CartItem
                      key={item.id}
                      item={item}
                      product={product}
                      type={selectedType}
                      index={index}
                      onEdit={(selected) => setPicker({ item: selected })}
                      onDelete={deleteItem}
                      onQuantityChange={updateQuantity}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="classic-cart-empty">
                <strong>Sorry, No data available</strong>
              </div>
            )}

            <div className="classic-cart-footer">
              <button className="classic-cart-update-btn" type="button" onClick={() => setPicker({ item: null })}>
                {withdraw ? "Update Withdraw Cart" : "Update Cart"}
              </button>
            </div>
          </div>
        </section>

        <aside className="classic-cart-summary" aria-label="Order summary">
          <div className="classic-cart-summary-card">
            <div className="classic-cart-summary-title">{withdraw ? "Withdrawal Summary" : "Order Summary"}</div>

            <div className="classic-cart-summary-lines">
              <div><span>Entry count</span><strong>{itemCount}</strong></div>
              {!maintenance ? <div className="classic-cart-summary-total"><span>Total</span><strong>{formatMoney(total)}</strong></div> : null}
            </div>

            {!maintenance ? (
              <label className="classic-cart-summary-field">
                <span>Reason</span>
                <input
                  value={reason}
                  onChange={(event) => updateReason(event.target.value)}
                  placeholder="Reason..."
                  autoComplete="off"
                />
              </label>
            ) : null}

            <label className="classic-cart-voucher-row">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    checkout();
                  }
                }}
                placeholder="Your password"
                autoComplete="new-password"
              />
            </label>

            <button className="classic-cart-checkout-btn" type="button" onClick={checkout} disabled={busy || loadingDraft}>
              {busy ? (editMode ? "Saving..." : "Submitting...") : editMode ? "Save Order Changes" : withdraw ? "Withdraw Now" : "Checkout Now"}
            </button>
          </div>
        </aside>
      </div>

      {picker ? (
        <ProductPicker
          products={products}
          type={selectedType}
          item={picker.item}
          onClose={() => setPicker(null)}
          onSave={savePickerItem}
        />
      ) : null}

      {busy ? (
        <div className="classic-cart-saving-overlay" aria-live="polite">
          <div className="classic-cart-saving-box">
            <span className="classic-cart-saving-spinner" aria-hidden="true"/>
            <strong>{editMode ? "Saving..." : "Saving..."}</strong>
          </div>
        </div>
      ) : null}

      <Toast notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
