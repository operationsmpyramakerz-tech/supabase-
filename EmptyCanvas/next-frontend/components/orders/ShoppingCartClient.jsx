"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDelete } from "../../lib/client-confirm";
import dynamic from "next/dynamic";
import { navigateWithinApp } from "../../lib/client-navigation";
import { ShoppingCartPrioritySelect } from "./ShoppingCartMetaControls";
import { parseCartQuantityInput, stepCartQuantityInput } from "../../lib/shopping-cart-quantity-input.mjs";
import { cartProductResource } from "../../lib/shopping-cart-product-resource.mjs";

const ProductPicker = dynamic(() => import("./ShoppingCartDialogs").then((module) => module.ProductPicker), { ssr: false });
const ProductAdditionForm = dynamic(() => import("./ProductAdditionForm"), { ssr: false });
const OrderSubmissionBar = dynamic(() => import("./ShoppingCartDialogs").then((module) => module.OrderSubmissionBar), { ssr: false });

const DEFAULT_ORDER_TYPES = ["Request Products", "Withdraw Products", "Request Maintenance"];
const DIRECT_API_BASE = "/next/api";
// Keep the edit transfer long enough to restore the account-scoped draft.
// The server independently enforces the signed 24-hour authorization window.
const EDIT_TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CART_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TYPE_META = {
  requestproducts: {
    label: "Request Products",
    icon: "shopping-cart",
    className: "request",
    description: "",
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

const ORDER_PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function safePriority(value) {
  const clean = text(value);
  return ORDER_PRIORITIES.find((option) => option.toLowerCase() === clean.toLowerCase()) || "";
}

function safeDeliveryDate(value) {
  const clean = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
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
    attachments: Array.isArray(product?.attachments)
      ? product.attachments.filter((file) => file?.url && file?.name).map((file) => ({
          name: text(file.name), url: normalizedUrl(file.url), size: Number(file.size) || 0,
        })).filter((file) => file.url)
      : [],
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeDraftItem(item) {
  return {
    id: text(item?.id),
    orderRowId: text(item?.orderRowId),
    quantity: quantity(item?.quantity, 1),
    reason: text(item?.reason),
    issueDescription: text(item?.issueDescription),
    schoolId: text(item?.schoolId),
    expectedSparePartId: text(item?.expectedSparePartId),
    customProduct: item?.customProduct && typeof item.customProduct === "object" ? { ...item.customProduct } : null,
    kitSourceIds: [...new Set((Array.isArray(item?.kitSourceIds) ? item.kitSourceIds : []).map(text).filter(Boolean))].slice(0, 15),
  };
}

function draftItemKey(item) {
  return item?.orderRowId ? `order-row:${item.orderRowId}` : `product:${item?.id}`;
}

function normalizeDraft(items) {
  const unique = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeDraftItem(raw);
    if (item.id) unique.set(draftItemKey(item), item);
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
  // An edit URL must identify its own transfer. Never open a different order's
  // pending/fallback cart when this particular transfer is missing or expired.
  if (!text(editKey)) return null;
  for (const storage of storageAreas()) {
    try {
      const payload = parseJson(storage.getItem(`shopping_cart:edit_payload:v2:${editKey}`));
      if (freshTransfer(payload) && Array.isArray(payload.products)) return payload;
    } catch {}
  }
  return null;
}

function clearEditTransfer(editKey = "") {
  if (!text(editKey)) return;
  const exactKey = `shopping_cart:edit_payload:v2:${editKey}`;
  for (const storage of storageAreas()) {
    try {
      const transfer = parseJson(storage.getItem(exactKey));
      const pending = parseJson(storage.getItem("shopping_cart:edit_pending:v2"));
      const remove = [exactKey];
      // A different tab may be editing another order. Only clear this edit's
      // transfer, never all saved transfers in the browser.
      if (pending?.key === editKey) {
        remove.push("shopping_cart:edit_pending:v2", "shopping_cart:edit_target_type:v1");
      }
      if (text(transfer?.editToken)) {
        for (let index = 0; index < storage.length; index += 1) {
          const storageKey = storage.key(index) || "";
          if (storageKey.startsWith("shopping_cart:edit_fallback:v1:") &&
              parseJson(storage.getItem(storageKey))?.editToken === transfer.editToken) remove.push(storageKey);
        }
      }
      remove.forEach(storageKey => storage.removeItem(storageKey));
    } catch {}
  }
}

function storageKeyPart(value, fallback = "default") {
  const clean = text(value).toLowerCase().slice(0, 180);
  return encodeURIComponent(clean || fallback);
}

function cartDraftStorageKey({ draftScope = "account", type = "", editMode = false, editKey = "" } = {}) {
  const scope = storageKeyPart(draftScope, "account");
  const typeKey = storageKeyPart(key(type), "default");
  const modeKey = editMode
    ? `edit:${storageKeyPart(editKey || typeKey, "default")}`
    : `new:${typeKey}`;
  return `shopping_cart:draft:v3:${scope}:${modeKey}`;
}

function readCartDraft(options = {}) {
  const storageKey = cartDraftStorageKey(options);
  const candidates = [];
  for (const storage of storageAreas()) {
    try {
      const payload = parseJson(storage.getItem(storageKey));
      if (!payload) continue;
      const ts = number(payload?.ts);
      if (!ts || Date.now() - ts > CART_DRAFT_TTL_MS) {
        storage.removeItem(storageKey);
        continue;
      }
      if (key(payload?.orderType) && key(payload.orderType) !== key(options?.type)) continue;
      candidates.push(payload);
    } catch {}
  }
  candidates.sort((left, right) => number(right?.ts) - number(left?.ts));
  return candidates[0] || null;
}

// Restore only the draft belonging to this exact signed transfer, with all
// original rows accounted for. Never infer a deletion from a missing row.
function restoreEditDraft(transfer, draft) {
  if (!draft) return null;
  if (text(draft.editToken) !== text(transfer.editToken)) return null;
  const items = normalizeDraft(draft.products);
  const expected = new Set(transfer.products.map(item => text(item.orderRowId)));
  const removed = Array.isArray(draft.removedOrderRowIds) ? draft.removedOrderRowIds.map(text) : [];
  const accounted = [...items.map(item => item.orderRowId).filter(Boolean), ...removed];
  if (!Array.isArray(draft.products) || items.length !== draft.products.length ||
      accounted.length !== expected.size || new Set(accounted).size !== expected.size ||
      accounted.some(id => !expected.has(id))) {
    throw new Error("The saved edit draft is incomplete. No order changes were submitted. Reopen the order to start a new edit.");
  }
  return { ...draft, products: items, removedOrderRowIds: removed };
}

function writeCartDraft({ draftScope = "account", type = "", editMode = false, editKey = "", products = [], reason = "", priorityLevel = "", requestedDeliveryDate = "", editToken = "", removedOrderRowIds = [] } = {}) {
  const storageKey = cartDraftStorageKey({ draftScope, type, editMode, editKey });
  const cleanProducts = normalizeDraft(products);
  const stores = storageAreas();
  if (!cleanProducts.length && !editMode) {
    for (const storage of stores) {
      try { storage.removeItem(storageKey); } catch {}
    }
    return true;
  }

  const payload = JSON.stringify({
    ts: Date.now(),
    orderType: text(type),
    reason: text(reason),
    priorityLevel: safePriority(priorityLevel),
    requestedDeliveryDate: safeDeliveryDate(requestedDeliveryDate),
    products: cleanProducts,
    editToken: editMode ? text(editToken) : "",
    ...(editMode ? { removedOrderRowIds: [...removedOrderRowIds] } : {}),
  });
  let saved = false;
  for (const storage of stores) {
    try {
      storage.setItem(storageKey, payload);
      saved = true;
    } catch {}
  }
  return saved;
}

function clearCartDraft(options = {}) {
  const storageKey = cartDraftStorageKey(options);
  for (const storage of storageAreas()) {
    try { storage.removeItem(storageKey); } catch {}
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
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    "list-check": <><path d="M9 6h12M9 12h12M9 18h12"/><path d="m2 6 2 2 3-4m-5 10 2 2 3-4"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    search: <><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    package: <><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></>,
    flag: <><path d="M4 22V4"/><path d="M4 4c3-3 6 3 10 0s6 0 6 0v12c-3-3-6 0-10 0s-6 0-6 0"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M8 6V4h8v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
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
              <span className="classic-cart-order-type-copy"><strong>{type}</strong>{meta.description ? <small>{meta.description}</small> : null}</span>
              <span className="classic-cart-order-type-arrow"><CartSvgIcon name="arrow-right" size={18}/></span>
            </button>
          );
        }) : <div className="classic-cart-order-type-loading"><span/><strong>No order types found.</strong></div>}
      </div>
    </section>
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

// Allow direct quantity entry without saving an incomplete number on each keystroke.
// The existing +/- controls still work, including for fractional quantities.
function CartQuantityEditor({ item, product, withdraw, onQuantityChange }) {
  const qty = quantity(item.quantity, 1);
  const [draft, setDraft] = useState(() => formatQuantity(qty));
  const [editing, setEditing] = useState(false);
  const stepping = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(formatQuantity(qty));
  }, [qty, editing]);

  const parseDraft = () => parseCartQuantityInput(draft, qty);
  const commit = () => {
    if (stepping.current) return;
    if (cancelled.current) { cancelled.current = false; setEditing(false); return; }
    const next = parseDraft();
    setDraft(formatQuantity(next));
    setEditing(false);
    if (next !== qty) onQuantityChange(draftItemKey(item), next);
  };
  const adjust = (delta) => {
    stepping.current = false;
    const next = stepCartQuantityInput(draft, qty, delta);
    setDraft(formatQuantity(next));
    setEditing(false);
    if (next !== qty) onQuantityChange(draftItemKey(item), next);
  };
  const onInput = (event) => {
    const next = event.target.value;
    if (/^\d*(?:[.,]\d{0,3})?$/.test(next)) setDraft(next);
  };

  return <div className="classic-cart-qty-control">
    <button className="classic-cart-qty-step classic-cart-qty-step--minus" type="button"
      onPointerDown={() => { stepping.current = true; }} onPointerCancel={() => { stepping.current = false; }}
      onClick={() => adjust(-1)} aria-label={`Decrease ${product.name} quantity`}>
      <CartSvgIcon name="minus" size={15}/>
    </button>
    <span className="classic-cart-qty-editable">
      {withdraw ? <span className="classic-cart-qty-sign" aria-hidden="true">−</span> : null}
      <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        aria-label={`Quantity for ${product.name}`} value={draft}
        onFocus={event => { cancelled.current = false; setEditing(true); event.currentTarget.select(); }}
        onChange={onInput} onBlur={commit}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { cancelled.current = true; setDraft(formatQuantity(qty)); event.currentTarget.blur(); }
        }}/>
    </span>
    <button className="classic-cart-qty-step classic-cart-qty-step--plus" type="button"
      onPointerDown={() => { stepping.current = true; }} onPointerCancel={() => { stepping.current = false; }}
      onClick={() => adjust(1)} aria-label={`Increase ${product.name} quantity`}>
      <CartSvgIcon name="plus" size={15}/>
    </button>
  </div>;
}

