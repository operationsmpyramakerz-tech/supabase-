"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ORDER_TYPES = ["Request Products", "Withdraw Products", "Request Maintenance"];
const EDIT_TRANSFER_TTL_MS = 30 * 60 * 1000;

const TYPE_META = {
  requestproducts: {
    label: "Request Products",
    icon: "▣",
    className: "request",
    description: "Request new products or supplies and send the order for supervision.",
    checkout: "Checkout Now",
  },
  withdrawproducts: {
    label: "Withdraw Products",
    icon: "↗",
    className: "withdraw",
    description: "Withdraw available products from stock through the outgoing workflow.",
    checkout: "Withdraw Now",
  },
  requestmaintenance: {
    label: "Request Maintenance",
    icon: "⚙",
    className: "maintenance",
    description: "Report a product issue and create a maintenance request for the technical team.",
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
    icon: "▦",
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

function Toast({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`next-cart-toast is-${notice.type || "info"}`} role="status">
      <div><strong>{notice.title || "Shopping Cart"}</strong><span>{notice.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function TypeSelection({ orderTypes, onChoose }) {
  return (
    <section className="next-cart-type-step">
      <header>
        <span className="pill">Order workflow</span>
        <h2>What would you like to do?</h2>
        <p>Select the workflow first. Each order type keeps its own draft until you submit or clear it.</p>
      </header>
      <div className="next-cart-type-grid">
        {orderTypes.map((type) => {
          const meta = orderTypeMeta(type);
          return (
            <button className={`next-cart-type-card is-${meta.className}`} type="button" key={type} onClick={() => onChoose(type)}>
              <span className="next-cart-type-icon" aria-hidden="true">{meta.icon}</span>
              <span className="next-cart-type-copy"><strong>{type}</strong><small>{meta.description}</small></span>
              <span className="next-cart-type-arrow" aria-hidden="true">→</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProductThumb({ product }) {
  if (!product?.imageUrl) return <span className="next-cart-product-placeholder" aria-hidden="true">▧</span>;
  return <img src={product.imageUrl} alt="" loading="lazy" />;
}

function ProductPicker({ products, type, item, onClose, onSave }) {
  const maintenance = isMaintenance(type);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(text(item?.id));
  const [qty, setQty] = useState(item?.quantity || 1);
  const [issueDescription, setIssueDescription] = useState(text(item?.issueDescription));
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  useEffect(() => { searchRef.current?.focus?.(); }, []);

  const filtered = useMemo(() => {
    const needle = text(search).toLowerCase();
    if (!needle) return products;
    return products.filter((product) => [
      product.name,
      product.displayId,
      product.unit,
      ...product.tags,
    ].join(" ").toLowerCase().includes(needle));
  }, [products, search]);

  const selected = products.find((product) => product.id === selectedId) || null;

  const submit = () => {
    if (!selected) {
      setError("Select a product first.");
      return;
    }
    if (maintenance && !text(issueDescription)) {
      setError("Issue Description is required for maintenance requests.");
      return;
    }
    if (!maintenance && quantity(qty, 0) <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    onSave({
      id: selected.id,
      quantity: maintenance ? 1 : quantity(qty, 1),
      issueDescription: maintenance ? text(issueDescription) : "",
      schoolId: text(item?.schoolId),
    });
  };

  return (
    <div className="next-cart-modal" role="presentation">
      <button className="next-cart-modal-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <section className="next-cart-modal-card" role="dialog" aria-modal="true" aria-labelledby="cart-product-modal-title">
        <header>
          <div>
            <span>{item ? "Update cart item" : "Add product"}</span>
            <h3 id="cart-product-modal-title">{maintenance ? "Choose a product to maintain" : "Choose a product"}</h3>
            <p>{maintenance ? "Select the affected product and explain the issue." : "Search the live product catalogue and define the requested quantity."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="next-cart-modal-body">
          <label className="next-cart-picker-search">
            <span>Search catalogue</span>
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, ID code, tag, or unit" />
          </label>

          <div className="next-cart-picker-layout">
            <div className="next-cart-picker-list" role="listbox" aria-label="Products">
              {filtered.length ? filtered.map((product) => (
                <button
                  className={selectedId === product.id ? "selected" : ""}
                  type="button"
                  role="option"
                  aria-selected={selectedId === product.id}
                  key={product.id}
                  onClick={() => { setSelectedId(product.id); setError(""); }}
                >
                  <span className="next-cart-picker-thumb"><ProductThumb product={product} /></span>
                  <span><strong>{product.name}</strong><small>{product.displayId || "No ID code"} · {product.unit}</small></span>
                  <b>{formatMoney(product.unitPrice)}</b>
                </button>
              )) : <div className="next-cart-picker-empty"><strong>No matching products</strong><span>Try a different name, ID code, or tag.</span></div>}
            </div>

            <aside className="next-cart-picker-details">
              {selected ? (
                <>
                  <div className="next-cart-picker-preview"><ProductThumb product={selected} /></div>
                  <strong>{selected.name}</strong>
                  <span>{selected.displayId || "No ID code"}</span>
                  <dl>
                    <div><dt>Unit price</dt><dd>{formatMoney(selected.unitPrice)}</dd></div>
                    <div><dt>Unit</dt><dd>{selected.unit}</dd></div>
                    <div><dt>Tag</dt><dd>{selected.tags[0] || "Uncategorized"}</dd></div>
                  </dl>
                  {selected.url ? <a href={selected.url} target="_blank" rel="noreferrer">Open supplier link ↗</a> : null}
                </>
              ) : <div className="next-cart-picker-details-empty"><span>▦</span><strong>Select a product</strong><small>Product details will appear here.</small></div>}
            </aside>
          </div>

          {maintenance ? (
            <label className="next-cart-modal-field is-wide">
              <span>Issue Description <em>*</em></span>
              <textarea value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} rows={4} placeholder="Explain the issue, symptoms, and any troubleshooting already completed." />
            </label>
          ) : (
            <label className="next-cart-modal-field">
              <span>Quantity <em>*</em></span>
              <div className="next-cart-quantity-input">
                <button type="button" onClick={() => setQty((current) => Math.max(0.01, quantity(current, 1) - 1))}>−</button>
                <input type="number" min="0.01" step="0.01" value={qty} onChange={(event) => setQty(event.target.value)} />
                <button type="button" onClick={() => setQty((current) => quantity(current, 1) + 1)}>+</button>
                <span>{selected?.unit || "Unit"}</span>
              </div>
            </label>
          )}

          {error ? <p className="next-cart-modal-error">{error}</p> : null}
        </div>

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={submit}>{item ? "Save changes" : "Add to cart"}</button>
        </footer>
      </section>
    </div>
  );
}

function CartItem({ item, product, type, onEdit, onDelete, onQuantityChange }) {
  const maintenance = isMaintenance(type);
  const withdraw = isWithdraw(type);
  const total = product.unitPrice * quantity(item.quantity, 1) * (withdraw ? -1 : 1);

  return (
    <article className={`next-cart-item ${maintenance ? "is-maintenance" : ""}`}>
      <div className="next-cart-item-product">
        <span className="next-cart-item-thumb"><ProductThumb product={product} /></span>
        <div><strong>{product.name}</strong><small>{product.displayId || "No ID code"} · {product.unit}</small></div>
      </div>

      {maintenance ? (
        <div className="next-cart-item-issue"><small>Issue Description</small><p>{item.issueDescription || "—"}</p></div>
      ) : (
        <>
          <div className="next-cart-item-link">
            {product.url ? <a href={product.url} target="_blank" rel="noreferrer">Open ↗</a> : <span>No URL</span>}
          </div>
          <div className="next-cart-inline-qty">
            <button type="button" onClick={() => onQuantityChange(item.id, Math.max(0.01, quantity(item.quantity, 1) - 1))}>−</button>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formatQuantity(item.quantity)}
              onChange={(event) => onQuantityChange(item.id, event.target.value, { save: false })}
              onBlur={(event) => onQuantityChange(item.id, event.target.value, { save: true })}
            />
            <button type="button" onClick={() => onQuantityChange(item.id, quantity(item.quantity, 1) + 1)}>+</button>
            <span>{product.unit}</span>
          </div>
          <div className={`next-cart-item-total ${withdraw ? "is-withdraw" : ""}`}><small>Line total</small><strong>{formatMoney(total)}</strong></div>
        </>
      )}

      <div className="next-cart-item-actions">
        <button type="button" onClick={() => onEdit(item)}>Edit</button>
        <button type="button" className="danger" onClick={() => onDelete(item)}>Delete</button>
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
      <section className="next-cart-page">
        {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial initial data</strong><span>One Shopping Cart resource was not available.</span><a href="/orders/new?classic=1">Classic page</a></div> : null}
        <TypeSelection orderTypes={orderTypes} onChoose={chooseType} />
        <Toast notice={notice} onClose={() => setNotice(null)} />
      </section>
    );
  }

  return (
    <section className={`next-cart-page is-${meta.className}`}>
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial initial data</strong><span>One Shopping Cart resource was not available.</span><a href="/orders/new?classic=1">Classic page</a></div> : null}

      <section className="next-cart-hero">
        <div>
          <button className="next-cart-back" type="button" onClick={backToTypes}>← {editMode ? "Back to Current Orders" : "Change order type"}</button>
          <span className={`next-cart-type-pill is-${meta.className}`}><i>{meta.icon}</i>{selectedType}</span>
          <h2>{editMode ? `Edit ${meta.label}` : meta.label}</h2>
          <p>{editMode ? "Update the selected order products and submit the changes using your password." : meta.description}</p>
        </div>
        <div className="next-cart-hero-actions">
          <span className={`next-cart-save-state ${saveState === "Save failed" ? "is-error" : ""}`}>{saveState}</span>
          <a href="/orders/new?classic=1">Classic page</a>
          <button type="button" className="secondary-button" onClick={() => setPicker({ item: null })}>+ Add product</button>
        </div>
      </section>

      <section className="next-cart-summary-strip">
        <article><small>Cart items</small><strong>{itemCount}</strong><span>{maintenance ? "Products to inspect" : "Product lines"}</span></article>
        <article><small>Catalogue</small><strong>{products.length}</strong><span>Available products</span></article>
        <article><small>{maintenance ? "Workflow" : "Estimated total"}</small><strong>{maintenance ? "Technical" : formatMoney(total)}</strong><span>{withdraw ? "Outgoing stock value" : maintenance ? "Maintenance request" : "Before approval"}</span></article>
        <article><small>Mode</small><strong>{editMode ? "Edit" : "New"}</strong><span>{editMode ? "Existing order" : "New submission"}</span></article>
      </section>

      <div className="next-cart-layout">
        <main className="next-cart-list-card">
          <header>
            <div><span>Order products</span><h3>{maintenance ? "Products and reported issues" : "Shopping cart"}</h3></div>
            <div><button type="button" onClick={() => setPicker({ item: null })}>+ Add product</button><button type="button" className="ghost-danger" onClick={clearCart} disabled={!cart.length}>Clear cart</button></div>
          </header>

          {loadingDraft ? (
            <div className="next-cart-draft-loading"><span /><strong>Loading saved draft…</strong></div>
          ) : cart.length ? (
            <div className="next-cart-items">
              {cart.map((item) => {
                const product = productMap.get(item.id) || normalizeProduct({ id: item.id, name: "Unavailable product" });
                return (
                  <CartItem
                    key={item.id}
                    item={item}
                    product={product}
                    type={selectedType}
                    onEdit={(selected) => setPicker({ item: selected })}
                    onDelete={deleteItem}
                    onQuantityChange={updateQuantity}
                  />
                );
              })}
            </div>
          ) : (
            <div className="next-cart-empty">
              <span aria-hidden="true">🛒</span>
              <strong>{maintenance ? "No maintenance products yet" : "Your cart is empty"}</strong>
              <p>{maintenance ? "Add each affected product and describe its issue." : "Add products from the live catalogue to continue."}</p>
              <button type="button" onClick={() => setPicker({ item: null })}>Add first product</button>
            </div>
          )}
        </main>

        <aside className="next-cart-checkout-card">
          <header><span>{withdraw ? "Withdrawal Summary" : maintenance ? "Maintenance Summary" : "Order Summary"}</span><h3>Ready to submit?</h3></header>

          {!maintenance ? (
            <label className="next-cart-checkout-field">
              <span>{withdraw ? "Withdrawal reason" : "Order reason"} <em>*</em></span>
              <textarea value={reason} onChange={(event) => updateReason(event.target.value)} rows={5} placeholder={withdraw ? "Why are these products being withdrawn?" : "Why are these products required?"} autoComplete="off" />
            </label>
          ) : (
            <div className="next-cart-maintenance-note"><strong>Issue descriptions are saved per product.</strong><span>Open Edit on any item to update the reported problem.</span></div>
          )}

          <dl className="next-cart-checkout-totals">
            <div><dt>Product lines</dt><dd>{itemCount}</dd></div>
            {!maintenance ? <div><dt>Estimated total</dt><dd className={withdraw ? "is-withdraw" : ""}>{formatMoney(total)}</dd></div> : null}
          </dl>

          <label className="next-cart-checkout-field">
            <span>Account password <em>*</em></span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); checkout(); } }} autoComplete="new-password" placeholder="Confirm with your password" />
          </label>

          <button className={`next-cart-checkout-button is-${meta.className}`} type="button" onClick={checkout} disabled={busy || loadingDraft}>
            {busy ? "Submitting…" : editMode ? "Save Order Changes" : meta.checkout}
          </button>
          <small className="next-cart-security-note">Your password is checked by the existing ERP order API before the workflow is completed.</small>
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
      <Toast notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
