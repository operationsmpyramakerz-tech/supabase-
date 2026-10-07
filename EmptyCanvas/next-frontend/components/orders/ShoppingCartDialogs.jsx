"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";

const TYPE_META = {
  requestproducts: { label: "Request Products", icon: "shopping-cart", className: "request", description: "", checkout: "Checkout Now" },
  withdrawproducts: { label: "Withdraw Products", icon: "log-out", className: "withdraw", description: "Withdraw available items from stock with a dedicated outgoing flow.", checkout: "Withdraw Now" },
  requestmaintenance: { label: "Request Maintenance", icon: "tool", className: "maintenance", description: "Report issues for products and create a maintenance request quickly.", checkout: "Submit Maintenance" },
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

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(number(value));
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

export function OrderSubmissionBar({ submission, onDone, onUndo }) {
  const [undoing, setUndoing] = useState(false);
  const [exploding, setExploding] = useState(false);
  const islandRef = useRef(null);
  const swipeDismissTimerRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0, moved: false });

  useEffect(() => {
    if (!submission || undoing || exploding) return undefined;
    const timer = window.setTimeout(() => onDone(null), ORDER_CONFIRMATION_DURATION_MS + 180);
    return () => window.clearTimeout(timer);
  }, [submission, onDone, undoing, exploding]);

  useEffect(() => () => {
    if (swipeDismissTimerRef.current) window.clearTimeout(swipeDismissTimerRef.current);
  }, []);

  if (!submission) return null;
  const meta = orderTypeMeta(submission.orderType);
  const orderQuery = text(submission.orderId);
  const viewOrderUrl = orderQuery ? `/next/orders?q=${encodeURIComponent(orderQuery)}` : "/next/orders";

  const openCurrentOrder = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (undoing || exploding) return;
    navigateWithinApp(viewOrderUrl);
  };

  const beginSwipe = (event) => {
    if (undoing || exploding) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const node = islandRef.current;
    if (!node) return;
    dragRef.current = { active: true, pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, moved: false };
    node.classList.remove("is-snap-back", "is-swipe-dismissed");
    node.classList.add("is-dragging");
    node.style.setProperty("--cart-island-drag-y", "0px");
    try { node.setPointerCapture(event.pointerId); } catch {}
  };

  const moveSwipe = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const node = islandRef.current;
    if (!node) return;
    drag.lastY = event.clientY;
    const rawDelta = event.clientY - drag.startY;
    if (Math.abs(rawDelta) > 7) drag.moved = true;
    const delta = rawDelta <= 0 ? rawDelta : Math.min(12, rawDelta * 0.18);
    node.style.setProperty("--cart-island-drag-y", `${delta}px`);
  };

  const finishSwipe = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const node = islandRef.current;
    if (!node) return;
    const delta = drag.lastY - drag.startY;
    suppressNextClickRef.current = drag.moved;
    dragRef.current = { active: false, pointerId: null, startY: 0, lastY: 0, moved: false };
    try { node.releasePointerCapture(event.pointerId); } catch {}

    if (delta <= -46) {
      node.classList.remove("is-dragging", "is-snap-back");
      node.classList.add("is-swipe-dismissed");
      swipeDismissTimerRef.current = window.setTimeout(() => {
        swipeDismissTimerRef.current = null;
        onDone(null);
      }, 220);
      return;
    }

    node.classList.remove("is-dragging");
    node.classList.add("is-snap-back");
    node.style.setProperty("--cart-island-drag-y", "0px");
    window.setTimeout(() => node.classList.remove("is-snap-back"), 190);
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
      ref={islandRef}
      className={`classic-cart-order-confirmation${undoing ? " is-undoing" : ""}${exploding ? " is-exploding" : ""}`}
      role="button"
      tabIndex={exploding ? -1 : 0}
      aria-live="polite"
      aria-label={`Open ${submission.orderId || "current order"}`}
      onPointerDown={beginSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={finishSwipe}
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


function ProductCombobox({ products, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewport, setViewport] = useState({ top: 0, height: 0, mobile: false });
  const rootRef = useRef(null);
  const searchInputRef = useRef(null);
  const selected = products.find((product) => product.id === value) || null;
  const needle = text(query).toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return products;
    return products.filter((product) => [product.name, product.displayId, product.unit, ...(product.tags || [])]
      .some((part) => text(part).toLowerCase().includes(needle)));
  }, [products, needle]);

  useEffect(() => {
    if (!open) return undefined;

    const updateViewport = () => {
      const vv = window.visualViewport;
      setViewport({
        top: Math.max(0, Math.round(vv?.offsetTop || 0)),
        height: Math.max(240, Math.round(vv?.height || window.innerHeight || 640)),
        mobile: window.matchMedia?.("(max-width: 760px)")?.matches ?? window.innerWidth <= 760,
      });
    };
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);

    const focusTimer = window.setTimeout(() => {
      try {
        searchInputRef.current?.focus({ preventScroll: true });
      } catch {
        searchInputRef.current?.focus();
      }
    }, 90);

    return () => {
      window.clearTimeout(focusTimer);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const mobilePanelStyle = useMemo(() => {
    if (!open || !viewport.mobile || !viewport.height) return undefined;
    const gap = 10;
    const visibleHeight = viewport.height;
    const panelHeight = Math.min(520, Math.max(220, visibleHeight - gap * 2));
    return {
      top: `${viewport.top + visibleHeight - panelHeight - gap}px`,
      height: `${panelHeight}px`,
      maxHeight: `${panelHeight}px`,
    };
  }, [open, viewport]);

  const openPicker = () => {
    if (disabled) return;
    const vv = window.visualViewport;
    setViewport({
      top: Math.max(0, Math.round(vv?.offsetTop || 0)),
      height: Math.max(240, Math.round(vv?.height || window.innerHeight || 640)),
      mobile: window.matchMedia?.("(max-width: 760px)")?.matches ?? window.innerWidth <= 760,
    });
    setQuery("");
    setOpen(true);
  };

  return (
    <div className={`classic-cart-combobox ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        className={`classic-cart-combobox-trigger ${selected ? "has-value" : ""}`}
        type="button"
        onClick={() => { if (open) setOpen(false); else openPicker(); }}
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="classic-cart-combobox-media">
          {selected?.imageUrl ? <img src={selected.imageUrl} alt="" /> : <CartSvgIcon name="package" size={20}/>} 
        </span>
        <span className="classic-cart-combobox-copy">
          <strong>{selected?.name || "Select a component"}</strong>
          <em>{selected ? [selected.displayId || "No ID", selected.unit || "Unit"].join(" · ") : "Search by name, ID, tag or unit"}</em>
        </span>
        <span className="classic-cart-combobox-arrow"><CartSvgIcon name="chevron-down" size={18}/></span>
      </button>

      {open ? (
        <>
          <button className="classic-cart-combobox-backdrop" type="button" aria-label="Close component selector" onClick={() => setOpen(false)} />
          <div className="classic-cart-combobox-panel" style={mobilePanelStyle} role="listbox" aria-label="Products">
            <div className="classic-cart-combobox-sheet-head">
              <span className="classic-cart-combobox-sheet-handle" aria-hidden="true" />
              <div>
                <small>Component library</small>
                <strong>Select component</strong>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close component selector"><CartSvgIcon name="x" size={18}/></button>
            </div>
            <label className="classic-cart-combobox-search">
              <CartSvgIcon name="search" size={18}/>
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components..." autoComplete="off" inputMode="search" />
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
        </>
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
            <h3>{activeFolder ? activeFolder.name : "Select kits"}</h3>
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
              {visibleFolders.map((folder) => {
                const kitCount = folderCounts.get(folder.id) || 0;
                return (
                  <article className="classic-cart-kit-library-card classic-cart-kit-library-folder" key={folder.id}>
                    <button
                      type="button"
                      className="classic-cart-kit-library-main"
                      onClick={() => { setActiveFolderId(folder.id); setQuery(""); }}
                      aria-label={`Open folder ${folder.name}`}
                    >
                      <span className="classic-cart-kit-folder-figure" aria-hidden="true">
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--left" />
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--middle" />
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--right" />
                      </span>
                      <span className="classic-cart-kit-folder-copy"><strong>{folder.name}</strong><em>Kit folder</em></span>
                      <span className="classic-cart-kit-folder-count">
                        <CartSvgIcon name="folder" size={11}/>
                        <span>{kitCount} kit{kitCount === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                  </article>
                );
              })}
              {visibleKits.map((kit) => {
                const selected = Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id);
                const qty = selected ? selectedKits[kit.id] : 1;
                return (
                  <article className={`classic-cart-kit-library-card classic-cart-kit-library-kit ${selected ? "is-selected" : ""}`} key={kit.id}>
                    <button
                      type="button"
                      className="classic-cart-kit-library-main"
                      onClick={() => onToggleKit(kit.id)}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Unselect" : "Select"} kit ${kit.name}`}
                    >
                      <span className="classic-cart-kit-folder-figure" aria-hidden="true">
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--left" />
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--middle" />
                        <span className="classic-cart-kit-folder-paper classic-cart-kit-folder-paper--right" />
                      </span>
                      <span className="classic-cart-kit-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
                      <span className="classic-cart-kit-folder-count">
                        <CartSvgIcon name="package" size={11}/>
                        <span>{kit.itemsCount} component{kit.itemsCount === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                    {selected ? (
                      <div className="classic-cart-kit-library-selected-panel">
                        <span className="classic-cart-kit-library-selected-name">{kit.name}</span>
                        <label onClick={(event) => event.stopPropagation()}>
                          <span>Qty</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={qty}
                            onChange={(event) => onQuantityChange(kit.id, event.target.value)}
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Quantity for ${kit.name}`}
                          />
                        </label>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!visibleFolders.length && !visibleKits.length ? <div className="classic-cart-kit-browser-status"><strong>No kits found here.</strong><span>Try another folder or search term.</span></div> : null}
            </>
          )}
        </div>

        <footer className="classic-cart-kit-browser-footer">
          <button type="button" onClick={onClose}>Use selected kits</button>
        </footer>
      </section>
    </div>
  );
}

export function ProductPicker({ products, type, item, onClose, onSave }) {
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

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const themeMeta = document.getElementById("ops-theme-color");
    const previousRootBackground = root.style.backgroundColor;
    const previousBodyBackground = body.style.backgroundColor;
    const previousThemeColor = themeMeta?.getAttribute("content") || "";

    root.classList.add("classic-cart-picker-open");
    body.classList.add("classic-cart-picker-open");
    root.style.backgroundColor = "#ffffff";
    body.style.backgroundColor = "#ffffff";
    if (themeMeta) themeMeta.setAttribute("content", "#ffffff");

    return () => {
      root.classList.remove("classic-cart-picker-open");
      body.classList.remove("classic-cart-picker-open");
      root.style.backgroundColor = previousRootBackground;
      body.style.backgroundColor = previousBodyBackground;
      if (themeMeta) themeMeta.setAttribute("content", previousThemeColor || (root.dataset.theme === "dark" ? "#080b11" : "#ffffff"));
    };
  }, []);

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
      <section className="classic-cart-modal-card classic-cart-modal-card--modern" role="dialog" aria-modal="true" aria-label={item ? "Edit cart item" : "Add to cart"}>
        <header className="classic-cart-picker-head classic-cart-picker-head--floating">
          <span className="classic-cart-picker-head-icon classic-cart-picker-head-icon--floating" aria-hidden="true"><CartSvgIcon name={isMaintenance(type) ? "tool" : isWithdraw(type) ? "log-out" : "shopping-cart"} size={26}/></span>
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
              <div className="classic-cart-picker-label-row"><span>Component <em>*</em></span></div>
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
              <div className="classic-cart-picker-label-row"><span>Kits <em>*</em></span></div>
              <button
                type="button"
                className={`classic-cart-kit-trigger ${selectedKitCount ? "has-value" : ""}`}
                onClick={() => { if (!kitLibraryLoaded && !kitLibraryLoading) loadKitLibrary(); setKitBrowserOpen(true); }}
                disabled={submitting}
              >
                <span className="classic-cart-kit-trigger-icon"><CartSvgIcon name="layers" size={22}/></span>
                <span className="classic-cart-kit-trigger-copy">
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