function CartProductResourceLink({ product }) {
  const resource = cartProductResource(product);
  if (!resource.href) {
    return <button className="classic-cart-action classic-cart-action--open" type="button" disabled
      aria-label="No product link" title="No product link"><CartSvgIcon name="external-link" size={17}/></button>;
  }
  return (
    <a className="classic-cart-action classic-cart-action--open" href={resource.href}
      target={resource.isZip ? undefined : "_blank"} rel={resource.isZip ? undefined : "noopener noreferrer"}
      title={resource.isZip ? `Download ZIP (${resource.fileCount} files)` : "Open product"}
      aria-label={resource.isZip ? `Download all ${resource.fileCount} files for ${product.name} as ZIP` : `Open ${product.name}`}>
      <CartSvgIcon name={resource.isZip ? "download" : "external-link"} size={17}/>
    </a>
  );
}

function CartItem({ item, product, type, index, onEdit, onDelete, onQuantityChange }) {
  const maintenance = isMaintenance(type);
  const withdraw = isWithdraw(type);
  const qty = quantity(item.quantity, 1);
  const total = product.unitPrice * qty * (withdraw ? -1 : 1);
  const pendingReview = Boolean(item.customProduct && item.orderRowId);
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
          <CartProductResourceLink product={product}/>
          <button className="classic-cart-action classic-cart-action--delete" type="button" onClick={() => onDelete(item)} title="Delete product" aria-label={`Delete ${product.name}`}><CartSvgIcon name="trash" size={17}/></button>
        </div>
      </article>
    );
  }

  return (
    <article className="classic-cart-row classic-cart-row--request-card">
      <div className="classic-cart-card-topline">
        <div className="classic-cart-card-main" role={pendingReview ? undefined : "button"} tabIndex={pendingReview ? undefined : 0} onClick={pendingReview ? undefined : () => onEdit(item)} onKeyDown={pendingReview ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(item); } }}>
          <CartThumb product={product} index={index}/>
          <span className="classic-cart-prod-meta">
            <strong>{product.name}</strong>
            {product.displayId ? <small className="part">Part No: {product.displayId}</small> : null}
            {item.customProduct ? <small className="classic-cart-new-item-badge">{pendingReview ? "Pending Catalog Approval · Read only" : "New · Pending Catalog Approval"}</small> : null}
          </span>
        </div>
        <div className="classic-cart-card-actions classic-cart-card-actions--compact">
          <CartProductResourceLink product={product}/>
          <button className="classic-cart-action classic-cart-action--delete" type="button" onClick={() => onDelete(item)} disabled={pendingReview} aria-label={`Delete ${product.name}`} title={pendingReview ? "Pending catalog review" : "Delete product"}><CartSvgIcon name="trash" size={17}/></button>
        </div>
      </div>
      <div className="classic-cart-card-metrics">
        <div className="classic-cart-card-metric classic-cart-card-metric--qty">
          <span>Qty</span>
          <div className="classic-cart-card-qty-unit-row">
            {pendingReview ? <strong className="classic-cart-unit-badge" title="Pending catalog review">{formatQuantity(qty)}</strong> : <CartQuantityEditor item={item} product={product} withdraw={withdraw} onQuantityChange={onQuantityChange}/>}
            <strong className="classic-cart-unit-badge" title={product.unit}>{product.unit}</strong>
          </div>
        </div>
        <div className="classic-cart-card-metric"><span>Unit Price</span><strong>{formatMoney(product.unitPrice)}</strong></div>
        <div className="classic-cart-card-metric classic-cart-card-metric--total"><span>Total</span><strong>{formatMoney(total)}</strong></div>
      </div>
    </article>
  );
}


