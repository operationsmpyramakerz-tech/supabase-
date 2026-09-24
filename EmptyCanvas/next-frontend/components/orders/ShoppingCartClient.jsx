"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";

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

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    folderId: text(kit?.folderId || kit?.folder_id),
    itemsCount: Math.max(0, Math.round(number(kit?.itemsCount))),
    createdBy: text(kit?.createdBy || kit?.created_by),
  };
}

function normalizeKitFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `kit-folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
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
    tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    "arrow-left": <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    package: <><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
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

const ORDER_CONFIRMATION_DURATION_MS = 6500;
const ORDER_DISSOLVE_DURATION_MS = 1100;
const ORDER_DISSOLVE_PARTICLES = Array.from({ length: 168 }, (_, index) => {
  const columns = 24;
  const rows = 7;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const seed = (index * 47 + 19) % 101;
  const xJitter = (((index * 29) % 17) / 17 - 0.5) * 2.8;
  const yJitter = (((index * 41) % 19) / 19 - 0.5) * 5;
  const x = ((column + 0.5) / columns) * 100 + xJitter;
  const y = ((row + 0.5) / rows) * 100 + yJitter;
  const edgeDirection = (x - 50) / 50;
  const dx = Math.round(edgeDirection * (36 + (seed % 34)) + ((((index * 31) % 23) / 23) - 0.5) * 42);
  const verticalDirection = y < 50 ? -1 : 1;
  const dy = Math.round(verticalDirection * (12 + ((index * 17) % 28)) - 10 - (((index * 13) % 17) / 17) * 28);
  const size = 1 + ((index * 7) % 3);
  const delay = Math.round(((100 - x) / 100) * 120 + ((index * 23) % 70));
  const duration = 620 + ((index * 37) % 250);
  const color = index % 13 === 0
    ? "#ff7518"
    : index % 17 === 0
      ? "rgba(255,255,255,.94)"
      : index % 5 === 0
        ? "#303030"
        : "#0d0d0d";

  return {
    id: index,
    style: {
      "--dust-x": `${x.toFixed(2)}%`,
      "--dust-y": `${y.toFixed(2)}%`,
      "--dust-dx": `${dx}px`,
      "--dust-dy": `${dy}px`,
      "--dust-dx-mid": `${Math.round(dx * 0.22)}px`,
      "--dust-dy-mid": `${Math.round(dy * 0.20)}px`,
      "--dust-dx-far": `${Math.round(dx * 0.62)}px`,
      "--dust-dy-far": `${Math.round(dy * 0.64)}px`,
      "--dust-size": `${size}px`,
      "--dust-half": `${-size / 2}px`,
      "--dust-delay": `${delay}ms`,
      "--dust-duration": `${duration}ms`,
      "--dust-color": color,
      "--dust-rotate": `${((index * 61) % 160) - 80}deg`,
      "--dust-rotate-mid": `${Math.round((((index * 61) % 160) - 80) * 0.18)}deg`,
      "--dust-rotate-far": `${Math.round((((index * 61) % 160) - 80) * 0.65)}deg`,
    },
  };
});

function OrderSubmissionBar({ submission, onDone, onUndo }) {
  const [undoing, setUndoing] = useState(false);
  const [exploding, setExploding] = useState(false);

  useEffect(() => {
    if (!submission || undoing || exploding) return undefined;
    const timer = window.setTimeout(() => onDone(null), ORDER_CONFIRMATION_DURATION_MS + 180);
    return () => window.clearTimeout(timer);
  }, [submission, onDone, undoing, exploding]);

  if (!submission) return null;
  const meta = orderTypeMeta(submission.orderType);
  const orderQuery = text(submission.orderId);
  const viewOrderUrl = orderQuery ? `/next/orders?q=${encodeURIComponent(orderQuery)}` : "/next/orders";

  const openCurrentOrder = () => {
    if (undoing || exploding) return;
    navigateWithinApp(viewOrderUrl);
  };
  const undoOrder = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (undoing || exploding || typeof onUndo !== "function") return;
    setUndoing(true);
    try {
      await onUndo(submission);
      setUndoing(false);
      setExploding(true);
      window.setTimeout(() => onDone(null), ORDER_DISSOLVE_DURATION_MS);
    } catch {
      setUndoing(false);
    }
  };

  return (
    <div
      className={`classic-cart-order-confirmation${undoing ? " is-undoing" : ""}${exploding ? " is-exploding" : ""}`}
      role="button"
      tabIndex={exploding ? -1 : 0}
      aria-live="polite"
      aria-label={`Open ${submission.orderId || "current order"}`}
      onClick={openCurrentOrder}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || undoing || exploding) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCurrentOrder();
        }
      }}
    >
      <span className="classic-cart-order-confirmation-dust" aria-hidden="true">
        {ORDER_DISSOLVE_PARTICLES.map((particle) => (
          <i
            className="classic-cart-order-confirmation-dust-particle"
            key={particle.id}
            style={particle.style}
          />
        ))}
      </span>
      <svg className="classic-cart-order-confirmation-progress" viewBox="0 0 500 92" preserveAspectRatio="none" aria-hidden="true">
        <rect className="classic-cart-order-confirmation-track" x="3" y="3" width="494" height="86" rx="43" pathLength="100"/>
        <rect className="classic-cart-order-confirmation-line" x="3" y="3" width="494" height="86" rx="43" pathLength="100"/>
      </svg>
      <span className="classic-cart-order-confirmation-icon">
        <CartSvgIcon name={meta.icon} size={19}/>
      </span>
      <span className="classic-cart-order-confirmation-copy">
        <strong>{submission.nextStep || "Waiting for approval"}</strong>
        <small>{submission.orderId || "Order created"} <b>·</b> {meta.label}</small>
      </span>
      <button
        className="classic-cart-order-confirmation-undo"
        type="button"
        disabled={undoing || exploding}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={undoOrder}
        aria-label={`Undo ${submission.orderId || "order"}`}
      >
        Undo
      </button>
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

function ProductCombobox({ products, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selected = products.find((product) => product.id === value) || null;
  const needle = text(query).toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return products;
    return products.filter((product) => [product.name, product.displayId, product.unit, ...(product.tags || [])]
      .some((part) => text(part).toLowerCase().includes(needle)));
  }, [products, needle]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={`classic-cart-combobox ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        className={`classic-cart-combobox-trigger ${selected ? "has-value" : ""}`}
        type="button"
        onClick={() => { if (!disabled) { setOpen((current) => !current); setQuery(""); } }}
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="classic-cart-combobox-media">
          {selected?.imageUrl ? <img src={selected.imageUrl} alt="" /> : <CartSvgIcon name="package" size={20}/>} 
        </span>
        <span className="classic-cart-combobox-copy">
          <small>{selected ? "Selected component" : "Component"}</small>
          <strong>{selected?.name || "Select a component"}</strong>
          <em>{selected ? [selected.displayId || "No ID", selected.unit || "Unit"].join(" · ") : "Search by name, ID, tag or unit"}</em>
        </span>
        <span className="classic-cart-combobox-arrow"><CartSvgIcon name="chevron-down" size={18}/></span>
      </button>

      {open ? (
        <div className="classic-cart-combobox-panel" role="listbox" aria-label="Products">
          <label className="classic-cart-combobox-search">
            <CartSvgIcon name="search" size={18}/>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components..." autoComplete="off" />
            <span>{filtered.length}</span>
          </label>
          <div className="classic-cart-combobox-list">
            {filtered.map((product) => {
              const active = product.id === value;
              return (
                <button
                  type="button"
                  className={`classic-cart-combobox-option ${active ? "is-selected" : ""}`}
                  key={product.id}
                  onClick={() => { onChange(product.id); setOpen(false); setQuery(""); }}
                  role="option"
                  aria-selected={active}
                >
                  <span className="classic-cart-combobox-option-media">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <CartSvgIcon name="package" size={18}/>} 
                  </span>
                  <span className="classic-cart-combobox-option-copy">
                    <strong>{product.name}</strong>
                    <small>{[product.displayId || "No ID", product.unit || "Unit"].join(" · ")}</small>
                  </span>
                  <span className="classic-cart-combobox-option-price">{formatMoney(product.unitPrice)}</span>
                  {active ? <span className="classic-cart-combobox-option-check"><CartSvgIcon name="check" size={16}/></span> : null}
                </button>
              );
            })}
            {!filtered.length ? <div className="classic-cart-combobox-empty">No components match “{query}”.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KitBrowserDialog({ kits, folders, selectedKits, onToggleKit, onQuantityChange, onClose, loading, error, onRetry }) {
  const [activeFolderId, setActiveFolderId] = useState("");
  const [query, setQuery] = useState("");
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || null;
  const needle = text(query).toLowerCase();
  const folderCounts = useMemo(() => {
    const map = new Map();
    kits.forEach((kit) => {
      if (kit.folderId) map.set(kit.folderId, (map.get(kit.folderId) || 0) + 1);
    });
    return map;
  }, [kits]);
  const visibleFolders = useMemo(() => {
    if (activeFolderId) return [];
    if (!needle) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(needle));
  }, [activeFolderId, folders, needle]);
  const visibleKits = useMemo(() => {
    let rows = activeFolderId
      ? kits.filter((kit) => kit.folderId === activeFolderId)
      : needle
        ? kits
        : kits.filter((kit) => !kit.folderId);
    if (needle) rows = rows.filter((kit) => kit.name.toLowerCase().includes(needle));
    return rows;
  }, [activeFolderId, kits, needle]);
  const selectedCount = Object.keys(selectedKits || {}).length;

  return (
    <div className="classic-cart-kit-browser-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="classic-cart-kit-browser" role="dialog" aria-modal="true" aria-label="Select kits">
        <header className="classic-cart-kit-browser-head">
          <div>
            <span>Kit library</span>
            <h3>{activeFolder ? activeFolder.name : "Select kits"}</h3>
            <p>{activeFolder ? "Choose one or more kits from this folder." : "Browse folders or choose unfiled kits."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><CartSvgIcon name="x" size={20}/></button>
        </header>

        <div className="classic-cart-kit-browser-toolbar">
          {activeFolder ? (
            <button type="button" className="classic-cart-kit-browser-back" onClick={() => { setActiveFolderId(""); setQuery(""); }}>
              <CartSvgIcon name="arrow-left" size={16}/> All kits
            </button>
          ) : <span className="classic-cart-kit-browser-location">Folders & kits</span>}
          <label className="classic-cart-kit-browser-search">
            <CartSvgIcon name="search" size={17}/>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search kits..." autoComplete="off" />
          </label>
          <span className="classic-cart-kit-browser-count">{selectedCount} selected</span>
        </div>

        <div className="classic-cart-kit-browser-grid">
          {loading ? (
            <div className="classic-cart-kit-browser-status"><span className="classic-cart-loading-spinner"/><strong>Loading kit library...</strong></div>
          ) : error ? (
            <div className="classic-cart-kit-browser-status is-error"><strong>Kit library unavailable</strong><span>{error}</span><button type="button" onClick={onRetry}>Try again</button></div>
          ) : (
            <>
              {visibleFolders.map((folder) => (
                <button type="button" className="classic-cart-kit-folder-card" key={folder.id} onClick={() => { setActiveFolderId(folder.id); setQuery(""); }}>
                  <span className="classic-cart-kit-folder-icon"><CartSvgIcon name="folder" size={24}/></span>
                  <span><strong>{folder.name}</strong><small>{folderCounts.get(folder.id) || 0} kit{(folderCounts.get(folder.id) || 0) === 1 ? "" : "s"}</small></span>
                  <CartSvgIcon name="arrow-right" size={18}/>
                </button>
              ))}
              {visibleKits.map((kit) => {
                const selected = Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id);
                const qty = selected ? selectedKits[kit.id] : 1;
                return (
                  <article className={`classic-cart-kit-card ${selected ? "is-selected" : ""}`} key={kit.id}>
                    <button type="button" className="classic-cart-kit-card-main" onClick={() => onToggleKit(kit.id)} aria-pressed={selected}>
                      <span className="classic-cart-kit-card-icon"><CartSvgIcon name="layers" size={22}/></span>
                      <span className="classic-cart-kit-card-copy"><strong>{kit.name}</strong><small>{kit.itemsCount} component{kit.itemsCount === 1 ? "" : "s"}{kit.createdBy ? ` · ${kit.createdBy}` : ""}</small></span>
                      <span className="classic-cart-kit-card-check">{selected ? <CartSvgIcon name="check" size={16}/> : <CartSvgIcon name="plus" size={16}/>}</span>
                    </button>
                    {selected ? (
                      <label className="classic-cart-kit-card-qty" onClick={(event) => event.stopPropagation()}>
                        <span>Kit Qty</span>
                        <input type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={(event) => onQuantityChange(kit.id, event.target.value)} />
                      </label>
                    ) : null}
                  </article>
                );
              })}
              {!visibleFolders.length && !visibleKits.length ? <div className="classic-cart-kit-browser-status"><strong>No kits found here.</strong><span>Try another folder or search term.</span></div> : null}
            </>
          )}
        </div>

        <footer className="classic-cart-kit-browser-footer">
          <span><strong>{selectedCount}</strong> kit{selectedCount === 1 ? "" : "s"} selected</span>
          <button type="button" onClick={onClose}>Use selected kits</button>
        </footer>
      </section>
    </div>
  );
}

function ProductPicker({ products, type, item, onClose, onSave }) {
  const maintenance = isMaintenance(type);
  const withdraw = isWithdraw(type);
  const [mode, setMode] = useState("product");
  const [selectedId, setSelectedId] = useState(text(item?.id));
  const [qty, setQty] = useState(item?.quantity || 1);
  const [issueDescription, setIssueDescription] = useState(text(item?.issueDescription));
  const [selectedKits, setSelectedKits] = useState({});
  const [kits, setKits] = useState([]);
  const [kitFolders, setKitFolders] = useState([]);
  const [kitBrowserOpen, setKitBrowserOpen] = useState(false);
  const [kitLibraryLoaded, setKitLibraryLoaded] = useState(false);
  const [kitLibraryLoading, setKitLibraryLoading] = useState(false);
  const [kitLibraryError, setKitLibraryError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = products.find((product) => product.id === selectedId) || null;
  const selectedKitCount = Object.keys(selectedKits).length;
  const selectedKitNames = Object.keys(selectedKits).map((id) => kits.find((kit) => kit.id === id)?.name).filter(Boolean);

  const loadKitLibrary = async () => {
    if (kitLibraryLoading) return;
    setKitLibraryLoading(true);
    setKitLibraryError("");
    try {
      const [kitsBody, foldersBody] = await Promise.all([
        requestJson(`/next/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/next/api/products/kit-folders?_ts=${Date.now()}`),
      ]);
      setKits((Array.isArray(kitsBody?.kits) ? kitsBody.kits : []).map(normalizeKit));
      setKitFolders((Array.isArray(foldersBody?.folders) ? foldersBody.folders : []).map(normalizeKitFolder));
      setKitLibraryLoaded(true);
    } catch (loadError) {
      setKitLibraryError(loadError?.message || "The kit library could not be loaded.");
    } finally {
      setKitLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "kit" && !kitLibraryLoaded && !kitLibraryLoading && !kitLibraryError) loadKitLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const switchMode = (nextMode) => {
    if (item) return;
    setMode(nextMode);
    setError("");
    if (nextMode === "kit" && !kitLibraryLoaded && !kitLibraryLoading) loadKitLibrary();
  };

  const toggleKit = (kitId) => {
    setSelectedKits((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, kitId)) delete next[kitId];
      else next[kitId] = 1;
      return next;
    });
    setError("");
  };

  const setKitQuantity = (kitId, value) => {
    const parsed = Math.max(1, Math.round(number(value, 1) || 1));
    setSelectedKits((current) => ({ ...current, [kitId]: parsed }));
  };

  const submit = async () => {
    setError("");
    if (mode === "product") {
      if (!selected) return setError("Select a component first.");
      if (maintenance && !text(issueDescription)) return setError("Issue Description is required for maintenance requests.");
      if (!maintenance && quantity(qty, 0) <= 0) return setError("Quantity must be greater than zero.");
      setSubmitting(true);
      try {
        await onSave({
          mode: "product",
          item: { id: selected.id, quantity: maintenance ? 1 : quantity(qty, 1), issueDescription: maintenance ? text(issueDescription) : "", schoolId: text(item?.schoolId) },
        });
      } catch (saveError) {
        setError(saveError?.message || "The component could not be added.");
        setSubmitting(false);
      }
      return;
    }

    const selections = Object.entries(selectedKits).map(([kitId, kitQty]) => ({ id: kitId, quantity: Math.max(1, Math.round(number(kitQty, 1) || 1)) }));
    if (!selections.length) return setError("Choose at least one kit.");
    if (maintenance && !text(issueDescription)) return setError("Issue Description is required for maintenance requests.");
    setSubmitting(true);
    try {
      await onSave({ mode: "kit", selections, issueDescription: maintenance ? text(issueDescription) : "" });
    } catch (saveError) {
      setError(saveError?.message || "The selected kit could not be added.");
      setSubmitting(false);
    }
  };

  const actionLabel = item
    ? "Save changes"
    : mode === "kit"
      ? selectedKitCount
        ? `Add ${selectedKitCount} Kit${selectedKitCount === 1 ? "" : "s"}`
        : "Add Kits"
      : "Add component";

  return (
    <div className="classic-cart-modal-overlay classic-cart-picker-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section className="classic-cart-modal-card classic-cart-modal-card--modern" role="dialog" aria-modal="true" aria-labelledby="classic-cart-modal-title">
        <header className="classic-cart-picker-head">
          <span className="classic-cart-picker-head-icon"><CartSvgIcon name={isMaintenance(type) ? "tool" : isWithdraw(type) ? "log-out" : "shopping-cart"} size={24}/></span>
          <div className="classic-cart-picker-head-copy">
            <span>{item ? "Edit cart item" : "Add to cart"}</span>
            <h3 id="classic-cart-modal-title">{item ? "Edit component" : isWithdraw(type) ? "Add to Withdraw Products" : isMaintenance(type) ? "Add Maintenance Item" : "Add to Request Products"}</h3>
            <p>{item ? "Update this component without changing the rest of the cart." : maintenance ? "Choose one component and describe the maintenance issue." : "Choose a component directly or add all components from one or more kits."}</p>
          </div>
          <button className="classic-cart-picker-close" type="button" onClick={onClose} disabled={submitting} aria-label="Close"><CartSvgIcon name="x" size={22}/></button>
        </header>

        {!item && !maintenance ? (
          <div className="classic-cart-picker-tabs" role="tablist" aria-label="Add source">
            <button type="button" className={mode === "product" ? "is-active" : ""} onClick={() => switchMode("product")} role="tab" aria-selected={mode === "product"}>
              <CartSvgIcon name="package" size={18}/><span><strong>Component</strong><small>Select one product</small></span>
            </button>
            <button type="button" className={mode === "kit" ? "is-active" : ""} onClick={() => switchMode("kit")} role="tab" aria-selected={mode === "kit"}>
              <CartSvgIcon name="layers" size={18}/><span><strong>Kit</strong><small>Add a reusable kit</small></span>
            </button>
          </div>
        ) : null}

        <div className="classic-cart-picker-body">
          {mode === "product" ? (
            <div className="classic-cart-picker-section">
              <div className="classic-cart-picker-label-row"><span>Component <em>*</em></span><small>{products.length} available</small></div>
              <ProductCombobox products={products} value={selectedId} onChange={(id) => { setSelectedId(id); setError(""); }} disabled={submitting}/>

              {!maintenance ? (
                <div className="classic-cart-picker-qty-row">
                  <label className="classic-cart-modern-field">
                    <span>Quantity <em>*</em></span>
                    <div className="classic-cart-modern-qty">
                      <input type="number" min="0.01" step="0.01" value={qty} onChange={(event) => setQty(event.target.value)} disabled={submitting}/>
                      <b>{selected?.unit || "Unit"}</b>
                    </div>
                  </label>
                  {selected ? (
                    <div className="classic-cart-picker-product-summary">
                      <span>Estimated total</span><strong>{formatMoney(selected.unitPrice * quantity(qty, 1))}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="classic-cart-picker-section classic-cart-picker-section--kit">
              <div className="classic-cart-picker-label-row"><span>Kits <em>*</em></span><small>{kitLibraryLoaded ? `${kits.length} available` : "Kit library"}</small></div>
              <button
                type="button"
                className={`classic-cart-kit-trigger ${selectedKitCount ? "has-value" : ""}`}
                onClick={() => { if (!kitLibraryLoaded && !kitLibraryLoading) loadKitLibrary(); setKitBrowserOpen(true); }}
                disabled={submitting}
              >
                <span className="classic-cart-kit-trigger-icon"><CartSvgIcon name="layers" size={22}/></span>
                <span className="classic-cart-kit-trigger-copy">
                  <small>Kit library</small>
                  <strong>{selectedKitCount ? `${selectedKitCount} kit${selectedKitCount === 1 ? "" : "s"} selected` : "Select kits"}</strong>
                  <em>{selectedKitCount ? selectedKitNames.slice(0, 3).join(" · ") + (selectedKitCount > 3 ? ` +${selectedKitCount - 3}` : "") : "Browse folders, search and choose quantities"}</em>
                </span>
                <CartSvgIcon name="arrow-right" size={19}/>
              </button>
              {kitLibraryError && !kitBrowserOpen ? <button className="classic-cart-kit-inline-error" type="button" onClick={loadKitLibrary}>Kit library unavailable — tap to retry</button> : null}
            </div>
          )}

          {maintenance ? (
            <label className="classic-cart-modern-field classic-cart-modern-field--issue">
              <span>Issue Description <em>*</em></span>
              <textarea value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder={mode === "kit" ? "Describe the issue that applies to the selected kit components..." : "Describe the issue..."} rows={3} disabled={submitting}/>
              {mode === "kit" ? <small>This description will be applied to every component added from the selected kits.</small> : null}
            </label>
          ) : null}

          {error ? <p className="classic-cart-modal-error">{error}</p> : null}
        </div>

        <footer className="classic-cart-picker-actions">
          <button className="classic-cart-btn-ghost" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="classic-cart-btn-solid" type="button" onClick={submit} disabled={submitting}>
            {submitting ? <><span className="classic-cart-button-spinner"/> Adding...</> : actionLabel}
          </button>
        </footer>
      </section>

      {kitBrowserOpen ? (
        <KitBrowserDialog
          kits={kits}
          folders={kitFolders}
          selectedKits={selectedKits}
          onToggleKit={toggleKit}
          onQuantityChange={setKitQuantity}
          onClose={() => setKitBrowserOpen(false)}
          loading={kitLibraryLoading}
          error={kitLibraryError}
          onRetry={loadKitLibrary}
        />
      ) : null}
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
  const [submittedOrder, setSubmittedOrder] = useState(null);
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
      navigateWithinApp("/next/orders");
      return;
    }
    setSelectedType("");
    setBrowserType("");
    setCart([]);
    setReason("");
    setPassword("");
  };

  const savePickerSelection = async (selection) => {
    if (maintenance && selection?.mode === "kit") {
      throw new Error("Maintenance requests can include only one component.");
    }

    if (maintenance && !picker?.item && cart.length >= 1) {
      throw new Error("A maintenance request can include only one component.");
    }

    if (selection?.mode === "kit") {
      const entries = Array.isArray(selection?.selections) ? selection.selections : [];
      if (!entries.length) throw new Error("Choose at least one kit.");
      const next = [...cart];
      let addedComponents = 0;

      for (const entry of entries) {
        const kitId = text(entry?.id);
        const multiplier = Math.max(1, Math.round(number(entry?.quantity, 1) || 1));
        if (!kitId) continue;
        const kitBody = await requestJson(`/next/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
        const kitItems = Array.isArray(kitBody?.items) ? kitBody.items : [];
        for (const kitItem of kitItems) {
          const productId = text(kitItem?.productId || kitItem?.product_id);
          if (!productId) continue;
          const sourceQuantity = Math.max(1, Math.round(number(kitItem?.quantity, 1) || 1)) * multiplier;
          const targetIndex = next.findIndex((row) => row.id === productId);
          if (targetIndex >= 0) {
            if (maintenance) {
              next[targetIndex] = {
                ...next[targetIndex],
                quantity: 1,
                issueDescription: text(selection?.issueDescription) || next[targetIndex].issueDescription,
              };
            } else {
              next[targetIndex] = {
                ...next[targetIndex],
                quantity: quantity(next[targetIndex].quantity, 1) + sourceQuantity,
              };
            }
          } else {
            next.push(normalizeDraftItem({
              id: productId,
              quantity: maintenance ? 1 : sourceQuantity,
              reason,
              issueDescription: maintenance ? text(selection?.issueDescription) : "",
            }));
          }
          addedComponents += 1;
        }
      }

      if (!addedComponents) throw new Error("The selected kit has no components.");
      setCart(next);
      await persistDraft(next);
      setPicker(null);
      return;
    }

    const draftItem = selection?.item || selection;
    const next = [...cart];
    const previousId = text(picker?.item?.id);
    if (previousId && previousId !== draftItem.id) {
      const previousIndex = next.findIndex((item) => item.id === previousId);
      if (previousIndex >= 0) next.splice(previousIndex, 1);
    }
    const normalized = normalizeDraftItem({ ...draftItem, reason });
    const targetIndex = next.findIndex((item) => item.id === normalized.id);
    if (targetIndex >= 0) next[targetIndex] = normalized;
    else next.push(normalized);
    setCart(next);
    await persistDraft(next);
    setPicker(null);
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
    if (maintenance && cart.length > 1) {
      setNotice({ type: "error", title: "One component only", message: "A maintenance request can include only one component. Remove the extra component before submitting." });
      return;
    }
    if (maintenance && cart.some((item) => !text(item.issueDescription))) {
      setNotice({ type: "error", title: "Issue Description required", message: "The maintenance component must include an Issue Description." });
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
      setReason("");
      setPassword("");

      if (editMode) {
        setNotice({
          type: "success",
          title: "Order updated",
          message: response?.message || "The order was saved successfully.",
        });
        window.setTimeout(() => { navigateWithinApp("/next/orders"); }, 850);
      } else {
        setNotice(null);
        setSubmittedOrder({
          key: `${response?.orderId || response?.orderNumber || "order"}:${Date.now()}`,
          orderId: text(response?.orderId) || (response?.orderNumber ? `ORD-${response.orderNumber}` : "Order created"),
          orderType: selectedType,
          nextStep: text(response?.nextStatusStep) || "Waiting for approval",
          orderItems: Array.isArray(response?.orderItems) ? response.orderItems : [],
        });
      }
    } catch (error) {
      setNotice({ type: "error", title: "Submission failed", message: error?.message || "The order could not be submitted." });
    } finally {
      setBusy(false);
    }
  };

  const undoSubmittedOrder = async (submission) => {
    const orderPageIds = (Array.isArray(submission?.orderItems) ? submission.orderItems : [])
      .map((item) => text(item?.orderPageId))
      .filter(Boolean);

    try {
      await requestJson("/api/orders/current/undo-submit", {
        method: "POST",
        body: JSON.stringify({
          orderId: text(submission?.orderId),
          orderPageIds,
        }),
      });
      setNotice({
        type: "success",
        title: "Order undone",
        message: `${text(submission?.orderId) || "The order"} was removed successfully.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Undo failed",
        message: error?.message || "The order could not be removed.",
      });
      throw error;
    }
  };

  if (!selectedType) {
    return (
      <section className="classic-cart-page">
        {bootstrapWarnings.length ? (
          <div className="dashboard-notice">
            <strong>Partial initial data</strong>
            <span>One Shopping Cart resource was not available.</span>
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
    <section className={`classic-cart-page ${maintenance ? "is-maintenance" : ""} ${typeTheme}`}>
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice">
          <strong>Partial initial data</strong>
          <span>One Shopping Cart resource was not available.</span>
        </div>
      ) : null}

      <div className={`classic-cart-type-pill ${typeTheme}`}>
        {editMode ? (
          <button className="classic-cart-back-btn" type="button" onClick={backToTypes} aria-label="Back to Current Orders">
            <CartSvgIcon name="arrow-left" size={16}/>
          </button>
        ) : null}
        <div className="classic-cart-flow-heading">
          <span className="classic-cart-flow-heading-icon"><CartSvgIcon name={meta.icon} size={20}/></span>
          <span className="classic-cart-flow-heading-copy">
            <small>Shopping flow</small>
            <strong>{selectedType}</strong>
            <span>{meta.description}</span>
          </span>
        </div>
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
                <button
                  className={`classic-cart-add-new ${typeTheme}`}
                  type="button"
                  onClick={() => setPicker({ item: null })}
                  aria-label={`Add new item to ${selectedType}`}
                >
                  <span className="classic-cart-add-new-copy">
                    <strong>Add new</strong>
                    <small>{maintenance ? "Add a product and describe the maintenance issue" : withdraw ? "Select products to withdraw from stock" : "Select products or supplies for this request"}</small>
                  </span>
                  <span className="classic-cart-add-new-plus"><CartSvgIcon name="plus" size={30}/></span>
                </button>
              </div>
            )}

            {cart.length && !maintenance ? (
              <div className="classic-cart-footer">
                <button className="classic-cart-update-btn" type="button" onClick={() => setPicker({ item: null })}>
                  <CartSvgIcon name="plus" size={17}/>
                  <span>{withdraw ? "Add to Withdraw Cart" : "Add to Cart"}</span>
                </button>
              </div>
            ) : null}
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
          onSave={savePickerSelection}
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

      {submittedOrder ? (
        <OrderSubmissionBar
          key={submittedOrder.key}
          submission={submittedOrder}
          onDone={setSubmittedOrder}
          onUndo={undoSubmittedOrder}
        />
      ) : null}
      <Toast notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