function SlideToSubmit({ onSubmit, disabled = false, label = "Slide to submit" }) {
  const trackRef = useRef(null);
  const knobRef = useRef(null);
  const dragRef = useRef({ active: false, pointerId: null, startX: 0, startOffset: 0 });
  const [offset, setOffset] = useState(0);
  const [maxTravel, setMaxTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const measure = () => {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return;
    const styles = window.getComputedStyle(track);
    const inset = Number.parseFloat(styles.getPropertyValue("--slide-inset")) || 5;
    const nextMax = Math.max(0, track.clientWidth - knob.offsetWidth - (inset * 2));
    setMaxTravel(nextMax);
    setOffset((current) => Math.min(current, nextMax));
  };

  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!disabled && !submitting) return;
    dragRef.current.active = false;
    setDragging(false);
  }, [disabled, submitting]);

  const reset = () => {
    setDragging(false);
    setOffset(0);
  };

  const complete = async () => {
    if (disabled || submitting) return;
    setOffset(maxTravel);
    setSubmitting(true);
    let submitted = false;
    try {
      submitted = (await onSubmit?.()) === true;
    } finally {
      window.setTimeout(() => {
        setSubmitting(false);
        reset();
      }, submitted ? 520 : 180);
    }
  };

  const onPointerDown = (event) => {
    if (disabled || submitting || event.button > 0) return;
    measure();
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: offset,
      lastOffset: offset,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId || disabled || submitting) return;
    const next = Math.max(0, Math.min(maxTravel, drag.startOffset + event.clientX - drag.startX));
    drag.lastOffset = next;
    setOffset(next);
  };

  const finishPointer = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    dragRef.current.active = false;
    setDragging(false);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    const finalOffset = Number.isFinite(drag.lastOffset) ? drag.lastOffset : offset;
    if (!disabled && !submitting && maxTravel > 0 && finalOffset >= maxTravel * 0.84) {
      complete();
    } else {
      setOffset(0);
    }
  };

  const progress = maxTravel > 0 ? Math.max(0, Math.min(1, offset / maxTravel)) : 0;

  return (
    <div
      ref={trackRef}
      className={`classic-cart-submit-slider${dragging ? " is-dragging" : ""}${submitting ? " is-submitting" : ""}${disabled ? " is-disabled" : ""}`}
      style={{
        "--slide-progress": progress,
        "--slide-offset": `${offset}px`,
        "--slide-label-opacity": Math.max(0, 1 - (progress * 1.35)),
        "--slide-label-shift": `${Math.round(progress * 14)}px`,
        "--slide-fill-opacity": Math.max(.92, .98 - (progress * .05)),
      }}
      aria-label={label}
    >
      <span className="classic-cart-submit-slider-fill" aria-hidden="true"/>
      <span className="classic-cart-submit-slider-label" aria-hidden="true">
        {submitting ? "Submitting…" : label}
      </span>
      <button
        ref={knobRef}
        className="classic-cart-submit-slider-knob"
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        disabled={disabled || submitting}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !submitting) {
            event.preventDefault();
            complete();
          }
        }}
      >
        <span className="classic-cart-submit-slider-chevrons" aria-hidden="true">
          <i/><i/><i/>
        </span>
      </button>
    </div>
  );
}

export default function ShoppingCartClient({
  permissions = {},
  initialOrderTypes = [],
  initialComponents = [],
  initialTags = [],
  initialUnits = [],
  initialDraft = {},
  initialType = "",
  editMode = false,
  editKey = "",
  draftScope = "account",
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
  const tags = useMemo(() => [...new Set([
    ...(Array.isArray(initialTags) ? initialTags : []), ...products.flatMap(product => product.tags),
  ].map(text).filter(Boolean))], [initialTags, products]);
  const units = useMemo(() => [...new Set([
    ...(Array.isArray(initialUnits) ? initialUnits : []),
    "Piece", "Pack", "Kilogram", "Metre", "Inch",
    ...products.map(product => product.unit),
  ].map(text).filter(Boolean))], [initialUnits, products]);

  const [selectedType, setSelectedType] = useState(text(initialType));
  const [cart, setCart] = useState(() => normalizeDraft(initialDraft?.products));
  const [reason, setReason] = useState(() => text(initialDraft?.reason) || normalizeDraft(initialDraft?.products).find((item) => item.reason)?.reason || "");
  const [priorityLevel, setPriorityLevel] = useState(() => safePriority(initialDraft?.priorityLevel));
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(() => safeDeliveryDate(initialDraft?.requestedDeliveryDate));
  const [picker, setPicker] = useState(null);
  const [additionEditor, setAdditionEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [notice, setNotice] = useState(null);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [checkoutCommitted, setCheckoutCommitted] = useState(false);
  const [activeEditTransfer, setActiveEditTransfer] = useState(null);
  const removedOrderRows = useRef(new Set());
  const [validationFeedback, setValidationFeedback] = useState({ cart: false, reason: false, priority: false, deliveryDate: false });
  const reasonTimer = useRef(null);
  const validationTimer = useRef(null);
  const reasonInputRef = useRef(null);
  const mounted = useRef(false);

  const meta = orderTypeMeta(selectedType);
  const maintenance = isMaintenance(selectedType);
  const withdraw = isWithdraw(selectedType);
  const allowComponents = maintenance || permissions.components !== false;
  const allowKits = !maintenance && permissions.kits !== false;
  const itemCount = cart.length;
  const canAddNewComponent = !maintenance && !withdraw && key(selectedType) === "requestproducts" && allowComponents
    && (!editMode || (permissions.edit_submit === true && !!activeEditTransfer));

  useEffect(() => {
    const heading = selectedType
      ? (isWithdraw(selectedType) ? "Withdraw Products" : isMaintenance(selectedType) ? "Request Maintenance" : "Shopping Cart")
      : "Shopping Cart";
    const titleEl = document.querySelector(".classic-app-shell .dash-title");
    const searchEl = document.querySelector(".classic-app-shell .searchbar input");
    const titleLabel = titleEl?.querySelector(".erp-title-chevron-label");
    if (titleLabel) titleLabel.textContent = editMode && selectedType ? `Edit ${heading}` : heading;
    if (searchEl) searchEl.setAttribute("placeholder", `Search in ${heading}`);
    document.title = `${editMode && selectedType ? "Edit " : ""}${heading}`;
  }, [selectedType, editMode]);

  const total = cart.reduce((sum, item) => {
    const product = item.customProduct
      ? normalizeProduct({ id: item.id, ...item.customProduct }) : productMap.get(item.id);
    if (!product || maintenance) return sum;
    return sum + product.unitPrice * quantity(item.quantity, 1) * (withdraw ? -1 : 1);
  }, 0);

  const payloadFor = (items = cart, type = selectedType, globalReason = reason) => normalizeDraft(items).map((item) => ({
    id: item.id,
    ...(item.orderRowId ? { orderRowId: item.orderRowId } : {}),
    quantity: isMaintenance(type) ? 1 : quantity(item.quantity, 1),
    reason: isMaintenance(type) ? (text(item.issueDescription).slice(0, 80) || "Request Maintenance") : text(globalReason),
    issueDescription: isMaintenance(type) ? text(item.issueDescription) : "",
    schoolId: text(item.schoolId),
    expectedSparePartId: "",
    kitSourceIds: item.kitSourceIds,
    ...(item.customProduct ? { customProduct: item.customProduct } : {}),
  }));

  const persistDraft = async (items = cart, type = selectedType, globalReason = reason, { quiet = false, editTransfer = null, priorityValue = priorityLevel, deliveryDateValue = requestedDeliveryDate } = {}) => {
    const cleanType = text(type);
    if (!cleanType) return true;
    const cleanItems = normalizeDraft(items);
    try {
      if (!quiet) setSaveState("Saving…");
      const saved = writeCartDraft({
        draftScope,
        type: cleanType,
        editMode,
        editKey,
        products: cleanItems,
        reason: globalReason,
        priorityLevel: priorityValue,
        requestedDeliveryDate: deliveryDateValue,
        editToken: text(editTransfer?.editToken || activeEditTransfer?.editToken),
        removedOrderRowIds: [...removedOrderRows.current],
      });
      if (!saved && (cleanItems.length || editMode)) throw new Error("Browser storage is unavailable.");
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
      if (editMode) {
        const transfer = readEditTransfer(editKey);
        const transferItems = normalizeDraft(transfer?.products);
        if (!transfer || !text(transfer.editToken) || !transferItems.length ||
            transferItems.length !== transfer.products.length ||
            transferItems.some(item => !item.orderRowId) ||
            (transfer.count != null && transferItems.length !== transfer.count)) {
          throw new Error("The full order could not be loaded. Close edit mode and reopen the order.");
        }
        const transferReason = text(transfer.reason) || transferItems.find(item => item.reason)?.reason || "";
        const saved = restoreEditDraft(transfer, readCartDraft({ draftScope, type: cleanType, editMode, editKey }));
        const patched = saved ? saved.products : transferItems.map(item => ({ ...item, reason: item.reason || transferReason }));
        const nextReason = saved ? text(saved.reason) : transferReason;
        const nextPriority = safePriority(saved ? saved.priorityLevel : transfer.priorityLevel);
        const nextDeliveryDate = safeDeliveryDate(saved ? saved.requestedDeliveryDate : transfer.requestedDeliveryDate);
        removedOrderRows.current = new Set(saved?.removedOrderRowIds || []);
        setActiveEditTransfer(transfer);
        setCart(patched);
        setReason(isMaintenance(cleanType) ? "" : nextReason);
        setPriorityLevel(nextPriority);
        setRequestedDeliveryDate(nextDeliveryDate);
        await persistDraft(patched, cleanType, nextReason, {
          quiet: true, editTransfer: transfer,
          priorityValue: nextPriority,
          deliveryDateValue: nextDeliveryDate,
        });
        return;
      }

      const draft = fallback || readCartDraft({ draftScope, type: cleanType, editMode, editKey }) || {};
      let items = normalizeDraft(draft?.products);
      let nextReason = text(draft?.reason) || items.find((item) => item.reason)?.reason || "";

      const nextPriority = safePriority(draft?.priorityLevel);
      const nextDeliveryDate = safeDeliveryDate(draft?.requestedDeliveryDate);
      setCart(items);
      setReason(isMaintenance(cleanType) ? "" : nextReason);
      setPriorityLevel(nextPriority);
      setRequestedDeliveryDate(nextDeliveryDate);
      if (items.length && (!draft?.products?.length || (editMode && !text(draft?.reason) && nextReason))) {
        await persistDraft(items, cleanType, nextReason, {
          quiet: true,
          editTransfer: text(draft?.editToken) ? { editToken: text(draft.editToken) } : null,
          priorityValue: nextPriority,
          deliveryDateValue: nextDeliveryDate,
        });
      }
    } catch (error) {
      setActiveEditTransfer(null);
      setCart([]);
      setReason("");
      setPriorityLevel("");
      setRequestedDeliveryDate("");
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
    if (validationTimer.current) window.clearTimeout(validationTimer.current);
  }, []);

  const showValidationFeedback = ({ cart: cartMissing = false, reason: reasonMissing = false, priority: priorityMissing = false, deliveryDate: deliveryDateMissing = false } = {}) => {
    if (!cartMissing && !reasonMissing && !priorityMissing && !deliveryDateMissing) return;

    setNotice(null);
    if (validationTimer.current) window.clearTimeout(validationTimer.current);

    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([65, 35, 90]);
      }
    } catch {}

    // Remove the state for one frame so repeated invalid slides replay the pulse.
    setValidationFeedback({ cart: false, reason: false, priority: false, deliveryDate: false });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setValidationFeedback({ cart: cartMissing, reason: reasonMissing, priority: priorityMissing, deliveryDate: deliveryDateMissing });

        const target = cartMissing
          ? document.querySelector(".classic-cart-add-new")
          : (reasonMissing ? document.querySelector(".classic-cart-reason-card")
            : document.querySelector(".classic-cart-request-meta-fields"));
        target?.scrollIntoView?.({ behavior: "smooth", block: "center" });

        if (!cartMissing && reasonMissing) {
          window.setTimeout(() => reasonInputRef.current?.focus?.({ preventScroll: true }), 220);
        } else if (!cartMissing && priorityMissing) {
          window.setTimeout(() => document.querySelector(".classic-cart-meta-trigger")?.focus?.({ preventScroll: true }), 220);
        } else if (!cartMissing && deliveryDateMissing) {
          window.setTimeout(() => document.querySelector(".classic-cart-delivery-date-control input")?.focus?.({ preventScroll: true }), 220);
        }

        validationTimer.current = window.setTimeout(() => {
          setValidationFeedback({ cart: false, reason: false, priority: false, deliveryDate: false });
        }, 1150);
      });
    });
  };

  const chooseType = async (type) => {
    const clean = text(type);
    setSelectedType(clean);
    setBrowserType(clean);
    setPicker(null);
    setAdditionEditor(null);
    await loadDraft(clean);
  };

  const backToTypes = async () => {
    if (editMode && !checkoutCommitted) {
      if (reasonTimer.current) {
        window.clearTimeout(reasonTimer.current);
        reasonTimer.current = null;
      }
      clearCartDraft({ draftScope, type: selectedType, editMode: true, editKey });
      clearEditTransfer(editKey);
      navigateWithinApp("/next/orders");
      return;
    }
    setSelectedType("");
    setBrowserType("");
    setCart([]);
    setReason("");
    setPriorityLevel("");
    setRequestedDeliveryDate("");
  };

  const savePickerSelection = async (selection) => {
    if (maintenance && selection?.mode === "kit") {
      throw new Error("Maintenance requests can include only one component.");
    }

    if (maintenance && !picker?.item && cart.length >= 1) {
      throw new Error("A maintenance request can include only one component.");
    }

    if (selection?.mode === "kit") {
      if (!allowKits) throw new Error("Your account is not allowed to add Kits.");
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
                kitSourceIds: [...new Set([...(next[targetIndex].kitSourceIds || []), kitId])],
              };
            }
          } else {
            next.push(normalizeDraftItem({
              id: productId,
              quantity: maintenance ? 1 : sourceQuantity,
              kitSourceIds: [kitId],
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

    if (!allowComponents && !picker?.item) throw new Error("Your account is not allowed to select individual Components.");
    const draftItem = selection?.item || selection;
    const next = [...cart];
    const previous = picker?.item;
    const normalized = normalizeDraftItem({ ...draftItem, reason,
      orderRowId: previous?.orderRowId,
      kitSourceIds: !allowComponents ? (previous?.kitSourceIds || []) : (draftItem?.kitSourceIds || []),
    });
    if (previous?.orderRowId) {
      const previousIndex = next.findIndex(item => draftItemKey(item) === draftItemKey(previous));
      if (previousIndex < 0) throw new Error("The original component is no longer in the cart.");
      next[previousIndex] = normalized;
    } else {
      const previousIndex = previous ? next.findIndex(item => draftItemKey(item) === draftItemKey(previous)) : -1;
      if (previousIndex >= 0 && previous.id !== normalized.id) next.splice(previousIndex, 1);
      const targetIndex = next.findIndex(item => draftItemKey(item) === draftItemKey(normalized));
      if (targetIndex >= 0) next[targetIndex] = normalized;
      else next.push(normalized);
    }
    setCart(next);
    await persistDraft(next);
    setPicker(null);
  };

  const saveAddition = async (customProduct) => {
    if (!canAddNewComponent || additionEditor?.item?.orderRowId) {
      throw new Error("New components require Request Products and Components permission.");
    }
    const oldItem = additionEditor?.item;
    const id = oldItem?.id || `new:${crypto.randomUUID()}`;
    const nextItem = normalizeDraftItem({
      ...oldItem, id, quantity: customProduct.quantity, customProduct,
      reason,
    });
    const next = oldItem
      ? cart.map(item => draftItemKey(item) === draftItemKey(oldItem) ? nextItem : item)
      : [...cart, nextItem];
    setCart(next);
    await persistDraft(next);
    setAdditionEditor(null);
    setValidationFeedback(current => ({ ...current, cart: false }));
  };

  const deleteItem = async (item) => {
    if (item.customProduct && item.orderRowId) return;
    if (item.orderRowId) removedOrderRows.current.add(item.orderRowId);
    const next = cart.filter((row) => draftItemKey(row) !== draftItemKey(item));
    setCart(next);
    await persistDraft(next);
  };

  const updateQuantity = (id, value, options = { save: true }) => {
    const next = cart.map((item) => draftItemKey(item) === id ? { ...item, quantity: quantity(value, 1) } : item);
    setCart(next);
    if (options?.save !== false) persistDraft(next);
  };

  const updateReason = (value) => {
    setReason(value);
    if (text(value)) setValidationFeedback((current) => ({ ...current, reason: false }));
    if (reasonTimer.current) window.clearTimeout(reasonTimer.current);
    // Local storage is synchronous: save edit text immediately so a reload or
    // re-login cannot lose the last keystroke or replay a stale debounced cart.
    if (editMode) {
      reasonTimer.current = null;
      void persistDraft(cart, selectedType, value, { quiet: true });
      return;
    }
    reasonTimer.current = window.setTimeout(() => {
      if (cart.length) persistDraft(cart, selectedType, value, { quiet: false });
    }, 550);
  };

  const updatePriority = (value) => {
    const next = safePriority(value);
    setPriorityLevel(next);
    if (next) setValidationFeedback((current) => ({ ...current, priority: false }));
    if (cart.length || editMode) void persistDraft(cart, selectedType, reason, { quiet: true, priorityValue: next });
  };

  const updateDeliveryDate = (value) => {
    const next = safeDeliveryDate(value);
    setRequestedDeliveryDate(next);
    if (next) setValidationFeedback((current) => ({ ...current, deliveryDate: false }));
    if (cart.length || editMode) void persistDraft(cart, selectedType, reason, { quiet: true, deliveryDateValue: next });
  };

  const clearCart = async () => {
    if (!cart.length || cart.some(item => item.customProduct && item.orderRowId)) return;
    const confirmed = await confirmDelete({ title: "Clear cart?", itemType: "cart", message: "All products currently added to this cart will be removed." });
    if (!confirmed) return;
    for (const item of cart) if (item.orderRowId) removedOrderRows.current.add(item.orderRowId);
    setCart([]);
    await persistDraft([]);
  };

  const canSubmit = editMode ? permissions.edit_submit === true : permissions.submit === true;
  const checkout = async () => {
    if (!canSubmit || (editMode && !activeEditTransfer)) return false;
    const cartMissing = !cart.length;
    const reasonMissing = !maintenance && !text(reason);
    const priorityMissing = !maintenance && !text(priorityLevel);
    const deliveryDateMissing = !maintenance && !text(requestedDeliveryDate);
    if (cartMissing || reasonMissing || priorityMissing || deliveryDateMissing) {
      showValidationFeedback({ cart: cartMissing, reason: reasonMissing, priority: priorityMissing, deliveryDate: deliveryDateMissing });
      const missing = [reasonMissing && "Reason", priorityMissing && "Priority Level", deliveryDateMissing && "Delivery Date"].filter(Boolean);
      if (missing.length) setNotice({ type: "error", title: "Required fields missing", message: `Please complete ${missing.join(", ")} before submitting the order.` });
      return false;
    }
    if (maintenance && cart.length > 1) {
      setNotice({ type: "error", title: "One component only", message: "A maintenance request can include only one component. Remove the extra component before submitting." });
      return false;
    }
    if (maintenance && cart.some((item) => !text(item.issueDescription))) {
      setNotice({ type: "error", title: "Issue Description required", message: "The maintenance component must include an Issue Description." });
      return false;
    }
    if (!maintenance && !allowComponents && !allowKits) {
      setNotice({ type: "error", title: "Source not allowed", message: "Contact your administrator to enable Components or Kits." });
      return false;
    }
    // Warm the post-submit confirmation chunk while the network request is in flight.
    void import("./ShoppingCartDialogs");
    setBusy(true);
    setNotice(null);
    try {
      // Keep the current browser draft synchronized before submit so a failed
      // request can be retried after a refresh without relying on Express session state.
      if (reasonTimer.current) {
        window.clearTimeout(reasonTimer.current);
        reasonTimer.current = null;
      }
      await persistDraft(cart, selectedType, reason, { quiet: true });
      const response = await requestJson(`${DIRECT_API_BASE}/orders/shopping-cart/submit-direct`, {
        method: "POST",
        body: JSON.stringify({
          products: payloadFor(cart, selectedType, reason),
          orderType: selectedType,
          priorityLevel: maintenance ? null : priorityLevel,
          requestedDeliveryDate: maintenance ? null : requestedDeliveryDate || null,
          editMode,
          editToken: text(activeEditTransfer?.editToken),
          ...(editMode ? { removedOrderRowIds: [...removedOrderRows.current] } : {}),
        }),
      });
      setCheckoutCommitted(true);
      if (reasonTimer.current) {
        window.clearTimeout(reasonTimer.current);
        reasonTimer.current = null;
      }
      clearCartDraft({ draftScope, type: selectedType, editMode, editKey });
      clearEditTransfer(editKey);
      setActiveEditTransfer(null);
      setCart([]);
      setReason("");
      setPriorityLevel("");
      setRequestedDeliveryDate("");

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
          undoToken: text(response?.undoToken),
        });
      }
      return true;
    } catch (error) {
      setNotice({ type: "error", title: "Submission failed", message: error?.message || "The order could not be submitted." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const undoSubmittedOrder = async (submission) => {
    const orderPageIds = (Array.isArray(submission?.orderItems) ? submission.orderItems : [])
      .map((item) => text(item?.orderPageId))
      .filter(Boolean);

    try {
      await requestJson(`${DIRECT_API_BASE}/orders/shopping-cart/undo-direct`, {
        method: "POST",
        body: JSON.stringify({
          undoToken: text(submission?.undoToken),
          orderId: text(submission?.orderId),
          orderPageIds,
        }),
      });
      setNotice(null);
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
          <button className="classic-cart-back-btn classic-cart-cancel-edit" type="button" onClick={backToTypes} aria-label="Cancel edit" title="Cancel edit" disabled={busy}>
            <CartSvgIcon name="x" size={22}/>
          </button>
        ) : null}
        <div className="classic-cart-flow-heading">
          <span className="classic-cart-flow-heading-icon"><CartSvgIcon name={meta.icon} size={20}/></span>
          <span className="classic-cart-flow-heading-copy">
            <small>Shopping flow</small>
            <strong>{selectedType}</strong>
          </span>
        </div>
        <span className={`classic-cart-save-state ${saveState === "Save failed" ? "is-error" : ""}`}>{saveState}</span>
      </div>

      <div className={`classic-cart-grid${!cart.length && !loadingDraft ? " is-empty" : ""}`}>
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
                  const product = item.customProduct
                    ? normalizeProduct({ id: item.id, ...item.customProduct })
                    : (productMap.get(item.id) || normalizeProduct({ id: item.id, name: "Unavailable product" }));
                  return (
                    <CartItem
                      key={draftItemKey(item)}
                      item={item}
                      product={product}
                      type={selectedType}
                      index={index}
                      onEdit={(selected) => selected.customProduct ? setAdditionEditor({ item: selected }) : setPicker({ item: selected })}
                      onDelete={deleteItem}
                      onQuantityChange={updateQuantity}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="classic-cart-empty">
                <div className="classic-cart-empty-actions">
                <button
                  className={`classic-cart-add-new ${typeTheme}${validationFeedback.cart ? " is-validation-error" : ""}`}
                  type="button"
                  onClick={() => setPicker({ item: null })}
                  disabled={!allowComponents && !allowKits}
                  aria-label={`Select existing product for ${selectedType}`}
                >
                  <span className="classic-cart-add-new-copy">
                    <strong>Select Component</strong>
                    <small>Choose from Products or Kits</small>
                  </span>
                  <span className="classic-cart-add-new-plus"><CartSvgIcon name="list-check" size={22}/></span>
                </button>
                {canAddNewComponent ? (
                  <button className={`classic-cart-add-new classic-cart-add-new--requested ${typeTheme}`} type="button" onClick={() => setAdditionEditor({ item: null })} aria-label="Request a product not in Products">
                    <span className="classic-cart-add-new-copy"><strong>Add New</strong><small>Request a component not in Products</small></span>
                    <span className="classic-cart-add-new-plus"><CartSvgIcon name="plus" size={22}/></span>
                  </button>
                ) : null}
                </div>
              </div>
            )}

            {!maintenance && !allowComponents && !allowKits ? <p className="classic-cart-source-denied" role="status">Your account cannot select Components or Kits. Contact your administrator.</p> : null}
            {cart.length && !maintenance ? (
              <div className="classic-cart-footer">
                <button className="classic-cart-update-btn" type="button" onClick={() => setPicker({ item: null })} disabled={!allowComponents && !allowKits}>
                  <CartSvgIcon name="list-check" size={15}/>
                  <span>Select Component</span>
                </button>
                {canAddNewComponent ? (
                  <button className="classic-cart-update-btn classic-cart-update-btn--new" type="button" onClick={() => setAdditionEditor({ item: null })}>
                    <CartSvgIcon name="plus" size={17}/><span>Add New</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="classic-cart-summary" aria-label="Order summary">
          <div className="classic-cart-summary-card">
            <div className="classic-cart-summary-title">{withdraw ? "Withdrawal Summary" : "Order Summary"}</div>
            <div className="classic-cart-summary-lines">
              <div><span>Entry count</span><strong>{itemCount}</strong></div>
              {!maintenance ? <div className={`classic-cart-summary-total${withdraw ? " is-withdrawal" : ""}`}><span>Total</span><strong>{formatMoney(total)}</strong></div> : null}
            </div>
          </div>

          {!maintenance ? (
            <div className={`classic-cart-reason-card${validationFeedback.reason ? " is-validation-error" : ""}`}>
              <label className="classic-cart-summary-field">
                <span className="classic-cart-field-label"><CartSvgIcon name="file-text" size={15}/><span>Reason</span></span>
                <input
                  ref={reasonInputRef}
                  value={reason}
                  onChange={(event) => updateReason(event.target.value)}
                  placeholder="Reason..."
                  autoComplete="off"
                  aria-invalid={validationFeedback.reason || undefined}
                />
              </label>
              <div className="classic-cart-request-meta-fields">
                <div className={`classic-cart-summary-field${validationFeedback.priority ? " is-validation-error" : ""}`}>
                  <span className="classic-cart-field-label"><CartSvgIcon name="flag" size={15}/><span>Priority Level</span><span className="classic-cart-required-mark" aria-hidden="true">*</span></span>
                  <ShoppingCartPrioritySelect value={priorityLevel} onChange={updatePriority} invalid={validationFeedback.priority}/>
                </div>
                <label className={`classic-cart-summary-field${validationFeedback.deliveryDate ? " is-validation-error" : ""}`}>
                  <span className="classic-cart-field-label"><CartSvgIcon name="calendar" size={15}/><span>Delivery Date</span><span className="classic-cart-required-mark" aria-hidden="true">*</span></span>
                  <span className="classic-cart-delivery-date-control">
                    <input type="date" value={requestedDeliveryDate} onChange={(event) => updateDeliveryDate(event.target.value)} aria-label="Requested delivery date" aria-invalid={validationFeedback.deliveryDate || undefined} required />
                    <span className="classic-cart-delivery-date-chevron" aria-hidden="true"><CartSvgIcon name="chevron-down" size={16}/></span>
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          {canSubmit ? <SlideToSubmit
            label="Slide to submit"
            disabled={busy || loadingDraft || (editMode && !activeEditTransfer) || (!maintenance && !allowComponents && !allowKits)}
            onSubmit={checkout}
          /> : null}
        </aside>
      </div>

      {additionEditor ? <ProductAdditionForm
        initial={additionEditor.item ? { ...additionEditor.item.customProduct, quantity: additionEditor.item.quantity } : {}}
        units={units}
        tags={tags}
        onClose={() => setAdditionEditor(null)}
        onSave={saveAddition}
        uploadEndpoint={`/next/api/orders/shopping-cart/request-image${editMode ? "?edit=1" : ""}`}
      /> : null}

      {picker ? (
        <ProductPicker
          products={products}
          type={selectedType}
          item={picker.item}
          onClose={() => setPicker(null)}
          onSave={savePickerSelection}
          allowComponents={allowComponents}
          allowKits={allowKits}
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
          onUndo={permissions.undo === true ? undoSubmittedOrder : null}
        />
      ) : null}
      <Toast notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
